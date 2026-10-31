import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {hostProcess} from './b234-host-client.mjs';import {n06Fixture,event,source,selection} from './n06-fixture.mjs';import {hp04Fixture,hp04Orders} from './hp04-fixture.mjs';import {scenarioFiles} from './b3-material-fixture.mjs';
import {originalIssues} from '../src/lib/execution-resource-ledger.mjs';import {verifyOriginalResources} from '../src/lib/verify-execution-resource-ledger.mjs';import {freezeRunInput} from '../server/run-input.mjs';import {calculate} from '../server/planner.ts';
const out=process.env.HP04_OUT;const dump=(name,x)=>{if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/'+name,JSON.stringify(x,null,2));}};
async function install(f,d){const state=await f.ok('/state'),response=await f.call('/imports/preview',{revision:state.revision,files:scenarioFiles(d)}),pre=response.body;assert.equal(response.status,200,JSON.stringify(pre.issues||pre));assert.equal(pre.valid,true,JSON.stringify(pre.issues));return f.ok('/imports/commit',{previewId:pre.id});}
test('N06 mock-only negative source namespace/version/real label and independent frozen source corruption',()=>{
 for(const kind of ['真实客户','MOCK','']){const d=n06Fixture(),doc=JSON.parse(d.originalResourceEvents[0]['原账JSON']);doc.sources[0].kind=kind;d.originalResourceEvents[0]=event(doc);assert.ok(originalIssues(d).length);}
 const d=n06Fixture(),input=freezeRunInput(d,selection),plan=calculate(input.executionData,1,input.conditions.ruleEvaluationAt,input.conditions);
 assert.equal(verifyOriginalResources(plan,input.executionData,input.conditions).status,'pass');
 const bad=structuredClone(input.executionData),doc=JSON.parse(bad.originalResourceEvents[0]['原账JSON']);doc.sources[0].version='';bad.originalResourceEvents[0]=event(doc);assert.equal(verifyOriginalResources(plan,bad,input.conditions).status,'problem');
 const alias=structuredClone(d);alias.originalResourceEvents[0]['原账编号']='site:actual';assert.ok(originalIssues(alias).length);
 dump('n06-source-corruption.json',{input,plan,negative:verifyOriginalResources(plan,bad,input.conditions)});
});
test('H-P04/N06 real CSV/API/Worker, actual process termination/restart, native export and append-only release/source history',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hp04-n06-process-'));let f=await hostProcess(dir);const logs=[];
 try{
  await install(f,n06Fixture({unknown:true}));let state=await f.ok('/state');const bytes=f.bytes();const unready=await f.call('/runs',{revision:state.revision,selection});assert.ok(unready.status>=400);assert.equal(f.bytes(),bytes);
  const rows=state.data.originalResourceEvents,doc=JSON.parse(rows[0]['原账JSON']);doc.sources.push(source('release'));doc.eventSource='release';doc.reason='明确模拟全部归还';doc.occupancies[0].end=40;doc.occupancies[0].releaseSource='release';const release=event(doc,'e2','e1','释放');
  await f.ok('/inputs',{revision:state.revision,tables:{originalResourceEvents:[...rows,release]}});state=await f.ok('/state');const initial=await f.ok('/runs',{revision:state.revision,selection});let run;
  for(let n=0;n<400;n++){run=await f.ok('/runs/'+initial.id);if(['completed','partial','failed'].includes(run.status))break;await new Promise(r=>setTimeout(r,15));}assert.ok(['completed','partial'].includes(run.status));
  const snapshot=await f.ok('/runs/'+run.id+'/inputs'),plan=(await f.ok('/plans')).find(p=>p.id===run.planId);assert.equal(plan.originalResourceProtection[0].eventId,'e2');assert.equal(plan.originalResourceProtection[0].sourceRecords.length,2);
  const csv=await f.ok('/export',{planId:plan.id});assert.ok(csv.includes('MOCK取得归还释放账')&&csv.includes('MOCK:L-A')&&csv.includes('release'));
  const before=await f.ok('/state');const rejected=[];
  for(const next of [[],[release,...rows],rows]){const beforeBytes=f.bytes(),r=await f.call('/inputs',{revision:before.revision,tables:{originalResourceEvents:next}});assert.equal(r.status,409,JSON.stringify(r));assert.equal(f.bytes(),beforeBytes);rejected.push(r);}
  const firstPid=f.pid;logs.push(await f.close());f=await hostProcess(dir);assert.notEqual(f.pid,firstPid);assert.deepEqual(await f.ok('/runs/'+run.id+'/inputs'),snapshot);assert.deepEqual((await f.ok('/state')).data.originalResourceEvents,[...rows,release]);assert.equal(await f.ok('/export',{planId:plan.id}),csv);dump('n06-process.json',{firstPid,secondPid:f.pid,run,snapshot,plan,csv,rejected,state:await f.ok('/state')});
 }finally{logs.push(await f.close());dump('process-logs.json',logs);fs.rmSync(dir,{recursive:true,force:true});}
});
test('H-P04 both orders admit via CSV, retain raw source and source versions on native schedule CSV',async()=>{
 for(const order of hp04Orders){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hp04-csv-'));const f=await hostProcess(dir);
  try{await install(f,hp04Fixture(order));const s=await f.ok('/state'),p=await f.ok('/calculate',{revision:s.revision,selection:{orderIds:['A','B'],startMinute:0,endMinute:600}});assert.deepEqual(p.tasks.map(t=>[t.start,t.end]),[[5,35],[50,80]]);const csv=await f.ok('/export',{planId:p.id});assert.ok(csv.includes('MOCK-hp04-r1')&&csv.includes(order));dump('hp04-csv-'+hp04Orders.indexOf(order)+'.json',{plan:p,csv,state:await f.ok('/state')});}finally{await f.close();fs.rmSync(dir,{recursive:true,force:true});}
 }
});
