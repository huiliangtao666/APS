import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createSolverRunService} from '../server/solver-choice/run-service.mjs';
import {fingerprint as hash} from '../server/solver-choice/contract.mjs';

// These are explicit persisted-source integrity cases, not native engine output.
test('solver native export and comparison veto mixed request/actual/conditions; legacy unknown is preserved',async()=>{
 const input={id:'SOURCE-INTEGRITY-ONLY'},conditions={request:{requested:'basic'},conditionsHash:'frozen-conditions',inputHash:hash(input),selectionHash:'s',rulesHash:'r',objectiveHash:'o',budgetHash:'b'},solver={requested:'basic',actual:'basic',version:'recorded-basic-version',conditionsHash:conditions.conditionsHash};
 const result={solver},run={id:'new',status:'completed',inputRef:'input',inputHash:hash(input),solverConditions:conditions,solver:structuredClone(solver),result,resultHash:hash(result)};
 const old={id:'old',status:'failed',inputRef:'input',inputHash:hash(input)};let state={runs:[structuredClone(run),old]};const legacyHash=hash(old);
 const router=express.Router(),ctx={read:()=>structuredClone(state),snapshot:()=>input,permission:()=>((_req,_res,next)=>next()),handle:fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)};
 createSolverRunService(ctx).register(router);const app=express();app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),url='http://127.0.0.1:'+server.address().port;
 const read=p=>fetch(url+p);
 try{
  assert.equal((await read('/runs/new/solver-export')).status,200);
  assert.equal((await read('/runs/new/solver-comparison?other=new')).status,200);
  const legacy=await(await read('/runs/old/solver-export')).json();assert.equal(legacy.solver.actual,null);assert.equal(legacy.solver.version,null);
  for(const [name,mutate,error]of [
   ['request',r=>{r.solver.requested='cp-sat';},'solver_request_mismatch'],
   ['actual',r=>{r.solver.actual='cp-sat';},'solver_result_mismatch'],
   ['conditions',r=>{r.solverConditions.conditionsHash='changed';},'solver_result_mismatch'],
   ['version',r=>{r.solver.version='current-version';},'solver_result_mismatch'],
   ['plan actual',r=>{r.result.solver.actual='cp-sat';r.resultHash=hash(r.result);},'solver_result_mismatch'],
  ]){
   state.runs[0]=structuredClone(run);mutate(state.runs[0]);
   for(const path of ['/runs/new/solver-export','/runs/new/solver-comparison?other=old','/runs/old/solver-comparison?other=new']){const r=await read(path);assert.equal(r.status,409,name+path);assert.equal((await r.json()).error,error);}
  }
  assert.equal(hash(state.runs[1]),legacyHash);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
