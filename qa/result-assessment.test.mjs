import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,seed} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
import {deliveryFixture} from './delivery-fixture.mjs';
import {assessResult,resultState,resultCsv} from '../src/lib/result-assessment.mjs';
const at='2026-10-29T00:00:00Z';
const run=(d,selection={})=>{const f=freezeRunInput(d,selection,at);return calculate(f.executionData,0,at,f.conditions);};
test('FR024 normal supported result and minimal scope distinguish arranged from delivery and global feasibility',()=>{
 for(const selection of [{},{mode:'minimal-r1'}]){const p=run(deliveryFixture(seed),selection),r=p.resultAssessment;assert.equal(r.status,'scheduled');assert.equal(r.scheduledCount,2);assert.equal(r.unplannedCount,0);assert.equal(r.globalFeasibility,'unknown');assert.equal(r.tasks[0].startAt,'2026-11-02T00:00:00.000Z');assert.match(r.limits.join(),/不保证/);if(selection.mode)assert.ok(r.scope.unchecked.includes('交付与余保'));}
 const p=run(deliveryFixture(seed),{startMinute:180});assert.equal(p.resultAssessment.status,'scheduled');assert.equal(p.deliveryAssessment.orders[0].completionMinute,240);assert.equal(p.deliveryAssessment.orders[0].expectedDeliverableMinute,360);
});
test('FR024 horizon partial links concrete unscheduled task, date, duration, machine, suggestions and source without Gantt fabrication',()=>{
 const d=deliveryFixture(seed),before=JSON.stringify(d),p=run(d,{endMinute:45}),r=p.resultAssessment;
 assert.equal(JSON.stringify(d),before);assert.equal(r.status,'partial-unplanned');assert.equal(p.tasks.length,1);assert.equal(r.scheduledCount,1);assert.equal(r.unplannedCount,1);const t=r.tasks.find(t=>t.status==='unplanned');assert.equal(t.operation,'FILL');assert.equal(t.requiredDuration,30);assert.equal(t.machineId,'FILL01');assert.equal(t.candidateAt,'2026-11-02T00:30:00.000Z');assert.ok(t.reasons.some(f=>f.code.includes('HORIZON')));assert.ok(t.suggestions.some(s=>s.kind==='delay'));assert.ok(t.suggestions.every(s=>s.guaranteed===false));assert.ok(t.inputRefs.some(s=>s.table==='orders'&&s.row['订单编号']==='A'));assert.equal(p.deliveryAssessment.orders[0].delayMinutes,null);
});
test('FR024 AC10 exact shortage25 from325 demand400 stock100 occupied with simulated quality provenance and no deduction',()=>{
 const d=deliveryFixture(seed);d.orders[0]['合格需求']='480';d.orders[0]['是否允许拆分']='否';d.machines.forEach(m=>m['最大装载kg']='10000');d.batchResources=[];
 d.inventory.find(r=>r['物料编号']==='LEAN')['账面数量']='400';d.inventory.find(r=>r['物料编号']==='LEAN')['已占用数量']='100';
 for(const status of ['待检','冻结','不合格'])d.inventory.push({'批次编号':status,'物料编号':'LEAN','账面数量':'1000','已占用数量':'0','质量状态':status,'有效期':'2026-12-31','预计可用时间':'','位置':'模拟区'});
 const before=JSON.stringify(d.inventory),r=run(d).resultAssessment,t=r.tasks.find(t=>t.operation==='MIX'),m=t.materials.find(m=>m.materialId==='LEAN');assert.equal(m.quantity,325);assert.equal(m.shortage,25);assert.deepEqual(m.exactShortage,{numerator:'25',denominator:'1'});assert.equal(m.committed,false);assert.equal(m.allocations.reduce((a,b)=>a+b.quantity,0),300);assert.equal(m.feedAt,'2026-11-02T00:00:00.000Z');assert.equal(JSON.stringify(d.inventory),before);assert.equal(r.scheduledCount,0);assert.ok(t.suggestions.some(s=>s.kind==='demand-edit'));for(const status of ['待检','冻结','不合格'])assert.ok(t.inputRefs.some(x=>x.table==='inventory'&&x.row['质量状态']===status));
});
test('FR024 calendar and predecessor retain per-task links, stop dates and counts',()=>{
 const d=structuredClone(seed);d.downtime=[{'设备编号':'MIX01','起始分钟':'0','结束分钟':'600','原因':'模拟故障'}];const p=run(d),r=p.resultAssessment;const a=r.tasks.filter(t=>t.orderId==='A');assert.ok(a.every(t=>t.status==='unplanned'));assert.ok(a[0].reasons.some(f=>f.code.includes('CALENDAR')));assert.ok(a[0].inputRefs.some(x=>x.table==='downtime'&&x.row['原因']==='模拟故障'));assert.ok(a[1].reasons.some(f=>f.code.includes('PREDECESSOR')));assert.equal(r.unplannedCount,2);assert.equal(r.scheduledCount,2);assert.match(r.unsupported.join(),/保护时段/);
});
test('FR024 unresolved global issues never fabricate task causality; missing metadata remains unknown',()=>{
 const d=deliveryFixture(seed);const p={tasks:[],findings:[{code:'UNPLANNED / BATCH_CONFIG',message:'unresolved',taskIds:[]}],batchChecked:true,productionBatches:[]};const r=assessResult(d,p);assert.equal(r.globalFindings.length,1);assert.ok(r.tasks.every(t=>t.reasons[0].classification==='unknown'));assert.equal(r.unknown.length,2);assert.ok(r.tasks.every(t=>t.candidateAt===null));assert.match(resultCsv({id:'old',status:'completed',planId:'legacy'}),/历史结果原因未知/);
});
test('FR024 lifecycle labels are distinct and timeout never infers infeasibility or a saved partial result',()=>{
 const codes=new Set();for(const status of ['completed','partial','timed_out','failed','cancelled']){const r=resultState({status},status==='completed'?{status:'scheduled'}:{status:'partial-unplanned'});codes.add(r.code);assert.equal(r.globalFeasibility,'unknown');assert.equal(r.hasSavedResult,false);if(status==='timed_out')assert.match(r.label,/不代表业务无解/);}assert.equal(codes.size,5);
});
test('FR024 saved report and CSV preserve provenance and exact values despite changed inputs',()=>{
 const d=deliveryFixture(seed),p=run(d,{endMinute:45});p.runId='run';p.snapshotHash='hash';p.inputVersionId='version';const saved=JSON.stringify(p),csv=resultCsv({id:'run',status:'partial',planId:p.id,snapshotHash:'hash',inputVersionId:'version'},p);d.orders[0]['合格需求']='1';d.inventory=[];run(d);assert.equal(JSON.stringify(p),saved);for(const token of ['run','hash','version','HORIZON','candidateAt','FR024','交付评估'])assert.ok(csv.includes(token));
});
test('FR024 explicit tooling shortage retains concrete claims/capacity and applicable simulated-capacity suggestion',async()=>{
 const {jointFixture}=await import('./joint-fixture.mjs');const d=jointFixture(seed);d.tools[0]['可用数量']='1';d.resourceClaims.forEach(c=>c['需求数量']='2');const p=run(d),r=p.resultAssessment,t=r.tasks.find(t=>t.orderId==='A'&&t.operation==='MIX');assert.equal(t.status,'unplanned');assert.ok(t.reasons.some(f=>f.code.includes('JOINT_RESOURCE')&&f.message.includes('G40')));assert.ok(t.inputRefs.some(x=>x.table==='tools'&&x.row['可用数量']==='1'));assert.ok(t.inputRefs.some(x=>x.table==='resourceClaims'&&x.row['需求数量']==='2'));assert.ok(t.suggestions.some(s=>s.kind==='simulated-capacity'));assert.ok(t.candidateAt);assert.equal(p.resourceReservations.length,0);
});
test('FR024 under-min batch links all member operations with exact recorded load and never invents production',()=>{
 const d=deliveryFixture(seed);d.machines.filter(m=>m['工序编号']==='MIX').forEach(m=>m['最小装载kg']='200');const p=run(d),r=p.resultAssessment;assert.equal(p.tasks.length,0);assert.equal(r.unplannedCount,2);assert.ok(r.tasks.every(t=>t.reasons.some(f=>f.code.includes('UNDER_MIN_LOAD')&&f.context.load===100&&f.context.minimum===200)));assert.ok(r.tasks.every(t=>t.suggestions.some(s=>s.kind==='demand-edit')));
});
test('FR024 batch unsupported unit keeps known source and unresolved reason distinct from data repair',()=>{
 const d=deliveryFixture(seed);d.orders[0]['数量单位']='支';const p=run(d),r=p.resultAssessment;assert.ok(r.tasks.every(t=>t.status==='unplanned'));assert.ok(r.tasks.every(t=>t.reasons.some(f=>f.classification==='unresolved'&&f.code.includes('BATCH_CONFIG'))));assert.ok(r.tasks.every(t=>t.suggestions.every(s=>s.kind!=='data-repair')));
});
