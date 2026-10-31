import test from 'node:test';import assert from 'node:assert/strict';
import {n06Fixture,event,source,selection,decision} from './n06-fixture.mjs';
import {originalViews,originalIssues,originalTransition,originalProtection} from '../src/lib/execution-resource-ledger.mjs';
import {verifyOriginalResources} from '../src/lib/verify-execution-resource-ledger.mjs';
import {previewResources} from '../src/lib/joint-resources.mjs';import {allocatePersonnel} from '../src/lib/staffing.mjs';
import {freezeRunInput} from '../server/run-input.mjs';import {calculate,defs} from '../server/planner.ts';import {validateInputs} from '../server/input-validation.mjs';import {fixture} from './fr027-fixture.mjs';
const doc=d=>JSON.parse(d.originalResourceEvents.at(-1)['原账JSON']);
function mutate(d,fn){const x=doc(d);fn(x);d.originalResourceEvents=[event(x)];return d;}
const solve=d=>{const f=freezeRunInput(d,selection);return {f,p:calculate(f.executionData,1,f.conditions.ruleEvaluationAt,f.conditions)}};
const verify=(p,f)=>verifyOriginalResources(p,f.executionData,f.conditions);
const claim={type:'工装',resourceId:'G40',quantity:'1',capacity:'1',unit:'套',before:0,after:0};
test('S01 actual end40 vs task end30: half-open boundary and replay overlap; real scheduler/frozen checker',()=>{
 const d=n06Fixture();assert.deepEqual(validateInputs(defs,d),[]);assert.deepEqual(originalIssues(d,{forRun:true}),[]);
 const rows=originalProtection(d);assert.equal(previewResources([claim],40,50,rows).ok,true);assert.equal(previewResources([claim],35,45,rows).ok,false);
 const {f,p}=solve(d);assert.equal(p.tasks.length,1,JSON.stringify(p.findings));assert.equal(p.tasks[0].start,40);assert.equal(verify(p,f).status,'pass');
});
test('S02 unknown release blocks despite completed task / remaining/H; S03 unselected A retained',()=>{
 const d=n06Fixture({unknown:true});assert.deepEqual(originalIssues(d),[]);const {f,p}=solve(d);assert.equal(f.executionData.executionContext.executionFacts[0]['订单编号'],'A');assert.equal(p.tasks.length,0);assert.ok(p.findings.some(x=>x.code==='N06_ORIGINAL_RESOURCE_BLOCKED'));assert.equal(verify(p,f).status,'problem');assert.equal(doc(d).occupancies[0].end,null);
});
test('S04 frozen historical actuals survive rule/current mapping rename; unresolved aliases rejected',()=>{
 const d=n06Fixture(),old=JSON.stringify(d.originalResourceEvents);d.tools[0]['后延占用分钟']='20';assert.equal(originalProtection(d)[0].end,40);assert.equal(JSON.stringify(d.originalResourceEvents),old);
 mutate(d,x=>{x.identities[2].currentId='P2'});assert.ok(originalIssues(d).length);
 const x=n06Fixture();x.personnelPools[0].poolId='P2';x.personnelGroups.forEach(g=>g.poolId='P2');mutate(x,v=>{v.identities[2].currentId='P2'});assert.deepEqual(originalIssues(x),[]);assert.equal(originalProtection(x)[2].historicalId,'OLD-P');
});
test('S05/S11 missing quantity/source/rule/adoption/identity fails; draft is retained and blocks computation',()=>{
 for(const fn of [x=>x.occupancies[0].quantity='',x=>x.sources[0].location='',x=>delete x.historicalRules,x=>x.adoption.pop(),x=>x.occupancies[0].end=41,x=>x.occupancies[0].unit='kg']){const d=mutate(n06Fixture(),fn);assert.ok(originalIssues(d).length);}
 const d=mutate(n06Fixture(),x=>{x.status='草稿';x.occupancies[0].quantity=''});d.originalResourceEvents[0]['事件类型']='草稿';assert.deepEqual(originalIssues(d),[]);assert.ok(originalIssues(d,{forRun:true}).length);
});
test('S06 append whole release; stale/fork/repeated release rejected; old frozen bytes unchanged',()=>{
 const d=n06Fixture({unknown:true}),old=JSON.stringify(d),next=structuredClone(d),x=doc(d);x.sources.push(source('release'));x.eventSource='release';x.reason='模拟实际退还';x.occupancies[0].end=40;x.occupancies[0].releaseSource='release';next.originalResourceEvents.push(event(x,'e2','e1','释放'));
 assert.deepEqual(originalTransition(d,next),[]);assert.equal(JSON.stringify(d),old);assert.equal(originalProtection(next)[0].end,40);
 next.originalResourceEvents.push(event(x,'e3','e1','释放'));assert.ok(originalIssues(next).length);
});
test('S07 correction replaces quantity without summing and protects prior bytes',()=>{
 const d=mutate(n06Fixture(),x=>x.occupancies[0].quantity='2'),next=structuredClone(d),x=doc(d);x.sources.push(source('correct'));x.eventSource='correct';x.reason='模拟原责任方纠正录入量';x.occupancies[0].quantity='1';next.originalResourceEvents.push(event(x,'e2','e1','纠正'));
 assert.deepEqual(originalTransition(d,next),[]);assert.equal(originalProtection(next)[0].quantity,'1');assert.equal(doc(d).occupancies[0].quantity,'2');
 const c={...claim,capacity:'2'};assert.equal(previewResources([c],20,30,originalProtection(d)).ok,false);assert.equal(previewResources([c],20,30,originalProtection(next)).ok,true);
});
test('S08 confirmed plan cannot manufacture actuals; original dependencies guard preserved',async t=>{
 const f=await fixture(t),d=n06Fixture();await f.ok('/inputs',{revision:0,tables:d});let s=await f.ok('/state');const bytes=f.bytes();const ds=structuredClone(s.data.dependencies);ds[0]['需求数量']='2';assert.equal((await f.call('/inputs',{revision:s.revision,tables:{dependencies:ds}})).status,409);assert.equal(f.bytes(),bytes);
 const noLedger=structuredClone(d);noLedger.originalResourceEvents=[];const {p}=solve(noLedger);assert.equal(p.tasks.length,0);assert.equal(noLedger.originalResourceEvents.length,0);
});
test('S09 unique physical pool and group caps include original actual participation',()=>{
 const d=n06Fixture(),requirements=d.dependencies.filter(x=>x['订单编号']==='B'&&x['资源类型']==='人员技能'),rs=[{groupId:'A',poolId:'P',count:1,start:0,end:40}];
 assert.equal(allocatePersonnel(requirements,d.personnelGroups,30,60,rs,d.skillSubstitutions,d.personnelPools).ok,false);assert.equal(allocatePersonnel(requirements,d.personnelGroups,40,70,rs,d.skillSubstitutions,d.personnelPools).ok,true);
});
test('S13 source idempotence, stale/conflicting event, permission and atomic zero writes with trusted audit',async t=>{
 const f=await fixture(t),d=n06Fixture();await f.ok('/inputs',{revision:0,tables:d});let s=await f.ok('/state');const bytes=f.bytes();await f.ok('/inputs',{revision:s.revision,tables:{originalResourceEvents:d.originalResourceEvents}});assert.equal(f.bytes(),bytes);
 for(const [role,rev,status] of [['query',s.revision,403],['outsider',s.revision,403],['planner',0,409]]){assert.equal((await f.call('/inputs',{revision:rev,tables:{originalResourceEvents:[]}},role)).status,status);assert.equal(f.bytes(),bytes);}
 for(const rows of [[],[...d.originalResourceEvents,event(doc(d),'e2','wrong','纠正')],mutate(n06Fixture(),x=>x.occupancies[0].quantity='2').originalResourceEvents]){assert.equal((await f.call('/inputs',{revision:s.revision,tables:{originalResourceEvents:rows}})).status,409);assert.equal(f.bytes(),bytes);}
 const ops=await f.ok('/operations');assert.ok(ops.some(x=>x.target==='originalResourceEvents'&&x.actor==='test#planner'&&x.fromVersion&&x.toVersion&&x.reason));
});
test('S10 shared one physical acquisition debits once; separate acquisitions debit twice',()=>{
 const d=n06Fixture();mutate(d,x=>{x.facts[0].tasks[0].quantity='50';x.facts[0].tasks.push({...x.facts[0].tasks[0],id:'TASK-A2',batchId:'BATCH-A2'});x.adoption.push(...x.adoption.map(a=>({...a,taskId:'TASK-A2'})));for(const o of x.occupancies){o.members.push('TASK-A2');o.resourceBatchId='SHARED';o.sharedSource='s1';}});
 assert.deepEqual(originalIssues(d),[]);assert.equal(originalProtection(d).filter(x=>x.type==='工装').length,1);
 mutate(d,x=>{x.occupancies[0].members=['TASK-A'];const y={...x.occupancies[0],id:'occ-other',members:['TASK-A2']};x.occupancies.push(y);x.adoption.find(a=>a.taskId==='TASK-A2'&&a.type==='工装').occupancyIds=['occ-other'];});assert.deepEqual(originalIssues(d),[]);assert.equal(originalProtection(d).filter(x=>x.type==='工装').reduce((s,x)=>s+Number(x.quantity),0),2);
});
test('S14 historical actual space excess retained and units must match',()=>{
 const d=n06Fixture();assert.deepEqual(originalIssues(d),[]);const rs=originalProtection(d);assert.equal(Number(rs.find(x=>x.type==='空间').quantity)+600,1200);assert.equal(previewResources([{type:'空间',resourceId:'SPACE',quantity:'600',capacity:'1000',unit:'kg',before:0,after:0}],30,40,rs).ok,false);mutate(d,x=>x.identities[1].unit='位置');assert.ok(originalIssues(d).length);
});
test('S15 independent checker detects deletion, lower quantity, pool, endpoints, source and missing unselected order',()=>{
 const {f,p}=solve(n06Fixture());assert.equal(verify(p,f).status,'pass');
 for(const fn of [x=>x.originalResourceProtection=[],x=>x.originalResourceProtection[0].quantity='0',x=>x.originalResourceProtection[0].resourceId='fake',x=>x.originalResourceProtection[0].end=30,x=>x.originalResourceProtection[0].sourceIds=[]]){const bad=structuredClone(p);fn(bad);assert.equal(verify(bad,f).status,'problem');}
 const bad=structuredClone(f);bad.executionData.originalResourceEvents=[];assert.equal(verify(p,bad).status,'problem');
});
test('S16 finite release keeps machine calendar and all other enabled conditions',()=>{
 const d=n06Fixture();d.downtime.push({'设备编号':'MIX01','起始分钟':'50','结束分钟':'60','原因':'模拟停机'});const {p}=solve(d);assert.ok(p.tasks.every(t=>t.end<=50||t.start>=60));
});
test('React/Express async Worker frozen version and stale confirmation/history preservation',async t=>{
 const f=await fixture(t),d=n06Fixture();await f.ok('/inputs',{revision:0,tables:d});let s=await f.ok('/state');const r=await f.ok('/runs',{revision:s.revision,selection:{...selection,orderIds:['A','B']}});let run;
 for(let n=0;n<400;n++){run=await f.ok('/runs/'+r.id);if(['completed','partial','failed','timed_out'].includes(run.status))break;await new Promise(r=>setTimeout(r,15));}assert.ok(['completed','partial'].includes(run.status),JSON.stringify(run));
 const plan=(await f.ok('/plans')).find(p=>p.id===run.planId);assert.equal(plan.tasks.length,2,JSON.stringify(plan.findings));const v=await f.ok('/plans/'+plan.id+'/verify',{});assert.equal(v.verification.checks.originalResources.status,'pass');
 let review=await f.ok('/plans/'+plan.id+'/review');assert.deepEqual(review.blockers,[],JSON.stringify(review));await f.ok('/plans/'+plan.id+'/submit',decision(review));review=await f.ok('/plans/'+plan.id+'/review');await f.ok('/plans/'+plan.id+'/confirm',decision(review),'supervisor');
 const before=(await f.ok('/plans')).find(p=>p.id===plan.id),snapshot=await f.ok('/runs/'+run.id+'/inputs');s=await f.ok('/state');const x=doc(d);x.sources.push(source('correction'));x.eventSource='correction';x.reason='模拟纠正';x.occupancies[0].quantity='2';await f.ok('/inputs',{revision:s.revision,tables:{originalResourceEvents:[...d.originalResourceEvents,event(x,'e2','e1','纠正')]}});
 assert.deepEqual((await f.ok('/plans')).find(p=>p.id===plan.id),before);assert.deepEqual(await f.ok('/runs/'+run.id+'/inputs'),snapshot);assert.equal((await f.call('/plans/'+plan.id+'/restore',{revision:(await f.ok('/state')).revision})).status,409);
});
test('S12 pending confirmation rejects atomically after new actual correction; frozen run retained',async t=>{
 const f=await fixture(t),d=n06Fixture();await f.ok('/inputs',{revision:0,tables:d});let s=await f.ok('/state');const p=await f.ok('/calculate',{revision:s.revision,selection:{...selection,orderIds:['A','B']}});await f.ok('/plans/'+p.id+'/verify',{});
 let review=await f.ok('/plans/'+p.id+'/review');assert.deepEqual(review.blockers,[]);await f.ok('/plans/'+p.id+'/submit',decision(review));review=await f.ok('/plans/'+p.id+'/review');const frozen=await f.ok('/runs/'+p.runId+'/inputs');
 const x=doc(d);x.sources.push(source('new-actual'));x.eventSource='new-actual';x.reason='mock correction before confirmation';x.occupancies[0].quantity='2';s=await f.ok('/state');await f.ok('/inputs',{revision:s.revision,tables:{originalResourceEvents:[...d.originalResourceEvents,event(x,'e2','e1','纠正')]}});
 const bytes=f.bytes();assert.equal((await f.call('/plans/'+p.id+'/confirm',decision(review),'supervisor')).status,409);assert.equal(f.bytes(),bytes);assert.deepEqual(await f.ok('/runs/'+p.runId+'/inputs'),frozen);assert.equal((await f.ok('/plans/'+p.id+'/review')).confirmation,null);
});
test('unsupported repeated windows and partial release are rejected without manufacturing an end',()=>{
 const d=n06Fixture(),next=structuredClone(d),x=doc(d);x.occupancies.push({...x.occupancies[0],id:'again',start:41,end:42});x.observedAt=42;x.adoption[0].occupancyIds.push('again');next.originalResourceEvents=[event(x)];assert.ok(originalIssues(next).some(x=>x.message.includes('多窗口')));
 const unknown=n06Fixture({unknown:true}),release=doc(unknown);release.sources.push(source('release'));release.eventSource='release';release.occupancies[0].end=40;release.occupancies[0].releaseSource='release';release.occupancies[0].quantity='0.5';unknown.originalResourceEvents.push(event(release,'e2','e1','释放'));assert.ok(originalIssues(unknown).length);
});
