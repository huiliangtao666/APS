import test from 'node:test';import assert from 'node:assert/strict';
import {validateSingleLineScope} from '../src/lib/line-scope.mjs';
import {recordRefs,sourceRefs,bindProblemSource,currentRecord,attachProblemRecords} from '../src/lib/problem-records.mjs';
import {fixture} from './fr027-fixture.mjs';
test('global associations include exact participant rows and never unrelated records',()=>{
 const orders=[{'订单编号':'Z','产线编号':'L1'},{'订单编号':'A','产线编号':'L2'}],machines=[{'设备编号':'M1','产线编号':'L1'},{'设备编号':'M2','产线编号':'L3'}];
 const findings=validateSingleLineScope(orders,machines);
 assert.deepEqual(findings.find(f=>f.code==='SCOPE / MULTI_LINE').relatedRecords,sourceRefs('orders',orders));
 const mismatch=validateSingleLineScope([orders[0]],machines).find(f=>f.code==='SCOPE / RESOURCE_LINE_MISMATCH');
 assert.deepEqual(mismatch.relatedRecords,sourceRefs('orders',[orders[0]]).concat(sourceRefs('machines',[machines[1]],machines)));
 assert.deepEqual(findings[0].taskIds,[]);orders[0]['产线编号']='CHANGED';assert.equal(findings[0].relatedRecords[0].row['产线编号'],'L1');
});
test('identity handles reorder, change, missing and duplicates without index or message inference',()=>{
 const ref=recordRefs('orders',[{'订单编号':'A','产线编号':'L1'}])[0];
 assert.equal(currentRecord(ref,{orders:[ref.row]}),null); // legacy refs have no certified version
 const old=attachProblemRecords({code:'SCOPE / MULTI_LINE',message:'订单 A',taskIds:[]},{orders:[ref.row]});assert.deepEqual(old.relatedRecords,[]);assert.ok(old.associationGap);
 const located=attachProblemRecords({table:'orders',row:2,taskIds:[]},{orders:[ref.row]});assert.deepEqual(located.relatedRecords,[ref]);
});
test('actual Express preflight returns exact global records without changing store or creating plan',async t=>{
 const f=await fixture(t);const state=await f.ok('/state');await f.ok('/calculate',{revision:state.revision});
 const fs=await import('node:fs');const path=await import('node:path');const store=JSON.parse(f.bytes());
 store.data.orders[1]['产线编号']='L2';fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(store));
 const before=f.bytes(),response=await f.call('/calculate',{revision:state.revision});assert.equal(response.status,400);
 const global=response.body.findings.find(f=>f.code==='SCOPE / MULTI_LINE');assert.ok(global);
 assert.deepEqual(global.relatedRecords.map(r=>({table:r.table,row:r.row})),recordRefs('orders',store.data.orders));assert.equal(global.sourceRevision,state.revision);assert.equal(f.bytes(),before);
});
test('master source now survives collect while unrelated native locations remain compatible',async()=>{
 const {validateInputs}=await import('../server/input-validation.mjs');const {seed,defs}=await import('../server/planner.ts');const data=structuredClone(seed);data.products[0]['产品名称']='';data.routes[0]['工序名称']='';
 const issues=validateInputs(defs,data);const legacy=issues.find(i=>i.code==='INPUT / MASTER_REQUIRED'&&i.message.includes('产品名称'));
 assert.equal(legacy.table,'products');assert.equal(legacy.row,2);assert.deepEqual(attachProblemRecords({...legacy,taskIds:[]},data).relatedRecords,sourceRefs('products',[data.products[0]],data.products));
 const explicit=issues.find(i=>i.code==='INPUT / ROUTE_REQUIRED'&&i.field==='工序名称');assert.ok(explicit);assert.deepEqual(attachProblemRecords({...explicit,taskIds:[]},data).relatedRecords,recordRefs('routes',[data.routes[0]]));
});
