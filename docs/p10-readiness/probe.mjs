// Readiness probe only. Uses synthetic fixtures and disposable store, no product edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {s06Fixture} from '../../qa/s06-fixture.mjs';
import {fixture} from '../../qa/fr027-fixture.mjs';
import {defs} from '../../server/planner.ts';
import {allocatePersonnel} from '../../src/lib/staffing.mjs';
import {verifyResourcePolicies} from '../../src/lib/verify-resource-policies.mjs';
const report={scope:'Existing-model P10 readiness, not P10 implementation acceptance or a new defect',synthetic:true,cases:[]};
const hash=x=>createHash('sha256').update(x).digest('hex');
const d=s06Fixture();
// Two existing groups are independent in this schema. The annotation that they
// represent one real person exists only in this probe; it CANNOT be submitted.
d.skillSubstitutions=[];
d.dependencies.filter(r=>r['资源类型']==='人员技能').forEach((r,i)=>{
 r['资源编号']=i?'B':'A';r['候选人员组']='';r['所需技能']=i?'B':'A';r['人员岗位编号']='POST'+i;
});
const requirements=d.dependencies.filter(r=>r['资源类型']==='人员技能');
assert.ok(!defs.find(x=>x.key==='personnelGroups').fields.some(f=>/物理池|poolId|交接|共用/.test(f)));
report.cases.push({id:'MODEL01',status:'PASS_PROBE',personnelGroupFields:defs.find(x=>x.key==='personnelGroups').fields,message:'No physical pool identity, pool total, sharing or handover fields in accepted schema.'});
const allocated=allocatePersonnel(requirements,d.personnelGroups,0,30);
assert.equal(allocated.ok,true);assert.equal(allocated.allocations.reduce((s,r)=>s+r.count,0),2);
report.cases.push({id:'MODEL02',status:'PASS_PROBE',allocated,message:'Two group capacities are independent by current contract. External same-person annotation cannot enter allocator; this is the dispatched scope gap, not a newly asserted product FAIL.'});
const f=await fixture();
try{
 await f.ok('/inputs',{revision:0,tables:d});
 const state=await f.ok('/state'),before=f.bytes();
 for(const [name,tables,status,error]of [
  ['poolId',{personnelGroups:state.data.personnelGroups.map(g=>({...g,poolId:'PHYSICAL-1'}))},400,'unknown_fields'],
  ['pool table',{personnelPools:[{poolId:'PHYSICAL-1',capacity:'1'}]},404,'unknown_table'],
  ['sharing/handover',{personnelGroups:state.data.personnelGroups.map(g=>({...g,'是否共用':'是','交接容量':'1'}))},400,'unknown_fields'],
 ]){
  const r=await f.call('/inputs',{revision:state.revision,tables});assert.equal(r.status,status);assert.equal(r.body.error,error);assert.equal(f.bytes(),before);
  report.cases.push({id:'API_'+name,status:'PASS_PROBE',response:r,beforeSha256:hash(before),afterSha256:hash(f.bytes())});
 }
 for(const [role,revision,status]of [['query',state.revision,403],['outsider',state.revision,403],['planner',0,409]]){
  const r=await f.call('/inputs',{revision,tables:{personnelGroups:state.data.personnelGroups}},role);assert.equal(r.status,status);assert.equal(f.bytes(),before);
  report.cases.push({id:'GUARD_'+role+'_'+status,status:'PASS_PROBE',response:r,beforeSha256:hash(before),afterSha256:hash(f.bytes())});
 }
 let run=await f.ok('/runs',{revision:state.revision,selection:{}});
 for(let i=0;i<300;i++){
  run=await f.ok('/runs/'+run.id);
  if(['completed','partial','failed','timed_out'].includes(run.status))break;
  await new Promise(r=>setTimeout(r,20));
 }
 assert.ok(['completed','partial'].includes(run.status),JSON.stringify(run));
 const plan=(await f.ok('/plans')).find(p=>p.runId===run.id),input=await f.ok('/runs/'+run.id+'/inputs');
 const v=await f.ok('/plans/'+plan.id+'/verify',{});
 assert.equal(plan.tasks.length,1);
 const ledger=plan.resourceReservations.filter(r=>r.type==='人员');assert.equal(ledger.reduce((s,r)=>s+Number(r.quantity),0),2);
 assert.equal(v.verification.checks.resourcePolicies.status,'pass');
 const frozen=input.executionData||input.originalInput||state.data;
 const forged=structuredClone(plan);for(const r of forged.resourceReservations.filter(r=>r.type==='人员'))r.poolId='PHYSICAL-1';
 const result=verifyResourcePolicies(forged,frozen,plan.conditions);
 assert.equal(result.status,'pass');
 report.cases.push({id:'WORKER_CHECKER',status:'PASS_PROBE',run,plan,input,verification:v,extraPoolIdIgnored:result,message:'Real async Worker and frozen independent checker use group-level capacity. Adding a ledger-only poolId cannot enforce an external total of one; never presented as supported P10.'});
 report.complete=true;
}finally{await f.close();fs.writeFileSync('/evidence/probe-results.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({complete:report.complete,cases:report.cases.map(c=>({id:c.id,status:c.status}))},null,2));
