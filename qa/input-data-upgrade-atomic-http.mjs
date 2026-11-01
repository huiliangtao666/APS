import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {gunzipSync} from 'node:zlib';
import express from 'express';
import {hash} from '../server/workbook-model.mjs';

// Runtime-only memory instrumentation: real product fork, real worker module,
// parsing, validation, HTTP routes and persistence. No response/algorithm mocks.
const children=[],realFork=childProcess.fork;
childProcess.fork=function(module,args,options){const actual={...options,execArgv:['--max-old-space-size=64']};children.push({module:String(module),execArgv:actual.execArgv});return realFork(module,args,actual);};
syncBuiltinESMExports();
const {createWorkbookRouter}=await import('../server/workbook-router.mjs');
const root=process.env.ATOMIC_PRIVATE_STATE,fixtures=process.env.ATOMIC_FIXTURES;
if(!root?.startsWith('/tmp/input-atomic-r1/')||!fixtures)throw Error('Explicit private /tmp state required');
if(fs.existsSync(root))throw Error('Refusing to reuse a previous HTTP state');
fs.mkdirSync(root,{recursive:true});
const report={results:[],children,requests:[],runtime:{node:process.version,heapLimitMiB:64,execArgv:process.execArgv,listener:'127.0.0.1:ephemeral',root}};
let server,base;
async function start(){const app=express();app.use(express.json({limit:'2mb'}));app.use('/workbooks',createWorkbookRouter({dataDir:root,permission:()=> (_req,_res,next)=>next(),actorKey:()=> 'isolated-task-selftest',requestId:()=> 'input-atomic-r1'}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
async function stop(){server.closeAllConnections();await new Promise(r=>server.close(r));}
async function call(route,body,status=200){const response=await fetch(base+'/workbooks'+route,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const result=await response.json();report.requests.push({route,request:body?{...body,fileBase64:body.fileBase64?'sha256:'+hash(Buffer.from(body.fileBase64,'base64')):undefined}:null,status:response.status,response:result});assert.equal(response.status,status,JSON.stringify(result));return result;}
const preview=name=>call('/preview',{datasetId:'ATOMIC_PRIVATE',name:'explicit synthetic 4-level fixture',fileBase64:fs.readFileSync(path.join(fixtures,name+'.xlsx')).toString('base64'),ignore:['物料清单:未知业务字段']});
const commit=(p,status=200)=>call('/commit',{previewId:p.id,fileHash:p.fileHash,expectedVersion:p.expectedVersion},status);
const statePath=path.join(root,'workbooks/state.json');
function protectedVersion(){const s=JSON.parse(fs.readFileSync(statePath)),set=s.datasets.find(d=>d.id==='ATOMIC_PRIVATE'),files=new Set();for(const v of set.versions){files.add(v.ref);files.add(v.fileHash+'.xlsx');for(const ref of Object.values(v.tableRefs))files.add(ref);}return {datasetHash:hash(set),versions:set.versions.map(v=>v.version),files:Object.fromEntries([...files].sort().map(ref=>[ref,hash(fs.readFileSync(path.join(root,'workbooks',ref)))]))};}
function snapshot(){const s=JSON.parse(fs.readFileSync(statePath));return JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'workbooks',s.datasets[0].versions.at(-1).ref))));}
async function check(id,fn){const details=await fn();report.results.push({id,result:'PASS',details});}
try{
 await start();let p=await preview('valid');assert.equal(p.canCommit,true,JSON.stringify(p.issues));await commit(p);
 const initial=protectedVersion();report.initial=initial;
 await check('IN06-HTTP-persisted-recomputed-parameter',async()=>{const r=await call('/datasets/ATOMIC_PRIVATE/rows?table='+encodeURIComponent('物料主数据'));assert.equal(r.rows[0]['生产提前期天数'],'4');assert.equal(r.rows[0]['累计提前期天数'],'13');assert.equal(snapshot().bindings[0].parameterId,'PA0001');return {version:1,lead:'13',sourceHash:p.fileHash};});
 for(const [name,code]of [['unknown-child','FOREIGN_KEY'],['duplicate-header','DUPLICATE_HEADER'],['unknown-column','UNKNOWN_FIELD'],['unheaded-column','UNKNOWN_FIELD'],['parameter-known-formula','INVALID_FORMULA'],['parameter-unknown-formula','INVALID_FORMULA'],['parameter-external-formula','INVALID_FORMULA'],['parameter-empty-formula','INVALID_FORMULA'],['derived-unknown-formula','INVALID_FORMULA'],['derived-external-formula','INVALID_FORMULA'],['self-cycle','BOM_CYCLE'],['multilevel-cycle','BOM_CYCLE'],['overlap','BOM_VERSION_OVERLAP'],['empty-interval','INPUT_INVALID']]){
  await check('atomic-rejected-import-'+name,async()=>{const before=protectedVersion();p=await preview(name);assert.equal(p.canCommit,false);const i=p.issues.find(i=>i.code===code);assert.ok(i?.cell,JSON.stringify(p.issues));const between=protectedVersion();assert.deepEqual(between,before);await commit(p,422);assert.deepEqual(protectedVersion(),before);return {issue:i,before,after:protectedVersion(),previewId:p.id};});
 }
 for(const [name,table,key,changes,code]of [
  ['UNKNOWN99','物料清单','BM001',{'子项编号':'UNKNOWN99'},'FOREIGN_KEY'],
  ['self-cycle','物料清单','BM001',{'子项编号':'FG001'},'BOM_CYCLE'],
  ['multilevel-cycle','物料清单','BM003',{'子项编号':'FG001'},'BOM_CYCLE'],
  ['parameter-formula','配置参数','PA0001',{'参数值':'SUM(1,3)'},'INPUT_INVALID'],
  ['empty-interval','物料清单','BM001',{'失效日':'0'},'INPUT_INVALID']]){
  await check('atomic-rejected-save-'+name,async()=>{const before=protectedVersion(),stateBefore=hash(fs.readFileSync(statePath));const r=await call('/datasets/ATOMIC_PRIVATE/edit',{expectedVersion:1,table,key,changes},422);assert.ok(r.issues.some(i=>i.code===code));assert.deepEqual(protectedVersion(),before);assert.equal(hash(fs.readFileSync(statePath)),stateBefore);return {issues:r.issues,stateHash:stateBefore,version:1};});
 }
 await check('IN17-overlap-save-rejected-and-adjacent-version-accepted',async()=>{
  // Create an adjacent relation through the actual save route, then attempt
  // to move its start back onto the previous version's final effective day.
  const changes={'用量关系编号':'BM004','清单版本编号':'VBM004','父项编号':'FG001','子项编号':'SF001','父项基准产出千克':'1000','子项基准用量':'100','数量单位':'千克','标准收率':'0.96','生效日':'44','失效日':'45'};
  await call('/datasets/ATOMIC_PRIVATE/edit',{expectedVersion:1,table:'物料清单',key:'BM004',operation:'create',changes});const before=protectedVersion(),stateBefore=hash(fs.readFileSync(statePath));assert.deepEqual(before.versions,[1,2]);const r=await call('/datasets/ATOMIC_PRIVATE/edit',{expectedVersion:2,table:'物料清单',key:'BM004',changes:{'生效日':'43'}},422);assert.ok(r.issues.some(i=>i.code==='BOM_VERSION_OVERLAP'));assert.equal(hash(fs.readFileSync(statePath)),stateBefore);assert.deepEqual(protectedVersion(),before);return {issues:r.issues,versions:before.versions,stateHash:stateBefore};
 });
 await check('IN05-reordered-OOXML-real-commit-and-bound-parameter-edit',async()=>{p=await preview('valid-reorder');assert.equal(p.canCommit,true,JSON.stringify(p.issues));await commit(p);const r=await call('/datasets/ATOMIC_PRIVATE/edit',{expectedVersion:3,table:'物料主数据',key:'FG001',changes:{'生产提前期天数':'5'}});assert.equal(r.version,4);const d=snapshot();assert.equal(d.tables['配置参数'][0]['参数值'],'5');assert.equal(d.tables['物料主数据'][0]['累计提前期天数'],'14');for(const [ref,sha]of Object.entries(initial.files))assert.equal(hash(fs.readFileSync(path.join(root,'workbooks',ref))),sha);return {version:4,parameter:'5',lead:'14',originalVersionFilesUnchanged:true};});
 await check('persistent-reopen-retains-all-versions-and-original-source',async()=>{const before=protectedVersion();await stop();await start();const d=await call('/datasets/ATOMIC_PRIVATE');assert.deepEqual(d.versions,[1,2,3,4]);assert.deepEqual(protectedVersion(),before);const old=await call('/datasets/ATOMIC_PRIVATE/rows?version=1&table='+encodeURIComponent('物料主数据'));assert.equal(old.rows[0]['生产提前期天数'],'4');assert.equal(old.rows[0]['累计提前期天数'],'13');return {versions:d.versions,before,after:protectedVersion()};});
 report.final=protectedVersion();
}catch(e){report.results.push({id:'HTTP-execution',result:'FAIL',message:e.message,stack:e.stack});process.exitCode=1;}
finally{if(server?.listening)await stop();childProcess.fork=realFork;syncBuiltinESMExports();report.pass=report.results.filter(r=>r.result==='PASS').length;report.fail=report.results.filter(r=>r.result==='FAIL').length;fs.writeFileSync(process.env.ATOMIC_REPORT||path.join(root,'http-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,fail:report.fail,workers:children.length,results:report.results.filter(r=>r.result==='FAIL')}));}
