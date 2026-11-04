import test from 'node:test';
import assert from 'node:assert/strict';
import {registerMpsReportRoutes} from '../server/mps-report-routes.mjs';
import {mpsFixture,mpsRun} from './mps-report-fixture.mjs';

test('same registered GET transport serves context -> overview -> matrix -> source -> complete export',async()=>{
 const input=mpsFixture(),run=mpsRun(input),routes=new Map(),permissions=[];
 const router={get:(url,permission,handler)=>routes.set(url,{permission,handler})};
 const ctx={read:()=>({runs:[run]}),snapshot:()=>input,dataset:()=>{throw Error('current fallback forbidden');},actorKey:()=>'',permission:kind=>{permissions.push(kind);return kind;}};
 registerMpsReportRoutes(router,ctx);assert.equal(routes.size,7);assert.equal(permissions.filter(k=>k==='export').length,1);
 async function call(kind,payload){let body='',status=200,ended=false;const res={type(){return res;},set(){return res;},status(n){status=n;return res;},send(s){body=s;ended=true;},json(x){body=JSON.stringify(x);ended=true;},write(s){body+=s;return true;},end(){ended=true;},destroy(e){throw e;}};
  await routes.get('/mps-report/'+kind).handler({query:{request:JSON.stringify(payload)}},res,e=>{throw e;});assert.ok(ended);return {status,body};
 }
 const catalog=JSON.parse((await call('context',{datasetId:input.id,version:input.version,runId:run.id})).body),q={identity:catalog.identity,fromDate:catalog.fromDate,toDateInclusive:catalog.toDateInclusive,pageSize:100};
 const overview=JSON.parse((await call('query',q)).body);assert.equal(overview.identity.runId,run.id);assert.equal(overview.total,3);
 const matrix=JSON.parse((await call('matrix',{...q,queryFingerprint:overview.queryFingerprint,materialId:'FG1'})).body);assert.equal(matrix.records.length,16);
 const detail=JSON.parse((await call('detail',{...q,materialId:'FG1',table:'inventory'})).body);assert.equal(detail.total,1);
 const source=JSON.parse((await call('source',{...q,materialId:'FG1',table:'inventory',id:detail.records[0].id})).body);assert.match(source.text,/L1/);
 const csv=await call('export',{...q,format:'csv',queryFingerprint:overview.queryFingerprint});assert.equal(csv.status,200);assert.match(csv.body,/物料总览/);assert.match(csv.body,/RUN-MPS/);
 const invalid=await call('query',{...q,identity:{...q.identity,inputHash:'stale'}});assert.equal(invalid.status,409);
});
