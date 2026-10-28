import test from 'node:test';
import assert from 'node:assert/strict';
import { queryInventoryAvailability, validateInventoryBatches } from './inventory.mjs';

const base = (overrides = {}) => ({ '批次编号': 'LOT-1', '物料编号': 'MAT-1', '账面数量': '100', '已占用数量': '25', '有效期': '2026-12-31', '位置': 'A-01', '质量状态': '合格', '预计可用时间': '', ...overrides });
const at = '2026-10-29T10:00:00+08:00';

test('available quantity subtracts reservations while preserving book quantity', () => {
  const [row] = queryInventoryAvailability([base()], { asOf: at });
  assert.equal(row['账面数量'], 100);
  assert.equal(row['已占用数量'], 25);
  assert.equal(row['当前可用数量'], 75);
});

test('default quality policy excludes pending, frozen, and rejected batches', () => {
  const rows = queryInventoryAvailability([
    base({ '质量状态': '待检' }), base({ '批次编号': 'LOT-2', '质量状态': '冻结' }), base({ '批次编号': 'LOT-3', '质量状态': '不合格' }),
  ], { asOf: at });
  assert.deepEqual(rows.map(row => row['当前可用数量']), [0, 0, 0]);
});

test('future-ready and expired lots are unavailable at the query time', () => {
  const rows = queryInventoryAvailability([
    base({ '预计可用时间': '2026-10-30T09:00:00+08:00' }), base({ '批次编号': 'LOT-2', '有效期': '2026-10-28' }),
  ], { asOf: at });
  assert.deepEqual(rows.map(row => row['当前可用数量']), [0, 0]);
});

test('quality availability is configurable through the inventory rule', () => {
  const rules = [{ '规则编号': 'INVENTORY', '参数JSON': '{"可用质量状态":["合格","待检"]}' }];
  const [row] = queryInventoryAvailability([base({ '质量状态': '待检' })], { asOf: at, rules });
  assert.equal(row['当前可用数量'], 75);
});

test('batch validation catches missing identifiers, invalid amounts, over-reservation, and malformed dates', () => {
  const findings = validateInventoryBatches([base({ '批次编号': '', '账面数量': '-1', '已占用数量': '2', '有效期': 'tomorrow' })]);
  assert.ok(findings.some(item => item.code === 'INVENTORY_REQUIRED'));
  assert.ok(findings.some(item => item.code === 'INVENTORY_AMOUNT'));
  assert.ok(findings.some(item => item.code === 'INVENTORY_RESERVED'));
  assert.ok(findings.some(item => item.code === 'INVENTORY_EXPIRY'));
});

test('query can filter by material', () => {
  const rows = queryInventoryAvailability([base(), base({ '批次编号': 'LOT-2', '物料编号': 'MAT-2' })], { materialId: 'MAT-2', asOf: at });
  assert.deepEqual(rows.map(row => row['批次编号']), ['LOT-2']);
});
