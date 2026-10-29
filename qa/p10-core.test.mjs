import test from 'node:test';import assert from 'node:assert/strict';
import {p10Fixture,pool} from './p10-core-fixture.mjs';import {allocatePersonnel} from '../src/lib/staffing.mjs';import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';import {validateInputs} from '../server/input-validation.mjs';import {defs,calculate} from '../server/planner.ts';import {freezeRunInput} from '../server/run-input.mjs';import {resourceConflicts} from '../src/lib/resource-conflicts.mjs';import {resourceLoad} from '../src/lib/resource-load.mjs';import {fixture} from './fr027-fixture.mjs';
const req=d=>d.dependencies.filter(r=>r['资源类型']==='人员技能');
function solve(d){const f=freezeRunInput(d,{}),p=calculate(f.executionData,1,f.conditions.ruleEvaluationAt,f.conditions);return {f,p};}
const alloc=(d,res=[])=>allocatePersonnel(req(d),d.personnelGroups,0,30,res,d.skillSubstitutions,d.personnelPools);
test('cross-group physical total is unique; independent posts sum and group qualification cap retained',()=>{
 for(const capacity of ['1','2']){const d=p10Fixture(capacity);assert.deepEqual(validateInputs(defs,d),[]);assert.equal(alloc(d).ok,capacity==='2');const {f,p}=solve(d);assert.equal(p.tasks.length,capacity==='2'?1:0);if(p.tasks.length){assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');assert.ok(p.resourceReservations.filter(r=>r.type==='人员').every(r=>r.poolId==='P'));}}
 const d=p10Fixture('3');d.personnelGroups[0]['人员数量']='1';req(d)[0]['需求数量']='2';assert.equal(alloc(d).ok,false);d.personnelGroups[0]['人员数量']='2';assert.equal(alloc(d).ok,true);
});
test('same pool across tasks and groups, endpoint release; distinct pools independent; candidate alternatives search without duplicate consumption',()=>{
 const d=p10Fixture('2'),used=[{groupId:'A',poolId:'forged',count:1,start:0,end:30}];assert.equal(alloc(d,used).ok,false);used[0].end=0;assert.equal(alloc(d,used).ok,true);used[0].end=30;used[0].start=30;assert.equal(alloc(d,used).ok,true);
 d.personnelPools=[pool('P','1'),pool('Q','1')];d.personnelGroups[1].poolId='Q';assert.equal(alloc(d).ok,true);
 const rs=req(d);rs[0]['资源编号']='';rs[0]['候选人员组']='A,B';rs[1]['资源编号']='A';const a=alloc(d);assert.equal(a.ok,true);assert.equal(a.allocations.reduce((s,r)=>s+r.count,0),2);assert.equal(a.allocations.find(r=>r.postId==='P08').groupId,'B');
});
test('same-post overlap max and distinct-post adjacent windows, no skill/shift/availability bypass',()=>{
 const d=p10Fixture('1');req(d).forEach(r=>r['资源编号']='A');req(d)[1]['人员岗位编号']='P08';req(d)[1]['人员参与阶段']='清理';assert.equal(alloc(d).ok,true);
 req(d)[1]['人员岗位编号']='P09';req(d)[0]['人员结束偏移']='15';req(d)[1]['人员开始偏移']='15';assert.equal(alloc(d).ok,true);req(d)[1]['窗口外释放']='否';assert.equal(alloc(d).ok,false);
 for(const [field,value] of [['技能','X'],['班次','OTHER'],['可用结束分钟','29']]){const x=p10Fixture();x.personnelGroups[0][field]=value;assert.equal(alloc(x).ok,false);}
});
test('independent checker rebuilds pool identity/total and catches forged labels, quantity, missing coverage and wrong contract',()=>{
 const {f,p}=solve(p10Fixture());assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');
 for(const mutate of [x=>x.resourceReservations.find(r=>r.type==='人员').poolId='fake',x=>x.resourceReservations=x.resourceReservations.filter(r=>r.postId!=='P09'),x=>x.resourceReservations.find(r=>r.type==='人员').quantity='0',x=>x.resourceReservations.find(r=>r.type==='人员').start=1]){const x=structuredClone(p);mutate(x);assert.equal(verifyResourcePolicies(x,f.executionData,f.conditions).status,'problem');}
 const stripped=structuredClone(f.executionData);delete stripped.personnelPools;stripped.personnelGroups.forEach(g=>delete g.poolId);assert.equal(verifyResourcePolicies(p,stripped,f.conditions).status,'problem');
 const smaller=structuredClone(f.executionData);smaller.personnelPools[0]['总人数']='1';const v=verifyResourcePolicies(p,smaller,f.conditions);assert.equal(v.status,'problem');assert.ok(v.details.some(s=>s.includes('物理池 P')));assert.equal(resourceConflicts(p,smaller,f.conditions).filter(x=>x.code==='VERIFY / PHYSICAL_POOL').length,1);
 const report=resourceLoad({...p,conditions:f.conditions,inputSnapshot:f.executionData});const physical=report.resources.find(r=>r.type==='物理人员池');assert.equal(physical.capacity,2);assert.equal(physical.peak.value,2);assert.equal(physical.quantityMinutes.value,60);
 assert.equal(verifyResourcePolicies(p,f.executionData,{...f.conditions,personnelPoolContract:null}).status,'problem');
});
test('no guesses for missing capacity/identity/shared flag or U01/U02; drafts save but cannot run; future effective version deferred',()=>{
 for(const change of [d=>delete d.personnelGroups[0].poolId,d=>d.personnelPools[0]['总人数']='',d=>d.personnelPools[0]['总人数']='0',d=>d.personnelPools[0]['总人数']='9007199254740992',d=>d.personnelPools.push(pool()),d=>d.personnelPools[0]['允许共用']='否',d=>d.personnelPools[0]['交接设置']='1',d=>d.personnelPools[0]['容量来源']='',d=>d.personnelPools[0]['适用范围']='LINE-1']){const d=p10Fixture();change(d);assert.ok(validateInputs(defs,d).length);assert.throws(()=>freezeRunInput(d,{}));}
 const d=p10Fixture();d.personnelPools[0]={'poolId':'P','池名称':'未启用草稿','是否启用':'否'};assert.deepEqual(validateInputs(defs,d),[]);assert.throws(()=>freezeRunInput(d,{}));
 const future=p10Fixture();future.personnelPools[0]['生效时间']='2099-01-01T00:00:00Z';assert.deepEqual(validateInputs(defs,future),[]);assert.throws(()=>freezeRunInput(future,{},'2026-10-30T00:00:00Z'));assert.doesNotThrow(()=>freezeRunInput(future,{},'2099-01-02T00:00:00Z'));
});
test('Express invalid/unauthorized/stale/deletion/reused identity atomically reject; audit captures new versions; no downgrade',async t=>{
 const f=await fixture(t);await f.ok('/inputs',{revision:0,tables:p10Fixture()});let s=await f.ok('/state');
 for(const [role,rev,status] of [['query',s.revision,403],['outsider',s.revision,403],['planner',0,409]]){const before=f.bytes();assert.equal((await f.call('/inputs',{revision:rev,tables:{personnelPools:[pool('P','3')]}},role)).status,status);assert.equal(f.bytes(),before);}
 for(const tables of [{personnelPools:[]},{personnelPools:[pool('P','0')]},{personnelPools:[],personnelGroups:s.data.personnelGroups.map(g=>({...g,poolId:''}))}]){const before=f.bytes();assert.equal((await f.call('/inputs',{revision:s.revision,tables})).status,400);assert.equal(f.bytes(),before);}
 await f.ok('/inputs',{revision:s.revision,tables:{personnelPools:[pool('P'),pool('Q')]}});s=await f.ok('/state');await f.ok('/inputs',{revision:s.revision,tables:{personnelPools:[pool('P')]}});s=await f.ok('/state');const before=f.bytes();assert.equal((await f.call('/inputs',{revision:s.revision,tables:{personnelPools:[pool('P'),pool('Q')]}})).status,400);assert.equal(f.bytes(),before);
 const audits=await f.ok('/operations');assert.ok(audits.some(a=>a.target==='personnelPools'&&a.actor==='test#planner'&&a.fromVersion&&a.toVersion&&a.reason));
});

test('load retains identical same-group independent posts and maps physical identities from frozen data',()=>{
 const d=p10Fixture();req(d).forEach(r=>r['资源编号']='A');const {f,p}=solve(d);const report=resourceLoad({...p,conditions:f.conditions,inputSnapshot:f.executionData});assert.equal(report.resources.find(r=>r.type==='物理人员池').peak.value,2);assert.equal(report.resources.find(r=>r.type==='人员'&&r.id==='A').peak.value,2);
});
test('N06 accepted execution facts still prevent dependency edits; corrupt confirmed history prevents P10 writes',async t=>{
 const f=await fixture(t),d=p10Fixture();d.orders.push({...d.orders[0],'订单编号':'FACT'});d.dependencies.push({...d.dependencies.find(r=>r['资源类型']==='设备'),'订单编号':'FACT'});d.executionFacts=[{'事实编号':'KEEP','订单编号':'FACT','工序编号':'MIX','状态':'已开始','开始分钟':'100','观测分钟':'100','完成分钟':'','工序完成数量':'0','数量单位':d.orders[0]['数量单位'],'剩余工时分钟':'30','当前设备':'MIX01','暂停原因':''}];await f.ok('/inputs',{revision:0,tables:d});let s=await f.ok('/state');const ds=structuredClone(s.data.dependencies);req({dependencies:ds})[0]['人员岗位编号']='EDIT';const before=f.bytes();assert.equal((await f.call('/inputs',{revision:s.revision,tables:{dependencies:ds}})).status,409);assert.equal(f.bytes(),before);
 const fs=await import('node:fs');const path=await import('node:path');const store=JSON.parse(f.bytes());store.plans.push({id:'missing-history',status:'confirmed',inputVersionId:'absent'});fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(store));const corrupt=f.bytes();assert.equal((await f.call('/inputs',{revision:s.revision,tables:{personnelPools:[pool('P','3')]}})).body.error,'protected_history_unavailable');assert.equal(f.bytes(),corrupt);
});
test('explicit same-name different pools stay distinct; referenced pool removal requires one complete cross-table remap',async t=>{
 const f=await fixture(t);await f.ok('/inputs',{revision:0,tables:p10Fixture()});let s=await f.ok('/state');const q=pool('Q');q['池名称']=s.data.personnelPools[0]['池名称'];await f.ok('/inputs',{revision:s.revision,tables:{personnelPools:[...s.data.personnelPools,q]}});s=await f.ok('/state');assert.deepEqual(s.data.personnelGroups.map(g=>g.poolId),['P','P']);await f.ok('/inputs',{revision:s.revision,tables:{personnelPools:[q],personnelGroups:s.data.personnelGroups.map(g=>({...g,poolId:'Q'}))}});s=await f.ok('/state');assert.deepEqual(s.data.personnelGroups.map(g=>g.poolId),['Q','Q']);assert.equal(alloc(s.data).ok,true);
});

test('design S08/S11/S12/S13 explicit quantities and malformed capacity/map inputs',()=>{
 let d=p10Fixture('2');req(d)[1]['需求数量']='2';assert.equal(alloc(d).ok,false); // S08/S13: 1+2 > unique2, each group Q2
 d=p10Fixture('2');d.personnelGroups.forEach(g=>g['人员数量']='1');assert.equal(alloc(d).ok,true); // S12
 req(d).forEach(r=>r['资源编号']='A');assert.equal(alloc(d).ok,false); // S11/F05: group Q1 < independent2
 for(const value of ['-1','1.5','NaN','Infinity']){d=p10Fixture();d.personnelPools[0]['总人数']=value;assert.ok(validateInputs(defs,d).length);assert.throws(()=>freezeRunInput(d,{}));}
 for(const value of ['missing','P,Q']){d=p10Fixture();d.personnelGroups[0].poolId=value;assert.ok(validateInputs(defs,d).length);}
 d=p10Fixture();d.personnelPools[0]['生效时间']='2026-02-31T00:00:00Z';assert.ok(validateInputs(defs,d).length);
});
