import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePlans,restoreBlockers} from './plan-comparison.mjs';
const plan={id:'p',tasks:[],materialChecked:true,materialDemands:[{taskId:'A',materialId:'M',quantity:1},{taskId:'A',materialId:'M',quantity:2}],resourceReservations:[{type:'人员',resourceId:'G',taskId:'A',quantity:1},{type:'设备',resourceId:'M',taskId:'A',quantity:1}],deliveryAssessment:{orders:[]},resultAssessment:{tasks:[]}};
test('FR026 compare retains duplicate material keys and ignores resource array ordering',()=>{
 const next=structuredClone(plan);next.id='q';next.materialDemands[0].quantity=3;next.resourceReservations.reverse();const report=comparePlans(plan,{},next,{});
 assert.equal(report.materials.changes.length,1);assert.equal(report.materials.changes[0].before.length,2);assert.equal(report.resources.changes.length,0);assert.deepEqual(plan.materialDemands.map(x=>x.quantity),[1,2]);
});
test('FR026 missing evidence remains unknown and restore always requires actual versioned progress',()=>{
 const r=comparePlans({id:'old',tasks:[]},{},{id:'new',tasks:[]},{});for(const key of ['materials','resources','orders','unplanned'])assert.equal(r[key].known,false);assert.equal(r.orderOutcome,'unknown');
 const guard=restoreBlockers({data:{inventory:[]},revision:9},plan);assert.equal(guard.currentRevision,9);assert.match(guard.executionFactsVersion,/^[a-f0-9]{64}$/);assert.equal(guard.confirmationReference,null);assert.ok(guard.blockers.some(b=>b.code==='STALE_STOCK_RESTORE_FORBIDDEN'));
});

test('FR028 condition fields use business keys, ignore row order and preserve grouped duplicates',async()=>{
 const {conditionChanges}=await import('./plan-comparison.mjs');
 const a={personnelGroups:[{'人员组编号':'G','人员数量':'1'}],orders:[{'订单编号':'A','合格需求':'1'},{'订单编号':'B','合格需求':'2'}]};const b=structuredClone(a);b.orders.reverse();b.personnelGroups[0]['人员数量']='5';
 const before=JSON.stringify(a),c=conditionChanges(a,b);assert.equal(c.length,1);assert.equal(c[0].table,'personnelGroups');assert.deepEqual(c[0].fields,[{field:'人员数量',before:'1',after:'5'}]);assert.equal(JSON.stringify(a),before);
 b.personnelGroups.push({...b.personnelGroups[0]});assert.equal(conditionChanges(a,b)[0].kind,'group-changed');assert.equal(conditionChanges(a,b)[0].after.length,2);
});
const assessed=(id,minute)=>({id,tasks:[],conditions:{mode:'supported',checkScope:{checked:['machine']}},deliveryAssessment:{orders:[{orderId:'A',expectedDeliverableMinute:minute,delayMinutes:minute===null?null:Math.max(0,minute-50),dueMinute:50,remainingQuantity:10,unit:'kg',supplyConditions:[{conditional:true}]}]}});
test('FR028 improved, unchanged, worse and unknown outcomes never claim guaranteed delivery',()=>{
 for(const [minute,outcome] of [[40,'earlier-conditional'],[60,'unchanged-no-delivery-improvement'],[90,'later-conditional'],[null,'unknown']]){
 const r=comparePlans(assessed('a',60),{},assessed('b',minute),{});assert.equal(r.impact.orders[0].outcome,outcome);assert.equal(r.impact.orders[0].promised,false);assert.equal(r.impact.orders[0].after.supplyConditions[0].conditional,true);
 }
});
test('FR028 relaxed demand, changed run settings or unchecked scope prevents resource-improvement inference',()=>{
 const a=assessed('a',60),b=assessed('b',40);
 let r=comparePlans(a,{orders:[{'订单编号':'A','合格需求':'10'}]},b,{orders:[{'订单编号':'A','合格需求':'5'}]});assert.equal(r.impact.orders[0].outcome,'not-comparable');
 b.conditions.mode='minimal-r1';r=comparePlans(a,{},b,{});assert.equal(r.impact.orders[0].outcome,'not-comparable');assert.equal(r.impact.settings.comparable,false);
 b.conditions.checkScope={checked:[]};assert.equal(comparePlans(a,{},b,{}).scope.comparable,false);
});
test('FR028 missing order evidence is unknown and added/removed orders are not comparable',()=>{
 const a=assessed('a',60),b=assessed('b',40);b.deliveryAssessment.orders[0].orderId='B';const r=comparePlans(a,{},b,{});assert.ok(r.impact.orders.every(o=>o.outcome==='not-comparable'));assert.equal(r.impact.noAutomaticImprovement,true);
});

test('FR028 rule evaluation timestamps remain provenance rather than user selection differences',()=>{
 const a=assessed('a',60),b=assessed('b',40);a.conditions.ruleEvaluationAt='2026-10-29T01:00:00Z';b.conditions.ruleEvaluationAt='2026-10-29T02:00:00Z';
 const r=comparePlans(a,{},b,{});assert.equal(r.impact.settings.comparable,true);assert.equal(r.impact.orders[0].outcome,'earlier-conditional');assert.equal(r.impact.settings.ruleEvaluationAt.before,a.conditions.ruleEvaluationAt);
});

test('FR028 arbitrary comparisons with copied results cannot imply new condition improvement',()=>{
 const a=assessed('a',60),b=assessed('b',40);b.copiedResult=true;assert.equal(comparePlans(a,{},b,{}).impact.orders[0].outcome,'copied-not-recalculated');
});
