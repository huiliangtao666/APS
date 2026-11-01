// Restricted fixed-candidate gateway. No listener, product import or state access.
import { createHash } from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';

export const LOCK = JSON.parse(fs.readFileSync(new URL('./b15-user-preview-lock.json', import.meta.url)));
export const UPSTREAM = 'http://host.docker.internal:18252';
const digest = b => createHash('sha256').update(b).digest('hex');
const entry = (map, key) => Object.hasOwn(map, key) ? map[key] : undefined;
const failure = (status, error) => ({ status, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ error })) });
const json = r => JSON.parse(r.body.toString('utf8'));
const idPattern = '[a-zA-Z0-9-]+';
const identityName = /^(?:test-sub|b15role|role|sub|actor|x-role|x-user.*|x-praetor-(?!app-context$).*)$/i;

export function localPath(target, base) {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || /[\\\x00-\x20\x7f#]/.test(target)) throw Error('path');
  const q = target.indexOf('?'), raw = q < 0 ? target : target.slice(0, q);
  // Deny noncanonical paths, including encoded separators, double encodings and dot paths.
  const decoded = decodeURIComponent(raw);
  if (/[\\%\x00-\x20\x7f]/.test(decoded) || decoded.includes('//') || decoded.split('/').some(p => p === '.' || p === '..')) throw Error('path');
  if (/%(?:2f|5c)/i.test(raw)) throw Error('path');
  const path = decoded.startsWith(base) ? decoded.slice(base.length - 1) : decoded;
  const params = new URLSearchParams(q < 0 ? '' : target.slice(q + 1));
  for (const key of params.keys()) if (identityName.test(key)) throw Error('identity');
  return { path, query: params.toString() ? '?' + params.toString() : '' };
}

export function validateBase(base) {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)+$/.test(base) || base.includes('//')) throw Error('platform_base_required');
  return base;
}

// Only the trusted entry point creates this transport with the fixed UPSTREAM.
// Tests use an ephemeral loopback fake; redirects and cookies are never followed.
export function httpTransport(upstream = UPSTREAM) {
  const url = new URL(upstream);
  if (url.protocol !== 'http:' || url.pathname !== '/' || url.search || url.username || url.password) throw Error('upstream');
  return (method, target, headers = {}, body) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: url.hostname, port: url.port, path: target, method,
      headers: { ...headers, host: url.host, 'accept-encoding': 'identity' }, timeout: 3000 }, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) res.destroy(Error('response_cap')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(Error('upstream_timeout'))); req.on('error', reject);
    req.end(body);
  });
}

