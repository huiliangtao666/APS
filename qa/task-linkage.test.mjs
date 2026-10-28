import test from 'node:test';
import assert from 'node:assert/strict';
import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {problemInterval,taskEvidence} from '../src/lib/task-linkage.mjs';
const fixture=()=>({id:'saved',tasks:[{id:'A-MIX',orderId:'A',productId:'P',operation:'MIX',machine:'M',start:0,end:30},{id:'A-FILL',orderId:'A',productId:'P',operation:'FILL',machine:'M',start:20,end:45,predecessor:'A-MIX'}],inputSnapshot:{dependencies:[{'订单编号':'A','工序编号':'MIX','资源类型':'人员技能','资源编号':'G','需求数量':'2'}],personnelGroups:[{'人员组编号':'G','人员数量':'3','技能':'mix','班次':'D'}]},resourceReservations:[{type:'人员',resourceId:'G',quantity:2,start:0,end:10,taskIds:['A-MIX']}],materialDemands:[{taskId:'A-MIX',quantity:10,shortage:3,allocations:[{quantity:7}]}]});
const orders=[{'订单编号':'A','产线编号':'L'}],routes=[{'产品编号':'P','工序编号':'MIX','前序工序':''},{'产品编号':'P','工序编号':'FILL','前序工序':'MIX'}];
test('structured independent machine and precedence evidence has exact half-open intersection',()=>{
 const p=fixture(),before=structuredClone(p),r=independentlyVerifyPlan(p,orders,routes);
 assert.equal(r.findings.length,2);
 for(const f of r.findings){const i=problemInterval(p,f);assert.equal(i.start,20);assert.equal(i.end,30);assert.deepEqual(f.taskIds,['A-MIX','A-FILL']);}
 assert.equal(r.findings[1].interval.violationDuration,10);assert.equal(r.findings[1].interval.priorEnd,30);assert.deepEqual(p,before);
 p.tasks[1].start=30;assert.equal(independentlyVerifyPlan(p,orders,routes).findings.length,0);
});
test('legacy evidence is derived only from real related endpoints; missing and unplanned are unknown',()=>{
 const p=fixture();assert.equal(problemInterval(p,{code:'MACHINE_OVERLAP',taskIds:['missing']}),null);
 assert.equal(problemInterval(p,{code:'UNPLANNED / PERSONNEL',taskIds:['A-MIX','A-FILL']}),null);
 assert.equal(problemInterval(p,{code:'PRECEDENCE',taskIds:['A-MIX','A-FILL']}).violationDuration,10);
 const legacy=structuredClone(p);legacy.tasks[0].start=null;assert.equal(problemInterval(legacy,{code:'MACHINE_OVERLAP',taskIds:['A-MIX','A-FILL']}),null);
 assert.equal(taskEvidence(p,'missing'),null);assert.equal(taskEvidence({tasks:p.tasks},'A-MIX').hasInput,false);
});
test('resource evidence separates demand, configured capacity and committed material allocation without modifying history',()=>{
 const p=fixture(),before=structuredClone(p),e=taskEvidence(p,'A-MIX');assert.equal(e.resources[0].demand,'2');assert.equal(e.resources[0].available,'3');assert.equal(e.resources[0].reservations[0].end,10);assert.equal(e.materials[0].allocated,7);assert.equal(e.materials[0].shortage,3);assert.deepEqual(p,before);
});
