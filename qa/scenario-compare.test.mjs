// Prepared for the #156 runtime contract. No execution is claimed by this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,refreshDerived} from '../server/workbook-model.mjs';
import {crewLoadFits,minuteResourceCandidate} from '../server/workbook-minute.mjs';
import {scenarioInput,validateCompareConfig,KPI_DEFINITION} from '../server/scenario-compare-policy.mjs';
import {scenarioMetrics,taskChanges,knownCost} from '../server/scenario-compare-metrics.mjs';
import {urgentFixture,selection} from './urgent-order-fixture.mjs';
import {calculateWorkbook,verifyWorkbookPlan} from '../server/workbook-plan.mjs';
import {scenarioEnvironmentFromEnv} from '../server/scenario-compare-environment.mjs';
import {workbookView} from '../src/lib/workbook-view.mjs';
const observed=1440+8*60;
const definition={selection,demandIds:Array.from({length:10},(_,i)=>'N'+i),kpiDefinition:KPI_DEFINITION,costs:[]};
function metricFixture(){
 const d=urgentFixture();d.tables['每日需求']=Array.from({length:10},(_,i)=>({'需求编号':'N'+i,'成品编号':'P1','需求千克':'10','最晚到货日':'2',_row:i+3}));
 const result={tasks:[],allocations:[],shortages:[],findings:[],demandResults:Array.from({length:10},(_,i)=>({id:'N'+i,quantity:10,unit:'千克',status:i===9?'unplanned':'scheduled',arrivalDay:i===9?null:i===8?3:2}))};
 return {d,result};
}
test('SC07 8/10 is 80%, unplanned remains denominator and has no invented zero delay',()=>{
 const {d,result}=metricFixture(),m=scenarioMetrics(d,result,result,definition);
 assert.equal(m.summary.onTimeRate,.8);assert.equal(m.summary.N,10);assert.equal(m.summary.unplanned,1);assert.equal(m.summary.unknown,0);assert.equal(m.summary.coverage,1);assert.equal(m.summary.delayDays,1);assert.equal(m.demands.at(-1).lateDays,null);
 const empty=scenarioMetrics(d,result,result,definition,{demandIds:[]});assert.equal(empty.summary.N,0);assert.equal(empty.summary.onTimeRate,null);
});
test('SC08 one changed of four original lineages is 25%, new task excluded',()=>{
 const tasks=Array.from({length:4},(_,i)=>({id:'T'+i,orderId:'N'+i,productionId:'B'+i,routeStepId:'OP',start:100,end:117,machine:'EQ1',crew:'C',people:1,tools:[],quantity:1})),base={tasks},candidate={tasks:structuredClone(tasks)};
 candidate.tasks[0].start++;candidate.tasks[0].end++;candidate.tasks.push({...tasks[0],id:'NEW',orderId:'NEW',productionId:'NEW'});
 const m=taskChanges(base,candidate);assert.equal(m.rate,.25);assert.equal(m.total,4);assert.equal(m.newTasks.length,1);
 delete candidate.tasks[0].productionId;assert.equal(taskChanges(base,candidate).comparable,false);
});
test('SC11 enabled overtime 2h ×120 =240, absent/overlapping rates are unknown',()=>{
 const use=[{id:'O',resource:'EQ1',start:100,end:220,minutes:120}],rate={enabled:true,category:'overtime',resource:'EQ1',unit:'元/小时',currency:'CNY',rate:120,start:100,end:220};
 assert.equal(knownCost(use,[]).status,'unknown');const m=knownCost(use,[rate]);assert.equal(m.totals[0].amount,240);assert.equal(m.label,'已知项目小计，非完整总成本');assert.equal(knownCost(use,[rate,rate]).unknown,1);
});
test('SC02 candidate inputs are deeply detached; no hidden 5-scenario/budget default',()=>{
 const d=urgentFixture(),original=hash(d),a=scenarioInput(d,[],selection,observed),b=scenarioInput(d,[],selection,observed);a.tables['班组资源'][0]['每班可用人数']='99';assert.equal(hash(d),original);assert.notEqual(a.tables,b.tables);assert.notEqual(a.tables['班组资源'][0],b.tables['班组资源'][0]);
 assert.throws(()=>validateCompareConfig({}));assert.equal(scenarioEnvironmentFromEnv({}),null);assert.throws(()=>scenarioEnvironmentFromEnv({APS_SCENARIO_RUN_SECONDS:'10'}));
});
test('SC12 personnel increment is valid only for explicit interval and original crew skills',()=>{
 const d=urgentFixture(),crew=d.tables['班组资源'][0],c={id:'PEOPLE',type:'personnel',object:'CREW',before:10,after:12,unit:'人',start:2000,end:2100,routeStepIds:d.tables['工艺路线'].map(r=>r['路线工序编号']),source:'synthetic confirmed qualification'};
 const a=scenarioInput(d,[c],selection,observed);
 assert.equal(crewLoadFits(a,crew,[{start:2000,end:2100,amount:12}],2000,2100),true);
 assert.equal(crewLoadFits(a,crew,[{start:2090,end:2110,amount:12}],2090,2110),false);
 assert.throws(()=>scenarioInput(d,[{...c,routeStepIds:[]}],selection,observed));
 assert.throws(()=>scenarioInput(d,[c,{...c,id:'OVERLAP'}],selection,observed));
});
test('SC09 non-bottleneck personnel can leave real arrival unchanged, hard check retained',()=>{
 const d=urgentFixture(),base=calculateWorkbook(d,selection),crew=d.tables['班组资源'][0],c={id:'PEOPLE',type:'personnel',object:'CREW',before:Number(crew['每班可用人数']),after:12,unit:'人',start:1980,end:2460,routeStepIds:d.tables['工艺路线'].map(r=>r['路线工序编号']),source:'independent synthetic non-bottleneck'};
 const next=scenarioInput(d,[c],selection,observed),result=calculateWorkbook(next,selection);
 assert.deepEqual(result.demandResults.map(r=>r.arrivalDay),base.demandResults.map(r=>r.arrivalDay));assert.equal(verifyWorkbookPlan(next,result).status,'pass');
});
test('SC16 explicit 17-minute overtime remains 17, overlap/missing support rejected',()=>{
 const d=urgentFixture(),c={id:'OT',type:'overtime',object:'EQ1',crew:'CREW',start:2470,end:2487,before:0,after:17,unit:'分钟',people:1,tools:['TL'],capacityKg:6,source:'synthetic 17 minute extra'};
 const a=scenarioInput(d,[c],selection,observed);assert.equal(a.scenarioConditions.overtime[0].end-a.scenarioConditions.overtime[0].start,17);
 assert.throws(()=>scenarioInput(d,[{...c,start:2000,end:2017}],selection,observed));assert.throws(()=>scenarioInput(d,[{...c,capacityKg:null}],selection,observed));
});
test('SC02/17 arrival affects only named expected lot, preserves shared P/expiry and received facts',()=>{
 const d=urgentFixture();d.tables['供应商与供货条件']=[{'供货关系编号':'REL','物料编号':'RM','检验天数':'1'}];d.tables['既有采购在途']=[{'在途记录编号':'PO','物料编号':'RM','供货关系编号':'REL','订购数量':'20','约定到货日':'2','预计放行日':'3','预计到期日':'8','在途状态':'在途'}];
 const before=hash(d),condition={id:'DELAY',type:'arrival',object:'PO',before:2,after:4,unit:'日',source:'synthetic supplier delay'},a=scenarioInput(d,[condition],selection,observed);assert.equal(hash(d),before);assert.equal(a.tables['既有采购在途'][0]._availableDay,5);assert.equal(a.tables['既有采购在途'][0]['预计到期日'],'8');refreshDerived(a,1);assert.equal(a.tables['既有采购在途'][0]['约定到货日'],'4');
 d.tables['既有采购在途'][0]['在途状态']='已收货';assert.throws(()=>scenarioInput(d,[condition],selection,observed));
});
test('SC03 mismatched metric definition refuses comparison, not a false fair-baseline label',()=>{
 const {d,result}=metricFixture();assert.throws(()=>scenarioMetrics(d,result,result,{...definition,kpiDefinition:'OTHER'}));
});
test('SC10 duplicate/shared overtime tasks charge union of actual occupied minutes',()=>{
 const {d,result}=metricFixture();d.scenarioConditions={overtime:[{id:'O',resource:'EQ1',crew:'CREW',start:100,end:220,source:'explicit'}],personnel:[],changes:[]};
 result.tasks=[0,1].map(i=>({id:'T'+i,orderId:'N'+i,productionId:'B'+i,routeStepId:'RT-P1',start:100,end:220,toolEndMinute:220,machine:'EQ1',crew:'CREW',people:1,quantity:1,tools:[],laborIntervals:[{start:100,end:220}]}));
 assert.equal(scenarioMetrics(d,result,result,definition).summary.overtimeMinutes,120);
});
