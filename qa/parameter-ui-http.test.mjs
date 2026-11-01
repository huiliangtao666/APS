// Execute only in a PM-coordinated runtime window. Uses the real business
// permission, import subprocess, calculation Worker, snapshots and native export.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import express from 'express';
import {createBusinessRouter} from '../server/business.mjs';
const fixture=process.env.PARAMETER_FIXTURE;
const ownedRoot=process.env.PARAMETER_RUNTIME_ROOT;
if(process.env.APS_PARAMETER_RUNTIME_WINDOW!=='approved'||!fixture||!ownedRoot)throw Error('Explicit coordinated window, PARAMETER_FIXTURE and owned PARAMETER_RUNTIME_ROOT required');
fs.mkdirSync(ownedRoot,{recursive:true});
const timeout=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('PCU04/06–15/19: real HTTP, import child, serial Workers, frozen reopen/export and production CSRF',{timeout:300000},async context=>{
 const dataDir=fs.mkdtempSync(path.join(ownedRoot,'http-')),evidence=[],ownedWorkers=new Set();let createdWorkers=0;
 const workerFactory=workerData=>{assert.equal(ownedWorkers.size,0,'single Worker window');const worker=new Worker(new URL('../server/calculation-worker.mjs',import.meta.url),{workerData,resourceLimits:{maxOldGenerationSizeMb:64},execArgv:['--experimental-strip-types']});ownedWorkers.add(worker);createdWorkers++;worker.on('exit',()=>ownedWorkers.delete(worker));return worker;};
 let server;
 async function open(){const app=express();app.use(express.json({limit:'20mb'}));app.use('/api',createBusinessRouter({dataDir,accessMode:'shared',workbookImportHeapMiB:64,workerFactory}));server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));}
 async function close(){if(server){await new Promise(resolve=>server.close(resolve));server=undefined;}}
 context.after(async()=>{await close();for(const w of ownedWorkers)await w.terminate();fs.writeFileSync(path.join(dataDir,'http-evidence.json'),JSON.stringify({evidence,createdWorkers,ownedWorkersRemaining:ownedWorkers.size,listenerClosed:!server},null,2));});
 await open();
 const call=async(route,body,headers={})=>{if(body!==undefined){const availableKiB=Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1]),minimumKiB=Number(process.env.PARAMETER_WRITE_MIN_KIB);assert.ok(Number.isSafeInteger(minimumKiB)&&minimumKiB>0,'explicit workload write capacity gate required');evidence.push({beforeWrite:route,availableKiB,minimumKiB});assert.ok(availableKiB>=minimumKiB,'capacity before write; stop without request');}const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-aps-request':'workbench',...headers},...(body===undefined?{}:{body:JSON.stringify({reason:'explicit replaceable parameter HTTP scenario',...body})})});const text=await r.text();let value;try{value=JSON.parse(text);}catch{value=text;}evidence.push({route,status:r.status,body:body===undefined?undefined:{...body,fileBase64:body.fileBase64?'fixture bytes redacted':undefined},value});return {status:r.status,value};};
 const ok=async(route,body)=>{const r=await call(route,body);assert.ok([200,202].includes(r.status),JSON.stringify(r));return r.value;};
 const workbook='/workbooks',id='PARAMETER-HTTP';
 let version;
 async function preview(file,extra={}){return ok(workbook+'/preview',{datasetId:id,name:'Explicit synthetic parameter scenario',fileBase64:fs.readFileSync(file).toString('base64'),...extra});}
 async function commit(p){const result=await ok(workbook+'/commit',{previewId:p.id,fileHash:p.fileHash,expectedVersion:p.expectedVersion});version=result.version;return result;}
 async function edit(table,key,changes,operation='edit'){const r=await ok(workbook+'/datasets/'+id+'/edit',{expectedVersion:version,table,key,operation,changes});version=r.version;return r;}
 async function parameter(extra={}){const r=await ok(workbook+'/datasets/'+id+'/parameters',{expectedVersion:version,cp:'CP074',objectId:'MOCK-SUP',field:'检验天数',value:'2',unit:'天',from:0,to:44,scope:'dataset',...extra});version=r.version;return r;}
 async function run(startDay,scope='dataset'){const queued=await ok(workbook+'/datasets/'+id+'/run',{version,parameterScope:scope,selection:{startDay,endDay:15,currentDay:2,demandIds:['SUPPLY-D']}});let result;for(let i=0;i<150;i++){result=await ok(workbook+'/runs/'+queued.id);if(!['queued','running'].includes(result.status))break;await timeout(100);}assert.ok(['partial','completed'].includes(result.status),JSON.stringify(result));for(let i=0;i<50&&ownedWorkers.size;i++)await timeout(20);assert.equal(ownedWorkers.size,0);return result;}
 const base=await preview(path.join(fixture,'supply/small.xlsx'));assert.equal(base.issues.length,0,JSON.stringify(base.issues));await commit(base);
 const stateFile=path.join(dataDir,'workbooks/state.json'),stateBytes=()=>fs.readFileSync(stateFile);
 const imported=stateBytes();assert.equal((await commit(base)).idempotent,true);assert.deepEqual(stateBytes(),imported);
 const mapped=await ok(workbook+'/datasets/'+id+'/mapping',{expectedVersion:version,mapping:JSON.parse(fs.readFileSync(path.join(fixture,'supply/mapping.json')))});version=mapped.version;
 const parameters=await preview(path.join(fixture,'parameters-small.xlsx'),{adoptParameters:true});assert.equal(parameters.issues.length,0,JSON.stringify(parameters.issues));await commit(parameters);
 const invalid=await preview(path.join(fixture,'parameters-invalid.xlsx'),{adoptParameters:true});assert.ok(invalid.issues.length);const beforeInvalid=stateBytes();const rejected=await call(workbook+'/commit',{previewId:invalid.id,fileHash:invalid.fileHash,expectedVersion:invalid.expectedVersion});assert.equal(rejected.status,422);assert.deepEqual(stateBytes(),beforeInvalid);
 await edit('期初在制','MOCK-WIP',{},'delete');await edit('每日需求','SUPPLY-D',{'需求日':'5','需求箱数':'2'});await edit('物料清单','MOCK-REMAIN',{'子项编号':'MOCK-RAW'});
 const current=await ok(workbook+'/datasets/'+id);assert.equal(current.readiness.ready,true,JSON.stringify(current.readiness));
 const first=await ok(workbook+'/datasets/'+id+'/parameters?cp=CP063&day=5&step=A3');const inspection=first.records.find(p=>p['参数名称']==='检验天数');assert.equal(inspection['参数值'],'1');
 const complete=await run(3);assert.ok(complete.result.tasks.length>0);assert.equal(complete.result.verification.status,'pass');
 const six=await run(5),sixSuggestion=six.result.suggestions.find(p=>p.materialId==='MOCK-RAW');assert.ok(sixSuggestion);assert.equal(sixSuggestion.needDay,5);assert.equal(sixSuggestion.availableDay,6);assert.equal(sixSuggestion.lateDays,1);
 const frozen=await ok(workbook+'/runs/'+six.id+'/inputs'),native=await ok(workbook+'/runs/'+six.id+'/export');
 const oldVersion=version;await parameter({id:inspection['参数编号']});const staleBytes=stateBytes();const conflict=await call(workbook+'/datasets/'+id+'/parameters',{expectedVersion:oldVersion,cp:'CP063',objectId:'MOCK-SUP',field:'检验天数',id:inspection['参数编号'],value:'3',unit:'天',from:0,to:44,scope:'dataset'});assert.equal(conflict.status,409);assert.deepEqual(stateBytes(),staleBytes);
 const reverse=await ok(workbook+'/datasets/'+id+'/parameters?cp=CP074&day=5');assert.equal(reverse.records.find(p=>p['参数编号']===inspection['参数编号'])['参数值'],'2');
 const seven=await run(5),sevenSuggestion=seven.result.suggestions.find(p=>p.materialId==='MOCK-RAW');assert.equal(sevenSuggestion.availableDay,7);assert.equal(sevenSuggestion.lateDays,2);assert.ok(seven.provenance.effectiveParameters.values.some(p=>p.cp==='CP074'&&p.value==='2'));
 const draft=await ok(workbook+'/datasets/'+id+'/draft',{expectedVersion:version,sourceRun:seven.id,suggestionId:sevenSuggestion.id,currentDay:2});version=draft.version;assert.equal(draft.draft.availableDay,7);
 const trial=await ok(workbook+'/datasets/'+id+'/parameter-trials',{expectedVersion:version,name:'explicit isolated HTTP trial'});version=trial.version;const scope='trial:'+trial.trial.id;
 await parameter({scope,value:'0'});const local=await run(5,scope);assert.equal(local.result.suggestions.find(p=>p.materialId==='MOCK-RAW').availableDay,5);
 const localView=await ok(workbook+'/datasets/'+id+'/parameters?'+new URLSearchParams({scope,cp:'CP074',day:'5'}));const override=localView.records.find(p=>p.scope===scope);assert.equal(override.baseValue,'2');assert.equal(override.overrideValue,'0');await parameter({id:override['参数编号'],scope,operation:'inherit',value:'0'});
 const inherited=await ok(workbook+'/datasets/'+id+'/parameters?'+new URLSearchParams({scope,cp:'CP074',day:'5'}));assert.equal(inherited.records[0].effectiveValue,'2');
 // The deployed source is shared access: body role/actor cannot create identity.
 // Production CSRF/reason gates are tested directly, with no permission adapter.
 for(const headers of [{'origin':'https://foreign.invalid','sec-fetch-site':'cross-site'},{origin:'null'}]){const before=stateBytes();const denied=await call(workbook+'/datasets/'+id+'/parameters',{expectedVersion:version,...{}},headers);assert.equal(denied.status,403);assert.equal(denied.value.error,'csrf');assert.deepEqual(stateBytes(),before);}
 const beforeReason=stateBytes();assert.equal((await call(workbook+'/datasets/'+id+'/parameters',{reason:''})).status,400);assert.deepEqual(stateBytes(),beforeReason);
 const sameFrozen=await ok(workbook+'/runs/'+six.id+'/inputs');assert.deepEqual(sameFrozen,frozen);assert.equal(await ok(workbook+'/runs/'+six.id+'/export'),native);assert.equal((await ok(workbook+'/runs/'+six.id)).result.suggestions.find(p=>p.materialId==='MOCK-RAW').availableDay,6);
 await close();await open();assert.deepEqual(await ok(workbook+'/runs/'+six.id+'/inputs'),frozen);assert.equal(await ok(workbook+'/runs/'+six.id+'/export'),native);
 assert.equal(ownedWorkers.size,0);evidence.push({note:'This is a real HTTP/Worker self-test; browser dual-entry and private full Excel remain separate required checks.'});
});
