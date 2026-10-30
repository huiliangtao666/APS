// Run only after npm run build, inside the disposable app container.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {seed} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
test('FR018 production worker bundle executes a frozen selection and returns actual horizon findings',async()=>{
 const frozen=freezeRunInput(seed,{orderIds:['A'],startMinute:60,endMinute:100});
 const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:0,calculatedAt:new Date().toISOString()}});
 const result=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);worker.on('exit',code=>{if(code)reject(Error('worker exit '+code));});});
 assert.deepEqual(result.tasks.map(t=>t.id),['A-MIX']);assert.equal(result.tasks[0].start,60);assert.ok(result.findings.some(f=>f.code.includes('HORIZON')));await worker.terminate();
});


test('FR019 production Worker bundle applies explicit minimal mode beyond calendar end',async()=>{
 const frozen=freezeRunInput(seed,{mode:'minimal-r1',orderIds:['A'],startMinute:600,endMinute:660});
 const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:0,calculatedAt:new Date().toISOString()}});
 try{
  const p=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);});
  assert.deepEqual(p.tasks.map(t=>[t.start,t.end]),[[600,630],[630,660]]);assert.equal(p.findings.length,0);assert.equal(p.ruleSnapshot.checkScope.mode,'minimal-r1');assert.match(p.ruleSnapshot.note,/不代表完整业务/);
 }finally{await worker.terminate();}
});

import {materialFixture} from './material-fixture.mjs';
test('FR020 production Worker calculates BOM,FEFO lots and packaging from frozen canonical data',async()=>{
 const data=materialFixture(seed),frozen=freezeRunInput(data,{endMinute:600});
 const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:0,calculatedAt:'2026-10-29T00:00:00Z'}});
 try{
  const p=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);});
  assert.equal(p.tasks.length,2);assert.equal(p.materialChecked,true);assert.deepEqual(p.materialDemands.map(r=>r.quantity),[325,75,75,25,1213]);assert.ok(p.materialDemands.every(r=>r.committed&&r.shortage===0));assert.equal(p.ruleSnapshot.capabilityVersion,'FR020-v1');
 }finally{await worker.terminate();}
});

import {batchFixture} from './batch-fixture.mjs';
test('FR021 production Worker preserves exact split/resource identities and material conservation',async()=>{
 const data=batchFixture(seed),frozen=freezeRunInput(data,{endMinute:600});
 const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:0,calculatedAt:new Date().toISOString()}});
 try{const p=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);});
 assert.equal(p.tasks.length,4);assert.ok(p.tasks.every(t=>t.duration===30));assert.deepEqual(p.productionBatches.map(b=>b.load),[250,250]);assert.equal(p.materialDemands.reduce((n,r)=>n+r.quantity,0),500);assert.ok(p.materialDemands.every(r=>r.committed));assert.equal(p.ruleSnapshot.capabilityVersion,'FR021-v1');
 }finally{await worker.terminate();}
});

import {jointFixture} from './joint-fixture.mjs';
test('FR022 built production Worker enforces saved joint declarations with two-set capacity',async()=>{
 const d=jointFixture(seed),frozen=freezeRunInput(d,{endMinute:600});
 const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:0,calculatedAt:new Date().toISOString()}});
 try{const p=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);});
 assert.deepEqual(p.tasks.filter(t=>t.operation==='MIX').map(t=>t.start),[0,0,30]);assert.equal(p.resourceReservations.filter(r=>r.type==='工装').length,3);assert.equal(p.ruleSnapshot.capabilityVersion,'FR022-v1');assert.ok(p.resourceReservations.every(r=>r.taskIds.length));
 }finally{await worker.terminate();}
});

import {deliveryFixture} from './delivery-fixture.mjs';
test('FR023 built production Worker keeps completion distinct from conditional deliverable and unknown partial work',async()=>{
 for(const endMinute of [600,220]){
  const d=deliveryFixture(seed),frozen=freezeRunInput(d,{startMinute:180,endMinute},'2026-10-29T00:00:00Z');
  const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:0,calculatedAt:'2026-10-29T00:00:00Z'}});
  try{const p=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);});const o=p.deliveryAssessment.orders[0];assert.equal(o.expectedDeliverableMinute,endMinute===600?360:null);assert.equal(o.delayMinutes,endMinute===600?60:null);assert.equal(o.promised,false);assert.equal(p.deliveryAssessment.version,'FR023-v1');assert.ok(p.tasks.every(t=>Array.isArray(t.timingReasons)));}
  finally{await worker.terminate();}
 }
});

import {executionFixture} from './execution-fixture.mjs';
test('FR012 built production Worker preserves simulated partial facts and exact cumulative material conservation',async()=>{
 const data=executionFixture(seed),frozen=freezeRunInput(data,{},'2026-10-29T00:00:00Z');const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:1,calculatedAt:'2026-10-29T00:00:00Z'}});
 try{const p=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);});assert.equal(p.tasks[0].start,30);assert.equal(p.tasks[0].duration,20);assert.equal(p.execution.remaining[0].remainingQuantity,60);assert.equal(p.materialDemands[0].quantity,60);assert.equal(p.materialDemands[0].allocations[0].remaining,10);assert.equal(p.execution.facts[0]['开始分钟'],'0');}
 finally{await worker.terminate();}
});
test('FR031 built production Worker keeps scrap replacement and order/task projections frozen',async()=>{
 const d=executionFixture(seed);Object.assign(d.executionFacts[0],{'累计报废数量':'10','报废补做口径':'按本工序BOM补做'});d.executionMaterials[0]['累计已用数量']='50';d.inventory[0]['账面数量']='140';const frozen=freezeRunInput(d,{},'2026-10-29T00:00:00Z');d.executionFacts[0]['累计报废数量']='20';const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:1,calculatedAt:'2026-10-29T00:00:00Z'}});
 try{const p=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);});assert.equal(p.execution.remaining[0].scrapQuantity,10);assert.equal(p.execution.orderImpact[0].remainingQualifiedOrder,100);assert.equal(p.execution.orderImpact[0].operations[0].remainingQuantity,60);assert.equal(p.materialDemands[0].quantity,60);assert.equal(p.materialDemands[0].allocations[0].remaining,20);assert.ok(p.execution.projectedTasks.some(t=>t.taskId==='A-FILL'&&t.start===50));assert.equal(p.ruleSnapshot.capabilityVersion,'FR031-v1');}
 finally{await worker.terminate();}
});

import {stageEvents} from '../src/lib/simulation-events.mjs';
import {event} from './event-fixture.mjs';
test('FR029 built production Worker retains event-time facts, explicit horizon, handling reasons and unchanged consumption',async()=>{
 const original=executionFixture(seed),staged=stageEvents(original,{...original,simulationEvents:[event()]},['executionFacts']),frozen=freezeRunInput(staged.data,{},'2026-10-29T00:00:00Z');assert.deepEqual(staged.issues,[]);staged.data.simulationEvents=[];
 const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:2,calculatedAt:'2026-10-29T00:00:00Z'}});
 try{const p=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);});assert.equal(p.tasks.length,0);assert.equal(p.execution.events.rows[0]['事件编号'],'E1');assert.equal(p.ruleSnapshot.capabilityVersion,'FR029-v1');assert.equal(p.execution.events.protectionUntil,45);assert.equal(p.execution.facts[0]['开始分钟'],'0');assert.equal(p.execution.consumption[0]['累计已用数量'],'40');assert.equal(p.execution.orderImpact[0].qualifiedCompleted,0);assert.ok(p.findings.some(f=>f.message.includes('E1')));}
 finally{await worker.terminate();}
});
