import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {validateSingleLineScope} from '../src/lib/line-scope.mjs';
import {validateMasterData} from '../src/lib/master-data.mjs';import {validateOrders} from '../src/lib/orders.mjs';
import {sourceRefs,bindProblemSource,currentRecord,attachProblemRecords} from '../src/lib/problem-records.mjs';
import {calculate,seed,defs} from '../server/planner.ts';import {validateInputs} from '../server/input-validation.mjs';
import {freezeRunInput,inputHash} from '../server/run-input.mjs';import {fixture} from './fr027-fixture.mjs';
const source=(data,extra={})=>({domain:'current',inputVersionId:inputHash(data),revision:1,checkedAt:'2026-10-01T00:00:00Z',...extra});
const bound=(data,table,rows=data[table])=>bindProblemSource({relatedRecords:sourceRefs(table,rows,data[table])},source(data)).relatedRecords;
const context=data=>({inputVersionId:inputHash(data),operations:[]});
test('U1 required/value only actual products/materials row; original empty and multiline values unchanged',()=>{
 const d=structuredClone(seed);d.products[0]['产品名称']='';d.products[0]['单支净重kg']='bad';d.materials[0]['物料名称']='原\n始';
 const f=validateMasterData(d),required=f.find(f=>f.field==='产品名称'),value=f.find(f=>f.code.endsWith('MASTER_VALUE'));
 for(const x of [required,value]){assert.equal(x.relatedRecords.length,1);assert.deepEqual(x.relatedRecords[0].row,d.products[0]);assert.equal(x.relatedRecords[0].occurrence.index,0);}
 assert.equal(required.relatedRecords[0].row['产品名称'],'');assert.deepEqual(d.materials[0]['物料名称'],'原\n始');
});
test('U1 duplicate complete groups retain two byte-identical occurrences, including empty keys',()=>{
 for(const table of ['products','materials','orders']){
  const d=structuredClone(seed);d[table]=[d[table][0],structuredClone(d[table][0])];
  const f=table==='orders'?validateOrders(d.orders).find(f=>f.code==='ORDER_DUPLICATE'):validateMasterData(d).find(f=>f.table===table&&f.code.endsWith('MASTER_DUPLICATE'));
  assert.deepEqual(f.relatedRecords.map(r=>r.occurrence.index),[0,1]);assert.ok(f.relatedRecords.every(r=>r.occurrence.keyCount===2));
  const refs=bindProblemSource(f,source(d)).relatedRecords,current=structuredClone(d);current[table].pop();
  for(const ref of refs)assert.equal(currentRecord(ref,current,context(current)),null);
 }
 const d={orders:[{'订单编号':''},{'订单编号':''}]},refs=bound(d,'orders');assert.deepEqual(refs.map(r=>r.origin.occurrence.index),[0,1]);for(const ref of refs)assert.equal(currentRecord(ref,d,context(d)),null);
});
test('U1 missing product/material reference returns only actual referrer; absent target remains metadata',()=>{
 const d=structuredClone(seed);d.orders[1]['产品编号']='MISSING';d.routes[0]['产品编号']='';d.dependencies[0]['资源类型']='物料';d.dependencies[0]['资源编号']='ABSENT';
 const f=validateMasterData(d).filter(f=>f.code.includes('REFERENCE'));
 assert.equal(f.length,3);assert.deepEqual(f.map(f=>f.relatedRecords[0].table),['orders','routes','dependencies']);assert.equal(f[0].missingTarget.key,'MISSING');assert.ok(f.every(f=>f.relatedRecords.length===1));
 assert.ok(f.every(f=>!f.relatedRecords.some(r=>['products','materials'].includes(r.table))));
});
test('U1 every orders finding carries actual participant; aggregate and duplicate groups complete',()=>{
 const rows=[{...seed.orders[0],'订单编号':'X','合格需求':'-1','产线编号':''},{...seed.orders[0],'订单编号':'X','订单状态':'BAD','产线编号':'L2'},{...seed.orders[0],'订单编号':'Y','产线编号':'L3'}];
 for(const f of validateOrders(rows)){assert.ok(f.relatedRecords.length);for(const r of f.relatedRecords)assert.deepEqual(r.row,rows[r.occurrence.index]);}
 assert.equal(validateOrders(rows).find(f=>f.code==='ORDER_MULTI_LINE').relatedRecords.length,3);
 const d={...structuredClone(seed),orders:rows};const issues=validateInputs(defs,d);const duplicate=issues.find(f=>f.table==='orders'&&f.message==='唯一键重复');assert.deepEqual(duplicate.relatedRecords.map(r=>r.occurrence.index),[0,1]);
});
test('U1 collect/planner retain producer metadata and filtered/sorted original occurrence',()=>{
 const d=structuredClone(seed);d.products[0]['产品名称']='';
 const raw=validateMasterData(d).find(f=>f.field==='产品名称'),collected=validateInputs(defs,d).find(f=>f.code===raw.code&&f.field===raw.field);
 assert.deepEqual(collected.relatedRecords,raw.relatedRecords);assert.ok(calculate(d,1).findings.find(f=>f.field==='产品名称').relatedRecords.length);
 const original=structuredClone(seed);original.orders[0]['需求类型']='预测';original.orders[1]['产品编号']='BAD';
 const checked=original.orders.filter(o=>o['需求类型']!=='预测').reverse();const f=validateMasterData({...original,orders:checked},original).find(f=>f.code.includes('PRODUCT_REFERENCE'));
 assert.equal(f.relatedRecords[0].occurrence.index,1);assert.equal(f.relatedRecords[0].row['订单编号'],'B');
});
test('U1 identity allows audited reorder/nonkey edits, refuses missing/rename/current duplicates and missing audit chain',()=>{
 const d={orders:[{'订单编号':'A','产线编号':'L1'},{'订单编号':'B','产线编号':'L1'}]},ref=bound(d,'orders')[0];assert.equal(currentRecord(ref,d,context(d)).index,0);
 const after={orders:[d.orders[1],{...d.orders[0],'产线编号':'L2'}]},operations=[{at:'2026-10-02',batchId:'1',target:'orders',before:d.orders,after:after.orders,fromVersion:inputHash(d),toVersion:inputHash(after)}];
 assert.equal(currentRecord(ref,after,{...context(after),operations}).index,1);assert.equal(currentRecord(ref,after,context(after)),null);
 for(const orders of [[],[{'订单编号':'NEW'}],[d.orders[0],d.orders[0]]])assert.equal(currentRecord(ref,{orders},context({orders})),null);
 assert.equal(ref.row['产线编号'],'L1');
});
test('U1 known delete/reuse refused even when complete current bytes/hash equal original',()=>{
 const d={orders:[{'订单编号':'A'}]},gone={orders:[]},ref=bound(d,'orders')[0];
 const operations=[{at:'2026-10-02',batchId:'1',target:'orders',before:d.orders,after:[],fromVersion:inputHash(d),toVersion:inputHash(gone)},{at:'2026-10-03',batchId:'2',target:'orders',before:[],after:d.orders,fromVersion:inputHash(gone),toVersion:inputHash(d)}];
 assert.equal(currentRecord(ref,d,{...context(d),operations}),null);
});
test('U1 same revision across input domains never permits cross-domain edit; legacy/row0/prose never fabricates sources',()=>{
 const d={orders:[{'订单编号':'A'}]};const f=bindProblemSource({relatedRecords:sourceRefs('orders',d.orders)},source(d,{domain:'trial:T'}));assert.equal(currentRecord(f.relatedRecords[0],d,context(d)),null);
 for(const f of [{code:'MASTER_REQUIRED',message:'订单第 1 行 A'},{table:'orders',row:0}])assert.deepEqual(attachProblemRecords(f,d).relatedRecords,[]);
 assert.equal(currentRecord({table:'orders',row:d.orders[0]},d,context(d)),null);
});
test('U1 explicit freeze mapping retains actual original rows after selection/filter and configuration scope',()=>{
 const d=structuredClone(seed),frozen=freezeRunInput(d,{orderIds:['B']});assert.deepEqual(frozen.sourceMap.orders,[1]);assert.ok(frozen.sourceMap.dependencies.every(i=>d.dependencies[i]['订单编号']==='B'));
 const f=bindProblemSource({relatedRecords:sourceRefs('orders',frozen.executionData.orders)},source(d),d,frozen.sourceMap);assert.equal(f.relatedRecords[0].origin.occurrence.index,1);assert.equal(f.relatedRecords[0].row['订单编号'],'B');
});
test('U1 real Express 422 all master types and order checks freeze exact input; complete bytes unchanged',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const s=JSON.parse(f.bytes());
 s.data.products[0]['产品名称']='';s.data.products[0]['单支净重kg']='bad';s.data.products.push({...s.data.products[0]});s.data.materials[0]['物料名称']='';s.data.orders[1]['产品编号']='BAD';s.data.orders[0]['合格需求']='0';s.data.dependencies[0]['资源类型']='物料';s.data.dependencies[0]['资源编号']='ABSENT';
 fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(s));const before=f.bytes(),r=await f.call('/calculate',{revision:0});assert.equal(r.status,422,JSON.stringify(r.body));assert.equal(f.bytes(),before);
 assert.deepEqual(r.body.checkedInput.data,s.data);for(const code of ['MASTER_REQUIRED','MASTER_VALUE','MASTER_DUPLICATE','PRODUCT_REFERENCE','MATERIAL_REFERENCE','ORDER_QUANTITY'])assert.ok(r.body.findings.some(x=>x.code.includes(code)),code);
 for(const issue of r.body.findings.filter(x=>/MASTER_|PRODUCT_REFERENCE|MATERIAL_REFERENCE|ORDER_/.test(x.code))){assert.ok(issue.relatedRecords.length);for(const ref of issue.relatedRecords){assert.equal(ref.origin.inputVersionId,inputHash(s.data));assert.deepEqual(ref.row,s.data[ref.table][ref.origin.occurrence.index]);}}
});
test('U1 real Worker run carries original selection mapping and historical input remains frozen after save',async t=>{
 const f=await fixture(t);const state=await f.ok('/state'),run=await f.ok('/runs',{revision:state.revision,selection:{orderIds:['B']}});let done;
 for(let i=0;i<200;i++){done=await f.ok('/runs/'+run.id);if(done.planId)break;await new Promise(r=>setTimeout(r,25));}
 assert.ok(done.planId,JSON.stringify(done));const historical=await f.ok('/runs/'+run.id+'/inputs');assert.equal(historical.originalInput.orders.length,2);assert.equal(historical.executionData.orders.length,1);
 const stored=JSON.parse(f.bytes()).runs.find(r=>r.id===run.id);assert.deepEqual(stored.sourceMap.orders,[1]);
 const orders=state.data.orders.map(o=>({...o,'要求可交付分钟':'900'}));await f.ok('/inputs',{revision:state.revision,tables:{orders}});assert.deepEqual((await f.ok('/runs/'+run.id+'/inputs')).originalInput,historical.originalInput);
});

