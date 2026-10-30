import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {defs,seed} from '../server/planner.ts';import {validateInputs} from '../server/input-validation.mjs';import {inspectCsvBatch} from '../server/csv-batch.mjs';import {related,filterRows} from '../src/lib/data-query.mjs';import {fixture} from './fr027-fixture.mjs';import {filesOf} from './fr013-main-fixture.mjs';
export const row={'工厂编号':'F01','工厂名称':'模拟工厂','产线编号':'L01','产线名称':'模拟产线','时区':'Asia/Shanghai'};
const file=rows=>({name:'01_工厂与产线配置.csv',text:'\ufeff工厂编号,工厂名称,产线编号,产线名称,时区\r\n'+rows.map(r=>Object.values(r).map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n')});
const state=()=>({...structuredClone(seed),factoryLines:[{...row}]});
test('01 explicit five fields: required/unique/IANA, reference ownership and unchanged single-line boundary',()=>{
 assert.deepEqual(validateInputs(defs,state()),[]);assert.deepEqual(validateInputs(defs,seed),[]);
 for(const field of Object.keys(row)){const d=state();d.factoryLines[0][field]='';assert.ok(validateInputs(defs,d).some(x=>x.field===field),field);}
 for(const zone of ['Mars/Olympus','+08:00','Asia/Shanghai ']){const d=state();d.factoryLines[0]['时区']=zone;assert.ok(validateInputs(defs,d).some(x=>x.field==='时区'));}
 const d=state();d.factoryLines.push({...row});assert.ok(validateInputs(defs,d).some(x=>/唯一键重复/.test(x.message)));
 d.factoryLines=[{...row},{...row,'产线编号':'L2','工厂名称':'冲突'}];assert.ok(validateInputs(defs,d).some(x=>x.field==='工厂名称'));
 d.factoryLines=[{...row},{...row,'产线编号':'L2'}];assert.deepEqual(validateInputs(defs,d),[]);d.orders[0]['产线编号']='L2';assert.ok(validateInputs(defs,d).some(x=>/单线计算/.test(x.message)));
 for(const [table,field] of [['orders','产线编号'],['machines','产线编号'],['calendars','工厂编号']]){const x=state();x[table][0][field]='UNKNOWN';assert.ok(validateInputs(defs,x).some(i=>i.table===table&&i.field===field));}
 const x=state();x.factoryLines.push({...row,'工厂编号':'F2','工厂名称':'另厂','产线编号':'L2'});x.calendars[0]['工厂编号']='F2';assert.ok(validateInputs(defs,x).some(i=>i.field==='日历编号'));
 x.factoryLines=[];assert.ok(validateInputs(defs,x).length);
});
test('01 quoted CSV and exact reference queries: factory -> line -> machines, keyword and reverse links',()=>{
 const d=state(),quoted={...row,'产线名称':'模拟,产线\n一'};const p=inspectCsvBatch([file([quoted])],defs);assert.deepEqual(p.issues,[]);assert.deepEqual(p.tables.factoryLines,[quoted]);
 assert.equal(filterRows(d,'factoryLines',{text:'模拟工厂'}).length,1);assert.equal(filterRows(d,'factoryLines',{text:'not-here'}).length,0);
 assert.equal(related(d,'factoryLines',0).filter(l=>l.table==='machines').length,d.machines.length);
 assert.ok(related(d,'machines',0).some(l=>l.table==='factoryLines'));
 assert.ok(inspectCsvBatch([{name:file([]).name,text:'工厂编号,产线编号\nF01,L1'}],defs).issues.some(x=>x.field==='时区'));
});
test('01 real API: preview-only, atomic invalid batch, repeat no-op, persisted role/edit/copy/delete and immutable confirmed snapshots',async t=>{
 const f=await fixture(t);let s=await f.ok('/state');assert.ok(!Object.hasOwn(s.data,'factoryLines'));
 const seven=filesOf({...s.data,factoryLines:[row]});assert.equal(seven.length,7);let p=await f.ok('/imports/preview',{revision:s.revision,files:seven});assert.equal(p.valid,true);assert.ok(!Object.hasOwn((await f.ok('/state')).data,'factoryLines'));
 await f.ok('/imports/commit',{previewId:p.id});s=await f.ok('/state');assert.deepEqual(s.data.factoryLines,[row]);const bytes=f.bytes();
 p=await f.ok('/imports/preview',{revision:s.revision,files:[file([row])]});assert.equal((await f.ok('/imports/commit',{previewId:p.id})).unchanged,true);assert.equal(f.bytes(),bytes);
 const orderDef=defs.find(d=>d.key==='orders'),orders=structuredClone(s.data.orders);orders[0]['优先顺序']='9';const orderFile={name:orderDef.file,text:[orderDef.fields,...orders.map(r=>orderDef.fields.map(k=>r[k]||''))].map(r=>r.join(',')).join('\r\n')};
 const bad={...row,'时区':'BAD'};p=await f.call('/imports/preview',{revision:s.revision,files:[file([bad]),orderFile]});assert.equal(p.status,400);assert.equal(p.body.valid,false);assert.ok(p.body.issues.some(i=>i.file===file([]).name&&i.row===2&&i.field==='时区'));assert.equal(f.bytes(),bytes);
 const corrected=await f.ok('/imports/preview',{revision:s.revision,files:[file([row]),orderFile]});assert.equal(corrected.valid,true);assert.equal(f.bytes(),bytes);await f.ok('/imports/commit',{previewId:corrected.id});s=await f.ok('/state');assert.equal(s.data.orders[0]['优先顺序'],'9');
 const afterBatch=f.bytes();
 for(const endpoint of ['/inputs','/tables/factoryLines','/imports/preview']){assert.equal((await f.call(endpoint,{revision:s.revision,tables:{factoryLines:[row]},rows:[row],files:[file([row])]},'query')).status,403);assert.equal(f.bytes(),afterBatch);}
 for(const role of ['planner','supervisor']){s=await f.ok('/state');const rows=[...s.data.factoryLines,{...row,'产线编号':'SPARE-'+role,'产线名称':'备用'}];await f.ok('/inputs',{revision:s.revision,tables:{factoryLines:rows},operation:'copy'},role);s=await f.ok('/state');await f.ok('/inputs',{revision:s.revision,tables:{factoryLines:[s.data.factoryLines[0]]},operation:'delete'},role);}
 s=await f.ok('/state');assert.equal((await f.call('/inputs',{revision:s.revision,tables:{factoryLines:[]}})).status,400);
 // genuine workflow; no injected confirmed plans
 const plan=await f.ok('/calculate',{revision:s.revision});await f.ok('/plans',{id:plan.id});await f.ok('/plans/'+plan.id+'/verify',{});const review=await f.ok('/plans/'+plan.id+'/review');
 const decision=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true});await f.ok('/plans/'+plan.id+'/submit',decision(review));await f.ok('/plans/'+plan.id+'/confirm',decision(await f.ok('/plans/'+plan.id+'/review')),'supervisor');
 const old=await f.ok('/plans/'+plan.id+'/inputs'),plans=await f.ok('/plans');
 s=await f.ok('/state');await f.ok('/inputs',{revision:s.revision,tables:{factoryLines:[{...row,'产线名称':'新版本名称'}]}});
 assert.deepEqual(await f.ok('/plans/'+plan.id+'/inputs'),old);assert.deepEqual(await f.ok('/plans'),plans);assert.equal(old.data.factoryLines[0]['产线名称'],row['产线名称']);
 assert.equal(JSON.parse(fs.readFileSync(f.dir+'/business.json')).data.factoryLines[0]['产线名称'],'新版本名称');
});
