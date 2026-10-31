import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {fixture,trialOf,preview,commit} from './fr027-fixture.mjs';
import {seed} from '../server/planner.ts';
import {executionFixture} from './execution-fixture.mjs';
import {event} from './event-fixture.mjs';
import {protectCalculatedTasks} from '../server/trial-protection.mjs';
const dump=(id,x)=>{if(process.env.B15_EVIDENCE){fs.mkdirSync(process.env.B15_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.B15_EVIDENCE,id+'.json'),JSON.stringify(x,null,2));}};

test('B15 shared save atomically rejects later invalid event and changed fact without store writes',async t=>{
 const f=await fixture(t);await f.ok('/inputs',{revision:0,tables:executionFixture(seed)});
 const state=await f.ok('/state'),before=f.bytes();
 const rejected=await f.call('/inputs',{revision:state.revision,tables:{executionFacts:state.data.executionFacts,simulationEvents:[event(),event('人员缺勤',{groupId:'UNKNOWN',endMinute:60},{'事件编号':'E2'})]}});
 assert.equal(rejected.status,409);assert.equal(rejected.body.error,'event_reconciliation_required');assert.equal(f.bytes(),before);
 const accepted=await f.ok('/inputs',{revision:state.revision,tables:{executionFacts:state.data.executionFacts,simulationEvents:[event()]}});
 assert.deepEqual(accepted.data.executionFacts,state.data.executionFacts);assert.deepEqual(accepted.data.executionMaterials,state.data.executionMaterials);
 const plan=await f.ok('/calculate',{revision:accepted.revision});assert.equal(plan.tasks.length,0);assert.equal(plan.applicationProtection.valid,true);assert.equal(plan.applicationProtection.requiresResourceVerification,true);assert.equal(plan.applicationProtection.handlingRequired.length,1);
 dump('APP_ATOMIC_EVENT',{state,rejected,accepted,plan});
});

test('B15 guard pass is separate from independent illegal precedence and capacity results',async t=>{
 const f=await fixture(t),{root}=await trialOf(f),before=f.bytes(),p=await preview(f,root,'A-FILL',{start:0,machine:'FILL01'});
 const checked=await f.ok(root+'/previews/'+p.id+'/recheck',{});
 assert.equal(checked.check.protection.valid,true);assert.equal(checked.check.protection.requiresResourceVerification,true);
 assert.equal(checked.valid,false);assert.equal(checked.check.checks.precedence.status,'problem');assert.equal((await f.call(root+'/previews/'+p.id+'/commit',{})).status,409);assert.equal(f.bytes(),before);
 dump('APP_PROTECTION_NOT_RESOURCE_PASS',checked);
});

test('B15 actual Worker rejects incompatible saved lock without a partial plan or changed input/locks',async t=>{
 const f=await fixture(t),{root,trial}=await trialOf(f);await commit(f,root,await preview(f,root,'A-FILL',{locked:true},'lock'));
 await f.ok(root+'/inputs',{revision:1,tables:{downtime:[{'设备编号':'FILL01','起始分钟':'0','结束分钟':'200','原因':'显式锁定冲突'}]}});
 const oldPlans=await f.ok('/plans'),oldTrial=(await f.ok('/trials'))[0],oldState=await f.ok('/state');
 const run=await f.ok('/runs',{trialId:trial.id,revision:2});let final;
 for(let n=0;n<500;n++){final=await f.ok('/runs/'+run.id);if(['failed','completed','partial'].includes(final.status))break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(final.status,'failed');assert.equal(final.failure.code,'calculated_protection_conflict');assert.ok(final.failure.protection.issues.some(i=>i.code==='B15_LOCK_CONFLICT'));
 assert.equal(final.planId,undefined);assert.deepEqual(await f.ok('/plans'),oldPlans);assert.deepEqual((await f.ok('/trials'))[0],oldTrial);assert.deepEqual(await f.ok('/state'),oldState);
 dump('APP_WORKER_LOCK_REJECTION',{run:final,oldTrial,plansUnchanged:true,stateUnchanged:true});
});

test('B15 selected projection preserves full unselected fact context and diagnoses changed completed interval',()=>{
 const data=executionFixture(seed,'已完成');data.orders.push({...data.orders[0],'订单编号':'B'});
 const candidate={tasks:[{id:'B-MIX',orderId:'B',operation:'MIX',start:60,end:90,machine:'MIX02'}]};
 assert.equal(protectCalculatedTasks(null,candidate,data,{orderIds:['B']}).valid,true);assert.equal(data.executionFacts.length,1);
 const wrong={tasks:[{id:'A-MIX',orderId:'A',operation:'MIX',start:1,end:31,machine:'MIX01'}]};
 assert.equal(protectCalculatedTasks(null,wrong,data,{orderIds:['A']}).valid,false);
});
