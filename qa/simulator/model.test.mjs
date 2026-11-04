import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copy,fingerprint} from '../../server/simulator/contract.mjs';
import {validateSpec,initialState,advanceDay,openingSnapshot,visibleEvents,applyEvent,precheck} from '../../server/simulator/model.mjs';
import {timeCompatibility,inventoryEquivalence,cumulativeMaterials,catalog,exportPackage} from '../../server/simulator/export.mjs';
import {threeDaySpec,EXPECTED} from './three-day.mjs';

function days(spec=threeDaySpec()){let state=initialState(validateSpec(spec));const out=[];
  for(const day of ['2026-11-01','2026-11-02','2026-11-03']){const r=advanceDay(spec,state,day);state=r.state;out.push(r);}return out;}
function totals(s) {
  const sum=(rows,key)=>rows.reduce((n,r)=>n+(r[key]??0),0),raw=s.lots.filter(l=>l.materialId==='RM900'),fg=s.lots.filter(l=>l.materialId==='FG900');
  const consumed=s.tasks.reduce((n,t)=>n+Object.values(t.consumed).reduce((a,b)=>a+b,0),0),output=sum(s.tasks,'output'),scrap=sum(s.tasks,'scrap');
  return {raw:sum(raw,'quantity'),rawQualified:sum(raw,'qualified'),rawPending:sum(raw,'pending'),rawFree:sum(raw,'free'),
    received:sum(s.purchases,'received'),unreceived:s.purchases.reduce((n,p)=>n+p.ordered-p.received-p.cancelled,0),consumed,
    rawScrap:Math.abs(sum(s.movements.filter(m=>m.kind==='SCRAP'&&m.materialId==='RM900'),'quantity')),fg:sum(fg,'quantity'),fgQualified:sum(fg,'qualified'),fgPending:sum(fg,'pending'),
    output,processScrap:scrap,shipped:sum(s.demands,'shipped'),signed:sum(s.demands,'signed'),delivery:sum(s.demands,'shipped')-sum(s.demands,'signed'),
    demandRemaining:s.demands.reduce((n,d)=>n+d.required+d.change-d.cancelled-(d.fulfillment==='SHIP'?d.shipped:d.signed),0),wip:consumed-output-scrap,
    remainingMinutes:sum(s.tasks.filter(t=>t.status!=='PLANNED'),'remainingMinutes')};
}
test('SIM-01/03/08–13: real domain events reproduce all independent three-day quantities without mutating input',()=>{
  const spec=threeDaySpec(),hash=fingerprint(spec),out=days(spec);out.forEach((r,i)=>assert.deepEqual(totals(r.snapshot),EXPECTED[i]));assert.equal(fingerprint(spec),hash);
});
test('SIM-04: failed final event exposes no half-day state',()=>{
  const spec=threeDaySpec(),state=initialState(spec),first=advanceDay(spec,state,'2026-11-01');
  const bad=copy(spec.events.find(e=>e.id==='E11'));bad.id='BAD';bad.effectiveAt=bad.occurredAt=bad.knownAt='2026-11-02T23:59:00+08:00';bad.data.allocations[0].quantity=999;
  spec.events.push(bad);const before=fingerprint(first.state);assert.throws(()=>advanceDay(spec,first.state,'2026-11-02'));assert.equal(fingerprint(first.state),before);
});
test('SIM-05/07/12: exclusive close and inclusive opening; unknown fault not leaked',()=>{
  const spec=threeDaySpec(),out=days(spec),day2=out[1].snapshot;assert.equal(day2.processed.E12,undefined);
  assert.equal(day2.lots.find(l=>l.id==='RAWX').free,10);const opening=openingSnapshot(spec,out[1].state,'2026-11-03');
  assert.equal(opening.lots.find(l=>l.id==='RAWX').quantity,10);assert.equal(opening.lots.find(l=>l.id==='RAWX').free,0);
  assert.ok(opening.processed.E12);assert.ok(!visibleEvents(spec,'2026-11-02T00:00:00+08:00').some(e=>e.id==='E09'));
  assert.ok(!Object.hasOwn(out[0].state.processed,'E09'));assert.equal(out[0].state.tasks[0].processedMinutes,17);
});
test('SIM-06: planning window coverage is explicit and never extended',()=>{
  const spec=threeDaySpec(),p=precheck(spec);assert.equal(p.planningWindow.complete,false);assert.equal(p.planningWindow.covered,3);
  spec.endDate='2026-11-04';assert.throws(()=>validateSpec(spec),{code:'COVERAGE_RANGE'});
});
test('SIM-02: no plan means explicit non-production mode, no invented production',()=>{
  const spec=threeDaySpec();spec.tasks=[];spec.events=[];delete spec.source.plan;
  assert.equal(precheck(spec).productionSource,'NO_PRODUCTION');const out=advanceDay(spec,initialState(spec),'2026-11-01');
  assert.equal(out.state.tasks.length,0);assert.equal(out.state.lots[0].quantity,110);
});
test('SIM-11/18/19: same event no-op, same identity different content conflicts, cumulative new identity does not rededuct',()=>{
  const spec=threeDaySpec(),state=days(spec)[0].state,event=spec.events.find(e=>e.id==='E01'),hash=fingerprint(state);
  applyEvent(spec,state,event);assert.equal(fingerprint(state),hash);
  assert.throws(()=>applyEvent(spec,state,{...event,data:{...event.data,cumulative:31}}),{code:'EVENT_CONFLICT'});
  const fresh=copy(event);fresh.id='REPLAY';applyEvent(spec,state,fresh);assert.equal(state.lots.find(l=>l.id==='RAW01').quantity,80);
  assert.equal(state.tasks[0].consumed.RAW01,30);
});
test('SIM-14/15: paused machine/tool retained, repair does not resume; tool released at explicit 08:45',()=>{
  const out=days(),second=out[1].state;assert.equal(second.tasks[1].status,'PAUSED');assert.equal(second.tasks[1].remainingMinutes,40);
  assert.equal(second.resources.find(r=>r.id==='M01').ready,true);
  assert.deepEqual(second.holds.filter(h=>h.endAt===null).map(h=>h.resourceId).sort(),['M01','T01']);
  assert.equal(out[2].state.holds.find(h=>h.resourceId==='T01').endAt,'2026-11-03T08:45:00+08:00');
});
test('SIM-14: a competing physical tool claim at 08:40 is blocked until explicit 08:45 release',()=>{
  const spec=threeDaySpec();spec.tasks.push({...copy(spec.tasks[1]),id:'PB03',resources:[{id:'T01',quantity:1}],startRequirements:[],lineage:'TEST-COMPETITOR'});
  const base=copy(spec.events.find(e=>e.id==='E14-machine'));base.id='COMPETE';base.type='TASK_START';base.data={taskId:'PB03'};base.causes=['E14'];spec.events.push(base);
  const out=days(spec)[2];assert.equal(out.state.processed.COMPETE.status,'WAITING');assert.equal(out.state.tasks.find(t=>t.id==='PB03').status,'PLANNED');
});
test('SIM-16: missing input not zeroed; unavailable stock prevents task start',()=>{
  const spec=threeDaySpec();delete spec.lots[0].quantity;assert.throws(()=>validateSpec(spec),{code:'QUANTITY_PRECISION'});
  const valid=threeDaySpec(),state=initialState(valid);state.lots[0].quantity=state.lots[0].qualified=20;
  const start=valid.events.find(e=>e.id==='E08-start');applyEvent(valid,state,start);assert.equal(state.tasks[1].status,'PLANNED');assert.equal(state.processed[start.id].status,'WAITING');
});
test('SIM-17: deterministic replay; enabling random requires fully materialized rules',()=>{
  assert.deepEqual(days().map(r=>r.snapshot.businessHash),days().map(r=>r.snapshot.businessHash));
  const spec=threeDaySpec();spec.random={enabled:true,seed:123};assert.throws(()=>validateSpec(spec),{code:'RANDOM_NOT_MATERIALIZED'});
  spec.random={enabled:true,seed:123,generatorVersion:'fixture-v1',rulesVersion:'range-v1',materialized:true,distributions:[{object:'M01',probability:0.1,min:1,max:2,from:'2026-11-01T00:00:00+08:00',until:'2026-11-04T00:00:00+08:00'}]};
  assert.ok(validateSpec(spec));
});
test('SIM-22/23/26: negative offset is preserved; inventory equivalence requires proof; B remains closed',()=>{
  assert.equal(timeCompatibility('2026-11-01T00:00:00+08:00','csv').offsetMinutes,-1920);
  assert.equal(timeCompatibility('2026-11-01T00:00:00+08:00','csv').status,'NEEDS_ADAPTATION');
  assert.equal(inventoryEquivalence({after:50,consumed:30}).beforeEquivalent,null);
  assert.equal(inventoryEquivalence({after:50,consumed:30,proof:{sameLot:true,sameLineage:true,sameCumulativeScope:true,allReceiptsAndIssuesAccounted:true,baselineHash:'a'.repeat(64)}}).beforeEquivalent,80);
  const spec=threeDaySpec();spec.mode='LINKED';assert.throws(()=>validateSpec(spec),{code:'MODE_DISABLED'});
});
test('SIM-21/24: cumulative candidate uses native headers and export hides future unknown events',()=>{
  const spec=threeDaySpec(),first=days(spec)[0],c=cumulativeMaterials(spec,first.snapshot);assert.equal(c.rows[0]['累计已用数量'],30);
  const schema={version:'test',tables:Object.fromEntries(['每日需求','期初库存','既有采购在途','期初在制','在制剩余映射','停机安排','生产班次','日业务时点规则'].map(k=>[k,{key:'id',fields:[{name:'原字段'}]}]))};
  const defs=['simulationEvents','executionSources','executionFacts','executionMaterials','supplies','supplyDelays','inventory','orders','calendars','resourceStops','downtime'].map(key=>({key,file:key+'.csv',fields:['原字段']}));
  const out=exportPackage({scenario:'s',branch:'b',lineage:null,revision:1,spec,specHash:fingerprint(spec),checkpoints:[{snapshot:first.snapshot}]},catalog(schema,defs));
  assert.equal(out.compatibility.targetAccepted,false);assert.ok(!out.knownEvents.some(e=>e.id==='E09'));assert.ok(out.knownEvents.some(e=>e.id==='E12'));
});
