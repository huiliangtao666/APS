// Business membership routes for a managed lite-app.
//
// Order of checks on EVERY business request (design §7):
//   1. the platform SDK verifies the signed X-Praetor-App-Context → typed actor
//      (`req.praetorActor`), 401 missing/invalid, 503 when the runtime is not
//      managed — never a plaintext header, never a browser-side viewer hint;
//   2. this module looks the actor's STABLE subject up in the app's own
//      members table — no member ⇒ business 403 `membership_required`, even
//      for a platform admin: platform authentication never implies business
//      membership;
//   3. the route checks the business role for THIS action;
//   4. then the business work happens and the requestId is audited.
//
// The SDK middleware and error mapper are injected so this file has no
// import of @praetor/lite-app-server itself: server/index.mjs wires the real
// ones, the tests inject fixture actors (fixtures exist ONLY in tests — there
// is no DEV_ROLE / ?role= backdoor in production code).
import { Router } from 'express';

import { ROLES, subjectKey } from './store.mjs';

const SAME_SITE = new Set(['same-origin', 'none']);

/** CSRF: a state-changing business request must come from this app's own
 *  pages. The platform's binding cookie is SameSite=Strict already; this is
 *  the belt to that brace. */
function sameOriginPost(req) {
  const site = req.headers['sec-fetch-site'];
  if (typeof site === 'string') return SAME_SITE.has(site);
  const origin = req.headers['origin'];
  if (typeof origin !== 'string' || !origin) return true;
  try { return new URL(origin).host === (req.headers['x-forwarded-host'] || req.headers['host']); } catch { return false; }
}

const audit = (req, action, extra = {}) => {
  // Keep the platform requestId with every business decision: it is the join
  // key between the app's log and the platform's gateway log. Never log the
  // token itself or any PII here.
  console.info(JSON.stringify({ at: new Date().toISOString(), action, requestId: req.praetorActor?.requestId, actor: req.praetorActor?.kind, ...extra }));
};

/**
 * @param {object} deps
 * @param {import('express').RequestHandler} deps.actorMiddleware  praetorActor() from @praetor/lite-app-server
 * @param {(res, err) => void} deps.sendActorError                  sendActorError from @praetor/lite-app-server
 * @param {ReturnType<import('./store.mjs').openStore>} deps.store
 * @param {string[]} [deps.servicePrincipals]                       service-account ids allowed as workers
 */
