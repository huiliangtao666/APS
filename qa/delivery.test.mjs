import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,seed} from '../server/planner.ts';
import {deliveryFixture} from './delivery-fixture.mjs';
import {freezeRunInput} from '../server/run-input.mjs';
import {validateInputs} from '../server/input-validation.mjs';
import {defs} from '../server/planner.ts';
import {exportSupplyPlanCsv} from '../src/lib/expected-supply.mjs';
import {queryData} from '../src/lib/data-query.mjs';
const at='2026-10-29T00:00:00Z';
const run=(d,selection={})=>{const f=freezeRunInput(d,selection,at);return calculate(f.executionData,0,at,f.conditions);};
const result=p=>p.deliveryAssessment.orders[0];
test('FR023 AC18 12:00 production plus120 wait delivers14:00 vs13:00; conditional quantity and dates',()=>{
 const d=deliveryFixture(seed);d.orders[0]['要求可交付分钟']='300';const before=JSON.stringify(d),p=run(d,{startMinute:180}),o=result(p);
 assert.equal(JSON.stringify(d),before);assert.equal(o.completionMinute,240);assert.equal(o.expectedDeliverableMinute,360);assert.equal(o.delayMinutes,60);assert.equal(o.delayedQuantity,96);assert.equal(o.expectedDeliverableAt,'2026-11-02T06:00:00.000Z');assert.equal(o.dueAt,'2026-11-02T05:00:00.000Z');assert.equal(o.promised,false);assert.equal(o.status,'conditional-late');assert.equal(o.unknownDeliverableQuantity,0);assert.equal(p.ruleSnapshot.capabilityVersion,'FR023-v1');
 assert.equal(p.deliveryAssessment.taskCompletions.length,2);assert.match(p.deliveryAssessment.label,/找到的可行时间/);assert.match(p.deliveryAssessment.limits.join(),/非全局最早/);
});
test('FR023 exact due boundary is conditional only; wait missing is unknown rather than0',()=>{
 const d=deliveryFixture(seed);d.orders[0]['要求可交付分钟']='180';let o=result(run(d));assert.equal(o.delayMinutes,0);assert.equal(o.status,'conditional-assessed');assert.equal(o.promised,false);
 d.products[0]['模拟交付等待分钟']='';o=result(run(d));assert.equal(o.expectedDeliverableMinute,null);assert.equal(o.delayMinutes,null);assert.equal(o.delayedQuantity,null);assert.ok(o.reasons.some(r=>r.code==='WAIT_UNKNOWN'));
});
test('FR023 partial horizon and entirely unscheduled orders never claim order completion or zero lateness',()=>{
 for(const endMinute of [20,45]){const p=run(deliveryFixture(seed),{endMinute}),o=result(p);assert.equal(o.completionMinute,null);assert.equal(o.expectedDeliverableMinute,null);assert.equal(o.delayMinutes,null);assert.equal(o.delayedQuantity,null);assert.equal(o.unknownDeliverableQuantity,96);assert.ok(p.findings.some(f=>f.code.includes('HORIZON')));assert.match(exportSupplyPlanCsv(p),/订单完成与交期影响/);assert.match(exportSupplyPlanCsv(p),/unknownDeliverableQuantity/);}
});
test('FR023 partial split retains known-late lower bound with unknown remainder and exact quantities',()=>{
 const d=deliveryFixture(seed);d.orders[0]['合格需求']='480';d.orders[0]['要求可交付分钟']='10';const p=run(d,{endMinute:60}),o=result(p);
 assert.equal(o.completionMinute,null);assert.equal(o.delayMinutes,null);assert.equal(o.delayedQuantity,null);assert.equal(o.knownLateQuantity,240);assert.equal(o.unknownDeliverableQuantity,240);assert.equal(o.knownCompletedQuantity,240);assert.deepEqual(o.exactKnownLateQuantity,{numerator:'240',denominator:'1'});
});
test('FR023 multiorder shared resource batch keeps order requirement, quantity and identity separate',()=>{
 const d=deliveryFixture(seed);d.orders.push({...d.orders[0],'订单编号':'B','合格需求':'96','要求可交付分钟':'100'});d.dependencies.push(...d.dependencies.filter(r=>r['订单编号']==='A').map(r=>({...r,'订单编号':'B'})));d.deliveryConditions.push({...d.deliveryConditions[0],'订单编号':'B'});
 const p=run(d),[a,b]=p.deliveryAssessment.orders;assert.equal(p.tasks.length,4);assert.equal(a.delayMinutes,0);assert.equal(a.delayedQuantity,0);assert.equal(b.delayMinutes,80);assert.equal(b.delayedQuantity,96);assert.ok(a.batches[0].productionBatchId!==b.batches[0].productionBatchId);assert.ok(a.taskIds.every(id=>p.tasks.find(t=>t.id===id).orderId==='A'));assert.ok(p.tasks.filter(t=>t.predecessor).every(t=>t.timingReasons.some(r=>r.code==='PRECEDENCE'&&r.sourceTaskIds.includes(t.predecessor))));
 const f=freezeRunInput(d,{orderIds:['B']},at);assert.deepEqual(f.executionData.deliveryConditions.map(r=>r['订单编号']),['B']);assert.deepEqual(run(d,{orderIds:['B']}).deliveryAssessment.orders.map(o=>o.orderId),['B']);
});
test('FR023 minimal machine-only ignores active delivery and supply; missing material/capacity scope remains unknown',()=>{
 const d=deliveryFixture(seed);let p=run(d,{mode:'minimal-r1'});assert.equal(p.tasks.length,2);assert.equal(result(p).expectedDeliverableMinute,null);assert.equal(result(p).delayMinutes,null);assert.equal(p.deliveryAssessment.mode,'minimal-r1');assert.equal(p.deliveryAssessment.active,false);
 for(const r of d.rules)if(['MATERIAL','CAPACITY','PROGRAM'].includes(r['规则编号']))r['是否启用']='否';p=run(d);assert.equal(result(p).delayMinutes,null);assert.ok(result(p).reasons.some(r=>r.code==='SCOPE_INCOMPLETE'));
});
test('FR023 disabled/future delivery or missing quality conditions never infer promised or successful delivery',()=>{
 for(const mutate of [d=>d.rules.find(r=>r['规则编号']==='DELIVERY')['是否启用']='否',d=>d.rules.find(r=>r['规则编号']==='DELIVERY')['生效时间']='2027-01-01T00:00:00Z',d=>d.deliveryConditions=[]]){const d=deliveryFixture(seed);mutate(d);const o=result(run(d));assert.equal(o.expectedDeliverableMinute,null);assert.equal(o.delayMinutes,null);assert.equal(o.promised,false);}
});
test('FR023 simulated quality ready can dominate packaging/wait, with explicit condition and offset-equivalent instant',()=>{
 const d=deliveryFixture(seed),q=d.deliveryConditions[0];q['模拟质量状态']='模拟预计可用';q['模拟质量可用时间']='2026-11-03T01:00:00+08:00';let o=result(run(d));assert.equal(o.expectedDeliverableMinute,1020);assert.equal(o.expectedDeliverableAt,'2026-11-02T17:00:00.000Z');assert.equal(o.qualityCondition['模拟质量状态'],'模拟预计可用');
 q['模拟质量可用时间']='2026-11-02T17:00:00Z';assert.equal(result(run(d)).expectedDeliverableMinute,1020);
 for(const state of ['待检','模拟不合格']){q['模拟质量状态']=state;o=result(run(d));assert.equal(o.expectedDeliverableMinute,null);assert.equal(o.delayMinutes,null);assert.ok(o.reasons.some(r=>r.code==='QUALITY_BLOCKED'));}
});
test('FR023 remaining-life equality passes, one minute short fails without relaxing quality/expiry',()=>{
 const d=deliveryFixture(seed),q=d.deliveryConditions[0];q['模拟有效期截止时间']='2026-11-02T12:00:00+08:00';q['要求剩余有效分钟']='60';assert.equal(result(run(d)).expectedDeliverableMinute,180);
 q['要求剩余有效分钟']='61';const o=result(run(d));assert.equal(o.expectedDeliverableMinute,null);assert.equal(o.delayMinutes,null);assert.equal(o.unknownDeliverableQuantity,96);assert.ok(o.reasons.some(r=>r.code==='REMAINING_LIFE'));
});
test('FR023 invalid dates/offsetless times/ambiguous expiry or duplicate/foreign rows fail canonical input validation',()=>{
 for(const mutate of [d=>d.deliveryConditions[0]['模拟有效期截止时间']='2026-02-30T12:00:00+08:00',d=>d.deliveryConditions[0]['模拟质量可用时间']='2026-11-02T12:00:00',d=>d.deliveryConditions[0]['模拟有效期截止时间']='2026-12-31',d=>d.deliveryConditions.push({...d.deliveryConditions[0]}),d=>d.deliveryConditions[0]['订单编号']='MISSING',d=>d.deliveryConditions[0]['要求剩余有效分钟']='0.5',d=>d.rules.find(r=>r['规则编号']==='DELIVERY')['参数JSON']='{}']){const d=deliveryFixture(seed);mutate(d);assert.ok(validateInputs(defs,d).length>0);}
});
test('FR023 AC14 configured maximum-wait semantics stay unresolved even when machine timing is complete',()=>{
 const d=deliveryFixture(seed);d.routes[1]['最大等待分钟']='10';const o=result(run(d));assert.equal(o.completionMinute,60);assert.equal(o.expectedDeliverableMinute,null);assert.equal(o.delayMinutes,null);assert.ok(o.reasons.some(r=>r.code==='MAX_WAIT_UNRESOLVED'));
});
test('FR023 completed historical quantity is not a delivery timestamp or new zero-lateness success',()=>{
 const d=deliveryFixture(seed);d.orders[0]['已完成合格数量']='96';const o=result(run(d));assert.equal(o.remainingQuantity,0);assert.equal(o.completionMinute,null);assert.equal(o.expectedDeliverableMinute,null);assert.equal(o.delayMinutes,null);
});
test('FR023 AC11/20 10:00 arrival cannot feed before11:00; delay changes causal chain without mutating old assessment',()=>{
 const d=deliveryFixture(seed);d.rules.find(r=>r['规则编号']==='MATERIAL')['参数JSON']=JSON.stringify({'允许预计供给':true,'可用状态':['合格'],'预计状态':['预计可用'],'不可用状态':['待检','冻结','不合格']});
 d.inventory=d.inventory.filter(r=>r['物料编号']!=='LEAN');
 d.supplies=[{'供给编号':'S1','物料编号':'LEAN','批次编号':'EXPECTED-LOT','预计数量':'65','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];d.supplyUses=[{'引用编号':'U1','订单编号':'A','工序编号':'MIX','供给编号':'S1','使用数量':'65'}];
 const p=run(d),saved=JSON.stringify(p),a=result(p);assert.equal(p.tasks[0].start,180);assert.equal(a.expectedDeliverableMinute,360);assert.equal(a.delayMinutes,60);assert.ok(a.timingReasons.some(t=>t.reasons.some(r=>r.code==='MATERIAL')));assert.equal(a.supplyConditions[0]['批次编号'],'EXPECTED-LOT');assert.ok(a.materialAllocations.some(a=>a.supplyId==='S1'&&a.conditional));
 d.supplyDelays=[{'记录编号':'D1','供给编号':'S1','记录时间':'2026-10-29T08:00:00+08:00','调整后到达时间':'2026-11-02T11:00:00+08:00','调整后可用时间':'2026-11-02T12:00:00+08:00','原因':'模拟延期到料'}];const b=result(run(d));assert.equal(b.expectedDeliverableMinute-a.expectedDeliverableMinute,60);assert.equal(b.delayMinutes-a.delayMinutes,60);assert.equal(b.supplyConditions[0]['延期记录'][0]['原因'],'模拟延期到料');assert.equal(JSON.stringify(p),saved);
 d.personnelGroups=[{'人员组编号':'G','人员组名称':'更多人','人员数量':'20','技能':'mix','班次':'day','可用起始分钟':'0','可用结束分钟':'600'}];assert.equal(result(run(d)).delayMinutes,b.delayMinutes); // additional unused labor cannot remove supply bottleneck
 assert.match(exportSupplyPlanCsv(p),/EXPECTED-LOT/);assert.match(exportSupplyPlanCsv(p),/FR023-v1/);assert.match(queryData(d,[p],p.id).tasks[0]['订单完成与交期影响'],/conditional/);
});

import {claim,enableJoint} from './joint-fixture.mjs';
test('FR023 AC14 explicit600+600kg over1000 space preserves occupancy source and causal shift without claiming max-wait support',()=>{
 const d=deliveryFixture(seed);d.orders[0]['合格需求']='480';d.batchResources=d.batchResources.filter(r=>r['资源类型']!=='批处理装载');d.batchResources.push({'资源编号':'SPACE','资源类型':'共享冷却空间','容量':'1000','单位':'kg','允许程序':'','说明':'每生产批显式600kg'});d.resourceClaims=[claim('C1','A','MIX','SPACE','空间','600','kg','0','10')];enableJoint(d,'STORAGE');
 const p=run(d),o=result(p);assert.deepEqual(p.tasks.filter(t=>t.operation==='MIX').map(t=>t.start),[0,40]);assert.ok(o.timingReasons.some(t=>t.reasons.some(r=>r.code==='JOINT_RESOURCE')));assert.equal(p.resourceReservations.filter(r=>r.type==='空间').length,2);assert.ok(p.resourceReservations.filter(r=>r.type==='空间').every(r=>r.taskIds.length));assert.ok(p.deliveryAssessment.limits.some(x=>x.includes('最大等待')));
});
test('FR023 pending tooling declarations with rule disabled make delivery scope incomplete',()=>{
 const d=deliveryFixture(seed);d.resourceClaims=[claim('C1','A','MIX','UNDECLARED')];const o=result(run(d));assert.equal(o.expectedDeliverableMinute,null);assert.equal(o.delayMinutes,null);
});
test('FR023 shortage rejection before batch creation remains unknown and present in export',()=>{
 const d=deliveryFixture(seed);d.orders[0]['合格需求']='300';d.machines.forEach(m=>m['最小装载kg']='200');const p=run(d),o=result(p);assert.equal(p.tasks.length,0);assert.equal(o.expectedDeliverableMinute,null);assert.equal(o.delayMinutes,null);assert.equal(o.unknownDeliverableQuantity,300);assert.match(exportSupplyPlanCsv(p),/UNDER_MIN_LOAD/);
});

test('FR023 out-of-range dates cannot crash report or produce zero-lateness success',()=>{
 const d=deliveryFixture(seed);d.orders[0]['要求可交付分钟']='1'+'0'.repeat(100);let o=result(run(d));assert.equal(o.dueAt,null);assert.equal(o.delayMinutes,null);assert.equal(o.delayedQuantity,null);
 d.orders[0]['要求可交付分钟']='300';d.products[0]['模拟交付等待分钟']='9007199254740991';o=result(run(d));assert.equal(o.expectedDeliverableMinute,null);assert.equal(o.delayMinutes,null);
});
