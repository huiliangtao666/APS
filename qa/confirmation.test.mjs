import test from 'node:test';
import { Worker } from 'node:worker_threads';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { praetorActor } from '@praetor/lite-app-server';
import { openStore } from '../server/auth/store.mjs';
import { createAuthRouter } from '../server/auth/routes.mjs';
import { createBusinessRouter } from '../server/business.mjs';

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
async function plan(call,selection){const p=await call('/calculate',{revision:(await call('/state')).body.revision,selection});assert.equal(p.status,201,JSON.stringify(p));assert.equal((await call('/plans/'+p.body.id+'/verify',{})).status,200);return p.body.id;}
async function review(call,id){return (await call('/plans/'+id+'/review')).body;}
function decision(r,extra={}){return {revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true,...extra};}
async function act(call,id,action,extra={},sub=action==='submit'?'planner':'supervisor'){const r=await review(call,id);return call('/plans/'+id+'/'+action,decision(r,extra),sub);}
async function submit(call,id){const r=await act(call,id,'submit');assert.equal(r.status,200,JSON.stringify(r));return r;}
test('FR030 actual planner submit / supervisor return / resubmit / confirm / release / archive preserves immutable source and query/export provenance',async t=>{
 const {call,dir,store}=await fixture(t),id=await plan(call);
 assert.deepEqual((await review(call,id)).blockers,[]);
 await submit(call,id);const first=(await review(call,id)).submissionId;
 assert.equal((await act(call,id,'return')).status,200);
 await submit(call,id);assert.notEqual((await review(call,id)).submissionId,first);assert.equal((await review(call,id)).workflow.submissions.length,2);assert.equal((await review(call,id)).workflow.submissions[0].id,first);
 assert.equal((await act(call,id,'confirm',{actor:'forged',role:'query',at:'1900'})).status,200);
 let r=await review(call,id);const c=r.confirmation,bytes=JSON.stringify(c),pbytes=JSON.stringify((await call('/plans')).body.find(p=>p.id===id));
 assert.equal(c.actor,'test#supervisor');assert.equal(c.snapshot.submission.actor,'test#planner');assert.equal(c.snapshot.plan.status,'confirmed');assert.ok(c.snapshot.originalInput.orders.length);assert.equal(c.snapshot.run.id,c.snapshot.plan.runId);
 for(const action of ['verify','submit','return','confirm'])assert.equal((await act(call,id,action)).status,409,action);
 assert.equal((await call('/plans',{id,status:'draft',tasks:[]})).status,409);
 assert.equal((await act(call,id,'release')).status,200);
 assert.equal((await act(call,id,'archive')).status,200);
 r=await review(call,id);assert.equal(r.workflow.state,'archived');assert.equal(JSON.stringify(r.confirmation),bytes);assert.equal(JSON.stringify((await call('/plans')).body.find(p=>p.id===id)),pbytes);
 const state=(await call('/state')).body,orders=structuredClone(state.data.orders);orders[0]['合格需求']='241';assert.equal((await call('/inputs',{revision:state.revision,tables:{orders}})).status,200);
 assert.equal(JSON.stringify((await call('/confirmations/'+c.id)).body),bytes);
 assert.equal((await call('/export',{confirmationId:c.id},'query')).status,403);store.setExport('test#query',true,'test#admin');
 const out=await call('/export',{confirmationId:c.id},'query');assert.equal(out.status,200);assert.equal(out.body.snapshotHash,c.snapshotHash);assert.equal(out.body.snapshot.originalInput.orders[0]['合格需求'],'240');
 assert.equal((await call('/export',{planId:id})).status,200);assert.equal((await call('/plans/'+id+'/inputs')).body.data.orders[0]['合格需求'],'240');
 const persisted=JSON.parse(fs.readFileSync(path.join(dir,'business.json')));assert.equal(JSON.stringify(persisted.confirmations[0]),bytes);
 const ops=(await call('/operations')).body;for(const action of ['submit','return','confirm','release','archive'])assert.ok(ops.some(o=>o.action===action&&o.requestId==='trusted-request'&&o.actor.startsWith('test#')));
});
test('FR030 role and CSRF gates cover every lifecycle path, audit cannot be body forged',async t=>{
 const {call}=await fixture(t),id=await plan(call);
 for(const action of ['submit','confirm','return','release','archive']){
  const r=await review(call,id),body=decision(r,{role:'supervisor',actor:'test#supervisor'});
  assert.equal((await call('/plans/'+id+'/'+action,body,'query',{'x-role':'supervisor'})).status,403);
  if(action!=='submit')assert.equal((await call('/plans/'+id+'/'+action,body,'planner')).status,403);
  for(const headers of [{'sec-fetch-site':'cross-site'},{origin:'https://evil.test','sec-fetch-site':'same-origin'},{origin:'null'}])assert.equal((await call('/plans/'+id+'/'+action,body,'supervisor',headers)).status,403);
 }
 assert.ok(!(await call('/operations')).body.some(r=>['submit','confirm'].includes(r.action)));
});
test('FR030 missing independent verification and minimal unchecked enabled rules fail closed',async t=>{
 const {call}=await fixture(t);let p=(await call('/calculate',{revision:0})).body;
 assert.equal((await act(call,p.id,'submit')).status,409);
 const id=await plan(call,{mode:'minimal-r1'}),r=await review(call,id);assert.ok(r.blockers.some(b=>b.code==='unchecked_rules'));assert.equal((await act(call,id,'submit')).status,409);
});
test('FR030 explicit partial task list, quantities and reasons required from both actors',async t=>{
 const {call}=await fixture(t),id=await plan(call,{endMinute:35}),r=await review(call,id);assert.ok(r.unplanned.length);assert.deepEqual(r.blockers,[]);assert.ok(r.unplanned.every(t=>t.quantity>0&&t.reasons.length));
 for(const extra of [{unplannedIds:[]},{acceptPartial:false},{unplannedIds:[...r.unplanned.map(t=>t.id),'forged']},{acknowledgeScope:false}])assert.equal((await act(call,id,'submit',extra)).status,400);
 await submit(call,id);assert.equal((await act(call,id,'confirm',{unplannedIds:[]})).status,400);assert.equal((await act(call,id,'confirm',{acceptPartial:false})).status,400);assert.equal((await act(call,id,'confirm')).status,200);
});
test('FR030 stale input requires new calculation/verification/submission; return remains available and old confirmation stays queryable',async t=>{
 const {call}=await fixture(t),id=await plan(call);await submit(call,id);const previous=await review(call,id);
 const state=(await call('/state')).body,orders=structuredClone(state.data.orders);orders[0]['合格需求']='241';await call('/inputs',{revision:0,tables:{orders}});
 assert.equal((await call('/plans/'+id+'/confirm',decision(previous),'supervisor')).status,409);
 assert.equal((await act(call,id,'confirm')).status,409);assert.equal((await act(call,id,'return')).status,200);assert.equal((await act(call,id,'submit')).status,409);
 const next=await plan(call);await submit(call,next);assert.equal((await act(call,next,'confirm')).status,200);
 const confirmed=(await review(call,next)).confirmation;orders[0]['合格需求']='242';await call('/inputs',{revision:1,tables:{orders}});
 assert.equal((await act(call,next,'release')).status,409);assert.equal((await act(call,next,'archive')).status,200);assert.equal((await call('/confirmations/'+confirmed.id)).status,200);
});
test('FR030 concurrent/replayed decisions and old submission IDs fail without audit mutations',async t=>{
 const {call}=await fixture(t),id=await plan(call);await submit(call,id);const old=await review(call,id);assert.equal((await act(call,id,'return')).status,200);await submit(call,id);
 assert.equal((await act(call,id,'confirm',{submissionId:old.submissionId})).status,409);
 const r=await review(call,id),body=decision(r),results=await Promise.all([call('/plans/'+id+'/confirm',body,'supervisor'),call('/plans/'+id+'/confirm',body,'supervisor')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await call('/confirmations')).body.length,1);assert.equal((await call('/operations')).body.filter(r=>r.action==='confirm').length,1);
});
test('FR030 rejected running/failed/cancelled/infeasible/unchecked/conflicting/corrupt result leaves bytes and audit unchanged',async t=>{
 for(const kind of ['running','failed','cancelled','timed_out','snapshot','original','overlap','unchecked','infeasible','condition','rules','verification']){
  const {call,dir}=await fixture(t),id=await plan(call);await submit(call,id);
  const file=path.join(dir,'business.json'),s=JSON.parse(fs.readFileSync(file)),p=s.plans.find(p=>p.id===id),run=s.runs.find(r=>r.id===p.runId);
  if(['running','failed','cancelled','timed_out'].includes(kind))run.status=kind;
  if(kind==='snapshot')run.executionData.orders[0]['合格需求']='999';
  if(kind==='original')s.inputVersions[p.inputVersionId].data.orders=[];
  if(kind==='overlap')p.tasks[1].machine=p.tasks[0].machine,p.tasks[1].start=p.tasks[0].start;
  if(kind==='unchecked')delete p.ruleSnapshot;
  if(kind==='infeasible')p.findings.push({code:'BR-03 / MACHINE_OVERLAP',message:'conflict',taskIds:p.tasks.slice(0,2).map(t=>t.id)});
  if(kind==='condition')p.conditions={...p.conditions,endMinute:1};
  if(kind==='rules')p.ruleSnapshot.settings[0].active=false;
  if(kind==='verification')delete p.verification;
  fs.writeFileSync(file,JSON.stringify(s));const before=fs.readFileSync(file,'utf8');assert.equal((await act(call,id,'confirm')).status,409,kind);assert.equal(fs.readFileSync(file,'utf8'),before,kind);
 }
});
test('FR030 source input changes and rule activation cannot bypass revision checks by restoring the old numeric revision',async t=>{
 const {call,dir}=await fixture(t),id=await plan(call);await submit(call,id);const file=path.join(dir,'business.json'),s=JSON.parse(fs.readFileSync(file));s.data.orders[0]['合格需求']='999';fs.writeFileSync(file,JSON.stringify(s));assert.equal((await act(call,id,'confirm')).status,409);
});
test('FR030 copied result and changed trial input cannot be promoted without current-input reconciliation',async t=>{
 const {call}=await fixture(t),id=await plan(call),trial=(await call('/plans/'+id+'/copy',{})).body;
 const copied=trial.basePlanId;assert.equal((await act(call,copied,'submit')).status,409);
 const state=(await call('/state')).body,orders=structuredClone(state.data.orders);orders[0]['合格需求']='241';
 assert.equal((await call('/trials/'+trial.id+'/inputs',{revision:0,tables:{orders}})).status,200);
 const p=await call('/calculate',{trialId:trial.id,revision:1});assert.equal(p.status,201);assert.equal((await call('/plans/'+p.body.id+'/verify',{})).status,200);
 assert.equal((await act(call,p.body.id,'submit')).status,409);assert.ok((await review(call,p.body.id)).blockers.some(b=>b.code==='stale_input'));
});
test('FR030 conditional supply needs two explicit acknowledgments and preserves the original conditions',async t=>{
 const {deliveryFixture}=await import('./delivery-fixture.mjs'),{seed}=await import('../server/planner.ts');
 const {call}=await fixture(t),d=deliveryFixture(seed);
 d.rules.find(r=>r['规则编号']==='MATERIAL')['参数JSON']=JSON.stringify({'允许预计供给':true,'可用状态':['合格'],'预计状态':['预计可用'],'不可用状态':['待检','冻结','不合格']});d.inventory=d.inventory.filter(r=>r['物料编号']!=='LEAN');
 d.supplies=[{'供给编号':'S1','物料编号':'LEAN','批次编号':'EXPECTED','预计数量':'65','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];d.supplyUses=[{'引用编号':'U1','订单编号':'A','工序编号':'MIX','供给编号':'S1','使用数量':'65'}];
 assert.equal((await call('/inputs',{revision:0,tables:d})).status,200);const id=await plan(call),r=await review(call,id);assert.deepEqual(r.blockers,[]);assert.ok(r.conditionalSupply.length);
 assert.equal((await act(call,id,'submit',{acceptConditionalSupply:false})).status,400);await submit(call,id);assert.equal((await act(call,id,'confirm',{acceptConditionalSupply:false})).status,400);assert.equal((await act(call,id,'confirm')).status,200);const c=(await review(call,id)).confirmation;assert.equal(c.snapshot.review.conditionalSupply[0]['供给编号'],'S1');
});
test('FR030 excluded effective demand is never silently accepted as a complete plan',async t=>{
 const {call}=await fixture(t),id=await plan(call,{orderIds:['A']});const r=await review(call,id);assert.ok(r.blockers.some(b=>b.code==='unlisted_demand'));assert.equal((await act(call,id,'submit')).status,409);
});
test('FR030 time-based rule activation after submission invalidates approval without an input edit',async t=>{
 const {reviewPlan}=await import('../server/confirmation.mjs');const {call,dir}=await fixture(t),state=(await call('/state')).body;
 const rules=structuredClone(state.data.rules);Object.assign(rules.find(r=>r['规则编号']==='INVENTORY'),{'是否启用':'是','生效时间':'2099-01-01T00:00:00Z','参数JSON':'{"可用质量状态":["合格"]}'});
 assert.equal((await call('/inputs',{revision:0,tables:{rules}})).status,200);const id=await plan(call);await submit(call,id);const s=JSON.parse(fs.readFileSync(path.join(dir,'business.json'))),p=s.plans.find(p=>p.id===id);
 assert.ok(reviewPlan(s,p,'2099-01-02T00:00:00Z').blockers.some(b=>b.code==='rule_effectivity_changed'));
});
test('FR030 actual asynchronous worker result can be verified/submitted/confirmed and archived snapshot detects corruption',async t=>{
 const {call,dir}=await fixture(t),r=await call('/runs',{revision:0});assert.equal(r.status,202);let run;
 for(let n=0;n<100;n++){run=(await call('/runs/'+r.body.id)).body;if(['completed','partial','failed'].includes(run.status))break;await new Promise(resolve=>setTimeout(resolve,20));}
 assert.ok(run.planId);const id=run.planId;assert.equal((await call('/plans/'+id+'/verify',{})).status,200);await submit(call,id);assert.equal((await act(call,id,'confirm')).status,200);const c=(await review(call,id)).confirmation;
 const file=path.join(dir,'business.json'),s=JSON.parse(fs.readFileSync(file));s.confirmations[0].snapshot.originalInput.orders=[];fs.writeFileSync(file,JSON.stringify(s));const bytes=fs.readFileSync(file,'utf8');
 assert.equal((await call('/confirmations/'+c.id)).status,409);assert.equal((await call('/export',{confirmationId:c.id})).status,409);assert.equal((await act(call,id,'archive')).status,409);assert.equal(fs.readFileSync(file,'utf8'),bytes);
});
test('FR030 enabled delivery quality/remaining-life failure and unsupported declared maximum wait cannot be acknowledged away',async t=>{
 const {deliveryFixture}=await import('./delivery-fixture.mjs'),{seed}=await import('../server/planner.ts');
 for(const kind of ['quality','life','maxwait']){
  const {call}=await fixture(t),d=deliveryFixture(seed);
  if(kind==='quality')d.deliveryConditions[0]['模拟质量状态']='模拟不合格';
  if(kind==='life')d.deliveryConditions[0]['模拟有效期截止时间']='2026-11-02T00:30:00Z',d.deliveryConditions[0]['要求剩余有效分钟']='100';
  if(kind==='maxwait')d.routes.find(r=>r['前序工序'])['最大等待分钟']='1';
  assert.equal((await call('/inputs',{revision:0,tables:d})).status,200);const id=await plan(call),r=await review(call,id);assert.ok(r.blockers.some(b=>['delivery_condition_blocked','unsupported_semantics'].includes(b.code)),JSON.stringify(r.blockers));assert.equal((await act(call,id,'submit')).status,409);
 }
});
