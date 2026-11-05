// Synthetic real-router/HTTP/basic-Worker fixture; NOT EXECUTED until a #156
// window is supplied. No private workbook, production state or platform auth.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {Worker} from 'node:worker_threads';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkbookRouter} from '../server/workbook-router.mjs';
import {urgentBaseline,selection} from './urgent-order-fixture.mjs';
import {hash} from '../server/workbook-model.mjs';
import {workbookView} from '../src/lib/workbook-view.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aps-156-feature-')),stateDir=path.join(dir,'workbooks'),owned=new Set(),receipts=[];
let starts=0,peak=0,server,origin;const execution={maxScenarios:4,runSeconds:10,budgetSource:'synthetic #156 fixture only, not platform authorization'};
function app(){const a=express();a.use(express.json({limit:'2mb'}));a.use('/api/workbooks',createWorkbookRouter({dataDir:dir,permission:()=>((_req,_res,next)=>next()),actorKey:()=> 'SYNTHETIC-156',requestId:()=> 'SYNTHETIC-156',scenarioEnvironment:()=>execution,workerFactory:data=>{starts++;assert.ok(starts<=3,'this fixture permits at most three actual basic Workers');assert.equal(owned.size,0,'no parallel Worker');const w=new Worker(new URL('../server/calculation-worker.mjs',import.meta.url),{workerData:data,resourceLimits:{maxOldGenerationSizeMb:128}});owned.add(w);peak=Math.max(peak,owned.size);w.once('exit',()=>owned.delete(w));return w;}}));return a;}
async function listen(){server=app().listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});origin='http://127.0.0.1:'+server.address().port+'/api/workbooks';}
async function close(){if(server){await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));server=undefined;}}
async function call(method,url,body,expected){const response=await fetch(origin+url,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify({reason:'synthetic #156',...body})}:{})}),text=await response.text();let value;try{value=JSON.parse(text);}catch{value=text;}receipts.push({method,url,status:response.status,value});if(expected)assert.equal(response.status,expected,JSON.stringify(value));else assert.ok(response.ok,JSON.stringify(value));return value;}
try{
 fs.mkdirSync(stateDir,{recursive:true});const {d,result}=urgentBaseline();assert.equal(result.verification.status,'pass');const sourceRef='synthetic.json.gz';fs.writeFileSync(path.join(stateDir,sourceRef),gzipSync(JSON.stringify(d)));
 const base={id:'BASE',datasetId:d.id,version:d.version,status:result.status,selection,inputHash:hash(d),inputRef:sourceRef,resultHash:hash(result),result,provenance:{model:'workbook',timeUnit:'minute',minuteOrigin:d.minuteOrigin,dayZero:result.dayZero,fileHash:d.fileHash,mappingHash:hash(d.mapping),parameterHash:hash(d.tables['配置参数'])}};
 fs.writeFileSync(path.join(stateDir,'state.json'),JSON.stringify({datasets:[{id:d.id,versions:[{version:d.version,ref:sourceRef}]}],previews:[],runs:[base],records:[]}));await listen();
 let g=await call('POST','/scenario/groups',{runId:'BASE',expectedResultHash:base.resultHash,name:'Synthetic same-baseline group',config:execution,facts:{observationTime:'2026-11-01T08:00:00+08:00',tasks:result.tasks.map(t=>({id:t.id,status:'not_started'})),completed:Object.fromEntries(result.demandResults.map(r=>[r.id,0]))}}),url='/scenario/groups/'+g.id;
 const conditions=[[],[{id:'PEOPLE',type:'personnel',object:'CREW',before:10,after:12,unit:'人',start:1980,end:2460,routeStepIds:d.tables['工艺路线'].map(r=>r['路线工序编号']),source:'synthetic original crew qualifications'}],[{id:'OT',type:'overtime',object:'EQ1',crew:'CREW',before:0,after:17,unit:'分钟',start:2470,end:2487,people:1,capacityKg:6,tools:['TL'],source:'synthetic 17 minute overtime'}]];
 for(let i=0;i<3;i++)g=await call('POST',url+'/scenarios',{token:g.token,name:['same-condition control','non-bottleneck personnel','explicit overtime'][i],conditions:conditions[i]});
 const ids=g.scenarios.map(c=>c.id),request={token:g.token,scenarioIds:ids,solver:'basic',requestId:'BATCH-ONE'};
 g=await call('POST',url+'/batch',request,202);assert.equal((await call('POST',url+'/batch',request)).idempotent,true);
 const deadline=Date.now()+35000;do{g=await call('GET',url);if(!g.pendingOwned)break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<deadline);
 assert.equal(g.pendingOwned,false);assert.equal(starts,3);assert.equal(peak,1);assert.equal(owned.size,0);for(const c of g.scenarios){assert.ok(['completed','partial'].includes(c.status));assert.equal(c.attempts.length,1);assert.equal(c.attempts[0].run.solver.actual,'basic');workbookView(c.attempts[0].run);}
 let q=await call('POST',url+'/query',{});assert.equal(q.results.length,4);assert.equal(q.results[0].metrics.summary.N,3);assert.equal(q.results[1].metrics.summary.N,3);assert.equal(q.results[2].metrics.summary.onTimeRate,q.results[1].metrics.summary.onTimeRate);assert.equal((await call('POST',url+'/query',{demandIds:[]})).results[0].metrics.summary.N,0);
 const saved=q.results[1];await call('POST',url+'/candidate',{token:g.token,scenarioId:saved.id,runId:saved.runId,action:'save'});g=await call('GET',url);
 await close();await listen();const reopened=await call('GET',url);assert.equal(reopened.baseIdentity.inputHash,g.baseIdentity.inputHash);assert.equal(reopened.scenarios[0].attempts[0].run.resultHash,saved.resultHash);
 const exported=await call('POST',url+'/export',{demandIds:['N1']});assert.equal(exported.results[0].metrics.summary.N,1);assert.equal(exported.results[1].metrics.summary.N,1);
 g=reopened;const adopted=await call('POST',url+'/candidate',{token:g.token,scenarioId:saved.id,runId:saved.runId,action:'adopt'});assert.equal(adopted.state,'adopted');assert.equal((await call('POST',url+'/candidate',{scenarioId:saved.id,runId:saved.runId,action:'adopt'})).idempotent,true);
 await call('POST',url+'/candidate',{token:g.token,scenarioId:q.results[2].id,runId:q.results[2].runId,action:'adopt'},409);
 const s=JSON.parse(fs.readFileSync(path.join(stateDir,'state.json'),'utf8'));assert.equal(hash(s.runs.find(r=>r.id==='BASE')),hash(base));assert.equal(s.urgentPlans[0].planVersions.length,1);assert.equal(s.urgentPlans[0].headRunId,saved.runId);
 console.log(JSON.stringify({result:'PASS',scope:'synthetic real router/HTTP/three serial actual basic Workers/independent checks/KPI scope/save/reopen/export/explicit plan version/stale refusal',workerStarts:starts,peakWorkers:peak,owned:owned.size,realV2:'NOT_EXECUTED',browser:'NOT_EXECUTED',receipts},null,2));
}finally{for(const w of owned)await w.terminate();await close();fs.rmSync(dir,{recursive:true,force:true});}
