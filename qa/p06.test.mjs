import test from 'node:test';import assert from 'node:assert/strict';
import {calculate,defs} from '../server/planner.ts';import {freezeRunInput} from '../server/run-input.mjs';import {validateInputs} from '../server/input-validation.mjs';import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';import {verifyWorkingWindows} from '../src/lib/verify-working-windows.mjs';import {allocatePersonnel} from '../src/lib/staffing.mjs';import {exportSupplyPlanCsv} from '../src/lib/expected-supply.mjs';import {p06Fixture,work,stop} from './p06-fixture.mjs';
const solve=(d,selection={})=>{const f=freezeRunInput(d,selection,'2026-10-30T00:00:00Z');return {f,p:calculate(f.executionData,1,f.conditions.ruleEvaluationAt,f.conditions)};};
const mix=p=>p.tasks.filter(t=>t.operation==='MIX');
const empty=p=>{assert.equal(p.tasks.length,0,JSON.stringify(p.findings));assert.equal(p.resourceReservations.length,0);assert.ok(p.materialDemands.every(r=>!r.committed));assert.ok(p.findings.length);};
test('P06 two shifts: full machine/tool/labor cycle moves to later legal window, frozen checker and export agree',()=>{
 const d=p06Fixture();assert.deepEqual(validateInputs(defs,d),[]);const {f,p}=solve(d,{startMinute:20});assert.equal(p.tasks.length,4,JSON.stringify(p.findings));assert.deepEqual(mix(p).map(t=>t.start),[60,60]);assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');assert.equal(p.workingWindowsContract,'P06-windows-v1');assert.match(exportSupplyPlanCsv(p),/P06-windows-v1/);assert.ok(mix(p)[0].timingReasons.some(r=>r.code==='CALENDAR'));
});
test('P06 gaps/short shifts cannot be concatenated; complete occupancy after-release cannot cross gap',()=>{
 for(const windows of [[work(0,20),work(30,50)],[work(0,30),work(60,90)]]){const d=p06Fixture();d.calendars=windows;empty(solve(d).p);}
});
test('P06 explicit factory off, machine stop, personnel stop and tool stop all force fresh same-window candidate',()=>{
 for(const mutate of [d=>d.calendars.push(work(0,60,'否')),d=>d.downtime.push({'设备编号':'MIX01','起始分钟':'0','结束分钟':'60','原因':'合成'}),d=>d.resourceStops.push(stop('工装','G40',0,60)),d=>d.resourceStops.push(stop('人员','G1',0,60))]){const d=p06Fixture();mutate(d);const {p,f}=solve(d);assert.deepEqual(mix(p).map(t=>t.start),[60,60],JSON.stringify(p.findings));assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');}
});
test('P06 resource-specific stop with no later candidate leaves no commitments and identifies actual resource',()=>{
 for(const [type,id] of [['人员','G1'],['工装','G40']]){const d=p06Fixture();d.resourceStops=[stop(type,id,0,240)];const {p}=solve(d);empty(p);assert.ok(p.jointAttempts.some(a=>/人员|工装/.test(a.reason||'')));}
});
test('P06 missing qualified people, wrong shift, reverse-only skill relation and pool shortage are unscheduled',()=>{
 for(const mutate of [d=>d.personnelGroups.forEach(g=>g['可用结束分钟']='20'),d=>d.personnelGroups.forEach(g=>g['班次']='N'),d=>{d.personnelGroups.forEach(g=>g['技能']='ALT');d.skillSubstitutions=[{'关系编号':'R','可提供技能':'MIX','所需技能':'ALT','是否启用':'是','适用工序':'*'}];},d=>d.personnelPools[0]['总人数']='2']){const d=p06Fixture();mutate(d);empty(solve(d,{startMinute:60}).p);}
 const d=p06Fixture();d.personnelGroups.forEach(g=>g['技能']='ALT');d.skillSubstitutions=[{'关系编号':'R','可提供技能':'ALT','所需技能':'MIX','是否启用':'是','适用工序':'MIX'}];const {f,p}=solve(d,{startMinute:60});assert.equal(p.tasks.length,4);assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');
});
test('P06 explicit second-shift groups and complete phase windows, no implicit handover',()=>{
 const d=p06Fixture();d.personnelGroups.forEach(g=>g['可用结束分钟']='40');d.personnelGroups.push(...d.personnelGroups.map(g=>({...g,'人员组编号':g['人员组编号']+'N','班次':'N','可用起始分钟':'60','可用结束分钟':'240'})));d.dependencies.filter(r=>r['资源类型']==='人员技能').forEach(r=>{r['候选人员组']=r['资源编号']+','+r['资源编号']+'N';r['资源编号']='';r['所需班次']='';r['人员开始偏移']='10';r['人员结束偏移']='10';});const {f,p}=solve(d,{startMinute:20});assert.deepEqual(mix(p).map(t=>t.start),[60,60]);assert.ok(p.resourceReservations.filter(r=>r.type==='人员').every(r=>r.resourceId.endsWith('N')&&r.start===70&&r.end===80));assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');
});
test('P06 half-open stop and adjacent shift boundaries allow reuse without bridging a shift',()=>{
 const d=p06Fixture();d.calendars=[work(0,40),work(40,240)];d.resourceStops=[stop('工装','G40',40,60)];const {p,f}=solve(d);assert.deepEqual(mix(p).map(t=>t.start),[0,0]);assert.ok(p.tasks.filter(t=>t.operation==='FILL').every(t=>t.start===40));assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');
 const e=p06Fixture();e.resourceStops=[stop('人员','G1',0,60)];assert.deepEqual(mix(solve(e).p).map(t=>t.start),[60,60]);
});
test('P06 independent checker rejects adjacent-row union and stop/phase/contract tampering; old snapshots stay old',()=>{
 const {p,f}=solve(p06Fixture(),{startMinute:60});
 for(const mutate of [d=>d.calendars=[work(0,75),work(75,240)],d=>d.resourceStops=[stop('工装','G40',90,100)],d=>d.resourceStops=[stop('人员','G1',60,61)],d=>d.resourceStops=undefined]){const data=structuredClone(f.executionData);mutate(data);assert.equal(verifyResourcePolicies(p,data,f.conditions).status,'problem');}
 const q=structuredClone(p);delete q.workingWindowsContract;assert.equal(verifyResourcePolicies(q,f.executionData,f.conditions).status,'problem');
 const old=structuredClone(f.conditions);delete old.workingWindowsContract;assert.deepEqual(verifyWorkingWindows(q,f.executionData,old),[]);
});
test('P06 overlapping role segmentation cannot evade a full phase using different shift groups',()=>{
 const req={'订单编号':'A','工序编号':'MIX','候选人员组':'G1,G2','所需技能':'MIX','需求数量':'1','人员岗位编号':'P','人员参与阶段':'操作','人员开始偏移':'0','人员结束偏移':'0','窗口外释放':'是'};
 const groups=[{'人员组编号':'G1','人员数量':'1','技能':'MIX','可用起始分钟':'0','可用结束分钟':'10'},{'人员组编号':'G2','人员数量':'1','技能':'MIX','可用起始分钟':'10','可用结束分钟':'30'}];
 const r=allocatePersonnel([req,{...req,'人员开始偏移':'10'}],groups,0,30,[],[],[],{data:{calendars:[work(0,100)]},calendarId:'FC01'});assert.equal(r.ok,false);
});
test('P06 input guards reject missing reference, unknown type, fractional/reversed interval, blank reason',()=>{
 for(const mutate of [r=>r['资源编号']='UNKNOWN',r=>r['资源类型']='任意资源',r=>r['起始分钟']='0.5',r=>r['结束分钟']='0',r=>r['原因']='']){const d=p06Fixture(),r=stop('工装','G40',0,60);mutate(r);d.resourceStops=[r];assert.ok(validateInputs(defs,d).length);}
});
test('P06 60 small cases match an independent integer-minute same-window oracle',()=>{
 let count=0;
 for(const edge of [20,30,40,50,60])for(const gap of [0,10,30])for(const kind of ['none','machine','tool','person']){
  const d=p06Fixture();d.calendars=[work(0,edge),work(edge+gap,200)];
  if(kind==='machine')d.downtime=[{'设备编号':'MIX01','起始分钟':'10','结束分钟':'70','原因':'独立穷举合成'}];
  if(kind==='tool')d.resourceStops=[stop('工装','G40',20,80)];if(kind==='person')d.resourceStops=[stop('人员','G1',0,90)];
  const windows=[[0,edge],[edge+gap,200]],fits=(s,e)=>windows.some(([a,b])=>a<=s&&e<=b),overlap=(s,e,a,b)=>s<b&&e>a;
  const legal=t=>fits(t,t+30)&&fits(t,t+40)&&!(kind==='machine'&&overlap(t,t+30,10,70))&&!(kind==='tool'&&overlap(t,t+40,20,80))&&!(kind==='person'&&overlap(t,t+30,0,90));
  const wanted=Array.from({length:201},(_,t)=>t).find(legal),{p,f}=solve(d),actual=mix(p);
  assert.equal(actual.length,wanted===undefined?0:2,JSON.stringify({edge,gap,kind,wanted,actual}));if(actual.length){assert.deepEqual(actual.map(t=>t.start),[wanted,wanted]);assert.equal(verifyResourcePolicies(p,f.executionData,f.conditions).status,'pass');}count++;
 }
 assert.equal(count,60);
});
