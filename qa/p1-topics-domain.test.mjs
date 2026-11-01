import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {topicFixture} from './p1-topics-fixture.mjs';
import {calculate,defs} from '../server/planner.ts';import {freezeRunInput} from '../server/run-input.mjs';
import {validateInputs} from '../server/input-validation.mjs';import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {p1Capabilities,p1InitialStrategies,verifyP1Snapshot} from '../src/lib/p1-topics-contract.mjs';
import {queryCsv} from '../src/lib/data-query.mjs';
const at='2026-11-02T08:00:00+08:00';
const dump=(name,x)=>{if(process.env.P1_OUT){fs.mkdirSync(process.env.P1_OUT,{recursive:true});fs.writeFileSync(process.env.P1_OUT+'/'+name+'.json',JSON.stringify(x,null,2));}};
const run=f=>{const frozen=freezeRunInput(f.data,f.selection,at);return {frozen,plan:calculate(frozen.executionData,1,at,frozen.conditions)};};
test('native configuration and real scheduling use only explicit independent forecast',()=>{
 const f=topicFixture(),before=JSON.stringify(f.data);assert.deepEqual(validateInputs(defs,f.data,{at,checkPolicyExecution:false}),[]);
 const {frozen,plan}=run(f);assert.ok(plan.tasks.length,JSON.stringify(plan.findings));assert.deepEqual(plan.findings,[]);
 assert.ok(plan.tasks.every(t=>t.orderId==='MOCK:P1:F1'));assert.match(plan.name,/独立模拟/);
 assert.deepEqual(frozen.conditions.orderIds,['MOCK:P1:F1']);assert.equal(frozen.conditions.p1Topic.sources[0].originalDemandType,'预测');
 assert.equal(frozen.conditions.p1Topic.automaticReplenishment,'NOT_ENABLED');assert.equal(JSON.stringify(f.data),before);
 const checked=independentlyVerifyPlan(plan,frozen.executionData.orders,frozen.executionData.routes,plan.rules,at,frozen.executionData,frozen.conditions);
 assert.equal(checked.checks.p1Isolation.status,'pass');assert.ok(Object.values(checked.checks).every(c=>c.status!=='problem'),JSON.stringify(checked));dump('independent',{frozen,plan,checked});
});
test('default formal scenario excludes all forecasts; mixed selection and minimal mode rejected',()=>{
 const f=topicFixture();const formal=freezeRunInput(f.data,{},at);assert.deepEqual(formal.conditions.orderIds,['A','B']);assert.ok(!formal.conditions.p1Topic);
 for(const selection of [{...f.selection,orderIds:['A','MOCK:P1:F1']},{...f.selection,p1ProfileId:'missing'},{...f.selection,mode:'minimal-r1'}])assert.throws(()=>freezeRunInput(f.data,selection,at));
});
test('every unsupported strategy rejected at save, freeze and forged Worker entry',()=>{
 for(const c of p1Capabilities.filter(c=>c.status!=='SUPPORTED')){const f=topicFixture();f.data.p1Profiles[0]['策略JSON']=JSON.stringify({...p1InitialStrategies,[c.id]:'ENABLED'});assert.ok(validateInputs(defs,f.data,{at,checkPolicyExecution:false}).some(i=>i.message.includes(c.label)));assert.throws(()=>freezeRunInput(f.data,f.selection,at),new RegExp(c.label));}
 const f=topicFixture(),{frozen}=run(f);frozen.conditions.p1Topic.profile['策略JSON']=JSON.stringify({...p1InitialStrategies,targetStock:'ENABLED'});assert.throws(()=>calculate(frozen.executionData,1,at,frozen.conditions),/目标库存/);
});
test('missing/duplicate/formal sources, quantities and branching cannot silently pass',()=>{
 for(const kind of ['duplicate','missing','formal','version','branch']){const f=topicFixture();if(kind==='duplicate')f.data.p1DemandSources.push({...f.data.p1DemandSources[0]});if(kind==='missing')f.data.p1DemandSources[0]['来源编号']='';if(kind==='formal')f.data.p1DemandSources[0]['订单编号']='A';if(kind==='version')f.data.p1Profiles[0]['配置版本']='';if(kind==='branch'){const op=f.data.routes.find(r=>r['产品编号']==='HC40'&&r['前序工序']);f.data.routes.push({...op,'工序编号':'EXTRA'});}assert.throws(()=>freezeRunInput(f.data,f.selection,at),undefined,kind);}
 const {frozen}=run(topicFixture());frozen.executionData.orders[0]['合格需求']='240';assert.ok(verifyP1Snapshot(frozen.executionData,frozen.conditions).length);
});
test('frozen sources and profile survive later edits; query CSV identifies simulation',()=>{
 const f=topicFixture(),{frozen,plan}=run(f);f.data.p1Profiles[0]['配置版本']='mock-v2';f.data.p1DemandSources[0]['来源版本']='source-v2';f.data.orders.at(-1)['合格需求']='48';
 assert.equal(frozen.conditions.p1Topic.profile['配置版本'],'mock-v1');assert.equal(frozen.conditions.p1Topic.sources[0].source['来源版本'],'source-v1');assert.equal(frozen.executionData.orders[0]['合格需求'],'24');
 const csv=queryCsv(defs,frozen.executionData,[{...plan,conditions:frozen.conditions}],1,{table:'tasks',planId:plan.id});assert.match(csv,/独立预测模拟/);assert.match(csv,/MOCK:forecast-01/);assert.match(csv,/source-v1/);dump('query-export',{csv,conditions:frozen.conditions});
});

test('existing hard constraints remain effective in independent simulation',()=>{
 const f=topicFixture();const id=f.data.dependencies.find(d=>d['订单编号']==='MOCK:P1:F1'&&d['资源类型']==='设备')['资源编号'];
 f.data.downtime=[{'设备编号':id,'起始分钟':'0','结束分钟':'600','原因':'明确模拟不可用窗口'}];
 const {plan}=run(f);assert.ok(plan.findings.length);assert.ok(!plan.tasks.some(t=>t.machine===id&&t.start<600));dump('hard-constraint-rejection',plan);
});
test('P1 explicitly reuses B16 physical sharing and all-plan material transaction',async()=>{
 const {applicationFixture}=await import('./b16-application-fixture.mjs');const f=applicationFixture();
 f.data.orders.forEach(o=>o['需求类型']='预测');f.data.p1Profiles=[{'配置编号':'MOCK:P1:B16','配置版本':'v1','来源说明':'明确双线独立模拟','策略JSON':JSON.stringify(p1InitialStrategies)}];
 f.data.p1DemandSources=f.data.orders.map(o=>({'订单编号':o['订单编号'],'配置编号':'MOCK:P1:B16','来源编号':'MOCK:'+o['订单编号'],'来源版本':'v1','来源说明':'独立预测，不与正式订单叠加'}));f.selection.p1ProfileId='MOCK:P1:B16';
 const {plan,frozen}=run(f);assert.equal(plan.tasks.length,4,JSON.stringify(plan.findings));assert.equal(plan.b16Verification.status,'pass');assert.equal(plan.materialTransaction.status,'committed');assert.equal(plan.materialDemands.filter(r=>r.materialId==='LEAN').reduce((n,r)=>n+r.quantity,0),325);assert.equal(frozen.conditions.p1Topic.sources.length,2);
 f.data.supplies[0]['预计数量']='162.4';f.data.supplyUses[0]['使用数量']='162.4';const bad=run(f).plan;assert.equal(bad.materialTransaction.status,'rolled_back');assert.deepEqual(bad.tasks,[]);dump('p1-b16',{plan,bad});
});
