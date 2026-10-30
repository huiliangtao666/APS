import test from 'node:test';import assert from 'node:assert/strict';
import {calculate,defs} from '../server/planner.ts';import {freezeRunInput} from '../server/run-input.mjs';import {validateInputs} from '../server/input-validation.mjs';
import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';import {exportSupplyPlanCsv} from '../src/lib/expected-supply.mjs';import {jointEnabledFixture} from './r01r02-fixture.mjs';
const solve=(d,selection={})=>{const f=freezeRunInput(d,selection,'2026-10-30T00:00:00Z'),p=calculate(f.executionData,1,f.conditions.ruleEvaluationAt,f.conditions);return {f,p};};
const mix=p=>p.tasks.filter(t=>t.operation==='MIX');
test('R01 multi-member tool+independent personnel posts+physical pool+space+material hold together',()=>{
 const d=jointEnabledFixture();assert.deepEqual(validateInputs(defs,d),[]);const {f,p}=solve(d);
 assert.equal(p.tasks.length,4,JSON.stringify(p.findings));assert.deepEqual(mix(p).map(t=>t.start),[0,0]);assert.equal(mix(p)[0].resourceBatchId,mix(p)[1].resourceBatchId);
 assert.equal(p.resourceReservations.filter(r=>r.type==='工装').reduce((s,r)=>s+Number(r.quantity),0),2);
 const labor=p.resourceReservations.filter(r=>r.type==='人员');assert.equal(labor.length,3);assert.equal(new Set(labor.map(r=>r.demandKey)).size,3);assert.equal(labor.reduce((s,r)=>s+Number(r.quantity),0),3);assert.ok(labor.every(r=>r.poolId==='P'));
 assert.equal(p.materialDemands.filter(r=>r.committed).reduce((s,r)=>s+r.quantity,0),500);assert.equal(p.productionBatches.reduce((s,r)=>s+r.quantity,0),480);
 assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');assert.match(exportSupplyPlanCsv(p),/联合候选与保守回退/);
});
test('R02 any single enabled condition failure leaves whole multi-member cycle without ghost commit',()=>{
 for(const [label,mutate] of [['tool',d=>d.tools[0]['可用数量']='1'],['pool',d=>d.personnelPools[0]['总人数']='2'],['space',d=>d.batchResources.at(-1)['容量']='500'],['material',d=>d.inventory[0]['账面数量']='1'],['skill',d=>d.personnelGroups.forEach(g=>g['技能']='WRONG')],['calendar',d=>d.calendars[0]['结束分钟']='20']]){
  const d=jointEnabledFixture();mutate(d);const {p}=solve(d);assert.equal(p.tasks.length,0,label+JSON.stringify(p.findings));assert.equal(p.resourceReservations.length,0,label);assert.ok(p.materialDemands.every(r=>!r.committed),label);assert.ok(p.findings.length,label);assert.ok(p.jointAttempts.length,label);
 }
});
test('R02 material arrival forces personnel, tooling, space, downtime and horizon recheck at new candidate',()=>{
 const d=jointEnabledFixture();d.inventory[0]['预计可用时间']='2026-11-02T09:00:00+08:00';d.downtime=[{'设备编号':'MIX01','起始分钟':'60','结束分钟':'90','原因':'合成停机'}];
 const {f,p}=solve(d);assert.deepEqual(mix(p).map(t=>t.start),[90,90]);assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');assert.ok(p.jointAttempts.at(0).candidate===0);assert.ok(mix(p)[0].timingReasons.some(r=>r.code==='MATERIAL'));assert.ok(mix(p)[0].timingReasons.some(r=>r.code==='CALENDAR'));
 for(const mutate of [x=>x.tools[0]['可用结束分钟']='100',x=>x.personnelGroups.forEach(g=>g['可用结束分钟']='100')]){const x=structuredClone(d);mutate(x);const q=solve(x).p;assert.equal(q.tasks.length,0);assert.equal(q.resourceReservations.length,0);assert.ok(q.materialDemands.every(r=>!r.committed));}
 const q=solve(d,{endMinute:100}).p;assert.equal(q.tasks.length,0);assert.equal(q.resourceReservations.length,0);assert.ok(q.materialDemands.every(r=>!r.committed));
});
test('independent frozen checker rejects missing member/post/tool, altered material allocation/time/source/capacity and disabled flags',()=>{
 const {f,p}=solve(jointEnabledFixture());
 for(const mutate of [x=>x.resourceReservations.splice(x.resourceReservations.findIndex(r=>r.type==='工装'),1),x=>x.resourceReservations.splice(x.resourceReservations.findIndex(r=>r.type==='人员'),1),x=>x.materialDemands=[],x=>x.materialDemands[0].allocations[0].exactQuantity.numerator='1',x=>x.materialDemands[0].feedMinute=1,x=>x.materialDemands[0].allocations[0].lotId='UNKNOWN',x=>x.materialChecked=false,x=>x.jointConditionsContract=null,x=>{x.tasks[0].exactQuantity={numerator:'1',denominator:'1'};x.tasks[0].quantity=1;}]){const x=structuredClone(p);mutate(x);assert.equal(verifyResourcePolicies(x,f.executionData,f.conditions).status,'problem');}
 for(const mutate of [d=>d.inventory[0]['账面数量']='1',d=>d.inventory[0]['质量状态']='冻结',d=>d.inventory[0]['预计可用时间']='2026-11-03T00:00:00+08:00',d=>d.downtime.push({'设备编号':'MIX01','起始分钟':'0','结束分钟':'30'})]){const x=structuredClone(f.executionData);mutate(x);assert.equal(verifyResourcePolicies(p,x,f.conditions).status,'problem');}
});
test('U01/U02 and missing/unsupported inputs fail closed, explicit switched-off tool is truthfully unchecked',()=>{
 for(const mutate of [d=>d.personnelPools[0]['允许共用']='否',d=>d.personnelPools[0]['交接设置']='1',d=>d.resourceClaims[0]['需求数量']='',d=>d.resourceClaims[0]['占用口径']='下游释放']){const d=jointEnabledFixture();mutate(d);assert.ok(validateInputs(defs,d).length);}
 const d=jointEnabledFixture();d.rules.find(r=>r['规则编号']==='MOLD')['是否启用']='否';d.tools[0]['可用数量']='1';const {p}=solve(d);assert.equal(p.tasks.length,4);assert.equal(p.jointResourceChecks.MOLD,false);assert.ok(p.resourceReservations.every(r=>r.type!=='工装'));
});

