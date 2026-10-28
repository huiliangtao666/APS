// Run only after npm run build, inside the disposable app container.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {seed} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
test('FR018 production worker bundle executes a frozen selection and returns actual horizon findings',async()=>{
 const frozen=freezeRunInput(seed,{orderIds:['A'],startMinute:60,endMinute:100});
 const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:0,calculatedAt:new Date().toISOString()}});
 const result=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);worker.on('exit',code=>{if(code)reject(Error('worker exit '+code));});});
 assert.deepEqual(result.tasks.map(t=>t.id),['A-MIX']);assert.equal(result.tasks[0].start,60);assert.ok(result.findings.some(f=>f.code.includes('HORIZON')));await worker.terminate();
});


test('FR019 production Worker bundle applies explicit minimal mode beyond calendar end',async()=>{
 const frozen=freezeRunInput(seed,{mode:'minimal-r1',orderIds:['A'],startMinute:600,endMinute:660});
 const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:0,calculatedAt:new Date().toISOString()}});
 try{
  const p=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);});
  assert.deepEqual(p.tasks.map(t=>[t.start,t.end]),[[600,630],[630,660]]);assert.equal(p.findings.length,0);assert.equal(p.ruleSnapshot.checkScope.mode,'minimal-r1');assert.match(p.ruleSnapshot.note,/不代表完整业务/);
 }finally{await worker.terminate();}
});

import {materialFixture} from './material-fixture.mjs';
test('FR020 production Worker calculates BOM,FEFO lots and packaging from frozen canonical data',async()=>{
 const data=materialFixture(seed),frozen=freezeRunInput(data,{endMinute:600});
 const worker=new Worker(new URL('../dist/calculation-worker.mjs',import.meta.url),{workerData:{...frozen,revision:0,calculatedAt:'2026-10-29T00:00:00Z'}});
 try{
  const p=await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.kind==='result')resolve(m.plan);if(m.kind==='failure')reject(Error(m.code));});worker.on('error',reject);});
  assert.equal(p.tasks.length,2);assert.equal(p.materialChecked,true);assert.deepEqual(p.materialDemands.map(r=>r.quantity),[325,75,75,25,1213]);assert.ok(p.materialDemands.every(r=>r.committed&&r.shortage===0));assert.equal(p.ruleSnapshot.capabilityVersion,'FR020-v1');
 }finally{await worker.terminate();}
});
