import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import {fixture} from './fr027-fixture.mjs';
import {filesOf} from './fr013-main-fixture.mjs';
import {masterBatch,allKeys} from './issue4-0708-fixture.mjs';
import {materialFixture} from './material-fixture.mjs';
import {validateMasterData} from '../src/lib/master-data.mjs';
import {seed} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
const out=process.env.FR013_EVIDENCE;
const dump=(name,value)=>{if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/'+name,JSON.stringify(value,null,2));}};
const preview=(f,d,keys=allKeys,revision=0,table)=>f.call('/imports/preview',{files:filesOf(d,keys),revision,...(table?{table}:{})});

test('V01 exact bag integer and yield ratio boundaries, no inference/default/rounding',()=>{
 const checks=[];
 for(const [field,values,valid] of [
 ['每袋支数',['1','12','12.0','00012'],true],['每袋支数',['8.5','1.5','.5','1.0000000000000000001','0','-1','','1e2','Infinity'],false],
 ['总收率',['1','1.000','0.96','.01','0.0000000000000000001'],true],['总收率',['1.01','1.0000000000000000001','100','100%','0','-1','','NaN'],false]]){
  for(const value of values){const d=structuredClone(seed);d.products[0][field]=value;const issues=validateMasterData(d);assert.equal(issues.length===0,valid,JSON.stringify({field,value,issues}));checks.push({field,value,valid,issues});}
 }
 dump('V01-boundaries.json',checks);
});

test('V02 CSV single/mixed, table, input and trial routes atomically reject invalid values with physical line4 and field',async t=>{
 const f=await fixture(t);const base=await f.ok('/calculate',{revision:0});const trial=await f.ok('/plans/'+base.id+'/copy',{});const before=f.bytes(),checks=[];
 for(const [field,value] of [['每袋支数','8.5'],['每袋支数','1.0000000000000000001'],['总收率','1.01'],['总收率','1.0000000000000000001'],['总收率',''],['模拟交付等待分钟','']]){
  const d=masterBatch();d.products[1][field]=value;
  for(const single of [false,true]){const r=await preview(f,d,single?['products']:allKeys,0,single?'products':undefined);assert.equal(r.body.valid,false);assert.equal(r.body.id,undefined);assert.ok(r.body.issues.some(i=>i.table==='products'&&i.file==='07_产品与包装规格.csv'&&i.row===4&&i.field===field),JSON.stringify(r));checks.push({single,field,value,...r});assert.equal(f.bytes(),before);}
  for(const [path,body] of [['/tables/products',{rows:d.products}],['/inputs',{tables:{products:d.products,materials:d.materials}}],['/trials/'+trial.id+'/inputs',{tables:{products:d.products}}]]){const r=await f.call(path,{revision:0,...body});assert.equal(r.status,400);assert.equal(f.bytes(),before);checks.push({path,field,value,...r});}
 }
 dump('V02-rejections.json',checks);
});

test('V03 legal ratio and custom unit/category CSV persist, reopen, version/audit, no-op and permission/stale/owner zero writes',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const d=masterBatch();d.products[0]['总收率']='1';Object.assign(d.materials.at(-1),{'单位':'自定义计量','类别':'自定义类别'});
 const p=(await preview(f,d)).body;assert.equal(p.valid,true);const before=f.bytes(),checks=[];
 for(const [path,body,role,status] of [
 ['/imports/preview',{files:filesOf(d,allKeys),revision:0},'query',403],['/imports/commit',{previewId:p.id},'query',403],['/imports/commit',{previewId:p.id},'supervisor',409],
 ['/inputs',{tables:{products:d.products},revision:0},'query',403],['/tables/materials',{rows:d.materials,revision:0},'query',403],
 ['/inputs',{tables:{products:d.products},revision:0,reason:''},'planner',400],['/inputs',{tables:{products:d.products},revision:9},'planner',409]]){
  const r=await f.call(path,body,role);assert.equal(r.status,status,JSON.stringify(r));assert.equal(f.bytes(),before);checks.push({path,role,...r});
 }
 const saved=await f.ok('/imports/commit',{previewId:p.id});assert.equal(saved.revision,1);const reopened=await f.ok('/state');assert.deepEqual(reopened.data.products,d.products);assert.equal(reopened.data.materials.at(-1)['单位'],'自定义计量');assert.equal(reopened.data.materials.at(-1)['类别'],'自定义类别');
 const disk=JSON.parse(f.bytes()),records=disk.records.filter(r=>r.action==='import');assert.equal(new Set(records.map(r=>r.batchId)).size,1);assert.ok(records.every(r=>r.fromVersion&&r.toVersion&&r.actor==='test#planner'&&r.reason));assert.ok(disk.inputVersions[saved.inputVersionId]);
 const bytes=f.bytes(),again=(await preview(f,d,allKeys,1)).body;assert.equal((await f.ok('/imports/commit',{previewId:again.id})).unchanged,true);assert.equal(f.bytes(),bytes);
 const edit=structuredClone(reopened.data.products);edit[0]['总收率']='.8';const e=await f.ok('/tables/products',{revision:1,rows:edit},'supervisor');assert.equal(e.revision,2);assert.notEqual(e.inputVersionId,saved.inputVersionId);
 dump('V03-guards.json',checks);dump('V03-saved.json',JSON.parse(f.bytes()));
});