test('U1 early freeze rejection retains actual negative-order diagnostic without changing 400 semantics or storage',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const s=JSON.parse(f.bytes());s.data.orders[0]['合格需求']='-1';fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(s));const before=f.bytes(),r=await f.call('/calculate',{revision:0});assert.equal(r.status,400);assert.match(r.body.error,/-1/);const finding=r.body.findings.find(x=>x.code==='ORDER_QUANTITY');assert.equal(finding.relatedRecords[0].origin.occurrence.index,0);assert.equal(finding.relatedRecords[0].row['合格需求'],'-1');assert.equal(f.bytes(),before);
});

test('U1 real production bundled Worker preserves filtered master reference occurrence; original mapping remains explicit',async()=>{
 const {Worker}=await import('node:worker_threads');const d=structuredClone(seed);const product=d.orders[1]['产品编号'];for(const table of ['routes','times'])d[table].push(...d[table].filter(r=>r['产品编号']===product).map(r=>({...r,'产品编号':'ABSENT'})));d.orders[1]['产品编号']='ABSENT';const frozen=freezeRunInput(d,{orderIds:['B']});
 const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{executionData:frozen.executionData,revision:7,conditions:frozen.conditions,calculatedAt:'2026-10-30T00:00:00Z'}});
 try{
  const plan=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(JSON.stringify(m)));});worker.on('error',reject);});
  const finding=plan.findings.find(f=>f.code==='INPUT / PRODUCT_REFERENCE');assert.ok(finding,JSON.stringify(plan.findings));assert.equal(finding.relatedRecords[0].occurrence.index,0);assert.equal(finding.relatedRecords[0].row['订单编号'],'B');
  const mapped=bindProblemSource(finding,source(d),d,frozen.sourceMap);assert.equal(mapped.relatedRecords[0].origin.occurrence.index,1);assert.equal(plan.tasks.length,0);
  if(process.env.G01_EVIDENCE)fs.writeFileSync(path.join(process.env.G01_EVIDENCE,'worker-master-reference.json'),JSON.stringify({fixture:'Direct production Worker diagnostic; current API blocks invalid input before plan persistence',originalInput:d,frozen,plan,mapped},null,2));
 }finally{await worker.terminate();}
});

test('U1 line-scope sorted/filtered refs preserve producer original positions before run remapping',()=>{
 const orders=[{'订单编号':'A','产线编号':'L1'},{'订单编号':'B','产线编号':'L2'},{'订单编号':'C','产线编号':'L1'}];
 const f=validateSingleLineScope([orders[2],orders[1]],[],{orders}).find(f=>f.code==='SCOPE / MULTI_LINE');assert.deepEqual(f.relatedRecords.map(r=>r.occurrence.index),[2,1]);assert.deepEqual(f.relatedRecords.map(r=>r.row['订单编号']),['C','B']);
});
