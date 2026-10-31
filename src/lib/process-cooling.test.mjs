import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {scheduleCoolingPairs} from './process-cooling.mjs';
import {prepareCoolingMembers,proposeProcessCooling} from './process-cooling-adapter.mjs';
import {b4Fixture} from '../../qa/b4-fixture.mjs';
import {checkCooling} from '../../qa/b4-oracle.mjs';

const snapshots=[];
const f=id=>b4Fixture(id);
const prepare=x=>{const p=prepareCoolingMembers(x);assert.deepEqual(p.findings,[]);return p.members;};
const run=(members,options={})=>scheduleCoolingPairs({members,endMinute:600,...options});
const legal=(members,p,options={})=>assert.deepEqual(checkCooling(members,p,options),[]);
const op=(p,name)=>p.tasks.filter(t=>t.operation===name);

test('B4-01 UAT12 shifts heat rather than leaving a 30 minute wait',()=>{
 const x=f('12'),before=JSON.stringify(x),members=prepare(x),p=proposeProcessCooling(x);
 assert.deepEqual(p.findings,[]);legal(members,p);assert.equal(op(p,'HEAT')[0].start,90);assert.equal(op(p,'COOL')[0].start,210);assert.equal(op(p,'HEAT')[0].duration,120);
 assert.ok(p.attempts.some(a=>a.code==='SHIFT_UPSTREAM'&&a.coolStart-a.heatEnd===30));assert.equal(JSON.stringify(x),before);
 snapshots.push({id:'B4-01',fixture:x.provenance,members,proposal:p});
});

test('B4-02 UAT13 500kg input / 480kg output shares one furnace and cools simultaneously',()=>{
 const x=f('13'),members=prepare(x),p=proposeProcessCooling(x);assert.deepEqual(p.findings,[]);legal(members,p);
 assert.equal(p.groups.length,1);assert.equal(p.groups[0].exactInputKg.numerator,'500');assert.equal(p.groups[0].exactOutputKg.numerator,'480');
 assert.equal(new Set(op(p,'HEAT').map(t=>t.resourceBatchId)).size,1);assert.equal(new Set(op(p,'COOL').map(t=>t.start)).size,1);assert.equal(new Set(p.tasks.map(t=>t.productionBatchId)).size,2);
 assert.equal(p.reservations.filter(r=>r.resource==='machine:HEAT01').length,1);snapshots.push({id:'B4-02',fixture:x.provenance,members,proposal:p});
});

test('B4-03 UAT14 400kg space splits heat, preserves wait10 and fixed program duration',()=>{
 const x=f('14'),members=prepare(x),p=proposeProcessCooling(x);assert.deepEqual(p.findings,[]);legal(members,p);
 assert.equal(p.groups.length,2);assert.ok(p.attempts.some(a=>a.code==='COOL_GROUP_CAPACITY'));assert.ok(op(p,'HEAT').every(t=>t.duration===120));
 const [a,b]=op(p,'HEAT');assert.ok(a.end<=b.start||b.end<=a.start);snapshots.push({id:'B4-03',fixture:x.provenance,members,proposal:p});
});

test('B4-04 oracle rejects candidate 30min wait; exact10 legal and 11 illegal',()=>{
 const members=prepare(f('12')),p=run(members),bad=structuredClone(p);op(bad,'HEAT')[0].start=60;op(bad,'HEAT')[0].end=180;
 assert.ok(checkCooling(members,bad).some(e=>e.code==='WAIT_OR_PRECEDENCE'));
 const boundary=structuredClone(p);op(boundary,'HEAT')[0].start=80;op(boundary,'HEAT')[0].end=200;
 const h=boundary.reservations.find(r=>r.resource==='machine:HEAT01');h.start=80;h.end=200;legal(members,boundary);
 op(boundary,'HEAT')[0].start--;op(boundary,'HEAT')[0].end--;assert.ok(checkCooling(members,boundary).some(e=>e.code==='WAIT_OR_PRECEDENCE'));
});

test('B4-05 output capacity exact boundary and half-open release; late starts checked',()=>{
 const members=prepare(f('13'));
 const busy=[{resource:'space:COLD',quantity:'1',start:220,end:240}];
 const p=run(members,{reservations:busy});legal(members,p,{reservations:busy});assert.ok(op(p,'COOL').every(t=>t.start>=240));
 assert.ok(p.attempts.some(a=>a.code==='SHIFT_UPSTREAM'));
 const single=members.slice(0,1);single[0].spaceCapacityKg='240';const ends=[{resource:'space:COLD',quantity:'240',start:0,end:180}];
 const exact=run(single,{reservations:ends});legal(single,exact,{reservations:ends});assert.equal(op(exact,'COOL')[0].start,180);
});

