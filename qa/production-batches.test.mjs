import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,calculate} from '../server/planner.ts';
import {batchFixture} from './batch-fixture.mjs';
import {freezeRunInput} from '../server/run-input.mjs';
import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {exportSupplyPlanCsv} from '../src/lib/expected-supply.mjs';
const at='2026-10-29T00:00:00Z';
const plan=(d,mode='supported')=>calculate(d,0,at,{mode});
const cloneOrder=(d,id,kg)=>{d.orders.push({...d.orders[0],'订单编号':id,'合格需求':kg});d.dependencies.push(...d.dependencies.filter(r=>r['订单编号']==='A').map(r=>({...r,'订单编号':id})));};
test('FR021 AC13 500kg input splits into250+250; quantities identities, immutable source and fixed duration',()=>{
 const d=batchFixture(seed),before=JSON.stringify(d),p=plan(d);
 assert.equal(JSON.stringify(d),before);assert.equal(p.batchChecked,true);assert.equal(p.productionBatches.length,2);assert.deepEqual(p.resourceBatches.filter(g=>g.operation==='MIX').map(g=>g.loadKg),[250,250]);
 assert.equal(p.tasks.length,4);assert.ok(p.tasks.every(t=>t.duration===30&&t.quantity===240&&t.orderId==='A'));assert.equal(new Set(p.tasks.map(t=>t.id)).size,4);
 assert.equal(p.materialDemands.reduce((a,r)=>a+r.quantity,0),500);assert.ok(p.materialDemands.every(r=>r.committed));
 assert.equal(p.ruleSnapshot.capabilityVersion,'FR021-v1');assert.equal(p.findings.length,0);
 const v=independentlyVerifyPlan(p,d.orders,d.routes);assert.equal(v.checks.precedence.status,'pass');assert.equal(v.checks.machineOverlap.status,'pass');
 assert.match(exportSupplyPlanCsv(p),/生产批编号/);assert.match(exportSupplyPlanCsv(p),/FR021-RB/);
});
test('FR021 exact capacity boundary and just-over boundary do not disappear in tolerance',()=>{
 for(const [kg,count]of [['288',1],['288.000000000000000001',2]]){const d=batchFixture(seed);d.orders[0]['合格需求']=kg;const p=plan(d);assert.equal(p.productionBatches.length,count);assert.equal(p.findings.length,0);}
});
test('FR021 equal split under-min tail is explicit with no overproduction or material commitment',()=>{
 const d=batchFixture(seed);d.orders[0]['合格需求']='300';d.machines.forEach(m=>m['最小装载kg']='200');const p=plan(d);
 assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.code.includes('UNDER_MIN')));assert.ok(p.resourceBatches.every(g=>g.status==='blocked-under-min'));
 assert.equal(p.productionBatches.reduce((n,b)=>n+b.quantity,0),300);assert.ok(p.materialDemands.length>0);assert.ok(p.materialDemands.every(r=>!r.committed));
});
test('FR021 compatible multiorder resource batch preserves each order and rescues under-min load',()=>{
 const d=batchFixture(seed);d.orders[0]['合格需求']='96';cloneOrder(d,'B','96');d.machines.forEach(m=>m['最小装载kg']='150');const p=plan(d);
 assert.equal(p.resourceBatches.length,2);assert.equal(p.resourceBatches[0].loadKg,200);assert.equal(p.tasks.length,4);
 assert.deepEqual(new Set(p.materialDemands.map(r=>r.orderId)),new Set(['A','B']));assert.equal(p.materialDemands.reduce((n,r)=>n+r.quantity,0),200);
 assert.equal(p.tasks[0].start,p.tasks[1].start);assert.equal(p.tasks[0].end,p.tasks[1].end);
 const v=independentlyVerifyPlan(p,d.orders,d.routes);assert.equal(v.checks.machineOverlap.status,'pass');assert.equal(v.checks.precedence.status,'pass');
 p.tasks[1].end++;assert.equal(independentlyVerifyPlan(p,d.orders,d.routes).checks.machineOverlap.status,'problem');
});
test('FR021 different product, recipe, route or program cannot combine; missing semantics block explicitly',()=>{
 const d=batchFixture(seed);d.orders[0]['合格需求']='96';cloneOrder(d,'B','96');d.orders[1]['产品编号']='HC60';
 d.bom.push(...d.bom.map(b=>({...b,'产品编号':'HC60','版本编号':'V2'})));assert.equal(plan(d).resourceBatches.length,4);
 for(const mutate of [d=>d.routes[0]['程序编号']='',d=>d.machines[0]['装载计量基准']='产出（未决定）',d=>d.machines[0]['最小装载kg']='301',d=>d.orders[0]['是否允许拆分']='否',d=>d.orders[0]['数量单位']='支',d=>d.rules.find(r=>r['规则编号']==='CAPACITY')['参数JSON']='{}',d=>d.rules.find(r=>r['规则编号']==='MATERIAL')['是否启用']='否',d=>d.rules.find(r=>r['规则编号']==='PROGRAM')['是否启用']='否']){
  const x=batchFixture(seed);mutate(x);const p=plan(x);assert.equal(p.tasks.length,0);assert.ok(p.findings.length>0);assert.ok(!p.materialDemands?.some(r=>r.committed));
 }
});
test('FR021 partial resource batch keeps full fixed program, personnel summed, stock shortage rolls all members back',()=>{
 const d=batchFixture(seed);d.orders[0]['合格需求']='96';cloneOrder(d,'B','96');let p=plan(d);assert.ok(p.tasks.every(t=>t.duration===30));d.times.find(t=>t['产品编号']==='HC40'&&t['工序编号']==='MIX')['固定分钟']='120';p=plan(d);assert.ok(p.tasks.filter(t=>t.operation==='MIX').every(t=>t.duration===120));
 d.inventory[0]['账面数量']='100';p=plan(d);assert.equal(p.tasks.length,0);assert.ok(p.materialDemands.every(r=>!r.committed));assert.equal(p.materialDemands.filter(r=>r.operation==='MIX').reduce((n,r)=>n+r.shortage,0),30);
 d.inventory[0]['账面数量']='10000';d.personnelGroups=[{'人员组编号':'G','人员数量':'1','技能':'mix','班次':'D','可用起始分钟':'0','可用结束分钟':'600'}];
 for(const id of ['A','B'])d.dependencies.push({'订单编号':id,'工序编号':'MIX','资源类型':'人员技能','资源编号':'G','需求数量':'1','所需技能':'mix','所需班次':'D'});
 p=plan(d);assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.code.includes('PERSONNEL')));assert.ok(p.materialDemands.every(r=>!r.committed));
});
test('FR021 exact remaining qty and packaging integer restrictions preserve material accounting',()=>{
 const d=batchFixture(seed);d.orders[0]['已完成合格数量']='240';let p=plan(d);assert.equal(p.productionBatches.length,1);assert.equal(p.productionBatches[0].quantity,240);assert.equal(p.materialDemands.reduce((n,r)=>n+r.quantity,0),250);
 const x=batchFixture(seed);x.bom.push({'版本编号':'V1','产品编号':'HC40','生效日期':'2026-01-01','投料工序编号':'FILL','用量类型':'包装物料','物料编号':'BAG','配置用量':'1','用量单位':'个','用量基准':'每袋','损坏比例':'0','收率/损耗口径备注':''});p=plan(x);
 assert.equal(p.materialDemands.filter(r=>r.materialId==='BAG').reduce((n,r)=>n+r.quantity,0),1200);
 x.orders[0]['合格需求']='481';p=plan(x);assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.message.includes('中间取整')));
});
test('FR021 explicit minimal mode keeps batching/material/program unchecked and frozen run scope truthful',()=>{
 const d=batchFixture(seed),p=plan(d,'minimal-r1'),f=freezeRunInput(d,{mode:'minimal-r1'},at);
 assert.equal(p.batchChecked,false);assert.equal(p.materialChecked,false);assert.equal(p.tasks.length,2);assert.ok(p.ruleSnapshot.checkScope.unchecked.includes('设备容量与拆合批'));
 assert.ok(f.conditions.checkScope.unchecked.includes('程序兼容'));assert.ok(!f.conditions.checkScope.checked.some(x=>x.includes('资源批')));
 for(const id of ['CAPACITY','PROGRAM','MATERIAL'])assert.equal(p.ruleSnapshot.settings.find(r=>r.id===id).active,false);
 const s=freezeRunInput(d,{},at);assert.ok(s.conditions.checkScope.checked.some(x=>x.includes('资源批')));
});

