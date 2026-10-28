import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,defs,calculate} from '../server/planner.ts';
import {validateInputs} from '../server/input-validation.mjs';
import {freezeRunInput} from '../server/run-input.mjs';
import {executionFixture} from './execution-fixture.mjs';
import {executionState,executionTransition,executionAdmission} from '../src/lib/execution-facts.mjs';
import {stageEvents,eventRisks,eventAbsences,validateEvents} from '../src/lib/simulation-events.mjs';
import {executionInventory} from '../src/lib/material-allocation.mjs';
import {event} from './event-fixture.mjs';
const at='2026-10-29T00:00:00Z';
const fixture=()=>executionFixture(seed);
const stage=(d,e)=>stageEvents(d,{...structuredClone(d),simulationEvents:[...(d.simulationEvents||[]),e]},['executionFacts','simulationEvents']);
const run=d=>{const f=freezeRunInput(d,{},at);return calculate(f.executionData,0,at,f.conditions);};
test('FR029 machine fault preserves original facts/stock, blocks affected remainder and descendant with cause',()=>{
 const d=fixture(),original=structuredClone(d),s=stage(d,event());assert.deepEqual(s.issues,[]);assert.deepEqual(validateInputs(defs,s.data),[]);assert.deepEqual(executionTransition(d,s.data),[]);const p=run(s.data);assert.equal(p.tasks.length,0);assert.ok(p.findings.some(f=>f.message.includes('E1')));assert.equal(p.execution.events.protectionUntil,45);assert.equal(p.execution.facts[0]['工序完成数量'],'40');assert.equal(p.execution.orderImpact[0].qualifiedCompleted,0);assert.deepEqual(d,original);assert.equal(executionInventory(s.data)[0]['账面数量'],'80');
});
test('FR029 event without contemporaneous full progress, with past/future observations or multi-time batch fails closed',()=>{
 const d=fixture();for(const observed of ['29','31']){const n=structuredClone(d);n.executionFacts[0]['观测分钟']=observed;assert.ok(stage(n,event()).issues.length);}
 assert.ok(stageEvents(d,{...d,simulationEvents:[event()]},['simulationEvents']).issues.length);
 assert.ok(stageEvents(d,{...d,simulationEvents:[event(),event('设备故障',{machineId:'MIX02',endMinute:70},{'事件编号':'E2','事件分钟':'31'})]},['executionFacts']).issues.length);
});
test('FR029 malformed/unsupported policies, resources, forged affected facts reject',()=>{
 for(const e of [event('恢复',{}),event('设备故障',{machineId:'missing',endMinute:60}),event('设备故障',{machineId:'MIX01',endMinute:30}),event('设备故障',{machineId:'MIX01',endMinute:60,autoResume:true}),event('设备故障',undefined,{'保护截止分钟':'29'}),event('设备故障',undefined,{'需处理事实JSON':'["fake"]'}),event('设备故障',undefined,{'保护策略':'自动恢复'})])assert.ok(stage(fixture(),e).issues.length);
});
test('FR029 accepted ledger is append-only and reimport idempotent without duplicate effects or material deductions',()=>{
 const s=stage(fixture(),event()).data,before=structuredClone(s);const again=stageEvents(s,s,['executionFacts','simulationEvents']);assert.deepEqual(again.data,before);assert.equal(again.data.downtime.length,before.downtime.length);assert.deepEqual(again.issues,[]);
 for(const mutate of [d=>d.simulationEvents=[],d=>d.simulationEvents[0]['原因']='rewrite']){const n=structuredClone(s);mutate(n);assert.ok(stageEvents(s,n,[]).issues.length);assert.ok(executionTransition(s,n).length);}
});
test('FR029 unaffected in-flight remains at observation while new work observes explicit protection cutoff',()=>{
 const s=stage(fixture(),event('设备故障',{machineId:'MIX02',endMinute:60},{'保护截止分钟':'70'}));assert.deepEqual(s.issues,[]);const p=run(s.data);assert.deepEqual(p.tasks.map(t=>[t.start,t.end]),[[30,50],[70,100]]);assert.equal(p.materialDemands[0].quantity,60);assert.equal(120,40+60+10+10);
});
test('FR029 half-open fault boundary does not invalidate completed work or infer quality',()=>{
 const d=executionFixture(seed,'已完成'),s=stage(d,event());assert.deepEqual(s.issues,[]);assert.equal(eventRisks(s.data).length,0);const p=run(s.data);assert.equal(p.tasks[0].start,0);assert.equal(p.tasks[0].end,30);assert.equal(p.tasks[1].start,45);assert.equal(p.execution.orderImpact[0].qualifiedCompleted,0);assert.equal(p.materialDemands.reduce((a,r)=>a+r.quantity,0),0);
});
test('FR029 unusable material event conserves consumed stock and keeps affected fact blocked even after later simulated status change',()=>{
 const s=stage(fixture(),event('物料状态变化',{lotId:'EX-LOT',status:'冻结'})).data;assert.equal(run(s).tasks.length,0);assert.equal(s.inventory[0]['账面数量'],'120');assert.equal(executionInventory(s)[0]['账面数量'],'80');assert.equal(s.executionMaterials[0]['累计已用数量'],'40');
 const next=stage(s,event('物料状态变化',{lotId:'EX-LOT',status:'合格'},{'事件编号':'E2'}));assert.deepEqual(next.issues,[]);assert.ok(eventRisks(next.data).some(r=>r.eventId==='E1'));assert.equal(run(next.data).tasks.length,0);
});
test('FR029 group absence reserves whole capacity and preserves [start,end) availability boundary for future work',()=>{
 const d=structuredClone(seed);d.personnelGroups=[{'人员组编号':'G','人员组名称':'模拟组','人员数量':'1','技能':'mix','班次':'day','可用起始分钟':'0','可用结束分钟':'480'}];d.dependencies.push({'订单编号':'A','工序编号':'MIX','资源类型':'人员技能','资源编号':'G','需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','所需技能':'mix','所需班次':'day','人员参与阶段':'全工序','人员开始偏移':'0','人员结束偏移':'0'});const group='G';const n=stageEvents(d,{...d,simulationEvents:[event('人员缺勤',{groupId:group,endMinute:90},{'事件分钟':'0','保护截止分钟':'0'})]},[]);assert.deepEqual(n.issues,[]);const p=run(n.data);assert.ok(p.tasks.some(t=>t.start>=90));assert.ok(eventAbsences(n.data).every(a=>a.start===0&&a.end===90));
});
test('FR029 rush appends a new explicit order and dependencies while existing started task identities remain immutable',()=>{
 const d=fixture();d.inventory[0]['账面数量']='300';const order={...d.orders[0],'订单编号':'RUSH','优先顺序':'0'},dependencies=d.dependencies.map(x=>({...x,'订单编号':'RUSH','资源编号':x['工序编号']==='MIX'?'MIX02':x['资源编号']}));
 const s=stage(d,event('插单',{order,dependencies}));assert.deepEqual(s.issues,[]);assert.deepEqual(validateInputs(defs,s.data),[]);assert.deepEqual(executionTransition(d,s.data),[]);const p=run(s.data);assert.ok(p.tasks.some(t=>t.orderId==='RUSH'&&t.start>=45));assert.equal(p.execution.facts[0]['开始分钟'],'0');assert.ok(stage(d,event('插单',{order:d.orders[0],dependencies})).issues.length);
});
test('FR029 supply delay persists an offline projection without adding on-hand stock; remaining allocation waits',()=>{
 const d=fixture();d.inventory[0]['账面数量']='50';d.inventory[0]['已占用数量']='0';d.supplies=[{'供给编号':'S1','物料编号':'LEAN','批次编号':'FUTURE','预计数量':'100','预计到达时间':'2026-11-02T08:30:00+08:00','预计可用时间':'2026-11-02T08:30:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];d.supplyUses=[{'引用编号':'USE-S1','订单编号':'A','工序编号':'MIX','供给编号':'S1','使用数量':'100'}];const rule=d.rules.find(r=>r['规则编号']==='MATERIAL');const params=JSON.parse(rule['参数JSON']);params['允许预计供给']=true;rule['参数JSON']=JSON.stringify(params);
 const s=stage(d,event('到料延期',{supplyId:'S1',arrival:'2026-11-02T09:00:00+08:00',available:'2026-11-02T09:00:00+08:00'}));assert.deepEqual(s.issues,[]);assert.deepEqual(validateInputs(defs,s.data),[]);assert.equal(s.data.inventory.length,1);assert.equal(s.data.supplyDelays.length,1);assert.equal(run(s.data).tasks.length,0); // In-flight automatic resume after shortage is deliberately unsupported.
 assert.ok(stage(d,event('到料延期',{supplyId:'S1',arrival:'2026-11-02T08:00:00+08:00',available:'2026-11-02T08:00:00+08:00'})).issues.length);
});
test('FR029 frozen input carries immutable events and protection across newer caller mutations and stale hash',()=>{
 const d=stage(fixture(),event('设备故障',{machineId:'MIX02',endMinute:60})).data,f=freezeRunInput(d,{},at),hash=JSON.stringify(executionState(d));d.simulationEvents[0]['保护截止分钟']='100';const p=calculate(f.executionData,0,at,f.conditions);assert.equal(p.execution.events.protectionUntil,45);assert.notEqual(JSON.stringify(executionState(d)),hash);assert.equal(f.conditions.eventSummary.protectionUntil,45);
});
test('FR029 minimal and material-rule bypass fail closed even without execution facts',()=>{
 const d=structuredClone(seed);d.simulationEvents=[event('物料状态变化',{lotId:'LEAN-LOT-001',status:'冻结'})];assert.ok(executionAdmission(d,{mode:'minimal-r1',enabledRuleIds:['CALENDAR']}).length);assert.ok(executionAdmission(d,{mode:'supported',enabledRuleIds:['CALENDAR']}).length);assert.ok(validateEvents(d).length);
});
test('FR029 accepted fault and delay effects cannot be removed by subsequent ordinary input editing',()=>{
 const n=stage(fixture(),event()).data;n.downtime=n.downtime.filter(d=>d['原因']!=='模拟异常');assert.ok(validateInputs(defs,n).some(i=>i.message.includes('故障窗口')));
 const m=stage(fixture(),event('物料状态变化',{lotId:'EX-LOT',status:'冻结'})).data;m.inventory[0]['质量状态']='合格';assert.ok(validateInputs(defs,m).some(i=>i.message.includes('最近事件')));
});
test('FR029 personnel absence affecting a started fact remains explicit handling without automatic recovery',()=>{
 const d=fixture();d.personnelGroups=[{'人员组编号':'G','人员组名称':'模拟组','人员数量':'1','技能':'mix','班次':'day','可用起始分钟':'0','可用结束分钟':'480'}];d.dependencies.push({'订单编号':'A','工序编号':'MIX','资源类型':'人员技能','资源编号':'G','需求数量':'1','所需技能':'mix','所需班次':'day','人员开始偏移':'0','人员结束偏移':'0'});
 const s=stage(d,event('人员缺勤',{groupId:'G',endMinute:60}));assert.deepEqual(s.issues,[]);assert.equal(eventRisks(s.data)[0].factId,'F-A-MIX');const p=run(s.data);assert.equal(p.tasks.length,0);assert.ok(p.execution.risks.some(r=>r.message.includes('人员缺勤')));assert.equal(p.execution.orderImpact[0].reconciliationRequired,true);
});
test('FR029 new unstarted material work waits for delayed expected availability with conditional allocation and no stock receipt',()=>{
 const d=fixture();d.executionFacts=[];d.executionMaterials=[];d.inventory=[];d.supplies=[{'供给编号':'S1','物料编号':'LEAN','批次编号':'FUTURE','预计数量':'100','预计到达时间':'2026-11-02T08:30:00+08:00','预计可用时间':'2026-11-02T08:30:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];d.supplyUses=[{'引用编号':'USE-S1','订单编号':'A','工序编号':'MIX','供给编号':'S1','使用数量':'100'}];const rule=d.rules.find(r=>r['规则编号']==='MATERIAL');const params=JSON.parse(rule['参数JSON']);params['允许预计供给']=true;rule['参数JSON']=JSON.stringify(params);
 const s=stage(d,event('到料延期',{supplyId:'S1',arrival:'2026-11-02T09:00:00+08:00',available:'2026-11-02T09:10:00+08:00'}));assert.deepEqual(s.issues,[]);const p=run(s.data);assert.equal(p.tasks[0].start,70);assert.equal(p.materialDemands[0].allocations[0].conditional,true);assert.equal(s.data.inventory.length,0);assert.equal(p.materialDemands[0].quantity,100);
});

import fs from 'node:fs';
import {parseInputCsv} from '../src/lib/input-csv.mjs';
test('FR029 all five delivered CSV examples parse and apply against explicit synthetic fixtures',()=>{
 for(const name of ['fault','absence','material','delay','rush']){
  const d=fixture();d.inventory[0]['账面数量']='300';d.personnelGroups=[{'人员组编号':'G','人员组名称':'模拟组','人员数量':'1','技能':'mix','班次':'day','可用起始分钟':'0','可用结束分钟':'480'}];d.supplies=[{'供给编号':'S1','物料编号':'LEAN','批次编号':'FUTURE','预计数量':'100','预计到达时间':'2026-11-02T08:30:00+08:00','预计可用时间':'2026-11-02T08:30:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];
  const parsed=parseInputCsv(fs.readFileSync(new URL('../docs/samples/fr029/'+name+'.csv',import.meta.url),'utf8')),def=defs.find(d=>d.key==='simulationEvents');assert.deepEqual(parsed[0],def.fields);const e=Object.fromEntries(parsed[0].map((k,i)=>[k,parsed[1][i]])),s=stage(d,e);assert.deepEqual(s.issues,[],name);assert.deepEqual(validateInputs(defs,s.data),[],name);assert.ok(run(s.data).execution.events.rows.length===1,name);
 }
});
