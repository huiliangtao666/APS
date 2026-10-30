// Original I01-I17 probes supplied by APS-Test in FR-030-INDEPENDENT-EVIDENCE.zip.
// Dev repair replay: I14 captures its archive token before corruption because
// the repaired review route refuses to issue a token for damaged history.
// HISTORY-01 cases below add mixed-record and missing-snapshot/hash coverage.
// Running these here is Dev regression evidence, not independent Test approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {createBusinessRouter} from '../server/business.mjs';
import {createAuthRouter} from '../server/auth/routes.mjs';
import {openStore} from '../server/auth/store.mjs';
import {seed} from '../server/planner.ts';
import {reviewPlan} from '../server/confirmation.mjs';
import {executionFixture} from './execution-fixture.mjs';
import {deliveryFixture} from './delivery-fixture.mjs';

// New independent HTTP fixture. Identity injection is confined to this test.
async function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aps-test-fr030-')),store=openStore(dir);
 store.initFirstAdmin('ind#admin');
 for(const role of ['planner','supervisor','query']){const inv=store.createInvite({role,createdBy:'ind#admin',requireApproval:false});store.acceptInvite(inv.token,'ind#'+role);}
 const actor=(req,res,next)=>{req.praetorActor={kind:'user',issuer:'ind',sub:req.get('test-sub')||'query',requestId:'independent-request'};next();};
 const auth=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store});
 const app=express();app.use(express.json());app.use('/api',createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember:auth.requireMember}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>{server.closeAllConnections();server.close();fs.rmSync(dir,{recursive:true,force:true});});
 const url=`http://127.0.0.1:${server.address().port}`;
 const call=async(route,body,role='planner',headers={})=>{const r=await fetch(url+'/api'+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','test-sub':role,...headers},body:body===undefined?undefined:JSON.stringify({reason:'Independent FR030 probe',...body})});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};};
 const state=async()=> (await call('/state')).data;
 const review=async id=>{const r=await call('/plans/'+id+'/review');assert.equal(r.status,200);return r.data;};
 const body=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true});
 const act=async(id,action,extra={},role=action==='submit'?'planner':'supervisor',headers={})=>call('/plans/'+id+'/'+action,{...body(await review(id)),...extra},role,headers);
 const plan=async(selection,verify=true)=>{const p=await call('/calculate',{revision:(await state()).revision,selection});assert.equal(p.status,201,JSON.stringify(p));if(verify)assert.equal((await call('/plans/'+p.data.id+'/verify',{})).status,200);return p.data.id;};
 const file=path.join(dir,'business.json'),read=()=>JSON.parse(fs.readFileSync(file)),bytes=()=>fs.readFileSync(file,'utf8'),mutate=fn=>{const s=read();fn(s);fs.writeFileSync(file,JSON.stringify(s));};
 const input=async tables=>{const r=await call('/inputs',{revision:(await state()).revision,tables});assert.equal(r.status,200,JSON.stringify(r));return r;};
 return {call,state,review,body,act,plan,input,read,bytes,mutate,store,url};
}
const ok=r=>assert.equal(r.status,200,JSON.stringify(r));

test('I01 lifecycle exact token replay, append-only submissions, immutable envelope and no inventory debit',async t=>{
 const f=await setup(t),id=await f.plan(),before=(await f.state()).data;
 const first=f.body(await f.review(id));ok(await f.call('/plans/'+id+'/submit',first));assert.equal((await f.call('/plans/'+id+'/submit',first)).status,409);
 const submitted=f.read().workflows[id].submissions[0];ok(await f.act(id,'return'));ok(await f.act(id,'submit'));
 assert.deepEqual(f.read().workflows[id].submissions[0],submitted);assert.equal(f.read().workflows[id].submissions.length,2);
 const token=f.body(await f.review(id));const pair=await Promise.all([f.call('/plans/'+id+'/confirm',token,'supervisor'),f.call('/plans/'+id+'/confirm',token,'supervisor')]);assert.deepEqual(pair.map(x=>x.status).sort(),[200,409]);
 const frozen=JSON.stringify(f.read().confirmations[0]),plan=JSON.stringify(f.read().plans[0]);
 for(const action of ['release','archive']){const b=f.body(await f.review(id));ok(await f.call('/plans/'+id+'/'+action,b,'supervisor'));const bytes=f.bytes();assert.equal((await f.call('/plans/'+id+'/'+action,b,'supervisor')).status,409);assert.equal(f.bytes(),bytes);}
 assert.equal(JSON.stringify(f.read().confirmations[0]),frozen);assert.equal(JSON.stringify(f.read().plans[0]),plan);assert.deepEqual((await f.state()).data,before);
 const c=f.read().confirmations[0],exported=await f.call('/export',{confirmationId:c.id});ok(exported);assert.equal(exported.data.workflow.state,'archived');assert.equal(JSON.stringify(exported.data.snapshot),JSON.stringify(c.snapshot));
 console.log('I01 evidence',JSON.stringify({state:f.read().workflows[id].state,submissions:2,snapshotHash:c.snapshotHash,events:f.read().workflows[id].events.map(e=>e.action)}));
});

