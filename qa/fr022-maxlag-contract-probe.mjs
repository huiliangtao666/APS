import fs from 'node:fs';
import {calculate,seed,defs} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
import {validateInputs} from '../server/input-validation.mjs';
import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {jointFixture} from './joint-fixture.mjs';
import {maxLagFixture} from './fr022-maxlag-contract-fixture.mjs';
const at='2026-10-31T00:00:00Z';
function run(d,selection={}){const input=freezeRunInput(d,selection,at),plan=calculate(input.executionData,1,at,input.conditions);return {data:d,input,plan,validation:validateInputs(defs,d),verification:independentlyVerifyPlan(plan,input.executionData.orders,input.executionData.routes,plan.rules,at,input.executionData,input.conditions)};}
const original=jointFixture(seed);original.rules.find(r=>r['规则编号']==='MOLD')['生效时间']='2027-01-01T00:00:00Z';
const oldMax=structuredClone(original);oldMax.rules.find(r=>r['规则编号']==='MAX_LAG')['是否启用']='是';
const results={legacyBeforeMax:run(original),legacyMax:run(oldMax),legal:run(maxLagFixture())};
for(const [id,x]of Object.entries(results))console.log(id,JSON.stringify({tasks:x.plan.tasks.map(t=>[t.id,t.operation,t.start,t.end]),findings:x.plan.findings,validation:x.validation,checks:x.verification.checks,ruleStatuses:x.verification.ruleStatuses.filter(r=>['MAX_LAG','MOLD','LABOR','STORAGE'].includes(r.id))}));
if(process.env.FR022_OUT){fs.mkdirSync(process.env.FR022_OUT,{recursive:true});fs.writeFileSync(process.env.FR022_OUT+'/probe.json',JSON.stringify(results,null,2));}
