import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {mkdir,copyFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';

// The platform launches npm run dev with PRAETOR_DEV_VITE_PORT and API_PORT.
// Build API/workers into a dev-owned directory. Published dist stays intact.
const require = createRequire(import.meta.url);
const env = { ...process.env, NODE_ENV: 'development' };
env.PRAETOR_APP_DATA_DIR ||= resolve('validation-state');
env.PRAETOR_APP_UPLOADS_DIR ||= resolve('validation-uploads');
const runtime=resolve('temp/dev-runtime');
await mkdir(runtime,{recursive:true});
await Promise.all(['index','calculation-worker','workbook-import-worker'].map(async name=>build({entryPoints:['server/'+name+'.mjs'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:resolve(runtime,name==='index'?'server.mjs':name+'.mjs')})));
await Promise.all(['workbook-schema.json','workbook-simulation.json'].map(name=>copyFile(resolve('server',name),resolve(runtime,name))));
await mkdir(resolve(runtime,'solver-choice'),{recursive:true});
await Promise.all((await readdir('server/solver-choice')).filter(name=>name.endsWith('.py')).map(name=>copyFile(resolve('server/solver-choice',name),resolve(runtime,'solver-choice',name))));
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

for (const entry of [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), resolve(runtime,'server.mjs')]) {
  const child = spawn(process.execPath, ['--max-old-space-size=512', entry], {
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
