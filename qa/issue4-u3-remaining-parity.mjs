// Read-only differential guard: original predicates/code/messages and valid plan facts.
// Membership expectations are independently specified in issue4-u2.test.mjs / Design original.
import assert from 'node:assert/strict';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {seed,calculate} from '../server/planner.ts';import {validateBomConfig} from '../src/lib/bom-config.mjs';import {validateExpectedSupply} from '../src/lib/expected-supply.mjs';import {assessRules} from '../src/lib/business-rules.mjs';import {u2Data,supplyInput,delay} from './issue4-u2-fixture.mjs';import {materialFixture} from './material-fixture.mjs';
const parent=process.env.U2_PARENT_ROOT||'/parent';const load=p=>import(pathToFileURL(parent+'/'+p));const oldBom=await load('src/lib/bom-config.mjs'),oldSupply=await load('src/lib/expected-supply.mjs'),oldRules=await load('src/lib/business-rules.mjs'),oldPlanner=await load('server/planner.ts');
const diagnostics=rows=>rows.map(r=>({code:r.code??null,message:r.message}));let comparisons=0;const same=(a,b)=>{assert.deepEqual(a,b);comparisons++;};
for(let i=0;i<100;i++){
 const d=u2Data();d.supplies[0]['预计数量']=['30','35','0','NaN','-1','Infinity',''][i%7];d.supplyUses[1]['使用数量']=['15','10','0','-1','NaN',''][i%6];if(i%3===0)d.supplyUses.push({...d.supplyUses[0]});if(i%4===0)d.supplies.push({...d.supplies[0]});if(i%5===0)d.supplyUses[0]['供给编号']='ABSENT';d.supplyDelays=[delay('D1','10:00','10:00','11:00'),delay('D2','11:00',i%2?'09:00':'12:00',i%2?'10:00':'13:00')];same(diagnostics(validateExpectedSupply(supplyInput(d))),diagnostics(oldSupply.validateExpectedSupply(supplyInput(d))));
 const b=materialFixture(seed);b.bom[1]['生效日期']=['2026-01-01','2026-02-30','', '2026-02-01'][i%4];b.bom[0]['配置用量']=['0','-1','bad','650'][i%4];if(i%3===0)b.bom.push({...b.bom[0]});if(i%5===0)b.bom[0]['用量单位']='g';same(diagnostics(validateBomConfig(b)),diagnostics(oldBom.validateBomConfig(b)));
 const r=structuredClone(seed);if(i%2)r.rules=r.rules.filter(r=>r['规则编号']!=='MACHINE');if(i%3===0)r.times=[];if(i%4===0)r.dependencies=[];if(i%5===0)r.routes=[];if(i%6===0)r.calendars=[];if(i%7===0)r.rules.push({...r.rules[0]});same(diagnostics(assessRules(r,'2026-10-30T00:00:00Z',true).issues),diagnostics(oldRules.assessRules(r,'2026-10-30T00:00:00Z',true).issues));
}
for(const d of [structuredClone(seed),materialFixture(seed),(()=>{const d=u2Data();d.supplyUses[1]['使用数量']='10';return d;})()]){
 const pick=p=>({tasks:p.tasks,findings:diagnostics(p.findings),rules:p.rules,materialDemands:p.materialDemands,supplyConditions:p.supplyConditions,resourceReservations:p.resourceReservations,batchChecked:p.batchChecked,materialChecked:p.materialChecked,deliveryAssessment:p.deliveryAssessment,resultAssessment:p.resultAssessment,execution:p.execution});
 same(pick(calculate(d,1,'2026-10-30T00:00:00Z')),pick(oldPlanner.calculate(d,1,'2026-10-30T00:00:00Z')));
}
const {u3Resource,u3Consumption}=await import('./issue4-u3-fixture.mjs');
const modules=['batch-policy','joint-policy','execution-facts','resource-policies'];
for(const name of modules){const old=await load('src/lib/'+name+'.mjs'),now=await import('../src/lib/'+name+'.mjs');for(let i=0;i<40;i++){
 const d=i%2?u3Resource():u3Consumption();if(i%3===0)d.batchResources.push({...d.batchResources[0],容量:'0'});if(i%4===0)d.executionFacts?.push({...d.executionFacts[0]});if(i%5===0)d.executionMaterials?.push({...d.executionMaterials[0]});
 const fn={ 'batch-policy':'validateBatchResources','joint-policy':'validateJointResources','execution-facts':'validateExecution','resource-policies':'validatePolicies'}[name];same(diagnostics(now[fn](d,'2026-10-30T00:00:00Z')),diagnostics(old[fn](d,'2026-10-30T00:00:00Z')));
 if(name==='execution-facts'){const next=structuredClone(d);next.executionMaterials=[];same(diagnostics(now.executionTransition(d,next)),diagnostics(old.executionTransition(d,next)));}
}}
const resource=await import('../src/lib/resource-policies.mjs'),execution=await import('../src/lib/execution-facts.mjs'),batch=await import('../src/lib/production-batches.mjs'),material=await import('../src/lib/material-allocation.mjs');
const oldResource=await load('src/lib/resource-policies.mjs'),oldExecution=await load('src/lib/execution-facts.mjs'),oldBatch=await load('src/lib/production-batches.mjs'),oldMaterial=await load('src/lib/material-allocation.mjs');
const {skillInput}=await import('./issue4-u3-remaining-fixture.mjs'),{executionFixture}=await import('./execution-fixture.mjs'),{batchFixture}=await import('./batch-fixture.mjs');
for(let i=0;i<60;i++){
 const d=skillInput();d.skillSubstitutions[0]['可提供技能']=['MISSING','KNOWN','', ' KNOWN'][i%4];if(i%3===0)d.skillSubstitutions.push({...d.skillSubstitutions[0]});if(i%4===0)d.personnelGroups=[];same(diagnostics(resource.validatePolicies(d)),diagnostics(oldResource.validatePolicies(d)));
 const e=executionFixture(seed,i%2?'已完成':'部分完成');e.executionMaterials[0]['累计已用数量']=['40','100','101','bad','0'][i%5];if(i%3===0)e.bom[0]['配置用量']='999';if(i%7===0){e.executionFacts[0]['累计报废数量']='5';e.executionFacts[0]['报废补做口径']='按本工序BOM补做';}same(diagnostics(execution.validateExecution(e)),diagnostics(oldExecution.validateExecution(e)));const c={mode:i%2?'supported':'minimal-r1',enabledRuleIds:['MATERIAL','MOLD'],endMinute:i%3?20:100,ruleEvaluationAt:'2026-10-30T00:00:00Z'};same(diagnostics(execution.executionAdmission(e,c)),diagnostics(oldExecution.executionAdmission(e,c)));
 const b=batchFixture(seed);if(i%2)b.orders[0]['是否允许拆分']='否';if(i%3===0)b.orders[0]['数量单位']='支';if(i%5===0)b.bom[0]['配置用量']='649';same(diagnostics(batch.prepareProductionBatches(b,b.orders,0).findings),diagnostics(oldBatch.prepareProductionBatches(b,b.orders,0).findings));
}
const result={parent:'17b70e14082e91be44e56bbc3f59eca02db018c0',priorCases:503,remainingProducerComparisons:240,comparisons,status:'PASS',scope:'Sampled code/message/order and valid business fields, no universal proof'};console.log(JSON.stringify(result));if(process.env.G01_EVIDENCE)fs.writeFileSync(process.env.G01_EVIDENCE+'/remaining-semantics-parity.json',JSON.stringify(result,null,2));
