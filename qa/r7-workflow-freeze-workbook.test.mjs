import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './fr027-fixture.mjs';
import {Worker} from 'node:worker_threads';
const base=process.env.R7_SMALL_FIXTURE;if(!base)throw Error('R7_SMALL_FIXTURE required');
const save=(id,x)=>{if(process.env.R7_CORE_OUT)fs.writeFileSync(process.env.R7_CORE_OUT+'/'+id+'.json',JSON.stringify(x,null,2));};
const mapping=JSON.parse(fs.readFileSync(base+'/mapping.json')),xlsx=fs.readFileSync(base+'/small.xlsx');
async function setup(f){const before=await f.ok('/state'),p=await f.ok('/workbooks/preview',{fileBase64:xlsx.toString('base64'),datasetId:'R7-SMALL'});save('small-import-preview',p);assert.deepEqual(p.issues,[]);const c=await f.ok('/workbooks/commit',{previewId:p.id,fileHash:p.fileHash,expectedVersion:0});assert.equal(c.version,1);assert.deepEqual((await f.ok('/state')).data,before.data);const r=await f.ok('/workbooks/datasets/R7-SMALL/mapping',{expectedVersion:1,mapping});assert.equal(r.readiness.ready,true,JSON.stringify(r.readiness.issues));return r.version;}
async function worker(f,version,selection){const r=await f.ok('/workbooks/datasets/R7-SMALL/run',{version,selection});for(let i=0;i<200;i++){const done=await f.ok('/workbooks/runs/'+r.id);if(!['queued','running'].includes(done.status)){assert.ok(done.result,JSON.stringify(done));return done;}await new Promise(r=>setTimeout(r,20));}throw Error('bounded small Worker timeout');}

