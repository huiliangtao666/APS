// Engineering seam tests, authored only until PM hands over the #146 window.
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyParameters} from '../../server/parameter-contract.mjs';
import {convertNative} from '../../server/simulator/import.mjs';
import {frozenSourceCopy,rawHash} from '../../server/simulator/source.mjs';
import {initialState,applyEvent} from '../../server/simulator/model.mjs';
import {registerSimulatorRoutes} from '../../server/simulator/routes.mjs';
import {nativeFixture,rehash,schema} from './import-fixture.mjs';
import {threeDaySpec} from './three-day.mjs';

function seamFixture(){
  const f=nativeFixture(),d=f.frozen.input;
  d.parameterContext={scope:'dataset',effectiveDay:0};
  d.minuteOrigin=f.calendar.minuteOrigin;d.dayZero=f.calendar.dayZero;d.timeUnit='minute';
  applyParameters(d,0,'dataset');rehash(f);
  const {result,...run}=f.frozen.run;
  return {f,envelope:{contract:'aps-simulator-frozen-source@1',mode:'INDEPENDENT',linked:false,
    conversionStatus:'NOT_CONVERTED',conversionOwner:'APS-Test',run,input:d,plan:result,workbookSchema:schema,
    gaps:[{path:'plan',status:'NO_FROZEN_PLAN'}]}};
}
function request({f,envelope}){
  return {kind:'FROZEN_SOURCE_COPY',frozenSource:envelope,calendar:f.calendar,opening:f.opening,script:f.script,production:f.production};
}
test('public envelope consumes plan=null without inventing tasks; immutable input/hash/P/context/BOM lineage retained',()=>{
  const pair=seamFixture(),before=rawHash(pair),out=convertNative(request(pair),schema);
  assert.equal(out.status,'READY_FOR_SELFTEST');assert.equal(out.spec.tasks.length,0);assert.equal(out.spec.source.plan,undefined);
  assert.equal(out.spec.source.baseline.runId,pair.envelope.run.id);
  assert.equal(out.spec.reference.bom[0].lineage.inputHash,pair.envelope.run.inputHash);
  assert.deepEqual(out.references.parameters.context,pair.envelope.input.parameterContext);
  assert.deepEqual(out.references.parameters.frozenEffectiveParameters,pair.envelope.input.effectiveParameters);
  assert.deepEqual(out.references.frozenSource.gaps,pair.envelope.gaps);
  assert.equal(out.spec.reference.bom[0].quantity,1200);assert.equal(out.spec.reference.bom[0].automaticConsumption,false);
  assert.equal(rawHash(pair),before);
});
test('selected run/hash and modified original JSON or plan are rejected independently of envelope claims',()=>{
  const {envelope:e}=seamFixture();
  assert.throws(()=>frozenSourceCopy(e,{runId:'another-run'}),{code:'FROZEN_SELECTION_MISMATCH'});
  assert.throws(()=>frozenSourceCopy(e,{expectedInputHash:'f'.repeat(64)}),{code:'FROZEN_SELECTION_MISMATCH'});
  const changed=structuredClone(e);changed.input.tables['期初库存'][0]['当前数量']='999';
  assert.throws(()=>frozenSourceCopy(changed),{code:'FROZEN_INPUT_MISMATCH'});
  const missing=structuredClone(e);missing.run.resultHash='e'.repeat(64);
  assert.throws(()=>frozenSourceCopy(missing),{code:'FROZEN_RESULT_MISMATCH'});
  const duplicate=structuredClone(e);duplicate.run.result={};
  assert.throws(()=>frozenSourceCopy(duplicate),{code:'FROZEN_RESULT_AMBIGUOUS'});
});
test('public plan member becomes the sole hashed result; selected native task/allocation/BOM provenance survives',()=>{
  const pair=seamFixture(),{f,envelope:e}=pair,d=e.input;
  d.tables['设备与工装']=[{'资源编号':'M','资源占用方式':'独占','可用数量':'1'}];e.run.inputHash=rawHash(d);
  e.run.status='completed';e.plan={status:'completed',timeUnit:'minute',minuteOrigin:d.minuteOrigin,dayZero:d.dayZero,
    source:{datasetId:d.id,version:d.version,fileHash:d.fileHash,mappingHash:rawHash(d.mapping),parameterHash:rawHash(d.tables['配置参数'])},
    conditions:{...e.run.selection,interval:'[start,end)'},
    tasks:[{id:'T',productId:'FG',start:487,end:504,quantity:28,machine:'M',people:0,tools:[]}],
    allocations:[{taskId:'T',consumer:'MAKE',need:'D',materialId:'RAW',supplyId:'inventory:LOT',feedMinute:487,quantity:30}]};
  e.run.resultHash=rawHash(e.plan);e.gaps=[];
  f.production={mode:'FROZEN_TASKS',taskIds:['T'],planUse:'EXPLICIT_COPY'};
  f.opening.taskFacts={T:{source:'explicit-seam-engineering-facts',totalProcessingMinutes:17,confirmAllocationsComplete:true}};
  const before=rawHash(e),out=convertNative(request(pair),schema),t=out.spec.tasks[0];
  assert.equal(t.plannedStart,'2026-10-31T08:07:00+08:00');assert.equal(t.totalMinutes,17);
  assert.deepEqual(t.startRequirements,[{lotId:'LOT',cumulative:30}]);assert.deepEqual(t.lineage.allocations,e.plan.allocations);
  assert.equal(t.lineage.inputHash,e.run.inputHash);assert.deepEqual(t.lineage.bomRelations,['BOM']);assert.equal(rawHash(e),before);
  e.plan.tasks[0].quantity=999;assert.throws(()=>convertNative(request(pair),schema),{code:'FROZEN_RESULT_MISMATCH'});
});
test('frozen effective day remains the selected run context when simulation starts later',()=>{
  const pair=seamFixture(),{f,envelope:e}=pair,d=e.input;
  const p=d.tables['配置参数'].find(p=>p['参数编号']==='P-WINDOW');p['失效日']='1';
  d.tables['配置参数'].push({...p,'参数编号':'P-WINDOW-LATER','参数值':'7','生效日':'1','失效日':'44'});
  applyParameters(d,0,'dataset');e.run.inputHash=rawHash(d);
  f.calendar.startDate='2026-11-01';f.opening.asOf='2026-11-01T00:00:00+08:00';
  for(const group of ['purchases','demands'])for(const fact of Object.values(f.opening[group]))fact.asOf=f.opening.asOf;
  f.opening.lots={LOT:{source:'explicit-test-next-day-opening',asOf:f.opening.asOf,quantity:100,externalReserved:20,quality:'合格'}};
  const out=convertNative(request(pair),schema);
  assert.ok(out.spec);assert.equal(out.spec.planningWindowDays,14);
  assert.equal(out.references.parameters.effectiveDay,0);assert.equal(out.references.parameters.simulationDay,1);
  assert.deepEqual(out.references.parameters.frozenEffectiveParameters,d.effectiveParameters);
});
test('missing frozen P context, inconsistent effective values, unsupported trial and origin conflict do not fall back',()=>{
  const a=seamFixture();delete a.envelope.input.parameterContext;a.envelope.run.inputHash=rawHash(a.envelope.input);
  assert.throws(()=>convertNative(request(a),schema),{code:'FROZEN_PARAMETER_CONTEXT_REQUIRED'});
  const b=seamFixture();b.envelope.input.effectiveParameters.values[0].value='999';b.envelope.run.inputHash=rawHash(b.envelope.input);
  assert.throws(()=>convertNative(request(b),schema),{code:'FROZEN_PARAMETERS_MISMATCH'});
  const c=seamFixture();c.envelope.input.parameterContext.scope='trial:unknown';c.envelope.run.inputHash=rawHash(c.envelope.input);
  assert.throws(()=>convertNative(request(c),schema),{code:'PARAMETER_SCOPE_UNSUPPORTED'});
  const d=seamFixture();d.envelope.run.provenance={minuteOrigin:'2026-11-02T08:00:00+08:00'};
  assert.throws(()=>convertNative(request(d),schema),{code:'MINUTE_ORIGIN_MISMATCH'});
});

