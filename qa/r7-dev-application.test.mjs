import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fixture} from './fr027-fixture.mjs';import {seed} from '../server/planner.ts';import {materialScenario,scenarioFiles} from './b3-material-fixture.mjs';
import {parseInputCsv} from '../src/lib/input-csv.mjs';import {inputHash} from '../server/run-input.mjs';import {querySavedReport} from '../src/lib/r7-handoff.mjs';
const evidence=(id,x)=>{if(process.env.R7_EVIDENCE){fs.mkdirSync(process.env.R7_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.R7_EVIDENCE,id+'.json'),JSON.stringify(x,null,2));}};
const q=(id,kind,other={})=>({kind,planId:id,start:0,end:600,text:'',order:'',...other});
async function worker(f,selection){const s=await f.ok('/state'),r=await f.ok('/runs',{revision:s.revision,selection});let run;for(let n=0;n<500;n++){run=await f.ok('/runs/'+r.id);if(['completed','partial','failed','cancelled','timed_out'].includes(run.status))break;await new Promise(r=>setTimeout(r,10));}assert.ok(run.planId,JSON.stringify(run));await f.ok('/plans/'+run.planId+'/verify',{});return run.planId;}
async function decision(f,id,extra={}){const r=await f.ok('/plans/'+id+'/review');return {revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true,...extra};}
async function action(f,id,a,extra={}){return f.call('/plans/'+id+'/'+a,await decision(f,id,extra),a==='submit'?'planner':'supervisor');}

test('R7 actual import / built Worker / resources-materials review / return-resubmit-confirm / six exact native CSV / archive and reopen',async t=>{
 const f=await fixture(t),data=materialScenario('UAT-09');
 const pre=await f.ok('/imports/preview',{revision:0,files:scenarioFiles(data)});assert.equal(pre.valid,true,JSON.stringify(pre.issues));await f.ok('/imports/commit',{previewId:pre.id});
 const id=await worker(f),r=await f.ok('/plans/'+id+'/review');assert.deepEqual(r.blockers,[]);assert.equal(r.handoff.coverage.status,'complete');assert.equal(r.handoff.finalIndependentReviewRequired,true);assert.equal(r.handoff.workflowActionPerformed,false);assert.equal(r.independentChecks.checks.jointConditions.status,'pass');
 assert.equal((await action(f,id,'submit')).status,200);assert.equal((await action(f,id,'return')).status,200);assert.equal((await action(f,id,'submit')).status,200);assert.equal((await action(f,id,'confirm')).status,200);
 const confirmation=(await f.ok('/plans/'+id+'/review')).confirmation,confirmedBytes=JSON.stringify(confirmation),reports={};
 for(const kind of ['orders','tasks','occupation','materials','unplanned','differences']){
  const query=q(id,kind,kind==='differences'?{otherPlanId:id}:{}),report=await f.ok('/reports?query='+encodeURIComponent(JSON.stringify(query))),out=await f.ok('/export',{report:query,reportSnapshot:report,viewId:report.viewId});
  assert.equal(report.version,'R7-query-v1');assert.equal(report.provenance.confirmationId,confirmation.id);const csv=parseInputCsv(out);assert.equal(csv[1][1],report.viewId);assert.deepEqual(csv.slice(6),report.rows);assert.ok(out.includes(report.provenance.inputVersionId));assert.ok(out.includes('savedResultCoverage'));reports[kind]={report,csv:out};
 }
 assert.equal((await action(f,id,'release')).status,200);assert.equal((await action(f,id,'archive')).status,200);
 const before=JSON.parse(f.bytes());assert.equal(JSON.stringify(before.confirmations[0]),confirmedBytes);
 // A new application instance opens persisted JSON. No regeneration of historical results.
 const reopened=await fixture(t);fs.writeFileSync(path.join(reopened.dir,'business.json'),f.bytes());assert.deepEqual(await reopened.ok('/reports?query='+encodeURIComponent(JSON.stringify(q(id,'tasks')))),reports.tasks.report);
 const state=await f.ok('/state'),orders=structuredClone(state.data.orders);orders[0]['合格需求']='241';await f.ok('/inputs',{revision:state.revision,tables:{orders}});
 assert.equal(JSON.stringify(await f.ok('/confirmations/'+confirmation.id)),confirmedBytes);assert.deepEqual(await f.ok('/reports?query='+encodeURIComponent(JSON.stringify(q(id,'tasks')))),reports.tasks.report);
 const ops=await f.ok('/operations');for(const a of ['import','submit','return','confirm','release','archive','export'])assert.ok(ops.some(o=>o.action===a),a);
 evidence('APP-BP-CHAIN',{scope:'Explicit normalized one-line joint/material simulation; BP path evidence, not all AC25 requirements',review:r,confirmation,reports,operations:ops,reopened:true,historyPreserved:true});
});

