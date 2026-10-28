import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createLiteAppServer } from '@praetor/lite-app-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { app, listen, dataDir } = createLiteAppServer({
  port: 3000,
  apiPort: 3001,
  distDir: path.join(__dirname, '..', 'dist'),
});
const planFile = path.join(dataDir, 'plans.json');
app.use(express.json({ limit: '2mb' }));

async function readPlans() {
  try { return JSON.parse(await fs.readFile(planFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

app.get('/api/plans', async (_req, res) => {
  try { res.json(await readPlans()); }
  catch { res.status(500).json({ error: '无法读取排程快照' }); }
});

app.post('/api/plans', async (req, res) => {
  const plan = req.body;
  if (!plan || typeof plan.id !== 'string' || !Array.isArray(plan.tasks) || !Array.isArray(plan.findings)) {
    return res.status(400).json({ error: '方案必须包含 id、tasks 和 findings' });
  }
  try {
    const plans = await readPlans();
    const next = [plan, ...plans.filter(item => item.id !== plan.id)].slice(0, 100);
    await fs.writeFile(planFile, JSON.stringify(next, null, 2));
    res.status(201).json(plan);
  } catch { res.status(500).json({ error: '无法保存排程快照' }); }
});

app.get('/api/meta', (_req, res) => res.json({
  release: 'R1 prototype',
  baseline: 'APS v0.3 review draft',
  supportedRules: ['BR-02 precedence', 'BR-03 exclusive machine overlap'],
  timeOrigin: '2026-11-02T08:00:00+08:00',
  interval: '[start,end)',
}));

listen();
