// Deliberately illegal diagnostic copies are never Worker outputs or scheduler FAILs.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';
const out=process.env.UAT06_OUT,core=JSON.parse(fs.readFileSync(out+'/api/core.json')),late=JSON.parse(fs.readFileSync(out+'/api/late-return10.json')),checks=[];
function check(id,x,start,status){const p=structuredClone(x.plan),t=[...p.tasks].filter(t=>t.operation==='FILL').sort((a,b)=>b.start-a.start)[0],delta=start-t.start;t.start+=delta;t.end+=delta;for(const r of p.resourceReservations)if(r.taskIds.includes(t.id)){r.start+=delta;r.end+=delta;}const result=verifyResourcePolicies(p,x.input.executionData,x.input.conditions);assert.equal(result.status,status,JSON.stringify(result));checks.push({id,status:'PASS',classification:'intentional diagnostic copy, not Worker outcome',changedTask:t.id,plan:p,result});}
check('THREE_SIMULTANEOUS_REJECTED',core,30,'problem');check('BEFORE_RETURN59_REJECTED',core,59,'problem');check('EXACT_RETURN60_ACCEPTED',core,60,'pass');check('BEFORE_DELAYED_RETURN69_REJECTED',late,69,'problem');check('EXACT_DELAYED_RETURN70_ACCEPTED',late,70,'pass');
fs.writeFileSync(out+'/diagnostic-results.json',JSON.stringify({checks},null,2));