test('R7 actual export rejects changed object, recomputed forgery, missing/corrupt sources, stale view, role and CSRF without writes',async t=>{
 const f=await fixture(t),id=await worker(f),query=q(id,'tasks'),report=await f.ok('/reports?query='+encodeURIComponent(JSON.stringify(query)));
 const original=f.bytes(),changed=structuredClone(report);changed.rows[0][1]='tampered';
 for(const snapshot of [changed,{...changed,viewId:inputHash(Object.fromEntries(Object.entries(changed).filter(([k])=>k!=='viewId')))}]){
  assert.equal((await f.call('/export',{report:query,reportSnapshot:snapshot,viewId:snapshot.viewId})).status,409);assert.equal(f.bytes(),original);
 }
 assert.equal((await f.call('/export',{report:query,viewId:'old'})).status,409);assert.equal(f.bytes(),original);
 assert.equal((await f.call('/export',{report:query,reportSnapshot:report,viewId:report.viewId},'query')).status,403);
 assert.equal((await f.call('/export',{report:query,viewId:report.viewId},'planner',{origin:'https://evil.invalid'})).status,403);assert.equal(f.bytes(),original);
 f.store.setExport('test#query',true,'test#admin');assert.equal((await f.call('/export',{report:query,reportSnapshot:report,viewId:report.viewId},'query')).status,200);
 const file=path.join(f.dir,'business.json'),s=JSON.parse(f.bytes());s.inputVersions={};fs.writeFileSync(file,JSON.stringify(s));const broken=f.bytes();assert.equal((await f.call('/reports?query='+encodeURIComponent(JSON.stringify(query)))).status,409);assert.equal((await f.call('/export',{report:query,reportSnapshot:report,viewId:report.viewId})).status,409);assert.equal(f.bytes(),broken);
 evidence('APP-REPORT-NEGATIVE',{originalReport:report,changedDigestRejected:true,recomputedForgeryRejected:true,staleViewRejected:true,roleCsrf:true,missingHistoryRejected:true});
});

test('R7 real workflow data gate exposes missing order/delivery records and blocks even with all acknowledgements',async t=>{
 for(const damage of ['delivery','quantity','task']){
  const f=await fixture(t),id=await worker(f),file=path.join(f.dir,'business.json'),s=JSON.parse(f.bytes()),p=s.plans.find(x=>x.id===id);
  if(damage==='delivery')p.deliveryAssessment.orders=[];if(damage==='quantity')p.resultAssessment.tasks[0].quantity=null;if(damage==='task')p.tasks=[];fs.writeFileSync(file,JSON.stringify(s));const before=f.bytes(),r=await f.ok('/plans/'+id+'/review');
  assert.ok(r.handoff.blockers.some(b=>['DELIVERY_ASSESSMENT_MISSING','DEMAND_DATA_MISSING','NO_SCHEDULED_TASKS','TASK_MISSING'].includes(b.code)),JSON.stringify(r.handoff.blockers));assert.equal((await action(f,id,'submit')).status,409);assert.equal(f.bytes(),before);
  evidence('APP-DATA-GATE-'+damage,{review:r,rejected:true,bytesUnchanged:true});
 }
});

test('R7 partial acceptance maps acceptPartial, records full unplanned list, and input changes require resubmission',async t=>{
 const f=await fixture(t),id=await worker(f,{endMinute:35}),r=await f.ok('/plans/'+id+'/review');assert.ok(r.unplanned.length);assert.deepEqual(r.blockers,[]);
 for(const extra of [{acceptPartial:false},{unplannedIds:[]},{unplannedIds:[...r.unplanned.map(t=>t.id),r.unplanned[0].id]},{acknowledgeScope:false}]){const before=f.bytes();assert.equal((await action(f,id,'submit',extra)).status,400);assert.equal(f.bytes(),before);}
 assert.equal((await action(f,id,'submit')).status,200);const submitted=await f.ok('/plans/'+id+'/review');assert.equal(submitted.workflow.submission.handoff.dataGatePassed,true);assert.equal(submitted.workflow.submission.decision.allowPartial,true);assert.deepEqual(submitted.workflow.submission.decision.unplannedIds,r.unplanned.map(t=>t.id));
 const old=await decision(f,id),state=await f.ok('/state'),orders=structuredClone(state.data.orders);orders[0]['合格需求']='241';await f.ok('/inputs',{revision:state.revision,tables:{orders}});const before=f.bytes();assert.equal((await f.call('/plans/'+id+'/confirm',old,'supervisor')).status,409);assert.equal(f.bytes(),before);const latest=await f.ok('/plans/'+id+'/review');assert.equal(latest.handoff.requiresResubmission,true);assert.equal((await action(f,id,'return')).status,200);
 evidence('APP-PARTIAL-RESUBMIT',{submitted,latest,oldDecisionRejected:true});
});