export function createPreview({ base, origin, members, transport = httpTransport(), policy = LOCK, clientScript }) {
  validateBase(base);
  if (new URL(origin).origin !== origin || !origin.startsWith('https://')) throw Error('exact_https_origin_required');
  if (!Array.isArray(members) || members.some(x => typeof x !== 'string' || !/^[^#]+#[^#]+$/.test(x))) throw Error('member_keys_required');
  const admitted = new Set(members), trials = new Map(), runs = new Map(), plans = new Map();
  let queue = Promise.resolve(), protectedIds;
  const internalHeaders = { 'test-sub': 'planner' };
  async function pinned() {
    const response = await transport('GET', '/api/uat-build', internalHeaders);
    if (response.status !== 200) throw Error('version');
    const m = json(response);
    if (m.productSha !== policy.productSha || m.parent !== policy.parent || m.buildSource !== policy.productSha ||
        m.sourceManifestSha256 !== policy.sourceManifestSha256 || m.profileFiles?.['17/PROFILE.json'] !== policy.profileSha256) throw Error('version');
    for (const [p, h] of Object.entries(policy.uiFiles)) if (m.uiFiles?.[p] !== h) throw Error('version');
    return m;
  }
  async function forward(request) {
    const headers = Object.fromEntries(Object.entries(request.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (Object.keys(headers).some(k => identityName.test(k)) || /(?:^|;)\s*b15Role\s*=/i.test(headers.cookie || '')) return failure(400, 'identity_input_forbidden');
    let route;
    try { route = localPath(request.target, base); } catch { return failure(400, 'noncanonical_path_or_identity'); }
    const { path, query } = route;
    if (path.startsWith('/__qa') || path.startsWith('/api/auth') || path.startsWith('/_praetor')) return failure(403, 'management_forbidden');
    const actor = request.actor;
    if (!actor || actor.kind !== 'user' || !actor.issuer || !actor.sub) return failure(401, 'verified_human_required');
    const owner = actor.issuer + '#' + actor.sub;
    if (!admitted.has(owner)) return failure(403, 'existing_preview_member_required');
    if (!['GET', 'POST'].includes(request.method)) return failure(405, 'method_forbidden');
    const own = (map, id) => typeof id === 'string' && map.get(id) === owner;
    let body, kind, match;
    if (request.method === 'POST') {
      if (query) return failure(400, 'write_query_forbidden');
      if (headers.origin !== origin || !['same-origin', undefined].includes(headers['sec-fetch-site']) ||
          headers['x-aps-request'] !== 'workbench' || !/^application\/json(?:;|$)/i.test(headers['content-type'] || '')) return failure(403, 'csrf');
      try { body = JSON.parse(Buffer.from(request.body || '').toString()); } catch { return failure(400, 'json_required'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return failure(400, 'object_required');
      if (Object.keys(body).some(k => identityName.test(k))) return failure(400, 'identity_input_forbidden');
      if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1000) return failure(400, 'reason_required');
      if (path === `/api/plans/${policy.seedPlanId}/copy` && Object.keys(body).every(k => k === 'reason')) kind = 'copy';
      else if ((match = path.match(new RegExp(`^/api/trials/(${idPattern})/(inputs(?:/check)?|retain|discard)$`))) && own(trials, match[1])) {
        if (match[2] === 'retain' && !own(plans, body.planId)) return failure(403, 'new_copy_scope_required');
        kind = 'trial';
      } else if (path === '/api/runs' && own(trials, body.trialId)) {
        if ([...runs.values()].some(v => v.pending)) return failure(409, 'serial_run_required');
        kind = 'run';
      } else if ((match = path.match(new RegExp(`^/api/runs/(${idPattern})/cancel$`))) && runs.get(match[1])?.owner === owner) kind = 'cancel';
      else if (path === '/api/plans' && own(plans, body.id)) kind = 'save';
      else if (path === '/api/export' && (own(plans, body.planId) || body.planId === policy.seedPlanId) &&
          Object.keys(body).every(k => ['planId', 'reason'].includes(k))) kind = 'export';
      else return failure(403, 'new_copy_scope_required');
    } else {
      const staticKey = path === '/' || path === '/index.html' ? 'index.html' : path.slice(1);
      const allowedApi = /^\/api\/(?:uat-build|meta|session|state|operations|plans(?:\/[a-zA-Z0-9-]+\/(?:inputs|compare\/[a-zA-Z0-9-]+))?|trials|runs(?:\/[a-zA-Z0-9-]+(?:\/inputs)?)?|rules\/(?:preview|capabilities)|reports|r21\/(?:config|devices))$/;
      if (!allowedApi.test(path) && path !== '/b15-user-preview-client.js' && !entry(policy.uiFiles, staticKey) && !(path.startsWith('/fixtures/17/') && entry(policy.profileFiles, path.slice('/fixtures/'.length)))) return failure(404, 'route_forbidden');
      if (path.startsWith('/fixtures/') && !path.startsWith('/fixtures/17/')) return failure(403, 'scene_forbidden');
    }
    let metadata;
    try { metadata = await pinned(); } catch { return failure(503, 'fixed_candidate_unverified'); }
    if (!protectedIds) {
      protectedIds = new Set([policy.seedPlanId]);
      for (const name of ['plans', 'trials', 'runs']) {
        const r = await transport('GET', '/api/' + name, internalHeaders);
        if (r.status !== 200 || !Array.isArray(json(r))) { protectedIds = undefined; return failure(503, 'protection_inventory_unavailable'); }
        for (const item of json(r)) protectedIds.add(item.id);
      }
    }
    if (kind === 'run') {
      const existing = await transport('GET', '/api/runs', internalHeaders);
      if (existing.status !== 200 || !Array.isArray(json(existing))) return failure(503, 'run_inventory_unavailable');
      if (json(existing).some(r => !['completed', 'partial', 'failed', 'timed_out', 'cancelled'].includes(r.status))) return failure(409, 'serial_run_required');
    }
    if (path === '/b15-user-preview-client.js') return { status: 200, headers: { 'content-type': 'text/javascript' }, body: Buffer.from(clientScript.replaceAll('__B15_BASE_JSON__', JSON.stringify(base))) };
    // No external cookie, auth, forwarding, identity or hop header reaches the mock.
    const upstreamHeaders = { ...internalHeaders };
    if (body) Object.assign(upstreamHeaders, { 'content-type': headers['content-type'], 'x-aps-request': headers['x-aps-request'], origin: headers.origin,
      ...(headers['sec-fetch-site'] ? { 'sec-fetch-site': headers['sec-fetch-site'] } : {}) });
    const staticKey = path === '/' ? 'index.html' : path.slice(1);
    const target = path === '/' ? '/index.html' : path;
    const r = await transport(request.method, encodeURI(target) + query, upstreamHeaders, body ? Buffer.from(JSON.stringify(body)) : undefined);
    if (r.status >= 300 && r.status < 400) return failure(502, 'upstream_redirect_forbidden');
    if (r.status >= 200 && r.status < 300) {
      if (kind === 'copy') {
        const t = json(r);
        if (!t.id || !t.basePlanId || t.sourcePlanId !== policy.seedPlanId || protectedIds.has(t.id) || protectedIds.has(t.basePlanId) || trials.has(t.id) || plans.has(t.basePlanId)) return failure(502, 'copy_contract');
        trials.set(t.id, owner); plans.set(t.basePlanId, owner);
      }
      if (kind === 'run') {
        const run = json(r);
        if (!run.id || run.trialId !== body.trialId || protectedIds.has(run.id) || runs.has(run.id)) return failure(502, 'run_contract');
        runs.set(run.id, { owner, trialId: run.trialId, pending: true });
      }
      // A plan is admitted only from the wrapper's own new run, never a user id.
      const runMatch = request.method === 'GET' && path.match(/^\/api\/runs(?:\/([a-zA-Z0-9-]+))?$/);
      if (runMatch) for (const run of runMatch[1] ? [json(r)] : json(r)) {
        if (runs.get(run.id)?.owner !== owner) continue;
        const tracked = runs.get(run.id);
        if ((runMatch[1] && run.id !== runMatch[1]) || run.trialId !== tracked.trialId) return failure(502, 'run_contract');
        if (['completed', 'partial', 'failed', 'timed_out', 'cancelled'].includes(run.status)) {
          tracked.pending = false;
          if (run.planId) {
            if (protectedIds.has(run.planId) || (plans.has(run.planId) && !own(plans, run.planId))) return failure(502, 'plan_contract');
            plans.set(run.planId, owner);
          }
        }
      }
      const expected = entry(policy.uiFiles, staticKey) || (path.startsWith('/fixtures/17/') && entry(policy.profileFiles, path.slice('/fixtures/'.length)));
      if (expected && digest(r.body) !== expected) return failure(503, 'fixed_asset_drift');
      if (staticKey === 'index.html') {
        let html = r.body.toString('utf8');
        html = html.replace(/(src|href)=(['"])\/(?!\/)/g, `$1=$2${base}`);
        html = html.replace('<head>', `<head><base href="${base}"><script src="${base}b15-user-preview-client.js"></script>`);
        html = html.replace('<body>', '<body><aside>固定48e · 场景17 · 现有授权预览成员 · 明确模拟 planner；仅复制原样例后计算、保存新副本。原历史和原始输入保留。</aside>');
        r.body = Buffer.from(html);
      }
      if (path === '/api/uat-build') r.body = Buffer.from(JSON.stringify({ productSha: metadata.productSha, parent: metadata.parent, scene: 17, mock: true, role: 'planner', published: false }));
    }
    // Build a fresh header set. Never relay Set-Cookie, CORS, redirect, lengths or ETags.
    return { status: r.status, headers: { 'content-type': r.headers['content-type'] || 'application/octet-stream',
      ...(kind === 'export' && r.headers['content-disposition'] ? { 'content-disposition': r.headers['content-disposition'] } : {}) }, body: r.body };
  }
  return request => {
    const work = queue.then(() => forward(request)).catch(() => failure(502, 'upstream_or_contract_error'));
    queue = work.then(() => undefined); return work;
  };
}
