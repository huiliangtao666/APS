import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMasterData } from './master-data.mjs';

const products = [{ '产品编号':'P1', '产品名称':'产品一', '单支净重kg':'0.04', '每袋支数':'10', '总收率':'0.96', '模拟交付等待分钟':'0' }];
const materials = [{ '物料编号':'M1', '物料名称':'物料一', '单位':'kg', '类别':'原料' }];
const base = { products, materials, orders:[{'订单编号':'O1','产品编号':'P1'}], routes:[{'产品编号':'P1','工序编号':'OP1'}], dependencies:[{'资源类型':'物料','资源编号':'M1'}] };

test('FR-002 accepts configured masters and order, route, material references', () => {
  assert.deepEqual(validateMasterData(base), []);
});

test('FR-002 reports required fields, duplicate codes, and invalid numeric configuration', () => {
  const issues = validateMasterData({ ...base, products:[...products, {...products[0], '单支净重kg':'0'}], materials:[...materials, {'物料编号':'M1','物料名称':'','单位':'','类别':''}] });
  assert.ok(issues.some(x => x.code === 'INPUT / MASTER_DUPLICATE' && x.message.includes('产品编号 P1')));
  assert.ok(issues.some(x => x.code === 'INPUT / MASTER_DUPLICATE' && x.message.includes('物料编号 M1')));
  assert.ok(issues.some(x => x.code === 'INPUT / MASTER_VALUE' && x.message.includes('单支净重kg')));
  assert.ok(issues.some(x => x.code === 'INPUT / MASTER_REQUIRED' && x.message.includes('物料名称')));
});

test('FR-002 catches unknown product and material references used by orders, routes, and dependencies', () => {
  const issues = validateMasterData({ ...base, orders:[{'产品编号':'BAD'},{'产品编号':''}], routes:[{'产品编号':'BAD'}], dependencies:[{'资源类型':'物料','资源编号':'BAD'},{'资源类型':'物料','资源编号':''}] });
  assert.ok(issues.some(x => x.code === 'INPUT / PRODUCT_REFERENCE' && x.message.includes('订单')));
  assert.ok(issues.some(x => x.code === 'INPUT / PRODUCT_REFERENCE' && x.message.includes('工艺路线')));
  assert.ok(issues.some(x => x.code === 'INPUT / PRODUCT_REFERENCE' && x.message.includes('缺少产品编号')));
  assert.ok(issues.some(x => x.code === 'INPUT / MATERIAL_REFERENCE'));
  assert.ok(issues.some(x => x.code === 'INPUT / MATERIAL_REFERENCE' && x.message.includes('缺少物料编号')));
});

test('FR-002 records units without inferring conversion or rounding semantics', () => {
  const configured = { ...base, materials:[{...materials[0], '单位':'支'}] };
  assert.deepEqual(validateMasterData(configured), []);
});
