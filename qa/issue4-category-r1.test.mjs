import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';import {defs,seed} from '../server/planner.ts';import {filesOf} from './fr013-main-fixture.mjs';
const raw=id=>fs.readFileSync(new URL('./issue4-category-r1/REPRO-'+id+'.csv',import.meta.url),'utf8');
const request=(text=raw('PRE01'),revision=0,table='calendars')=>({table,revision,files:[{name:'REPRO-PRE01.csv',text}]});
async function setup(t){const f=await fixture(t);await f.ok('/calculate',{revision:0});return f;}
test('PM exact reproduction bytes retain their verified hashes',()=>{
 for(const [id,n,h] of [['PRE01',207,'70621bee24dd68d8dc68c84162b954ce6c2497f47312e62acb0b2f2f9f47cb21'],['LOC01',205,'794272042096d64290e4a6faded6d11a6074ed57e8f3c287bfbff4542117ac24']]){const b=Buffer.from(raw(id));assert.equal(b.length,n);assert.equal(createHash('sha256').update(b).digest('hex'),h);}
});
test('PRE01 preview has complete cells and physical lines; zero writes until owned confirmation, then atomic replacement and no duplicates',async t=>{
 const f=await setup(t),before=f.bytes(),p=await f.ok('/imports/preview',request());assert.equal(p.valid,true);assert.equal(f.bytes(),before);assert.deepEqual(p.sources.calendars.lines,[2,4]);assert.equal(p.tables.calendars[0]['说明'],'第一行说明\n第二段说明');
 const saved=await f.ok('/imports/commit',{previewId:p.id,tables:{calendars:[]},table:'orders',revision:99});assert.equal(saved.revision,1);assert.equal(saved.data.calendars[1]['日历编号'],'TEST-SECOND');const s=JSON.parse(f.bytes());assert.deepEqual(s.data.calendars,p.tables.calendars);assert.deepEqual(s.plans,JSON.parse(before).plans);assert.equal(s.records.at(-1).action,'import');assert.equal(s.records.at(-1).actor,'test#planner');assert.ok(s.inputVersions[s.records.at(-1).toVersion]);
 const bytes=f.bytes(),repeat=await f.ok('/imports/preview',request(raw('PRE01'),1));assert.equal((await f.ok('/imports/commit',{previewId:repeat.id})).unchanged,true);assert.equal(f.bytes(),bytes);assert.equal((await f.call('/imports/commit',{previewId:p.id})).status,409);
});
test('LOC01 multiline LF, CRLF, CR and blank lines report original filename physical row field reason, with byte-identical entire store',async t=>{
 const f=await setup(t),before=f.bytes();
 for(const [text,line] of [[raw('LOC01'),4],[raw('LOC01').replaceAll('\r\n','\n').replaceAll('\n','\r\n'),4],[raw('LOC01').replaceAll('\r\n','\n').replaceAll('\n','\r'),4],['\n'+raw('LOC01'),5]]){
  const body=request(text);body.files[0].name='REPRO-LOC01.csv';const r=await f.call('/imports/preview',body);assert.equal(r.status,400);const error=r.body.issues.find(i=>i.table==='calendars'&&i.field==='结束分钟');assert.equal(error.row,line);assert.equal(error.file,'REPRO-LOC01.csv');assert.match(error.message,/大于/);assert.equal(r.body.id,undefined);assert.equal(f.bytes(),before);
 }
});
test('single CSV syntax/header/shape and business failures write nothing, and raw values remain literal',async t=>{
 const f=await setup(t),before=f.bytes();
 for(const text of [raw('PRE01').replace('结束分钟','不存在字段'),raw('PRE01').replace('"工厂编号"','"日历编号"'),raw('PRE01').slice(0,-5),raw('PRE01').replace('"600"','"600", "extra"'),raw('PRE01').replaceAll('"是"','"UNKNOWN"')]){const r=await f.call('/imports/preview',request(text));assert.ok(r.status===400||r.body.valid===false);assert.equal(f.bytes(),before);assert.equal(r.body.id,undefined);}
 const p=await f.ok('/imports/preview',request(raw('PRE01').replace('独立非法结束','  spaces  ')));assert.equal(f.bytes(),before);assert.equal(p.tables.calendars[1]['说明'],'  spaces  ');
});
test('preview ownership, permission, reason, stale input/state and unsupported single target gates do not write',async t=>{
 const f=await setup(t),before=f.bytes(),p=await f.ok('/imports/preview',request());
 for(const [endpoint,body,role,status] of [['/imports/preview',request(),'query',403],['/imports/commit',{previewId:p.id},'query',403],['/imports/commit',{previewId:p.id},'supervisor',409],['/imports/preview',{...request(),reason:''},'planner',400],['/imports/preview',request(raw('PRE01'),99),'planner',409],['/imports/preview',request(raw('PRE01'),0,'factoryLines'),'planner',400],['/imports/preview',request(raw('PRE01'),0,'unknown'),'planner',400]]){assert.equal((await f.call(endpoint,body,role)).status,status);assert.equal(f.bytes(),before);}
 await f.ok('/calculate',{revision:0});const changed=f.bytes();assert.equal((await f.call('/imports/commit',{previewId:p.id})).body.error,'stale_preview');assert.equal(f.bytes(),changed);
});
test('all currently valid single-table contracts preview their original fields; batch remains seven-file and rejects calendar category',async t=>{
 const f=await setup(t),s=await f.ok('/state'),before=f.bytes();
 for(const def of defs.filter(d=>d.key!=='factoryLines'&&(s.data[d.key]||[]).length)){
  const file=filesOf(s.data,[def.key])[0],p=await f.call('/imports/preview',{table:def.key,revision:0,files:[file]});assert.equal(p.status,200,def.key+JSON.stringify(p));assert.equal(p.body.valid,true,def.key+JSON.stringify(p.body.issues));assert.equal(f.bytes(),before);
 }
 const invalid=await f.ok('/imports/preview',{files:[{name:'02_工厂工作日历.csv',text:raw('PRE01')}],revision:0});assert.equal(invalid.valid,false);assert.equal(f.bytes(),before);
 const d=structuredClone(seed);d.orders[0]['优先顺序']='8';const six=await f.ok('/imports/preview',{revision:0,files:filesOf(d)});assert.equal(six.valid,true);assert.equal(f.bytes(),before);d.factoryLines=[{'工厂编号':'F01','工厂名称':'模拟工厂','产线编号':'L01','产线名称':'模拟产线','时区':'Asia/Shanghai'}];const files=filesOf(d);assert.equal(files.length,7);const p=await f.ok('/imports/preview',{revision:0,files});assert.equal(p.valid,true);assert.equal(f.bytes(),before);assert.equal((await f.ok('/imports/commit',{previewId:p.id})).revision,1);
});
