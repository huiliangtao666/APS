import test from 'node:test';
import assert from 'node:assert/strict';
import { allocatePersonnel } from './staffing.mjs';

const requirement = { '工序编号': 'LOAD', '需求数量': '2', '所需技能': '装卸', '所需班次': '早班', '人员开始偏移': '0', '人员结束偏移': '10' };
const group = { '人员组编号': 'G1', '人员数量': '2', '技能': '装卸,操作', '班次': '早班', '可用起始分钟': '0', '可用结束分钟': '300' };

test('matches required headcount, skill, shift and the personnel phase window', () => {
  const result = allocatePersonnel([requirement], [group], 20, 80);
  assert.equal(result.ok, true);
  assert.deepEqual(result.allocations.map(({groupId,count,start,end})=>({groupId,count,start,end})), [{ groupId: 'G1', count: 2, start: 20, end: 70 }]);
});

test('rejects sufficient headcount when skill or shift does not match', () => {
  assert.equal(allocatePersonnel([requirement], [{ ...group, 技能: '操作' }], 20, 80).ok, false);
  assert.equal(allocatePersonnel([requirement], [{ ...group, 班次: '夜班' }], 20, 80).ok, false);
});

test('rejects unavailable personnel time and concurrent capacity overbooking', () => {
  assert.equal(allocatePersonnel([requirement], [{ ...group, '可用结束分钟': '30' }], 20, 80).ok, false);
  assert.equal(allocatePersonnel([requirement], [group], 20, 80, [{ groupId: 'G1', count: 1, start: 10, end: 50 }]).ok, false);
});

test('uses the referenced personnel group instead of substituting another group', () => {
  assert.equal(allocatePersonnel([{ ...requirement, '资源编号': 'G2' }], [group], 20, 80).ok, false);
});

test('does not allocate the same group capacity twice across requirement rows', () => {
  assert.equal(allocatePersonnel([requirement, { ...requirement, '需求数量': '1', '工序编号': 'UNLOAD' }], [group], 20, 80).ok, false);
});

test('zero personnel demand does not require a group', () => {
  assert.equal(allocatePersonnel([{ ...requirement, '需求数量': '0' }], [], 20, 80).ok, true);
});
