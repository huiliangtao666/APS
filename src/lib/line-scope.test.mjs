import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSingleLineScope } from './line-scope.mjs';

const orders = [{ '订单编号': 'A', '产线编号': 'L01' }];
const resources = [
  { '设备编号': 'MIX01', '产线编号': 'L01', '工序编号': 'MIX' },
  { '设备编号': 'MIX02', '产线编号': 'L01', '工序编号': 'MIX' },
  { '设备编号': 'FILL01', '产线编号': 'L01', '工序编号': 'FILL' },
];

test('allows one line with multiple operations and parallel machines', () => {
  assert.deepEqual(validateSingleLineScope(orders, resources), []);
});

test('blocks orders spanning more than one line', () => {
  const findings = validateSingleLineScope([...orders, { '订单编号': 'B', '产线编号': 'L02' }], resources);
  assert.ok(findings.some((finding) => finding.code === 'SCOPE / MULTI_LINE'));
});

test('blocks resources assigned to another line, including unused resources', () => {
  const findings = validateSingleLineScope(orders, [...resources, { '设备编号': 'MIX99', '产线编号': 'L02', '工序编号': 'MIX' }]);
  assert.ok(findings.some((finding) => finding.code === 'SCOPE / RESOURCE_MULTI_LINE'));
  assert.ok(findings.some((finding) => finding.code === 'SCOPE / RESOURCE_LINE_MISMATCH'));
});

test('blocks a configured resource with no line ownership', () => {
  const findings = validateSingleLineScope(orders, [...resources, { '设备编号': 'MIX99', '产线编号': '', '工序编号': 'MIX' }]);
  assert.ok(findings.some((finding) => finding.code === 'INPUT / RESOURCE_LINE_MISSING'));
});

test('blocks orders missing their line assignment', () => {
  const findings = validateSingleLineScope([...orders, { '订单编号': 'B', '产线编号': '' }], resources);
  assert.ok(findings.some((finding) => finding.code === 'INPUT / LINE_MISSING'));
});
