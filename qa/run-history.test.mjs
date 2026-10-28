import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import express from 'express';import {Worker} from 'node:worker_threads';import {EventEmitter} from 'node:events';import {praetorActor} from '@praetor/lite-app-server';import {openStore} from '../server/auth/store.mjs';import {createAuthRouter} from '../server/auth/routes.mjs';import {createBusinessRouter} from '../server/business.mjs';
async function fixture(t,real=false,runOptions={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fr037-'));const store=openStore(dir);store.initFirstAdmin('test#admin');
 for(const role of ['planner','supervisor','query']){const i=store.createInvite({role,createdBy:'test#admin',requireApproval:false});store.acceptInvite(i.token,'test#'+role);}
 // Fixture actor injection exists ONLY here; production uses SDK verification.
 const actor=real?praetorActor():(req,_res,next)=>{req.praetorActor={kind:'user',issuer:'test',sub:req.get('test-sub')||'query',requestId:'trusted-request'};next();};
 const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store});
 const app=express();app.use(express.json());app.use('/api/auth',router);app.use('/api',createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember,...runOptions}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true});});
 const call=async(url,body,sub='planner',headers={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api`+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','test-sub':sub,...headers},body:body?JSON.stringify({reason:'test reason',...body}):undefined});return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};};
 return {call,store,dir};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function done(call,id){for(let n=0;n<300;n++){const r=(await call('/runs/'+id)).body;if(['completed','partial','failed','timed_out','cancelled'].includes(r.status))return r;await wait(10);}throw Error('run did not finish');}
test('FR038 stop intent visible, repeated cancel joins, late result/progress cannot save or reopen',async t=>{
 let release;const worker=new EventEmitter();worker.terminate=()=>new Promise(r=>{release=r;});const {call,dir}=await fixture(t,false,{workerFactory:()=>worker});
 const before=(await call('/state')).body;const r=(await call('/runs',{revision:0})).body;worker.emit('message',{kind:'progress'});const started=(await call('/runs/'+r.id)).body.startedAt;
 worker.emit('message',{kind:'progress'});assert.equal((await call('/runs/'+r.id)).body.startedAt,started);
 const cancel=call('/runs/'+r.id+'/cancel',{});for(let n=0;n<100&&!release;n++)await wait(5);assert.ok(release);
 assert.equal((await call('/runs/'+r.id)).body.status,'cancel_requested');assert.equal((await call('/runs/'+r.id+'/retry',{})).status,409);
 const again=call('/runs/'+r.id+'/cancel',{});await wait(10);worker.emit('message',{kind:'result',plan:{tasks:[],findings:[]}});worker.emit('message',{kind:'progress'});worker.emit('exit',1);assert.equal((await call('/plans')).body.length,0);
 release();assert.equal((await cancel).body.status,'cancelled');assert.equal((await again).body.status,'cancelled');const saved=JSON.parse(fs.readFileSync(path.join(dir,'business.json')));assert.ok(saved.runs[0].durationMs>=0);assert.equal(saved.records.filter(x=>x.action==='run_cancelled').length,1);assert.deepEqual((await call('/state')).body,before);
});
test('FR038 same-input retry pins original evaluation time and rules after current edits; server identity and permissions',async t=>{
 const {call}=await fixture(t);const first=(await call('/runs',{revision:0,selection:{orderIds:['A'],endMinute:600}})).body;const original=await done(call,first.id),snap=(await call('/runs/'+first.id+'/inputs')).body;
 let state=(await call('/state')).body;state.data.orders[0]['合格需求']='241';assert.equal((await call('/inputs',{revision:state.revision,tables:{orders:state.data.orders}})).status,200);
 assert.equal((await call('/runs/'+first.id+'/retry',{},'query')).status,403);assert.equal((await call('/runs/'+first.id+'/retry',{reason:''})).status,400);
 const retry=(await call('/runs/'+first.id+'/retry',{actor:'fake',conditions:{},snapshotHash:'fake'})).body;assert.notEqual(retry.id,first.id);assert.equal(retry.retryOf,first.id);assert.equal(retry.actor,'test#planner');await done(call,retry.id);
 const retrySnap=(await call('/runs/'+retry.id+'/inputs')).body;assert.deepEqual(retrySnap.executionData,snap.executionData);assert.deepEqual(retrySnap.conditions,snap.conditions);assert.equal(retry.snapshotHash,original.snapshotHash);
 const plans=(await call('/plans')).body;for(const field of ['tasks','findings','ruleSnapshot','resultAssessment'])assert.deepEqual(plans.find(p=>p.id===retry.planId||p.runId===retry.id)[field],plans.find(p=>p.id===original.planId)[field]);assert.deepEqual((await call('/runs/'+first.id)).body,original);
});
test('FR038 result wins before cancel, terminal immutable, raw internal diagnostics never persisted',async t=>{
 const w=new EventEmitter();w.terminate=()=>Promise.resolve();const {call}=await fixture(t,false,{workerFactory:()=>w});const r=(await call('/runs',{revision:0})).body;
 w.emit('message',{kind:'result',plan:{tasks:[],findings:[]}});assert.equal((await call('/runs/'+r.id+'/cancel',{})).status,409);const old=(await call('/runs/'+r.id)).body;assert.equal(old.outcome,'succeeded');w.emit('error',Error('secret'));w.emit('exit',1);assert.deepEqual((await call('/runs/'+r.id)).body,old);assert.equal((await call('/plans')).body.length,1);
});
test('FR038 timeout owns stopping race and cannot become user cancelled or successful',async t=>{
 let release;const w=new EventEmitter();w.terminate=()=>new Promise(r=>release=r);const {call}=await fixture(t,false,{runTimeoutMs:30,workerFactory:()=>w});const r=(await call('/runs',{revision:0})).body;
 for(let n=0;n<100&&!release;n++)await wait(5);assert.equal((await call('/runs/'+r.id)).body.status,'stopping');const cancel=call('/runs/'+r.id+'/cancel',{});await wait(10);w.emit('message',{kind:'result',plan:{tasks:[],findings:[]}});release();assert.equal((await cancel).body.status,'timed_out');assert.equal((await call('/plans')).body.length,0);
});
test('FR038 malformed worker output and private failure return safe failed state without replacing saved plan',async t=>{
 for(const message of [null,{kind:'result',plan:{}},{kind:'failure',code:'secret',message:'private credentials'}]){const w=new EventEmitter();w.terminate=()=>Promise.resolve();const {call}=await fixture(t,false,{workerFactory:()=>w});await call('/calculate',{revision:0});const before=(await call('/plans')).body;const r=(await call('/runs',{revision:0})).body;w.emit('message',message);const end=await done(call,r.id);assert.equal(end.status,'failed');assert.ok(!JSON.stringify(end).includes('private credentials'));assert.deepEqual((await call('/plans')).body,before);}
});
test('FR038 orphan recovery preserves frozen identity and history, retry corruption denied',async t=>{
 const {call,dir}=await fixture(t);const plan=(await call('/calculate',{revision:0})).body;const file=path.join(dir,'business.json');const saved=JSON.parse(fs.readFileSync(file));const fake=structuredClone(saved.runs[0]);fake.id='orphan';fake.status='cancel_requested';delete fake.planId;delete fake.finishedAt;saved.runs.unshift(fake);fs.writeFileSync(file,JSON.stringify(saved));
 createBusinessRouter({dataDir:dir,actorMiddleware:()=>{},requireMember:()=>()=>{}});const orphan=(await call('/runs/orphan')).body;assert.equal(orphan.outcome,'orphaned');assert.equal(orphan.failure.code,'process_interrupted');assert.equal(orphan.snapshotHash,fake.snapshotHash);assert.equal((await call('/plans')).body[0].id,plan.id);
 const corrupt=JSON.parse(fs.readFileSync(file));corrupt.runs[0].executionData.orders[0]['合格需求']='999';fs.writeFileSync(file,JSON.stringify(corrupt));assert.equal((await call('/runs/orphan/retry',{})).status,409);assert.equal((await call('/runs/orphan/inputs')).status,409);
});
test('FR038 retry rejects changed execution facts and discarded trials without modifying history',async t=>{
 const {call,dir}=await fixture(t);const p=(await call('/calculate',{revision:0})).body;const file=path.join(dir,'business.json'),original=JSON.parse(fs.readFileSync(file));const changed=structuredClone(original);changed.data.executionSources=[{synthetic:'changed'}];fs.writeFileSync(file,JSON.stringify(changed));const bytes=fs.readFileSync(file,'utf8');assert.equal((await call('/runs/'+p.runId+'/retry',{})).body.error,'current_execution_changed');assert.equal(fs.readFileSync(file,'utf8'),bytes);
 fs.writeFileSync(file,JSON.stringify(original));const trial=(await call('/plans/'+p.id+'/copy',{})).body;assert.ok(trial.id);const tr=(await call('/runs',{trialId:trial.id,revision:trial.revision})).body;await done(call,tr.id);await call('/trials/'+trial.id+'/discard',{revision:trial.revision});assert.equal((await call('/runs/'+tr.id+'/retry',{})).body.error,'trial_discarded');
});
test('FR038 real crash/timeout/cancel leave actual confirmed snapshot and source/facts bytes intact',async t=>{
 for(const mode of ['crash','timeout','cancel']){
 const {call,dir}=await fixture(t,false,{runTimeoutMs:300,workerFactory:()=>new Worker(mode==='crash'?'throw Error("private details")':'while(true){}',{eval:true})});
 const p=(await call('/calculate',{revision:0})).body;await call('/plans/'+p.id+'/verify',{});
 const decision=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(x=>x.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true});
 let review=(await call('/plans/'+p.id+'/review')).body;assert.equal((await call('/plans/'+p.id+'/submit',decision(review))).status,200);review=(await call('/plans/'+p.id+'/review')).body;assert.equal((await call('/plans/'+p.id+'/confirm',decision(review),'supervisor')).status,200);
 const file=path.join(dir,'business.json'),before=JSON.parse(fs.readFileSync(file));const r=(await call('/runs',{revision:0})).body;if(mode==='cancel')await call('/runs/'+r.id+'/cancel',{});await done(call,r.id);const after=JSON.parse(fs.readFileSync(file));for(const k of ['data','plans','confirmations','inputVersions'])assert.deepEqual(after[k],before[k],mode+' '+k);
 }
});
