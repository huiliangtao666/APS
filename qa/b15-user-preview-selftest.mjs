// TOOL SELFTEST ONLY: synthetic requests and a loopback fake, no product HTTP/browser/Worker.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { createPreview, httpTransport, LOCK, localPath } from './b15-user-preview-core.mjs';
import { createHandler } from './b15-user-preview-server.mjs';
import * as sdk from '@praetor/lite-app-server';

const sha = b => createHash('sha256').update(b).digest('hex');
const base = '/praetor-app/777/dev/', origin = 'https://preview.invalid';
const actor = { kind: 'user', issuer: 'synthetic-routing-fixture', sub: 'existing-member' };
const member = actor.issuer + '#' + actor.sub;
const html = '<!doctype html><html><head><script type="module" src="/assets/app.js"></script><link href="/assets/app.css" rel="stylesheet"></head><body><div id="root"></div></body></html>';
const assets = { 'index.html': html, 'assets/app.js': '/* synthetic product JS */', 'assets/app.css': 'body{}' };
const policy = { ...structuredClone(LOCK), uiFiles: Object.fromEntries(Object.entries(assets).map(([k, v]) => [k, sha(v)])),
  profileFiles: { '17/PROFILE.json': sha('{"scene":17}') } };
const metadata = { ...structuredClone(policy), buildSource: policy.productSha, profileFiles: { '17/PROFILE.json': policy.profileSha256 } };
let drift = false, assetDrift = false, redirect = false, invalidCopy = false, foreignBusy = false, failInventory = false;
let failSave = false, count = 0, sequence = 0;
const calls = [], writes = [], currentTrials = [], currentRuns = [], historical = [{ id: policy.seedPlanId }, { id: 'other-old-plan' }];
const fake = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks), body = raw.length ? JSON.parse(raw) : undefined;
  calls.push({ method: req.method, path: req.url, headers: req.headers, body });
  res.setHeader('content-type', 'application/json');
  // Deliberately dangerous response headers must not cross the wrapper.
  res.setHeader('set-cookie', 'b15Role=supervisor'); res.setHeader('access-control-allow-origin', '*');
  const send = (status, data) => { res.writeHead(status); res.end(typeof data === 'string' ? data : JSON.stringify(data)); };
  if (req.url === '/api/uat-build') return send(200, { ...metadata, ...(drift ? { productSha: '0'.repeat(40) } : {}) });
  if (req.method === 'GET') {
    if (redirect) { res.writeHead(302, { location: '/__qa/role/supervisor' }); return res.end(); }
    if (req.url === '/api/plans') return send(failInventory ? 500 : 200, historical);
    if (req.url === '/api/trials') return send(200, [{ id: 'old-trial' }, ...currentTrials]);
    if (req.url === '/api/runs') return send(200, [...currentRuns, ...(foreignBusy ? [{ id: 'foreign-run', status: 'running' }] : [])]);
    if (req.url.startsWith('/api/runs/')) return send(200, currentRuns.find(r => req.url === '/api/runs/' + r.id) || {});
    const key = req.url.slice(1);
    if (assets[key]) { res.setHeader('content-type', key.endsWith('.html') ? 'text/html' : key.endsWith('.js') ? 'text/javascript' : 'text/css'); return send(200, assets[key] + (assetDrift ? 'drift' : '')); }
    if (req.url === '/fixtures/17/PROFILE.json') return send(200, '{"scene":17}');
    return send(200, { fixture: true });
  }
  writes.push({ path: req.url, body });
  if (req.url.endsWith('/copy')) {
    const trial = { id: 'new-trial-' + ++sequence, basePlanId: invalidCopy ? 'other-old-plan' : 'new-plan-' + sequence, sourcePlanId: policy.seedPlanId, status: 'active' };
    currentTrials.push(trial); return send(201, trial);
  }
  if (req.url === '/api/runs') {
    const run = { id: 'new-run-' + ++sequence, trialId: body.trialId, status: 'queued' };
    currentRuns.push(run); return send(202, run);
  }
  if (req.url === '/api/plans' && failSave) return send(409, { error: 'immutable_plan' });
  if (req.url === '/api/export') { res.setHeader('content-type', 'text/csv'); res.setHeader('content-disposition', 'attachment; filename="new.csv"'); return send(200, 'new,csv'); }
  return send(201, { accepted: true });
});
await new Promise(resolve => fake.listen(0, '127.0.0.1', resolve));
const transport = httpTransport('http://127.0.0.1:' + fake.address().port);
const clientScript = fs.readFileSync(new URL('./b15-user-preview-client.js', import.meta.url), 'utf8');
const make = () => createPreview({ base, origin, members: [member, actor.issuer + '#second-member'], transport, policy, clientScript });
let preview = make();
const request = (path, body, extra = {}) => ({ method: body ? 'POST' : 'GET', target: base.slice(0, -1) + path,
  headers: body ? { origin, 'content-type': 'application/json', 'x-aps-request': 'workbench', 'sec-fetch-site': 'same-origin' } : {},
  ...(body ? { body: Buffer.from(JSON.stringify(body)) } : {}), actor, ...extra });