test('small actual workbook selection, [1,15), cross-month, v1/v2 config freeze, native and persisted reopen',async t=>{
 const f=await fixture(t,{runOptions:{workbookImportHeapMiB:64}});
 const legacyCreated=await f.ok('/runs',{revision:(await f.ok('/state')).revision,selection:{endMinute:600}});let legacy;
 for(let i=0;i<200;i++){legacy=await f.ok('/runs/'+legacyCreated.id);if(legacy.planId)break;assert.notEqual(legacy.status,'failed');await new Promise(r=>setTimeout(r,20));}assert.ok(legacy.planId);
 const legacyInput=await f.ok('/runs/'+legacy.id+'/inputs'),legacyCsv=await f.ok('/export',{planId:legacy.planId});
 const v1=await setup(f);
 const a=await worker(f,v1,{startDay:1,endDay:15,currentDay:1});assert.deepEqual(a.result.demandResults.map(r=>r.id),['MOCK-D1','MOCK-D14']);assert.equal(a.result.demandSummary.totalKg,40);assert.equal(a.result.verification.status,'pass');assert.equal(a.provenance.startDate,'2026-11-01');assert.equal(a.provenance.endDate,'2026-11-15');assert.equal(a.provenance.startMinute,-1920);
 for(const t of a.result.tasks){assert.equal(t.startMinute,1440*(t.start-2)-480);assert.equal(t.endMinute,1440*(t.end-2)-480);assert.ok(t.end>t.start);}
 const frozen=await f.ok('/workbooks/runs/'+a.id+'/inputs'),csv=await f.ok('/workbooks/runs/'+a.id+'/export');assert.ok(csv.includes(a.provenance.fileHash));assert.ok(csv.includes(a.provenance.mappingHash));assert.ok(csv.includes(a.provenance.parameterHash));assert.ok(csv.includes('2026-11-02T08:00:00+08:00'));
 const next=await f.ok('/workbooks/datasets/R7-SMALL/edit',{expectedVersion:v1,table:'配置参数',key:'MOCK-P1',changes:{'参数值':'20'}}),v2=next.version;assert.equal(v2,v1+1);
 const b=await worker(f,v2,{startDay:1,endDay:15,currentDay:1});assert.equal(b.result.demandSummary.totalKg,80);assert.notEqual(a.inputHash,b.inputHash);assert.notEqual(a.provenance.parameterHash,b.provenance.parameterHash);assert.equal(a.provenance.fileHash,b.provenance.fileHash);
 const explicitOld=await worker(f,v1,{startDay:1,endDay:15,currentDay:1,demandIds:['MOCK-D14']});assert.equal(explicitOld.version,v1);assert.equal(explicitOld.result.demandSummary.totalKg,20);
 assert.deepEqual(await f.ok('/workbooks/runs/'+a.id+'/inputs'),frozen);assert.equal(await f.ok('/workbooks/runs/'+a.id+'/export'),csv);
 const month=await worker(f,v2,{startDay:30,endDay:44,currentDay:30});assert.deepEqual(month.result.demandResults.map(r=>r.id),['MOCK-D30','MOCK-D31','MOCK-D43']);assert.equal(month.provenance.startDate,'2026-11-30');assert.equal(month.provenance.endDate,'2026-12-14');assert.equal(month.result.minuteOrigin,'2026-11-02T08:00:00+08:00');
 assert.deepEqual(await f.ok('/runs/'+legacy.id+'/inputs'),legacyInput);assert.equal(await f.ok('/export',{planId:legacy.planId}),legacyCsv);save('legacy-minute-unchanged',{legacy,legacyInput,legacyCsv});
 const disk=fs.readFileSync(f.dir+'/workbooks/state.json'),reopen=await fixture(t,{runOptions:{workbookImportHeapMiB:64}});fs.cpSync(f.dir+'/workbooks',reopen.dir+'/workbooks',{recursive:true});assert.equal(await reopen.ok('/workbooks/runs/'+a.id+'/export'),csv);assert.deepEqual(await reopen.ok('/workbooks/runs/'+a.id+'/inputs'),frozen);assert.deepEqual(fs.readFileSync(reopen.dir+'/workbooks/state.json'),disk);
 save('small-freeze-chain',{a,b,explicitOld,month,frozen,csv,state:JSON.parse(disk),fixtureBytes:xlsx.length});
 const source=await fetch(f.url+'/api/workbooks/datasets/R7-SMALL/source?version='+v1,{headers:{'test-sub':'planner'}});assert.equal(source.status,200);assert.deepEqual(Buffer.from(await source.arrayBuffer()),xlsx);
 if(process.env.R7_CORE_OUT)fs.cpSync(f.dir+'/workbooks',process.env.R7_CORE_OUT+'/small-workbooks',{recursive:true});
});

test('version/selection/unsupported/query boundaries are atomic; result corruption cannot be re-certified or exported',async t=>{
 const f=await fixture(t,{runOptions:{workbookImportHeapMiB:64}}),version=await setup(f),stateFile=f.dir+'/workbooks/state.json';
 const before=fs.readFileSync(stateFile,'utf8');for(const body of [{selection:{}},{version:0,selection:{}},{version:'2',selection:{}},{version,selection:{startDay:1,endDay:15,demandIds:['MOCK-D15']}},{version,selection:{startDay:1,endDay:15,demandIds:['MOCK-D1','MOCK-D1']}},{version,selection:{startDay:2,endDay:3}},{version,selection:{startDay:1,endDay:15,unknown:true}}]){const r=await f.call('/workbooks/datasets/R7-SMALL/run',body);assert.ok([400,422].includes(r.status),JSON.stringify(r));assert.equal(fs.readFileSync(stateFile,'utf8'),before);}
 const bad=structuredClone(mapping);bad.capabilities_required.push('R7-UNSUPPORTED');const updated=await f.ok('/workbooks/datasets/R7-SMALL/mapping',{expectedVersion:version,mapping:bad});assert.equal(updated.readiness.ready,false);assert.ok(updated.readiness.issues.some(i=>i.code==='NOT_SUPPORTED'));
 assert.equal((await f.call('/workbooks/datasets/R7-SMALL/run',{version:updated.version,selection:{}})).status,422);
 assert.equal((await f.call('/workbooks/datasets/R7-SMALL/edit',{expectedVersion:updated.version,table:'配置参数',key:'MOCK-P1',changes:{'参数值':'99'}},'query')).status,403);
 const saved=await f.ok('/workbooks/datasets/R7-SMALL/mapping',{expectedVersion:updated.version,mapping});const a=await worker(f,saved.version,{startDay:1,endDay:15,currentDay:1});
 const original=fs.readFileSync(stateFile,'utf8'),state=JSON.parse(original),r=state.runs.find(r=>r.id===a.id);r.result.demandResults[0].quantity=999;fs.writeFileSync(stateFile,JSON.stringify(state));const corrupt=fs.readFileSync(stateFile,'utf8');
 for(const [path,body]of [['/workbooks/runs/'+a.id,null],['/workbooks/runs/'+a.id+'/verify',{}],['/workbooks/runs/'+a.id+'/export',null]]){const resp=await f.call(path,body);assert.equal(resp.status,409,JSON.stringify(resp));assert.equal(resp.body.error,'frozen_result_corrupt');assert.equal(fs.readFileSync(stateFile,'utf8'),corrupt);}
 fs.writeFileSync(stateFile,original);assert.equal((await f.ok('/workbooks/runs/'+a.id+'/verify',{})).status,'pass');save('small-negative',{versionBound:true,selectionBound:true,unsupported:updated.readiness,queryForbidden:true,corruptionRejected:true});
});