test('B4-06 positive finite scheduling grid independently scans all constraints',()=>{
 let cases=0;
 for(const cap of ['239.99','240','399.99','400','479.99','480','500'])for(const wait of [0,10,60])for(const blockEnd of [0,210]){
  const members=prepare(f('13'));for(const m of members){m.spaceCapacityKg=cap;m.maxWait=wait;}
  const reservations=blockEnd?[{resource:'space:COLD',quantity:cap,start:150,end:blockEnd}]:[];
  const p=run(members,{reservations});legal(members,p,{reservations,complete:Number(cap)>=240});
  if(Number(cap)<240){assert.equal(p.tasks.length,0);assert.equal(p.reservations.length,0);assert.ok(p.findings.length);}
  else {assert.equal(p.tasks.length,4);assert.deepEqual(p.findings,[]);}
  if(Number(cap)<480&&Number(cap)>=240&&wait<60)assert.equal(p.groups.length,2);
  cases++;
 }
 assert.equal(cases,42);snapshots.push({id:'B4-06',cases});
});

test('B4-07 independent oracle detects tampered quantities, grouping, identity, duration, windows and ledgers',()=>{
 const members=prepare(f('13')),p=run(members);
 const mutations=[
  x=>x.tasks.pop(),x=>x.tasks.push({...x.tasks[0]}),x=>x.tasks[0].productionBatchId='ALIEN',
  x=>x.tasks[0].orderId='ALIEN',x=>x.tasks[0].program='OTHER',x=>x.tasks[0].end--,
  x=>x.tasks[0].start=-1,x=>x.tasks[0].exactLoadKg.numerator='249',
  x=>x.tasks[1].exactQuantity.numerator='250',x=>x.groups[0].exactInputKg.numerator='499',
  x=>x.groups[0].memberIds.pop(),x=>x.reservations=[],x=>x.tasks[1].predecessor='WRONG'
 ];
 for(const change of mutations){const x=structuredClone(p);change(x);assert.ok(checkCooling(members,x).length,change.toString());}
 const smaller=structuredClone(members);smaller.forEach(m=>m.spaceCapacityKg='400');assert.ok(checkCooling(smaller,p).some(e=>e.code==='OCCUPANCY'));
 const tiny=structuredClone(members);tiny.forEach(m=>m.maximumInputKg='499.99');assert.ok(checkCooling(tiny,p).some(e=>e.code==='HEAT_CAPACITY'));
 snapshots.push({id:'B4-07',mutations:mutations.length+2});
});

test('B4-08 incompatible program, recipe or route never shares a resource batch',()=>{
 for(const field of ['program','recipeKey','routeKey','productId']){const members=prepare(f('13'));members[1][field]+='-different';const p=run(members);legal(members,p);assert.equal(p.groups.length,2);}
});

test('B4-09 horizon/calendar/under-min never emits half a pair or artificial production',()=>{
 const members=prepare(f('12'));
 let p=run(members,{endMinute:250});assert.equal(p.tasks.length,0);assert.equal(p.reservations.length,0);assert.ok(p.findings.length);
 members[0].heatWindows=[[0,100],[100,200]];p=run(members);assert.equal(p.tasks.length,0);assert.ok(p.findings.length);
 members[0].heatWindows=[[0,600]];members[0].minimumInputKg='300';p=run(members);assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.code.includes('HEAT_LOAD')));
 members[0].minimumInputKg='0';members[0].maximumInputKg='249.99';p=run(members);assert.equal(p.tasks.length,0);assert.equal(p.groups.length,0);
});

test('B4-10 shared cooling machine splits furnace; no unexplained overlap',()=>{
 const members=prepare(f('13'));members[1].coolMachine=members[0].coolMachine;
 const p=run(members);legal(members,p);assert.equal(p.groups.length,2);assert.ok(p.attempts.some(a=>a.code==='COOL_MACHINE'));
});

