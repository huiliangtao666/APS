// Supplemental component integration check. Run in disposable validation only;
// see docs/FR-011-HANDOFF.md. No real browser, API or persistence is contacted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { create, act } from 'react-test-renderer';
import App from '../.qa-app.mjs';
let stored = '', plans = [], exported;
globalThis.localStorage = { getItem: () => stored || null, setItem: (_k, v) => { stored = v; } };
globalThis.fetch = async (_url, options) => {
  if (options?.method === 'POST') plans = [JSON.parse(options.body)];
  return { ok: true, json: async () => plans };
};
globalThis.document = { createElement: () => ({ click() {} }) };
URL.createObjectURL = blob => { exported = blob; return 'blob:qa'; };
URL.revokeObjectURL = () => {};
let root;
await act(async () => { root = create(React.createElement(App)); });
const data = JSON.parse(stored);
await act(async () => { root.unmount(); });
const csv = file => fs.readFileSync(new URL('../docs/samples/fr011/' + file, import.meta.url), 'utf8');
const click = async text => {
  const button = root.root.findAllByType('button').find(b => b.children[0] === text);
  assert.ok(button, text);
  await act(async () => { await button.props.onClick(); });
};
const upload = async file => {
  const input = root.root.findAllByType('input').find(n => n.props.type === 'file');
  await act(async () => { await input.props.onChange({target:{files:[{text:async()=>file}]}}); });
};
stored = JSON.stringify(data);
await act(async () => { root = create(React.createElement(App)); });
await click('数据与 CSV');
for (const [tab, file] of [['预计到料','20_预计到料.csv'],['延期模拟记录','21_延期模拟记录.csv'],['计划供给引用','22_计划供给引用.csv']]) {
  await click(tab); await upload(csv(file));
}
const imported = JSON.parse(stored);
assert.equal(imported.supplyDelays.length,1);
assert.equal(imported.supplyUses.length,1);
await upload(csv('22_计划供给引用.csv').replace('SUP-001,40','MISSING,40'));
assert.deepEqual(JSON.parse(stored).supplyUses, imported.supplyUses);
await click('排程工作台'); await click('计算排程'); await click('保存快照');
assert.equal(plans[0].tasks.find(t=>t.id==='A-MIX').start,180);
assert.equal(plans[0].supplyConditions.length,1);
assert.match(plans[0].supplyConditions[0]['条件说明'],/条件性供给/);
assert.deepEqual(JSON.parse(stored).inventory,data.inventory);
await click('导出 CSV'); assert.match(await exported.text(),/条件性供给/);
await act(async () => { root.unmount(); root=create(React.createElement(App)); });
assert.match(JSON.stringify(root.toJSON()),/条件性供给/);
await click('数据与 CSV');await click('延期模拟记录');
const edit=root.root.findAllByType('input').find(n=>n.props['aria-label']==='延期模拟记录 1 调整后可用时间');
await act(async()=>edit.props.onChange({target:{value:'2026-11-02T12:00:00+08:00'}}));
await click('排程工作台');
assert.match(JSON.stringify(root.toJSON()),/当前方案是旧快照/);
await click('计算排程');await click('保存快照');
assert.equal(plans[0].tasks.find(t=>t.id==='A-MIX').start,240);
await click('数据与 CSV');await click('预计到料');
const quantity=root.root.findAllByType('input').find(n=>n.props['aria-label']==='预计到料 1 预计数量');
await act(async()=>quantity.props.onChange({target:{value:'30'}}));
await click('排程工作台');await click('计算排程');await click('保存快照');
assert.equal(plans[0].tasks.length,0);
assert.ok(plans[0].findings.some(f=>f.code==='SUPPLY_OVERALLOCATED'));
await act(async()=>root.unmount());
console.log('FR-011 component integration: PASS (CSV import/rejection, availability scheduling, snapshot save/reload, export, stale input, oversubscription, inventory unchanged)');
