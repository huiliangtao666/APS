// Executable example tests — run with `npm run test:auth` (node --test) in the app.
//
// Fixture identities exist ONLY here: the router takes the actor middleware
// as a dependency, so these tests inject one that reads a test-only header.
// Production wiring (server/index.mjs) injects praetorActor() from
// @praetor/lite-app-server, which verifies the platform's signature — there is
// no header, query or env var that turns a fixture on outside this file.
import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import express from 'express';

import { openStore } from './store.mjs';
import { createAuthRouter } from './routes.mjs';
import { authorizeStreamAction } from './ws-guard.mjs';
import { initializeAdmin } from './init-admin.mjs';

const ISS = 'praetor:test:env';
const fixtureActor = (req, _res, next) => {
  const raw = req.headers['x-test-actor'];
  if (raw) req.praetorActor = { ...JSON.parse(raw), issuer: ISS, requestId: 'req-1', generation: 1 };
  next();
};
const sendActorError = (res, err) => res.status(500).json({ error: String(err?.message ?? err) });

let store, base, server;
beforeEach(async () => {
  if (server) await new Promise((r) => server.close(r));
  store = openStore(fs.mkdtempSync(path.join(os.tmpdir(), 'lite-app-auth-')));
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter({ actorMiddleware: fixtureActor, sendActorError, store, servicePrincipals: ['sa_worker'] }).router);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/api/auth`;
});
after(async () => { if (server) await new Promise((r) => server.close(r)); });

const as = (actor) => ({ 'x-test-actor': JSON.stringify(actor), 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' });
const alice = { kind: 'user', sub: 'alice', displayName: 'Alice' };
const bob = { kind: 'user', sub: 'bob' };
const carol = { kind: 'user', sub: 'carol' };
const platformAdmin = { kind: 'user', sub: 'admin' }; // a platform system_admin is just another subject here
const call = async (method, p, { actor, body, headers } = {}) => {
  const r = await fetch(base + p, { method, headers: { ...(actor ? as(actor) : { 'content-type': 'application/json' }), ...(headers ?? {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
};
const key = (a) => `${ISS}#${a.sub}`;

describe('deployment bootstrap and persistence', () => {
  const options = { issuer: ISS, instance: 'lai_test', user: 'alice', confirm: key(alice) };
  const env = { PRAETOR_APP_CONTEXT_ISSUER: ISS, PRAETOR_APP_INSTANCE_ID: 'lai_test' };
  test('mismatch, unsupported runtime, missing confirmation and machine targets write nothing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-bootstrap-'));
    const dataDir = path.join(dir, 'server', 'data');
    try {
      for (const bad of [{ issuer: 'other' }, { instance: 'lai_other' }, { confirm: undefined }, { user: 'sa-worker' }, { user: 'a#b' }, { user: 'a b' }, { user: 'a\nb' }, { user: '' }]) {
        assert.throws(() => initializeAdmin({ ...options, ...bad }, { env, dataDir }));
      }
      assert.throws(() => initializeAdmin(options, { env: {}, dataDir }), /unsupported/);
      assert.equal(fs.existsSync(dataDir), false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  test('accepts an exact legacy human ID that predates the current creation grammar', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-bootstrap-'));
    try {
      const legacy = 'Legacy.User@corp';
      const result = initializeAdmin({ ...options, user: legacy, confirm: `${ISS}#${legacy}` }, { env, dataDir });
      assert.equal(result.member.role, 'admin');
    } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
  });
  test('fresh server stores see the committed admin; repeats refuse and other issuers have no membership', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-bootstrap-'));
    try {
      const running = openStore(dataDir);
      assert.equal(running.member(key(alice)), null);
      const result = initializeAdmin(options, { env, dataDir });
      assert.equal(result.member.role, 'admin');
      assert.equal(running.member(key(alice)).role, 'admin');
      assert.equal(openStore(dataDir).member(key(alice)).role, 'admin');
      assert.equal(openStore(dataDir).member(`other#alice`), null);
      assert.throws(() => initializeAdmin(options, { env, dataDir }), /already initialized/);
    } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
  });
  test('a failed atomic replacement leaves no half-initialized admin or poisoned in-memory state', (t) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-bootstrap-'));
    try {
      const s = openStore(dataDir);
      const rename = t.mock.method(fs, 'renameSync', () => { throw new Error('simulated write failure'); });
      assert.throws(() => s.initFirstAdmin(key(alice)), /simulated write failure/);
      assert.equal(s.hasAdmin(), false);
      assert.deepEqual(fs.readdirSync(path.join(dataDir, 'auth')), []);
      rename.mock.restore();
      s.initFirstAdmin(key(bob));
      assert.equal(openStore(dataDir).member(key(bob)).role, 'admin');
    } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
  });
  test('two separate processes cannot both initialize; stale lock and malformed state fail closed', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-bootstrap-'));
    const launch = (user) => new Promise((resolve, reject) => {
      const code = `import {openStore} from ${JSON.stringify(new URL('./store.mjs', import.meta.url).href)};
        try { openStore(process.argv[1]).initFirstAdmin(process.argv[2]); }
        catch { process.exitCode = 1; }`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', code, dataDir, `${ISS}#${user}`], { stdio: 'ignore' });
      child.on('error', reject); child.on('exit', resolve);
    });
    try {
      assert.deepEqual((await Promise.all([launch('alice'), launch('bob')])).sort(), [0, 1]);
      const s = openStore(dataDir);
      assert.equal(s.listMembers().length, 1);
      const file = path.join(dataDir, 'auth', 'members.json');
      fs.mkdirSync(`${file}.lock`);
      assert.throws(() => s.initFirstAdmin(key(carol)), /busy/);
      fs.rmdirSync(`${file}.lock`);
      fs.writeFileSync(file, '{bad');
      assert.throws(() => s.initFirstAdmin(key(carol)), SyntaxError);
      assert.equal(fs.readFileSync(file, 'utf8'), '{bad');
      assert.equal(fs.existsSync(`${file}.lock`), false);
    } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
  });
});

