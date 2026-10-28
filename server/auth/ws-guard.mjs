// Per-action authorization for a business WebSocket / SSE channel.
//
// A stream is admitted by the platform (the binding cookie + signed assertion
// on the upgrade / first request) and REVOKED by the platform when the human
// session ends. What the platform cannot know is which business actions a
// member may perform over that stream — decide that per message, here, from
// the app's own membership, never from anything the client sends about itself.
import { subjectKey } from './store.mjs';

/** action → roles allowed. Everything not listed is denied. */
const ACTION_ROLES = {
  'report.read': ['admin', 'member'],
  'report.write': ['admin', 'member'],
  'member.manage': ['admin'],
};

/**
 * @param {object} store   the members store
 * @param {object} actor   `req.praetorActor` captured at stream admission
 * @param {string} action  the business action named in the message
 * @returns {{ allow: true, member: object } | { allow: false, reason: string }}
 */
export function authorizeStreamAction(store, actor, action) {
  if (!actor || actor.kind !== 'user' || !actor.sub) return { allow: false, reason: 'sign_in_required' };
  const roles = ACTION_ROLES[action];
  if (!roles) return { allow: false, reason: 'unknown_action' };
  const m = store.member(subjectKey(actor));
  if (!m) return { allow: false, reason: 'membership_required' };
  if (m.status !== 'active') return { allow: false, reason: 'membership_pending' };
  if (!roles.includes(m.role)) return { allow: false, reason: 'forbidden' };
  return { allow: true, member: m };
}

/**
 * Wire-up sketch for `ws` (pure-JS, available offline in the lite-app image):
 *
 *   wss.on('connection', (socket, req) => {
 *     const actor = req.praetorActor;              // set by praetorActor() on the upgrade request
 *     socket.on('message', (raw) => {
 *       const msg = JSON.parse(raw);
 *       const decision = authorizeStreamAction(store, actor, msg.action);
 *       if (!decision.allow) { socket.send(JSON.stringify({ error: decision.reason, id: msg.id })); return; }
 *       handle(msg, decision.member);
 *     });
 *   });
 *
 * Re-check membership on every message (not once at connect): an admin may
 * remove or demote a member while the socket is open.
 */
