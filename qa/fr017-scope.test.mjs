import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {configurationPreview as preview} from '../src/lib/configuration-preview.mjs';
import {migratePolicies} from '../src/lib/resource-policies.mjs';
import {policyFixture} from './dec0203-fixture.mjs';import {fixture} from './fr027-fixture.mjs';
import {createBusinessRouter} from '../server/business.mjs';
const at='2026-10-29T00:00:00Z';
test('T08/T10/U01 exact effective fields follow the Worker resolver and all resource scopes',()=>{
 const d=policyFixture();const before=JSON.stringify(d);let p=preview(d,at);assert.equal(JSON.stringify(d),before);
 let r=p.rows.find(r=>r.table==='resourceClaims');assert.equal(r.fields.find(f=>f.field==='提前占用分钟').value,'5');assert.match(r.fields.find(f=>f.field==='提前占用分钟').source,/继承工装 G40/);assert.match(r.scope,/订单 A.*MIX.*G40/);
 Object.assign(d.resourceClaims[0],{'参数来源':'逐项声明','需求数量':'1','提前占用分钟':'2','后延占用分钟':'3'});r=preview(d,at).rows.find(r=>r.table==='resourceClaims');assert.equal(r.fields.find(f=>f.field==='提前占用分钟').value,'2');assert.match(r.fields.find(f=>f.field==='提前占用分钟').source,/表23资源占用声明/);
 d.tools[0]['适用任务']='FILL';assert.equal(preview(d,at).rules.find(r=>r.id==='MOLD').state,'缺项');
});
test('U05 separate disabled, future, unsupported, missing and adopted; minimal never claims adoption',()=>{
 const d=policyFixture(),state=()=>preview(d,at).rules.find(r=>r.id==='MOLD').state,r=d.rules.find(r=>r['规则编号']==='MOLD');
 assert.equal(state(),'采用');r['是否启用']='否';assert.equal(state(),'未启用');r['是否启用']='是';r['生效时间']='2099-01-01T00:00:00Z';assert.equal(state(),'待生效');delete r['生效时间'];d.resourceClaims=[];assert.equal(state(),'缺项');assert.equal(preview(d,at).rules.find(r=>r.id==='CLEANING').state,'未支持');
 const x=policyFixture();assert.equal(preview(x,at,'minimal-r1').rules.find(r=>r.id==='MOLD').state,'本次未检查');
});
test('U01 exact disabled substitution overrides wildcard; no implicit reverse/transitive eligibility',()=>{
 const d=policyFixture('personnel');d.skillSubstitutions.push({...d.skillSubstitutions[0],'关系编号':'NO','适用工序':'MIX','是否启用':'否'});
 let p=preview(d,at);assert.ok(p.rows.find(r=>r.table==='skillSubstitutions').notes.some(n=>n.includes('MIX')));assert.ok(p.rows.find(r=>r.table==='dependencies').notes.some(n=>n.includes('无可用同技能')));
 d.skillSubstitutions.pop();p=preview(d,at);assert.ok(p.rows.find(r=>r.table==='dependencies').notes.some(n=>n.includes('有向替代 A → B')));
});
test('H02 upgrade/restart/read compatibility is idempotent and preserves full old history; rollback read; missing snapshot blocks writes',async t=>{
 const f=await fixture(t),d=policyFixture();await f.ok('/inputs',{revision:0,tables:d});
 const file=path.join(f.dir,'business.json'),s=JSON.parse(f.bytes());for(const r of s.data.resourceClaims)for(const k of ['参数来源','窗口开始偏移分钟','窗口结束偏移分钟'])delete r[k];
 for(const r of s.data.resourceClaims)Object.assign(r,{'需求数量':'1','提前占用分钟':'5','后延占用分钟':'10'});
 // Historical records are intentionally not migration targets, including missing snapshots.
 s.plans=[{id:'legacy-confirmed',status:'confirmed',tasks:[],ruleSnapshot:null,conditions:{original:'unavailable'}}];s.inputVersions={};fs.writeFileSync(file,JSON.stringify(s));
 const bytes=f.bytes(),old=structuredClone(s.plans);
 const restart=()=>createBusinessRouter({dataDir:f.dir,actorMiddleware:(_q,_s,n)=>n(),requireMember:()=> (_q,_s,n)=>n()});
 restart();const a=await f.ok('/state');restart();const b=await f.ok('/state');assert.deepEqual(a.data,b.data);assert.equal(f.bytes(),bytes);assert.deepEqual(JSON.parse(f.bytes()).plans,old);assert.deepEqual(migratePolicies(a.data),a.data);
 // Prior schema can still read the persisted file, no rewrite on upgrade/read.
 assert.deepEqual(JSON.parse(fs.readFileSync(file)).data,s.data);assert.equal((await f.call('/plans/legacy-confirmed/inputs')).status,409);
 const tools=structuredClone(a.data.tools);tools[0]['可用数量']='2';assert.equal((await f.call('/inputs',{revision:a.revision,tables:{tools}})).body.error,'protected_history_unavailable');assert.equal(f.bytes(),bytes);
 const bad=structuredClone(a.data.resourceClaims);bad[0]['需求数量']='bad';assert.equal((await f.call('/inputs',{revision:a.revision,tables:{resourceClaims:bad}})).status,400);assert.equal(f.bytes(),bytes);
});
test('N04 unsupported model fields and query writes reject atomically; frozen new run preview kept in original snapshot',async t=>{
 const f=await fixture(t);await f.ok('/inputs',{revision:0,tables:policyFixture()});const state=await f.ok('/state'),before=f.bytes();
 for(const extra of ['岗位编号','物理池编号','多班组合']){const deps=structuredClone(state.data.dependencies);deps[0][extra]='unapproved';assert.equal((await f.call('/inputs',{revision:state.revision,tables:{dependencies:deps}})).status,400);assert.equal(f.bytes(),before);}
 assert.equal((await f.call('/inputs',{revision:state.revision,tables:{tools:state.data.tools}},'query')).status,403);assert.equal(f.bytes(),before);
 const p=await f.ok('/calculate',{revision:state.revision});const frozen=await f.ok('/runs/'+p.runId+'/inputs');assert.equal(frozen.conditions.resourcePolicyContract,'CR-DEC02-03-v1');assert.equal((await f.ok('/rules/preview')).contract,'FR017-preview-v1');const tools=structuredClone(state.data.tools);tools[0]['可用数量']='2';await f.ok('/inputs',{revision:state.revision,tables:{tools}});assert.deepEqual(await f.ok('/runs/'+p.runId+'/inputs'),frozen);
});
