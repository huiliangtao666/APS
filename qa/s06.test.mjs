import test from 'node:test';import assert from 'node:assert/strict';
import {allocatePersonnel} from '../src/lib/staffing.mjs';import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';
import {validateInputs} from '../server/input-validation.mjs';import {defs,calculate} from '../server/planner.ts';import {freezeRunInput} from '../server/run-input.mjs';
import {groups,requirements,edges,s06Fixture} from './s06-fixture.mjs';import {fixture} from './fr027-fixture.mjs';
const clone=x=>structuredClone(x);
function verify(d,p){return verifyResourcePolicies(p,d,p.conditions);}
function plan(d){const f=freezeRunInput(d,{});return {f,p:calculate(f.executionData,1,f.conditions.ruleEvaluationAt,f.conditions)};}
test('S06 all demand/candidate/group permutations find A→R2, B→R1',()=>{
 for(const reverse of [false,true])for(const candidate of ['A,B','B,A'])for(const gs of [groups,[...groups].reverse()]){
  const req=clone(requirements);req[0]['候选人员组']=candidate;const x=allocatePersonnel(reverse?req.reverse():req,gs,0,30,[],edges);assert.ok(x.ok,JSON.stringify(x));assert.deepEqual(x.allocations.map(a=>[a.requiredSkill,a.groupId]).sort(),[['A','A'],['B','B']]);
 }
});
test('S07 no cloned headcount; failures leave caller reservations intact',()=>{
 const r=clone(requirements);r[0]['候选人员组']='A';const prior=[],before=JSON.stringify(prior);const x=allocatePersonnel(r,[groups[0]],0,30,prior,edges);assert.equal(x.ok,false);assert.equal(x.searchStatus,'exhausted');assert.equal(x.allocations,undefined);assert.equal(JSON.stringify(prior),before);
});
test('finite search backtracks across overlapping windows rather than only sorting candidate counts',()=>{
 const r=clone(requirements);r[1]['资源编号']='';r[1]['候选人员组']='A,B';r[1]['所需技能']='B';r[1]['__policyRoleSource']='separate-order';r[0]['人员结束偏移']='10';r[1]['人员开始偏移']='10';
 const g=clone(groups);g[1]['可用起始分钟']='10';const x=allocatePersonnel(r,g,0,30,[],edges);assert.ok(x.ok,JSON.stringify(x));assert.equal(x.allocations.find(a=>a.start===0).groupId,'A');assert.equal(x.allocations.find(a=>a.start===10).groupId,'B');
});
test('half-open prior occupancy, shift/availability and candidate restrictions apply',()=>{
 const req=[requirements[0]];assert.ok(allocatePersonnel(req,groups,10,30,[{groupId:'A',count:1,start:0,end:10}],edges).ok);
 const busy=[{groupId:'A',count:1,start:0,end:30},{groupId:'B',count:1,start:20,end:40}];assert.equal(allocatePersonnel(req,groups,10,30,busy,edges).ok,false);
 const r=clone(req);r[0]['候选人员组']='A';assert.equal(allocatePersonnel(r,[{...groups[0],'班次':'X'},groups[1]],0,30,[],edges).ok,false);
 assert.equal(allocatePersonnel(r,[{...groups[0],'可用结束分钟':'29'},groups[1]],0,30,[],edges).ok,false);
});
test('disabled, reverse and transitive substitutions never create eligibility; split counts share pool',()=>{
 const r=clone(requirements);r[0]['候选人员组']='A';assert.equal(allocatePersonnel(r,groups,0,30,[],edges.map(e=>({...e,'是否启用':'否'}))).ok,false);
 const reverse=[{...requirements[1],'资源编号':'B'}];assert.equal(allocatePersonnel(reverse,groups,0,30,[],edges).ok,false);
 const chain=[...edges, {...edges[0],'关系编号':'BC','可提供技能':'B','所需技能':'C'}];assert.equal(allocatePersonnel([{...requirements[0],'候选人员组':'A','所需技能':'C'}],groups,0,30,[],chain).ok,false);
 const x=allocatePersonnel([{...requirements[0],'需求数量':'2'}],groups,0,30,[],edges);assert.ok(x.ok);assert.deepEqual(x.allocations.map(a=>a.count),[1,1]);
});
test('search boundary is explicit and produces no tentative allocations',()=>{
 const req=Array.from({length:257},(_,i)=>({...requirements[1],'人员参与阶段':'','__policyRoleSource':'r'+i}));const x=allocatePersonnel(req,groups,0,30,[],edges);assert.equal(x.searchStatus,'limit');assert.match(x.reason,/不代表数学不可行/);assert.equal(x.allocations,undefined);
});
test('Worker input shape and frozen checker reject forged eligibility, demand and capacity',()=>{
 const d=s06Fixture();assert.deepEqual(validateInputs(defs,d),[]);const {f,p}=plan(d);assert.equal(p.tasks.length,1);assert.equal(verify(f.executionData,p).status,'pass');
 const prs=p.resourceReservations.filter(r=>r.type==='人员');assert.equal(prs.length,2);
 for(const mutate of [p=>p.resourceReservations.find(r=>r.type==='人员'&&r.requiredSkill==='B').resourceId='A',p=>p.resourceReservations=p.resourceReservations.filter(r=>!(r.type==='人员'&&r.requiredSkill==='B')),p=>p.resourceReservations.find(r=>r.type==='人员').quantity='2',p=>p.resourceReservations.find(r=>r.type==='人员').demandKey='forged',p=>p.resourceReservations.push({...prs[0],taskId:'ghost'})]){const bad=clone(p);mutate(bad);assert.equal(verify(f.executionData,bad).status,'problem',JSON.stringify(bad));}
 const badData=clone(f.executionData);badData.dependencies.find(r=>r['候选人员组'])['候选人员组']='A';assert.equal(verify(badData,p).status,'problem');
});
test('legacy explicit group remains single; historical ledgers without demand key verify',()=>{
 const d=s06Fixture();d.dependencies=d.dependencies.filter(r=>r['所需技能']!=='B');const {f,p}=plan(d);for(const r of p.resourceReservations)delete r.demandKey;assert.equal(verify(f.executionData,p).status,'pass');
 const r={...requirements[0],'候选人员组':'','资源编号':'A'};assert.equal(allocatePersonnel([r],groups,0,30,[{groupId:'A',count:1,start:0,end:30}],edges).ok,false);
});
test('API whole-state and CSV atomically reject malformed candidate/reference/conflict; stale/query rejected',async t=>{
 const f=await fixture(t),d=s06Fixture();await f.ok('/inputs',{revision:0,tables:d});const s=await f.ok('/state');
 for(const value of ['',',','A,A','A,','A,missing',Array.from({length:33},(_,i)=>'x'+i).join(',')]){
  const deps=clone(d.dependencies);deps.find(r=>r['候选人员组'])['候选人员组']=value;const before=f.bytes();const r=await f.call('/inputs',{revision:s.revision,tables:{dependencies:deps,personnelGroups:d.personnelGroups.map(g=>({...g,'人员数量':'7'}))}});assert.equal(r.status,400,JSON.stringify(r));assert.equal(f.bytes(),before);
 }
 const deps=clone(d.dependencies);deps.find(r=>r['候选人员组'])['资源编号']='A';let before=f.bytes();assert.equal((await f.call('/inputs',{revision:s.revision,tables:{dependencies:deps}})).status,400);assert.equal(f.bytes(),before);
 assert.equal((await f.call('/inputs',{revision:0,tables:{dependencies:d.dependencies}})).status,409);assert.equal(f.bytes(),before);assert.equal((await f.call('/inputs',{revision:s.revision,tables:{dependencies:d.dependencies}},'query')).status,403);assert.equal(f.bytes(),before);
 const def=defs.find(d=>d.key==='dependencies');const csv=def.fields.join(',')+'\n'+def.fields.map(k=>JSON.stringify(({...requirements[0],'候选人员组':'A,missing'})[k]||'')).join(',');const out=await f.call('/imports/preview',{revision:s.revision,files:[{name:def.file,text:csv}]});assert.ok(out.body.issues.length);assert.equal(f.bytes(),before);
 const saved=await f.ok('/state');assert.match(f.bytes(),/test#planner/);
});
test('backtracking reallocates an earlier flexible demand when equal-size candidate sets compete',()=>{
 const gs=['A','B','C'].map(id=>({...groups[1],'人员组编号':id}));
 const rs=['A,B','A,C','A,C'].map((ids,i)=>({...requirements[0],'候选人员组':ids,'__policyRoleSource':'r'+i}));
 const x=allocatePersonnel(rs,gs,0,30);assert.ok(x.ok,JSON.stringify(x));assert.equal(x.allocations.find(a=>a.roleSource==='r0').groupId,'B');assert.equal(new Set(x.allocations.map(a=>a.groupId)).size,3);
});
test('actual state budget exhaustion is diagnosed rather than reported as proven shortage',()=>{
 const gs=groups.map(g=>({...g,'人员数量':'9','技能':'B'}));const rs=Array.from({length:19},(_,i)=>({...requirements[0],'__policyRoleSource':'r'+i}));
 const x=allocatePersonnel(rs,gs,0,30);assert.equal(x.searchStatus,'limit');assert.match(x.reason,/50000.*不代表数学不可行/);assert.equal(x.allocations,undefined);
});
test('candidate source links and saved load never invent an empty resource or per-pool mandatory demand',async()=>{
 const {related}=await import('../src/lib/data-query.mjs'),{resourceLoad}=await import('../src/lib/resource-load.mjs'),{taskEvidence}=await import('../src/lib/task-linkage.mjs');const d=s06Fixture(),{p}=plan(d);p.inputSnapshot=d;
 const index=d.dependencies.findIndex(r=>r['候选人员组']);assert.deepEqual(related(d,'dependencies',index).filter(r=>r.table==='personnelGroups').map(r=>r.index).sort(),[0,1]);
 const load=resourceLoad(p);assert.ok(load.resources.every(r=>r.id));assert.equal(load.resources.find(r=>r.type==='人员'&&r.id==='B').demands[0].candidateGroupIds.length,2);
 const ev=taskEvidence(p,p.tasks[0].id);assert.ok(ev.resources.some(r=>r.resourceId==='B'&&/候选集合.*合计需/.test(r.decision)));
});
