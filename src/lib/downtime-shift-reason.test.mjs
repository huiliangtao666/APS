import assert from 'node:assert/strict';
import test from 'node:test';
import { findDowntimeShiftReason } from './downtime-shift-reason.mjs';

test('FR-008 AC-05 attributes a 30-minute shift to the downtime that blocked the initial fit', () => {
  const downtime = [{'设备编号':'MIX02','起始分钟':'30','结束分钟':'60','原因':'计划检修'}];
  const initialEarliest = 30;
  const duration = 30;
  const scheduledStart = 60;

  assert.equal(scheduledStart, 60);
  assert.deepEqual(
    findDowntimeShiftReason(downtime, 'MIX02', initialEarliest, duration, scheduledStart),
    { start: 30, end: 60, reason: '计划检修' },
  );
});

test('FR-008 does not attribute shifts to another machine or a non-causal stop', () => {
  const downtime = [
    {'设备编号':'MIX01','起始分钟':'30','结束分钟':'60','原因':'other machine'},
    {'设备编号':'MIX02','起始分钟':'0','结束分钟':'20','原因':'already ended'},
  ];
  assert.equal(findDowntimeShiftReason(downtime, 'MIX02', 30, 30, 60), null);
});

test('FR-008 reports no downtime shift when the task starts at its earliest time', () => {
  assert.equal(findDowntimeShiftReason([], 'MIX02', 30, 30, 30), null);
});
