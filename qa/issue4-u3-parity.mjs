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
const result={parent:'08954ccb330147159ae3b1779a7f59ce67a51659',diagnosticCases:300,validPlanCases:3,resourceExecutionComparisons:200,comparisons,status:'PASS'};console.log(JSON.stringify(result));if(process.env.G01_EVIDENCE)fs.writeFileSync(process.env.G01_EVIDENCE+'/u2-u3-semantics-parity.json',JSON.stringify(result,null,2));
