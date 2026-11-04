import test from 'node:test';
import assert from 'node:assert/strict';
import {convertNative} from '../../server/simulator/import.mjs';
import {rawHash} from '../../server/simulator/source.mjs';
import {initialState,snapshot} from '../../server/simulator/model.mjs';
import {nativeFixture,rehash,schema} from './import-fixture.mjs';

test('native fields preserve ordered 60 / received 40, occupied stock 20 and P14 over B7; source unchanged',()=>{
  const f=nativeFixture(),before=rawHash(f),out=convertNative(f,schema);
  assert.equal(out.status,'READY_FOR_SELFTEST');assert.ok(out.spec);
  assert.equal(out.spec.planningWindowDays,14);assert.equal(out.spec.purchases[0].ordered,60);assert.equal(out.spec.purchases[0].received,40);
  assert.equal(out.spec.lots[0].quantity,100);assert.equal(out.spec.lots[0].externalReserved,20);
  assert.equal(out.spec.reference.bom[0].quantity,1200);assert.equal(out.spec.reference.bom[0].yieldRate,0.8);
  assert.equal(out.spec.reference.bom[0].automaticConsumption,false);assert.equal(rawHash(f),before);
  assert.equal(out.references.parameters.definitions.length,f.frozen.input.parameterDefinitions.length);
  const snap=snapshot(out.spec,initialState(out.spec),'2026-10-31');assert.equal(snap.lots[0].free,80);assert.equal(snap.bom.length,1);
});
test('missing receipt/cancellation and demand histories are separate located blockers, never zero-filled',()=>{
  const f=nativeFixture();delete f.opening.purchases.PO;delete f.opening.demands.D;
  const out=convertNative(f,schema);assert.equal(out.spec,null);
  assert.ok(out.diagnostics.some(i=>i.path==='opening.purchases.PO'));assert.ok(out.diagnostics.some(i=>i.path==='opening.demands.D'));
  assert.deepEqual(out.mapped.purchases,[]);assert.deepEqual(out.mapped.demands,[]);
});
test('stale native frozen hash rejected even if caller claims SECOND_P',()=>{
  const f=nativeFixture();f.frozen.input.tables['期初库存'][0]['当前数量']='1';
  assert.throws(()=>convertNative(f,schema),e=>e.code==='FROZEN_INPUT_MISMATCH');
});
test('P explicit missing does not fall back to B window 7',()=>{
  const f=nativeFixture(),p=f.frozen.input.tables['配置参数'].find(p=>p['参数编号']==='P-WINDOW');p['参数值']='';p._blocked=true;
  const out=convertNative(rehash(f),schema);assert.equal(out.spec,null);
  assert.ok(out.diagnostics.some(i=>i.code==='PARAMETER_VALUE_REQUIRED'));assert.ok(out.references.parameters.active.some(p=>p.blocked));
});
test('calendar cannot move real opening inventory to next day or silently shift minute origin',()=>{
  const f=nativeFixture();f.calendar.startDate='2026-11-01';f.opening.asOf='2026-11-01T00:00:00+08:00';
  const out=convertNative(f,schema);assert.equal(out.spec,null);assert.ok(out.diagnostics.some(i=>i.path==='opening.lots.LOT'));
  const g=nativeFixture();g.frozen.run.provenance={minuteOrigin:'2026-10-31T00:00:00+08:00'};g.calendar.minuteOrigin='2026-11-02T08:00:00+08:00';
  assert.throws(()=>convertNative(g,schema),e=>e.code==='MINUTE_ORIGIN_MISMATCH');
});
test('unknown quality, missing precision and schema-field drift have explicit blockers',()=>{
  const f=nativeFixture();f.frozen.input.tables['期初库存'][0]['质量状态']='未知';
  let out=convertNative(rehash(f),schema);assert.equal(out.spec,null);assert.ok(out.diagnostics.some(i=>i.code==='QUALITY_MAPPING_REQUIRED'));
  const g=nativeFixture();delete g.opening.materialScales.RAW;out=convertNative(g,schema);assert.equal(out.spec,null);
  const s=structuredClone(schema);s.tables['期初库存'].fields=s.tables['期初库存'].fields.filter(f=>f.name!=='当前数量');
  assert.throws(()=>convertNative(nativeFixture(),s),e=>e.code==='NATIVE_FIELD_UNMAPPED');
});
test('BOM cycles and conflicting active versions blocked; no additional yield deduction',()=>{
  const f=nativeFixture();f.frozen.input.tables['物料清单'].push({...f.frozen.input.tables['物料清单'][0],'用量关系编号':'CYCLE','父项编号':'RAW','子项编号':'FG'});
  const out=convertNative(rehash(f),schema);assert.equal(out.spec,null);assert.ok(out.diagnostics.some(i=>i.code==='BOM_CYCLE'));
});
test('opaque WIP remains visible in non-production issues and is not initialized as fresh task',()=>{
  const f=nativeFixture();f.frozen.input.tables['期初在制']=[{'在制批次编号':'WIP','已投料口径':'未提供累计事实'}];
  const out=convertNative(rehash(f),schema);assert.equal(out.status,'READY_WITH_UNCOVERED_NON_PRODUCTION');
  assert.equal(out.spec.tasks.length,0);assert.equal(initialState(out.spec).issues[0].id,'IMPORT-G01-WIP');
  assert.equal(out.references.nativeContext['期初在制'][0]['在制批次编号'],'WIP');
});
test('source conversion is deterministic and preserves two separate minute axes',()=>{
  const f=nativeFixture(),a=convertNative(f,schema),b=convertNative(f,schema);assert.equal(a.contentHash,b.contentHash);
  assert.equal(a.references.timeBases.minuteOrigin,'2026-10-31T00:00:00+08:00');
  assert.equal(a.references.timeBases.csvMinuteOrigin,'2026-11-02T08:00:00+08:00');
});

