// Run explicitly in the APP runtime, from the same cwd/config as server/index.mjs.
// Not an HTTP endpoint, login hook, or startup task. Filesystem execution is
// deployment authority; this does not grant any platform permission.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { openStore } from './store.mjs';

export function checkTarget({ issuer, instance, user, confirm }, env) {
  if (!env.PRAETOR_APP_CONTEXT_ISSUER || !env.PRAETOR_APP_INSTANCE_ID) {
    throw new Error('unsupported: managed identity is absent in this app runtime');
  }
  if (issuer !== env.PRAETOR_APP_CONTEXT_ISSUER || instance !== env.PRAETOR_APP_INSTANCE_ID) {
    throw new Error('identity mismatch: re-read the target instance and issuer; do not override runtime identity');
  }
  // Accept the exact ID the control-plane lookup verified, including legacy
  // (pre-#698) human IDs outside today's creation grammar; existence/human
  // lookup is a separate authorized step. Only what would corrupt the member
  // key (`#`, whitespace, control characters) and service accounts are refused.
  if (typeof user !== 'string' || user.length < 1 || user.length > 256
    || /[#\s\u0000-\u001f\u007f]/u.test(user) || user.startsWith('sa-')) {
    throw new Error('an exact human platform user ID is required');
  }
  const key = `${issuer}#${user}`;
  if (confirm !== key) throw new Error('explicit --confirm <issuer>#<userId> is required after operator approval');
  return key;
}

export function initializeAdmin(options, { env, dataDir }) {
  const key = checkTarget(options, env);
  const store = openStore(dataDir);
  store.initFirstAdmin(key);
  const member = openStore(dataDir).member(key);
  if (member?.role !== 'admin' || member.status !== 'active') throw new Error('initialization verification failed');
  return { instance: options.instance, issuer: options.issuer, key, dataDir, member };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: {
      issuer: { type: 'string' }, instance: { type: 'string' },
      user: { type: 'string' }, confirm: { type: 'string' },
    } });
    checkTarget(values, process.env); // reject before opening/creating a store
    const { resolveDataDir } = await import('@praetor/lite-app-server');
    // Same SDK resolver as createLiteAppServer: NOT cwd/data. If the app sets
    // createLiteAppServer({dataDir}), share that config here before using this.
    console.log(JSON.stringify(initializeAdmin(values, { env: process.env, dataDir: resolveDataDir() }), null, 2));
  } catch (err) {
    console.error(`init-admin: ${err.message}`);
    process.exitCode = 1;
  }
}
