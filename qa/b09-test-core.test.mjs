import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,supplyFixture,conditions,tasks} from './b09-test-fixture.mjs';
import {calculateMaterialDemand,createMaterialAllocator,materialPolicy} from '../src/lib/material-allocation.mjs';
import {validateInventoryBatches} from '../src/lib/inventory.mjs';
import {validateOriginalBom} from '../src/lib/original-bom.mjs';
import {verifyJointConditions} from '../src/lib/verify-joint-conditions.mjs';
import {exportSupplyPlanCsv} from '../src/lib/expected-supply.mjs';
const demand=(d,minute=0,op='MIX')=>calculateMaterialDemand(d,d.orders[0],op,minute);
const allocator=d=>createMaterialAllocator(d,materialPolicy(d,conditions.ruleEvaluationAt));
export function frozenPlan(d){
 const a=allocator(d),rows=[];
 for(const t of tasks){const p=a.preview(demand(d,t.start,t.operation),t.start);assert.ok(p.ok);p.commit();rows.push(...p.rows);}
 return {tasks:structuredClone(tasks),materialChecked:true,jointConditionsContract:conditions.jointConditionsContract,materialDemands:rows};
}
test('B09 UAT09 normalized exact 100+62.5 FEFO and rejected-lot provenance',()=>{
 const d=fixture(),before=JSON.stringify(d),r=allocator(d).preview(demand(d),0);
 assert.ok(r.ok);assert.deepEqual(r.rows[0].allocations.map(a=>[a.lotId,a.quantity]),[['early',100],['late',62.5]]);
 assert.deepEqual(new Set(r.rows[0].excludedLots.map(a=>a.lotId)),new Set(['frozen','expired','pending','rejected','future']));
 assert.ok(r.rows[0].allocations.every(a=>a.remaining===0&&a.source.includes('模拟库存')));assert.equal(r.rows[0].allocations[0].occupiedQuantity,'37.5');
 r.commit();assert.equal(JSON.stringify(d),before);assert.equal(allocator(d).preview(demand(d),0).ok,true);
});
test('B09 UAT10 exact 0.1 shortage rejects commit and failed candidates use no stock',()=>{
 const d=fixture('62.4'),a=allocator(d),before=JSON.stringify(d),r=a.preview(demand(d),0);
 assert.equal(r.ok,false);assert.equal(r.rows[0].shortage,0.1);assert.deepEqual(r.rows[0].exactShortage,{numerator:'1',denominator:'10'});
 assert.throws(()=>r.commit(),/缺料/);assert.ok(r.rows.every(r=>!r.committed));
 assert.equal(JSON.stringify(a.preview(demand(d),0).rows),JSON.stringify(r.rows));assert.equal(JSON.stringify(d),before);
});
test('B09 scenario-local rollback and stale commits preserve quantity conservation',()=>{
 const d=fixture(),a=allocator(d),tx=a.begin();assert.ok(tx.stage(demand(d),0).ok);tx.rollback();assert.ok(a.preview(demand(d),0).ok);
 const tx2=a.begin();assert.ok(tx2.stage(demand(d),0).ok);a.preview(demand(d),0).commit();assert.throws(()=>tx2.commit(),/过期/);
 assert.equal(a.preview(demand(d),0).rows[0].shortage,162.5);
});
test('B09 independent fixed-plan checker accepts valid material rows and detects tampering',()=>{
 const d=fixture(),p=frozenPlan(d);assert.deepEqual(verifyJointConditions(p,d,conditions),[]);
 for(const change of [
  x=>x.materialDemands[0].allocations[0].lotId='frozen',
  x=>x.materialDemands[0].allocations[0].exactQuantity={numerator:'101',denominator:'1'},
  x=>x.materialDemands[0].feedMinute=1,
  x=>x.materialDemands.splice(0,1),
  x=>x.materialChecked=false
 ]){const bad=structuredClone(p);change(bad);assert.ok(verifyJointConditions(bad,d,conditions).length>0);}
});
test('B09 JSON snapshot and native CSV keep exact/frozen source after current input changes',()=>{
 const d=fixture(),p=frozenPlan(d),saved=JSON.stringify({input:d,plan:p}),reopened=JSON.parse(saved),csv=exportSupplyPlanCsv(reopened.plan);
 d.inventory.find(r=>r['批次编号']==='early')['已占用数量']='137.5';d.bom[0]['配置用量']='600';
 assert.equal(JSON.stringify(reopened),saved);assert.deepEqual(verifyJointConditions(reopened.plan,reopened.input,conditions),[]);
 assert.match(csv,/early/);assert.match(csv,/exactQuantity/);assert.match(csv,/37.5/);
});
test('B09 explicit supply gates arrival vs readiness, reference, status, expiry and delay',()=>{
 const d=supplyFixture();assert.equal(allocator(d).preview(demand(d,120),120).ok,false);
 let r=allocator(d).preview(demand(d,180),180);assert.ok(r.ok);assert.equal(r.rows[0].allocations[0].conditional,true);assert.match(r.rows[0].allocations[0].source,/未确认到货/);
 d.supplyDelays=[{'记录编号':'D','供给编号':'S','记录时间':'2026-11-01T00:00:00Z','调整后到达时间':'2026-11-02T11:00:00+08:00','调整后可用时间':'2026-11-02T12:00:00+08:00','原因':'显式模拟延期'}];
 assert.equal(allocator(d).preview(demand(d,180),180).ok,false);assert.equal(allocator(d).preview(demand(d,240),240).ok,true);
 for(const mutate of [x=>x.supplyUses=[],x=>x.supplies[0]['质量状态']='冻结',x=>x.supplies[0]['有效期']='2026-11-31',x=>x.supplies[0]['预计可用时间']='bad',x=>x.supplies[0]['预计可用时间']='2026-11-02T09:00:00+08:00']){
  const x=supplyFixture();mutate(x);assert.equal(allocator(x).preview(demand(x,180),180).ok,false);
 }
});
test('B09 feed-time quality, effective BOM and factory-midnight expiry are evaluated at task start',()=>{
 const d=fixture();d.inventory.find(r=>r['批次编号']==='early')['有效期']='2026-11-02';
 assert.ok(allocator(d).preview(demand(d,959),959).rows[0].allocations.some(a=>a.lotId==='early'));
 assert.ok(!allocator(d).preview(demand(d,960),960).rows[0].allocations.some(a=>a.lotId==='early'));
 d.bom.forEach(b=>b['生效日期']='2026-11-03');assert.throws(()=>demand(d,959),/生效/);assert.equal(demand(d,960)[0].quantity,162.5);
});
test('B09 original09 six literal values never become a normalized calculation BOM',()=>{
 const d=fixture(),raw={'产品编号':'HC40','物料编号':'LEAN','投料工序':'MIX','计量基准':'每1000kg投入','定额':'650.00','损坏比例':'0.000'};
 d.originalBom=[raw];const before=JSON.stringify(d.originalBom);assert.deepEqual(validateOriginalBom(d),[]);
 assert.equal(JSON.stringify(d.originalBom),before);assert.equal(demand(d)[0].quantity,162.5);
 d.bom=[];assert.throws(()=>demand(d),/缺少已生效 BOM/);assert.equal(JSON.stringify(d.originalBom),before);
});
test('B09 unknown formula semantics stay rejected and disabled MATERIAL is not a checked result',()=>{
 for(const mutate of [x=>x.orders[0]['数量单位']='箱',x=>x.bom[0]['用量基准']='每批',x=>x.bom[0]['收率/损耗口径备注']='加水',x=>x.bom[0]['损坏比例']='0.01']){
  const d=fixture();mutate(d);assert.throws(()=>demand(d));
 }
 const d=fixture();d.rules[0]['是否启用']='否';assert.equal(materialPolicy(d,conditions.ruleEvaluationAt),null);
});
test('B09 inventory rejects timezone-free and impossible ready timestamps before calculation',()=>{
 const d=fixture();for(const ready of ['2026-11-02T11:00:00','2026-02-30T11:00:00+08:00']){
  const lot={...d.inventory[0],'预计可用时间':ready};assert.ok(validateInventoryBatches([lot],d.materials).some(f=>f.code==='INVENTORY_READY'));
 }
});