test('B4-11 adapter rejects undecided nonkg/load nodes, missing facts and conflicting capacity atomically',()=>{
 const mutations=[
  x=>x.productionBatches[0].unit='袋',x=>delete x.productionBatches[0].inputKg,
  x=>x.productionBatches[0].qualifiedKg.numerator='241',x=>x.data.machines.find(m=>m['设备编号']==='HEAT01')['装载计量基准']='任意中间节点',
  x=>x.data.batchResources.find(m=>m['资源编号']==='COLD')['单位']='位置',
  x=>x.data.routes.find(r=>r['工序编号']==='COOL')['最大等待分钟']='',
  x=>x.data.times.find(r=>r['工序编号']==='HEAT')['固定分钟']='0',
  x=>x.data.batchResources.find(m=>m['资源编号']==='HEAT01')['允许程序']='OTHER',
  x=>x.data.dependencies.find(r=>r['资源类型']==='空间')['后延占用分钟']='1',
  x=>x.data.bom=[],x=>x.upstreamTasks=[],
  x=>x.data.batchResources.find(m=>m['资源编号']==='HEAT01')['容量']='501'
 ];
 for(const change of mutations){const x=f('13');change(x);const before=JSON.stringify(x),p=proposeProcessCooling(x);assert.ok(p.findings.length,change.toString());assert.equal(p.tasks.length,0);assert.equal(p.reservations.length,0);assert.equal(JSON.stringify(x),before);}
 const members=prepare(f('13'));members[1].spaceCapacityKg='400';assert.equal(run(members).tasks.length,0);
 snapshots.push({id:'B4-11',guardCases:mutations.length+1});
});

test('B4-12 source IDs are configured; no HEAT/COOL name matching',()=>{
 const x=f('13');
 for(const table of ['routes','times','machines','dependencies'])for(const r of x.data[table])for(const key of ['工序编号','前序工序'])if(r[key])r[key]=({HEAT:'STERILIZE-X',COOL:'CHILL-Y'})[r[key]]||r[key];
 const members=prepare(x),p=proposeProcessCooling(x);legal(members,p);assert.equal(op(p,'STERILIZE-X').length,2);assert.equal(op(p,'CHILL-Y').length,2);
});

test('B4-13 module Worker yields same immutable process proposal; not application Worker integration',async()=>{
 const x=f('14'),worker=new Worker(new URL('../../qa/b4-unit-worker.mjs',import.meta.url),{workerData:x});
 const p=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code)reject(Error('Worker '+code));});});
 assert.deepEqual(p,proposeProcessCooling(x));legal(prepare(x),p);snapshots.push({id:'B4-13',worker:'isolated module worker_threads; application calculation-worker pending'});
});

test('B4-14 frozen module proposal JSON roundtrip and export fields preserve input/output bases',()=>{
 const x=f('13'),p=proposeProcessCooling(x),saved=JSON.stringify({input:x,proposal:p}),reopened=JSON.parse(saved);
 x.data.batchResources.find(r=>r['资源编号']==='COLD')['容量']='400';const newer=proposeProcessCooling(x);
 assert.equal(newer.groups.length,2);assert.equal(reopened.proposal.groups.length,1);assert.equal(reopened.input.data.batchResources.find(r=>r['资源编号']==='COLD')['容量'],'480');
 const exported=reopened.proposal.tasks.map(t=>[t.orderId,t.productionBatchId,t.operation,t.start,t.end,t.loadBasis,t.exactLoadKg.numerator,t.exactQuantity.numerator].join(',')).join('\n');
 assert.match(exported,/BOM总投入,250,240/);assert.match(exported,/合格产出,240,240/);assert.equal(JSON.stringify(reopened),saved);
 snapshots.push({id:'B4-14',scope:'module JSON/export only; real application save/reopen/native CSV blocked by integration'});
});

test('B4-15 UAT17 R6 reference arithmetic is 290+60=350, delay260; not current R4 gate',()=>{
 const x=f('17'),p=proposeProcessCooling(x);legal(prepare(x),p);
 const expectedDurations=[30,30,120,60,50],route=expectedDurations.reduce((a,b)=>a+b,0),wait=Number(x.data.products.find(r=>r['产品编号']==='HC40')['模拟交付等待分钟']),due=Number(x.data.orders[0]['要求可交付分钟']);
 assert.equal(route,290);assert.equal(wait,60);assert.equal(route+wait,350);assert.equal(due,90);assert.equal(route+wait-due,260);
 snapshots.push({id:'B4-15',scope:'independent baseline/reference arithmetic only, packing50 explicit fixture; real full route/delivery assessment pending integration, R6 later stage',routeMinutes:route,waitMinutes:wait,referenceDeliverableMinute:350,referenceDeliverableLocal:'13:50',delayMinutes:260});
});

test.after(()=>{if(process.env.B4_EVIDENCE){fs.mkdirSync(process.env.B4_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.B4_EVIDENCE,'b4-unit-results.json'),JSON.stringify(snapshots,null,2));}});
