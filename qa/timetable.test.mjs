import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,seed} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
import {timetable,timeLabel,projection,clip,lanes,filterTasks} from '../src/lib/timetable.mjs';
import {jointFixture,claim,enableJoint} from './joint-fixture.mjs';
import {executionFixture} from './execution-fixture.mjs';
const at='2026-10-29T00:00:00Z';
const plan=(d,selection={})=>{const f=freezeRunInput(d,selection,at);return {...calculate(f.executionData,0,at,f.conditions),inputSnapshot:structuredClone(d),conditions:f.conditions};};
test('FR033 original AC05 downtime30..60 and shifted continuous task agree with saved timetable and reasons',()=>{
 const d=structuredClone(seed);d.downtime=[{'设备编号':'MIX02','起始分钟':'30','结束分钟':'60','原因':'AC05停机'}];d.dependencies.find(d=>d['订单编号']==='A'&&d['工序编号']==='MIX')['资源编号']='MIX02';const p=plan(d),m=timetable(p);assert.ok(p.tasks.length);assert.deepEqual(m.tasks.filter(t=>t.status==='scheduled').map(t=>[t.id,t.start,t.end]),p.tasks.map(t=>[t.id,t.start,t.end]));
 assert.ok(m.downtime.some(d=>d.machine==='MIX02'&&d.start===30&&d.end===60));
 for(const t of m.tasks.filter(t=>t.status==='scheduled'))for(const down of m.downtime.filter(d=>d.machine===t.machine))assert.ok(!(t.start<down.end&&t.end>down.start));
 assert.deepEqual(m.tasks.filter(t=>t.id==='B-MIX').map(t=>[t.start,t.end]),[[60,90]]);assert.ok(m.tasks.some(t=>/停机/.test(t.source)));assert.equal(timeLabel(1500),'2026-11-03 09:00:00（分钟 1500）');assert.equal(timeLabel(null),'未知');
});
test('FR033 original identities, batch quantities and saved links never rebuilt or summed',()=>{
 const p=plan(structuredClone(seed)),m=timetable(p);
 for(const t of m.tasks){const a=p.resultAssessment.tasks.find(a=>a.id===t.id);assert.equal(t.quantity,a.quantity);assert.equal(t.unit,a.unit);assert.deepEqual(t.assessment.inputRefs,a.inputRefs);if(t.predecessor)assert.ok(m.tasks.some(pre=>pre.id===t.predecessor));}
});
test('FR033 explicit tooling release, personnel phase and space reservations retain precise saved windows and task IDs',()=>{
 const d=jointFixture(seed);d.tools[0]['可用数量']='1';d.resourceClaims.forEach(c=>c['后延占用分钟']='10');enableJoint(d,'STORAGE');d.batchResources=[{'资源编号':'COLD','资源类型':'共享冷却空间','容量':'1000','单位':'kg','允许程序':''}];d.resourceClaims.push(...d.orders.map(o=>claim('S'+o['订单编号'],o['订单编号'],'MIX','COLD','空间','600','kg','0','30')));
 d.personnelGroups=[{'人员组编号':'G','人员数量':'2','技能':'mix','班次':'D','可用起始分钟':'60','可用结束分钟':'300'}];for(const o of d.orders)d.dependencies.push({'订单编号':o['订单编号'],'工序编号':'MIX','资源类型':'人员技能','资源编号':'G','需求数量':'2','所需技能':'mix','所需班次':'D','人员开始偏移':'5','人员结束偏移':'20'});
 const p=plan(d),m=timetable(p);for(const type of ['工装','人员','空间'])assert.ok(m.reservations.some(r=>r.type===type),JSON.stringify(p.findings));assert.deepEqual(m.reservations,p.resourceReservations);
 for(const r of m.reservations){assert.ok(r.taskIds.every(id=>m.tasks.some(t=>t.id===id)));if(r.type==='人员')assert.equal(r.end-r.start,5);}
});
test('FR033 snapshot and confirmed envelope remain byte-identical after all presentation operations and changed live inputs',()=>{
 const p=plan(executionFixture(seed));p.confirmation={status:'confirmed',digest:'frozen'};const before=JSON.stringify(p);const live=structuredClone(p.inputSnapshot);live.executionFacts[0]['工序完成数量']='90';live.downtime=[];
 const m=timetable(p);filterTasks(m.tasks,{query:'MIX',minute:999});lanes(m.tasks.filter(t=>t.start!==null));for(const t of m.tasks)projection(t,90);
 assert.equal(m.facts[0]['工序完成数量'],'40');assert.equal(JSON.stringify(p),before);assert.equal(live.executionFacts[0]['工序完成数量'],'90');
});
test('FR033 legacy missing input/reasons/quantities stay unknown; unplanned never gets timeline coordinates',()=>{
 const m=timetable({tasks:[{id:'old',machine:'M',start:0,end:30}],resultAssessment:{tasks:[{id:'missing',status:'unplanned',quantity:'0.123456789012',unit:'kg',reasons:[]}]}});
 assert.equal(m.input,undefined);assert.deepEqual(m.downtime,[]);assert.equal(m.tasks[0].quantity,null);assert.equal(m.tasks[1].start,null);assert.equal(projection(m.tasks[1],10),'未排 / 时间未知');assert.equal(m.tasks[1].quantity,'0.123456789012');
});
test('FR033 half-open boundaries, exact tiny geometry, overlapping sublanes and >24h labels',()=>{
 assert.deepEqual(clip(29.99,30,0,60,600),{left:299.9,width:0.10000000000001563});assert.equal(clip(0,30,30,60,600),null);assert.deepEqual(clip(-10,40,0,30,300),{left:0,width:300});assert.equal(clip(0,30,30,0,600),null);
 const x=lanes([{id:'b',start:15,end:45},{id:'a',start:0,end:30},{id:'c',start:30,end:60}]);assert.equal(x.count,2);assert.equal(x.items.find(t=>t.id==='c').lane,0);assert.match(timeLabel(2880),/2026-11-04 08:00/);
});
test('FR033 exact filters and cursor projection share IDs, exclude touching windows and never claim actual completion',()=>{
 const tasks=[{id:'a',orderId:'A',operation:'MIX',machine:'M',start:0,end:30,status:'scheduled',reasons:[]},{id:'b',orderId:'B',operation:'FILL',machine:'N',start:30,end:60,status:'scheduled',reasons:[]},{id:'c',orderId:'A',start:null,end:null,status:'unplanned',reasons:[]}];
 assert.deepEqual(filterTasks(tasks,{machine:'M',order:'A',query:'mix'}).map(t=>t.id),['a']);assert.deepEqual(filterTasks(tasks,{start:30,end:60,state:'scheduled'}).map(t=>t.id),['b']);assert.deepEqual(filterTasks(tasks,{state:'unplanned'}).map(t=>t.id),['c']);
 assert.match(projection(tasks[0],0),/进行中/);assert.match(projection(tasks[0],30),/已结束.*非执行事实/);assert.match(projection(tasks[0],null),/执行未知/);
});
test('WINDOW02 round1: date-safe bounds and invalid values never throw; extended ISO years retain complete dates',async()=>{
 const {validMinute,validInterval,origin}=await import('../src/lib/timetable.mjs');
 const lo=Math.ceil((-8640000000000000-origin-8*3600000)/60000),hi=Math.floor((8640000000000000-origin-8*3600000)/60000);
 for(const n of [lo,lo+1,-1,0,hi-1,hi]){assert.equal(validMinute(n),true);assert.doesNotThrow(()=>timeLabel(n));assert.ok(timeLabel(n).includes(`分钟 ${n}`));}
 for(const n of [lo-1,hi+1,1e12,-1e12,Infinity,-Infinity,NaN,null,undefined,'30']){assert.equal(validMinute(n),false);assert.doesNotThrow(()=>timeLabel(n));assert.match(timeLabel(n),/未知/);}
 assert.match(timeLabel(hi),/^\+275760-/);assert.equal(validInterval(0,1e12),false);assert.equal(clip(0,1e12,0,120,120),null);
 const p={tasks:[{id:'valid',start:0,end:30,reasons:[]},{id:'bad',start:0,end:1e12,reasons:[]}]},before=JSON.stringify(p),m=timetable(p);
 assert.deepEqual(m.extent,[0,120]);assert.deepEqual(filterTasks(m.tasks,{start:0,end:120}).map(t=>t.id),['valid','bad']);assert.match(projection(m.tasks[1],10),/时间未知/);assert.equal(JSON.stringify(p),before);
});

// AXIS-LABEL-03: independent pixel budget assertions, including negative/date bounds.
test('AXIS-LABEL-03 date labels fit at supported scales without changing geometry',async()=>{
 const {axisTicks,validMinute}=await import('../src/lib/timetable.mjs');
 for(const [start,end] of [[0,120],[-1500,3000],[0,240000],[-100000000000,100000000000],[0,0.01]]){
  for(const zoom of [0.25,1,3,8]){
   const width=Math.min(60000,(end-start)*zoom),ticks=axisTicks(start,end,width);
   if(width<152)assert.deepEqual(ticks,[]);
   for(let i=0;i<ticks.length;i++){
    const x=(ticks[i]-start)*width/(end-start);
    assert.ok(validMinute(ticks[i]));assert.ok(x>=0&&x+152<=width+1e-6);
    if(i)assert.ok((ticks[i]-ticks[i-1])*width/(end-start)>=152-1e-6);
   }
   assert.ok(ticks.length<=395);
  }
 }
});
