import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runCpSat} from '../server/solver-choice/runner.mjs';
import {checkMinuteCandidate} from '../server/solver-choice/checker.mjs';
import {designMinuteModel} from './solver-choice-fixture.mjs';

// NOT executed by ordinary source syntax checks. The admitted application
// window supplies a reviewed runtime file; absent configuration is SKIP, never
// a fake engine or a PASS for native/production assertions.
const admitted=Boolean(process.env.APS_SOLVER141_RUNTIME_FILE);
function runtime(){return JSON.parse(fs.readFileSync(process.env.APS_SOLVER141_RUNTIME_FILE,'utf8'));}
test('REAL ENGINE SOL02/07/09/11/12: solve independent design model, consume returned assignments', {skip:!admitted},async()=>{
 const m=designMinuteModel(),r=await runCpSat(m,runtime());
 assert.equal(r.engine,'cp-sat');assert.equal(r.version,'9.15.6755');assert.ok(['OPTIMAL','FEASIBLE'].includes(r.rawStatus));
 const check=checkMinuteCandidate(m,r.candidate);assert.equal(check.status,'pass',check.issues.join(';'));
 assert.equal(r.candidate.tasks.find(t=>t.id==='A1').end-r.candidate.tasks.find(t=>t.id==='A1').start,17);
 assert.equal(r.candidate.allocations.reduce((n,a)=>n+a.quantity,0),10000);
});
test('REAL ENGINE SOL16: mandatory 61-minute task inside a 60-minute window', {skip:!admitted},async()=>{
 const m=designMinuteModel();m.tasks[0].duration=61;m.tasks[0].starts=[[0,0]];
 const r=await runCpSat(m,runtime());assert.equal(r.rawStatus,'INFEASIBLE');assert.equal(r.candidate,null);
});
test('REAL ENGINE SOL11: one declared material batch cannot cover 10kg if only 9kg exists', {skip:!admitted},async()=>{
 const m=designMinuteModel();m.lots[0].quantity=9000;
 const r=await runCpSat(m,runtime());assert.equal(r.rawStatus,'INFEASIBLE');assert.equal(r.candidate,null);
});
test('REAL ENGINE SOL12: directed cleaning consumes machine and crew once', {skip:!admitted},async()=>{
 const m=designMinuteModel();m.sequences=[{id:'M02-directed',resourceId:'M02',members:[{taskId:'A2',alternativeId:'M02',productId:'A'},{taskId:'B1',alternativeId:'M02',productId:'B'}],transitions:[{from:'A',to:'B',minutes:3,people:1,crewResourceId:'P01',source:'TEST-AB'},{from:'B',to:'A',minutes:2,people:1,crewResourceId:'P01',source:'TEST-BA'}]}];
 const r=await runCpSat(m,runtime());assert.ok(r.candidate);assert.equal(checkMinuteCandidate(m,r.candidate).status,'pass');assert.equal(r.candidate.cleaning.length,1);
});
test('SOL18: pre-cancel never acquires an owned native process', {skip:!admitted},async()=>{
 const controller=new AbortController();controller.abort();let owned=0;
 await assert.rejects(runCpSat(designMinuteModel(),{...runtime(),signal:controller.signal,onOwned:()=>owned++}),{code:'CP_CANCELLED'});
 assert.equal(owned,0);
});
