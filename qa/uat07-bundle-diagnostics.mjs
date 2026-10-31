// Deliberate illegal copies; never pass these off as Worker-produced failures.
import fs from 'node:fs';import assert from 'node:assert/strict';import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';
const out=process.env.UAT07_OUT,x=JSON.parse(fs.readFileSync(out+'/api/core.json')),checks=[];
for(const [start,status]of [[60,'problem'],[69,'problem'],[70,'pass']]){
 const p=structuredClone(x.plan),t=p.tasks.find(t=>t.id==='B-FILL'),delta=start-t.start;t.start+=delta;t.end+=delta;
 for(const r of p.resourceReservations)if(r.taskIds.includes(t.id)){r.start+=delta;r.end+=delta;}
 const result=verifyResourcePolicies(p,x.input.executionData,x.input.conditions);assert.equal(result.status,status,JSON.stringify(result));checks.push({id:'SAME_CONFIG_RETURN_'+start,status:'PASS',classification:'intentional diagnostic mutation, not scheduler failure',plan:p,result});
}
fs.writeFileSync(out+'/diagnostic-results.json',JSON.stringify({checks},null,2));