async function builtPlan(data){
 const frozen=freezeRunInput(data,{endMinute:600});const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:0,calculatedAt:new Date().toISOString()}});
 try{return {frozen,plan:await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);})};}finally{await worker.terminate();}
}
async function run(f,revision){const r=await f.ok('/runs',{revision,selection:{endMinute:600}});for(let i=0;i<200;i++){const state=await f.ok('/runs/'+r.id);if(['completed','partial'].includes(state.status))return {summary:state,input:await f.ok('/runs/'+r.id+'/inputs'),plan:(await f.ok('/plans')).find(p=>p.runId===r.id)};if(['failed','timed_out'].includes(state.status))throw Error(JSON.stringify(state));await new Promise(r=>setTimeout(r,25));}throw Error('run timeout');}

test('V04 saved config changes real Worker material quantities, version and freeze while old runs/plans/exports remain intact',async t=>{
 const f=await fixture(t),d=materialFixture((await f.ok('/state')).data);await f.ok('/inputs',{revision:0,tables:d});const old=await run(f,1),oldDisk=JSON.parse(f.bytes());assert.equal(old.plan.materialDemands.find(r=>r.materialId==='LEAN').quantity,325);
 const products=structuredClone(d.products);products[0]['总收率']='.8';products[0]['每袋支数']='12';const materials=structuredClone(d.materials);materials.push({'物料编号':'CUSTOM','物料名称':'自定义合成物料','单位':'桶','类别':'自定义类别'});materials[0]['类别']='授权修改类别';
 await f.ok('/inputs',{revision:1,tables:{products,materials}});const fresh=await run(f,2);assert.equal(fresh.plan.materialDemands.find(r=>r.materialId==='LEAN').quantity,390);assert.equal(fresh.plan.materialDemands.find(r=>r.materialId==='BAG').quantity,1011);assert.equal(fresh.input.executionData.materials.at(-1)['单位'],'桶');assert.equal(fresh.input.executionData.materials[0]['类别'],'授权修改类别');assert.equal(fresh.input.executionData.products[0]['总收率'],'.8');assert.notEqual(fresh.input.inputVersionId,old.input.inputVersionId);assert.notEqual(fresh.input.snapshotHash,old.input.snapshotHash);
 const disk=JSON.parse(f.bytes());assert.deepEqual(disk.plans.find(p=>p.id===old.plan.id),oldDisk.plans.find(p=>p.id===old.plan.id));assert.deepEqual(disk.runs.find(r=>r.id===old.summary.id),oldDisk.runs.find(r=>r.id===old.summary.id));assert.deepEqual(await f.ok('/runs/'+old.summary.id+'/inputs'),old.input);
 const exported=await f.ok('/export',{table:'products',query:{table:'products',revision:2,planId:old.plan.id,sourcePlanId:old.plan.id}});assert.ok(exported.includes('0.96'));dump('V04-old-run.json',old);dump('V04-new-run.json',fresh);dump('V04-history.json',disk);
 const built=await builtPlan({...d,products,materials});assert.equal(built.plan.materialDemands.find(r=>r.materialId==='LEAN').quantity,390);assert.equal(built.plan.materialDemands.find(r=>r.materialId==='BAG').quantity,1011);dump('V04-built-worker.json',built);
});

