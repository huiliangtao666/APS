import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,defs} from '../server/planner.ts';
import {batchKeys} from '../src/lib/csv-contract.mjs';
import {freezeRunInput} from '../server/run-input.mjs';
import {verifyOriginalResources} from '../src/lib/verify-execution-resource-ledger.mjs';
import {verifyResourceMappingSnapshot} from '../src/lib/verify-resource-mapping.mjs';
import {n06Fixture,selection} from './n06-fixture.mjs';
import {configFixture,mapping} from './fr013-config-fixture.mjs';
import {jointEnabledFixture} from './r01r02-fixture.mjs';

const evaluationAt='2026-10-30T00:00:00Z';

test('integrated table registry has unique identities and complete batch coverage',()=>{
 assert.equal(new Set(defs.map(def=>def.key)).size,defs.length);
 assert.equal(new Set(defs.map(def=>def.file)).size,defs.length);
 assert.deepEqual([...batchKeys].sort(),defs.map(def=>def.key).sort());
});

function combinedInput(){
 const data=n06Fixture(),tool=data.tools[0];
 const source={'资源编号':'SOURCE-N06-TOOL','资源名称':'明确模拟原账工装','资源类型':'工具','可用数量':tool['可用数量'],'最早可用分钟':tool['可用起始分钟'],'最晚可用分钟':tool['可用结束分钟'],'共享范围':'全工厂'};
 data.originalTools=[source];
 data.resourceMappings=[mapping('originalTools',source,tool)];
 return data;
}

test('original resource ledger and CSV runtime mapping retain separate frozen contracts',()=>{
 const data=combinedInput(),before=JSON.stringify(data),frozen=freezeRunInput(data,selection,evaluationAt);
 const plan=calculate(frozen.executionData,0,evaluationAt,frozen.conditions);
 assert.equal(frozen.conditions.originalLedgerContract,'N06-finite-v1');
 assert.equal(frozen.conditions.originalResourceContract,'FR013-resource-map-v1');
 assert.equal(verifyOriginalResources(plan,frozen.executionData,frozen.conditions).status,'pass');
 assert.deepEqual(verifyResourceMappingSnapshot(frozen.executionData,frozen.conditions),[]);
 assert.equal(JSON.stringify(data),before);
});

test('tampering either frozen resource contract cannot be hidden by the other contract',()=>{
 const frozen=freezeRunInput(combinedInput(),selection,evaluationAt);
 const plan=calculate(frozen.executionData,0,evaluationAt,frozen.conditions);
 const badLedger={...frozen.conditions,executionResourceContract:'unknown-ledger'};
 assert.equal(verifyOriginalResources(plan,frozen.executionData,badLedger).status,'problem');
 assert.deepEqual(verifyResourceMappingSnapshot(frozen.executionData,badLedger),[]);
 const badMapping={...frozen.conditions,originalResourceContract:'unknown-mapping'};
 assert.equal(verifyOriginalResources(plan,frozen.executionData,badMapping).status,'pass');
 assert.ok(verifyResourceMappingSnapshot(frozen.executionData,badMapping).length);
 const mapped=freezeRunInput(configFixture('tool'),{},evaluationAt);
 assert.equal(verifyOriginalResources({},mapped.executionData,mapped.conditions),null);
});

test('space-limited resource batches split safely while conserving all orders and material',()=>{
 const data=jointEnabledFixture();
 data.batchResources.at(-1)['容量']='1000';
 const frozen=freezeRunInput(data,{},evaluationAt),plan=calculate(frozen.executionData,0,evaluationAt,frozen.conditions);
 assert.equal(plan.tasks.length,4);
 assert.equal(new Set(plan.tasks.filter(task=>task.operation==='MIX').map(task=>task.resourceBatchId)).size,2);
 assert.equal(plan.productionBatches.reduce((sum,batch)=>sum+batch.quantity,0),480);
 assert.equal(plan.materialDemands.filter(demand=>demand.committed).reduce((sum,demand)=>sum+demand.quantity,0),500);
 const reservations=plan.resourceReservations.filter(reservation=>reservation.type==='空间');
 for(const reservation of reservations){
  const load=reservations.filter(other=>other.start<=reservation.start&&other.end>reservation.start).reduce((sum,other)=>sum+Number(other.quantity),0);
  assert.ok(load<=1000);
 }
});
