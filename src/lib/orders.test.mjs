import test from 'node:test';
import assert from 'node:assert/strict';
import { appendOrderChange, isOrderSchedulable, preserveStartedOrCompletedTasks, validateOrders } from './orders.mjs';

const order = { '订单编号': 'O1', '产品编号': 'P1', '合格需求': '25', '数量单位': 'kg', '要求可交付分钟': '120', '优先顺序': '1', '是否允许拆分': '否', '产线编号': 'L1', '订单状态': '有效', '需求类型': '正式订单' };

test('validates the P0 order fields, duplicate ids, numeric inputs, split flag and single-line scope', () => {
  assert.deepEqual(validateOrders([order]), []);
  const errors = validateOrders([{ ...order, '合格需求': '-1', '优先顺序': 'x', '是否允许拆分': 'maybe' }, { ...order }]);
  assert.deepEqual(errors.map(e => e.code), ['ORDER_QUANTITY', 'ORDER_PRIORITY', 'ORDER_SPLIT', 'ORDER_DUPLICATE']);
  assert.ok(validateOrders([{ ...order, '要求可交付分钟': 'tomorrow' }]).some(e => e.code === 'ORDER_DUE'));
  assert.ok(validateOrders([{ ...order, '产线编号': 'L2' }, order]).some(e => e.code === 'ORDER_MULTI_LINE'));
  assert.ok(validateOrders([{ ...order, '数量单位': '' }]).some(e => e.field === '数量单位'));
});

test('records quantity and delivery-time changes as append-only events', () => {
  const first = appendOrderChange([], 'O1', '合格需求', '25', '30', '2026-10-28T00:00:00Z');
  const second = appendOrderChange(first, 'O1', '要求可交付分钟', '120', '180', '2026-10-28T00:01:00Z');
  assert.equal(second.length, 2);
  assert.equal(second[0].before, '25');
  assert.equal(second[1].after, '180');
  assert.equal(appendOrderChange(second, 'O1', '产品编号', 'P1', 'P2').length, 2);
});

test('cancel excludes the order from future scheduling while preserving started and completed simulation tasks', () => {
  assert.equal(isOrderSchedulable(order), true);
  assert.equal(isOrderSchedulable({ ...order, '订单状态': '已取消' }), false);
  assert.deepEqual(preserveStartedOrCompletedTasks([{ status: '未开始' }, { status: '进行中' }, { status: '已完成' }]), [{ status: '进行中' }, { status: '已完成' }]);
});

test('forecast orders retain a distinct type marker and quantities are not converted across units', () => {
  const forecast = { ...order, '订单编号': 'F1', '需求类型': '预测' };
  assert.equal(forecast['需求类型'], '预测');
  assert.equal(forecast['合格需求'], '25');
  assert.equal(forecast['数量单位'], 'kg');
});
