import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// The platform launches npm run dev with PRAETOR_DEV_VITE_PORT and API_PORT.
// Keep the existing compiled API/workers; Vite serves the real React sources.
const require = createRequire(import.meta.url);
const env = { ...process.env, NODE_ENV: 'development' };
env.PRAETOR_APP_DATA_DIR ||= resolve('validation-state');
env.PRAETOR_APP_UPLOADS_DIR ||= resolve('validation-uploads');
const children = [];
let closing = false;
let forceTimer;

function stop(code) {
  if (closing) return;
  closing = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    }
  }
  forceTimer = setTimeout(() => {
    for (const child of children) {
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      }
    }
  }, 2000);
  forceTimer.unref();
}

for (const entry of [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), resolve('dist/server.mjs')]) {
  const child = spawn(process.execPath, ['--max-old-space-size=192', entry], {
    env, stdio: 'inherit', detached: true,
  });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => {
    if (!closing) stop(code || 1);
    if (children.every(item => item.exitCode !== null || item.signalCode !== null)) {
      clearTimeout(forceTimer);
    }
  });
}
process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));
