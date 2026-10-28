import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceLoad,loadCsv} from '../src/lib/resource-load.mjs';
import {calculate,seed} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
import {materialFixture} from './material-fixture.mjs';
import {jointFixture,enableJoint,claim} from './joint-fixture.mjs';
import {deliveryFixture} from './delivery-fixture.mjs';
const run=(d,selection={})=>{const f=freezeRunInput(d,selection,'2026-10-29T00:00:00Z');return {...calculate(f.executionData,0,'2026-10-29T00:00:00Z',f.conditions),inputSnapshot:d};};
const reservation=(id,start,end,quantity,taskIds=['A','B'])=>({type:'工装',resourceId:id,unit:'套',start,end,quantity,taskIds});
test('FR032 union of machine intervals gives planned busy/unallocated, never live availability',()=>{
 const p={tasks:[{id:'A',machine:'M',start:0,end:30},{id:'B',machine:'M',start:20,end:40},{id:'C',machine:'M',start:40,end:50}]};
 const m=resourceLoad(p,{start:10,end:60}).machines[0];assert.equal(m.busyMinutes,40);assert.equal(m.unallocatedMinutes,10);assert.equal(m.availableNow,null);assert.deepEqual(m.taskIds,['A','B','C']);
 assert.throws(()=>resourceLoad(p,{start:null,end:60}));assert.throws(()=>resourceLoad(p,{start:60,end:60}));
});
test('FR032 shared tooling counted once, return extension and half-open peaks preserved',()=>{
 const a=reservation('G',0,40,'1');const p={resourceReservations:[a,structuredClone(a),reservation('G',40,70,'1',['C']),reservation('G',30,50,'1',['D'])]};
 const r=resourceLoad(p,{start:0,end:100}).resources[0];assert.equal(r.peak.value,2);assert.equal(r.quantityMinutes.value,90);assert.equal(r.reservations.length,3);assert.deepEqual(r.taskIds,['A','B','C','D']);assert.equal(r.capacity,null);
});
test('FR032 distinct declarations with identical windows and tasks remain separate physical demands',()=>{
 const a=reservation('G',0,10,'1');const r=resourceLoad({resourceReservations:[{...a,declarationId:'C1'},{...a,declarationId:'C2'}]}).resources[0];assert.equal(r.peak.value,2);assert.equal(r.quantityMinutes.value,20);
});
test('FR032 personnel participation window does not inherit whole machine run; exact decimal space peak',()=>{
 const p={tasks:[{id:'A',machine:'M',start:0,end:100}],resourceReservations:[{...reservation('P',5,20,'2',['A']),type:'人员',unit:'人'},{...reservation('S',0,10,'0.1',['A']),type:'空间',unit:'kg'},{...reservation('S',0,10,'0.2',['B']),type:'空间',unit:'kg'}]};
 const rs=resourceLoad(p).resources;assert.equal(rs[0].quantityMinutes.value,30);assert.equal(rs[1].peak.value,0.3);assert.deepEqual(rs[1].peak.exact,{numerator:'3',denominator:'10'});
});
test('FR032 malformed or unchecked reservations and configuration only remain unknown',()=>{
 const p={inputSnapshot:{tools:[{'工装编码':'G','可用数量':'2'}]},resourceReservations:[]};let r=resourceLoad(p).resources[0];assert.equal(r.peak,null);assert.equal(r.capacity,2);assert.equal(r.availableNow,null);
 for(const patch of [{start:null},{end:0},{quantity:null}]){p.resourceReservations=[{...reservation('G',0,20,'1'),...patch}];r=resourceLoad(p).resources[0];assert.equal(r.peak,null);}
 const m=resourceLoad({tasks:[{id:'A',machine:'M',start:null,end:30}]}).machines;assert.equal(m[0].busyMinutes,null);assert.equal(m[0].unallocatedMinutes,null);
});
test('FR032 AC10 real scheduler exact325 demand/300 eligible/25 gap, no committed candidate consumption',()=>{
 const d=materialFixture(seed),lot=d.inventory.find(r=>r['物料编号']==='LEAN');Object.assign(lot,{'账面数量':'400','已占用数量':'100'});
 for(const state of ['待检','冻结','不合格'])d.inventory.push({...lot,'批次编号':state,'质量状态':state,'账面数量':'1000','已占用数量':'0'});
 const p=run(d),before=JSON.stringify(p),report=resourceLoad(p),m=report.materials.find(r=>r.materialId==='LEAN');
 assert.equal(m.quantity,325);assert.equal(m.allocated.value,300);assert.equal(m.shortage,25);assert.equal(m.committedConsumption.value,0);assert.deepEqual(m.exactGap,{numerator:'25',denominator:'1'});assert.equal(m.committed,false);
 assert.ok(report.alerts.some(a=>a.code==='MATERIAL_SHORTAGE'&&a.quantity===25&&a.unit==='kg'&&a.minute===m.feedMinute));assert.equal(JSON.stringify(p),before);
});
test('FR032 exact0.1 gap never becomes zero or feasible',()=>{
 const d=materialFixture(seed);d.inventory.find(r=>r['物料编号']==='LEAN')['账面数量']='324.9';const r=resourceLoad(run(d));assert.equal(r.materials.find(m=>m.materialId==='LEAN').shortage,0.1);assert.ok(r.alerts.some(a=>a.code==='MATERIAL_SHORTAGE'&&a.quantity===0.1));
});
test('FR032 AC06/14 real joint scheduler600+600 on1000 retains complete windows and no double occupancy',()=>{
 const d=jointFixture(seed);enableJoint(d,'STORAGE');d.batchResources=[{'资源编号':'COLD','资源类型':'共享冷却空间','容量':'1000','单位':'kg','允许程序':''}];
 d.resourceClaims.push(...d.orders.map(o=>claim('S'+o['订单编号'],o['订单编号'],'MIX','COLD','空间','600','kg','0','30')));
 const p=run(d),r=resourceLoad(p,{start:0,end:600}).resources.find(r=>r.id==='COLD');assert.equal(r.peak.value,600);assert.equal(r.capacity,1000);assert.equal(r.availableNow,null);assert.ok(r.reservations.every(x=>x.end-x.start===60));assert.ok(r.taskIds.length>=2);
});
test('FR032 late order96kg/60min comes from saved delivery, not two operation quantities',()=>{
 const p=run(deliveryFixture(seed),{startMinute:180});const r=resourceLoad(p);const a=r.alerts.find(a=>a.code==='ORDER_LATE');assert.equal(a.quantity,96);assert.equal(a.delayMinutes,60);assert.equal(a.minute,360);assert.equal(a.dueMinute,300);assert.equal(a.taskIds.length,2);
 delete p.deliveryAssessment;assert.ok(resourceLoad(p).alerts.some(a=>a.code==='DELIVERY_UNCHECKED'));
});
test('FR032 saved late/conditional/missing supply alerts show quantity/time/reason and never infer physical arrival',()=>{
 const supply={'供给编号':'S','物料编号':'LEAN','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00'};
 const use={'订单编号':'A','工序编号':'MIX','供给编号':'S','使用数量':'5'};
 const p={inputSnapshot:{materials:[{'物料编号':'LEAN','单位':'kg'}],supplies:[supply],supplyUses:[use]},tasks:[{id:'T',orderId:'A',operation:'MIX',machine:'M',start:180,end:200}]};
 let a=resourceLoad(p).alerts.find(a=>a.code==='CONDITIONAL_ARRIVAL');assert.equal(a.quantity,5);assert.equal(a.unit,'kg');assert.equal(a.minute,180);assert.deepEqual(a.taskIds,['T']);
 p.inputSnapshot.supplyDelays=[{'供给编号':'S','记录时间':'2026-11-02T09:00:00+08:00','调整后到达时间':'2026-11-02T12:00:00+08:00','调整后可用时间':'2026-11-02T13:00:00+08:00','原因':'模拟延期两小时'}];
 a=resourceLoad(p).alerts.find(a=>a.code==='CONDITIONAL_ARRIVAL_UNMET');assert.equal(a.minute,300);assert.match(a.message,/模拟延期两小时/);
 p.inputSnapshot.supplies=[];a=resourceLoad(p).alerts.find(a=>a.code==='CONDITIONAL_ARRIVAL_UNMET');assert.equal(a.minute,null);assert.match(a.message,/缺失/);
});
test('FR032 missing task inputs and legacy no snapshots stay unknown; projection immutable',()=>{
 const p={id:'OLD',tasks:[],resultAssessment:{tasks:[{id:'T',orderId:'A',operation:'MIX',quantity:12,unit:'kg',status:'unplanned',candidateMinute:42,reasons:[{code:'INPUT / MACHINE',classification:'data-repair',message:'设备引用缺失'}]}]}};const bytes=JSON.stringify(p),r=resourceLoad(p);const a=r.alerts.find(a=>a.code==='MISSING_INPUT');assert.equal(a.quantity,12);assert.equal(a.minute,42);assert.equal(a.candidate,true);assert.ok(r.alerts.some(a=>a.code==='MISSING_SAVED_INPUT'));assert.equal(JSON.stringify(p),bytes);
});
test('FR032 AC26 CSV uses exact same projection/window/category, includes line/input/simulation and unknowns',()=>{
 const p=run(deliveryFixture(seed),{startMinute:180});Object.assign(p,{id:'P',runId:'R',snapshotHash:'H',inputVersionId:'V'});const r=resourceLoad(p,{start:180,end:240}),csv=loadCsv(r,'alerts');
 assert.match(csv,/L01/);assert.match(csv,/计划模拟/);assert.match(csv,/DEC03/);assert.match(csv,/180/);assert.match(csv,/ORDER_LATE/);assert.ok(!csv.includes('"machines"'));assert.ok(csv.includes(JSON.stringify(r.alerts[0]).replaceAll('"','""')));
});
test('FR032 unplanned personnel declaration retains2-person demand and linked original row with unknown peak',()=>{
 const row={'订单编号':'A','工序编号':'MIX','资源类型':'人员技能','资源编号':'G','需求数量':'2'};
 const p={tasks:[],inputSnapshot:{dependencies:[row]},resultAssessment:{tasks:[{id:'T',orderId:'A',operation:'MIX',status:'unplanned',reasons:[]}]}};
 const r=resourceLoad(p).resources[0];assert.equal(r.demands[0].quantity,'2');assert.equal(r.peak,null);assert.equal(r.capacity,null);assert.deepEqual(r.taskIds,['T']);assert.deepEqual(r.inputRefs,[{table:'dependencies',row}]);
});
test('FR032 deeply frozen confirmed evidence remains unchanged and missing material allocations stay unknown',()=>{
 const p={id:'CONFIRMED',status:'confirmed',tasks:[],execution:{facts:[{'工序完成数量':'40'}]},materialDemands:[{taskId:'T',materialId:'LEAN',unit:'kg',quantity:5,committed:true}]};
 const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};freeze(p);const bytes=JSON.stringify(p),r=resourceLoad(p);assert.equal(r.materials[0].allocated,null);assert.equal(r.materials[0].committedConsumption,null);assert.equal(r.provenance.status,'confirmed');assert.equal(JSON.stringify(p),bytes);
});
