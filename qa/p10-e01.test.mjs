import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {p10Fixture} from './p10-core-fixture.mjs';import {allocatePersonnel} from '../src/lib/staffing.mjs';import {calculate} from '../server/planner.ts';import {freezeRunInput} from '../server/run-input.mjs';import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';import {fixture} from './fr027-fixture.mjs';
const scenarios=JSON.parse(fs.readFileSync(new URL('./p10-e01-scenarios.json',import.meta.url))).scenarios;
const personnel=d=>d.dependencies.filter(r=>r['资源类型']==='人员技能');
function input(s){
 const d=p10Fixture(String(s.input.pool.capacity)),base=d.orders[0],machine=d.machines[0],device=d.dependencies.find(r=>r['资源类型']==='设备'),post=personnel(d)[0];
 d.personnelGroups=Object.entries(s.input.group_caps).map(([id,q])=>({...d.personnelGroups[0],'人员组编号':id,'人员数量':String(q),'可用起始分钟':String(s.input.availability[id][0]),'可用结束分钟':String(s.input.availability[id][1]),poolId:s.input.group_to_pool[id]}));
 const tasks=[...new Set(s.input.posts.map(p=>p.task))];d.orders=tasks.map(id=>({...base,'订单编号':id}));d.machines=tasks.map(id=>({...machine,'设备编号':'M-'+id}));
 d.dependencies=tasks.map(id=>({...device,'订单编号':id,'资源编号':'M-'+id}));
 d.dependencies.push(...s.input.posts.map((p,i)=>({...post,'订单编号':p.task,'资源编号':p.group,'人员岗位编号':p.post,'人员参与阶段':'explicit-'+i,'需求数量':String(p.quantity),'人员开始偏移':String(p.start),'人员结束偏移':String(30-p.end)})));
 return d;
}
for(const s of scenarios)test('Design '+s.id+' supplied candidate, Worker and independent frozen reconstruction',()=>{
 const d=input(s),f=freezeRunInput(d,{}),p=calculate(f.executionData,1,f.conditions.ruleEvaluationAt,f.conditions);
 // Build the specified concurrent candidate in an explicitly generous copy,
 // then test it against the actual frozen input. Expected legality is Design's.
 const generous=structuredClone(d);generous.personnelPools[0]['总人数']='20';generous.personnelGroups.forEach(g=>g['人员数量']='20');
 const gf=freezeRunInput(generous,{}),candidate=calculate(gf.executionData,1,gf.conditions.ruleEvaluationAt,gf.conditions);
 assert.equal(candidate.tasks.length,new Set(s.input.posts.map(p=>p.task)).size);
 assert.ok(candidate.tasks.every(t=>t.start===0));
 const checked=verifyResourcePolicies(candidate,f.executionData,f.conditions);assert.equal(checked.status,s.expected.legal?'pass':'problem',JSON.stringify(checked));
 if(s.expected.legal){assert.equal(p.tasks.length,candidate.tasks.length);assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');}
 else {assert.ok(p.tasks.length<candidate.tasks.length||p.tasks.some(t=>t.start>0));assert.notEqual(checked.status,'pass');}
});
test('group bottleneck reports pool, posts, half-open interval, need, qualification and gap',()=>{
 const d=p10Fixture('2');d.personnelGroups[0]['人员数量']='1';personnel(d).forEach(r=>r['资源编号']='A');const a=allocatePersonnel(personnel(d),d.personnelGroups,0,30,[],[],d.personnelPools);assert.equal(a.ok,false);assert.match(a.reason,/组 A 池 P \[0,30\).*P08\/P09.*需求 2 人 \/ 资格上限 1 人 \/ 差额 1/);
});
test('cross-line full run remains guarded; cross-operation allocator preserves one physical total',async t=>{
 const d=p10Fixture('1'),base=d.orders[0],dev=d.dependencies.find(r=>r['资源类型']==='设备'),posts=personnel(d);
 d.factoryLines=['L01','L02'].map(id=>({'工厂编号':'F01','工厂名称':'合成工厂','产线编号':id,'产线名称':id,'时区':'Asia/Shanghai'}));
 d.orders.push({...base,'订单编号':'B','产品编号':'HC60','产线编号':'L02'});
 d.routes.filter(r=>r['产品编号']==='HC60').forEach(r=>r['工序编号']='OTHER');
 d.times.filter(r=>r['产品编号']==='HC60').forEach(r=>r['工序编号']='OTHER');
 d.machines.push({...d.machines[0],'设备编号':'OTHER01','产线编号':'L02','工序编号':'OTHER'});
 d.dependencies=[dev,{...dev,'订单编号':'B','工序编号':'OTHER','资源编号':'OTHER01'},posts[0],{...posts[1],'订单编号':'B','工序编号':'OTHER'}];
 const f=await fixture(t),before=await f.ok('/state');const rejected=await f.call('/inputs',{revision:before.revision,tables:d});
 assert.equal(rejected.status,400);assert.ok(rejected.body.issues.some(i=>i.code==='ORDER_MULTI_LINE'));assert.deepEqual(await f.ok('/state'),before);
 // Existing whole-product single-line boundary stays explicit. The allocator's
 // physical accounting itself never scopes/copies P by line or operation.
 const used=[{groupId:'A',poolId:'forged',count:1,start:0,end:30}];const next=d.dependencies.find(r=>r['资源类型']==='人员技能'&&r['订单编号']==='B');
 assert.equal(allocatePersonnel([next],d.personnelGroups,0,30,used,[],d.personnelPools).ok,false);
 assert.equal(allocatePersonnel([next],d.personnelGroups,30,60,used,[],d.personnelPools).ok,true);

});
test('missing reason and malformed atomic pool updates preserve complete store',async t=>{
 const f=await fixture(t);await f.ok('/inputs',{revision:0,tables:p10Fixture()});const state=await f.ok('/state');
 for(const body of [{reason:''},{tables:{personnelPools:[{...state.data.personnelPools[0],'总人数':'Infinity'}]}}]){
  const before=f.bytes(),r=await f.call('/inputs',{revision:state.revision,tables:{personnelPools:[{...state.data.personnelPools[0],'总人数':'3'}]},...body});assert.ok(r.status>=400,JSON.stringify(r));assert.equal(f.bytes(),before);
 }
});

test('request actor cannot replace trusted membership actor in successful pool audit',async t=>{
 const f=await fixture(t);await f.ok('/inputs',{revision:0,tables:p10Fixture(),actor:'test#supervisor'});const audit=await f.ok('/operations');assert.ok(audit.some(a=>a.target==='personnelPools'&&a.actor==='test#planner'));assert.ok(!audit.some(a=>a.actor==='test#supervisor'));
});
