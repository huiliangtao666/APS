import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fixture} from './fr027-fixture.mjs';import {losslessProfile} from './b15-lossless-fixture.mjs';import {b2Worker} from './b2-fixture.mjs';import {freezeRunInput} from '../server/run-input.mjs';import {calculate} from '../server/planner.ts';import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
const out=process.env.LOSSLESS_OUT||'/workspace/temp/b15-lossless/selftest';const save=(n,x)=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,n+'.json'),JSON.stringify(x,null,2));};
async function setup(t,id){const f=await fixture(t),p=losslessProfile(id);await f.ok('/inputs',{revision:0,tables:p.data});return {f,p};}
const changeParam=(d,category,fn)=>{const m=d.stageMappings.find(m=>m['来源类别']===category);m['配置版本']=String(Number(m['配置版本'])+1);const p=JSON.parse(m['参数JSON']);fn(p,m);m['参数JSON']=JSON.stringify(p);};
for(const [name,change] of [
 ['unit',d=>changeParam(d,'originalInventory',p=>p.unit='lb')],
 ['expiry-boundary-missing',d=>changeParam(d,'originalInventory',p=>delete p.expiryBoundary)],
 ['wrong-origin',d=>changeParam(d,'originalInventory',p=>p.origin='2026-11-02T00:00:00Z')],
 ['quality-not-matching',d=>changeParam(d,'originalInventory',p=>p.quality='冻结')],
 ['date-truncation',d=>{d.inventory[0]['有效期']='2026-11-03';}],
 ['runtime-minutes-loss',d=>{d.inventory[0]['到期分钟']='1439';}],
 ['source-snapshot-stale',d=>{d.stageMappings[0]['源记录JSON']='{}';d.stageMappings[0]['配置版本']='2';}],
 ['mapping-version-reuse',d=>{d.stageMappings[0]['配置依据']='changed';}],
 ['duplicate-source-map',d=>d.stageMappings.push({...d.stageMappings[0],'配置编号':'DUPLICATE'})],
 ['duplicate-target',d=>{d.stageMappings[1]['运行编号']=d.stageMappings[0]['运行编号'];d.stageMappings[1]['配置版本']='2';}],
 ['target-missing',d=>{d.stageMappings[0]['运行编号']='ABSENT';d.stageMappings[0]['配置版本']='2';}],
 ['over-reserved',d=>d.inventory[0]['已占用数量']='10001'],
 ['unknown-location',d=>changeParam(d,'originalInventory',p=>p.location='')],
])test('atomic source binding refusal '+name,async t=>{const {f}=await setup(t,'17'),s=await f.ok('/state'),d=structuredClone(s.data);change(d);const before=f.bytes(),r=await f.call('/inputs',{revision:s.revision,tables:d});assert.ok(r.status>=400,name);assert.equal(f.bytes(),before);save('refusal-'+name,{result:r,zeroWrite:true});});
for(const [name,change]of [
 ['supply-order-reference',d=>{d.supplyUses[0]['订单编号']='UNKNOWN';}],
 ['supply-reference-amount',d=>{d.supplyUses[0]['使用数量']='162.6';}],
 ['supply-double-booked',d=>d.inventory.push({...d.inventory[0],'批次编号':'RCPT-LEAN'})],
 ['fact-output-guessed-from-input',d=>{d.executionFacts[0]['工序完成数量']='250';}],
 ['source-consumption-mismatch',d=>{d.executionSources[0]['原始汇总耗料']='249';}],
 ['source-allocation-missing',d=>{d.executionSources[0]['原始分配JSON']='[]';}],
 ['event-old-count',d=>changeParam(d,'originalEvents',p=>p.groupBefore['人员数量']='2')],
 ['event-double-pool',d=>{d.personnelPools.push({...d.personnelPools[0]});}],
 ['event-pool-capacity-missing',d=>{d.personnelPools[0]['总人数']='1';}],
 ['historical-ledger-rewrite',d=>{const doc=JSON.parse(d.originalResourceEvents[0]['原账JSON']);doc.occupancies.find(o=>o.people).quantity='2';d.originalResourceEvents[0]['原账JSON']=JSON.stringify(doc);}],
])test('UAT15 atomic fact/event/supply refusal '+name,async t=>{const {f}=await setup(t,'15'),s=await f.ok('/state'),d=structuredClone(s.data);change(d);const before=f.bytes(),r=await f.call('/inputs',{revision:s.revision,tables:d});assert.ok(r.status>=400,name);assert.equal(f.bytes(),before);save('refusal-'+name,{result:r,zeroWrite:true});});
test('missing mappings, stale revision, readonly role and malformed headcount event cannot create partial input/run writes',async t=>{
 const {f,p}=await setup(t,'17'),s=await f.ok('/state'),before=f.bytes();const results=[];
 for(const [name,endpoint,body,role]of [
  ['stale','/inputs',{revision:s.revision-1,tables:{stageMappings:s.data.stageMappings}}],
  ['readonly','/inputs',{revision:s.revision,tables:{stageMappings:s.data.stageMappings}},'query'],
  ['readonly-preview','/inputs/resource-policy-preview',{revision:s.revision,tables:{stageMappings:s.data.stageMappings}},'query'],
  ['bad-event','/inputs',{revision:s.revision,tables:{simulationEvents:[{'事件编号':'X','事件分钟':'60','保护截止分钟':'60','保护策略':'禁止未开始任务开工','事件类型':'人员数量变化','参数JSON':'{}','原因':'bad','需处理事实JSON':'[]'}]}}],
 ]){const r=await f.call(endpoint,body,role);assert.ok(r.status>=400,name);assert.equal(f.bytes(),before,name);results.push({name,r});}
 await f.ok('/inputs',{revision:s.revision,tables:{stageMappings:[]}});const saved=f.bytes(),next=await f.ok('/state'),r=await f.call('/runs',{revision:next.revision,selection:p.selection});assert.ok(r.status>=400);assert.equal(f.bytes(),saved);assert.ok(r.body.message?.includes('originalInventory')||JSON.stringify(r.body).includes('originalInventory'));save('admission-permissions',{results,missingMappings:r,zeroWrite:true});
});
test('independent checker rejects altered binding, expiry, consumption, event and unique pool snapshots',async t=>{
 const {f,p}=await setup(t,'15'),r=await b2Worker(f,p.selection),results=[];
 for(const [name,change]of [
  ['binding-version',(d,c)=>c.stageBindings[0].version='99'],
  ['raw-quantity',d=>d.originalInventory[0]['库存kg或个']='999'],
  ['minute-expiry',d=>d.inventory[1]['到期分钟']='1'],
  ['allocation',d=>d.executionMaterials[0]['累计已用数量']='162.4'],
  ['original-event',d=>d.originalEvents[0]['新值']='3'],
  ['pool',d=>d.personnelPools[0]['总人数']='3'],
  ['event-boundary',(_d,c)=>c.startMinute=59],
 ]){const d=structuredClone(r.input.executionData),c=structuredClone(r.input.conditions);change(d,c);const v=independentlyVerifyPlan(r.plan,d.orders,d.routes,r.plan.rules,new Date().toISOString(),d,c);assert.equal(v.checks.stageBindings.status,'problem',name);results.push({name,verification:v});}
 save('independent-tamper',results);
});
test('expired minute stock cannot be allocated; failed material candidates reserve no other lots',()=>{
 const p=losslessProfile('17'),d=p.data;for(const lot of d.inventory){lot['到期分钟']='0';const s=d.originalInventory.find(s=>s['批次编号']===lot['批次编号']);s['到期分钟']='0';const m=d.stageMappings.find(m=>m['来源编号']===lot['批次编号']);m['源记录JSON']=JSON.stringify(s);}
 const f=freezeRunInput(d,p.selection),plan=calculate(f.executionData,0,new Date().toISOString(),f.conditions);assert.equal(plan.tasks.length,0);assert.ok(plan.findings.length);assert.ok(plan.materialDemands.every(d=>!d.committed&&!(d.allocations||[]).length));save('expired-stock',{plan,atomicNoMaterialCommit:true});
});
