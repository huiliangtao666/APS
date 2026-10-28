import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_FIELDS, validateTools } from './tool-validation.mjs';

const valid = {
  '工装编码': 'MOLD-40', '工装名称': '注塑模具', '适用任务': 'MIX|FILL',
  '可用数量': '2', '每任务需求数量': '1', '提前占用分钟': '15',
  '后延占用分钟': '10', '是否启用': '是', '说明': '',
};

test('accepts a valid row and preserves the declared CSV field contract', () => {
  assert.equal(validateTools([valid]).length, 0);
  assert.equal(TOOL_FIELDS.length, 9);
});

test('rejects duplicate codes and reports the CSV row', () => {
  const issues = validateTools([valid, { ...valid }]);
  assert.ok(issues.some(issue => issue.includes('第 3 行') && issue.includes('重复')));
});

test('rejects missing required text and invalid quantities', () => {
  const issues = validateTools([{ ...valid, '工装名称': ' ', '适用任务': '', '可用数量': '0', '每任务需求数量': '1.5' }]);
  assert.ok(issues.some(issue => issue.includes('工装名称必填')));
  assert.ok(issues.some(issue => issue.includes('适用任务必填')));
  assert.equal(issues.filter(issue => issue.includes('必须为大于 0 的整数')).length, 2);
});

test('rejects negative, fractional and blank occupancy offsets', () => {
  const issues = validateTools([{ ...valid, '提前占用分钟': '-1', '后延占用分钟': '1.5' }]);
  assert.equal(issues.filter(issue => issue.includes('必须为大于等于 0 的整数')).length, 2);
});

test('rejects unknown enabled values', () => {
  assert.ok(validateTools([{ ...valid, '是否启用': '未知' }]).some(issue => issue.includes('只能为“是”或“否”')));
});