function productionFixture(){
  const f=nativeFixture(),d=f.frozen.input;
  d.tables['设备与工装']=[{'资源编号':'M','资源占用方式':'独占','可用数量':'1'}];
  f.production={mode:'FROZEN_TASKS',taskIds:['T'],planUse:'EXPLICIT_COPY'};
  f.opening.taskFacts={T:{source:'explicit-engineering-processing-fact',totalProcessingMinutes:17,confirmAllocationsComplete:true}};
  const r=f.frozen.run;r.status='completed';r.result={status:'completed',timeUnit:'minute',minuteOrigin:'2026-10-31T00:00:00+08:00',dayZero:'2026-10-31',
    source:{datasetId:d.id,version:d.version,fileHash:d.fileHash,mappingHash:rawHash(d.mapping),parameterHash:rawHash(d.tables['配置参数'])},
    conditions:{...r.selection,interval:'[start,end)'},tasks:[{id:'T',productId:'FG',start:487,end:504,quantity:28,machine:'M',people:0,tools:[]}],
    allocations:[{taskId:'T',consumer:'MAKE',need:'D',materialId:'RAW',supplyId:'inventory:LOT',feedMinute:487,quantity:30}]};
  r.resultHash=rawHash(r.result);return rehash(f);
}
test('explicit frozen 08:07–08:24 task maps 17 processing minutes and raw allocation30 once',()=>{
  const f=productionFixture(),before=rawHash(f),out=convertNative(f,schema);
  assert.equal(out.status,'READY_FOR_SELFTEST');assert.equal(out.spec.tasks[0].totalMinutes,17);
  assert.equal(out.spec.tasks[0].plannedStart,'2026-10-31T08:07:00+08:00');assert.equal(out.spec.tasks[0].plannedEnd,'2026-10-31T08:24:00+08:00');
  assert.deepEqual(out.spec.tasks[0].startRequirements,[{lotId:'LOT',cumulative:30}]);assert.equal(rawHash(f),before);
});
test('changed frozen result, day plan, weight sharing and conditional incoming supply are not forced through',()=>{
  const a=productionFixture();a.frozen.run.result.tasks[0].quantity=999;
  assert.throws(()=>convertNative(a,schema),e=>e.code==='FROZEN_RESULT_MISMATCH');
  const b=productionFixture();b.frozen.run.result.timeUnit='day';b.frozen.run.resultHash=rawHash(b.frozen.run.result);
  assert.throws(()=>convertNative(b,schema),e=>e.code==='MINUTE_PLAN_REQUIRED');
  const c=productionFixture();c.frozen.input.tables['设备与工装'][0]['资源占用方式']='重量共享';
  let out=convertNative(rehash(c),schema);assert.equal(out.spec,null);assert.ok(out.diagnostics.some(i=>i.code==='RESOURCE_WEIGHT_UNSUPPORTED'));
  const e=productionFixture();e.frozen.run.result.allocations[0].supplyId='transit:PO';e.frozen.run.resultHash=rawHash(e.frozen.run.result);
  out=convertNative(e,schema);assert.equal(out.spec,null);assert.ok(out.diagnostics.some(i=>i.code==='FEED_LOT_MAPPING_REQUIRED'));
});