test('FR021 packaging loss ceiling across splits blocks undecided redistribution instead of changing order total',()=>{
 const d=batchFixture(seed);d.bom.push({'版本编号':'V1','产品编号':'HC40','生效日期':'2026-01-01','投料工序编号':'FILL','用量类型':'包装物料','物料编号':'BAG','配置用量':'1','用量单位':'个','用量基准':'每袋','损坏比例':'0.01','收率/损耗口径备注':''});
 const p=plan(d);assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.message.includes('跨批取整分配未决定')));assert.ok(p.materialDemands.every(r=>!r.committed));
});
test('FR021 per-operation resource cycles retain each machine bounds and partial horizon status',()=>{
 const d=batchFixture(seed),p=calculate(d,0,at,{endMinute:30});assert.equal(p.tasks.length,1);assert.equal(p.resourceBatches.length,4);
 assert.equal(p.resourceBatches.filter(g=>g.status==='scheduled').length,1);assert.ok(p.resourceBatches.filter(g=>g.status==='unplanned').length===3);
 assert.equal(new Set(p.resourceBatches.map(g=>g.id)).size,4);assert.equal(p.resourceBatches.find(g=>g.operation==='FILL').maximum,10000);assert.ok(p.materialDemands.filter(r=>r.operation==='FILL').every(r=>!r.committed));
});
test('FR021 split conditional supply uses original order caps and effective availability without duplicate allocation',()=>{
 const d=batchFixture(seed);d.inventory[0]['账面数量']='0';const policy=JSON.parse(d.rules.find(r=>r['规则编号']==='MATERIAL')['参数JSON']);policy['允许预计供给']=true;d.rules.find(r=>r['规则编号']==='MATERIAL')['参数JSON']=JSON.stringify(policy);
 d.supplies=[{'供给编号':'S','物料编号':'LEAN','批次编号':'EXPECTED','预计数量':'325','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];
 d.supplyUses=[{'引用编号':'U','订单编号':'A','工序编号':'MIX','供给编号':'S','使用数量':'325'}];
 const p=plan(d);assert.equal(p.tasks.length,4);assert.ok(p.tasks.filter(t=>t.operation==='MIX').every(t=>t.start>=180));
 assert.equal(p.materialDemands.flatMap(r=>r.allocations).filter(a=>a.conditional).reduce((n,a)=>n+a.quantity,0),325);assert.equal(p.supplyConditions.reduce((n,c)=>n+Number(c['使用数量']),0),325);assert.ok(p.supplyConditions.every(c=>c['订单编号']==='A'));
 d.supplyUses[0]['使用数量']='300';const capped=plan(d);assert.equal(capped.tasks.filter(t=>t.operation==='MIX').length,1);assert.ok(capped.materialDemands.some(r=>r.shortage===25));
});

test('FR021 table15 whitelist is authoritative; unconfigured resources split but never implicitly combine',()=>{
 const d=batchFixture(seed);d.orders[0]['合格需求']='96';cloneOrder(d,'B','96');d.batchResources=[];
 let p=plan(d);assert.equal(p.resourceBatches.length,4);assert.equal(p.tasks.length,4);assert.ok(p.tasks[0].start!==p.tasks[2].start);
 d.batchResources=[{'资源编号':'MIX01','资源类型':'批处理装载','容量':'300','单位':'kg','允许程序':'OTHER','说明':''}];p=plan(d);assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.message.includes('允许')));
 d.batchResources[0]['容量']='200';p=plan(d);assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.message.includes('冲突')));
});

