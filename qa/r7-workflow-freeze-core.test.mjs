import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './fr027-fixture.mjs';
import {r4Scenario} from './r4-fixture.mjs';
import {scenarioFiles} from './b3-material-fixture.mjs';
import {enableJoint,claim} from './joint-fixture.mjs';
import {inputHash} from '../server/run-input.mjs';

const save=(id,value)=>{if(process.env.R7_CORE_OUT)fs.writeFileSync(process.env.R7_CORE_OUT+'/'+id+'.json',JSON.stringify(value,null,2));};
export function coreProfile(){
 const d=r4Scenario('13');
 // Existing P10 explicit physical pool, with production declarations. No new policy.
 d.personnelGroups=[{'人员组编号':'R7-CREW','人员组名称':'可替换模拟生产组','人员数量':'2','技能':'PROD','班次':'D','可用起始分钟':'0','可用结束分钟':'1440','poolId':'R7-POOL'}];
 d.personnelPools=[{poolId:'R7-POOL','池名称':'可替换唯一生产池','总人数':'2','是否启用':'是','允许共用':'是','容量来源':'MOCK:R7-explicit','适用范围':'*','生效时间':'','交接设置':'','策略版本':'P10-explicit-v2','策略来源':'既有明确策略','互斥粒度':'无互斥','交接模式':'不设交接限制','交接起始分钟':'','交接结束分钟':'','交接容量人数':'','占用策略':'依赖声明','释放策略':'半开端点释放'}];
 for(const o of d.orders){d.dependencies.push({'订单编号':o['订单编号'],'工序编号':'MIX','资源类型':'人员技能','资源编号':'R7-CREW','所需技能':'PROD','窗口外释放':'否','需求数量':'1','提前占用分钟':'0','后延占用分钟':'0'});}
 Object.assign(d.rules.find(r=>r['规则编号']==='LABOR'),{'是否启用':'是','参数JSON':'{}'});return d;
}
async function imported(f,d){const s=await f.ok('/state'),response=await f.call('/imports/preview',{revision:s.revision,files:scenarioFiles(d),inputStage:'supported'}),p=response.body;save('import-preview',p);assert.equal(p.valid,true,JSON.stringify(p.issues));return f.ok('/imports/commit',{previewId:p.id});}
async function run(f,selection={endMinute:1000}){const s=await f.ok('/state'),r=await f.ok('/runs',{revision:s.revision,selection});for(let n=0;n<250;n++){const x=await f.ok('/runs/'+r.id);if(!['queued','running'].includes(x.status)){assert.ok(x.planId,JSON.stringify(x));await f.ok('/plans/'+x.planId+'/verify',{});return {run:x,plan:(await f.ok('/plans')).find(p=>p.id===x.planId)};}await new Promise(r=>setTimeout(r,20));}throw Error('bounded Worker deadline');}
async function decision(f,id){const r=await f.ok('/plans/'+id+'/review');return {revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true};}
async function action(f,id,name,extra={}){return f.call('/plans/'+id+'/'+name,{...await decision(f,id),...extra},name==='submit'?'planner':'supervisor');}

test('complete kg/MAX_LAG/physical pool/material Worker can return, modify, resubmit, confirm, archive and export immutable history',async t=>{
 const f=await fixture(t),d=coreProfile();await imported(f,d);const a=await run(f),id=a.plan.id;
 assert.equal(a.plan.processRouteContract,'R4-kg-fixed-pair-v1');assert.equal(a.plan.tasks.length,10);
 // Independent fixed fixture expectations: two 240kg orders, five operations each,
 // HEAT120, COOL60, ten-minute max wait, pool maximum two physical people.
 for(const o of d.orders){const ts=a.plan.tasks.filter(t=>t.orderId===o['订单编号']);assert.equal(ts.length,5);const h=ts.find(t=>t.operation==='HEAT'),c=ts.find(t=>t.operation==='COOL');assert.equal(h.duration,120);assert.equal(c.duration,60);assert.ok(c.start>=h.end&&c.start-h.end<=10);}
 for(let m=0;m<1000;m++)assert.ok(a.plan.resourceReservations.filter(r=>r.type==='人员'&&r.resourceId==='R7-CREW'&&r.start<=m&&m<r.end).reduce((n,r)=>n+Number(r.quantity),0)<=2);
 let review=await f.ok('/plans/'+id+'/review');save('core-initial-review',{a,review});assert.deepEqual(review.blockers,[]);
 assert.equal((await action(f,id,'submit')).status,200);assert.equal((await action(f,id,'return',{reason:'模拟主管：调整优先顺序后重算'})).status,200);
 const s=await f.ok('/state');await f.ok('/inputs',{revision:s.revision,tables:{orders:d.orders.map((o,i)=>({...o,'优先顺序':String(2-i)}))}});
 assert.equal((await action(f,id,'submit')).status,409);
 const b=await run(f);assert.notEqual(b.plan.inputVersionId,a.plan.inputVersionId);assert.equal((await action(f,b.plan.id,'submit')).status,200);
 const stale=await decision(f,b.plan.id);assert.equal((await action(f,b.plan.id,'return',{reason:'模拟主管复核完毕，重交用于并发保护验证'})).status,200);
 const before=f.bytes();assert.equal((await f.call('/plans/'+b.plan.id+'/confirm',stale,'supervisor')).status,409);assert.equal(f.bytes(),before);
 assert.equal((await action(f,b.plan.id,'submit')).status,200);assert.equal((await action(f,b.plan.id,'confirm')).status,200);
 review=await f.ok('/plans/'+b.plan.id+'/review');const c=await f.ok('/confirmations/'+review.confirmation.id),bytes=JSON.stringify(c);
 assert.equal((await action(f,b.plan.id,'archive')).status,200);const csv=await f.ok('/export',{planId:b.plan.id}),frozen=await f.ok('/runs/'+b.run.id+'/inputs');
 const current=await f.ok('/state');await f.ok('/inputs',{revision:current.revision,tables:{orders:d.orders.map(o=>({...o,'优先顺序':'3'}))}});
 assert.equal(JSON.stringify(await f.ok('/confirmations/'+c.id)),bytes);assert.equal(await f.ok('/export',{planId:b.plan.id}),csv);assert.deepEqual(await f.ok('/runs/'+b.run.id+'/inputs'),frozen);
 const reopened=await fixture(t);fs.writeFileSync(reopened.dir+'/business.json',f.bytes());assert.equal(JSON.stringify(await reopened.ok('/confirmations/'+c.id)),bytes);assert.equal(await reopened.ok('/export',{planId:b.plan.id}),csv);
 save('core-complete-chain',{first:a,second:b,review,confirmation:c,csv,frozen,operations:await f.ok('/operations'),persistedStateHash:inputHash(JSON.parse(f.bytes()))});
 if(process.env.R7_CORE_OUT)fs.copyFileSync(f.dir+'/business.json',process.env.R7_CORE_OUT+'/core-business.json');
});

