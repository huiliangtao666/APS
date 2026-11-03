import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { appPath } from '../.qa-app-path.mjs';

const base = process.env.PRAETOR_APP_BASE;
assert(base && base !== '/' && base.endsWith('/'), 'explicit simulated platform base required');
const out = path.resolve('../hosting-path-result.json');
const runs = JSON.parse(fs.readFileSync('validation-state/workbooks/state.json')).runs;
const accepted = runs.filter(r => ['fef9cde1-dced-4159-be8b-286f9a2c3e66', '26eca6bc-e2c0-4c04-947e-03406e431241'].includes(r.id));
assert.equal(accepted.length, 2);
const result = { kind: 'FINITE_LOCAL_PLATFORM_PATH_SIMULATION', browser: false, checks: [], modes: [], childPids: [], calculations: 0 };
const children = new Set();
const cgRead = name => fs.readFileSync('/sys/fs/cgroup/' + name, 'utf8').trim();
result.cgroup = { max: cgRead('memory.max'), initial: cgRead('memory.current'), samples: [], events: cgRead('memory.events') };
let resourceStopped = false;
const resourceWatch = setInterval(() => {
  const current = Number(cgRead('memory.current'));
  const events = cgRead('memory.events');
  result.cgroup.samples.push({ at: Date.now(), current, events });
  const unsafe = /^(?:max|oom|oom_kill) [1-9]/m.test(events) || (result.cgroup.max !== 'max' && Number(result.cgroup.max) - current <= 256 * 1024 * 1024);
  if (unsafe && !resourceStopped) {
    resourceStopped = true; result.status = 'RESOURCE_GUARD_STOP';
    console.error('RESOURCE_GUARD_STOP', current, events);
    fs.writeFileSync(out, JSON.stringify(result, null, 2));
    cleanup().finally(() => process.exit(1));
  }
}, 250);

