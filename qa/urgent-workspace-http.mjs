// Awaiting #155 runtime authorization. Internal synthetic feature fixture;
// this does not test platform sessions or claim an end-user deployment.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {Worker} from 'node:worker_threads';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkbookRouter} from '../server/workbook-router.mjs';
import {urgentBaseline,urgentRow,selection} from './urgent-order-fixture.mjs';
import {hash} from '../server/workbook-model.mjs';
import {workbookTables} from '../server/parameter-workbook-export.mjs';
import {DEMAND_FIELDS} from '../server/urgent-order-input.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aps-155-feature-')),owned=new Set(),receipts=[];let starts=0,server;
const permission=()=>((_req,_res,next)=>next()); // Internal fixture only.
function app(){const a=express();a.use(express.json({limit:'12mb'}));a.use('/api/workbooks',createWorkbookRouter({dataDir:dir,permission,actorKey:()=> 'SYNTHETIC-155',requestId:()=> 'SYNTHETIC-155',workerFactory:data=>{starts++;if(starts>1)throw Error('fixture permits one actual worker');const w=new Worker(new URL('../server/calculation-worker.mjs',import.meta.url),{workerData:data});owned.add(w);w.once('exit',()=>owned.delete(w));return w;}}));return a;}
async function listen(){server=app().listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});return 'http://127.0.0.1:'+server.address().port+'/api/workbooks';}
async function close(){if(server){await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));server=undefined;}}
let origin;async function call(method,url,body){const response=await fetch(origin+url,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify({reason:'synthetic #155 feature verification',...body})}:{})}),content=await response.text();let value;try{value=JSON.parse(content);}catch{value=content;}receipts.push({method,url,status:response.status,value});assert.ok(response.ok,JSON.stringify(receipts.at(-1)));return value;}
try{
 const {d,result}=urgentBaseline();assert.equal(result.verification.status,'pass');const stateDir=path.join(dir,'workbooks');fs.mkdirSync(stateDir,{recursive:true});const sourceRef='fixture.json.gz';fs.writeFileSync(path.join(stateDir,sourceRef),gzipSync(JSON.stringify(d)));
 const base={id:'BASE',datasetId:d.id,version:d.version,status:result.status,selection,inputHash:hash(d),inputRef:sourceRef,resultHash:hash(result),result,provenance:{}};
 fs.writeFileSync(path.join(stateDir,'state.json'),JSON.stringify({datasets:[{id:d.id,name:d.name,versions:[{version:d.version,ref:sourceRef}]}],previews:[],records:[],runs:[base]}));
 origin=await listen();let p=await call('POST','/urgent/plans',{runId:'BASE',expectedResultHash:base.resultHash,facts:{observationTime:'2026-11-01T09:17:00+08:00',tasks:result.tasks.map(t=>({id:t.id,status:'not_started'})),allocations:result.allocations.map((a,index)=>({index,sourceResultHash:base.resultHash,quantity:0,kind:'none',feedMinute:a.feedMinute})),completed:Object.fromEntries(result.demandResults.map(r=>[r.id,0]))}});
 const url='/urgent/plans/'+p.id;
 p=(await call('POST',url+'/workspace',{targetToken:p.targetToken,workspace:{freezeMinute:p.facts.observationMinute,semiFreezeMinute:p.facts.observationMinute,strategy:'delay',scope:'local',seedTaskIds:[],events:[],exceptions:[],overtime:[]}})).plan;
 const buffer=workbookTables([['每日需求',DEMAND_FIELDS,[DEMAND_FIELDS.map(k=>urgentRow()[k]??'')],'Synthetic #155 17-column demand']]);
 const preview=await call('POST',url+'/preview',{targetToken:p.targetToken,fileName:'synthetic.xlsx',fileBase64:buffer.toString('base64'),effectiveTime:'2026-11-01T09:17:00+08:00'});assert.equal(preview.valid,true);
 const commit={targetToken:preview.targetToken,previewId:preview.id,fileHash:preview.fileHash};p=(await call('POST',url+'/commit',commit)).plan;assert.equal((await call('POST',url+'/commit',commit)).idempotent,true);
 assert.equal((await call('POST',url+'/readiness',{targetToken:p.targetToken,solver:'basic'})).ready,true);
 const started=await call('POST',url+'/run',{targetToken:p.targetToken,solver:'basic'});let run;const deadline=Date.now()+45000;
 do{run=await call('GET','/runs/'+started.id);if(!['queued','running'].includes(run.status))break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<deadline);
 assert.ok(['completed','partial'].includes(run.status),JSON.stringify(run));assert.equal(run.result.verification.status,'pass');assert.equal(run.solver.actual,'basic');assert.equal(run.result.demandResults.length,4);
 const impact=await call('GET','/urgent/runs/'+run.id+'/impact');assert.equal(impact.inputHash,run.inputHash);assert.equal(impact.staleness.stale,false);
 const page=await call('POST','/urgent/runs/'+run.id+'/query',{inputHash:run.inputHash,query:{tab:'orders',pageSize:100,offset:0,sort:'demandId',direction:'asc'}});assert.equal(page.total,3);
 const snapshot=await call('GET','/urgent/runs/'+run.id+'/workspace-export');assert.equal(snapshot.inputHash,run.inputHash);assert.equal(snapshot.solver.actual,'basic');
 while(owned.size&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));assert.equal(owned.size,0);
 p=await call('GET',url);const adopted=await call('POST','/urgent/runs/'+run.id+'/candidate',{targetToken:p.targetToken,action:'adopt'});assert.equal(adopted.state,'adopted');assert.equal(adopted.plan.planVersions.length,1);
 await close();origin=await listen();const reopened=await call('GET','/runs/'+run.id);assert.equal(reopened.inputHash,run.inputHash);assert.equal(reopened.resultHash,run.resultHash);assert.equal((await call('GET',url)).headRunId,run.id);
 const state=JSON.parse(fs.readFileSync(path.join(stateDir,'state.json')));assert.equal(hash(state.runs.find(r=>r.id==='BASE')),hash(base));assert.equal(hash(JSON.parse((await import('node:zlib')).gunzipSync(fs.readFileSync(path.join(stateDir,sourceRef))))),hash(d));
 console.log(JSON.stringify({result:'PASS',scope:'synthetic actual router/loopback HTTP/one actual basic Worker/independent check/adoption/fresh-router reopen/frozen export',platformSession:'OUT_OF_SCOPE_BY_USER',realV2:'NOT_EXECUTED',browser:'NOT_EXECUTED',workerStarts:starts,owned:owned.size,receipts},null,2));
}finally{for(const w of owned)await w.terminate();await close();fs.rmSync(dir,{recursive:true,force:true});}
