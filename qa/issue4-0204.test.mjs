import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './fr027-fixture.mjs';import {filesOf} from './fr013-main-fixture.mjs';
import {calendarBatch,fourKeys,nineKeys,originalKeys} from './issue4-0204-fixture.mjs';
const preview=(f,d,keys=nineKeys,revision=0)=>f.call('/imports/preview',{files:filesOf(d,keys).reverse(),revision});
async function setup(t){const f=await fixture(t);await f.ok('/calculate',{revision:0});return f;}
test('original 01+02+03+04 and all nine files resolve new cross-file calendar/machine/factory/line references atomically',async t=>{
 for(const [keys,newReferences] of [[fourKeys,false],[nineKeys,true]]){
  const f=await setup(t),d=calendarBatch({newReferences}),before=f.bytes(),r=await preview(f,d,keys);
  assert.equal(r.status,200,JSON.stringify(r));const p=r.body;assert.equal(p.valid,true,JSON.stringify(p));assert.equal(Object.keys(p.tables).length,keys.length);assert.equal(f.bytes(),before);
  assert.deepEqual(p.beforeTables.calendars,JSON.parse(before).data.calendars);assert.deepEqual(p.sources.downtime.lines,[2,4]);assert.equal(p.tables.downtime[0]['原因'],d.downtime[0]['原因']);
  const saved=await f.ok('/imports/commit',{previewId:p.id,tables:{downtime:[]},revision:99});assert.equal(saved.revision,1);
  const disk=JSON.parse(f.bytes());for(const key of keys)assert.deepEqual(disk.data[key],p.tables[key]);assert.deepEqual(disk.plans,JSON.parse(before).plans);
  assert.equal(new Set(disk.records.filter(r=>r.action==='import').map(r=>r.batchId)).size,1);assert.deepEqual((await f.ok('/state')).data,disk.data);
  const bytes=f.bytes(),again=await preview(f,d,keys,1);assert.equal(again.body.valid,true,JSON.stringify(again));assert.equal((await f.ok('/imports/commit',{previewId:again.body.id})).unchanged,true);assert.equal(f.bytes(),bytes);
 }
});
test('02/04 alone remain valid with existing references; six/seven-file combinations remain valid',async t=>{
 const f=await setup(t),d=calendarBatch();
 for(const legacy of [originalKeys.filter(k=>k!=='factoryLines'),originalKeys])for(const extra of [[],['calendars'],['downtime'],['calendars','downtime']]){const keys=[...legacy,...extra],x=structuredClone(d);if(!extra.includes('calendars'))x.machines.forEach(r=>r['日历编号']='FC01');const before=f.bytes(),r=await preview(f,x,keys);assert.equal(r.body.valid,true,JSON.stringify(r));assert.equal(f.bytes(),before);console.log('COMBINATION_PASS '+keys.join('+'));}
 const base=JSON.parse(f.bytes()).data;
 for(const key of ['calendars','downtime']){const x=structuredClone(base);x.downtime=[{'设备编号':base.machines[0]['设备编号'],'起始分钟':'30','结束分钟':'60','原因':'显式检修'}];const r=await preview(f,x,[key]);assert.equal(r.body.valid,true,JSON.stringify(r));}
});
test('mixed bad 02/04 batches: end bounds, unknown factory/machine, header/unit/malformed CSV, duplicates, existing references all prevent any store write',async t=>{
 const f=await setup(t),before=f.bytes();
 const cases=[
  ['calendar end','calendars','结束分钟',d=>d.calendars[0]['结束分钟']='0',2],
  ['calendar missing factory','calendars','工厂编号',d=>d.calendars[0]['工厂编号']='MISSING',2],
  ['downtime end','downtime','结束分钟',d=>d.downtime[1]['结束分钟']='90',4],
  ['downtime negative','downtime','起始分钟',d=>d.downtime[1]['起始分钟']='-1',4],
  ['downtime wrong device','downtime','设备编号',d=>d.downtime[1]['设备编号']='MISSING',4],
  ['calendar blank factory','calendars','工厂编号',d=>d.calendars[0]['工厂编号']='',2],
  ['downtime blank reason','downtime','原因',d=>d.downtime[1]['原因']='',4],
  ['calendar mandatory rule','rules','是否启用',d=>d.rules.find(r=>r['规则编号']==='CALENDAR')['是否启用']='否',null],
  ['calendar work flag','calendars','是否工作',d=>d.calendars[0]['是否工作']='UNKNOWN',2],
  ['mixed order unit','orders','数量单位',d=>d.orders[0]['数量单位']='吨',2],
 ];
 for(const [name,table,field,mutate,row] of cases){const d=calendarBatch({newReferences:true});mutate(d);const r=await preview(f,d);assert.equal(r.body.valid,false,name+JSON.stringify(r));assert.equal(r.body.id,undefined);assert.ok(r.body.issues.some(i=>i.table===table&&i.field===field&&(row===null||i.row===row)),name+JSON.stringify(r));assert.equal(f.bytes(),before,name);console.log('REJECTION_PASS '+name+' '+JSON.stringify(r.body.issues));}
 const d=calendarBatch(),files=filesOf(d,nineKeys),calendar=files.find(f=>f.name.startsWith('02_'));
 for(const badFiles of [[...files,calendar],files.map(f=>f===calendar?{...f,text:f.text.replace('结束分钟','错误字段')}:f),files.map(f=>f===calendar?{...f,text:f.text+'"未闭合'}:f)]){const r=await f.call('/imports/preview',{revision:0,files:badFiles});assert.ok(r.status===400||r.body.valid===false);assert.equal(f.bytes(),before);}
 const partial=await preview(f,d,['calendars','downtime']);assert.equal(partial.body.valid,false);assert.equal(f.bytes(),before);
});
test('02/04 permissions, owner, stale plans and stale revision preserve full persisted state',async t=>{
 const f=await setup(t),d=calendarBatch(),files=filesOf(d,nineKeys),before=f.bytes(),p=await f.ok('/imports/preview',{files,revision:0});
 for(const [endpoint,body,role,status] of [['/imports/preview',{files,revision:0},'query',403],['/imports/commit',{previewId:p.id},'query',403],['/imports/commit',{previewId:p.id},'supervisor',409],['/imports/preview',{files,revision:0,reason:''},'planner',400],['/imports/preview',{files,revision:99},'planner',409]]){assert.equal((await f.call(endpoint,body,role)).status,status);assert.equal(f.bytes(),before);}
 await f.ok('/calculate',{revision:0});const changed=f.bytes();assert.equal((await f.call('/imports/commit',{previewId:p.id})).body.error,'stale_preview');assert.equal(f.bytes(),changed);
});
test('imported downtime uses existing half-open intervals: end touching start accepted, overlap shifts to downtime end',async t=>{
 const f=await setup(t),state=await f.ok('/state'),plan=await f.ok('/calculate',{revision:0});
 const task=plan.tasks.find(t=>t.start===0);assert.ok(task,JSON.stringify(plan));
 const data=structuredClone(state.data);data.downtime=[{'设备编号':task.machine,'起始分钟':String(task.end),'结束分钟':String(task.end+10),'原因':'端点相接'}];
 let p=await f.ok('/imports/preview',{files:filesOf(data,['calendars','downtime']),revision:0});await f.ok('/imports/commit',{previewId:p.id});
 let next=await f.ok('/calculate',{revision:1});assert.equal(next.tasks.find(t=>t.id===task.id).start,0);
 data.downtime[0]['起始分钟']='0';data.downtime[0]['结束分钟']='10';p=await f.ok('/imports/preview',{files:filesOf(data,['downtime']),revision:1});await f.ok('/imports/commit',{previewId:p.id});next=await f.ok('/calculate',{revision:2});assert.equal(next.tasks.find(t=>t.id===task.id).start,10);
});
