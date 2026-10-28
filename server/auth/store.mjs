// Members + invitations store for a managed lite-app — pure JSON file, no
// native modules (the lite-app image is pure-JS only; swap for sql.js or your
// own DB later, the routes only use this module's functions).
//
// Identity key: the platform's STABLE subject, `${issuer}#${sub}` from the
// signed X-Praetor-App-Context. Never an email, never a display name — those
// are neither unique nor proven (design §5.3).
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

export const ROLES = ['admin', 'member', 'planner', 'supervisor', 'query'];

export function subjectKey(actor) {
  if (!actor || actor.kind !== 'user' || !actor.sub) throw new Error('subjectKey: a human actor is required');
  return `${actor.issuer}#${actor.sub}`;
}

function nowIso() { return new Date().toISOString(); }
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function openStore(dataDir) {
  const file = path.join(dataDir, 'auth', 'members.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let state = { members: {}, invites: {}, initialized: false };
  let writing = false;
  // Read fresh (mtime alone can miss same-tick replacements). Every writer,
  // including the separate bootstrap process, uses the same exclusive lock.
  const reload = () => {
    if (writing) return;
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (err) {
      if (err.code !== 'ENOENT') throw err; // corrupt/unreadable is NOT empty
      state = { members: {}, invites: {}, initialized: false };
    }
  };
  const save = () => {
    const tmp = `${file}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 });
      fs.renameSync(tmp, file); // members + initialized commit together
    } finally { fs.rmSync(tmp, { force: true }); }
  };
  reload();

  const store = {
    // ---- members -----------------------------------------------------------
    /** Membership of a subject key: null (not a member), or { role, status }. */
    member(key) { reload(); return state.members[key] ?? null; },
    listMembers() { reload(); return Object.entries(state.members).map(([key, m]) => ({ key, ...m })); },
    hasAdmin() { reload(); return Object.values(state.members).some((m) => m.role === 'admin' && m.status === 'active'); },

    /**
     * EXPLICIT first-admin initialization — the ONLY way the first admin comes
     * into existence. Refused once any admin exists, so "the first person who
     * logs in becomes admin" can never happen. Called by a trusted deployment
     * step (an operator runs it with the subject they mean), never by a request.
     */
    initFirstAdmin(key, { name } = {}) { reload();
      // A bare user id would create an admin nobody can ever act as, and the
      // one-shot init would then refuse the right key. Require the full key.
      if (typeof key !== 'string' || !/^[^#]+#[^#]+$/.test(key)) throw new Error('initFirstAdmin: expected the member key `<issuer>#<userId>` (the `key` field of GET /api/auth/me)');
      if (state.initialized || store.hasAdmin()) throw new Error('first admin already initialized');
      state.members[key] = { role: 'admin', status: 'active', name: name ?? null, since: nowIso(), by: 'init' };
      state.initialized = true;
      save();
      return state.members[key];
    },

    setRole(key, role, by) { reload();
      if (!ROLES.includes(role)) throw new Error(`unknown role ${role}`);
      const m = state.members[key];
      if (!m) throw new Error('not a member');
      if (m.role === 'admin' && role !== 'admin' && store.listMembers().filter((x) => x.role === 'admin' && x.status === 'active').length === 1) {
        throw new Error('cannot demote the last admin');
      }
      m.role = role; m.updated = nowIso(); m.by = by; save(); return m;
    },
    setExport(key, value, by) { reload();
      const m=state.members[key]; if(!m)throw new Error('not a member');
      m.canExport=value===true;m.updated=nowIso();m.by=by;save();return m;
    },
    approve(key, by) { reload();
      const m = state.members[key];
      if (!m || m.status !== 'pending') throw new Error('nothing to approve');
      m.status = 'active'; m.approvedBy = by; m.updated = nowIso(); save(); return m;
    },
    remove(key) { reload();
      const m = state.members[key];
      if (!m) return false;
      if (m.role === 'admin' && m.status === 'active' && store.listMembers().filter((x) => x.role === 'admin' && x.status === 'active').length === 1) {
        throw new Error('cannot remove the last admin');
      }
      delete state.members[key]; save(); return true;
    },

    // ---- invitations -------------------------------------------------------
    /**
     * An invitation is the app's own record: who it is meant for (free text,
     * NOT an identity), the role it pre-assigns, an expiry, and a one-time
     * random token of which only the hash is stored. It is NOT a platform
     * credential and opens nothing on the platform.
     */
    createInvite({ forWhom, role = 'member', ttlMs = 7 * 24 * 60 * 60 * 1000, createdBy, requireApproval = true }) { reload();
      if (!ROLES.includes(role)) throw new Error(`unknown role ${role}`);
      const id = `inv_${randomBytes(8).toString('hex')}`;
      const token = randomBytes(24).toString('base64url');
      state.invites[id] = {
        id, forWhom: forWhom ?? null, role, requireApproval, createdBy, createdAt: nowIso(),
        expiresAt: new Date(Date.now() + ttlMs).toISOString(), tokenHash: sha256(token),
        acceptedBy: null, acceptedAt: null, revokedAt: null,
      };
      save();
      return { id, token, expiresAt: state.invites[id].expiresAt };
    },
    listInvites() { reload(); return Object.values(state.invites).map(({ tokenHash: _h, ...rest }) => rest); },
    revokeInvite(id) { reload();
      const inv = state.invites[id];
      if (!inv || inv.revokedAt) return false;
      inv.revokedAt = nowIso(); save(); return true;
    },

    /**
     * Accept an invitation AS the signed-in subject. Atomic and idempotent:
     * - unknown / revoked / expired token → `invalid`
     * - first acceptance binds the token to THIS subject and creates the member
     *   (`pending` when the invite requires an admin's confirmation — the
     *   default, because a link can be forwarded and a name is not a proof)
     * - the same subject accepting again → the same result (idempotent)
     * - a DIFFERENT subject on an already-bound token → `conflict`
     *   (the link was forwarded or replayed; the admin decides)
     */
    acceptInvite(token, key, { name } = {}) { reload();
      const hash = sha256(token);
      const inv = Object.values(state.invites).find((i) => i.tokenHash === hash);
      if (!inv || inv.revokedAt || Date.parse(inv.expiresAt) < Date.now()) return { outcome: 'invalid' };
      if (inv.acceptedBy && inv.acceptedBy !== key) return { outcome: 'conflict', inviteId: inv.id };
      if (inv.acceptedBy === key) return { outcome: 'already', inviteId: inv.id, member: state.members[key] ?? null };
      const existing = state.members[key];
      if (existing) {
        inv.acceptedBy = key; inv.acceptedAt = nowIso(); save();
        return { outcome: 'already_member', inviteId: inv.id, member: existing };
      }
      state.members[key] = {
        role: inv.role, status: inv.requireApproval ? 'pending' : 'active', name: name ?? null,
        since: nowIso(), by: `invite:${inv.id}`,
      };
      inv.acceptedBy = key; inv.acceptedAt = nowIso();
      save();
      return { outcome: inv.requireApproval ? 'pending' : 'active', inviteId: inv.id, member: state.members[key] };
    },
  };
  // Single-host example, not a distributed DB. Fail fast on contention: the
  // caller may retry. Never steal a lock by age (a suspended writer may resume).
  for (const action of ['initFirstAdmin', 'setRole', 'setExport', 'approve', 'remove', 'createInvite', 'revokeInvite', 'acceptInvite']) {
    const mutate = store[action];
    store[action] = (...args) => {
      const lock = `${file}.lock`;
      try { fs.mkdirSync(lock); }
      catch (err) {
        if (err.code === 'EEXIST') throw new Error('membership store busy; retry after the current writer completes');
        throw err;
      }
      try {
        reload();
        writing = true;
        return mutate(...args);
      } finally {
        writing = false;
        fs.rmdirSync(lock);
      }
    };
  }
  return store;
}
