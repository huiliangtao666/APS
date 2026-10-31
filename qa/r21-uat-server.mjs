// Deliberate QA entry point; production server/index.mjs never imports this.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { createBusinessRouter } from '../server/business.mjs';
import {partialR21Seed} from '../src/lib/r21-stage-config.mjs';
import {createHash} from 'node:crypto';
import { seed } from '../server/planner.ts';
export async function startR21Uat({ dataDir, port = 0, browser = false, isolated = false, host = '127.0.0.1' } = {}) {
  if (!isolated || process.env.NODE_ENV === 'production') throw Error('explicit_isolated_nonproduction_uat_required');
  const dir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'aps-r21-uat-'));
  fs.mkdirSync(dir, { recursive: true });
  const marker = path.join(dir, 'R21-UAT-ISOLATED.json');
  if (!fs.existsSync(marker) && fs.readdirSync(dir).length) throw Error('uat_requires_empty_or_marked_data_directory');
  fs.writeFileSync(marker, JSON.stringify({ scope: 'isolated-uat-only', identity: 'synthetic; no account control', customerIdentityVerified: false }));
  if (!fs.existsSync(path.join(dir, 'business.json'))) {
    const data = structuredClone(seed);
    for (const row of data.orders) for (const field of ['是否允许拆分', '需求类型', '订单状态']) row[field] = '';
    fs.writeFileSync(path.join(dir, 'business.json'), JSON.stringify({ data, revision: 0, plans: [], records: [] }), { mode: 0o600 });
  }
  const app = express(); app.use(express.json({ limit: '2mb' }));
  const actor = (req, _res, next) => { req.praetorActor = { kind: 'user', issuer: 'r21-isolated-uat', sub: 'synthetic-planner', requestId: 'r21-uat' }; req.r21Actor = 'synthetic-planner'; next(); };
  const member = () => (req, _res, next) => { req.member = { role: 'planner', canExport: true }; next(); };
  app.get('/api/auth/me', (_req, res) => res.json({ state: 'member', subject: 'r21-isolated-uat#synthetic-planner', role: 'planner', name: '隔离模拟操作人（非真实身份）' }));
  let url;
  async function call(endpoint, body) {
    const r = await fetch(url + '/api' + endpoint, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const x = await r.json(); if (!r.ok) throw Object.assign(Error(x.error), { status: r.status, body: x }); return x;
  }
  app.use('/api', createBusinessRouter({ dataDir: dir, actorMiddleware: actor, requireMember: member }));
  app.get('/api/uat-build', (_req,res) => {const state=JSON.parse(fs.readFileSync(path.join(dir,'business.json'),'utf8'));const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');res.json({productSha:process.env.B1_BUILD_SHA||null,environment:'B1 isolated UAT candidate',formalAccountRequired:false,identity:'synthetic-planner; not customer SSO',requirements:['APS-BL-001-v0.3','CR-FR013-VALIDATION-20261029','CR-R21-UAT02-20261031'],inputRevision:state.revision,dataFingerprint:hash(state.data),configFingerprint:hash(state.r21?.config||partialR21Seed()),node:process.version});});
  if(process.env.B1_UAT_FIXTURES)app.use('/fixtures',express.static(process.env.B1_UAT_FIXTURES,{index:false,dotfiles:'deny'}));
  if (browser) {
    const { build } = await import('vite');
    const react = (await import('@vitejs/plugin-react')).default;
    const root = fileURLToPath(new URL('..', import.meta.url)), dist = fs.mkdtempSync(path.join(os.tmpdir(), 'r21-uat-ui-'));
    await build({ configFile: false, root, base: '/', plugins: [react()], resolve: { alias: [{ find: /^@praetor\/lite-app-runtime$/, replacement: fileURLToPath(new URL('./fr033-integration-runtime.mjs', import.meta.url)) }] }, build: { outDir: dist, emptyOutDir: true, rollupOptions: { input: path.join(root, 'qa/r21-uat.html') } } });
    app.use(express.static(dist)); app.get('*', (_req, res) => res.sendFile(path.join(dist, 'qa/r21-uat.html')));
  }
  app.use((e, _req, res, _next) => res.status(500).json({ error: e.message }));
  const server = app.listen(port, host); await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  url = `http://127.0.0.1:${server.address().port}`;
  return { app, server, url, dir, call, close: () => new Promise(resolve => server.close(resolve)) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const f = await startR21Uat({ isolated: process.env.APS_R21_UAT_ISOLATED === '1', dataDir: process.env.R21_UAT_DATA_DIR, port: Number(process.env.PORT || 0), browser: true, host: process.env.B1_UAT_HOST || '127.0.0.1' });
  console.log(JSON.stringify({ url: f.url, dataDir: f.dir, identity: 'isolated synthetic operator', formalAccountRequired: false }));
}
