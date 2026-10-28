import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBomConfig } from './bom-config.mjs';

const products = [{'产品编号':'P1'}];
const materials = [{'物料编号':'M1','单位':'kg'},{'物料编号':'PK1','单位':'个'}];
const routes = [{'产品编号':'P1','工序编号':'MIX'},{'产品编号':'P1','工序编号':'PACK'}];
const line = (overrides = {}) => ({'版本编号':'V1','产品编号':'P1','生效日期':'2026-11-01','投料工序编号':'MIX','用量类型':'BOM物料','物料编号':'M1','配置用量':'2.5','用量单位':'kg','用量基准':'每批（待确认）','收率/损耗口径备注':'待决，不参与计算',...overrides});

test('FR-003 accepts multiple material rows within one product BOM version, including packaging', () => {
  assert.deepEqual(validateBomConfig({products,materials,routes,bom:[line(),line({'投料工序编号':'PACK','用量类型':'包装物料','物料编号':'PK1','配置用量':'1','用量单位':'个'})]}), []);
});

test('FR-003 validates required fields, date, positive configured quantity, and dangling product/material/operation refs', () => {
  const issues = validateBomConfig({products,materials,routes,bom:[line({'生效日期':'2026-02-30','配置用量':'0','产品编号':'BAD','物料编号':'BAD','投料工序编号':'BAD','用量基准':''})]});
  for (const code of ['INPUT / BOM_DATE','INPUT / BOM_QUANTITY','INPUT / BOM_PRODUCT_REFERENCE','INPUT / BOM_MATERIAL_REFERENCE','INPUT / BOM_OPERATION_REFERENCE','INPUT / BOM_REQUIRED']) assert.ok(issues.some(issue => issue.code === code), code);
});

test('FR-003 rejects duplicate version lines and inconsistent effective date inside a version', () => {
  const issues = validateBomConfig({products,materials,routes,bom:[line(),line(),line({'生效日期':'2026-12-01','投料工序编号':'PACK','物料编号':'PK1','用量类型':'包装物料'})]});
  assert.ok(issues.some(issue => issue.code === 'INPUT / BOM_LINE_DUPLICATE'));
  assert.ok(issues.some(issue => issue.code === 'INPUT / BOM_VERSION_DATE'));
});

test('FR-003 flags unit mismatch and records values without conversion, yield, or loss calculations', () => {
  const issues = validateBomConfig({products,materials,routes,bom:[line({'用量单位':'g'})]});
  assert.ok(issues.some(issue => issue.code === 'INPUT / BOM_UNIT_MISMATCH'));
  assert.match(issues.find(issue => issue.code === 'INPUT / BOM_UNIT_MISMATCH').message, /不会换算/);
  assert.equal(issues.some(issue => /收率|损耗/.test(issue.code)), false);
});