const deadline = setTimeout(() => { result.error = 'finite path deadline'; cleanup().finally(() => process.exit(1)); }, 140000);
function check(name, value = true) { assert(value, name); result.checks.push(name); }
async function cleanup() {
  for (const p of children) { try { process.kill(-p.pid, 'SIGTERM'); } catch {} }
  await Promise.all([...children].map(async p => {
    if (p.exitCode !== null || p.signalCode !== null) return;
    await Promise.race([once(p, 'exit'), new Promise(resolve => setTimeout(resolve, 3500))]);
    if (p.exitCode === null && p.signalCode === null) { try { process.kill(-p.pid, 'SIGKILL'); } catch {} }
  }));
  children.clear();
}
async function bindProbe(port) {
  await new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject); s.listen(port, '0.0.0.0', () => s.close(resolve));
  });
}
async function freePort(port) {
  const born = Date.now();
  while (true) {
    try { await bindProbe(port); result.checks.push('port ' + port + ' released within ' + (Date.now() - born) + 'ms'); return; }
    catch (e) {
      if (e.code !== 'EADDRINUSE' || Date.now() - born > 5000) throw e;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
function descendants(parent) {
  const rows = fs.readdirSync('/proc').filter(n => /^\d+$/.test(n)).flatMap(n => {
    try { const s = fs.readFileSync('/proc/' + n + '/status', 'utf8'); return [{ pid: Number(n), parent: Number(s.match(/^PPid:\s+(\d+)/m)[1]) }]; } catch { return []; }
  });
  const ids = new Set([parent]); let count;
  do { count = ids.size; for (const r of rows) if (ids.has(r.parent)) ids.add(r.pid); } while (count !== ids.size);
  return [...ids];
}
function alive(pid) {
  try { return !/^State:\s+Z/m.test(fs.readFileSync('/proc/' + pid + '/status', 'utf8')); } catch { return false; }
}
async function get(origin, pathname, expected = 200, type) {
  const r = await fetch(origin + pathname, { signal: AbortSignal.timeout(15000) });
  assert.equal(r.status, expected, pathname);
  if (type) assert.match(r.headers.get('content-type') || '', type, pathname);
  return r;
}
async function ready(origin, pathname, p, log) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (p.exitCode !== null || p.signalCode !== null) throw Error('child exited: ' + log());
    try { const r = await fetch(origin + pathname, { signal: AbortSignal.timeout(700) }); if (r.status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('readiness deadline: ' + log());
}
try {
  for (const mode of (process.env.APS_HOSTING_LIFECYCLE_ONLY ? ['dev'] : ['prod', 'dev'])) {
    const port = mode === 'prod' ? 4318 : 4328;
    const prefix = mode === 'prod' ? base : base + 'dev/';
    const origin = 'http://127.0.0.1:' + port;
    // Prod edge strips the base. Dev edge passes /dev/ untouched to real Vite.
    const route = p => mode === 'prod' ? '/' + p.slice(base.length) : p;
    globalThis.__PRAETOR_APP_BASE__ = prefix;
    const env = { ...process.env, NODE_ENV: mode === 'prod' ? 'production' : 'development', API_PORT: String(mode === 'prod' ? port : 4329), PRAETOR_DEV_VITE_PORT: '4328', PRAETOR_APP_DATA_DIR: path.resolve('validation-state'), PRAETOR_APP_UPLOADS_DIR: path.resolve('validation-uploads') };
    const p = spawn('npm', ['run', mode === 'prod' ? 'start' : 'dev'], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(p); result.childPids.push(p.pid);
    let logs = ''; p.stdout.on('data', b => { logs += b; }); p.stderr.on('data', b => { logs += b; });
    await ready(origin, route(appPath('/api/health')), p, () => logs);
    check(mode + ': official SDK API port ready');
    if (process.env.APS_HOSTING_LIFECYCLE_ONLY) {
      const owned = descendants(p.pid); result.ownedAtReady = owned;
      check('dev: real Vite/API process tree captured', owned.length >= 5);
      await cleanup(); await freePort(4328); await freePort(4329);
      const born = Date.now();
      while (owned.some(alive) && Date.now() - born < 5000) await new Promise(resolve => setTimeout(resolve, 100));
      check('dev: npm stop releases every descendant process', !owned.some(alive));
      check('dev: no V8/worker OOM in lifecycle logs', !/heap out of memory|FATAL ERROR:|ERR_WORKER_OUT_OF_MEMORY/.test(logs));
      fs.writeFileSync(path.resolve('../hosting-dev-lifecycle.log'), logs);
      result.modes.push({ mode, base: prefix, ports: [4328, 4329], lifecycleOnly: true });
      continue;
    }
    const html = await (await get(origin, route(prefix), 200, /text\/html/)).text();
    check(mode + ': injected runtime base', html.includes(JSON.stringify(prefix)));
    const nested = await (await get(origin, route(prefix + 'workspace/reopen'), 200, /text\/html/)).text();
    check(mode + ': nested SPA fallback', nested.includes('id="root"'));
    const assets = [...html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css)(?:\?[^\"]*)?)"/g)].map(m => m[1]);
    if (mode === 'prod') {
      check('prod: initial compiled assets exist', assets.length >= 2);
      for (const asset of assets) {
        check('prod: asset under allocated base ' + asset, asset.startsWith(prefix));
        await (await get(origin, route(asset), 200, asset.includes('.css') ? /text\/css/ : /javascript/)).arrayBuffer();
      }
    } else {
      const modules = ['@vite/client', 'src/main.tsx', 'src/App.tsx', 'src/praetor-bridge.ts', 'src/app-path.ts', 'src/QueryReports.tsx', 'src/EquipmentSchedule.tsx', 'src/InputData.tsx', 'src/ParameterPanel.tsx', 'src/WorkbookImportCards.tsx'];
      for (const module of modules) await (await get(origin, prefix + module, 200, /javascript/)).text();
      await (await get(origin, prefix + 'src/index.css', 200, /(?:javascript|css)/)).text();
      check('dev: real Vite transforms entry and every changed UI module');
      check('dev: HTML module script respects base', html.includes(prefix + 'src/main.tsx'));
    }
    const unknown = await (await get(origin, route(appPath('/api/hosting-not-found')), 404, /application\/json/)).json();
    check(mode + ': unknown API stays JSON', unknown.error === 'unsupported_action');
    const identities = [];
    for (const run of accepted) {
      const q = { datasetId: run.datasetId, version: run.version, runId: run.id };
      const endpoint = appPath('/api/workbooks/query-reports/context?request=' + encodeURIComponent(JSON.stringify(q)));
      const context = await (await get(origin, route(endpoint), 200, /application\/json/)).json();
      const identity = context.identity;
      for (const k of ['inputHash', 'resultHash']) assert.equal(identity[k], run[k]);
      for (const k of ['mappingHash', 'parameterHash', 'fileHash']) assert.equal(identity[k], run.result.source[k]);
      assert.equal(identity.version, run.version); assert.equal(identity.runId, run.id);
      identities.push(identity);
    }
    check(mode + ': both accepted run/version/hash identities survive prefixed API');
    const query = { identity: identities[0], view: 'demand.customers', fromDate: '2026-11-01', toDateInclusive: '2026-11-14', pageSize: 100, filters: {}, sort: 'id', direction: 'asc', chunkOffset: 0 };
    const url = (kind, q) => route(appPath('/api/workbooks/query-reports/' + kind + '?request=' + encodeURIComponent(JSON.stringify(q))));
    const page = await (await get(origin, url('query', query), 200, /application\/json/)).json();
    check(mode + ': limited prefixed query returns same run', page.identity.inputHash === accepted.find(r => r.id === identities[0].runId).inputHash);
    assert(page.records.length > 0);
    const exportResponse = await get(origin, url('export', { ...query, queryFingerprint: page.queryFingerprint, scope: 'SELECTED', ids: [page.records[0].id] }), 200, /(?:ndjson|json|octet-stream)/);
    const lines = (await exportResponse.text()).trim().split('\n').map(s => JSON.parse(s));
    check(mode + ': anchor export retains fingerprint and selected record', lines[0].fingerprint === page.queryFingerprint && lines.filter(x => x.kind === 'record').length === 1 && lines.at(-1).complete === true);
    await (await get(origin, route(appPath('/api/workbooks/business/template')), 200, /spreadsheetml/)).arrayBuffer();
    await (await get(origin, route(appPath('/api/workbooks/parameters/template')), 200, /spreadsheetml/)).arrayBuffer();
    check(mode + ': both direct template anchors download XLSX');
    if (mode === 'dev') {
      const r = await get(origin, route(appPath('/api/workbooks/datasets/' + accepted[0].datasetId + '/source?version=' + accepted[0].version)), 200, /spreadsheetml/);
      const hash = createHash('sha256'); for await (const chunk of r.body) hash.update(chunk);
      check('dev: source download anchor preserves original XLSX hash', hash.digest('hex') === accepted[0].result.source.fileHash);
      await (await get(origin, prefix + 'fr036/matrix.json', 200, /application\/json/)).json();
      check('dev: public reference download follows base');
    }
    result.modes.push({ mode, base: prefix, ports: mode === 'prod' ? [4318] : [4328, 4329], identities, assetCount: assets.length });
    await cleanup();
    await freePort(port); if (mode === 'dev') await freePort(4329);
    check(mode + ': npm lifecycle released all application listening ports');
    check(mode + ': no V8/worker OOM in logs', !/heap out of memory|FATAL ERROR:|ERR_WORKER_OUT_OF_MEMORY/.test(logs));
    fs.writeFileSync(path.resolve('../hosting-' + mode + '.log'), logs);
  }
  result.status = 'PASS_LOCAL_PATHS_NOT_BROWSER_UI';
} catch (e) {
  result.status = 'FAIL'; result.error = e.stack; throw e;
} finally {
  await cleanup(); clearTimeout(deadline); clearInterval(resourceWatch);
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, checks: result.checks.length, error: result.error }));
}
