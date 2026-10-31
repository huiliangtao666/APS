import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { partialR21Seed, validateR21Config, configuredR21Orders, r21DevicePolicy, r21DeviceUsage } from '../src/lib/r21-stage-config.mjs';
import { openR21Config, createR21ConfigRouter } from '../server/r21-config.mjs';
import { startR21Uat } from './r21-uat-server.mjs';
import { seed, defs } from '../server/planner.ts';
import { inspectCsvBatch } from '../server/csv-batch.mjs';
import { validateInputs } from '../server/input-validation.mjs';
import { stageInput } from './issue6-stage-input.mjs';
const dump = (name, data) => { if (process.env.R21_EVIDENCE_DIR) { fs.mkdirSync(process.env.R21_EVIDENCE_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.R21_EVIDENCE_DIR, name), JSON.stringify(data, null, 2)); } };
export function fullConfig() {
  const c = partialR21Seed();
  for (const id of ['A', 'B']) for (const [field, value] of Object.entries({ '是否允许拆分': '否', '需求类型': '正式订单', '订单状态': '有效' })) c.values[id][field] = { value, source: { kind: 'simulation', reference: `explicit software test ${id}/${field}; 非客户事实`, version: 'test-v1' } };
  return c;
}
async function fixture(t) {
  const f = await startR21Uat({ isolated: true });
  t.after(async () => { await f.close(); fs.rmSync(f.dir, { recursive: true, force: true }); });
  return f;
}
async function request(f, endpoint, body, headers = {}) {
  const r = await fetch(f.url + '/api' + endpoint, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}
const reason = 'R21 task self-test simulation only';
const configBody = c => ({ revision: c.revision, values: c.values, reason });
async function worker(f) {
  const s = await f.call('/state'), r = await f.call('/runs', { revision: s.revision, reason });
  for (let i = 0; i < 500; i++) {
    const run = await f.call('/runs/' + r.id);
    if (['completed', 'partial'].includes(run.status)) return { run, inputs: await f.call('/runs/' + r.id + '/inputs'), plan: (await f.call('/plans')).find(p => p.runId === r.id) };
    if (['failed', 'timed_out', 'cancelled'].includes(run.status)) throw Error(JSON.stringify(run));
    await new Promise(r => setTimeout(r, 10));
  }
  throw Error('worker timeout');
}
test('D02 partial seed contains exactly two simulation values, four unknowns, no customer facts', () => {
  const c = partialR21Seed(), all = Object.values(c.values).flatMap(Object.values);
  assert.equal(all.filter(Boolean).length, 2); assert.equal(all.filter(e => e === null).length, 4);
  assert.ok(all.filter(Boolean).every(e => e.source.kind === 'simulation'));
  assert.deepEqual(validateR21Config(c), []); assert.equal(validateR21Config(c, { complete: true }).length, 4);
  assert.equal(configuredR21Orders(seed.orders, c).valid, false); dump('partial-seed.json', c);
});
test('D02 six independent enums, sources and missing/unknown values; no silent defaults', () => {
  const c = fullConfig(); assert.deepEqual(validateR21Config(c, { complete: true }), []);
  for (const id of ['A', 'B']) for (const field of Object.keys(c.values[id])) {
    for (const value of ['', 'UNKNOWN', 0, false, null]) { const d = structuredClone(c); d.values[id][field].value = value; assert.ok(validateR21Config(d).length, `${id}/${field}/${value}`); }
    const d = structuredClone(c); d.values[id][field] = null; assert.equal(configuredR21Orders(seed.orders, d).valid, false);
    for (const key of ['kind', 'reference', 'version']) { const d = structuredClone(c); d.values[id][field].source[key] = ''; assert.ok(validateR21Config(d).length); }
  }
  const d = structuredClone(c); d.values.C = d.values.A; assert.ok(validateR21Config(d).length);
  const p = configuredR21Orders([...seed.orders, { ...seed.orders[0], '订单编号': 'C' }], c); assert.ok(p.valid); assert.equal(p.orders[2]['订单编号'], 'C');
  assert.equal(configuredR21Orders([...seed.orders, seed.orders[0]], c).valid, false);
});
test('D02 API atomic negative/stale/CSRF/missing source; save and process reopen retain exact six entries', async t => {
  const f = await fixture(t), c = fullConfig();
  const first = await f.call('/r21/config'); assert.equal(first.validation.length, 4);
  assert.equal((await request(f, '/r21/apply', { configRevision: 0, inputRevision: 0, reason })).status, 400);
  const saved = await f.call('/r21/config', configBody(c)); assert.equal(saved.config.revision, 1);
  const bytes = fs.readFileSync(path.join(f.dir, 'r21-config.json'), 'utf8');
  const invalid = structuredClone(saved.config); invalid.values.B['订单状态'].source.reference = '';
  for (const [body, headers, status] of [[configBody(c), {}, 409], [configBody(invalid), {}, 400], [{ ...configBody(saved.config), reason: '' }, {}, 400], [configBody(saved.config), { origin: 'https://elsewhere.invalid' }, 403]]) assert.equal((await request(f, '/r21/config', body, headers)).status, status);
  assert.equal(fs.readFileSync(path.join(f.dir, 'r21-config.json'), 'utf8'), bytes);
  assert.deepEqual(openR21Config(f.dir).read().config, saved.config);
  const second = await startR21Uat({ isolated: true, dataDir: f.dir }); t.after(second.close);
  assert.deepEqual((await second.call('/r21/config')).config, saved.config);
  dump('config-save-reopen.json', { first, saved, reopened: await second.call('/r21/config') });
});
test('D02 apply validates business revision, provenance ledger and new Worker values; frozen old results remain exact', async t => {
  const f = await fixture(t), c = fullConfig();
  await f.call('/inputs', { revision: 0, tables: { orders: structuredClone(seed.orders) }, reason: 'explicit simulated initial history values' });
  const original = await worker(f);
  c.values.B['需求类型'].value = '预测'; c.values.A['是否允许拆分'].value = '是';
  const saved = await f.call('/r21/config', configBody(c)), state = await f.call('/state');
  assert.equal((await request(f, '/r21/apply', { configRevision: 0, inputRevision: state.revision, reason })).status, 409);
  assert.equal((await request(f, '/r21/apply', { configRevision: 1, inputRevision: -1, reason })).status, 409);
  const applied = await f.call('/r21/apply', { configRevision: 1, inputRevision: state.revision, reason });
  assert.equal(applied.application.configFingerprint, saved.fingerprint);
  const next = await worker(f);
  assert.deepEqual(next.run.conditions.orderIds, ['A']); assert.ok(next.plan.tasks.every(t => t.orderId === 'A'));
  assert.equal(next.inputs.originalInput.orders.find(o => o['订单编号'] === 'A')['是否允许拆分'], '是');
  assert.equal(next.inputs.originalInput.orders.find(o => o['订单编号'] === 'B')['需求类型'], '预测');
  assert.deepEqual(await f.call('/runs/' + original.run.id + '/inputs'), original.inputs);
  const v = await f.call('/plans/' + next.plan.id + '/verify', { reason }); assert.equal(v.verification.checks.calendar.status, 'pass');
  const ledger = (await f.call('/r21/config')).applications[0]; assert.equal(ledger.inputVersionId, next.plan.inputVersionId);
  dump('worker-provenance-history.json', { original, applied, next, verification: v, ledger });
});
test('D02 cancellation and forecast are independent per order and affect new Worker selection', async t => {
  const f = await fixture(t), c = fullConfig(); c.values.A['订单状态'].value = '已取消';
  await f.call('/r21/config', configBody(c)); await f.call('/r21/apply', { configRevision: 1, inputRevision: 0, reason });
  const next = await worker(f); assert.deepEqual(next.run.conditions.orderIds, ['B']); assert.ok(next.plan.tasks.every(t => t.orderId === 'B'));
  dump('worker-cancel-A.json', next);
});
test('Q01 isolated path has no member enrollment; production invocation and unknown data directories rejected', async t => {
  await assert.rejects(startR21Uat(), /explicit_isolated/);
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try { await assert.rejects(startR21Uat({ isolated: true }), /explicit_isolated/); } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
  const f = await fixture(t), me = await f.call('/auth/me');
  assert.equal(me.state, 'member'); assert.match(me.subject, /synthetic/); assert.ok(!fs.existsSync(path.join(f.dir, 'members.json')));
  assert.throws(() => createR21ConfigRouter({ dataDir: f.dir }), /callbacks_required/);
  const marker = path.join(f.dir, 'R21-UAT-ISOLATED.json'); fs.unlinkSync(marker); fs.writeFileSync(path.join(f.dir, 'unrelated'), 'existing data');
  await assert.rejects(startR21Uat({ isolated: true, dataDir: f.dir }), /empty_or_marked/);
  dump('isolated-identity.json', { me, formalAccountRequired: false, customerIdentityVerified: false });
});
test('D01 original03 policy preserves all rows and byte-traceable unused devices, filtering no other error', { skip: !process.env.ISSUE6_INPUT_DIR }, () => {
  const { files, repairs } = stageInput(process.env.ISSUE6_INPUT_DIR), inspected = inspectCsvBatch(files, defs, repairs);
  assert.deepEqual(inspected.issues, []); const data = { ...structuredClone(seed), ...inspected.tables };
  const before = JSON.stringify(data), findings = validateInputs(defs, data), policy = r21DevicePolicy(findings, data);
  assert.equal(policy.permitted.length, 4); assert.deepEqual(policy.blocking, []);
  const source = inspected.sources.machines; source.sha256 = createHash('sha256').update(source.originalText).digest('hex');
  const devices = r21DeviceUsage(data, source);
  assert.deepEqual(devices.filter(m => m.usage === 'unused').map(m => m.machineId).sort(), ['COOL01', 'COOL02', 'FILL03', 'HEAT01', 'MIX03', 'PACK01']);
  assert.equal(devices.filter(m => m.usage === 'unused' && !m.operationInStageRoute).length, 4);
  assert.ok(devices.every(m => m.source.sha256 === source.sha256 && m.source.line >= 2 && m.source.originalValues));
  assert.equal(JSON.stringify(data), before);
  const invalid = structuredClone(data); invalid.machines[4]['设备编号'] = invalid.machines[0]['设备编号'];
  assert.ok(r21DevicePolicy(validateInputs(defs, invalid), invalid).blocking.some(f => /DUPLICATE/.test(f.code || '') || /重复/.test(f.message)));
  const bound = structuredClone(data); bound.dependencies.push({ ...bound.dependencies[0], '资源编号': 'HEAT01', '资源类型': '设备' });
  assert.ok(r21DevicePolicy(validateInputs(defs, bound), bound).blocking.length > 0);
  dump('D01-policy-original03.json', { files: files.map(f => ({ name: f.name, sha256: createHash('sha256').update(f.text).digest('hex') })), policy, devices });
});
test('integration gap evidence: unchanged shared business import still blocks original03; this is NOT D01 product PASS', { skip: !process.env.ISSUE6_INPUT_DIR }, async t => {
  const f = await fixture(t), { files, repairs } = stageInput(process.env.ISSUE6_INPUT_DIR);
  const preview = await request(f, '/imports/preview', { revision: 0, files, repairs, reason });
  assert.equal(preview.body.valid, false); assert.equal(preview.body.issues.filter(i => i.code === 'INPUT / MACHINE_OPERATION_REFERENCE').length, 4);
  dump('D01-unwired-import-BLOCKED.json', { assertionResult: 'BLOCKED', category: 'shared integration seam', preview });
});
