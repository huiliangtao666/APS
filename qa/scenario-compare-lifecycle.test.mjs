// A deterministic router seam for terminal races. Actual real Worker coverage
// is separate in scenario-compare-http.mjs; these are prepared, not executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {registerScenarioCompare} from '../server/scenario-compare-routes.mjs';
import {urgentBaseline,selection} from './urgent-order-fixture.mjs';
import {calculateWorkbook} from '../server/workbook-plan.mjs';
import {hash} from '../server/workbook-model.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(){
 const {d,result}=urgentBaseline(),base={id:'BASE',datasetId:d.id,version:1,status:result.status,result,resultHash:hash(result),inputRef:'BASEINPUT',inputHash:hash(d),selection},blobs=new Map([['BASEINPUT',d]]),handlers=new Map(),workers=new Map(),owned=[],data=[];
 let state={datasets:[],runs:[base],records:[]},starts=0,hold=false;
 const router=Object.fromEntries(['get','post'].map(method=>[method,(path,...fns)=>handlers.set(method+' '+path,fns.at(-1))]));
 registerScenarioCompare(router,{read:()=>structuredClone(state),write:s=>state=structuredClone(s),dataset:()=>structuredClone(d),snapshot:ref=>structuredClone(blobs.get(ref)),persist:value=>{const ref='R'+blobs.size;blobs.set(ref,structuredClone(value));return ref;},permission:()=>()=>{},actorKey:()=> 'SYNTHETIC',audit:()=>{},workers,scenarioEnvironment:()=>({maxScenarios:4,runSeconds:10,budgetSource:'synthetic only'}),workerFactory:input=>{starts++;const w=new EventEmitter();w.terminate=()=>hold?new Promise(resolve=>w.release=resolve):Promise.resolve();owned.push(w);data.push(input);return w;}});
 async function call(method,path,body={},params={}){let value,status=200;const res={status:n=>{status=n;return res;},json:v=>{value=v;return res;}};await handlers.get(method+' '+path)({body,params,query:{}},res,e=>{throw e;});return {status,value};}
 const {value:g}=await call('post','/scenario/groups',{runId:'BASE',expectedResultHash:base.resultHash,name:'Lifecycle',config:{maxScenarios:4,runSeconds:10,budgetSource:'synthetic only'},facts:{observationTime:'2026-11-01T08:00:00+08:00',tasks:result.tasks.map(t=>({id:t.id,status:'not_started'})),completed:Object.fromEntries(result.demandResults.map(r=>[r.id,0]))}});
 let group=g;for(let i=0;i<3;i++)group=(await call('post','/scenario/groups/:id/scenarios',{token:group.token,name:'C'+i,conditions:[]},{id:g.id})).value;
 const get=()=>state.scenarioGroups[0],batch=async()=>call('post','/scenario/groups/:id/batch',{token:group.token,scenarioIds:group.scenarios.map(c=>c.id),solver:'basic',requestId:'B1'},{id:g.id});
 return {call,workers,owned,data,get,batch,id:g.id,hold:v=>hold=v,starts:()=>starts,state:()=>state};
}
test('SC05 failure continues remaining only after exact Worker termination',async()=>{
 const h=await harness();h.hold(true);await h.batch();await tick();assert.equal(h.starts(),1);
 h.owned[0].emit('message',{kind:'failure'});await tick();assert.equal(h.starts(),1);assert.equal(h.workers.size,1);
 h.hold(false);h.owned[0].release();await tick();await tick();assert.equal(h.starts(),2);
 for(let i=1;i<3;i++){const {workbookData,selection}=h.data[i];h.owned[i].emit('message',{kind:'result',plan:calculateWorkbook(workbookData,selection)});await tick();await tick();}
 assert.equal(h.get().scenarios[0].status,'failed');assert.equal(h.state().runs.find(r=>r.id===h.get().scenarios[0].attempts[0].runId).result,null);assert.equal(h.workers.size,0);assert.equal(h.get().batches[0].status,'completed');
});
test('SC05 cancel queued/active items preserves completed outcome and cancels exact owner',async()=>{
 const h=await harness();await h.batch();await tick();const g=h.get(),b=g.batches[0];
 await h.call('post','/scenario/groups/:id/cancel',{batchId:b.id,scenarioId:g.scenarios[2].id},{id:h.id});assert.equal(h.get().scenarios[2].attempts[0].status,'cancelled');assert.equal(h.starts(),1);
 await h.call('post','/scenario/groups/:id/cancel',{batchId:b.id},{id:h.id});await tick();assert.equal(h.workers.size,0);assert.equal(h.get().scenarios[0].status,'cancelled');assert.equal(h.starts(),1);
 // A late successful message cannot turn cancelled back into completed.
 h.owned[0].emit('message',{kind:'result',plan:calculateWorkbook(h.data[0].workbookData,h.data[0].selection)});await tick();assert.equal(h.get().scenarios[0].status,'cancelled');
});
test('SC12 Worker memory error stops remaining queue without a hidden retry',async()=>{
 const h=await harness();await h.batch();await tick();h.owned[0].emit('error',Object.assign(new Error('synthetic memory signal'),{code:'ERR_WORKER_OUT_OF_MEMORY'}));await tick();await tick();assert.equal(h.starts(),1);assert.equal(h.workers.size,0);assert.equal(h.get().batches[0].status,'stopped');assert.equal(h.get().scenarios[1].status,'not_started');
});
