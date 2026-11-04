import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,validateSpec,advanceDay,applyEvent} from '../../server/simulator/model.mjs';
import {threeDaySpec} from './three-day.mjs';
import {fingerprint} from '../../server/simulator/contract.mjs';
import {nativeFixture,rehash,schema} from './import-fixture.mjs';
import {convertNative} from '../../server/simulator/import.mjs';
import {rawHash} from '../../server/simulator/source.mjs';
import {applyParameters} from '../../server/parameter-contract.mjs';

function openingSpec(){
 const s=threeDaySpec();s.startDate='2026-11-02';s.events=[];
 s.lots[0].quantity=s.lots[0].qualified=80; // Explicit扣后余额; historical 30 must not be rededucted.
 s.tasks=s.tasks.slice(0,1);const t=s.tasks[0];
 t.totalMinutes=60;t.resources=[{id:'M01',quantity:1},{id:'T01',quantity:1}];
 t.opening={asOf:s.startDate+'T00:00:00+08:00',source:'EXPLICIT_ENGINEERING_OPENING',status:'PAUSED',startedAt:'2026-11-01T17:23:00+08:00',
  processedMinutes:20,remainingMinutes:40,consumed:{RAW01:30},output:0,scrap:0,receivedOutput:0,
  holds:t.resources.map(r=>({resourceId:r.id,quantity:r.quantity,startAt:'2026-11-01T17:23:00+08:00',endAt:null}))};
 return s;
}
test('G01 explicit opening preserves prior cumulative, remaining minutes and paused holds without double deduction',()=>{
 const s=validateSpec(openingSpec()),state=initialState(s),out=advanceDay(s,state,'2026-11-02');
 assert.equal(out.state.tasks[0].processedMinutes,20);assert.equal(out.state.tasks[0].remainingMinutes,40);
 assert.equal(out.state.lots[0].quantity,80);assert.equal(out.state.holds.length,2);
 const t=out.state.tasks[0];t.status='RUNNING';t.activeSince='2026-11-02T00:00:00+08:00';
 const event={id:'CUM',type:'CONSUME_CUMULATIVE',occurredAt:'2026-11-02T00:01:00+08:00',knownAt:'2026-11-02T00:01:00+08:00',effectiveAt:'2026-11-02T00:01:00+08:00',businessDate:'2026-11-02',source:'explicit-test',causes:[],data:{taskId:t.id,lotId:'RAW01',cumulative:30}};
 applyEvent(s,out.state,event);assert.equal(out.state.lots[0].quantity,80);
 applyEvent(s,out.state,{...event,id:'CUM80',data:{...event.data,cumulative:80}});assert.equal(out.state.lots[0].quantity,30);
});
test('G01 incomplete/contradictory opening does not turn unknown cumulative or resources into zero',()=>{
 const s=openingSpec();delete s.tasks[0].opening.consumed;assert.throws(()=>validateSpec(s),{code:'OPENING_PROGRESS_REQUIRED'});
 const a=openingSpec();a.tasks[0].opening.holds=[];assert.throws(()=>validateSpec(a),{code:'OPENING_HOLD_REQUIRED'});
 const b=openingSpec();b.tasks[0].opening.status='PLANNED';assert.throws(()=>validateSpec(b),{code:'OPENING_PLANNED_CONFLICT'});
 const c=openingSpec();c.tasks[0].opening.asOf='2026-11-01T00:00:00+08:00';assert.throws(()=>validateSpec(c),{code:'OPENING_TASK_REQUIRED'});
});
test('frozen effectiveParameters metadata supplies original P day without changing original hash or choosing simulation day',()=>{
 const f=nativeFixture();applyParameters(f.frozen.input,0,'dataset');rehash(f);
 f.calendar.startDate='2026-11-01';f.opening.asOf=f.calendar.startDate+'T00:00:00+08:00';
 for(const group of ['purchases','demands'])for(const v of Object.values(f.opening[group]))v.asOf=f.opening.asOf;
 f.opening.lots={LOT:{asOf:f.opening.asOf,source:'explicit-engineering-fact',quantity:100,externalReserved:20,quality:'合格'}};
 const before=fingerprint(f),out=convertNative(f,schema);
 assert.equal(out.references.parameters.resolutionDay,0);assert.equal(out.references.parameters.contextSource,'effectiveParameters');
 assert.equal(fingerprint(f),before);assert.equal(out.status,'READY_FOR_SELFTEST');
});
test('native past frozen task with explicit cumulative execution and matching WIP initializes retained resource instead of a new task',()=>{
 const f=nativeFixture(),d=f.frozen.input;
 d.tables['设备与工装']=[{'资源编号':'M','资源占用方式':'独占','可用数量':'1'}];
 d.tables['期初在制']=[{'在制批次编号':'W','成品编号':'FG'}];d.tables['在制剩余映射']=[{'在制批次编号':'W','当前占用设备编号':'M'}];
 f.production={mode:'FROZEN_TASKS',taskIds:['T'],planUse:'EXPLICIT_COPY'};
 f.opening.taskFacts={T:{source:'EXPLICIT_ENGINEERING_NOT_SITE',nativeWipId:'W',totalProcessingMinutes:60,confirmAllocationsComplete:true,
  opening:{asOf:f.opening.asOf,source:'EXPLICIT_ENGINEERING_NOT_SITE',status:'PAUSED',startedAt:'2026-10-30T23:00:00+08:00',processedMinutes:20,remainingMinutes:40,
   consumed:{LOT:30},output:0,scrap:0,receivedOutput:0,holds:[{resourceId:'M',quantity:1,startAt:'2026-10-30T23:00:00+08:00',endAt:null}]}}};
 const r=f.frozen.run;r.status='completed';r.result={status:'completed',timeUnit:'minute',minuteOrigin:f.calendar.minuteOrigin,dayZero:f.calendar.dayZero,
  source:{datasetId:d.id,version:d.version,fileHash:d.fileHash,mappingHash:rawHash(d.mapping),parameterHash:rawHash(d.tables['配置参数'])},conditions:{...r.selection,interval:'[start,end)'},
  tasks:[{id:'T',productId:'FG',start:-60,end:60,quantity:28,machine:'M',people:0,tools:[]}],allocations:[{taskId:'T',consumer:'MAKE',need:'D',materialId:'RAW',supplyId:'inventory:LOT',feedMinute:-60,quantity:30}]};
 r.resultHash=rawHash(r.result);rehash(f);
 const before=fingerprint(f),out=convertNative(f,schema);assert.equal(out.status,'READY_FOR_SELFTEST');
 const state=initialState(out.spec);assert.equal(state.tasks[0].status,'PAUSED');assert.equal(state.tasks[0].consumed.LOT,30);assert.equal(state.lots[0].quantity,100);assert.equal(state.holds[0].resourceId,'M');
 assert.equal(fingerprint(f),before);
 const noFacts=structuredClone(f);delete noFacts.opening.taskFacts.T.opening;assert.equal(convertNative(noFacts,schema).spec,null);
});