// Route middleware runs in memory, with no listener, store or live workbook.
function previewRoute(reader){
  const posts=new Map(),router={get(){},post:(path,...handlers)=>posts.set(path,handlers)};
  const noop=(_req,_res,next)=>next();
  const csvDefs=['simulationEvents','executionSources','executionFacts','executionMaterials','supplies','supplyDelays',
    'inventory','orders','calendars','resourceStops','downtime'].map(key=>({key,file:key+'.csv',fields:['原字段']}));
  registerSimulatorRoutes(router,{root:'/workspace/temp/seam-tests/independent-simulator',permission:()=>noop,actorKey:()=> 'engineering-actor',
    writeGuard:noop,workbookSchema:schema,csvDefs,readFrozenSource:reader});
  return async source=>{
    let output,status=200;
    const res={headersSent:false,status(n){status=n;return this;},json(value){output=value;return this;}};
    await posts.get('/simulator/imports/preview').at(-1)({path:'/simulator/imports/preview',body:{source}},res,e=>{throw e;});
    return {status,output};
  };
}
test('preview reads only exact selected run/hash via injected callback, with no client input or live fallback',async()=>{
  const pair=seamFixture(),calls=[],read=previewRoute(async selection=>{calls.push(selection);return pair.envelope;});
  const {f,envelope:e}=pair;
  const out=await read({kind:'SELECTED_FROZEN_RUN',runId:e.run.id,expectedInputHash:e.run.inputHash,
    calendar:f.calendar,opening:f.opening,script:f.script,production:f.production});
  assert.equal(out.status,200);assert.ok(out.output.spec);
  assert.deepEqual(calls,[{runId:e.run.id,expectedInputHash:e.run.inputHash}]);
});
test('file preview preserves original JSON insertion order before native hashing',async()=>{
  const pair=seamFixture(),out=await previewRoute(undefined)(request(pair));
  assert.equal(out.status,200);assert.ok(out.output.spec);
  assert.equal(out.output.source.inputHash,pair.envelope.run.inputHash);
});
test('no reader, stale callback identity and client replacement input fail without creating a branch',async()=>{
  const pair=seamFixture(),{f,envelope:e}=pair;
  const source={kind:'SELECTED_FROZEN_RUN',runId:e.run.id,expectedInputHash:e.run.inputHash,
    calendar:f.calendar,opening:f.opening,script:f.script,production:f.production};
  assert.equal((await previewRoute(undefined)(source)).status,503);
  let calls=0;const route=previewRoute(()=>{calls++;return e;});
  const blocked=await route({...source,input:e.input});assert.equal(blocked.output.error,'UNSUPPORTED_FIELD');assert.equal(calls,0);
  const stale=await previewRoute(()=>({...e,run:{...e.run,id:'another'}}))(source);
  assert.equal(stale.status,409);assert.equal(stale.output.error,'FROZEN_SELECTION_MISMATCH');
});
test('cumulative30→80 debits50, re-observation80 debits0, and BOM never adds another yield deduction',()=>{
  const spec=threeDaySpec(),state=initialState(spec),event=spec.events.find(e=>e.type==='CONSUME_CUMULATIVE');
  const lot=state.lots.find(l=>l.id===event.data.lotId),before=lot.quantity;
  const take=(identity,n)=>applyEvent(spec,state,{...event,id:identity,causes:[],data:{...event.data,cumulative:n}});
  take('C30',30);assert.equal(lot.quantity,before-30);
  take('C80',80);assert.equal(lot.quantity,before-80);
  take('OBSERVE80',80);assert.equal(lot.quantity,before-80);
});
