import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';
import {executionFixture} from './execution-fixture.mjs';
import {seed} from '../server/planner.ts';
const hash=x=>createHash('sha256').update(x).digest('hex');
import {setup,history} from './fr026-restore-fixture.mjs';
test('FR026 real worker restore with current facts/material and confirmation saves a fresh independently verified draft; source and ledgers preserved',async t=>{
 const f=await fixture(t),{p,revision}=await setup(f),before=f.bytes(),old=await history(f,p.id);
 const preview=await f.ok('/plans/'+p.id+'/restore/check',{revision});assert.equal(f.bytes(),before);assert.equal(preview.plan.materialDemands[0].executionConsumed,40);assert.equal(preview.plan.materialDemands[0].quantity,60);assert.equal(preview.plan.materialDemands[0].allocations[0].remaining,10);assert.equal(preview.plan.tasks[0].duration,20);assert.equal(preview.plan.tasks[0].start,30);
 assert.equal(preview.plan.trialId,null);assert.equal(preview.provenance.confirmationReferences.length,1);
 const saved=await f.ok('/plans/'+p.id+'/restore',{revision,previewId:preview.id,tables:{inventory:[]},status:'confirmed'});assert.notEqual(saved.plan.id,p.id);assert.equal(saved.plan.status,'draft');
 const after=await history(f,p.id);assert.deepEqual(after.data,old.data);assert.deepEqual(after.source,old.source);assert.deepEqual(after.confirmations,old.confirmations);assert.deepEqual(after.workflows,old.workflows);assert.deepEqual(after.versions,old.versions);assert.deepEqual(after.runs.slice(1),old.runs);
 assert.deepEqual((await f.ok('/plans/'+saved.plan.id+'/review')).blockers,[]);assert.equal((await f.ok('/state')).revision,revision);
 for(let n=0;n<2;n++){const x=await f.ok('/plans/'+p.id+'/restore/check',{revision});await f.ok('/plans/'+p.id+'/restore',{revision,previewId:x.id});assert.deepEqual((await f.ok('/state')).data,old.data);}
 const bytes=f.bytes();assert.equal((await f.call('/plans/'+p.id+'/restore',{revision,previewId:preview.id})).status,409);assert.equal(f.bytes(),bytes);
 const copy=await f.ok('/plans/'+saved.plan.id+'/copy',{});await f.ok('/plans/'+saved.plan.id+'/compare/'+copy.basePlanId);await f.ok('/trials/'+copy.id+'/discard',{revision:0});assert.deepEqual((await f.ok('/confirmations')),old.confirmations);
});
test('FR026 denied roles, CSRF, stale, missing preview, cross-owner, replay and interleaved writes reject with whole-store identical hash',async t=>{
 const f=await fixture(t),{p,revision}=await setup(f),url='/plans/'+p.id+'/restore';
 const check=async(endpoint,body,role,headers)=>{const before=f.bytes(),r=await f.call(endpoint,body,role,headers);assert.ok(r.status>=400,JSON.stringify(r));assert.equal(hash(f.bytes()),hash(before));return r;};
 for(const endpoint of [url,url+'/check']){for(const role of ['query','outsider'])assert.equal((await check(endpoint,{revision},role)).status,403);assert.equal((await check(endpoint,{revision},'planner',{origin:'https://evil.test'})).status,403);assert.equal((await check(endpoint,{revision:0})).status,409);}
 await check(url,{revision});const x=await f.ok(url+'/check',{revision});await check(url,{revision,previewId:x.id},'supervisor');
 await f.ok('/plans/'+p.id+'/copy',{});assert.equal((await check(url,{revision,previewId:x.id})).body.error,'stale_restore');
 const a=await f.ok(url+'/check',{revision}),b=await f.ok(url+'/check',{revision});await f.ok(url,{revision,previewId:a.id});assert.equal((await check(url,{revision,previewId:b.id})).body.error,'stale_restore');
});
for(const [label,mutate] of [
 ['incomplete material',s=>s.data.inventory[0]['质量状态']='冻结'],
 ['missing consumption',s=>s.data.executionMaterials=[]],
 ['source mapping',s=>s.data.executionSources=[{'来源编号':'bad','事实编号':'F-A-MIX'}]],
 ['invalid cumulative',s=>s.data.executionMaterials[0]['累计已用数量']='140'],
 ['paused',s=>{s.data.executionFacts[0]['状态']='暂停';s.data.executionFacts[0]['暂停原因']='未批准恢复';}],
 ['old order selection',s=>s.data.orders[0]['订单状态']='取消'],
 ['unknown confirmation',s=>s.confirmations[0].snapshot.plan.tasks=[]],
 ['protected plan corruption',s=>s.plans.find(p=>p.status==='confirmed').tasks[0].start=999],
 ['missing historical input',s=>s.inputVersions={}],
 ['old result corruption',s=>s.plans[0].materialDemands=[]],
 ['missing result structure',s=>delete s.plans[0].tasks],
 ['unchecked material',s=>s.data.rules.find(r=>r['规则编号']==='MATERIAL')['是否启用']='否']
])test('FR026 atomic refusal: '+label,async t=>{const f=await fixture(t),{p,revision}=await setup(f);const s=JSON.parse(f.bytes());mutate(s);fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(s));const before=f.bytes(),r=await f.call('/plans/'+p.id+'/restore/check',{revision});assert.equal(r.status,409,JSON.stringify(r));assert.equal(f.bytes(),before);assert.ok(r.body.message||r.body.blockers?.length);});
test('FR026 worker timeout and startup failure leave full store unchanged',async t=>{
 for(const runOptions of [{runTimeoutMs:1},{workerFactory:()=>{throw Error('synthetic startup');}}]){
  const f=await fixture(t,{runOptions}),{p,revision}=await setup(f),before=f.bytes();const r=await f.call('/plans/'+p.id+'/restore/check',{revision});assert.equal(r.status,409);assert.match(r.body.message,/超时|启动/);assert.equal(f.bytes(),before);
 }
});
test('FR026 input update during real worker preview is stale and never saves a candidate',async t=>{
 const f=await fixture(t),{p,revision}=await setup(f);const pending=f.call('/plans/'+p.id+'/restore/check',{revision});
 const s=await f.ok('/state');await f.ok('/inputs',{revision,tables:{inventory:s.data.inventory.map(r=>({...r,'位置':'并发核对'}))}});const before=f.bytes(),r=await pending;assert.equal(r.status,409);assert.ok(['stale_restore','stale_input'].includes(r.body.error));assert.equal(f.bytes(),before);
});