test('V05 legacy stored invalid config readable unchanged; new runs blocked without rewriting history or filling missing defaults',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const disk=JSON.parse(f.bytes());disk.data.products[0]['每袋支数']='1.5';disk.data.products[0]['总收率']='1.01';fs.writeFileSync(f.dir+'/business.json',JSON.stringify(disk));const before=f.bytes();assert.equal((await f.ok('/state')).data.products[0]['每袋支数'],'1.5');const r=await f.call('/runs',{revision:0});assert.equal(r.status,422);assert.equal(f.bytes(),before);assert.deepEqual((await f.ok('/plans'))[0].tasks,disk.plans[0].tasks);dump('V05-legacy-block.json',r);
});

test('V06 genuine verified/submitted/supervisor-confirmed snapshots survive authorized master update and restart',async t=>{
 const f=await fixture(t);const p=await f.ok('/calculate',{revision:0});await f.ok('/plans/'+p.id+'/verify',{});
 const act=async(action)=>{const r=await f.ok('/plans/'+p.id+'/review');return f.ok('/plans/'+p.id+'/'+action,{revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true},action==='submit'?'planner':'supervisor');};
 await act('submit');await act('confirm');const before=JSON.parse(f.bytes()),c=before.confirmations[0];assert.equal(c.actor,'test#supervisor');const products=structuredClone(before.data.products);products[0]['总收率']='.8';products[0]['每袋支数']='12';await f.ok('/inputs',{revision:0,tables:{products}});
 const after=JSON.parse(f.bytes());for(const k of ['plans','runs','confirmations'])assert.deepEqual(after[k],before[k],k);for(const k of ['executionFacts','executionMaterials','executionSources'])assert.deepEqual(after.data[k],before.data[k],k);assert.deepEqual((await f.ok('/plans/'+p.id+'/inputs')).data.products,before.data.products);assert.deepEqual(await f.ok('/confirmations/'+c.id),c);
 // Recreate the business router against the same persisted data, no in-memory fixture state.
 const {createBusinessRouter}=await import('../server/business.mjs');const express=(await import('express')).default;const app=express();app.use((req,_res,next)=>{req.praetorActor={kind:'user',issuer:'test',sub:'planner'};next();});app.use('/api',createBusinessRouter({dataDir:f.dir,actorMiddleware:(_q,_s,n)=>n(),requireMember:()=> (req,_res,next)=>{req.member={role:'planner'};next();}}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const reloaded=await (await fetch('http://127.0.0.1:'+server.address().port+'/api/state')).json();assert.equal(reloaded.data.products[0]['总收率'],'.8');assert.equal(reloaded.revision,1);assert.deepEqual(JSON.parse(f.bytes()).confirmations,before.confirmations);dump('V06-confirmed-history.json',{before,after,reloaded});
});

test('V07 dispatched 07+08 failures: 8.5 and 1.01 reject on physical line4, forged confirmation zero write; 8 and 1.00 persist',async t=>{
 const f=await fixture(t),checks=[];await f.ok('/calculate',{revision:0});const before=f.bytes();
 for(const [field,value] of [['每袋支数','8.5'],['总收率','1.01']]){
  const d=masterBatch();d.products[1][field]=value;const files=filesOf(d,['products','materials']);
  const p=await f.call('/imports/preview',{revision:0,files});assert.equal(p.status,400);assert.equal(p.body.valid,false);assert.equal(p.body.id,undefined);
  assert.ok(p.body.issues.some(i=>i.file==='07_产品与包装规格.csv'&&i.row===4&&i.field===field&&i.reason));assert.equal(f.bytes(),before);
  const c=await f.call('/imports/commit',{previewId:p.body.id,files,tables:d});assert.equal(c.status,409);assert.equal(f.bytes(),before);
  checks.push({field,value,files,preview:p,commit:c,zeroWrite:true});
 }
 const d=masterBatch();d.products[1]['每袋支数']='8';d.products[1]['总收率']='1.00';
 const files=filesOf(d,['products','materials']);const p=await f.ok('/imports/preview',{revision:0,files});assert.equal(p.valid,true);
 await f.ok('/imports/commit',{previewId:p.id});const state=await f.ok('/state');assert.equal(state.data.products[1]['总收率'],'1.00');assert.equal(state.data.products[1]['每袋支数'],'8');
 assert.deepEqual(JSON.parse(f.bytes()).plans,JSON.parse(before).plans);checks.push({legal:{files,state},historyUnchanged:true});dump('V07-dispatched.json',checks);
});