describe('no member, no access — platform authentication never implies business membership', () => {
  test('a signed-in platform user, even a platform admin, is refused by the business backend', async () => {
    assert.equal((await call('GET', '/example/report', { actor: alice })).status, 403);
    assert.equal((await call('GET', '/example/report', { actor: platformAdmin })).status, 403);
    assert.deepEqual((await call('GET', '/me', { actor: platformAdmin })).json, { state: 'not_member', subject: 'admin', key: key(platformAdmin) });
  });
  test('an anonymous or machine actor is not a person: 401 on human routes', async () => {
    assert.equal((await call('GET', '/me')).status, 401);
    assert.equal((await call('GET', '/me', { actor: { kind: 'anonymous' } })).status, 401);
    assert.equal((await call('GET', '/example/report', { actor: { kind: 'service', sub: 'sa_worker' } })).status, 401);
  });
});

describe('the first admin is initialized explicitly — never "first login wins"', () => {
  test('initFirstAdmin once; a second attempt is refused; the admin then manages members', async () => {
    store.initFirstAdmin(key(alice), { name: 'Alice' });
    assert.throws(() => store.initFirstAdmin(key(bob)), /already initialized/);
    assert.deepEqual((await call('GET', '/me', { actor: alice })).json, { state: 'member', subject: 'alice', key: key(alice), role: 'admin', name: 'Alice' });
    assert.equal((await call('GET', '/example/report', { actor: alice })).json.as, 'admin');
    // Members list is admin-only; bob (not a member) is refused, not 404-probed.
    assert.equal((await call('GET', '/members', { actor: bob })).status, 403);
    // The last admin cannot be demoted or removed.
    assert.equal((await call('POST', '/members/role', { actor: alice, body: { key: key(alice), role: 'member' } })).status, 409);
    assert.equal((await call('POST', '/members/remove', { actor: alice, body: { key: key(alice) } })).status, 409);
    // The member key is never a path segment (it contains ':' and '#', which a
    // proxy may re-encode — the platform signs the exact target it forwarded).
    assert.equal((await call('POST', `/members/${encodeURIComponent(key(alice))}/role`, { actor: alice, body: { role: 'member' } })).status, 404);
    assert.equal((await call('POST', '/members/role', { actor: alice, body: { role: 'member' } })).status, 400);
  });
});

describe('the operator reads the first admin key from /me', () => {
  test('`key` from GET /api/auth/me is exactly what initFirstAdmin needs; a bare user id is refused, not silently stored', async () => {
    const me = (await call('GET', '/me', { actor: alice })).json;
    assert.throws(() => store.initFirstAdmin(me.subject), /expected the member key/);
    store.initFirstAdmin(me.key, { name: 'Alice' });
    assert.equal((await call('GET', '/me', { actor: alice })).json.state, 'member');
  });
});

