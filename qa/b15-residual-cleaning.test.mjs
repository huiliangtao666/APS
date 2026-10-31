import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {seed,calculate} from '../server/planner.ts';import {freezeRunInput} from '../server/run-input.mjs';
import {fixture} from './fr027-fixture.mjs';import {scenarioFiles} from './b3-material-fixture.mjs';import {pool} from './p10-core-fixture.mjs';import {b2Worker} from './b2-fixture.mjs';
import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {jointFixture} from './joint-fixture.mjs';
import {cleaningFixture} from './b15-residual-cleaning-fixture.mjs';

const out=process.env.RESIDUAL_OUT;const save=(name,x)=>{if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(x,null,2));}};
for(const reverse of [false,true])test('BR13 actual production sequence '+(reverse?'reverse':'forward')+' uses asymmetric policies, global physical pool and real application Worker',async t=>{
 const f=await fixture(t),data=cleaningFixture(reverse),files=scenarioFiles(data),response=await f.call('/imports/preview',{revision:0,files}),p=response.body;assert.equal(p.valid,true,JSON.stringify(p.issues));await f.ok('/imports/commit',{previewId:p.id});const r=await b2Worker(f),a=r.plan.changeoverAssessment;assert.equal(a.status,'pass',JSON.stringify(a.findings));assert.equal(a.domain.inspections.length,1);assert.equal(a.domain.inspections[0].end,reverse?50:40);assert.equal(a.domain.inspections[0].readyAt,reverse?57:45);assert.equal(a.domain.inspections[0].successorStart,90);assert.equal(r.plan.tasks.length,2);assert.ok(r.plan.tasks.every(t=>t.duration===30));assert.equal(a.acceptedOccupations.length,3);
 const verified=await f.ok('/plans/'+r.plan.id+'/verify',{});assert.equal(verified.verification.checks.changeover.status,'pass');const csv=await f.ok('/export',{planId:r.plan.id});assert.ok(csv.includes('BR13实际相邻')&&csv.includes('EXPLICIT-REPLACEABLE-MOCK'));
 const tampered=structuredClone(r.plan);tampered.tasks.find(t=>t.orderId==='B').start=31;assert.equal(independentlyVerifyPlan(tampered,r.input.executionData.orders,r.input.executionData.routes,tampered.rules,new Date().toISOString(),r.input.executionData,r.input.conditions).checks.changeover.status,'problem');
 const old=JSON.stringify(r.plan.changeoverAssessment),s=await f.ok('/state'),rules=structuredClone(s.data.rules),policy=JSON.parse(rules.find(r=>r['规则编号']==='CLEANING')['参数JSON']);policy.source.version='2';policy.policies[0].durationMinutes=11;rules.find(r=>r['规则编号']==='CLEANING')['参数JSON']=JSON.stringify(policy);await f.ok('/inputs',{revision:s.revision,tables:{rules}});assert.equal(JSON.stringify((await f.ok('/plans')).find(p=>p.id===r.plan.id).changeoverAssessment),old);
 save('cleaning-'+reverse,{data,files,result:r,verified,csv});
});
test('BR13 invalid direction, missing explicit zeros, group windows, shared-pool competition and insufficient gap cannot produce accepted occupations',()=>{
 const cases=[];
 for(const [name,change]of [
  ['missing-direction',d=>{const r=d.rules.find(r=>r['规则编号']==='CLEANING'),p=JSON.parse(r['参数JSON']);p.policies=p.policies.slice(1);r['参数JSON']=JSON.stringify(p);}],
  ['prohibited',d=>{const r=d.rules.find(r=>r['规则编号']==='CLEANING'),p=JSON.parse(r['参数JSON']);p.policies[0].prohibited=true;r['参数JSON']=JSON.stringify(p);}],
  ['missing-duration',d=>{const r=d.rules.find(r=>r['规则编号']==='CLEANING'),p=JSON.parse(r['参数JSON']);delete p.policies[0].durationMinutes;r['参数JSON']=JSON.stringify(p);}],
  ['group-window',d=>{d.personnelGroups[0]['可用起始分钟']='50';}],
  ['no-gap',d=>{d.supplies[0]['预计可用时间']='2026-11-02T08:00:00+08:00';d.supplies[0]['预计到达时间']='2026-11-02T08:00:00+08:00';}],
 ]){const d=cleaningFixture();change(d);const frozen=freezeRunInput(d,{mode:'supported',endMinute:600}),plan=calculate(frozen.executionData,0,frozen.conditions.ruleEvaluationAt,frozen.conditions);assert.ok(plan.findings.length,name);assert.equal(plan.changeoverAssessment?.acceptedOccupations.length||0,0,name);cases.push({name,plan});}
 save('cleaning-negative',cases);
});
test('two different cleaning qualification groups debit one physical pool across actual concurrent machine transitions',async t=>{
 const d=cleaningFixture();d.machines.push({...d.machines[0],'设备编号':'MIX02'});
 d.orders.push({...d.orders[0],'订单编号':'C','优先顺序':'3'},{...d.orders[1],'订单编号':'D','优先顺序':'4'});
 d.dependencies.push(...d.dependencies.map(r=>({...r,'订单编号':r['订单编号']==='A'?'C':'D','资源编号':'MIX02'})));d.supplyUses.push({...d.supplyUses[0],'引用编号':'USE-D','订单编号':'D'});d.supplies[0]['预计数量']='2';
 d.personnelGroups.push({...d.personnelGroups[0],'人员组编号':'CLEAN2','人员组名称':'同池第二资格组'});
 const r=d.rules.find(r=>r['规则编号']==='CLEANING'),p=JSON.parse(r['参数JSON']);p.policies.push(...p.policies.map(x=>({...x,id:x.id+'-M2',resourceIds:['MIX02'],resources:[{type:'设备',id:'MIX02',quantity:1}],personnel:[{groupId:'CLEAN2',quantity:1,skill:'clean'}],validation:{...x.validation,resources:[{type:'设备',id:'MIX02',quantity:1}]}})));r['参数JSON']=JSON.stringify(p);
 const results=[];
 for(const capacity of ['1','2']){const f=await fixture(t);d.personnelPools[0]['总人数']=capacity;const q=await f.call('/imports/preview',{revision:0,files:scenarioFiles(d)});assert.equal(q.body.valid,true,JSON.stringify(q.body.issues));await f.ok('/imports/commit',{previewId:q.body.id});const result=await b2Worker(f);assert.equal(result.plan.tasks.length,4);assert.equal(result.plan.changeoverAssessment.status,capacity==='1'?'problem':'pass');if(capacity==='1'){assert.equal(result.plan.changeoverAssessment.acceptedOccupations.length,0);assert.ok(result.plan.changeoverAssessment.findings.some(f=>f.code.includes('CAPACITY')));}results.push(result);}
 save('cleaning-shared-pool',results);
});
test('FR022 original six-task MAX_LAG regression preserves draft tasks, reports unchecked and blocks confirmation; declared unsupported waits still reject',async t=>{
 const d=jointFixture(seed);d.factoryLines=[{'工厂编号':'F01','工厂名称':'FR022明确模拟','产线编号':'L01','产线名称':'L01','时区':'Asia/Shanghai'}];d.rules.find(r=>r['规则编号']==='MOLD')['生效时间']='2027-01-01T00:00:00Z';d.rules.find(r=>r['规则编号']==='MAX_LAG')['是否启用']='是';
 const f=await fixture(t);await f.ok('/inputs',{revision:0,tables:d});const plan=await f.ok('/calculate',{revision:1});assert.equal(plan.tasks.length,6);await f.ok('/plans/'+plan.id+'/verify',{});const review=await f.ok('/plans/'+plan.id+'/review');assert.ok(review.blockers.some(x=>x.code==='unchecked_max_lag'));assert.ok(plan.conditions.checkScope.unchecked.some(s=>s.includes('MAX_LAG')));
 const bad=structuredClone(d);bad.routes.find(r=>r['工序编号']==='FILL')['最大等待分钟']='10';const before=f.bytes(),result=await f.call('/inputs',{revision:1,tables:bad});assert.equal(result.status,400);assert.equal(f.bytes(),before);
 save('fr022-reconciled',{data:d,plan,review,declaredUnsupported:result});
});
