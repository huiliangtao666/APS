import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {seed,defs} from '../server/planner.ts';import {validateInputs} from '../server/input-validation.mjs';
import {executionFixture} from './execution-fixture.mjs';import {event} from './event-fixture.mjs';
import {comparePlans,conditionChanges} from '../src/lib/plan-comparison.mjs';
import {executionTransition,validateExecution} from '../src/lib/execution-facts.mjs';
import {stageEvents,eventRisks} from '../src/lib/simulation-events.mjs';
import {freezeTrialSnapshot,resolveTrialCandidate,checkProtectedTasks,trialInputIssues} from '../src/lib/b15-protection.mjs';
import {run,uat15,uat17,uat18} from './b15-test-fixture.mjs';
const output=process.env.B15_EVIDENCE;
const dump=(id,value)=>{if(output){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(output+'/'+id+'.json',JSON.stringify(value,null,2));}};
test('B15-01 UAT15 completed intervals and historical resource facts survive personnel1 to2; B waits180',()=>{
 const a=uat15(),b=structuredClone(a);b.personnelGroups.forEach(g=>g['人员数量']='2');b.personnelPools[0]['总人数']='2';
 assert.deepEqual(validateInputs(defs,a),[]);assert.deepEqual(trialInputIssues(a,b),[]);
 const p=run(a,'original',{startMinute:60}),q=run(b,'trial',{startMinute:60}),c=comparePlans(p.plan,a,q.plan,b);
 for(const r of [p,q]){assert.deepEqual(r.plan.findings,[]);assert.deepEqual(r.plan.tasks.filter(t=>t.orderId==='A').map(t=>[t.operation,t.start,t.end]),[['MIX',0,30],['FILL',30,60]]);assert.equal(r.plan.tasks.find(t=>t.orderId==='B'&&t.operation==='MIX').start,180);assert.deepEqual(r.plan.execution.facts,a.executionFacts);assert.deepEqual(r.plan.execution.consumption,a.executionMaterials);assert.deepEqual(r.plan.originalResourceProtection,p.plan.originalResourceProtection);}
 assert.equal(c.orderOutcome,'unchanged-no-delivery-improvement');assert.ok(c.impact.orders.find(o=>o.orderId==='B').bottlenecks.after.materials.some(m=>m.allocations.some(x=>x.conditional)));
 dump('UAT15',{before:p,after:q,comparison:c});
});
test('B15-02 UAT17 full290+wait60=350, due90 delay260, fixed heat120 never compressed',()=>{
 const a=uat17(),r=run(a),o=r.plan.deliveryAssessment.orders[0];assert.deepEqual(validateInputs(defs,a),[]);assert.deepEqual(r.plan.findings,[]);assert.equal(r.plan.tasks.length,5);assert.equal(r.plan.tasks.find(t=>t.operation==='HEAT').duration,120);assert.equal(o.completionMinute,290);assert.equal(o.expectedDeliverableMinute,350);assert.equal(o.delayMinutes,260);assert.equal(o.status,'conditional-late');assert.equal(o.promised,false);assert.equal(o.expectedDeliverableAt,'2026-11-02T05:50:00.000Z');
 const blocked=run(a,'short-horizon',{endMinute:90});assert.ok(blocked.plan.resultAssessment.unplannedCount>0);assert.equal(blocked.plan.deliveryAssessment.orders[0].expectedDeliverableMinute,null);dump('UAT17',{complete:r,partial:blocked});
});
test('B15-03 UAT18 continuous40min, G60 at130, normalized700/1000 times250=175, original immutable',()=>{
 const a=uat18(),p=run(a,'original'),frozen=freezeTrialSnapshot(p.plan,a),bytes=JSON.stringify(frozen),b=uat18(true),q=run(b,'candidate');
 assert.deepEqual(validateInputs(defs,b),[]);assert.deepEqual(q.plan.findings,[]);assert.deepEqual(q.plan.tasks.map(t=>[t.operation,t.start,t.end]),[['MIX',60,100],['FILL',130,160]]);assert.equal(q.plan.materialDemands.find(m=>m.materialId==='LEAN').quantity,175);
 const c=comparePlans(frozen.plan,frozen.data,q.plan,b);for(const cat of ['tasks','resources','materials'])assert.ok(c[cat].changes.length);assert.ok(c.impact.changedConditions.some(x=>x.table==='bom'));assert.ok(c.impact.changedConditions.some(x=>x.table==='tools'));assert.equal(JSON.stringify(frozen),bytes);assert.throws(()=>frozen.data.times[0]['固定分钟']='99',TypeError);
 for(const decision of ['keep','discard']){const resolved=resolveTrialCandidate(frozen,{plan:q.plan,data:b},decision);resolved.retained.data.orders[0]['合格需求']='1';assert.equal(JSON.stringify(frozen),bytes);}
 dump('UAT18',{original:p,modified:q,comparison:c});
});
test('B15-04 comparison is detached from later caller edits, including unchanged resource evidence',()=>{
 const a=uat18(),p=run(a),q=run(orderedClone(a)),c=comparePlans(p.plan,a,q.plan,a),bytes=JSON.stringify(c);
 p.plan.tasks[0].start=999;q.plan.resourceReservations[0].start=888;p.plan.conditions.checkScope.checked.push('later');a.orders[0]['合格需求']='1';assert.equal(JSON.stringify(c),bytes);dump('comparison-detached',{before:bytes,after:JSON.stringify(c)});
});
function orderedClone(a){return structuredClone(a);}
test('B15-05 invalid event batch rolls back effects atomically and preserves caller bytes',()=>{
 const a=executionFixture(seed),before=JSON.stringify(a),b=structuredClone(a);b.simulationEvents=[event(),event('人员缺勤',{groupId:'UNKNOWN',endMinute:60},{'事件编号':'E2'})];const r=stageEvents(a,b,['executionFacts']);assert.ok(r.issues.length);assert.deepEqual(r.data,a);assert.equal(JSON.stringify(a),before);assert.equal(b.downtime.length,a.downtime.length);dump('atomic-events',{before:a,proposed:b,result:r});
});
test('B15-06 valid fault retains facts/consumption, handling reason, observation and protection half-open boundary',()=>{
 const a=executionFixture(seed),b=structuredClone(a);b.simulationEvents=[event()];const s=stageEvents(a,b,['executionFacts']);assert.deepEqual(s.issues,[]);assert.deepEqual(trialInputIssues(a,s.data),[]);assert.equal(eventRisks(s.data)[0].factId,'F-A-MIX');const r=run(s.data);assert.ok(r.plan.execution.risks.length);assert.equal(r.plan.execution.events.protectionUntil,45);assert.deepEqual(r.plan.execution.consumption,a.executionMaterials);assert.equal(r.plan.tasks.length,0);const protection=checkProtectedTasks(run(a).plan,r.plan,s.data);assert.equal(protection.valid,true);assert.equal(protection.handlingRequired.length,1);dump('valid-event',{...r,protection});
});
test('B15-07 reject stale event, missing fresh observation, illegal range and immutable event edits',()=>{
 const a=executionFixture(seed);
 for(const e of [event('设备故障',{machineId:'MIX01',endMinute:60},{'事件分钟':'29'}),event('设备故障',{machineId:'MIX01',endMinute:30}),event('设备故障',{machineId:'MIX01',endMinute:60},{'保护截止分钟':'29'})]){const b=structuredClone(a);b.simulationEvents=[e];const s=stageEvents(a,b,['executionFacts']);assert.ok(s.issues.length);assert.deepEqual(s.data,a);}
 const b=structuredClone(a);b.simulationEvents=[event()];assert.ok(stageEvents(a,b,[]).issues.length);const s=stageEvents(a,b,['executionFacts']).data;s.simulationEvents[0]['原因']='改写';assert.ok(stageEvents(stageEvents(a,b,['executionFacts']).data,s,[]).issues.length);
});
test('B15-08 legal forward progress and illegal state/quantity/consumption/start rewrites remain distinguished',()=>{
 const a=executionFixture(seed),b=structuredClone(a);Object.assign(b.executionFacts[0],{'观测分钟':'35','工序完成数量':'50','剩余工时分钟':'15'});b.executionMaterials[0]['累计已用数量']='50';assert.deepEqual(trialInputIssues(a,b),[]);
 const mutations=[d=>d.executionFacts=[],d=>d.executionMaterials=[],d=>d.executionFacts[0]['开始分钟']='1',d=>d.executionFacts[0]['工序完成数量']='39',d=>d.executionFacts[0]['工序完成数量']='101',d=>d.executionFacts[0]['状态']='已开始',d=>d.executionMaterials[0]['累计已用数量']='39'];
 for(const mutate of mutations){const d=structuredClone(a);mutate(d);assert.ok(trialInputIssues(a,d).length,mutate.toString());}
 dump('progress',{before:a,forward:b,rejections:mutations.map(String)});
});
test('B15-09 reduction/cancellation with facts is rejected; unstarted demand change remains independent',()=>{
 const a=executionFixture(seed);for(const change of [{'合格需求':'50'},{'订单状态':'已取消'}]){const b=structuredClone(a);Object.assign(b.orders[0],change);assert.ok(executionTransition(a,b).length);}
 const u=uat18(),v=structuredClone(u);v.orders[0]['合格需求']='120';assert.deepEqual(executionTransition(u,v),[]);assert.equal(comparePlans(run(u).plan,u,run(v).plan,v).impact.orders[0].outcome,'not-comparable');
 const cancelled=structuredClone(u);cancelled.orders[0]['订单状态']='已取消';assert.deepEqual(validateExecution(cancelled),[]);assert.deepEqual(executionTransition(u,cancelled),[]);assert.equal(conditionChanges(u,cancelled).find(x=>x.table==='orders').fields[0].field,'订单状态');
});
test('B15-10 locked/start/completed/missing/duplicate positions rejected; exact lock and protection end allowed',()=>{
 const d=executionFixture(seed,'已完成'),p=run(d).plan,locks={'A-FILL':{start:30,end:60,machine:'FILL01'}};
 assert.equal(checkProtectedTasks(p,p,d,{locks,protectionUntil:30}).valid,true);
 for(const edit of [q=>q.tasks[0].start++,q=>q.tasks.pop(),q=>q.tasks[1].start++,q=>q.tasks.push({...q.tasks[1]})]){const q=structuredClone(p);edit(q);assert.equal(checkProtectedTasks(p,q,d,{locks}).valid,false);}
 const partial=executionFixture(seed),s=run(partial).plan,q=structuredClone(s);q.tasks[0].start++;assert.equal(checkProtectedTasks(s,q,partial).valid,false);
 for(const until of [31,NaN,Infinity,-1])assert.equal(checkProtectedTasks(p,p,d,{protectionUntil:until}).valid,false);
 assert.equal(checkProtectedTasks(p,p,d,{locks:{'A-FILL':null}}).valid,false);
 dump('protection',{data:d,plan:p,valid:checkProtectedTasks(p,p,d,{locks,protectionUntil:30})});
});
test('B15-11 partial and unknown material remain explicit; copied results do not prove improvement',()=>{
 const a=uat17(),p=run(a),q=run(a,'partial',{endMinute:90}),c=comparePlans(p.plan,a,q.plan,a);assert.ok(c.unplanned.changes.length);assert.equal(c.impact.orders[0].after.expectedDeliverableMinute,null);q.plan.copiedResult=true;assert.equal(comparePlans(p.plan,a,q.plan,a).impact.orders[0].outcome,'copied-not-recalculated');
 const unknown=comparePlans({tasks:[]},{},{tasks:[]},{});assert.equal(unknown.materials.known,false);assert.equal(unknown.materials.after,null);
 assert.throws(()=>resolveTrialCandidate({}, {},'overwrite'),/invalid/);
});
test('B15-12 continuous work window rejects split40 and changed histories never mutate',()=>{
 const d=uat18(true);d.calendars=[{...d.calendars[0],'起始分钟':'60','结束分钟':'80'},{...d.calendars[0],'起始分钟':'90','结束分钟':'120'}];const p=run(d).plan;assert.equal(p.tasks.filter(t=>t.operation==='MIX').length,0);assert.ok(p.resultAssessment.unplannedCount>0);dump('split-window',{data:d,plan:p});
});