describe('invitations: the app binds a stable subject, the admin confirms, links can be forwarded', () => {
  let adminHdr;
  beforeEach(() => { store.initFirstAdmin(key(alice)); adminHdr = alice; });

  test('unregistered person: the invite alone opens nothing — accepting requires a platform sign-in first', async () => {
    const inv = (await call('POST', '/invites', { actor: adminHdr, body: { forWhom: 'bob@example.com', role: 'member' } })).json;
    assert.match(inv.token, /^[A-Za-z0-9_-]{20,}$/);
    // Not signed in to the platform: 401, nothing consumed.
    assert.equal((await call('POST', '/invites/accept', { body: { token: inv.token } })).status, 401);
    // A GET never consumes (no accept route on GET at all).
    assert.equal((await call('GET', '/invites/accept?token=' + inv.token)).status, 404);
    assert.equal(store.listInvites()[0].acceptedBy, null);
  });

  test('same email, different subject: "for bob@example.com" is a note, not an identity — whoever accepts is pending until the admin confirms', async () => {
    const inv = (await call('POST', '/invites', { actor: adminHdr, body: { forWhom: 'bob@example.com' } })).json;
    // Carol (a different platform subject) got the link forwarded and accepts.
    const acc = await call('POST', '/invites/accept', { actor: carol, body: { token: inv.token } });
    assert.equal(acc.status, 200);
    assert.deepEqual(acc.json, { outcome: 'pending', membership: { role: 'member', status: 'pending' } });
    // Pending is not access.
    assert.equal((await call('GET', '/example/report', { actor: carol })).status, 403);
    assert.equal((await call('GET', '/example/report', { actor: carol })).json.error, 'membership_pending');
    // The token is now bound to carol: bob (the intended person) cannot use it.
    assert.equal((await call('POST', '/invites/accept', { actor: bob, body: { token: inv.token } })).status, 409);
    // Carol accepting again is idempotent.
    assert.equal((await call('POST', '/invites/accept', { actor: carol, body: { token: inv.token } })).json.outcome, 'already');
    // The admin sees WHO actually accepted and decides: approve, or remove and re-invite.
    const pending = (await call('GET', '/members', { actor: adminHdr })).json.find((m) => m.key === key(carol));
    assert.equal(pending.status, 'pending');
    assert.equal((await call('POST', '/members/approve', { actor: adminHdr, body: { key: key(carol) } })).status, 200);
    assert.equal((await call('GET', '/example/report', { actor: carol })).status, 200);
  });

  test('expired and revoked invites are dead; a non-admin cannot create or revoke one', async () => {
    const dead = store.createInvite({ forWhom: 'x', ttlMs: -1, createdBy: key(alice) });
    assert.equal((await call('POST', '/invites/accept', { actor: bob, body: { token: dead.token } })).status, 410);
    const inv = (await call('POST', '/invites', { actor: adminHdr, body: {} })).json;
    assert.equal((await call('DELETE', `/invites/${inv.id}`, { actor: bob })).status, 403);
    assert.equal((await call('DELETE', `/invites/${inv.id}`, { actor: adminHdr })).json.revoked, true);
    assert.equal((await call('POST', '/invites/accept', { actor: bob, body: { token: inv.token } })).status, 410);
    assert.equal((await call('POST', '/invites', { actor: bob, body: {} })).status, 403);
    // Listing never leaks token hashes.
    assert.equal((await call('GET', '/invites', { actor: adminHdr })).json.some((i) => 'tokenHash' in i), false);
  });

  test('cross-site POSTs are refused before anything is consumed', async () => {
    const inv = (await call('POST', '/invites', { actor: adminHdr, body: {} })).json;
    const r = await call('POST', '/invites/accept', { actor: bob, body: { token: inv.token }, headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(r.status, 403);
    assert.equal(store.listInvites().find((i) => i.id === inv.id).acceptedBy, null);
  });
});

describe('business admin ≠ platform admin', () => {
  test('an app admin manages this app\'s members and nothing else; a platform admin without membership manages nothing here', async () => {
    store.initFirstAdmin(key(alice));
    store.acceptInvite(store.createInvite({ createdBy: key(alice), requireApproval: false }).token, key(bob));
    // App admin: promote bob, then demote; sees only this app's member list.
    assert.equal((await call('POST', '/members/role', { actor: alice, body: { key: key(bob), role: 'admin' } })).json.role, 'admin');
    assert.equal((await call('POST', '/members/role', { actor: alice, body: { key: key(bob), role: 'member' } })).json.role, 'member');
    // There is no route that touches platform users, workspaces or PII; the profile stub says so.
    assert.equal((await call('GET', '/profile', { actor: alice })).status, 501);
    // Platform admin, not a member: every admin route is 403.
    assert.equal((await call('GET', '/members', { actor: platformAdmin })).status, 403);
    assert.equal((await call('POST', '/invites', { actor: platformAdmin, body: {} })).status, 403);
  });
});

describe('machine callers and streams', () => {
  test('a worker is a service actor on an allow-list, never a member', async () => {
    assert.equal((await call('POST', '/worker/ping', { actor: { kind: 'service', sub: 'sa_worker' } })).json.service, 'sa_worker');
    assert.equal((await call('POST', '/worker/ping', { actor: { kind: 'service', sub: 'sa_other' } })).status, 403);
    assert.equal((await call('POST', '/worker/ping', { actor: alice })).status, 403);
  });
  test('stream actions are authorized per message from the current membership', () => {
    store.initFirstAdmin(key(alice));
    store.acceptInvite(store.createInvite({ createdBy: key(alice), requireApproval: false }).token, key(bob));
    assert.equal(authorizeStreamAction(store, { ...bob, issuer: ISS }, 'report.read').allow, true);
    assert.deepEqual(authorizeStreamAction(store, { ...bob, issuer: ISS }, 'member.manage'), { allow: false, reason: 'forbidden' });
    assert.deepEqual(authorizeStreamAction(store, { ...carol, issuer: ISS }, 'report.read'), { allow: false, reason: 'membership_required' });
    assert.deepEqual(authorizeStreamAction(store, { kind: 'anonymous', issuer: ISS }, 'report.read'), { allow: false, reason: 'sign_in_required' });
    store.remove(key(bob));
    assert.equal(authorizeStreamAction(store, { ...bob, issuer: ISS }, 'report.read').allow, false);
  });
});