test('FR021 AC14 waiting and undeclared space rules cannot be silently ignored and capacity conflicts use exact decimals',()=>{
 const waiting=batchFixture(seed);waiting.rules.find(r=>r['规则编号']==='MAX_LAG')['是否启用']='是';assert.equal(plan(waiting).tasks.length,4);
 const storage=batchFixture(seed);storage.rules.find(r=>r['规则编号']==='STORAGE')['是否启用']='是';const blocked=plan(storage);assert.equal(blocked.tasks.length,0);assert.ok(blocked.findings.some(f=>/显式|缺少/.test(f.message)));
 const d=batchFixture(seed);d.batchResources.find(r=>r['资源编号']==='MIX01')['容量']='300.000000000000000001';const p=plan(d);assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.message.includes('冲突')));
});
test('FR021 delayed feed BOM rechecks split rounding and preserves uncommitted downstream evidence',()=>{
 const d=batchFixture(seed);d.bom.push({'版本编号':'V1','产品编号':'HC40','生效日期':'2026-01-01','投料工序编号':'FILL','用量类型':'包装物料','物料编号':'BAG','配置用量':'1','用量单位':'个','用量基准':'每袋','损坏比例':'0','收率/损耗口径备注':''});
 d.bom.push(...d.bom.map(b=>({...b,'版本编号':'V2','生效日期':'2026-11-03',...(b['用量类型']==='包装物料'?{'损坏比例':'0.01'}:{})})));
 d.calendars.push({...d.calendars[0],'起始分钟':'960','结束分钟':'1200'});d.downtime=[{'设备编号':'FILL01','起始分钟':'0','结束分钟':'960','原因':'测试跨版本'}];
 const p=plan(d);assert.equal(p.tasks.filter(t=>t.operation==='MIX').length,2);assert.equal(p.tasks.filter(t=>t.operation==='FILL').length,0);assert.ok(p.findings.some(f=>f.message.includes('跨批取整')));
});