for(const state of ['已开始','已完成'])test('FR026 success preserves '+state+' facts and cumulative material',async t=>{
 const f=await fixture(t),{p,revision}=await setup(f,state),before=JSON.parse(f.bytes());const preview=await f.ok('/plans/'+p.id+'/restore/check',{revision});
 const saved=await f.ok('/plans/'+p.id+'/restore',{revision,previewId:preview.id});assert.deepEqual((await f.ok('/state')).data,before.data);assert.deepEqual((await f.ok('/confirmations')),before.confirmations);
 if(state==='已完成'){assert.equal(saved.plan.tasks[0].start,0);assert.equal(saved.plan.tasks[0].end,30);assert.equal(saved.plan.materialDemands.length,0);}else{assert.equal(saved.plan.tasks[0].start,30);assert.equal(saved.plan.materialDemands[0].executionConsumed,40);}
 assert.deepEqual((await f.ok('/plans/'+saved.plan.id+'/review')).blockers,[]);
});
test('FR026 a new supervisor confirmation invalidates preview without changing input revision',async t=>{
 const f=await fixture(t),{p,revision}=await setup(f);let current=await f.ok('/calculate',{revision});current=await f.ok('/plans/'+current.id+'/verify',{});
 const decision=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:[],acceptConditionalSupply:true,acknowledgeScope:true});
 await f.ok('/plans/'+current.id+'/submit',decision(await f.ok('/plans/'+current.id+'/review')));
 const preview=await f.ok('/plans/'+p.id+'/restore/check',{revision});await f.ok('/plans/'+current.id+'/confirm',decision(await f.ok('/plans/'+current.id+'/review')),'supervisor');
 const before=f.bytes(),r=await f.call('/plans/'+p.id+'/restore',{revision,previewId:preview.id});assert.equal(r.status,409);assert.equal(r.body.error,'stale_restore');assert.equal(f.bytes(),before);assert.equal((await f.ok('/state')).revision,revision);
});
test('FR026 expired preview cannot be committed',async t=>{
 const f=await fixture(t),{p,revision}=await setup(f),preview=await f.ok('/plans/'+p.id+'/restore/check',{revision}),before=f.bytes(),now=Date.now;
 try{Date.now=()=>now()+16*60*1000;const r=await f.call('/plans/'+p.id+'/restore',{revision,previewId:preview.id});assert.equal(r.status,409);assert.equal(r.body.error,'restore_preview_invalid');assert.equal(f.bytes(),before);}finally{Date.now=now;}
});

test('FR026 consumption source gate follows effective BOM instead of requiring future materials',async t=>{
 const f=await fixture(t),{p,revision}=await setup(f,undefined,true),preview=await f.ok('/plans/'+p.id+'/restore/check',{revision});assert.equal(preview.plan.materialDemands[0].materialId,'LEAN');assert.equal(preview.plan.materialDemands[0].quantity,60);
});

test('FR026 source with known execution facts cannot restore after those facts disappear',async t=>{
 const f=await fixture(t),{revision}=await setup(f),p=await f.ok('/calculate',{revision}),s=JSON.parse(f.bytes());s.data.executionFacts=[];s.data.executionMaterials=[];fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(s));
 const before=f.bytes(),r=await f.call('/plans/'+p.id+'/restore/check',{revision});assert.equal(r.status,409);assert.match(r.body.message,/缺失|倒退/);assert.equal(f.bytes(),before);
});
