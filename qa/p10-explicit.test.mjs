import test from 'node:test';import assert from 'node:assert/strict';
import {p10Fixture} from './p10-core-fixture.mjs';import {fixture} from './fr027-fixture.mjs';
import {freezeRunInput} from '../server/run-input.mjs';import {calculate,defs} from '../server/planner.ts';
import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';import {allocatePersonnel} from '../src/lib/staffing.mjs';
import {validateInputs} from '../server/input-validation.mjs';import {resourceConflicts} from '../src/lib/resource-conflicts.mjs';import {resourceLoad} from '../src/lib/resource-load.mjs';
import {twoTasks} from './p10-explicit-fixture.mjs';

const solve=d=>{const f=freezeRunInput(d,{},'2026-10-30T12:00:00Z'),p=calculate(f.executionData,1,f.conditions.ruleEvaluationAt,f.conditions);return {f,p};};
const spans=p=>p.tasks.map(t=>[t.start,t.end]).sort((a,b)=>a[0]-b[0]);
const verify=({p,f})=>verifyResourcePolicies(p,f.executionData,f.conditions);
test('X01 shared on vs group/operation mutex changes two-machine Worker-compatible schedule without duplicating capacity',()=>{
 for(const mode of ['无互斥','人员组互斥','工序互斥']){const d=twoTasks();Object.assign(d.personnelPools[0],{'允许共用':mode==='无互斥'?'是':'否','互斥粒度':mode});const r=solve(d);assert.deepEqual(spans(r.p),mode==='无互斥'?[[0,30],[0,30]]:[[0,30],[30,60]]);assert.equal(verify(r).status,'pass',JSON.stringify(verify(r)));}
});
test('X02 mutex granularity distinguishes two groups in one operation, endpoint reuse remains legal',()=>{
 const d=p10Fixture();Object.assign(d.personnelPools[0],{'允许共用':'否','互斥粒度':'工序互斥'});assert.equal(solve(d).p.tasks.length,1);d.personnelPools[0]['互斥粒度']='人员组互斥';assert.equal(solve(d).p.tasks.length,0);
});
test('X03 explicit handover upper bound 0/1/2 and half-open [0,30), no hidden extra demand',()=>{
 for(const cap of ['0','1','2']){const d=twoTasks();Object.assign(d.personnelPools[0],{'交接模式':'窗口容量上限','交接起始分钟':'0','交接结束分钟':'30','交接容量人数':cap});const r=solve(d);assert.deepEqual(spans(r.p),cap==='0'?[[30,60],[30,60]]:cap==='1'?[[0,30],[30,60]]:[[0,30],[0,30]]);assert.equal(verify(r).status,'pass',JSON.stringify(verify(r)));const load=resourceLoad({...r.p,conditions:r.f.conditions,inputSnapshot:r.f.executionData});assert.equal(load.resources.find(r=>r.type==='物理人员池').policy.windowCapacity,Number(cap));}
});
test('X04 full occupation vs released declared phases changes capacity feasibility; checker reconstructs independent windows',()=>{
 const d=p10Fixture('1'),req=d.dependencies.filter(r=>r['资源类型']==='人员技能');req[0]['人员结束偏移']='15';req[1]['人员开始偏移']='15';assert.equal(solve(d).p.tasks.length,1);d.personnelPools[0]['占用策略']='全工序保留';assert.equal(solve(d).p.tasks.length,0);d.personnelPools[0]['总人数']='2';const r=solve(d);assert.equal(verify(r).status,'pass',JSON.stringify(verify(r)));assert.ok(r.p.resourceReservations.filter(r=>r.type==='人员').every(r=>r.start===0&&r.end===30));r.p.resourceReservations.find(r=>r.type==='人员').end=15;assert.equal(verify(r).status,'problem');
});
test('X05 forged simultaneous ledger rejected by independent mutex/cap checker and geometry; cap breakpoint inside claim scanned',()=>{
 const original=solve(twoTasks());for(const mode of ['人员组互斥','工序互斥','交接上限']){const r=structuredClone(original),p=r.f.executionData.personnelPools[0];if(mode==='交接上限')Object.assign(p,{'交接模式':'窗口容量上限','交接起始分钟':'10','交接结束分钟':'20','交接容量人数':'1'});else Object.assign(p,{'允许共用':'否','互斥粒度':mode});assert.equal(verify(r).status,'problem');assert.ok(resourceConflicts(r.p,r.f.executionData,r.f.conditions).some(x=>x.code==='VERIFY / PHYSICAL_POOL'));}
 const d=twoTasks();Object.assign(d.personnelPools[0],{'交接模式':'窗口容量上限','交接起始分钟':'10','交接结束分钟':'20','交接容量人数':'0'});const r=solve(d);assert.deepEqual(spans(r.p),[[20,50],[20,50]]);assert.equal(verify(r).status,'pass');
});
test('X06 absent/unknown/contradictory/out-of-range options location, zero full-store writes including audit',async t=>{
 const f=await fixture(t);await f.ok('/inputs',{revision:0,tables:twoTasks()});const s=await f.ok('/state');
 const bad=[['策略版本',''],['策略版本','future'],['策略来源',''],['互斥粒度','人员组互斥'],['交接模式','相加'],['交接容量人数','1'],['占用策略','guess'],['释放策略','自动释放'],['交接设置','1']];
 for(const [field,value] of bad){const p={...s.data.personnelPools[0],[field]:value},before=f.bytes();const r=await f.call('/inputs',{revision:s.revision,tables:{personnelPools:[p]}});assert.equal(r.status,400,JSON.stringify(r));assert.equal(f.bytes(),before);assert.ok(r.body.issues.some(x=>x.table==='personnelPools'&&x.row===2&&x.field===field),JSON.stringify(r));}
 for(const [a,b,c] of [['','30','1'],['30','30','1'],['0','525601','1'],['0','30','3'],['0','30','1.5'],['0','30','-1']]){const p={...s.data.personnelPools[0],'交接模式':'窗口容量上限','交接起始分钟':a,'交接结束分钟':b,'交接容量人数':c},before=f.bytes();assert.equal((await f.call('/inputs',{revision:s.revision,tables:{personnelPools:[p]}})).status,400);assert.equal(f.bytes(),before);}
 for(const [role,revision,status] of [['query',s.revision,403],['outsider',s.revision,403],['planner',0,409]]){const before=f.bytes();assert.equal((await f.call('/inputs',{revision,tables:{personnelPools:s.data.personnelPools}},role)).status,status);assert.equal(f.bytes(),before);}
});
test('X07 asynchronous run freezes v2; saved/reopened policy updates never rewrite old input/plan/facts, trusted audit role',async t=>{
 const f=await fixture(t);await f.ok('/inputs',{revision:0,tables:twoTasks()});const s=await f.ok('/state'),run=await f.ok('/runs',{revision:s.revision});let status;
 for(let i=0;i<300;i++){status=await f.ok('/runs/'+run.id);if(['completed','partial','failed'].includes(status.status))break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(['completed','partial'].includes(status.status),JSON.stringify(status));const old=await f.ok('/runs/'+run.id+'/inputs'),plans=await f.ok('/plans'),facts=(await f.ok('/state')).data.executionFacts;
 assert.throws(()=>freezeRunInput(s.data,{mode:'minimal-r1'}),/minimal-r1/);assert.equal(old.conditions.personnelPoolContract,'P10-explicit-v2');assert.equal(verifyResourcePolicies(plans[0],old.executionData,old.conditions).status,'pass');
 const p={...s.data.personnelPools[0],'允许共用':'否','互斥粒度':'工序互斥'};await f.ok('/inputs',{revision:s.revision,tables:{personnelPools:[p]}});assert.deepEqual((await f.ok('/state')).data.personnelPools,[p]);assert.deepEqual(await f.ok('/runs/'+run.id+'/inputs'),old);assert.deepEqual(await f.ok('/plans'),plans);assert.deepEqual((await f.ok('/state')).data.executionFacts,facts);
 const audits=await f.ok('/operations');assert.ok(audits.some(a=>a.target==='personnelPools'&&a.actor==='test#planner'&&a.role==='planner'&&a.reason&&a.fromVersion&&a.toVersion));
});
test('X08 legacy core immutable snapshot still independently verifies, absent strategy cannot silently start new run or downgrade explicit frozen contract',()=>{
 const d=twoTasks(),r=solve(d);assert.equal(verifyResourcePolicies(r.p,r.f.executionData,{...r.f.conditions,personnelPoolContract:'P10-core-v1'}).status,'problem');
 const legacy=structuredClone(r.f.executionData);for(const k of ['策略版本','策略来源','互斥粒度','交接模式','交接起始分钟','交接结束分钟','交接容量人数','占用策略','释放策略'])delete legacy.personnelPools[0][k];assert.equal(verifyResourcePolicies(r.p,legacy,{...r.f.conditions,personnelPoolContract:'P10-core-v1'}).status,'pass');assert.throws(()=>freezeRunInput(legacy,{}),/策略版本/);assert.ok(validateInputs(defs,legacy).length);
});
test('X09 full-operation retry uses real release instead of unretained phase offset; group mutex allows same group concurrency',()=>{
 const d=twoTasks();d.personnelPools[0]['总人数']='1';d.personnelPools[0]['占用策略']='全工序保留';d.dependencies.filter(r=>r['资源类型']==='人员技能').forEach(r=>r['人员开始偏移']='15');const r=solve(d);assert.deepEqual(spans(r.p),[[0,30],[30,60]]);assert.equal(verify(r).status,'pass');
 const x=twoTasks();x.dependencies.filter(r=>r['资源类型']==='人员技能').forEach(r=>r['资源编号']='A');Object.assign(x.personnelPools[0],{'允许共用':'否','互斥粒度':'人员组互斥'});assert.deepEqual(spans(solve(x).p),[[0,30],[0,30]]);
});
test('X10 mixed occupation across candidate pools rejects exact dependency source; original groups, windows and skills still mandatory',()=>{
 const d=p10Fixture(),second={...d.personnelPools[0],poolId:'Q','占用策略':'全工序保留'};d.personnelPools.push(second);d.personnelGroups[1].poolId='Q';const req=d.dependencies.find(r=>r['资源类型']==='人员技能');req['资源编号']='';req['候选人员组']='A,B';const issues=validateInputs(defs,d);assert.ok(issues.some(i=>i.table==='dependencies'&&i.field==='候选人员组'&&i.file==='12_工序资源与物料依赖.csv'));assert.throws(()=>freezeRunInput(d,{}));
});
test('X11 full joint before-enabling preview changes cross-task timing, returns claims/config/role and never writes plans, inputs or audit',async t=>{
 const f=await fixture(t);await f.ok('/inputs',{revision:0,tables:twoTasks()});const s=await f.ok('/state'),p={...s.data.personnelPools[0],'允许共用':'否','互斥粒度':'工序互斥'},before=f.bytes();
 const result=await f.ok('/inputs/resource-policy-preview',{revision:s.revision,tables:{personnelPools:[p]}});assert.equal(result.persisted,false);assert.equal(result.role,'planner');assert.equal(result.candidate.resourceVerification.status,'pass');assert.deepEqual(result.before.tasks.map(t=>t.start),[0,0]);assert.deepEqual(result.candidate.tasks.map(t=>t.start),[0,30]);assert.ok(result.candidate.resourceReservations.some(r=>r.poolId==='P'));assert.equal(f.bytes(),before);
 for(const [role,revision,status] of [['query',s.revision,403],['outsider',s.revision,403],['planner',0,409]]){assert.equal((await f.call('/inputs/resource-policy-preview',{revision,tables:{personnelPools:[p]}},role)).status,status);assert.equal(f.bytes(),before);}
 const bad={...p,'交接模式':'自动交班'};const err=await f.call('/inputs/resource-policy-preview',{revision:s.revision,tables:{personnelPools:[bad]}});assert.equal(err.status,400);assert.ok(err.body.issues.some(i=>i.field==='交接模式'&&i.row===2));assert.equal(f.bytes(),before);
});
