import test from 'node:test';import assert from 'node:assert/strict';
import {inspectCsvBatch} from '../server/csv-batch.mjs';import {defs} from '../server/planner.ts';import {fixture} from './fr027-fixture.mjs';import {filesOf} from './fr013-main-fixture.mjs';
const fields=['是否允许拆分','需求类型','订单状态'];
const old={name:'17_生产订单与交期.csv',text:'订单编号,产品编号,产线编号,合格需求kg,要求可交付分钟,优先顺序\r\n\r\nA,HC40,L01,240,480,1\r\nB,HC60,L01,240,480,2\r\n'};
const repairs=[3,4].flatMap(row=>fields.map((field,i)=>({file:old.name,row,field,value:['否','正式订单','有效'][i]})));
test('legacy quantity keeps literal 240 and kg; six missing per-row entries have physical line provenance and no defaults',()=>{
 const p=inspectCsvBatch([old],defs);assert.equal(p.issues.length,6);assert.deepEqual(p.issues.map(e=>e.row),[3,3,3,4,4,4]);assert.equal(p.tables.orders[0]['合格需求'],'240');assert.equal(p.tables.orders[0]['数量单位'],'kg');for(const r of p.tables.orders)for(const f of fields)assert.equal(r[f],'');assert.equal(p.sources.orders.originalText,old.text);assert.equal(p.sources.orders.records[0].values['合格需求kg'],'240');assert.equal(p.sources.orders.records[0].line,3);
 const corrected=inspectCsvBatch([old],defs,repairs);assert.equal(corrected.issues.length,0);assert.deepEqual(corrected.sources.orders.repairs,repairs.map(({file,...e})=>e));
 for(const bad of [null,{},[...repairs,repairs[0]],repairs.map((e,i)=>i?e:{...e,row:2}),repairs.map((e,i)=>i?e:{...e,field:'合格需求',value:'999'})])assert.ok(inspectCsvBatch([old],defs,bad).issues.length);
 const conflict={...old,text:old.text.replace('合格需求kg','合格需求kg,数量单位').replaceAll(',240,',',240,kg,')};assert.ok(inspectCsvBatch([conflict],defs,repairs).issues.some(i=>i.field==='合格需求kg'));
});
test('legacy explicit entry commits through protected transaction; forged commit values ignored, originals audited, identical reimport is byte-identical',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const base=(await f.ok('/state')).data;
 const input=[...filesOf(base,['factoryLines','calendars','machines','routes','times','dependencies','rules','products','materials']),old];const before=f.bytes();
 const missing=await f.ok('/imports/preview',{revision:0,files:input});assert.equal(missing.valid,false);assert.equal(f.bytes(),before);
 for(const value of ['', '猜测状态']){const bad=repairs.map(e=>e.row===3&&e.field==='订单状态'?{...e,value}:e);const r=await f.call('/imports/preview',{revision:0,files:input,repairs:bad});assert.equal(r.body.valid,false);assert.equal(f.bytes(),before);}
 const p=await f.ok('/imports/preview',{revision:0,files:input,repairs});assert.equal(p.valid,true,JSON.stringify(p));assert.equal(f.bytes(),before);
 for(const [path,body,role,code] of [['/imports/preview',{revision:0,files:input,repairs},'query',403],['/imports/commit',{previewId:p.id},'query',403],['/imports/commit',{previewId:p.id},'supervisor',409],['/imports/preview',{revision:99,files:input,repairs},'planner',409]]){assert.equal((await f.call(path,body,role)).status,code);assert.equal(f.bytes(),before);}
 const saved=await f.ok('/imports/commit',{previewId:p.id,repairs:[],tables:{orders:[]}});assert.equal(saved.data.orders.length,2);assert.equal(saved.data.orders[0]['合格需求'],'240');assert.equal(saved.data.orders[0]['数量单位'],'kg');const disk=JSON.parse(f.bytes());assert.deepEqual(disk.plans,JSON.parse(before).plans);assert.equal(disk.records.find(r=>r.action==='import'&&r.target==='orders').csvSources.orders.originalText,old.text);assert.equal(disk.records.find(r=>r.action==='import'&&r.target==='orders').csvSources.orders.repairs.length,6);
 const unchanged=f.bytes(),again=await f.ok('/imports/preview',{revision:1,files:input,repairs});assert.equal((await f.ok('/imports/commit',{previewId:again.id})).unchanged,true);assert.equal(f.bytes(),unchanged);
 const stale=await f.ok('/imports/preview',{revision:1,files:input,repairs});await f.ok('/calculate',{revision:1});const changed=f.bytes();assert.equal((await f.call('/imports/commit',{previewId:stale.id})).body.error,'stale_preview');assert.equal(f.bytes(),changed);
});
test('legacy repairs retain genuine confirmed inputs/decisions; revoked membership and missing history prevent whole-batch writes',async t=>{
 const f=await fixture(t),plan=await f.ok('/calculate',{revision:0});await f.ok('/plans/'+plan.id+'/verify',{});
 const decision=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true});
 let r=await f.ok('/plans/'+plan.id+'/review');await f.ok('/plans/'+plan.id+'/submit',decision(r));r=await f.ok('/plans/'+plan.id+'/review');await f.ok('/plans/'+plan.id+'/confirm',decision(r),'supervisor');
 const original=JSON.parse(f.bytes()),files=[old];
 const p=await f.ok('/imports/preview',{revision:0,files,repairs});assert.equal(p.valid,true,JSON.stringify(p));await f.ok('/imports/commit',{previewId:p.id});const disk=JSON.parse(f.bytes());for(const k of ['plans','confirmations','workflows'])assert.deepEqual(disk[k],original[k]);assert.deepEqual(disk.inputVersions[plan.inputVersionId],original.inputVersions[plan.inputVersionId]);
 const q=await f.ok('/imports/preview',{revision:1,files,repairs}),bytes=f.bytes();await f.ok('/auth/members/remove',{key:'test#planner'},'admin');assert.equal((await f.call('/imports/commit',{previewId:q.id})).status,403);assert.equal(f.bytes(),bytes);
});
test('invalid legacy quantity and each invalid explicit enum reject with physical source file/line/field and byte-identical whole store',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const before=f.bytes();
 for(const field of fields){const entries=repairs.map(e=>e.row===3&&e.field===field?{...e,value:'未经确认的值'}:e);const r=await f.call('/imports/preview',{revision:0,files:[old],repairs:entries});assert.equal(r.body.valid,false);assert.ok(r.body.issues.some(e=>e.file===old.name&&e.row===3&&e.field===field),JSON.stringify(r));assert.equal(f.bytes(),before);}
 for(const quantity of ['', '0', '-1','NaN','1e2']){const bad={...old,text:old.text.replace('240',quantity)};const r=await f.call('/imports/preview',{revision:0,files:[bad],repairs});assert.equal(r.body.valid,false);assert.ok(r.body.issues.some(e=>e.file===old.name&&e.row===3&&e.field==='合格需求'),JSON.stringify(r));assert.equal(f.bytes(),before);}
 assert.equal((await f.call('/imports/commit',{previewId:'forged',files:[old],repairs})).status,409);assert.equal(f.bytes(),before);
});
