// Native HTTP listener; uses the official SDK for request identity, never headers as actors.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { createPreview, validateBase } from './b15-user-preview-core.mjs';

export async function configuration(env = process.env) {
  const root = env.B15_PREVIEW_SDK_ROOT;
  if (!root || !path.isAbsolute(root)) throw Error('missing B15_PREVIEW_SDK_ROOT (existing container dependency root)');
  const packageDir = path.join(root, 'node_modules/@praetor/lite-app-server');
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json')));
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  if (major === 0 && (minor < 4 || (minor === 4 && patch < 1))) throw Error('SDK >=0.4.1 required');
  const sdk = await import(pathToFileURL(path.join(packageDir, 'dist/index.js')).href);
  const identity = sdk.readPraetorIdentityConfig(env);
  const base = validateBase(env.B15_PREVIEW_BASE || '');
  // The SDK accepts exact full and base-stripped targets; do not normalize before verification.
  // A dev-strip other than PRAETOR_APP_BASE is not guessed or added to signed candidates.
  const members = JSON.parse(env.B15_PREVIEW_MEMBER_KEYS || '[]');
  const preview = createPreview({ base, origin: env.B15_PREVIEW_PUBLIC_ORIGIN, members,
    clientScript: fs.readFileSync(new URL('./b15-user-preview-client.js', import.meta.url), 'utf8') });
  return { preview, sdk, identity, members, base };
}

export function createHandler({ preview, sdk, identity }) {
  return async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'same-origin');
    try {
      const actor = sdk.verifyRequestActor(req, identity);
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 2 * 1024 * 1024) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
      const r = await preview({ method: req.method, target: req.url, headers: req.headers, body: Buffer.concat(chunks), actor });
      res.writeHead(r.status, r.headers); res.end(r.body);
    } catch (err) {
      res.writeHead(err instanceof sdk.AppContextError ? err.status : 502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof sdk.AppContextError ? err.reason : 'preview_unavailable' }));
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const configured = await configuration();
    if (process.argv.includes('--check')) {
      console.log(JSON.stringify({ check: 'configuration_only_no_HTTP', sdkIdentitySupported: Boolean(configured.identity),
        memberCount: configured.members.length, base: configured.base, activation: 'NOT_EXECUTED',
        requiredPlatformFields: ['PRAETOR_APP_INSTANCE_ID', 'PRAETOR_APP_CONTEXT_ISSUER', 'PRAETOR_APP_CONTEXT_KEYS', 'PRAETOR_APP_BASE'],
        requestHeader: 'X-Praetor-App-Context', missingIdentityBehavior: '503 unsupported' }));
      process.exitCode = configured.identity && configured.members.length ? 0 : 2;
    } else {
      const port = Number(process.env.PORT);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('platform PORT required');
      const server = http.createServer(createHandler(configured));
      server.requestTimeout = 5000; server.headersTimeout = 5000; server.maxConnections = 8;
      server.listen(port, '0.0.0.0');
      for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
    }
  } catch (err) { console.error(err.message); process.exitCode = 2; }
}
