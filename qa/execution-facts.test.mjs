import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,defs,calculate} from '../server/planner.ts';
import {validateInputs} from '../server/input-validation.mjs';
import {freezeRunInput} from '../server/run-input.mjs';
import {executionFixture} from './execution-fixture.mjs';
import {validateExecution,executionTransition,executionAdmission} from '../src/lib/execution-facts.mjs';
import {quantityMath as Q,executionInventory,remainingExecutionDemand,createMaterialAllocator,materialPolicy} from '../src/lib/material-allocation.mjs';
import {queryInventoryAvailability} from '../src/lib/inventory.mjs';
const at='2026-10-29T00:00:00Z';
const run=(d,selection={})=>{const frozen=freezeRunInput(d,selection,at);return calculate(frozen.executionData,0,at,frozen.conditions);};
test('FR012 partial calculates20 remaining minutes from30, preserves original0 and40 output without qualified credit',()=>{
 const d=executionFixture(seed),before=JSON.stringify(d);assert.deepEqual(validateInputs(defs,d),[]);const p=run(d);
 assert.deepEqual(p.findings,[]);assert.deepEqual(p.tasks.map(t=>[t.id,t.start,t.end]),[['A-MIX',30,50],['A-FILL',50,80]]);
 assert.equal(p.execution.remaining[0].remainingQuantity,60);assert.equal(p.execution.facts[0]['开始分钟'],'0');assert.match(p.tasks[0].source,/模拟剩余工作/);assert.equal(p.resultAssessment.tasks[0].remainingExecutionQuantity,60);assert.equal(JSON.stringify(d),before);assert.equal(d.orders[0]['已完成合格数量'],undefined);
});
test('FR012 started zero output can retain consumed40, full100 output remaining and explicit20 minutes',()=>{
 const d=executionFixture(seed,'已开始');assert.deepEqual(validateInputs(defs,d),[]);const p=run(d);assert.equal(p.execution.remaining[0].remainingQuantity,100);assert.equal(p.materialDemands[0].quantity,60);assert.equal(p.tasks[0].duration,20);
});
test('FR012 completed retains actual0..30 and does not repeat its work or consumption',()=>{
 const d=executionFixture(seed,'已完成');assert.deepEqual(validateInputs(defs,d),[]);const p=run(d);assert.deepEqual(p.tasks.map(t=>[t.id,t.start,t.end]),[['A-MIX',0,30],['A-FILL',30,60]]);assert.match(p.tasks[0].source,/原始事实/);assert.equal(p.materialDemands.some(r=>r.operation==='MIX'),false);assert.equal(p.execution.remaining[0].remainingQuantity,0);assert.equal(p.execution.simulation,true);
});
test('FR012 pause preserves cause, does not invent resume or downstream completion',()=>{
 const d=executionFixture(seed,'暂停');assert.deepEqual(validateInputs(defs,d),[]);const p=run(d);assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.code.includes('EXECUTION_PAUSED')));assert.equal(p.execution.facts[0]['暂停原因'],'模拟设备异常待核对');assert.equal(p.materialDemands.some(r=>r.committed),false);
});
test('FR012 exact material conservation:120=40 consumed+60 remaining plan+10 reserved+10 untouched',()=>{
 const d=executionFixture(seed),p=run(d),m=p.materialDemands[0];assert.equal(m.quantity,60);assert.equal(m.executionConsumed,40);assert.equal(m.allocations[0].quantity,60);assert.equal(m.allocations[0].remaining,10);assert.equal(m.shortage,0);assert.equal(120,40+m.quantity+10+m.allocations[0].remaining);
 assert.equal(executionInventory(d)[0]['账面数量'],'80');assert.equal(queryInventoryAvailability(executionInventory(d),{asOf:'2026-11-02T00:00:00Z'})[0]['当前可用数量'],70);assert.equal(d.inventory[0]['账面数量'],'120');
});
test('FR012 repeated calculations and previews never multiply consumption or produce qualified inventory',()=>{
 const d=executionFixture(seed),before=JSON.stringify(d),first=run(d);
 for(let i=0;i<5;i++){const p=run(d);assert.deepEqual(p.materialDemands,first.materialDemands);assert.deepEqual(p.execution,first.execution);}
 const allocator=createMaterialAllocator(d,materialPolicy(d,at)),demands=remainingExecutionDemand(d,d.orders[0],'MIX',30),preview=allocator.preview(demands,30);assert.equal(preview.ok,true);preview.commit();preview.commit();assert.equal(allocator.preview(demands,30).rows[0].shortage,50);assert.equal(JSON.stringify(d),before);
});
test('FR012 fractions subtract as exact rational quantities and not rounded completed percentages',()=>{
 const d=executionFixture(seed);d.orders[0]['合格需求']='0.3';Object.assign(d.executionFacts[0],{'工序完成数量':'0.1'});d.executionMaterials[0]['累计已用数量']='0.1';Object.assign(d.inventory[0],{'账面数量':'0.3','已占用数量':'0'});assert.deepEqual(validateInputs(defs,d),[]);
 const p=run(d),m=p.materialDemands[0];assert.equal(Q.cmp(Q.fromExact(m.exactQuantity),Q.q('0.2')),0n);assert.equal(m.allocations[0].remaining,0);assert.equal(executionInventory(d)[0]['账面数量'],'0.2');
});
test('FR012 valid forward correction preserves originals; numeric corrections never erase history',()=>{
 const a=executionFixture(seed),b=structuredClone(a);Object.assign(b.executionFacts[0],{'工序完成数量':'50','观测分钟':'35','剩余工时分钟':'15'});b.executionMaterials[0]['累计已用数量']='50';assert.deepEqual(executionTransition(a,b),[]);assert.deepEqual(validateExecution(b),[]);assert.equal(run(b).tasks[0].duration,15);assert.equal(a.executionFacts[0]['工序完成数量'],'40');
});
test('FR012 reject deletion, altered original start/machine/completion, qty rollback and consumed rollback',()=>{
 const a=executionFixture(seed);
 const mutations=[d=>d.executionFacts=[],d=>d.executionMaterials=[],d=>d.executionFacts[0]['开始分钟']='1',d=>d.executionFacts[0]['当前设备']='MIX02',d=>d.executionFacts[0]['工序完成数量']='39',d=>d.executionFacts[0]['状态']='已开始',d=>d.executionMaterials[0]['累计已用数量']='39',d=>d.executionFacts[0]['观测分钟']='29'];
 for(const mutate of mutations){const d=structuredClone(a);mutate(d);assert.ok(executionTransition(a,d).length);}
 const c=executionFixture(seed,'已完成'),d=structuredClone(c);d.executionFacts[0]['完成分钟']='31';assert.ok(executionTransition(c,d).length);
});
test('FR012 pause resume has no decided semantics and cannot auto-confirm execution',()=>{
 const a=executionFixture(seed,'暂停'),b=structuredClone(a);b.executionFacts[0]['状态']='部分完成';assert.ok(executionTransition(a,b).length);
});
test('FR012 validate states, units, references, times, duplicate identities and overcompletion',()=>{
 const mutations=[d=>d.executionFacts[0]['状态']='合格',d=>d.executionFacts[0]['数量单位']='支',d=>d.executionFacts[0]['工序完成数量']='101',d=>d.executionFacts[0]['观测分钟']='-1',d=>d.executionFacts[0]['订单编号']='missing',d=>d.executionFacts[0]['当前设备']='FILL01',d=>d.executionFacts.push({...d.executionFacts[0],'事实编号':'OTHER'}),d=>d.executionMaterials.push({...d.executionMaterials[0],'记录编号':'C2'}),d=>d.executionMaterials[0]['单位']='g',d=>d.executionMaterials[0]['批次编号']='missing',d=>d.executionMaterials[0]['累计已用数量']='101',d=>d.executionFacts[0]['完成分钟']='20',d=>d.executionFacts[0]['剩余工时分钟']='0'];
 for(const mutate of mutations){const d=executionFixture(seed);mutate(d);assert.ok(validateInputs(defs,d).length);}
});
test('FR012 consumption exceeds available pre-consumption stock blocked; missing BOM and undefined reconciliation blocked',()=>{
 const d=executionFixture(seed);d.inventory[0]['账面数量']='45';assert.ok(validateExecution(d).some(i=>i.code==='EXECUTION_STOCK_OVERUSE'));d.inventory[0]['账面数量']='120';d.bom=[];assert.ok(validateExecution(d).length);
});
test('FR012 prevent changing executed demand, qualified completion, units, BOM or already-consumed stock basis',()=>{
 const a=executionFixture(seed);
 for(const mutate of [d=>d.orders[0]['合格需求']='101',d=>d.orders[0]['已完成合格数量']='40',d=>d.inventory[0]['账面数量']='80',d=>d.inventory[0]['已占用数量']='0',d=>d.materials[0]['单位']='g',d=>d.bom[0]['配置用量']='999']){const d=structuredClone(a);mutate(d);assert.ok(executionTransition(a,d).length);}
});
test('FR012 completed material demand must have matching full declared cumulative consumption',()=>{
 const d=executionFixture(seed,'已完成');d.executionMaterials[0]['累计已用数量']='40';const frozen=freezeRunInput(d,{},at);assert.ok(executionAdmission(frozen.executionData,frozen.conditions).length);assert.equal(run(d).tasks.length,0);
});
test('FR012 unsupported joint/batch/quality/minimal reconciliation fails closed, not fake completed output',()=>{
 const d=executionFixture(seed);assert.ok(executionAdmission(d,{mode:'minimal-r1'}).length);
 for(const flag of ['CAPACITY','PROGRAM','MOLD','STORAGE','DELIVERY'])assert.ok(executionAdmission(d,{mode:'supported',enabledRuleIds:[flag]}).length);
});
test('FR012 historical actual machine intervals protect other orders even outside selection',()=>{
 const d=executionFixture(seed,'已完成');d.inventory[0]['账面数量']='300';d.orders.push({...d.orders[0],'订单编号':'B'});d.dependencies.push(...d.dependencies.filter(x=>x['订单编号']==='A').map(x=>({...x,'订单编号':'B'})));const p=run(d,{orderIds:['B']});assert.deepEqual(p.findings,[]);assert.ok(p.tasks.every(t=>t.orderId==='B'));assert.equal(p.tasks[0].start,30);assert.equal(p.execution.facts.length,1);
});
test('FR012 active projection owns machine before priority orders; no machine overlap',()=>{
 const d=executionFixture(seed);d.orders.push({...d.orders[0],'订单编号':'B','优先顺序':'0'});d.dependencies.push(...d.dependencies.filter(x=>x['订单编号']==='A').map(x=>({...x,'订单编号':'B'})));d.inventory[0]['账面数量']='300';const p=run(d);assert.equal(p.tasks.find(t=>t.id==='A-MIX').start,30);assert.ok(p.tasks.find(t=>t.id==='B-MIX').start>=50);
});
test('FR012 fault at active remainder does not move original execution or declare quality, blocks with reason',()=>{
 const d=executionFixture(seed);d.downtime=[{'设备编号':'MIX01','起始分钟':'35','结束分钟':'60','原因':'模拟故障'}];const p=run(d);assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.code.includes('EXECUTION_EVENT_REVIEW')));assert.equal(p.execution.facts[0]['开始分钟'],'0');assert.equal(p.execution.facts[0]['状态'],'部分完成');
});
test('FR012 downstream execution requires completed predecessor; cannot invent missing facts',()=>{
 const d=executionFixture(seed);d.executionFacts.push({...d.executionFacts[0],'事实编号':'F-A-FILL','工序编号':'FILL','当前设备':'FILL01','开始分钟':'30','观测分钟':'40'});assert.ok(validateExecution(d).some(i=>i.field==='开始分钟'));
});
test('FR012 non-selected completed order consumption is unavailable to selected order, never restored as free stock',()=>{
 const d=executionFixture(seed,'已完成');d.orders.push({...d.orders[0],'订单编号':'B'});d.dependencies.push(...d.dependencies.filter(x=>x['订单编号']==='A').map(x=>({...x,'订单编号':'B'})));const p=run(d,{orderIds:['B']});assert.equal(p.tasks.length,0);assert.equal(p.materialDemands[0].shortage,90);assert.equal(p.materialDemands[0].allocations[0].quantity,10);assert.equal(d.inventory[0]['账面数量'],'120');
});
test('FR012 exact overcompletion cannot hide in floating precision at a large demand',()=>{
 const d=executionFixture(seed);d.orders[0]['合格需求']='1000000000000';d.executionFacts[0]['工序完成数量']='1000000000000.000000000001';assert.ok(validateExecution(d).some(i=>i.message.includes('超过订单需求')));
});
test('FR012 unavailable consumed lot flags both completed and partial facts without good-product inference',()=>{
 for(const state of ['部分完成','已完成']){const d=executionFixture(seed,state);d.inventory[0]['质量状态']='冻结';const p=run(d);assert.ok(p.execution.risks.some(r=>r.lots.includes('EX-LOT')));assert.ok(p.findings.some(r=>r.code.includes('EXECUTION_EVENT_REVIEW')));assert.equal(p.tasks.some(t=>t.id==='A-FILL'),false);if(state==='已完成'){assert.equal(p.tasks[0].start,0);assert.equal(p.tasks[0].end,30);}else assert.equal(p.tasks.length,0);assert.equal(d.executionFacts[0]['状态'],state);}
});
test('FR012 frozen rule evaluation determines consumed-lot risk, not later Worker wall time or future policy',()=>{
 const d=executionFixture(seed);const material=d.rules.find(r=>r['规则编号']==='MATERIAL');material['生效时间']='2026-11-01T00:00:00Z';material['参数JSON']=JSON.stringify({'允许预计供给':false,'可用状态':['未来状态'],'预计状态':['预计可用'],'不可用状态':['合格','冻结']});
 const early=run(d);assert.equal(early.execution.risks.length,0);assert.equal(early.tasks[0].duration,20);
 const frozen=freezeRunInput(d,{},'2026-11-01T00:00:00Z'),late=calculate(frozen.executionData,0,'2026-11-01T00:00:00Z',frozen.conditions);assert.equal(late.tasks.length,0);assert.ok(late.execution.risks.length);assert.equal(frozen.conditions.executionSummary.risks.length,1);
});
test('FR012 selected rule flags are frozen into global execution-risk context and condition summary',()=>{
 const d=executionFixture(seed);d.inventory[0]['质量状态']='显式查询可用';d.rules.find(r=>r['规则编号']==='INVENTORY')['参数JSON']=JSON.stringify({'可用质量状态':['显式查询可用']});
 const enabledRuleIds=d.rules.filter(r=>r['是否启用']==='是'&&r['规则编号']!=='MATERIAL').map(r=>r['规则编号']);const frozen=freezeRunInput(d,{enabledRuleIds},at),p=calculate(frozen.executionData,0,at,frozen.conditions);
 assert.equal(frozen.executionData.executionContext.rules.find(r=>r['规则编号']==='MATERIAL')['是否启用'],'否');assert.equal(frozen.conditions.executionSummary.risks.length,0);assert.equal(p.execution.risks.length,0);assert.equal(p.materialChecked,false);assert.equal(p.tasks[0].duration,20);assert.equal(d.rules.find(r=>r['规则编号']==='MATERIAL')['是否启用'],'是');
});
