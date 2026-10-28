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
 const guard=restoreBlockers({data:{inventory:[]},revision:9},plan);assert.equal(guard.currentRevision,9);assert.equal(guard.executionFactsVersion,null);assert.equal(guard.confirmationReference,null);assert.ok(guard.blockers.some(b=>b.code==='STALE_STOCK_RESTORE_FORBIDDEN'));
});
