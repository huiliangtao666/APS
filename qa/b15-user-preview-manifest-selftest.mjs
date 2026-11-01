// Finite deployment tooling checks; no listener, product request, browser or Worker.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import { configuration } from './b15-user-preview-server.mjs';
const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const pkg = JSON.parse(read('./b15-user-preview-package.json'));
const lock = JSON.parse(read('./b15-user-preview-package-lock.json'));
assert.equal(pkg.private, true);
assert.deepEqual(pkg.dependencies, {});
assert.deepEqual(pkg.devDependencies, {});
assert.deepEqual(pkg.scripts, { dev: 'node b15-user-preview-server.mjs', start: 'node b15-user-preview-server.mjs' });
assert.equal(lock.lockfileVersion, 3);
assert.deepEqual(Object.keys(lock.packages), ['']);
assert.equal(lock.name, pkg.name);
assert.equal(lock.version, pkg.version);
assert.deepEqual(lock.packages[''].engines, pkg.engines);
assert.equal(read('./b15-user-preview-npmrc'), 'offline=true\naudit=false\nfund=false\nupdate-notifier=false\npackage-lock=true\n');
// Enumerate the workspace-preview entry's static module closure. Managed SDK import is lazy.
const entry = read('./b15-user-preview-server.mjs'), core = read('./b15-user-preview-core.mjs');
for (const text of [entry, core]) {
  for (const [, name] of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    assert.ok(name === './b15-user-preview-core.mjs' || (name.startsWith('node:') && builtinModules.includes(name.slice(5))), name);
  }
}
assert.ok(entry.indexOf("return { mode, base, origin, preview, scopes: new Map() }") < entry.indexOf('await import('));
const env = { PRAETOR_WORKSPACE_ID: 'APS-Test' };
const deployment = { mode: 'workspace-preview', candidate: 'integrated0afa', base: '/praetor-app/777/dev/', origin: 'https://preview.invalid', workspaceId: 'APS-Test', unpublished: true, ingress: 'platform-workspace-session-only', platformGateVerified: true, gateEvidence: 'SYNTHETIC TOOL CHECK ONLY; never admission evidence' };
const result = await configuration(env, deployment);
assert.equal(result.mode, 'workspace-preview');
assert.equal(result.sdk, undefined);
for (const [key, value] of [['unpublished', false], ['platformGateVerified', false], ['workspaceId', 'other'], ['gateEvidence', '']]) {
  await assert.rejects(configuration(env, { ...deployment, [key]: value }), /verified_unpublished_workspace_gate_required/);
}
await assert.rejects(configuration(env, { ...deployment, mode: 'managed-identity' }), /missing B15_PREVIEW_SDK_ROOT/);
console.log(JSON.stringify({ result: 'PASS', checks: ['private-empty-dependency-manifest', 'lock-v3-empty-graph', 'offline-npm-config-retains-lifecycle', 'builtin-static-closure', 'workspace-mode-without-SDK', 'closed-gate-negatives', 'managed-mode-still-requires-SDK'], listener: false, productHTTP: false, browser: false, Worker: false }));
