import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProcessConfig } from './process-config.mjs';

const products = [{'产品编号':'P1'}];
const orders = [{'订单编号':'O1','产品编号':'P1'}];
const routes = [
  {'产品编号':'P1','工序编号':'OP-C','工序名称':'步骤C','前序工序':'OP-B'},
  {'产品编号':'P1','工序编号':'OP-A','工序名称':'步骤A','前序工序':''},
  {'产品编号':'P1','工序编号':'OP-B','工序名称':'步骤B','前序工序':'OP-A'},
];
const times = routes.map(row => ({'产品编号':'P1','工序编号':row['工序编号'],'计算方式':'固定','固定分钟':'12'}));
const deps = ['设备','模具','工具','人员技能','空间','投料'].map((type, i) => ({'订单编号':'O1','工序编号':routes[i % routes.length]['工序编号'],'资源类型':type,'资源编号':`R${i}`}));
const base = { products, orders, routes, times, dependencies:deps, machines:[{'设备编号':'R0'}], materials:[{'物料编号':'R5'}] };

test('FR-004 accepts arbitrary route IDs and configurable precedence independent of CSV row order', () => {
  assert.deepEqual(validateProcessConfig(base), []);
});

test('FR-004 validates missing, duplicate, dangling, and cyclic route configuration', () => {
  const issues = validateProcessConfig({...base, routes:[
    ...routes,
    {'产品编号':'P1','工序编号':'OP-A','工序名称':'重复','前序工序':''},
    {'产品编号':'P1','工序编号':'OP-D','工序名称':'步骤D','前序工序':'MISSING'},
    {'产品编号':'P1','工序编号':'OP-E','工序名称':'步骤E','前序工序':'OP-F'},
    {'产品编号':'P1','工序编号':'OP-F','工序名称':'步骤F','前序工序':'OP-E'},
    {'产品编号':'P1','工序编号':'','工序名称':'空编号','前序工序':''},
  ]});
  assert.ok(issues.some(x => x.code === 'INPUT / ROUTE_DUPLICATE'));
  assert.ok(issues.some(x => x.code === 'INPUT / ROUTE_PREDECESSOR'));
  assert.ok(issues.some(x => x.code === 'INPUT / ROUTE_CYCLE'));
  assert.ok(issues.some(x => x.code === 'INPUT / ROUTE_REQUIRED'));
});

test('FR-004 requires one valid fixed duration configuration per route operation', () => {
  const issues = validateProcessConfig({...base, times:[{...times[0], '固定分钟':'0'}, {...times[2], '计算方式':'速度'}]});
  assert.ok(issues.some(x => x.code === 'INPUT / PROCESS_TIME_MISSING' && x.message.includes('OP-A')));
  assert.ok(issues.some(x => x.code === 'INPUT / PROCESS_TIME_INVALID' && x.message.includes('OP-B')));
  assert.ok(issues.some(x => x.code === 'INPUT / PROCESS_TIME_INVALID' && x.message.includes('OP-C')));
});

test('FR-004 validates dependency identifiers and references without inferring non-equipment resource semantics', () => {
  const issues = validateProcessConfig({...base, dependencies:[
    ...deps,
    {'订单编号':'O1','工序编号':'OP-A','资源类型':'设备','资源编号':'UNKNOWN'},
    {'订单编号':'O1','工序编号':'OP-A','资源类型':'模具','资源编号':''},
    {'订单编号':'O1','工序编号':'NOPE','资源类型':'空间','资源编号':'S1'},
    {'订单编号':'O1','工序编号':'OP-A','资源类型':'不明','资源编号':'X'},
  ]});
  assert.ok(issues.some(x => x.code === 'INPUT / DEPENDENCY_REFERENCE'));
  assert.ok(issues.some(x => x.code === 'INPUT / DEPENDENCY_ID'));
  assert.ok(issues.some(x => x.code === 'INPUT / DEPENDENCY_OPERATION'));
  assert.ok(issues.some(x => x.code === 'INPUT / DEPENDENCY_TYPE'));
  assert.deepEqual(issues.filter(x => x.code === 'INPUT / DEPENDENCY_REFERENCE' && x.message.includes('R1')), []);
});
