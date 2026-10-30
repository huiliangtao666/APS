import test from 'node:test';import assert from 'node:assert/strict';
import {resourceConflicts} from '../src/lib/resource-conflicts.mjs';import {problemInterval} from '../src/lib/task-linkage.mjs';import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {policyFixture} from './dec0203-fixture.mjs';import {freezeRunInput} from '../server/run-input.mjs';import {calculate} from '../server/planner.ts';
const at='2026-10-29T09:00:00Z';
function illegal(kind){
 const d=policyFixture(kind==='工装'?'tool':'personnel');if(kind==='工装'){d.tools[0]['提前占用分钟']='0';}else{for(const dep of d.dependencies.filter(r=>r['资源类型']==='人员技能')){dep['人员开始偏移']='5';dep['人员结束偏移']='20';}}
 const f=freezeRunInput(d,{},at),p=calculate(f.executionData,0,at,f.conditions);p.conditions=f.conditions;p.inputSnapshot=f.executionData;assert.equal(p.tasks.length,2);
 const moved=p.tasks[1],delta=p.tasks[0].start-moved.start;moved.start+=delta;moved.end+=delta;for(const r of p.resourceReservations)if((r.taskIds||[r.taskId]).includes(moved.id)){r.start+=delta;r.end+=delta;}
 return {p,f};
}
for(const [kind,start,end] of [['工装',0,40],['人员',5,10]])test(kind+' conflict reconstructs actual half-open resource window and aggregate 2/1, ignoring unrelated task',()=>{
 const {p,f}=illegal(kind);p.tasks.push({...p.tasks[0],id:'UNRELATED',machine:'UNRELATED',start:100,end:130});
 const v=independentlyVerifyPlan(p,f.executionData.orders,f.executionData.routes,p.rules,at,f.executionData,f.conditions),found=v.findings.filter(f=>f.interval?.kind==='resource-capacity');assert.equal(found.length,1,JSON.stringify(v));const c=found[0];assert.deepEqual(c.taskIds,p.tasks.slice(0,2).map(t=>t.id).sort());assert.deepEqual([c.interval.start,c.interval.end,c.interval.demand,c.interval.effectiveCapacity],[start,end,2,1]);assert.ok(c.evidence.declarations.length);assert.equal(c.evidence.ruleEvaluationAt,at);assert.ok(problemInterval(p,c));
 for(const patch of [{start:start+1},{end:end+1},{demand:1},{effectiveCapacity:2},{resourceId:'fake'}])assert.equal(problemInterval(p,{...c,interval:{...c.interval,...patch}}),null);
 assert.equal(problemInterval(p,{...c,taskIds:[...c.taskIds,'UNRELATED']}),null);assert.equal(problemInterval({...p,inputSnapshot:null},c),null);
});
test('adjacent releases, disabled/future tooling and absent/unknown frozen sources never invent conflict geometry',()=>{
 const d=policyFixture('tool');const f=freezeRunInput(d,{},at),p=calculate(f.executionData,0,at,f.conditions);p.conditions=f.conditions;assert.deepEqual(resourceConflicts(p,f.executionData,f.conditions),[]);
 const x=illegal('工装');for(const patch of [null,{...x.f.executionData,tools:[]},{...x.f.executionData,rules:x.f.executionData.rules.map(r=>r['规则编号']==='MOLD'?{...r,'是否启用':'否'}:r)},{...x.f.executionData,rules:x.f.executionData.rules.map(r=>r['规则编号']==='MOLD'?{...r,'生效时间':'2099-01-01T00:00:00Z'}:r)}])assert.deepEqual(resourceConflicts(x.p,patch,x.f.conditions),[]);
 const bad=structuredClone(x.p);bad.resourceReservations.find(r=>r.type==='工装').declarationId='unknown';assert.deepEqual(resourceConflicts(bad,x.f.executionData,x.f.conditions),[]);
});
test('sweep emits distinct active-task windows once and counts each physical shared ledger once',()=>{
 const {p,f}=illegal('人员'),row=p.resourceReservations.find(r=>r.type==='人员');const a=resourceConflicts(p,f.executionData,f.conditions);assert.equal(a.length,1);
 // Multiple task links on one saved reservation do not multiply its quantity.
 row.taskIds=p.tasks.map(t=>t.id);const b=resourceConflicts(p,f.executionData,f.conditions);assert.equal(b.length,1);assert.equal(b[0].interval.demand,2);
});
