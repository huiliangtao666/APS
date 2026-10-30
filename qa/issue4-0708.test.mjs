import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './fr027-fixture.mjs';import {filesOf} from './fr013-main-fixture.mjs';
import {masterBatch,masterKeys,allKeys,originalKeys} from './issue4-0708-fixture.mjs';
const preview=(f,d,keys=allKeys,revision=0)=>f.call('/imports/preview',{files:filesOf(d,keys).reverse(),revision});
async function setup(t){const f=await fixture(t);await f.ok('/calculate',{revision:0});return f;}
test('07/08 separately, together and 01/02/03/04 combinations commit original fields, reopen, preserve history and reimport without additional writes',async t=>{
 for(const keys of [['products'],['materials'],masterKeys,['factoryLines','calendars','machines','downtime',...masterKeys],allKeys]){
  const f=await setup(t),d=masterBatch(),before=f.bytes(),r=await preview(f,d,keys);
  assert.equal(r.body.valid,true,JSON.stringify(r));assert.equal(f.bytes(),before);
  for(const key of keys){if(masterKeys.includes(key))assert.deepEqual(r.body.tables[key],d[key]);assert.deepEqual(r.body.beforeTables[key],JSON.parse(before).data[key]||[]);}
  const saved=await f.ok('/imports/commit',{previewId:r.body.id,tables:{products:[]},revision:99});assert.equal(saved.revision,1);
  const disk=JSON.parse(f.bytes());for(const key of keys)assert.deepEqual(disk.data[key],r.body.tables[key]);assert.deepEqual(disk.plans,JSON.parse(before).plans);assert.equal(new Set(disk.records.filter(r=>r.action==='import').map(r=>r.batchId)).size,1);assert.deepEqual((await f.ok('/state')).data,disk.data);
  const bytes=f.bytes(),again=await preview(f,d,keys,1);assert.equal(again.body.valid,true,JSON.stringify(again));assert.equal((await f.ok('/imports/commit',{previewId:again.body.id})).unchanged,true);assert.equal(f.bytes(),bytes);console.log('COMMIT_PASS '+keys.join('+'));
 }
});
test('existing six/seven categories with all 07/08 and 02/04 subsets: 32 legal combinations, unchanged storage',async t=>{
 const f=await setup(t),before=f.bytes();
 for(const legacy of [originalKeys.slice(1),originalKeys])for(const masters of [[],['products'],['materials'],masterKeys])for(const extra of [[],['calendars'],['downtime'],['calendars','downtime']]){
  const d=masterBatch(),keys=[...legacy,...masters,...extra];if(!extra.includes('calendars'))d.machines.forEach(r=>r['日历编号']='FC01');const r=await preview(f,d,keys);assert.equal(r.body.valid,true,JSON.stringify(r));assert.equal(f.bytes(),before);console.log('COMBINATION_PASS '+keys.join('+'));
 }
});
test('each master subset combined with all sixteen 01/02/03/04 subsets uses existing valid references',async t=>{
 const f=await setup(t),before=f.bytes(),base=(await f.ok('/state')).data;
 for(let mask=0;mask<16;mask++)for(const masters of [['products'],['materials'],masterKeys]){
  const d=structuredClone(base),m=masterBatch();d.products=m.products;d.materials=m.materials;
  d.factoryLines=m.factoryLines;d.downtime=[{'设备编号':'MIX01','起始分钟':'30','结束分钟':'60','原因':'显式合成停机'}];
  const keys=[...masters,...['factoryLines','calendars','machines','downtime'].filter((_,i)=>mask&(1<<i))];
  const r=await preview(f,d,keys);assert.equal(r.body.valid,true,JSON.stringify(r));assert.equal(f.bytes(),before);console.log('SUBSET_PASS '+keys.join('+'));
 }
});
test('numeric/required/duplicate/unit/reference and malformed mixed files report file physical row field reason and zero whole-store writes',async t=>{
 const f=await setup(t),before=f.bytes();
 const cases=[];
 for(const field of ['单支净重kg','每袋支数','总收率'])for(const value of ['0','-1','','NaN','Infinity','1e2'])cases.push(['products',field,value,2]);
 for(const value of ['-1','','NaN'])cases.push(['products','模拟交付等待分钟',value,2]);
 for(const field of ['物料名称','单位','类别'])cases.push(['materials',field,'',2]);
 cases.push(['products','产品编号','HC40',4],['materials','物料编号','LEAN',4],['orders','数量单位','吨',2],['routes','产品编号','MISSING',2]);
 for(const [table,field,value,row] of cases){const d=masterBatch();d[table][row===4?1:0][field]=value;const r=await preview(f,d);assert.equal(r.body.valid,false,JSON.stringify([table,field,value,r]));assert.equal(r.body.id,undefined);assert.ok(r.body.issues.some(i=>i.table===table&&i.field.includes(field)&&i.row===row&&i.file&&i.reason),JSON.stringify(r));assert.equal(f.bytes(),before);console.log('REJECTION_PASS '+JSON.stringify({table,field,value,row,issues:r.body.issues}));}
 for(const mutate of [d=>d.products=d.products.slice(1),d=>d.materials=d.materials.slice(1)]){const d=masterBatch();mutate(d);const r=await preview(f,d);assert.equal(r.body.valid,false,JSON.stringify(r));assert.equal(f.bytes(),before);console.log('REFERENCE_REJECTION '+JSON.stringify(r.body.issues));}
 const files=filesOf(masterBatch(),allKeys),product=files.find(f=>f.name.startsWith('07_'));
 for(const bad of [[...files,product],files.map(f=>f===product?{...f,text:f.text.replace('总收率','错误字段')}:f),files.map(f=>f===product?{...f,text:f.text+'"未闭合'}:f)]){const r=await f.call('/imports/preview',{revision:0,files:bad});assert.ok(r.status===400||r.body.valid===false);assert.equal(f.bytes(),before);}
});
test('CR-FR013 legal numeric values and configurable material unit/category preserved literally, with new product/material references resolving in merged batch',async t=>{
 const f=await setup(t),d=masterBatch(),before=f.bytes();
 Object.assign(d.products[0],{'单支净重kg':'.0001','每袋支数':'15','总收率':'1','模拟交付等待分钟':'0'});
 // The approved CR adds integer bags and a ratio cap; master units/categories remain explicit free text.
 Object.assign(d.materials.at(-1),{'单位':'合成自定义单位','类别':'合成自定义类别'});
 d.orders[0]['产品编号']='SYN-P07';
 for(const k of ['routes','times'])d[k].push(...d[k].filter(r=>r['产品编号']==='HC40').map(r=>({...r,'产品编号':'SYN-P07'})));
 d.dependencies.push({'订单编号':'A','工序编号':'FILL','资源类型':'物料','资源编号':'SYN-M08','需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','所需技能':''});
 const r=await preview(f,d);assert.equal(r.body.valid,true,JSON.stringify(r));assert.equal(f.bytes(),before);assert.equal(r.body.tables.materials.at(-1)['单位'],'合成自定义单位');
 console.log('EXISTING_SEMANTICS '+JSON.stringify({products:r.body.tables.products,materials:r.body.tables.materials}));
});
test('07/08 permission/reason/owner/revision/state gates use same existing protected commit',async t=>{
 const f=await setup(t),files=filesOf(masterBatch(),allKeys),before=f.bytes(),p=await f.ok('/imports/preview',{files,revision:0});
 for(const [endpoint,body,role,status] of [['/imports/preview',{files,revision:0},'query',403],['/imports/commit',{previewId:p.id},'query',403],['/imports/commit',{previewId:p.id},'supervisor',409],['/imports/preview',{files,revision:0,reason:''},'planner',400],['/imports/preview',{files,revision:99},'planner',409]]){assert.equal((await f.call(endpoint,body,role)).status,status);assert.equal(f.bytes(),before);}
 await f.ok('/calculate',{revision:0});const changed=f.bytes();assert.equal((await f.call('/imports/commit',{previewId:p.id})).body.error,'stale_preview');assert.equal(f.bytes(),changed);
});