test('competing resource batches honor delayed tooling/space release and partial material commit isolation',()=>{
 const d=jointEnabledFixture();d.orders.push({...d.orders[0],'订单编号':'C','优先顺序':'3'});d.dependencies.push(...d.dependencies.filter(r=>r['订单编号']==='A').map(r=>({...r,'订单编号':'C'})));d.resourceClaims.push(...d.resourceClaims.filter(r=>r['订单编号']==='A').map(r=>({...r,'声明编号':r['声明编号']+'C','订单编号':'C'})));
 const {f,p}=solve(d);assert.deepEqual(mix(p).map(t=>t.start),[0,0,60]);assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');
 d.inventory[0]['账面数量']='325';const q=solve(d).p;assert.equal(q.tasks.length,4);assert.equal(q.materialDemands.filter(r=>r.committed).reduce((s,r)=>s+r.quantity,0),500);assert.ok(q.resourceReservations.every(r=>r.taskIds.every(id=>!id.includes('"C"'))));
});

test('candidate search bound leaves all ledgers uncommitted and explicitly reports search-not-found',()=>{
 const d=jointEnabledFixture();d.calendars[0]['结束分钟']='5000';d.tools[0]['可用结束分钟']='5000';d.personnelGroups.forEach(g=>g['可用结束分钟']='5000');d.inventory[0]['账面数量']='1';
 d.inventory.push(...Array.from({length:1001},(_,i)=>({...d.inventory[1],'批次编号':'FUTURE'+i,'账面数量':'0','预计可用时间':new Date(Date.parse('2026-11-02T00:00:00Z')+(i+1)*60000).toISOString()})));
 const {p}=solve(d);assert.equal(p.tasks.length,0);assert.equal(p.resourceReservations.length,0);assert.ok(p.materialDemands.every(r=>!r.committed));assert.equal(p.jointAttempts.length,1000);assert.equal(p.jointAttempts.at(-1).searchStatus,'limit');assert.match(p.jointAttempts.at(-1).reason,/1000.*不代表全局无解/);
});
