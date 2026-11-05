// Product tests prepared for the separately approved finite runtime window.
// Syntax-checking this file is not execution of these assertions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {urgentBaseline,planOf,urgentRow,observed,selection} from './urgent-order-fixture.mjs';
import {hash} from '../server/workbook-model.mjs';
import {demandInput} from '../server/urgent-order-input.mjs';
import {freezeUrgent} from '../server/urgent-order-engine.mjs';
import {calculateWorkbook,verifyWorkbookPlan} from '../server/workbook-plan.mjs';
import {validateWorkspace,taskZone,impactClosure,continueFaultTask} from '../server/urgent-workspace-policy.mjs';
import {batchTrace,replacementCheck} from '../server/urgent-workspace-trace.mjs';
import {candidateStaleness,candidateOverride} from '../server/urgent-workspace-routes.mjs';

const policy=(p,extra={})=>({freezeMinute:p.facts.observationMinute,semiFreezeMinute:p.facts.observationMinute,strategy:'delay',scope:'local',seedTaskIds:[],overtime:[],events:[],exceptions:[],...extra});
const batch=p=>p.batches.push({id:'UW-BATCH',status:'effective_pending',effectiveMinute:p.facts.observationMinute,sequence:1,demands:[urgentRow()],fileHash:'synthetic'});
test('UW-06 calendar boundaries, original-start zones and factual priority',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result),t=result.tasks[0];
 assert.throws(()=>validateWorkspace(policy(p,{freezeMinute:null}),p,d),e=>e.code==='URGENT_WORKSPACE_POLICY');
 assert.throws(()=>validateWorkspace(policy(p,{semiFreezeMinute:observed-1}),p,d));
 const w=validateWorkspace(policy(p,{freezeMinute:t.start+1,semiFreezeMinute:t.end}),p,d);assert.equal(taskZone(t,p,w),'frozen');
 p.facts.tasks.find(f=>f.id===t.id).status='started';assert.equal(taskZone(t,p,w),'fact');
});
test('UW-07/09 local closure preserves unrelated machine work and all ordinary demands',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result);batch(p);p.workspace=policy(p);
 const closure=impactClosure(d,p,result,p.workspace);assert.ok(closure.taskIds.includes(result.tasks.find(t=>t.orderId==='N1').id));
 // The shared crew is a genuine dependency even on a different machine.
 assert.ok(closure.taskIds.includes(result.tasks.find(t=>t.orderId==='N3').id));
 const input=freezeUrgent(demandInput(d,p),p,result),next=calculateWorkbook(input,selection);
 assert.deepEqual(new Set(next.demandResults.map(r=>r.id)),new Set(['N1','N2','N3','U1']));assert.equal(verifyWorkbookPlan(input,next).status,'pass');
});
test('UW-08 gap candidates protect whole original tasks and retain independent checking',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result);batch(p);p.workspace=policy(p,{strategy:'gap',scope:'full'});
 const input=freezeUrgent(demandInput(d,p),p,result),next=calculateWorkbook(input,selection);
 for(const t of result.tasks){const kept=next.tasks.find(x=>x.id===t.id);assert.ok(kept);assert.deepEqual([kept.start,kept.end,kept.machine],[t.start,t.end,t.machine]);}
 assert.equal(verifyWorkbookPlan(input,next).status,'pass');
});
test('UW-08 gap policy does not infer consumption for an actually started task',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result);batch(p);p.workspace=policy(p,{strategy:'gap',scope:'full'});
 p.facts.tasks[0].status='started';
 assert.throws(()=>freezeUrgent(demandInput(d,p),p,result),e=>e.code==='URGENT_CONSUMPTION_FACT_MISSING');
});
test('UW-10 10:00 fault/10:05 known preserves 60 elapsed minutes; only confirmed 14:00 resumes',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result),t=structuredClone(result.tasks[0]),rt=d.tables['工艺路线'].find(r=>r['路线工序编号']===t.routeStepId);
 rt['基准加工分钟']='120';rt['最短工艺分钟']='120';Object.assign(t,{start:1980,end:2100,startMinute:1980,endMinute:2100,executionStatus:'started'});
 p.facts.observationMinute=2045;p.facts.tasks.find(f=>f.id===t.id).status='started';
 const event={id:'FAULT',type:'fault',resource:t.machine,occurredMinute:2040,knownMinute:2045,recoveryConfirmed:false,source:'独立单工序夹具'};
 p.workspace=policy(p,{events:[event],exceptions:[{taskId:t.id,attributes:['resumeAfterFault'],reason:'仅净剩余续作',revision:1}]});
 assert.throws(()=>freezeUrgent(demandInput(d,p),p,result),e=>e.code==='URGENT_RECOVERY_PENDING');
 event.recoveryConfirmed=true;event.recoveryMinute=2280;d.urgentWorkspace={...p.workspace,policyHash:hash(p.workspace)};
 const continued=continueFaultTask(d,p,t);assert.equal(continued.start,1980);assert.equal(continued.end,2340);assert.equal(continued.interruption.executedMinutes,60);assert.equal(continued.interruption.remainingMinutes,60);assert.deepEqual(continued.executionSegments,[{start:1980,end:2040},{start:2280,end:2340}]);
});
test('UW-11 actual ledger 100=40+60, 40=38+2, 38=10+28; shipment remains pending disposition',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result);p.facts.allocations=[];d.tables['期初库存'][0]['当前数量']='100';
 p.workspace=policy(p,{events:[{id:'QUALITY',type:'quality',supplyId:'inventory:LOT-RM',occurredMinute:observed,knownMinute:observed,source:'合成质检记录'}]});
 p.trace=[{id:'C',from:'inventory:LOT-RM',to:'WIP-X',kind:'consume',inputQuantity:40,outputQuantity:40,lossQuantity:0,unit:'千克',minute:observed,source:'实际投料40'},
 {id:'T',from:'WIP-X',to:'FG-X',kind:'transform',inputQuantity:40,outputQuantity:38,lossQuantity:2,unit:'千克',minute:observed,source:'产出/损耗记录'},
 {id:'S',from:'FG-X',to:'SHIP-X',kind:'ship',inputQuantity:10,outputQuantity:10,lossQuantity:0,unit:'千克',minute:observed,source:'实际发运10'}];
 const trace=batchTrace(d,p,result),get=id=>trace.nodes.find(n=>n.id===id);assert.equal(get('inventory:LOT-RM').remaining,60);assert.equal(get('WIP-X').loss,2);assert.equal(get('FG-X').remaining,28);assert.equal(get('SHIP-X').relation,'shipped_pending_disposition');assert.equal(get('SHIP-X').affected,true);assert.equal(trace.automaticRecall,false);assert.equal(trace.automaticScrap,false);
});
test('UW-12 100 minus nonmovable 80 leaves 20; 21 and already-fed replacement rejected',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result),stock=d.tables['期初库存'][0];stock['当前数量']='100';stock['期初已占用量']='80';
 result.allocations=[{need:'N1',consumer:'MAKE-X|RT-P1',materialId:'RM',supplyId:'inventory:OTHER',quantity:60,unit:'千克',feedMinute:observed,feedDay:1,source:{sheet:'期初库存',row:3}}];p.facts.allocations=[];
 assert.throws(()=>replacementCheck(d,p,result,{supplyId:'inventory:LOT-RM',allocationIndex:0,quantity:21}),e=>e.code==='URGENT_REPLACEMENT_LIMIT');
 const r=replacementCheck(d,p,result,{supplyId:'inventory:LOT-RM',allocationIndex:0,quantity:20});assert.equal(r.available,20);assert.equal(r.unfed,60);
 p.replacements=[r];assert.throws(()=>replacementCheck(d,p,result,{supplyId:'inventory:LOT-RM',allocationIndex:0,quantity:1}),e=>e.code==='URGENT_REPLACEMENT_LIMIT');
});
test('UW-15 latest data/P or plan revision invalidates candidate without touching historical source',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result),ctx={dataset:()=>d},live={datasetId:d.id,version:d.version,inputHash:hash(d),parameterRevision:d.parameterRevision||0,parameterHash:hash(d.tables['配置参数'])},r={urgentRevision:p.revision,urgentImpact:{factsHash:hash(p.facts)},workspaceIdentity:{live}};
 assert.equal(candidateStaleness(ctx,{},p,r).stale,false);d.parameterRevision=1;assert.equal(candidateStaleness(ctx,{},p,r).stale,true);
 assert.throws(()=>candidateOverride({workspaceOverride:{events:[]}}));assert.deepEqual(candidateOverride({workspaceOverride:{strategy:'gap'}}),{strategy:'gap'});
});
test('UW-05 withdrawn batches disappear from active demand input and keep original demand identities',()=>{
 const {d,result}=urgentBaseline(),p=planOf(d,result);batch(p);p.batches[0].status='withdrawn';assert.deepEqual(demandInput(d,p).tables['每日需求'].map(r=>r['需求编号']),['N1','N2','N3']);
});