test('I02 exact partial list rejects duplicates, omissions, extras, wrong types and absent acknowledgments for both actors',async t=>{
 const f=await setup(t),id=await f.plan({endMinute:35}),r=await f.review(id),ids=r.unplanned.map(x=>x.id);assert.ok(ids.length);assert.deepEqual(r.blockers,[]);
 const bad=[{unplannedIds:[...ids,ids[0]]},{unplannedIds:ids.slice(1)},{unplannedIds:[...ids,'unknown']},{unplannedIds:ids.map(()=>7)},{acceptPartial:'true'},{acknowledgeScope:1}];
 for(const extra of bad){const bytes=f.bytes();assert.equal((await f.act(id,'submit',extra)).status,400);assert.equal(f.bytes(),bytes);}
 ok(await f.act(id,'submit'));for(const extra of bad)assert.equal((await f.act(id,'confirm',extra)).status,400);
 ok(await f.act(id,'confirm',{unplannedIds:ids.toReversed()}));assert.deepEqual(f.read().confirmations[0].snapshot.review.unplanned,r.unplanned);
 console.log('I02 unplanned',JSON.stringify(r.unplanned.map(x=>({id:x.id,quantity:x.quantity,unit:x.unit,reasons:x.reasons}))));
});

test('I03 conditional supply cannot be authorized by truthy strings and snapshot preserves quantities and conditions',async t=>{
 const f=await setup(t),d=deliveryFixture(seed);d.rules.find(x=>x['规则编号']==='MATERIAL')['参数JSON']=JSON.stringify({'允许预计供给':true,'可用状态':['合格'],'预计状态':['预计可用'],'不可用状态':['待检','冻结','不合格']});d.inventory=d.inventory.filter(x=>x['物料编号']!=='LEAN');
 d.supplies=[{'供给编号':'EXPECT','物料编号':'LEAN','批次编号':'LOT','预计数量':'65','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];d.supplyUses=[{'引用编号':'USE','订单编号':'A','工序编号':'MIX','供给编号':'EXPECT','使用数量':'65'}];
 await f.input(d);const id=await f.plan(),r=await f.review(id);assert.ok(r.conditionalSupply.length);assert.deepEqual(r.blockers,[]);
 assert.equal((await f.act(id,'submit',{acceptConditionalSupply:'true'})).status,400);ok(await f.act(id,'submit'));assert.equal((await f.act(id,'confirm',{acceptConditionalSupply:1})).status,400);ok(await f.act(id,'confirm'));
 assert.deepEqual(f.read().confirmations[0].snapshot.review.conditionalSupply,r.conditionalSupply);console.log('I03 conditions',JSON.stringify(r.conditionalSupply));
});

test('I04 changed current execution facts block old confirmation, preserve historical run and allow fresh recomputation',async t=>{
 const f=await setup(t);await f.input(executionFixture(seed));const id=await f.plan();ok(await f.act(id,'submit'));const old=f.body(await f.review(id)),oldInput=f.read().inputVersions[f.read().plans[0].inputVersionId];
 const d=(await f.state()).data,facts=structuredClone(d.executionFacts);Object.assign(facts[0],{'工序完成数量':'50','观测分钟':'35','剩余工时分钟':'15'});await f.input({executionFacts:facts});
 assert.equal((await f.call('/plans/'+id+'/confirm',old,'supervisor')).status,409);assert.equal((await f.act(id,'confirm')).status,409);ok(await f.act(id,'return'));assert.equal((await f.act(id,'submit')).status,409);
 assert.deepEqual(f.read().inputVersions[oldInput.id],oldInput);const fresh=await f.plan();ok(await f.act(fresh,'submit'));ok(await f.act(fresh,'confirm'));assert.equal(f.read().confirmations[0].snapshot.originalInput.executionFacts[0]['工序完成数量'],'50');
 console.log('I04 current facts',JSON.stringify({old:'40',current:'50',confirmed:f.read().confirmations[0].snapshot.originalInput.executionFacts[0]}));
});

test('I05 rule activation changes review token without numeric input revision',async t=>{
 const f=await setup(t),rules=structuredClone((await f.state()).data.rules);Object.assign(rules.find(x=>x['规则编号']==='INVENTORY'),{'是否启用':'是','生效时间':'2099-01-01T00:00:00Z','参数JSON':'{"可用质量状态":["合格"]}'});await f.input({rules});
 const id=await f.plan();ok(await f.act(id,'submit'));const s=f.read(),p=s.plans.find(x=>x.id===id),early=reviewPlan(s,p,'2098-12-31T23:59:59Z'),late=reviewPlan(s,p,'2099-01-01T00:00:00Z');
 assert.deepEqual(early.blockers,[]);assert.ok(late.blockers.some(x=>x.code==='rule_effectivity_changed'));assert.notEqual(early.reviewHash,late.reviewHash);assert.equal(early.revision,late.revision);
 console.log('I05 future activation',JSON.stringify(late.blockers));
});

test('I06 selected-out effective demand and omitted enabled rules cannot become accepted partial plans',async t=>{
 const f=await setup(t);const id=await f.plan({orderIds:['A']}),r=await f.review(id);assert.ok(r.blockers.some(b=>b.code==='unlisted_demand'));assert.equal((await f.act(id,'submit')).status,409);
 const d=(await f.state()).data,enabled=d.rules.filter(x=>x['是否启用']==='是'&&x['规则编号']!=='INVENTORY').map(x=>x['规则编号']);
 const omitted=await f.plan({enabledRuleIds:enabled}),r2=await f.review(omitted);assert.ok(r2.blockers.some(b=>b.code==='unchecked_rules'));assert.equal((await f.act(omitted,'submit')).status,409);
 console.log('I06 excluded/unchecked',JSON.stringify([r.blockers,r2.blockers]));
});

test('I07 forged request actor/role/time/status/review cannot override trusted supervisor or immutable server calculation',async t=>{
 const f=await setup(t),id=await f.plan();
 for(const a of ['submit','confirm','return','release','archive'])assert.equal((await f.act(id,a,{actor:'ind#supervisor',role:'supervisor',status:'confirmed'},'query',{'x-role':'supervisor','x-user-role':'supervisor'})).status,403);
 ok(await f.act(id,'submit'));ok(await f.act(id,'confirm',{actor:'ind#admin',role:'admin',at:'1900-01-01',status:'draft',review:{blockers:[]},tasks:[],resultAssessment:{status:'all-scheduled'}}));
 const c=f.read().confirmations[0];assert.equal(c.actor,'ind#supervisor');assert.equal(c.snapshot.decision.role,'supervisor');assert.notEqual(c.snapshot.decision.at,'1900-01-01');assert.ok(c.snapshot.plan.tasks.length);assert.equal(c.snapshot.plan.status,'confirmed');
 for(const action of ['verify','submit','return','confirm'])assert.equal((await f.act(id,action)).status,409);assert.equal((await f.call('/plans',{id,status:'draft',tasks:[]})).status,409);
 assert.ok(f.read().records.filter(r=>['submit','confirm'].includes(r.action)).every(r=>r.requestId==='independent-request'&&r.actor!=='ind#admin'));
});

test('I08 supervisor revocation and export revocation are honored after review without business writes',async t=>{
 const f=await setup(t),id=await f.plan();ok(await f.act(id,'submit'));const token=f.body(await f.review(id));f.store.setRole('ind#supervisor','query','ind#admin');const bytes=f.bytes();assert.equal((await f.call('/plans/'+id+'/confirm',token,'supervisor')).status,403);assert.equal(f.bytes(),bytes);
 f.store.setRole('ind#supervisor','supervisor','ind#admin');ok(await f.act(id,'confirm'));const cid=f.read().confirmations[0].id;
 assert.equal((await f.call('/export',{confirmationId:cid,canExport:true,role:'supervisor'},'query')).status,403);f.store.setExport('ind#query',true,'ind#admin');ok(await f.call('/export',{confirmationId:cid},'query'));
 f.store.setExport('ind#query',false,'ind#admin');assert.equal((await f.call('/export',{confirmationId:cid},'query')).status,403);f.store.remove('ind#supervisor');assert.equal((await f.act(id,'archive')).status,403);
});

test('I09 CSRF, malformed/conflicting origins, missing/oversized reasons deny lifecycle and export atomically',async t=>{
 const f=await setup(t),id=await f.plan();
 const forbidden=[{origin:'https://attacker.test'},{origin:'null'},{origin:'not a url'},{origin:f.url,'sec-fetch-site':'cross-site'},{origin:f.url,'sec-fetch-site':'same-site'},{origin:f.url+' https://attacker.test'}];
 for(const action of ['submit','confirm','return','release','archive'])for(const h of forbidden){const bytes=f.bytes();assert.equal((await f.act(id,action,{},'supervisor',h)).status,403);assert.equal(f.bytes(),bytes);}
 for(const reason of ['',null,' '.repeat(4),'x'.repeat(1001)])assert.equal((await f.act(id,'submit',{reason})).status,400);
 ok(await f.act(id,'submit',{},'planner',{origin:f.url,'sec-fetch-site':'same-origin'}));ok(await f.act(id,'confirm'));const cid=f.read().confirmations[0].id;
 for(const h of forbidden)assert.equal((await f.call('/export',{confirmationId:cid},'supervisor',h)).status,403);
});

test('I10 stale numeric revision and same-revision current-data hash alteration require fresh computation',async t=>{
 const f=await setup(t),id=await f.plan();ok(await f.act(id,'submit'));const token=f.body(await f.review(id));
 const orders=structuredClone((await f.state()).data.orders);orders[0]['合格需求']='241';await f.input({orders});assert.equal((await f.call('/plans/'+id+'/confirm',token,'supervisor')).status,409);
 f.mutate(s=>s.revision=token.revision);const r=await f.review(id);assert.ok(r.blockers.some(b=>b.code==='stale_input'));assert.equal((await f.act(id,'confirm')).status,409);
});

test('I11 failed/running/corrupt/unchecked/conflicting saved plans fail closed and reject without touching disk',async t=>{
 const mutations={running:(s,p,r)=>r.status='running',failed:(s,p,r)=>r.status='failed',cancelled:(s,p,r)=>r.status='cancelled',timedout:(s,p,r)=>r.status='timed_out',orphan:(s,p,r)=>r.planId='other',empty:(s,p)=>p.tasks=[],unchecked:(s,p)=>delete p.verification,ruleSnapshot:(s,p)=>delete p.ruleSnapshot,overlap:(s,p)=>{p.tasks[1].machine=p.tasks[0].machine;p.tasks[1].start=p.tasks[0].start;},finding:(s,p)=>p.findings.push({code:'UNKNOWN',taskIds:[p.tasks[0].id],message:'unrecognized'}),original:(s,p)=>s.inputVersions[p.inputVersionId].data.orders=[],runinput:(s,p,r)=>r.executionData.orders=[],condition:(s,p)=>p.conditions.endMinute=1};
 for(const [kind,mutate] of Object.entries(mutations)){const f=await setup(t),id=await f.plan();ok(await f.act(id,'submit'));f.mutate(s=>{const p=s.plans.find(x=>x.id===id);mutate(s,p,s.runs.find(x=>x.id===p.runId));});const bytes=f.bytes(),r=await f.act(id,'confirm');assert.equal(r.status,409,kind+JSON.stringify(r));assert.equal(f.bytes(),bytes,kind);console.log('I11 blocked',kind,JSON.stringify(r.data.blockers?.map(x=>x.code)||r.data));}
});

test('I12 fresh R1 verification can pass after allocation tamper; supported scheduler replay still rejects it',async t=>{
 const f=await setup(t);await f.input(deliveryFixture(seed));const id=await f.plan();f.mutate(s=>{const p=s.plans.find(x=>x.id===id);assert.ok(p.materialDemands.length);p.materialDemands[0].quantity+=100000;});
 const checked=await f.call('/plans/'+id+'/verify',{});ok(checked);assert.ok(Object.values(checked.data.verification.checks).every(x=>x.status!=='problem'));assert.equal(checked.data.verification.findings.length,0);
 const r=await f.review(id);assert.ok(r.blockers.some(x=>x.code==='result_mismatch'));assert.equal((await f.act(id,'submit')).status,409);
 console.log('I12 verification scope',JSON.stringify({independent:Object.keys(checked.data.verification.checks),replayBlockers:r.blockers,scope:r.scope}));
});

test('I13 historical input edits, copying/discarding, restore denial retain confirmation and current facts',async t=>{
 const f=await setup(t);await f.input(executionFixture(seed));const id=await f.plan();ok(await f.act(id,'submit'));ok(await f.act(id,'confirm'));const frozen=JSON.stringify(f.read().confirmations[0]),before=structuredClone((await f.state()).data);
 const copy=await f.call('/plans/'+id+'/copy',{});assert.equal(copy.status,201);const copied=copy.data.basePlanId;assert.equal((await f.act(copied,'submit')).status,409);
 ok(await f.call('/trials/'+copy.data.id+'/discard',{revision:0}));assert.equal((await f.call('/plans/'+id+'/restore',{revision:(await f.state()).revision})).status,409);
 const facts=structuredClone(before.executionFacts);Object.assign(facts[0],{'工序完成数量':'50','观测分钟':'35','剩余工时分钟':'15'});await f.input({executionFacts:facts});assert.equal((await f.act(id,'release')).status,409);ok(await f.act(id,'archive'));
 assert.equal(JSON.stringify(f.read().confirmations[0]),frozen);assert.deepEqual((await f.state()).data.executionFacts,facts);assert.deepEqual((await f.state()).data.executionMaterials,before.executionMaterials);assert.equal((await f.call('/plans/'+id+'/inputs')).data.data.executionFacts[0]['工序完成数量'],'40');
});

test('I14 corrupt confirmation is rejected consistently by detail/export/lifecycle/list/review queries',async t=>{
 const f=await setup(t),id=await f.plan();ok(await f.act(id,'submit'));ok(await f.act(id,'confirm'));const cid=f.read().confirmations[0].id,archiveToken=f.body(await f.review(id));
 f.mutate(s=>s.confirmations[0].snapshot.originalInput.orders=[]);const before=f.bytes();
 const detail=await f.call('/confirmations/'+cid),exp=await f.call('/export',{confirmationId:cid}),archive=await f.call('/plans/'+id+'/archive',archiveToken,'supervisor'),list=await f.call('/confirmations'),review=await f.call('/plans/'+id+'/review');
 console.log('I14 integrity evidence',JSON.stringify({detail:detail.status,export:exp.status,archive:archive.status,list:list.status,review:review.status,listOrders:list.data[0]?.snapshot?.originalInput?.orders,reviewOrders:review.data.confirmation?.snapshot?.originalInput?.orders}));
 assert.equal(detail.status,409);assert.equal(exp.status,409);assert.equal(archive.status,409);assert.equal(f.bytes(),before);
 assert.equal(list.status,409,'Corrupt confirmed snapshot must not be returned as successful immutable history');assert.equal(review.status,409);
});

test('I15 real calculation Worker terminal result supports full internal workflow without external services',async t=>{
 const f=await setup(t),started=await f.call('/runs',{revision:0});assert.equal(started.status,202);let r;
 for(let n=0;n<150;n++){r=await f.call('/runs/'+started.data.id);if(['completed','partial','failed','timed_out'].includes(r.data.status))break;await new Promise(r=>setTimeout(r,20));}
 assert.ok(['completed','partial'].includes(r.data.status));assert.ok(r.data.planId);const id=r.data.planId;ok(await f.call('/plans/'+id+'/verify',{}));ok(await f.act(id,'submit'));ok(await f.act(id,'confirm'));ok(await f.act(id,'release'));ok(await f.act(id,'archive'));
 assert.equal(f.read().confirmations[0].snapshot.run.id,started.data.id);console.log('I15 Worker',JSON.stringify({runId:started.data.id,status:r.data.status,workflow:f.read().workflows[id].state}));
});

test('I16 delivery quality/life and declared maximum waiting semantics cannot be bypassed with all acknowledgments',async t=>{
 for(const kind of ['quality','life','maxwait']){const f=await setup(t),d=deliveryFixture(seed);if(kind==='quality')d.deliveryConditions[0]['模拟质量状态']='模拟不合格';if(kind==='life'){d.deliveryConditions[0]['模拟有效期截止时间']='2026-11-02T00:30:00Z';d.deliveryConditions[0]['要求剩余有效分钟']='100';}if(kind==='maxwait')d.routes.find(r=>r['前序工序'])['最大等待分钟']='1';await f.input(d);const id=await f.plan(),r=await f.review(id);assert.ok(r.blockers.some(b=>['delivery_condition_blocked','unsupported_semantics'].includes(b.code)));assert.equal((await f.act(id,'submit',{acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true})).status,409);console.log('I16 unsupported',kind,JSON.stringify(r.blockers));}
});

test('I17 submitted trial cannot be confirmed after discard or revised trial input',async t=>{
 for(const mutation of ['discard','edit']){const f=await setup(t),source=await f.plan(),trial=await f.call('/plans/'+source+'/copy',{});assert.equal(trial.status,201);const p=await f.call('/calculate',{trialId:trial.data.id,revision:0});assert.equal(p.status,201);const id=p.data.id;ok(await f.call('/plans/'+id+'/verify',{}));ok(await f.act(id,'submit'));
 if(mutation==='discard')ok(await f.call('/trials/'+trial.data.id+'/discard',{revision:0}));else{const orders=structuredClone((await f.state()).data.orders);orders[0]['合格需求']='241';ok(await f.call('/trials/'+trial.data.id+'/inputs',{revision:0,tables:{orders}}));}
 const before=f.bytes();assert.equal((await f.act(id,'confirm')).status,409);assert.equal(f.bytes(),before);}
});

// HISTORY-01 repair regression: mixed lists fail as a whole, while a valid
// confirmation remains individually readable and its lifecycle still works.
for(const corruptIndex of [0,1])test(`HISTORY-01 mixed valid/corrupt histories (corrupt index ${corruptIndex})`,async t=>{
 const f=await setup(t);assert.deepEqual((await f.call('/confirmations')).data,[]);
 const ids=[];
 for(let n=0;n<2;n++){const id=await f.plan();ok(await f.act(id,'submit'));ok(await f.act(id,'confirm'));ids.push(id);}
 const original=f.read().confirmations;
 assert.deepEqual((await f.call('/confirmations',undefined,'query')).data,original);
 const bad=original[corruptIndex],good=original[1-corruptIndex];
 const token=f.body(await f.review(bad.planId));
 f.mutate(s=>s.confirmations[corruptIndex].snapshot.originalInput.orders=[]);
 const bytes=f.bytes();
 for(const role of ['planner','supervisor','query']){
  for(const route of ['/confirmations','/confirmations/'+bad.id,'/plans/'+bad.planId+'/review']){
   const r=await f.call(route,undefined,role);assert.equal(r.status,409);assert.deepEqual(r.data,{error:'protected_history_unavailable'});
  }
  const detail=await f.call('/confirmations/'+good.id,undefined,role);ok(detail);assert.deepEqual(detail.data,good);
  const review=await f.call('/plans/'+good.planId+'/review',undefined,role);ok(review);assert.deepEqual(review.data.confirmation,good);
 }
 for(const action of ['release','archive']){
  const r=await f.call('/plans/'+bad.planId+'/'+action,token,'supervisor');assert.equal(r.status,409);assert.equal(r.data.error,'protected_history_unavailable');
 }
 const rejected=await f.call('/export',{confirmationId:bad.id});assert.equal(rejected.status,409);assert.equal(rejected.data.error,'protected_history_unavailable');
 assert.equal(f.bytes(),bytes);
 ok(await f.call('/export',{confirmationId:good.id}));ok(await f.act(good.planId,'release'));ok(await f.act(good.planId,'archive'));
 assert.deepEqual((await f.call('/confirmations/'+good.id)).data,good);
 // Repairing only the fixture's persisted snapshot restores the ordinary list.
 f.mutate(s=>s.confirmations[corruptIndex]=bad);
 assert.deepEqual((await f.call('/confirmations')).data,original);
});

test('HISTORY-01 missing snapshot/hash fails closed across every confirmation read',async t=>{
 const f=await setup(t),id=await f.plan();ok(await f.act(id,'submit'));ok(await f.act(id,'confirm'));
 const c=f.read().confirmations[0],token=f.body(await f.review(id));
 for(const kind of ['missingSnapshot','nullSnapshot','missingHash','changedHash']){
  f.mutate(s=>{s.confirmations[0]=structuredClone(c);const x=s.confirmations[0];if(kind==='missingSnapshot')delete x.snapshot;if(kind==='nullSnapshot')x.snapshot=null;if(kind==='missingHash')delete x.snapshotHash;if(kind==='changedHash')x.snapshotHash='bad';});
  const before=f.bytes();
  for(const route of ['/confirmations','/confirmations/'+c.id,'/plans/'+id+'/review'])assert.equal((await f.call(route)).status,409,kind);
  for(const action of ['release','archive'])assert.equal((await f.call('/plans/'+id+'/'+action,token,'supervisor')).status,409,kind);
  assert.equal((await f.call('/export',{confirmationId:c.id})).status,409,kind);assert.equal(f.bytes(),before);
 }
});
