import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {run,uat15,uat17,uat18,at} from './b15-test-fixture.mjs';
import {comparePlans} from '../src/lib/plan-comparison.mjs';
import {hostProcess} from './b234-host-client.mjs';import {scenarioFiles} from './b3-material-fixture.mjs';import {b2Worker} from './b2-fixture.mjs';
const out=process.env.B15_EVIDENCE;
const dump=(id,x)=>{if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(x,null,2));}};
const stablePlan=p=>{const q=structuredClone(p);delete q.id;delete q.createdAt;delete q.inputVersion;return q;};
test('B15-13 actual built calculation Worker carries UAT15/17/18 frozen facts and approved bounds',async()=>{
 for(const [id,data,selection]of [['15',uat15(),{startMinute:60}],['17',uat17(),{}],['18',uat18(true),{}]]){
  const direct=run(data,id,selection),f=direct.frozen;
  const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...f,revision:0,calculatedAt:at}});
  try{const p=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(JSON.stringify(m)));});worker.on('error',reject);worker.on('exit',code=>{if(code)reject(Error('worker exit '+code));});});
   assert.deepEqual(p.tasks.map(t=>[t.orderId,t.operation,t.start,t.end,t.machine]),direct.plan.tasks.map(t=>[t.orderId,t.operation,t.start,t.end,t.machine]));
   assert.deepEqual(p.execution,direct.plan.execution);assert.deepEqual(p.materialDemands,direct.plan.materialDemands);assert.deepEqual(p.deliveryAssessment,direct.plan.deliveryAssessment);
   dump('worker-'+id,{data,frozen:f,plan:p,actualApplicationWorker:true,source:'dist/calculation-worker.mjs'});
  }finally{await worker.terminate();}
 }
});
test('B15-14 detached comparison and protection domain survives structured-clone Worker transport',async()=>{
 const a=run(uat18(),'original'),b=run(uat18(true),'trial'),worker=new Worker(new URL('./b15-test-worker.mjs',import.meta.url),{workerData:{a,b}});
 try{const r=await new Promise((resolve,reject)=>{worker.on('message',resolve);worker.on('error',reject);});assert.deepEqual(r.comparison,comparePlans(a.plan,a.data,b.plan,b.data));assert.equal(r.protection.valid,true);assert.equal(r.kept.original.data.orders[0]['合格需求'],'240');dump('domain-worker',r);}finally{await worker.terminate();}
});
test('B15-15 existing API/Worker/save/restart preserves original configuration and domain comparison results',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b15-private-'));let f=await hostProcess(dir);try{
  const d=uat18(),state=await f.ok('/state'),response=await f.call('/imports/preview',{revision:state.revision,files:scenarioFiles(d),inputStage:'supported'}),preview=response.body;assert.equal(response.status,200,JSON.stringify({issues:preview.issues,errors:preview.errors,error:preview.error}));assert.equal(preview.valid,true,JSON.stringify(preview.issues));await f.ok('/imports/commit',{previewId:preview.id});
  const first=await b2Worker(f);assert.equal(first.run.status,'completed');await f.ok('/plans',{id:first.plan.id});const source=await f.ok('/plans/'+first.plan.id+'/inputs'),csv=await f.ok('/export',{planId:first.plan.id});
  const current=await f.ok('/state'),b=uat18(true),tables=Object.fromEntries(['times','calendars','tools','resourceClaims','bom'].map(k=>[k,b[k]]));await f.ok('/inputs',{revision:current.revision,tables});const next=await b2Worker(f);assert.equal(next.run.status,'completed');assert.equal(next.plan.materialDemands.find(m=>m.materialId==='LEAN').quantity,175);
  const c=await f.ok('/plans/'+first.plan.id+'/compare/'+next.plan.id);
  assert.ok(c.tasks.changes.length);const bytes=f.bytes(),pid=f.pid;await f.close();f=await hostProcess(dir);assert.notEqual(f.pid,pid);assert.equal(f.bytes(),bytes);assert.deepEqual(await f.ok('/plans/'+first.plan.id+'/inputs'),source);assert.equal(await f.ok('/export',{planId:first.plan.id}),csv);
  dump('persistence',{source,original:first,candidate:next,comparison:c,csv,pidBefore:pid,pidAfter:f.pid,bytesUnchanged:true,scope:'existing internal QA API uses synthetic actors; final combined managed identity/UI remains Dev'});
 }finally{await f.close();fs.rmSync(dir,{recursive:true,force:true});}
});
