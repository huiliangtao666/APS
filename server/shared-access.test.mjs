import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createBusinessRouter } from './business.mjs';

async function fixture(context) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-shared-'));
  const app = express();
  app.use(express.json());
  app.use('/api', createBusinessRouter({ dataDir, accessMode: 'shared' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return async (route, body, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify({ reason: 'shared regression', ...body }) }),
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { result = text; }
    return { status: response.status, body: result };
  };
}

test('shared workbench opens and calculates, saves, verifies and exports without credentials', async context => {
  const call = await fixture(context);
  const session = await call('/session');
  assert.equal(session.status, 200);
  assert.equal(session.body.accessMode, 'shared');
  assert.equal(session.body.canWrite, true);
  assert.equal(session.body.canExport, true);
  const state = await call('/state');
  assert.equal(state.status, 200);
  const calculation = await call('/calculate', { revision: state.body.revision, actor: 'forged-user', role: 'query' });
  assert.equal(calculation.status, 201);
  assert.ok(calculation.body.tasks.length > 0);
  const planId = calculation.body.id;
  assert.equal((await call('/plans', { id: planId })).status, 201);
  assert.equal((await call(`/plans/${planId}/verify`, {})).status, 200);
  assert.equal((await call('/export', { planId })).status, 200);
  const records = (await call('/operations')).body;
  assert.ok(records.length > 0);
  assert.ok(records.every(record => record.actor === 'shared-workbench' && record.requestId));
  assert.equal((await call('/auth/me')).status, 404);
});

test('shared access still rejects cross-site writes, missing reasons and stale revisions', async context => {
  const call = await fixture(context);
  assert.equal((await call('/calculate', { revision: 0 }, { origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await call('/calculate', { revision: 0 }, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await call('/calculate', { revision: 0, reason: '' })).status, 400);
  assert.equal((await call('/calculate', { revision: -1 })).status, 409);
  assert.deepEqual((await call('/operations')).body, []);
});
