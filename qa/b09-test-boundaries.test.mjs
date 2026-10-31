import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExpectedSupply} from '../src/lib/expected-supply.mjs';
import {validateInventoryBatches,queryInventoryAvailability} from '../src/lib/inventory.mjs';
import {validateBomConfig} from '../src/lib/bom-config.mjs';

const supplyInput = amounts => ({
 supplies:[{'供给编号':'S','物料编号':'M','批次编号':'L','预计数量':'0.3','预计到达时间':'2026-11-02T08:00:00+08:00','预计可用时间':'2026-11-02T09:00:00+08:00'}],
 uses:amounts.map((amount,i)=>({'引用编号':'U'+i,'订单编号':'A','工序编号':'MIX','供给编号':'S','使用数量':amount})),
 materials:[{'物料编号':'M'}],orders:[{'订单编号':'A','产品编号':'P'}],routes:[{'产品编号':'P','工序编号':'MIX'}]
});
test('B09 supply references accept exactly 0.1+0.2 against 0.3',()=>{
 assert.deepEqual(validateExpectedSupply(supplyInput(['0.1','0.2'])),[]);
});
test('B09 supply references reject a deficit below Number display precision',()=>{
 assert.ok(validateExpectedSupply(supplyInput(['0.3000000000000000001'])).some(f=>f.code==='SUPPLY_OVERALLOCATED'));
});
test('B09 quantity validators reject syntax the exact calculation cannot consume',()=>{
 for(const value of ['1e2','0x10']){
  const lot={'批次编号':'L','物料编号':'M','账面数量':value,'已占用数量':'0','质量状态':'合格','有效期':'2026-12-31','位置':'模拟库'};
  assert.ok(validateInventoryBatches([lot],[{'物料编号':'M'}]).some(f=>f.code==='INVENTORY_AMOUNT'),value);
  const input=supplyInput([value]);assert.ok(validateExpectedSupply(input).some(f=>f.code==='SUPPLY_QUANTITY'),value);
  const bom={'版本编号':'V','产品编号':'P','生效日期':'2026-01-01','投料工序编号':'MIX','用量类型':'BOM物料','物料编号':'M','配置用量':value,'用量单位':'kg','用量基准':'每1000kg投入'};
  assert.ok(validateBomConfig({products:input.products||[{'产品编号':'P'}],materials:[{'物料编号':'M','单位':'kg'}],routes:input.routes,bom:[bom]}).some(f=>f.code==='INPUT / BOM_QUANTITY'),value);
 }
});
test('B09 inventory keeps leading-dot decimals exact and rejects sub-display over-occupation',()=>{
 const lot={'批次编号':'L','物料编号':'M','账面数量':'.3','已占用数量':'.1','质量状态':'合格','有效期':'2026-12-31','位置':'模拟库'};
 assert.equal(queryInventoryAvailability([lot],{asOf:'2026-11-02T08:00:00+08:00'})[0]['当前可用数量'],0.2);
 lot['账面数量']='0.3';lot['已占用数量']='0.3000000000000000001';
 assert.ok(validateInventoryBatches([lot],[{'物料编号':'M'}]).some(f=>f.code==='INVENTORY_RESERVED'));
 assert.equal(queryInventoryAvailability([lot],{asOf:'2026-11-02T08:00:00+08:00'})[0]['当前可用数量'],0);
});
