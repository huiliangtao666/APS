// One listener. Workspace preview uses the platform ingress gate; managed identity uses the SDK.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { createPreview, validateBase, LOCK, httpTransport } from './b15-user-preview-core.mjs';

export async function configuration(env = process.env, deployment = {}) {
  const mode = deployment.mode || env.B15_PREVIEW_MODE || 'managed-identity';
  if (!['managed-identity', 'workspace-preview'].includes(mode)) throw Error('explicit_preview_mode_required');
  const base = validateBase(deployment.base || env.B15_PREVIEW_BASE || '');
  const origin = deployment.origin || env.B15_PREVIEW_PUBLIC_ORIGIN;
  const policy = deployment.candidate === 'integrated0afa' ? LOCK.candidates.integrated0afa : LOCK;
  const clientScript = fs.readFileSync(new URL('./b15-user-preview-client.js', import.meta.url), 'utf8');
  if (mode === 'workspace-preview') {
    if (deployment.candidate !== 'integrated0afa' || env.PRAETOR_WORKSPACE_ID !== 'APS-Test' ||
        deployment.workspaceId !== 'APS-Test' || deployment.unpublished !== true ||
        deployment.ingress !== 'platform-workspace-session-only' || deployment.platformGateVerified !== true ||
        typeof deployment.gateEvidence !== 'string' || !deployment.gateEvidence.trim()) throw Error('verified_unpublished_workspace_gate_required');
    const preview = createPreview({ base, origin, members: [], mode, policy,
      transport: httpTransport(policy.upstream), clientScript });
    return { mode, base, origin, preview, scopes: new Map() };
  }
  const root = env.B15_PREVIEW_SDK_ROOT;
  if (!root || !path.isAbsolute(root)) throw Error('missing B15_PREVIEW_SDK_ROOT');
  const packageDir = path.join(root, 'node_modules/@praetor/lite-app-server');
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json')));
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  if (major === 0 && (minor < 4 || (minor === 4 && patch < 1))) throw Error('SDK >=0.4.1 required');
  const sdk = await import(pathToFileURL(path.join(packageDir, 'dist/index.js')).href);
  const identity = sdk.readPraetorIdentityConfig(env);
  const members = JSON.parse(env.B15_PREVIEW_MEMBER_KEYS || '[]');
  const preview = createPreview({ base, origin, members, policy,
    transport: httpTransport(policy.upstream), clientScript });
  return { mode, preview, sdk, identity, members, base };
}

export function createHandler({ preview, sdk, identity, mode = 'managed-identity', scopes, base }) {
  return async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'same-origin');
    try {
      let actor, workspaceScope;
      if (mode === 'workspace-preview') {
        const cookies = (req.headers.cookie || '').split(';').map(x => x.trim()).filter(x => x.startsWith('__Secure-b15-scope='));
        const token = cookies.length === 1 ? cookies[0].slice('__Secure-b15-scope='.length) : '';
        const now = Date.now();
        for (const [key, expires] of scopes) if (expires <= now) scopes.delete(key);
        if (/^[a-f0-9]{48}$/.test(token) && scopes.has(token)) workspaceScope = token;
        else if (req.method === 'GET' && scopes.size < 128) {
          workspaceScope = randomBytes(24).toString('hex');
          scopes.set(workspaceScope, now + 8 * 60 * 60 * 1000);
          // This cookie owns only newly copied objects; it never authenticates a platform user.
          res.setHeader('set-cookie', `__Secure-b15-scope=${workspaceScope}; Path=${base}; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
        }
        if (!workspaceScope) { res.writeHead(401); res.end(JSON.stringify({ error: 'new_browser_scope_required' })); return; }
      } else actor = sdk.verifyRequestActor(req, identity);
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 2 * 1024 * 1024) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
      const r = await preview({ method: req.method, target: req.url, headers: req.headers, body: Buffer.concat(chunks), actor, workspaceScope });
      res.writeHead(r.status, r.headers); res.end(r.body);
    } catch (err) {
      const official = sdk && err instanceof sdk.AppContextError;
      res.writeHead(official ? err.status : 502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: official ? err.reason : 'preview_unavailable' }));
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // A workspace activation can obtain devBase first, then save reviewed deployment
  // configuration. Until it exists and validates, every business request is closed.
  const deploymentFile = new URL('./b15-user-preview-deployment.json', import.meta.url);
  let cachedText, handler;
  async function load() {
    const text = fs.existsSync(deploymentFile) ? fs.readFileSync(deploymentFile, 'utf8') : '{}';
    if (text !== cachedText) {
      handler = undefined;
      const configured = await configuration(process.env, JSON.parse(text));
      handler = createHandler(configured); cachedText = text;
      return configured;
    }
  }
  try {
    if (process.argv.includes('--check')) {
      const c = await load();
      const supported = c.mode === 'workspace-preview' || (Boolean(c.identity) && c.members.length > 0);
      console.log(JSON.stringify({ mode: c.mode, configurationOnly: true, supported, base: c.base, activation: 'NOT_EXECUTED' }));
      process.exitCode = supported ? 0 : 2;
    } else {
      const port = Number(process.env.PORT);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('platform PORT required');
      const server = http.createServer(async (req, res) => {
        try { await load(); return handler(req, res); }
        catch { res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end('{"error":"preview_configuration_closed"}'); }
      });
      server.requestTimeout = 5000; server.headersTimeout = 5000; server.maxConnections = 8;
      server.listen(port, '0.0.0.0');
      for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
    }
  } catch (err) { console.error(err.message); process.exitCode = 2; }
}