const check = async (name, work) => { await work(); count++; console.log('PASS ' + name); };
const status = async (req, expected) => { const r = await preview(req); assert.equal(r.status, expected, r.body.toString()); return r; };
const post = (p, more = {}) => request(p, { reason: 'explicit new copy tool fixture', ...more });
try {
  await check('prefixed HTML resources, banner and pre-module URL shim', async () => {
    const r = await status(request('/'), 200), body = r.body.toString();
    assert.match(body, /明确模拟 planner/); assert.ok(body.includes('src="' + base + 'assets/app.js"'));
    assert.ok(body.indexOf('b15-user-preview-client.js') < body.indexOf('type="module"'));
    assert.ok(!body.includes('/__qa/')); assert.equal(r.headers['set-cookie'], undefined); assert.equal(r.headers['access-control-allow-origin'], undefined);
  });
  await check('prefixed API/static and exact scene17 fixture bytes', async () => {
    await status(request('/api/state'), 200); await status(request('/assets/app.js'), 200); await status(request('/fixtures/17/PROFILE.json'), 200);
    await status(request('/fixtures/18/PROFILE.json'), 404); await status(request('/fixtures/17/missing.csv'), 404);
    for (const name of ['constructor', 'toString', '__proto__']) { const before = calls.length; await status(request('/' + name), 404); assert.equal(calls.length, before); }
    assert.ok(calls.some(c => c.path === '/api/state')); assert.ok(!calls.some(c => c.path.includes(base)));
  });
  await check('stripped prefix; foreign prefix never global-root proxy', async () => {
    await status({ ...request('/api/state'), target: '/api/state' }, 200);
    await status({ ...request('/api/state'), target: '/wrong/dev/api/state' }, 404);
  });
  await check('all role/auth management path spellings denied before upstream', async () => {
    for (const p of ['/__qa/role/query', '/%5f%5fqa/role/query', '/%255f%255fqa/role/query', '//__qa/role/query', '/x/../__qa/role/query', '/api/auth', '/api/auth/members', '/api%2fauth/me', '/_praetor/viewer']) {
      const before = calls.length, r = await preview(request(p)); assert.ok([400, 403].includes(r.status), p); assert.equal(calls.length, before);
    }
  });
  await check('role and plain identity header/cookie/query/body injection rejected', async () => {
    for (const headers of [{ 'test-sub': 'supervisor' }, { 'x-praetor-user-id': 'owner' }, { 'x-role': 'planner' }, { cookie: 'other=1; b15Role=query' }]) await status(request('/api/state', undefined, { headers }), 400);
    await status(request('/api/state?b15Role=supervisor'), 400);
    await status(post('/api/plans/' + policy.seedPlanId + '/copy', { role: 'supervisor' }), 400);
    const r = await status(request('/api/state', undefined, { headers: { cookie: 'platform-private=never-forward', authorization: 'never-forward' } }), 200);
    const c = calls.at(-1); assert.equal(c.headers.cookie, undefined); assert.equal(c.headers.authorization, undefined); assert.equal(c.headers['test-sub'], 'planner');
  });
  await check('missing, service, anonymous or unlisted actor cannot reach fake', async () => {
    for (const a of [undefined, { kind: 'service', sub: 'owner' }, { kind: 'anonymous' }]) await status(request('/api/state', undefined, { actor: a }), 401);
    await status(request('/api/state', undefined, { actor: { ...actor, sub: 'not-member' } }), 403);
  });
  await check('version mismatch refuses API and writes, no target forwarded', async () => {
    drift = true; const before = writes.length;
    await status(request('/api/state'), 503); await status(post('/api/plans/' + policy.seedPlanId + '/copy'), 503);
    assert.equal(writes.length, before); drift = false;
  });
  await check('parent, buildSource, source manifest, profile and UI metadata pins', async () => {
    for (const key of ['parent', 'buildSource', 'sourceManifestSha256']) {
      const old = metadata[key]; metadata[key] = 'bad'; await status(request('/api/state'), 503); metadata[key] = old;
    }
    const old = metadata.profileFiles['17/PROFILE.json']; metadata.profileFiles['17/PROFILE.json'] = 'bad';
    await status(request('/api/state'), 503); metadata.profileFiles['17/PROFILE.json'] = old;
    metadata.uiFiles['assets/extra.js'] = 'bad'; // unserved extras grant no route
    await status(request('/assets/extra.js'), 404);
    const asset = metadata.uiFiles['assets/app.js']; metadata.uiFiles['assets/app.js'] = 'bad'; await status(request('/api/state'), 503); metadata.uiFiles['assets/app.js'] = asset;
  });
  await check('actual asset drift and redirects rejected; cookies/CORS absent', async () => {
    assetDrift = true; await status(request('/assets/app.js'), 503); assetDrift = false;
    redirect = true; await status(request('/api/state'), 502); redirect = false;
  });
  await check('CSRF exact Origin, fetch-site, JSON and product action header', async () => {
    const req = post('/api/plans/' + policy.seedPlanId + '/copy');
    for (const [k, value] of [['origin', 'https://evil.invalid'], ['origin', undefined], ['sec-fetch-site', 'cross-site'], ['content-type', 'text/plain'], ['x-aps-request', undefined]]) {
      await status({ ...req, headers: { ...req.headers, [k]: value } }, 403);
    }
    await status(post('/api/plans/' + policy.seedPlanId + '/copy', { reason: '' }), 400);
  });
  await check('original/history/native/global input and supervisor writes denied', async () => {
    for (const p of ['/api/inputs', '/api/tables/orders', '/api/r21/apply', '/api/calculate', '/api/plans/' + policy.seedPlanId + '/restore', '/api/plans/' + policy.seedPlanId + '/release', '/api/trials/old-trial/inputs']) await status(post(p), 403);
    await status(post('/api/plans', { id: policy.seedPlanId }), 403); await status(post('/api/runs', { trialId: 'old-trial' }), 403);
    await status({ ...request('/api/state'), method: 'OPTIONS' }, 405);
  });
  let trial;
  await check('explicit new copy records owned trial, original stays protected', async () => {
    trial = JSON.parse((await status(post('/api/plans/' + policy.seedPlanId + '/copy'), 201)).body);
    await status(post('/api/trials/' + trial.id + '/inputs', { revision: 0, tables: {} }), 201);
    await status(post('/api/plans', { id: trial.basePlanId }), 201);
    await status({ ...post('/api/trials/' + trial.id + '/inputs', { tables: {} }), actor: { ...actor, sub: 'second-member' } }, 403);
    await status(post('/api/trials/' + trial.id + '/retain', { planId: policy.seedPlanId }), 403);
  });
  await check('new trial run, serial guard, completed run list grants new plan save', async () => {
    const req = post('/api/runs', { trialId: trial.id, revision: 0 });
    foreignBusy = true; await status(req, 409); foreignBusy = false;
    const run = JSON.parse((await status(req, 202)).body);
    await status(req, 409); await status(post('/api/plans', { id: 'new-result-plan' }), 403);
    Object.assign(currentRuns.find(r => r.id === run.id), { status: 'completed', planId: 'new-result-plan' });
    await status(request('/api/runs'), 200); await status(post('/api/plans', { id: 'new-result-plan' }), 201);
    failSave = true; await status(post('/api/plans', { id: 'new-result-plan' }), 409); failSave = false;
    const r = await status(post('/api/export', { planId: 'new-result-plan' }), 200); assert.equal(r.body.toString(), 'new,csv'); assert.ok(r.headers['content-disposition']);
  });
  await check('restart loses write grants without deleting or restoring data', async () => {
    const before = JSON.stringify({ currentTrials, currentRuns, historical }); preview = make();
    await status(post('/api/plans', { id: 'new-result-plan' }), 403);
    assert.equal(JSON.stringify({ currentTrials, currentRuns, historical }), before);
  });
  await check('copy output cannot grant existing historical plan write', async () => {
    invalidCopy = true; await status(post('/api/plans/' + policy.seedPlanId + '/copy'), 502); invalidCopy = false;
    await status(post('/api/plans', { id: 'other-old-plan' }), 403);
  });
  await check('protection inventory failure denies before any write', async () => {
    preview = make(); failInventory = true; const before = writes.length;
    await status(post('/api/plans/' + policy.seedPlanId + '/copy'), 503); assert.equal(writes.length, before); failInventory = false;
  });
  await check('official SDK unsupported/missing/forged context; no fake positive signature', async () => {
    let kernelCalls = 0;
    const attempt = async (identity, headers) => {
      const req = Readable.from([]); Object.assign(req, { method: 'GET', url: base + 'api/state', headers });
      let result;
      const res = { setHeader() {}, writeHead(status) { result = { status }; }, end(body) { result.body = JSON.parse(body); } };
      await createHandler({ preview: () => { kernelCalls++; throw Error('must not enter'); }, sdk, identity })(req, res);
      return result;
    };
    const unsupported = await attempt(sdk.readPraetorIdentityConfig({}), { 'x-praetor-user-id': 'owner', 'test-sub': 'planner' });
    assert.equal(unsupported.status, 503); assert.equal(unsupported.body.error, 'unsupported');
    const cfg = sdk.readPraetorIdentityConfig({ PRAETOR_APP_INSTANCE_ID: 'fixture', PRAETOR_APP_CONTEXT_ISSUER: 'fixture', PRAETOR_APP_CONTEXT_KEYS: '[{"kid":"fixture","publicKey":"unused-invalid-public-key"}]' });
    assert.equal((await attempt(cfg, {})).status, 401);
    assert.equal((await attempt(cfg, { 'x-praetor-app-context': 'forged-browser-value' })).status, 401);
    assert.equal(kernelCalls, 0);
  });
  await check('client shim preserves fetch method/body/action, external and already-prefixed URLs', async () => {
    const seen = [], window = { fetch: async (input, init) => { seen.push({ input, init }); return {}; } };
    vm.runInNewContext(clientScript.replaceAll('__B15_BASE_JSON__', JSON.stringify(base)), { window, location: { origin, href: origin + base }, URL, Request });
    const init = { method: 'POST', headers: { 'X-APS-Request': 'workbench' }, body: '{"reason":"copy"}' };
    await window.fetch('/api/runs', init); assert.equal(seen.at(-1).input, origin + base + 'api/runs'); assert.equal(seen.at(-1).init, init);
    await window.fetch(origin + base + 'api/state'); assert.equal(seen.at(-1).input, origin + base + 'api/state');
    await window.fetch('https://external.invalid/api/state'); assert.equal(seen.at(-1).input, 'https://external.invalid/api/state');
    const raw = new Request(origin + '/api/plans', { method: 'POST', headers: { 'X-APS-Request': 'workbench' }, body: '{"reason":"new"}' });
    await window.fetch(raw); const modified = seen.at(-1).input;
    assert.equal(modified.url, origin + base + 'api/plans'); assert.equal(modified.method, 'POST'); assert.equal(modified.headers.get('x-aps-request'), 'workbench'); assert.equal(await modified.text(), '{"reason":"new"}');
  });
  await check('base rejects traversal/guessed origin; dev and deployment prefix route fixture', async () => {
    assert.deepEqual(localPath('/deployment/praetor-app/777/dev/api/state', '/deployment/praetor-app/777/dev/'), { path: '/api/state', query: '' });
    assert.throws(() => createPreview({ base: '/', origin, members: [], transport, policy, clientScript }));
    assert.throws(() => createPreview({ base, origin: 'http://localhost:18252', members: [], transport, policy, clientScript }));
  });
  await check('executable binding and rollback plan: original app id, no data restore/publish/stop', async () => {
    const r = spawnSync('python3', [new URL('./b15-user-preview-control.py', import.meta.url).pathname, 'plan', '--wab-dir', '/skills/workspace-app-builder'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); const p = JSON.parse(r.stdout);
    assert.deepEqual(p.bind.slice(1), ['container', 'qa-fr006-main-3d164d5', '/workspace/apps/qa17-48e-user-entry', '4318', 'python', 'python3 b15-user-preview-launch.py']);
    assert.deepEqual(p.rollback.slice(1), ['container', 'qa-fr006-main-3d164d5', '/workspace/apps/qa-fr006-main-3d164d5', '3000', 'vite', 'npm run dev']);
    assert.match(p.rollback_data_policy, /Keep new user data/); assert.ok(!p.bind.includes('publish')); assert.equal(p.preview[0], '/skills/lite-app-scaffold/scripts/dev-preview.sh');
  });
  await check('private synthetic state snapshot is bounded, exact and refuses overwrite/symlink', async () => {
    const code = `import pathlib, tempfile, runpy, sys, json
control=pathlib.Path(sys.argv[1]); scope=control.resolve().parents[3]/'temp/b15-user-preview-r2/unit-scratch'; scope.mkdir(parents=True,exist_ok=True)
snapshot=runpy.run_path(str(control))['snapshot']
with tempfile.TemporaryDirectory(prefix='snapshot-',dir=scope) as tmp:
 p=pathlib.Path(tmp); live=p/'live';live.mkdir();(live/'auth').mkdir()
 (live/'business.json').write_text('{"mock":true,"history":["original"],"frozen":"seed"}')
 (live/'auth/members.json').write_text('{"mock":true}')
 (live/'native.csv').write_bytes(b'original,native\\r\\n')
 before={str(f.relative_to(live)):f.read_bytes() for f in live.rglob('*') if f.is_file()}
 snapshot(live,p/'backup')
 assert all((p/'backup'/name).read_bytes()==value for name,value in before.items())
 assert (p/'backup').stat().st_mode & 0o777 == 0o700
 assert (p/'backup/auth/members.json').stat().st_mode & 0o777 == 0o600
 assert len(json.loads((p/'backup/B15-PREVIEW-SNAPSHOT-MANIFEST.json').read_text()))==3
 try:snapshot(live,p/'backup');raise AssertionError('overwrite allowed')
 except ValueError:pass
 (live/'new-user-data.json').write_text('{"mockNew":true}')
 assert (live/'new-user-data.json').exists()
 (live/'unsafe').symlink_to(live/'business.json')
 try:snapshot(live,p/'refused');raise AssertionError('symlink allowed')
 except ValueError:pass
 assert not (p/'refused').exists()
 assert all((live/name).read_bytes()==value for name,value in before.items())
print('synthetic snapshot exact/private/refusal PASS; scratch removed')`;
    const r = spawnSync('python3', ['-B', '-c', code, new URL('./b15-user-preview-control.py', import.meta.url).pathname], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
} finally { await new Promise(resolve => fake.close(resolve)); }
console.log(JSON.stringify({ kind: 'TOOL_SELFTEST_ONLY', checks: count, productSmoke: 'NOT_EXECUTED', userURL: null }));
