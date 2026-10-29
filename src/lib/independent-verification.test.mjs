import test from 'node:test';
import assert from 'node:assert/strict';
import { independentlyVerifyPlan } from './independent-verification.mjs';

const orders = [
  { '订单编号': 'A', '产线编号': 'L01' },
  { '订单编号': 'B', '产线编号': 'L01' },
];
const routes = [
  { '产品编号': 'HC40', '工序编号': 'MIX', '前序工序': '' },
  { '产品编号': 'HC40', '工序编号': 'FILL', '前序工序': 'MIX' },
];
const task = (id, orderId, machine, start, end, predecessor = '') => ({ id, orderId, productId: 'HC40', operation: id.split('-')[1], machine, start, end, predecessor });

test('passes single-line, half-open machine, and precedence checks', () => {
  const report = independentlyVerifyPlan({ id: 'P1', tasks: [
    task('A-MIX', 'A', 'M1', 0, 10), task('A-FILL', 'A', 'M1', 10, 15, 'A-MIX'),
    task('B-MIX', 'B', 'M2', 0, 12),
  ] }, orders, routes, ['MACHINE', 'PRECEDENCE'], '2026-10-28T00:00:00.000Z');
  assert.deepEqual(Object.values(report.checks).map((check) => check.status), ['pass', 'pass', 'pass', 'not_checked']);
});

test('reports multiple lines, machine overlaps, and early successors as problems', () => {
  const report = independentlyVerifyPlan({ id: 'P2', tasks: [
    task('A-MIX', 'A', 'M1', 0, 20), task('A-FILL', 'A', 'M1', 10, 30, 'A-MIX'),
    task('B-MIX', 'B', 'M2', 0, 12),
  ] }, [{ '订单编号': 'A', '产线编号': 'L01' }, { '订单编号': 'B', '产线编号': 'L02' }], routes, ['MACHINE', 'PRECEDENCE']);
  assert.equal(report.checks.lineScope.status, 'problem');
  assert.equal(report.checks.machineOverlap.status, 'problem');
  assert.equal(report.checks.precedence.status, 'problem');
});

test('marks checks not checked when there are no relevant records', () => {
  const report = independentlyVerifyPlan({ id: 'P3', tasks: [] }, [], routes, ['MACHINE', 'PRECEDENCE']);
  assert.deepEqual(Object.values(report.checks).map((check) => check.status), ['not_checked', 'not_checked', 'not_checked', 'not_checked']);
});

test('does not run disabled confirmed-rule checks', () => {
  const report = independentlyVerifyPlan({ id: 'P4', tasks: [task('A-MIX', 'A', 'M1', 0, 10)] }, orders, routes, []);
  assert.equal(report.checks.lineScope.status, 'pass');
  assert.equal(report.checks.machineOverlap.status, 'not_checked');
  assert.equal(report.checks.precedence.status, 'not_checked');
});

test('detects an omitted predecessor from the route input', () => {
  const report = independentlyVerifyPlan({ id: 'P5', tasks: [task('A-FILL', 'A', 'M1', 10, 20)] }, orders, routes, ['MACHINE', 'PRECEDENCE']);
  assert.equal(report.checks.precedence.status, 'problem');
  assert.match(report.checks.precedence.details[0], /要求前序 A-MIX/);
});

test('FR019 independent anomalies expose both task IDs, exact overlap interval and precedence shortfall for UI linkage',()=>{
 const v=independentlyVerifyPlan({tasks:[task('A-MIX','A','M1',0,20),task('A-FILL','A','M1',10,30,'A-MIX')]},orders,routes);
 assert.deepEqual(v.findings.map(f=>f.taskIds),[['A-MIX','A-FILL'],['A-MIX','A-FILL']]);assert.match(v.findings[0].message,/\[10,20\)/);assert.match(v.findings[1].message,/提前 10 分钟/);assert.match(v.scopeNote,/不代表完整业务/);
 const off=independentlyVerifyPlan({tasks:[task('A-MIX','A','M1',0,20),task('A-FILL','A','M1',10,30,'A-MIX')]},orders,routes,[]);assert.equal(off.findings.length,0);
});
