import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculate,defs} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
import {validateInputs} from '../server/input-validation.mjs';
import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {base} from './ac14-fixture.mjs';
import {fixture} from './fr027-fixture.mjs';
const at='2026-10-29T00:00:00Z';
const plan=d=>{const f=freezeRunInput(d,{},at);return {p:calculate(f.executionData,1,at,f.conditions),f};};
const audit=(p,f)=>independentlyVerifyPlan(p,f.executionData.orders,f.executionData.routes,p.rules,at,f.executionData,f.conditions);
const outputBasis=d=>{d.machines.filter(m=>m['工序编号']==='FILL').forEach(m=>m['装载计量基准']='合格产出');return d;};
test('L01 exact input500/output480 nodes and independent forged-node detection',()=>{
 const d=outputBasis(base()),raw=JSON.stringify(d),{p,f}=plan(d);
 assert.equal(JSON.stringify(d),raw);assert.equal(p.tasks.length,4);assert.equal(p.findings.length,0);
 assert.deepEqual(p.resourceBatches.map(g=>[g.operation,g.basis,g.loadKg]),[['MIX','BOM总投入',500],['FILL','合格产出',480]]);
 assert.equal(audit(p,f).checks.batchAndWait.status,'pass');
 const broken=structuredClone(p);broken.resourceBatches[1].loadKg=500;broken.resourceBatches[1].exactLoadKg={numerator:'500',denominator:'1'};
 assert.equal(audit(broken,f).checks.batchAndWait.status,'problem');
 const task=structuredClone(p);task.tasks.find(t=>t.operation==='FILL').loadKg=250;assert.equal(audit(task,f).checks.batchAndWait.status,'problem');
});
test('L02 400kg space splits furnace, covers both orders, wait0, material500 without input mutation',()=>{
 const d=outputBasis(base('400')),raw=JSON.stringify(d),{p,f}=plan(d);
 assert.equal(JSON.stringify(d),raw);assert.equal(p.tasks.length,4);assert.equal(p.findings.length,0);
 assert.deepEqual(p.resourceBatches.map(g=>[g.operation,g.loadKg]),[['MIX',250],['FILL',240],['MIX',250],['FILL',240]]);
 for(const id of ['A','B'])assert.equal(p.tasks.find(t=>t.orderId===id&&t.operation==='FILL').start-p.tasks.find(t=>t.orderId===id&&t.operation==='MIX').end,0);
 for(const t of p.resourceReservations.filter(r=>r.type==='空间'))assert.equal(p.resourceReservations.filter(r=>r.type==='空间'&&r.start<=t.start&&r.end>t.start).reduce((s,r)=>s+Number(r.quantity),0),240);
 assert.equal(p.materialDemands.filter(r=>r.committed).reduce((s,r)=>s+r.quantity,0),500);
 assert.ok(Object.values(audit(p,f).checks).every(c=>c.status==='pass'));
});
test('W01 W03b intrinsic wait gaps survive MAX_LAG off, and fixed-output verifier detects removing the finding',()=>{
 for(const enabled of ['否','是']){
  const d=base();d.rules.find(r=>r['规则编号']==='MAX_LAG')['是否启用']=enabled;
  d.downtime.push({'设备编号':'FILL01','起始分钟':'0','结束分钟':'150','原因':'cold opens late'});
  const {p,f}=plan(d),gap=p.findings.find(f=>f.code==='CONSTRAINT / MAX_LAG');assert.equal(gap.context.actualWait,30);assert.equal(gap.context.gap,20);
  assert.equal(gap.taskIds.length,4);p.findings=[];assert.equal(audit(p,f).checks.batchAndWait.status,'problem');
 }
});
test('waiting exact10 boundary, 10.1 gap, zero limit, blank no inferred limit, invalid values fail closed',()=>{
 for(const [limit,start,gap] of [['10',130,false],['10',130.1,true],['0',120,false],['0',120.1,true],['',150,false]]){
  const d=base();d.routes.find(r=>r['工序编号']==='FILL')['最大等待分钟']=limit;d.downtime.push({'设备编号':'FILL01','起始分钟':'0','结束分钟':String(start),'原因':'boundary'});
  const {p}=plan(d);assert.equal(p.findings.some(f=>f.code==='CONSTRAINT / MAX_LAG'),gap);
 }
 for(const value of ['-1','NaN','Infinity','abc']){const d=base();d.routes[1]['最大等待分钟']=value;assert.ok(validateInputs(defs,d).length);assert.equal(plan(d).p.tasks.length,0);}
});
test('output-device exact capacity normalizes to input; no silent intermediate-node interpretation',()=>{
 const d=outputBasis(base());d.machines.filter(m=>m['工序编号']==='FILL').forEach(m=>m['最大装载kg']='240');d.batchResources.filter(r=>r['资源编号'].startsWith('FILL')).forEach(r=>r['容量']='240');
 const {p,f}=plan(d);assert.equal(p.tasks.length,4);assert.deepEqual(p.resourceBatches.filter(g=>g.operation==='FILL').map(g=>g.loadKg),[240,240]);assert.equal(audit(p,f).checks.batchAndWait.status,'pass');
 d.machines.find(m=>m['工序编号']==='FILL')['装载计量基准']='中间半成品';const blocked=plan(d).p;assert.equal(blocked.tasks.length,0);assert.ok(blocked.findings.length);
});
test('unschedulable single declared claim never bypasses space capacity, split toggle and tail still protect input',()=>{
 const d=base('200'),{p}=plan(d);assert.equal(p.tasks.filter(t=>t.operation==='FILL').length,0);assert.ok(p.findings.some(f=>f.code==='UNPLANNED / JOINT_RESOURCE'));assert.ok(!p.resourceReservations.some(r=>r.type==='空间'));
});
test('Express/real Worker gap verify reports problem, confirmation refused; old run, facts and input immutable; bad writes byte-identical',async t=>{
 const api=await fixture(t),d=base();d.downtime.push({'设备编号':'FILL01','起始分钟':'0','结束分钟':'150','原因':'cold opens late'});
 await api.ok('/inputs',{revision:0,tables:d});const state=await api.ok('/state'),first=await api.ok('/calculate',{revision:state.revision});
 assert.equal(first.tasks.length,4);assert.ok(first.findings.some(f=>f.code==='CONSTRAINT / MAX_LAG'));
 const verified=await api.ok('/plans/'+first.id+'/verify',{});assert.equal(verified.verification.checks.batchAndWait.status,'problem');
 const old=JSON.parse(api.bytes()),storedPlan=JSON.stringify(old.plans.find(p=>p.id===first.id)),oldRuns=JSON.stringify(old.runs),facts=JSON.stringify(old.data.executionFacts),inputs=JSON.stringify(old.inputVersions);
 const reviewed=await api.ok('/plans/'+first.id+'/review');assert.ok(reviewed.blockers.length);
 let before=api.bytes();assert.equal((await api.call('/plans/'+first.id+'/submit',{revision:reviewed.revision,workflowRevision:reviewed.workflowRevision,reviewHash:reviewed.reviewHash,acceptPartial:true,acknowledgeScope:true})).status,409);assert.equal(api.bytes(),before);
 before=api.bytes();assert.equal((await api.call('/inputs',{revision:state.revision,tables:{orders:d.orders.map(o=>({...o,'合格需求':'-1'}))}})).status,400);assert.equal(api.bytes(),before);
 before=api.bytes();assert.equal((await api.call('/inputs',{revision:state.revision,tables:{orders:d.orders}},'query')).status,403);assert.equal(api.bytes(),before);
 const next=await api.ok('/calculate',{revision:state.revision});assert.notEqual(next.id,first.id);
 const after=JSON.parse(api.bytes());assert.equal(JSON.stringify(after.plans.find(p=>p.id===first.id)),storedPlan);assert.equal(JSON.stringify(after.runs.filter(r=>old.runs.some(o=>o.id===r.id))),oldRuns);assert.equal(JSON.stringify(after.data.executionFacts),facts);assert.equal(JSON.stringify(after.inputVersions),inputs);
});
