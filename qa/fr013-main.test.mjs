import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fixture} from './fr027-fixture.mjs';import {defs,seed} from '../server/planner.ts';import {inspectCsvBatch,batchKeys} from '../server/csv-batch.mjs';import {executionFixture} from './execution-fixture.mjs';
import {filesOf} from './fr013-main-fixture.mjs';
const preview=(f,data,revision=0)=>f.call('/imports/preview',{revision,files:filesOf(data)});
const snapshot=f=>fs.existsSync(path.join(f.dir,'business.json'))?f.bytes():null;
test('main batch valid six-table preview writes nothing, commit persists one version and trusted audit; repeat no-op',async t=>{
 const f=await fixture(t),data=structuredClone(seed);data.orders[0]['优先顺序']='7';const before=snapshot(f),p=await preview(f,data);assert.equal(p.status,200);assert.equal(p.body.valid,true,JSON.stringify(p.body));assert.equal(snapshot(f),before);
 const r=await f.call('/imports/commit',{previewId:p.body.id,tables:{orders:[]},actor:'forged',revision:999});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.revision,1);assert.deepEqual(r.body.data.orders,inspectCsvBatch(filesOf(data),defs).tables.orders);const log=await f.ok('/operations');assert.ok(log.length);assert.ok(log.every(x=>x.actor==='test#planner'&&x.reason&&x.batchId));assert.equal(new Set(log.map(x=>x.batchId)).size,1);
 const bytes=snapshot(f),again=await preview(f,data,1);assert.equal(again.body.valid,true);const repeat=await f.ok('/imports/commit',{previewId:again.body.id});assert.equal(repeat.unchanged,true);assert.equal(snapshot(f),bytes);assert.equal((await f.call('/imports/commit',{previewId:again.body.id})).status,409);
});
test('DEF01..03 whitespace required fields and DEF04 multiline errors reject whole batch byte-for-byte',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const before=snapshot(f);
 for(const [table,field] of [['orders','合格需求'],['times','固定分钟'],['rules','是否启用']]){const d=structuredClone(seed);if(table==='times')d.times[0]['计算方式']='固定';d[table][0][field]=' \t ';const p=await preview(f,d);assert.equal(p.body.valid,false,JSON.stringify(p.body));assert.ok(p.body.issues.some(x=>x.field===field));assert.equal(snapshot(f),before);}
 const d=structuredClone(seed);d.machines[0]['设备名称']='模拟,"引号"\r\n第二物理行';d.machines[1]['最大装载kg']='bad';const p=await preview(f,d);assert.equal(p.status,400,JSON.stringify(p));assert.ok(p.body.issues.some(x=>x.file===defs.find(x=>x.key==='machines').file&&x.row===4&&x.field==='最大装载kg'));assert.equal(snapshot(f),before);
});
test('strict syntax/headers, legacy contract and duplicate file rejection preserve original text and physical rows',()=>{
 const d=structuredClone(seed);d.machines[0]['设备名称']='模拟\r第二行';d.machines[1]['最大装载kg']='bad';const files=filesOf(d),scan=inspectCsvBatch(files,defs);assert.equal(scan.sources.machines.lines[1],4);assert.equal(scan.tables.machines[0]['设备名称'],d.machines[0]['设备名称']);
 const order=files.find(f=>f.name.startsWith('17_'));for(const text of [order.text.replace('合格需求','合格需求kg'),order.text.replace('"订单编号"','"订单编号","订单编号"'),order.text+'"未闭合',order.text.replace('"7"','"7"坏值')].slice(0,3))assert.ok(inspectCsvBatch([{...order,text}],defs).issues.length);
 assert.ok(inspectCsvBatch([order,order],defs).issues.some(x=>/重复表/.test(x.reason)));
 const spaced=filesOf(seed).map(f=>({...f,text:f.text.replaceAll('",','"  ,')}));assert.equal(inspectCsvBatch(spaced,defs).issues.length,0);
});
test('cross-batch dependencies resolve new names regardless file order; invalid reference/unit/date/duplicate rejects atomically then correction works',async t=>{
 const f=await fixture(t);const d=structuredClone(seed),old=d.orders[0]['订单编号'];d.orders[0]['订单编号']='NEW';d.dependencies.filter(r=>r['订单编号']===old).forEach(r=>r['订单编号']='NEW');
 for(const mutate of [x=>x.dependencies[0]['订单编号']='NO_SUCH_ORDER',x=>x.orders[0]['数量单位']='吨',x=>x.rules[0]['生效时间']='2026-02-30T08:00:00+08:00',x=>x.orders.push({...x.orders[0]})]){const bad=structuredClone(d);mutate(bad);const bytes=snapshot(f),p=await preview(f,bad);assert.ok(p.body.valid===false,JSON.stringify(p));assert.equal(snapshot(f),bytes);}
 const p=await f.ok('/imports/preview',{revision:0,files:filesOf(d).reverse()});assert.equal(p.valid,true,JSON.stringify(p));await f.ok('/imports/commit',{previewId:p.id});assert.equal((await f.ok('/state')).data.orders[0]['订单编号'],'NEW');
});
test('query role/spoof/csrf/reason/owner/consumed preview protections never mutate persisted state',async t=>{
 const f=await fixture(t),files=filesOf(seed);await f.ok('/calculate',{revision:0});const bytes=snapshot(f),p=await f.ok('/imports/preview',{files,revision:0});
 for(const route of ['/imports/preview','/imports/commit']){const body={files,revision:0,previewId:p.id,role:'supervisor',actor:'fake'};assert.equal((await f.call(route,body,'query',{'x-role':'supervisor'})).status,403);assert.equal((await f.call(route,{...body,reason:''})).status,400);assert.equal((await f.call(route,body,'planner',{origin:'https://evil.example'})).status,403);}
 assert.equal((await f.call('/imports/commit',{previewId:p.id},'supervisor')).status,409);assert.equal(snapshot(f),bytes);
});
test('stale previews cover revision, current state and plans/audit even when input revision unchanged; unknown token rejects',async t=>{
 const f=await fixture(t),p=await f.ok('/imports/preview',{files:filesOf(seed),revision:0});await f.ok('/calculate',{revision:0});const bytes=snapshot(f);assert.equal((await f.call('/imports/commit',{previewId:p.id})).body.error,'stale_preview');assert.equal(snapshot(f),bytes);
 const q=await f.ok('/imports/preview',{files:filesOf(seed),revision:0});const data=structuredClone(seed);data.orders[0]['优先顺序']='9';await f.ok('/inputs',{revision:0,tables:{orders:data.orders}});assert.equal((await f.call('/imports/commit',{previewId:q.id})).status,409);assert.equal((await preview(f,seed,0)).status,409);
});
test('confirmed history missing returns409, valid immutable snapshot and originals survive batch import',async t=>{
 const f=await fixture(t),plan=await f.ok('/calculate',{revision:0});let s=JSON.parse(f.bytes());s.plans[0].status='confirmed';fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(s));const original=f.bytes(),d=structuredClone(seed);d.orders[0]['优先顺序']='9';const p=await f.ok('/imports/preview',{files:filesOf(d),revision:0});assert.equal(p.valid,true,JSON.stringify(p));await f.ok('/imports/commit',{previewId:p.id});s=JSON.parse(f.bytes());const old=JSON.parse(original);assert.deepEqual(s.plans,old.plans);assert.deepEqual(s.inputVersions[plan.inputVersionId],old.inputVersions[plan.inputVersionId]);
 delete s.inputVersions;fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(s));const bytes=f.bytes();const bad=await preview(f,d,1);assert.equal(bad.status,409);assert.equal(bad.body.error,'protected_history_unavailable');assert.equal(f.bytes(),bytes);
});
test('current execution facts block rebasing 409, invalid CSV 400 and valid changes preserve fact bytes',async t=>{
 const f=await fixture(t),d=executionFixture(seed);await f.ok('/inputs',{revision:0,tables:d});const before=f.bytes(),bad=structuredClone(d);bad.orders[0]['数量单位']='吨';const p=await preview(f,bad,1);assert.equal(p.status,409,JSON.stringify(p));assert.equal(p.body.error,'execution_reconciliation_required');assert.equal(f.bytes(),before);
 const good=structuredClone(d);good.orders[0]['优先顺序']='8';const q=await preview(f,good,1);assert.equal(q.body.valid,true,JSON.stringify(q));await f.ok('/imports/commit',{previewId:q.body.id});const after=JSON.parse(f.bytes());for(const key of ['executionFacts','executionMaterials','executionSources'])assert.deepEqual(after.data[key],JSON.parse(before).data[key]);
});
test('predecessor cycle and time references keep physical coordinates for actionable main editor',async t=>{
 const f=await fixture(t),d=structuredClone(seed);d.routes[0]['工序名称']='模拟\n第二行';d.routes[1]['前序工序']='NO_SUCH_PREDECESSOR';let p=await preview(f,d);assert.equal(p.body.valid,false);assert.ok(p.body.issues.some(x=>x.table==='routes'&&x.row===4&&x.field==='前序工序'),JSON.stringify(p.body.issues));
 const cycle=structuredClone(seed);cycle.routes[0]['前序工序']=cycle.routes[1]['工序编号'];p=await preview(f,cycle);assert.equal(p.body.valid,false);assert.ok(p.body.issues.some(x=>x.table==='routes'&&x.row>=2&&x.field==='前序工序'));assert.equal(snapshot(f),null);
});
test('real persisted confirm workflow survives batch import, and revoked membership blocks commit403',async t=>{
 const f=await fixture(t),plan=await f.ok('/calculate',{revision:0});await f.ok('/plans/'+plan.id+'/verify',{});
 const decision=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true});
 let r=await f.ok('/plans/'+plan.id+'/review');await f.ok('/plans/'+plan.id+'/submit',decision(r));r=await f.ok('/plans/'+plan.id+'/review');await f.ok('/plans/'+plan.id+'/confirm',decision(r),'supervisor');const original=JSON.parse(f.bytes()),d=structuredClone((await f.ok('/state')).data);d.orders[0]['优先顺序']='7';const p=await f.ok('/imports/preview',{files:filesOf(d),revision:0});assert.equal(p.valid,true);await f.ok('/imports/commit',{previewId:p.id});const disk=JSON.parse(f.bytes());assert.deepEqual(disk.confirmations,original.confirmations);assert.deepEqual(disk.plans,original.plans);assert.deepEqual(disk.inputVersions[plan.inputVersionId],original.inputVersions[plan.inputVersionId]);
 const q=await f.ok('/imports/preview',{files:filesOf(d),revision:1});const bytes=f.bytes();await f.ok('/auth/members/remove',{key:'test#planner'},'admin');assert.equal((await f.call('/imports/commit',{previewId:q.id})).status,403);assert.equal(f.bytes(),bytes);
});
