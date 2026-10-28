import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectBatch } from './src/csvBatch.ts';

const definitions = [
  { key: 'orders', file: '17_生产订单与交期.csv', fields: ['订单编号','产品编号','产线编号','合格需求kg','要求可交付分钟','优先顺序'] },
  { key: 'routes', file: '10_工艺路线配置.csv', fields: ['产品编号','工序编号','工序名称','前序工序','最大等待分钟','程序编号'] },
  { key: 'times', file: '11_工序工时配置.csv', fields: ['产品编号','工序编号','计算方式','固定分钟','速度支每分钟'] },
  { key: 'machines', file: '03_设备资源配置.csv', fields: ['设备编号','设备名称','产线编号','工序编号','日历编号','最小装载kg','最大装载kg','装载计量基准'] },
  { key: 'dependencies', file: '12_工序资源与物料依赖.csv', fields: ['订单编号','工序编号','资源类型','资源编号','需求数量','提前占用分钟','后延占用分钟','所需技能'] },
  { key: 'rules', file: '16_排程规则配置.csv', fields: ['规则编号','中文名称','是否启用','参数JSON'] },
];

const files = await Promise.all(definitions.map(async d => ({
  name: d.file,
  text: await readFile(new URL(`./sample-data/valid/${d.file}`, import.meta.url), 'utf8'),
})));
const current = Object.fromEntries(definitions.map(d => [d.key, []]));
const cloneFiles = () => files.map(f => ({ ...f }));
const replaceDataRow = (copy, key, from, to) => {
  const target = copy.find(f => f.name === definitions.find(d => d.key === key).file);
  assert.ok(target, `fixture exists for ${key}`);
  assert.ok(target.text.includes(from), `fixture row exists: ${from}`);
  target.text = target.text.replace(from, to);
  return target;
};
const checkIssue = (copy, key, field, expectedRow, reasonPart) => {
  const result = inspectBatch(copy, definitions, current);
  const issue = result.issues.find(i => i.file === definitions.find(d => d.key === key).file && i.field === field && i.reason.includes(reasonPart));
  assert.ok(issue, `expected ${field} issue; got ${JSON.stringify(result.issues)}`);
  if (expectedRow !== undefined) assert.equal(issue.row, expectedRow, `physical CSV line for ${field}`);
  assert.ok(result.issues.length > 0, 'invalid batch is blocked by issues');
};

const valid = inspectBatch(cloneFiles(), definitions, current);
assert.equal(valid.issues.length, 0, `valid six-table fixture: ${JSON.stringify(valid.issues)}`);

let copy = cloneFiles();
replaceDataRow(copy, 'orders', 'A,HC40,L01,240,480,1', 'A,HC40,L01,,480,1');
checkIssue(copy, 'orders', '合格需求kg', 2, '大于 0');

copy = cloneFiles();
replaceDataRow(copy, 'times', 'HC40,MIX,固定,30,120', 'HC40,MIX,固定,,120');
checkIssue(copy, 'times', '固定分钟', 2, '大于 0');

copy = cloneFiles();
replaceDataRow(copy, 'rules', 'MACHINE,机器不重叠,是,{}', 'MACHINE,机器不重叠,,{}');
checkIssue(copy, 'rules', '是否启用', 2, '是”或“否');

copy = cloneFiles();
const routeFile = replaceDataRow(copy, 'routes', 'HC40,MIX,混合,,', 'HC40,MIX,"混\n合",,');
assert.ok(routeFile.text.includes('HC40,FILL,灌装,MIX'));
routeFile.text = routeFile.text.replace('HC40,FILL,灌装,MIX', 'HC40,FILL,灌装,NOPE');
checkIssue(copy, 'routes', '前序工序', 4, '不存在于同产品路线');

console.log('CSV validation regression checks passed: valid six-table batch + CSV-DEF-01..04.');
