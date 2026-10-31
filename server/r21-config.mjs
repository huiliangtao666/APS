import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { partialR21Seed, validateR21Config, configuredR21Orders, r21DeviceUsage } from '../src/lib/r21-stage-config.mjs';
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function openR21Config(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'r21-config.json');
  const read = () => { try { const s = JSON.parse(fs.readFileSync(file, 'utf8')); if (validateR21Config(s.config).length || !Array.isArray(s.history) || !Array.isArray(s.applications)) throw Error('corrupt_r21_config'); return s; } catch (e) { if (e.code !== 'ENOENT') throw e; return { config: partialR21Seed(), history: [], applications: [] }; } };
  const write = s => { const tmp = `${file}.${randomUUID()}.tmp`; try { fs.writeFileSync(tmp, JSON.stringify(s), { mode: 0o600, flag: 'wx' }); fs.renameSync(tmp, file); } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } };
  return { read, write, file };
}
// Caller supplies the same authorization middleware as its business API.
// QA synthetic identity is supplied only by qa/r21-uat-server.mjs.
export function createR21ConfigRouter({ dataDir, authorize, readInput, saveOrders, integratedStore, applyTransaction }) {
  if (typeof authorize !== 'function' || typeof readInput !== 'function' || typeof saveOrders !== 'function') throw Error('r21_integration_callbacks_required');
  const store = integratedStore || openR21Config(dataDir), router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authorize);
  router.use((req, res, next) => {
    if (req.method !== 'GET') {
      let bad = false; try { if (req.get('origin')) bad = new URL(req.get('origin')).host !== req.get('host'); } catch { bad = true; }
      if (bad || req.get('sec-fetch-site') && !['same-origin', 'none'].includes(req.get('sec-fetch-site'))) return res.status(403).json({ error: 'csrf' });
      if (typeof req.body?.reason !== 'string' || !req.body.reason.trim() || req.body.reason.length > 1000) return res.status(400).json({ error: 'reason_required' });
    }
    next();
  });
  const view = s => ({ ...s, fingerprint: hash(s.config), validation: validateR21Config(s.config, { complete: true }), notice: '模拟/用户提供的值均非系统验证的客户事实；缺项阻止应用。配置不会自动覆盖已保存方案。' });
  router.get('/config', (_req, res, next) => { try { res.json(view(store.read())); } catch (e) { next(e); } });
  router.post('/config', (req, res, next) => {
    try {
      const before = store.read();
      if (req.body.revision !== before.config.revision) return res.status(409).json({ error: 'stale_r21_config' });
      const config = { contract: 'R21-config-v1', revision: before.config.revision + 1, values: req.body.values };
      const issues = validateR21Config(config);
      if (issues.length) return res.status(400).json({ error: 'invalid_r21_config', issues });
      const after = { ...before, config, history: [...before.history, { before: before.config, after: config, at: new Date().toISOString(), reason: req.body.reason.trim(), actor: req.r21Actor || 'authorized-caller' }] };
      store.write(after, req); res.json(view(after));
    } catch (e) { next(e); }
  });
  router.post('/apply', async (req, res, next) => {
    try {
      const snapshot = store.read(), config = snapshot.config;
      if (req.body.configRevision !== config.revision) return res.status(409).json({ error: 'stale_r21_config' });
      const input = await readInput();
      if (req.body.inputRevision !== input.revision) return res.status(409).json({ error: 'stale_input' });
      const proposed = configuredR21Orders(input.data.orders, config);
      if (!proposed.valid) return res.status(400).json({ error: 'incomplete_r21_config', issues: proposed.issues });
      // Callback MUST use the normal validated business save, never direct store writes.
      if (applyTransaction) {
        const result = applyTransaction({ req, input, config, proposed });
        return res.status(result.status).json(result.body);
      }
      const saved = await saveOrders({ revision: input.revision, orders: proposed.orders, reason: req.body.reason });
      const state = store.read();
      const application = { id: randomUUID(), config: structuredClone(config), configFingerprint: hash(config), beforeInputRevision: input.revision, afterInputRevision: saved.revision, inputVersionId: saved.inputVersionId, at: new Date().toISOString(), reason: req.body.reason.trim(), actor: req.r21Actor || 'authorized-caller' };
      store.write({ ...state, applications: [...state.applications, application] });
      res.json({ application, saved });
    } catch (e) { if (e.status) return res.status(e.status).json(e.body); next(e); }
  });
  router.get('/devices', async (_req, res, next) => { try { const input = await readInput(); res.json({ revision: input.revision, devices: r21DeviceUsage(input.data, input.csvSources?.machines) }); } catch (e) { next(e); } });
  return router;
}
