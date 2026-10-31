import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startR21Uat } from './r21-uat-server.mjs';
import { stageInput } from './issue6-stage-input.mjs';
const E = process.env.R21_EVIDENCE_DIR;
if (!E) throw Error('R21_EVIDENCE_DIR required');
fs.mkdirSync(E, { recursive: true });
const dump = (n, x) => fs.writeFileSync(path.join(E, n), typeof x === 'string' ? x : JSON.stringify(x, null, 2));
const f = await startR21Uat({ isolated: true, browser: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), results = [], errors = [], network = [];
page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e)));
page.on('response', async r => { if (r.url().includes('/api/')) network.push({ url: r.url(), status: r.status() }); });
const reason = 'R21 browser self-test, all values simulated';
try {
  await page.goto(f.url);
  const panel = page.getByRole('region', { name: 'R2.1 六项配置', exact: true });
  await panel.getByLabel('A 是否允许拆分', { exact: true }).waitFor();
  assert.equal(await panel.getByLabel('A 是否允许拆分', { exact: true }).inputValue(), '否');
  assert.equal(await panel.getByLabel('B 需求类型', { exact: true }).inputValue(), '正式订单');
  for (const [id, field] of [['A', '需求类型'], ['A', '订单状态'], ['B', '是否允许拆分'], ['B', '订单状态']]) assert.equal(await panel.getByLabel(`${id} ${field}`, { exact: true }).inputValue(), '');
  assert.equal(await panel.getByRole('button', { name: '应用到当前输入', exact: true }).isDisabled(), true);
  const initial = await f.call('/state'); assert.ok(initial.data.orders.every(o => ['是否允许拆分', '需求类型', '订单状态'].every(k => o[k] === '')));
  await page.screenshot({ path: E + '/ui-01-partial-seed.png', fullPage: true });
  results.push({ id: 'UI-PARTIAL-SEED', result: 'PASS', seedCount: 2, unknownCount: 4 });
  for (const id of ['A', 'B']) for (const [field, value] of Object.entries({ '是否允许拆分': '否', '需求类型': '正式订单', '订单状态': '有效' })) {
    await panel.getByLabel(`${id} ${field}`, { exact: true }).selectOption(value);
    await panel.getByLabel(`${id} ${field} 来源说明`, { exact: true }).fill(`模拟场景 ${id} ${field}，非客户事实`);
    await panel.getByLabel(`${id} ${field} 来源版本`, { exact: true }).fill('browser-v1');
  }
  await panel.getByRole('button', { name: '保存六项配置', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: '配置已保存' }).waitFor();
  await page.reload();
  await panel.getByLabel('B 订单状态', { exact: true }).waitFor();
  assert.equal(await panel.getByLabel('B 订单状态 来源说明', { exact: true }).inputValue(), '模拟场景 B 订单状态，非客户事实');
  await page.screenshot({ path: E + '/ui-02-saved-reopened.png', fullPage: true });
  results.push({ id: 'UI-SIX-SOURCE-SAVE-REOPEN', result: 'PASS' });
  await panel.getByRole('button', { name: '应用到当前输入', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: '已应用到当前输入' }).waitFor();
  // Exercise complete original stage data first: collect the actual integration gap.
  const original = stageInput(process.env.ISSUE6_INPUT_DIR), blocked = await fetch(f.url + '/api/imports/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: (await f.call('/state')).revision, files: original.files, repairs: original.repairs, reason }) });
  const originalPreview = await blocked.json(); assert.equal(originalPreview.valid, false); dump('ui-original03-BLOCKED.json', originalPreview);
  results.push({ id: 'UI-FULL-ORIGINAL03', result: 'BLOCKED', reason: 'shared business validator awaiting integration' });
  // Explicit applicable-machine fixture: not full original03 acceptance.
  const slice = stageInput(process.env.ISSUE6_INPUT_DIR, { selectApplicableMachines: true });
  const pre = await f.call('/imports/preview', { revision: (await f.call('/state')).revision, files: slice.files, repairs: slice.repairs, reason }); assert.equal(pre.valid, true);
  await f.call('/imports/commit', { previewId: pre.id, reason });
  // Use the new config module on actual imported A/B, preserving old fixture selection as provenance.
  const state = await f.call('/state'), cfg = await f.call('/r21/config');
  await f.call('/r21/apply', { configRevision: cfg.config.revision, inputRevision: state.revision, reason });
  await page.reload(); await page.getByLabel('操作原因', { exact: true }).fill(reason);
  await page.getByRole('button', { name: '同步计算全部（无取消）', exact: true }).click();
  await page.getByText('当前方案运行编号：', { exact: false }).waitFor();
  const plan = (await f.call('/plans'))[0]; assert.equal(plan.tasks.find(t => t.id === 'B-MIX').start, 15);
  await page.getByRole('button', { name: '独立复核', exact: true }).click();
  await page.locator('.verification-check.pass').filter({ hasText: '工厂日历 / 设备停机' }).waitFor();
  await page.screenshot({ path: E + '/ui-03-configured-main15.png', fullPage: true });
  results.push({ id: 'UI-CONFIG-APPLY-CALCULATE-VERIFY', result: 'PASS', scope: 'explicit applicable-machine fixture', planId: plan.id });
  // A single-field change is independent of the other five values and sources.
  const before = (await f.call('/r21/config')).config;
  await panel.getByLabel('B 需求类型', { exact: true }).selectOption('预测');
  await panel.getByLabel('B 需求类型 来源版本', { exact: true }).fill('browser-v2');
  await panel.getByRole('button', { name: '保存六项配置', exact: true }).click(); await panel.getByRole('status').filter({ hasText: '配置已保存' }).waitFor();
  const after = (await f.call('/r21/config')).config;
  for (const id of ['A', 'B']) for (const field of Object.keys(before.values[id])) if (id !== 'B' || field !== '需求类型') assert.deepEqual(after.values[id][field], before.values[id][field]);
  await panel.getByRole('button', { name: '应用到当前输入', exact: true }).click(); await panel.getByRole('status').filter({ hasText: '已应用到当前输入' }).waitFor();
  await page.reload(); await page.getByLabel('操作原因', { exact: true }).fill(reason);
  await page.getByRole('button', { name: '同步计算全部（无取消）', exact: true }).click();
  await page.getByText('当前方案运行编号：', { exact: false }).waitFor();
  const latest = (await f.call('/plans'))[0]; assert.ok(latest.tasks.every(t => t.orderId === 'A')); assert.deepEqual(latest.conditions.orderIds, ['A']);
  const old = (await f.call('/plans')).find(p => p.id === plan.id); assert.deepEqual(old.tasks, plan.tasks); assert.equal(old.inputSnapshot.orders.find(o => o['订单编号'] === 'B')['需求类型'], '正式订单');
  await page.getByRole('button', { name: '保存快照', exact: true }).click(); await page.reload();
  await page.getByLabel('已保存方案', { exact: true }).selectOption(latest.id);
  await page.getByLabel('操作原因', { exact: true }).fill(reason);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 CSV', exact: true }).click(); await (await download).saveAs(E + '/ui-export.csv');
  await page.screenshot({ path: E + '/ui-04-changed-forecast-reopened.png', fullPage: true });
  results.push({ id: 'UI-INDEPENDENT-CHANGE-NEW-RUN-OLD-FROZEN-EXPORT', result: 'PASS', oldPlanId: old.id, newPlanId: latest.id });
  dump('ui-config-ledger.json', await f.call('/r21/config')); dump('ui-store.json', JSON.parse(fs.readFileSync(path.join(f.dir, 'business.json'), 'utf8')));
  dump('ui-page.txt', await page.locator('body').innerText()); assert.deepEqual(errors, []);
} finally {
  dump('ui-results.json', results); dump('ui-network.json', network); dump('ui-runtime.json', { node: process.version, browser: browser.version(), identity: 'isolated synthetic planner; no account/member enrollment', errors });
  await browser.close(); await f.close();
}