export function createAuthRouter({ actorMiddleware, sendActorError, store, servicePrincipals = [] }) {
  const router = Router();
  router.use(actorMiddleware);

  // ---- helpers -------------------------------------------------------------
  const human = (req, res) => {
    const a = req.praetorActor;
    if (!a || a.kind !== 'user' || !a.sub) {
      // The SDK already answered 401/503 for missing/invalid contexts; an
      // anonymous or machine actor reaching a human route is a business 401.
      res.status(401).json({ error: 'sign_in_required' });
      return null;
    }
    return a;
  };
  /** Active member with one of `roles` (any role when omitted); business 403 otherwise. */
  const requireMember = (roles) => (req, res, next) => {
    const a = human(req, res);
    if (!a) return;
    const key = subjectKey(a);
    const m = store.member(key);
    if (!m) { audit(req, 'deny', { reason: 'membership_required' }); res.status(403).json({ error: 'membership_required' }); return; }
    if (m.status !== 'active') { audit(req, 'deny', { reason: 'membership_pending' }); res.status(403).json({ error: 'membership_pending' }); return; }
    if (roles && !roles.includes(m.role)) { audit(req, 'deny', { reason: 'role_required', need: roles }); res.status(403).json({ error: 'forbidden', need: roles }); return; }
    req.member = { key, ...m };
    next();
  };
  const csrf = (req, res, next) => { if (!sameOriginPost(req)) { res.status(403).json({ error: 'csrf' }); return; } next(); };

  // ---- who am I, for the app's OWN UI --------------------------------------
  // Platform state comes from the runtime SDK's getAuthState(); this adds the
  // business half: not_member | pending | member(+role). The front end only
  // renders these; it never decides.
  router.get('/me', (req, res) => {
    const a = req.praetorActor;
    if (!a || a.kind !== 'user' || !a.sub) { res.status(401).json({ state: 'sign_in_required' }); return; }
    // `key` is the exact member key (`${issuer}#${sub}`) — what an operator
    // passes to `initFirstAdmin` and an admin passes as `{ key }`. `subject`
    // alone (the platform user id) is NOT a key.
    const key = subjectKey(a);
    const m = store.member(key);
    if (!m) { res.json({ state: 'not_member', subject: a.sub, key }); return; }
    res.json({ state: m.status === 'active' ? 'member' : 'pending', subject: a.sub, key, role: m.role, name: m.name });
  });

  // ---- members (admin) ------------------------------------------------------
  // The member key is the platform's stable subject — `praetor:env:uuid#userId`,
  // i.e. it contains `:` and `#`. Keep it in the BODY, never in the URL path:
  // the platform signs the exact target it forwarded, and a percent-encoded key
  // that any proxy re-encodes or decodes on the way turns every such request
  // into `target_mismatch`.
  const bodyKey = (req, res) => {
    const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
    if (!key) { res.status(400).json({ error: 'key_required' }); return null; }
    return key;
  };
  router.get('/members', requireMember(['admin']), (_req, res) => res.json(store.listMembers()));
  router.post('/members/export', csrf, requireMember(['admin']), (req,res)=>{
    const key=bodyKey(req,res);if(!key)return;
    if(typeof req.body.canExport!=='boolean')return res.status(400).json({error:'boolean_required'});
    try{const m=store.setExport(key,req.body.canExport,req.member.key);audit(req,'member.export',{target:key,canExport:m.canExport});res.json(m);}catch(e){res.status(409).json({error:String(e.message)});}
  });
  router.post('/members/role', csrf, requireMember(['admin']), (req, res) => {
    const key = bodyKey(req, res); if (!key) return;
    const role = req.body?.role;
    if (!ROLES.includes(role)) { res.status(400).json({ error: 'bad_role', roles: ROLES }); return; }
    try { const m = store.setRole(key, role, req.member.key); audit(req, 'member.role', { target: key, role }); res.json(m); }
    catch (e) { res.status(409).json({ error: String(e.message) }); }
  });
  router.post('/members/approve', csrf, requireMember(['admin']), (req, res) => {
    const key = bodyKey(req, res); if (!key) return;
    try { const m = store.approve(key, req.member.key); audit(req, 'member.approve', { target: key }); res.json(m); }
    catch (e) { res.status(409).json({ error: String(e.message) }); }
  });
  router.post('/members/remove', csrf, requireMember(['admin']), (req, res) => {
    const key = bodyKey(req, res); if (!key) return;
    try { audit(req, 'member.remove', { target: key }); res.json({ removed: store.remove(key) }); }
    catch (e) { res.status(409).json({ error: String(e.message) }); }
  });

  // ---- invitations (admin creates / lists / revokes; any signed-in human accepts)
  router.get('/invites', requireMember(['admin']), (_req, res) => res.json(store.listInvites()));
  router.post('/invites', csrf, requireMember(['admin']), (req, res) => {
    const { forWhom, role = 'member', ttlMs, requireApproval } = req.body ?? {};
    if (!ROLES.includes(role)) { res.status(400).json({ error: 'bad_role', roles: ROLES }); return; }
    const inv = store.createInvite({ forWhom, role, ttlMs, createdBy: req.member.key, requireApproval: requireApproval !== false });
    audit(req, 'invite.create', { inviteId: inv.id, role });
    // The token is returned ONCE, to the admin who will hand it over. It is
    // not an email, not a login, and it opens nothing on the platform.
    res.status(201).json(inv);
  });
  router.delete('/invites/:id', csrf, requireMember(['admin']), (req, res) => {
    audit(req, 'invite.revoke', { inviteId: req.params.id });
    res.json({ revoked: store.revokeInvite(req.params.id) });
  });
  // Accepting is an explicit same-origin POST by the SIGNED-IN person (a GET
  // never consumes anything, so a link preview or a scanner cannot). The
  // platform decided who they are; this only binds the invite to that subject.
  router.post('/invites/accept', csrf, (req, res) => {
    const a = human(req, res);
    if (!a) return;
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (!token) { res.status(400).json({ error: 'token_required' }); return; }
    const r = store.acceptInvite(token, subjectKey(a), { name: a.displayName });
    audit(req, 'invite.accept', { outcome: r.outcome, inviteId: r.inviteId });
    if (r.outcome === 'invalid') { res.status(410).json({ error: 'invite_invalid' }); return; }
    if (r.outcome === 'conflict') { res.status(409).json({ error: 'invite_already_used' }); return; }
    res.json({ outcome: r.outcome, membership: r.member ? { role: r.member.role, status: r.member.status } : null });
  });

  // ---- the business API pattern ---------------------------------------------
  // Every business route stacks the same way: requireMember([...roles]) then
  // the work. `req.member` is the app's view of the caller.
  router.get('/example/report', requireMember(['admin', 'member']), (req, res) => res.json({ ok: true, as: req.member.role }));

  // ---- machine callers (workers / the workspace agent) ----------------------
  // A worker calls with the platform's SERVICE identity (a service-account key
  // the platform turned into a `service` actor). It is never a human member;
  // allow-list the service ids you expect instead of mapping them to a role.
  router.post('/worker/ping', (req, res) => {
    const a = req.praetorActor;
    if (!a || a.kind !== 'service' || !servicePrincipals.includes(a.sub)) { res.status(403).json({ error: 'service_not_allowed' }); return; }
    audit(req, 'worker.ping', { service: a.sub });
    res.json({ ok: true, service: a.sub });
  });

  // ---- profile / PII (pending platform delivery) -----------------------------
  // Contact details live on the platform behind explicit per-app, per-field
  // authorization (Praetor #2881). Until that lands the app has NO way to read
  // them — answer "not available" rather than storing its own copies.
  router.get('/profile', requireMember(), (_req, res) => {
    res.status(501).json({ error: 'profile_unavailable', reason: 'pending_platform_profile_api' });
  });

  router.use((err, _req, res, _next) => sendActorError(res, err)); // eslint-disable-line no-unused-vars
  return { router, requireMember };
}