test('real edits to supply dates and outages affect only new Workers, while old frozen input/native stay identical',async t=>{
 const f=await fixture(t,{runOptions:{workbookImportHeapMiB:64}});let version=await setup(f);const initial=await worker(f,version,{startDay:1,endDay:15,currentDay:1}),frozen=await f.ok('/workbooks/runs/'+initial.id+'/inputs'),csv=await f.ok('/workbooks/runs/'+initial.id+'/export');
 const saveEdit=async(table,key,changes,operation='edit')=>{const r=await f.ok('/workbooks/datasets/R7-SMALL/edit',{expectedVersion:version,table,key,changes,operation});version=r.version;return r;};
 await saveEdit('期初库存','MOCK-LOT',{'放行日':'44'});const noStock=await worker(f,version,{startDay:1,endDay:15,currentDay:1});assert.equal(noStock.status,'partial');assert.equal(noStock.result.demandSummary.scheduled,0);assert.equal(noStock.result.allocations.length,0);
 await saveEdit('期初库存','MOCK-LOT',{'放行日':'0'});await saveEdit('停机安排','',{'停机编号':'MOCK-STOP','资源编号':'MOCK-E','开始日':'1','结束日':'15','可知日':'1'},'create');const stopped=await worker(f,version,{startDay:1,endDay:15,currentDay:1});assert.equal(stopped.status,'partial');assert.equal(stopped.result.demandSummary.scheduled,0);assert.equal(stopped.result.tasks.length,0);
 assert.deepEqual(await f.ok('/workbooks/runs/'+initial.id+'/inputs'),frozen);assert.equal(await f.ok('/workbooks/runs/'+initial.id+'/export'),csv);save('small-supply-outage',{initial,noStock,stopped,frozen,csv});
});

test('actual Worker failure preserves imported data and cannot export a successful result',async t=>{
 // Inject a transport/runtime failure in the disposable fixture, without an OOM
 // or any mutation of calculation logic, real services, or their state.
 const f=await fixture(t,{runOptions:{workbookImportHeapMiB:64,workerFactory:()=>new Worker('throw Error("explicit disposable Worker failure")',{eval:true,resourceLimits:{maxOldGenerationSizeMb:64}})}}),version=await setup(f);
 const d=await f.ok('/workbooks/datasets/R7-SMALL'),r=await f.ok('/workbooks/datasets/R7-SMALL/run',{version,selection:{startDay:1,endDay:15,currentDay:1}});let failed;
 for(let n=0;n<100;n++){failed=await f.ok('/workbooks/runs/'+r.id);if(failed.status==='failed')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(failed.status,'failed');assert.equal(failed.result,null);assert.ok(failed.failure);assert.deepEqual(await f.ok('/workbooks/datasets/R7-SMALL'),d);assert.equal((await f.call('/workbooks/runs/'+r.id+'/export')).status,409);save('small-worker-failure',failed);
});