test('partial known demand requires complete acknowledgement and conflict/tampered result remain blocked',async t=>{
 const f=await fixture(t);await imported(f,coreProfile());const a=await run(f,{endMinute:250}),id=a.plan.id,r=await f.ok('/plans/'+id+'/review');save('core-partial-review',{a,r});assert.ok(r.unplanned.length);assert.ok(a.plan.tasks.length);assert.deepEqual(r.blockers,[]);
 assert.equal(r.independentChecks.checks.processRoute.coverage,'known-partial');
 const original=f.bytes(),s=JSON.parse(original);s.plans.find(p=>p.id===id).findings[0].unplannedCause='SEARCH_LIMIT';fs.writeFileSync(f.dir+'/business.json',JSON.stringify(s));assert.ok((await f.ok('/plans/'+id+'/review')).blockers.length);assert.equal((await action(f,id,'submit')).status,409);fs.writeFileSync(f.dir+'/business.json',original);
 for(const bad of [{acceptPartial:false},{unplannedIds:[]},{unplannedIds:[...r.unplanned.map(t=>t.id),r.unplanned[0].id]}]){const before=f.bytes();assert.equal((await action(f,id,'submit',bad)).status,400);assert.equal(f.bytes(),before);}
 assert.equal((await action(f,id,'submit')).status,200);assert.equal((await action(f,id,'confirm')).status,200);save('core-partial-accepted',await f.ok('/plans/'+id+'/review'));
 const csv=await f.ok('/export',{planId:id});assert.ok(csv.includes('PROCESS_PAIR'));save('core-partial-native',{csv,unplannedIds:r.unplanned.map(t=>t.id)});
});

test('stale input/result/review/submission and real rule conflicts cannot confirm or mutate history',async t=>{
 const f=await fixture(t);await imported(f,coreProfile());const a=await run(f),id=a.plan.id;
 assert.equal((await action(f,id,'submit')).status,200);const request=await decision(f,id),file=f.dir+'/business.json',original=f.bytes();
 for(const damage of ['input','result','conflict','unchecked']){
  const s=JSON.parse(original),p=s.plans.find(p=>p.id===id);
  if(damage==='input')s.revision++;
  if(damage==='result')p.tasks[0].start++;
  if(damage==='conflict')p.findings.push({code:'RULE / MAX_LAG',message:'明确规则冲突不能当作已知未排',taskIds:[p.tasks[0].id]});
  if(damage==='unchecked')p.conditions.mode='minimal-r1';
  fs.writeFileSync(file,JSON.stringify(s));const before=f.bytes(),resp=await f.call('/plans/'+id+'/confirm',request,'supervisor');assert.equal(resp.status,409,damage);assert.equal(f.bytes(),before);
  if(damage!=='input'){const current=await f.ok('/plans/'+id+'/review');assert.ok(current.blockers.length);assert.equal((await action(f,id,'confirm')).status,409);}
  save('core-negative-'+damage,{response:resp,bytesUnchanged:f.bytes()===before});
 }
 fs.writeFileSync(file,original);const wrong=await f.call('/plans/'+id+'/confirm',{...request,submissionId:'old-submission'},'supervisor');assert.equal(wrong.status,409);assert.equal(f.bytes(),original);
 assert.equal((await f.call('/plans/'+id+'/confirm',request,'query')).status,403);assert.equal(f.bytes(),original);
 assert.equal((await f.call('/plans/'+id+'/confirm',request,'supervisor')).status,200);
 const r=await f.ok('/plans/'+id+'/review');assert.equal(r.confirmation.snapshot.submission.review.independentChecks.checks.processRoute.coverage,'complete');
 for(const rule of ['CAPACITY','PROGRAM','MATERIAL','MAX_LAG','LABOR'])assert.equal(r.confirmation.snapshot.review.independentChecks.ruleStatuses.find(r=>r.id===rule).status,'pass',rule);
 save('core-concurrent-negative',{wrongSubmission:wrong,confirmation:r.confirmation});
});
