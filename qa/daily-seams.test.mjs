import {randomUUID} from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';
import {dailyFixture,policies,branchBody} from './daily-fixture.mjs';
import {workbookOpening,projectDaily,rememberSource,rebaseDaily} from '../server/daily-workbook.mjs';
import {newDaily,balances,confirm,feedback,closeDay,sourceToken,DOMAINS} from '../server/daily-model.mjs';
import {workbookReadiness,refreshDerived,hash} from '../server/workbook-model.mjs';
import {routeMinutes,minuteTime,instantMinute} from '../server/workbook-minute.mjs';
const fixture=()=>{const d=dailyFixture(),b=newDaily(branchBody,workbookOpening(d,policies),d);b.policies=structuredClone(policies);const p=projectDaily(d,b);b.sourceToken=sourceToken(p);rememberSource(b,p);return {d:p,b};};
const fact=(b,type,data,id=randomUUID())=>({id,type,data,source:{kind:'EXPLICIT_LOCAL_MOCK'},occurredDate:b.date,knownDate:b.date,effectiveDate:b.date});
test('pre-service real workbook readiness, metre bins and atomic revised projection',()=>{
 const {d,b}=fixture();assert.deepEqual(workbookReadiness(d).issues,[]);
 const bad=structuredClone(d);bad.tables['期初库存'].find(r=>r['物料编号']==='PM101')['库位编号']='LOC';assert.ok(workbookReadiness(bad).issues.some(i=>i.sheet==='库区库位'));
 d.tables['库区库位'].push({'库位编号':'NEW-M','最大容量':'10000','容量单位':'米'});feedback(b,fact(b,'lot-location',{lotId:'LOT-PM101',location:'NEW-M',disposition:'explicit mock relocation'}));const projected=projectDaily(d,b);assert.deepEqual(workbookReadiness(projected).issues,[]);assert.equal(balances(b).find(r=>r.materialId==='PM101').physical,1500);
});
test('accepted source revisions rebase net-open input once while preserving cumulative facts',()=>{
 const {d,b}=fixture();feedback(b,fact(b,'demand-revise',{id:'N1',required:110,disposition:'mock revised order'},'REVISE1'));
 const projected=projectDaily(d,b);b.sourceToken=sourceToken(projected);rememberSource(b,projected);
 const revised=structuredClone(projected);revised.version++;revised.tables['每日需求'].find(r=>r['需求编号']==='N1')['需求箱数']='120';revised.tables['期初库存'].find(r=>r['物料编号']==='RM101')['当前数量']='80';refreshDerived(revised,1);
 const factsHash=hash(b.facts);assert.equal(rebaseDaily(b,revised),true);assert.equal(b.state.demands.find(r=>r.id==='N1').required,120);assert.equal(balances(b).find(r=>r.materialId==='RM101').physical,80);assert.equal(hash(b.facts),factsHash);assert.equal(rebaseDaily(b,revised),false);assert.equal(b.state.movements.filter(r=>r.kind==='SOURCE_REBASE').length,1);assert.ok(balances(b).every(r=>r.difference===0));
});
test('explicit opening WIP preserves prior consumption and carries remaining finite-resource mapping',()=>{
 const d=dailyFixture();d.tables['期初在制']=[{'在制批次编号':'W1','成品编号':'FG101','数量单位':'千克','预计合格产出':'10','已开工日':'0'}];d.mapping.wip_remaining=[{id:'W1',resource:'EQ1',remaining_route_steps:['RT-FG101'],remaining_labor_pool:'CREW',remaining_labor_count:1}];
 assert.throws(()=>workbookOpening(d,policies),e=>e.code==='DAILY_WIP_MAPPING_REQUIRED');
 const p={...policies,wipFacts:{W1:{output:0,consumedByMaterial:{RM101:8.5,RM102:2,PM101:100},source:{kind:'EXPLICIT_OPENING_FACT'},disposition:'already deducted before opening stock'}}};
 const b=newDaily(branchBody,workbookOpening(d,p),d);assert.equal(b.state.tasks[0].historicalConsumed.RM101,8.5);assert.equal(balances(b).find(r=>r.materialId==='RM101').physical,85);
 feedback(b,fact(b,'output',{taskId:'wip-W1',lotId:'WIP-OUTPUT',cumulative:10,location:'LOC',expiresDate:'2026-12-01',quality:'qualified'}));assert.equal(balances(b).find(r=>r.materialId==='RM101').physical,85);assert.equal(balances(b).find(r=>r.materialId==='FG101').physical,10);assert.equal(projectDaily(d,b).tables['期初在制'].length,0);
});
test('17 minute duration stays non-rounded and month-end has no next month mutation',()=>{
 const route={'基准加工分钟':'17','固定准备分钟':'0','最短工艺分钟':'0','工时模型':'固定连续历时'};assert.equal(routeMinutes(route,1),17);assert.equal(instantMinute(minuteTime(1457)),1457);
 const {b}=fixture();b.date='2026-11-30';for(const domain of DOMAINS)confirm(b,domain,{kind:'EXPLICIT_LOCAL_MOCK'},true);const c=closeDay(b,{noExecutionReason:'month end no production'});assert.equal(c.date,'2026-11-30');assert.equal(c.ended,true);assert.equal(b.ended,false);assert.equal(c.history.at(-1).date,'2026-11-30');
});
test('external import cannot escape daily confirmation gate by dropping dailyContext',async()=>{
 const {dailyRunContext}=await import('../server/daily-workbook.mjs');const {d,b}=fixture();const incoming=structuredClone(d);delete incoming.dailyContext;incoming.version++;assert.throws(()=>dailyRunContext({dailyBranches:[b]},incoming),e=>e.code==='DAILY_NOT_READY');
});
test('replan of partially executed stable task adds net planned quantity to preserved output',async()=>{
 const {adoptDaily}=await import('../server/daily-workbook.mjs');const {d,b}=fixture();for(const domain of DOMAINS)confirm(b,domain,{kind:'EXPLICIT_LOCAL_MOCK'},true);
 const make=(quantity)=>{const result={tasks:[{id:'T',productionId:'P',productId:'FG101',orderId:'N1',end:2,quantity}]};return {id:'RUN',dailyContext:{branchId:b.id,date:b.date,sourceToken:b.sourceToken},status:'completed',result,resultHash:hash(result)};};
 adoptDaily(b,make(100),d);b.state.tasks[0].output=80;adoptDaily(b,make(20),d);assert.equal(b.state.tasks.length,1);assert.equal(b.state.tasks[0].limit,100);assert.equal(b.state.tasks[0].output,80);
});

test('expired explicit outage does not project reversed interval; current outage remains',()=>{
 const {d,b}=fixture();b.date='2026-11-04';b.state.resources=[{id:'EQ1',ready:false,until:'2026-11-03',disposition:'expired explicit outage'}];assert.equal(projectDaily(d,b).tables['停机安排'].filter(r=>r._dailyResource).length,0);b.state.resources[0].until='2026-11-04';assert.equal(projectDaily(d,b).tables['停机安排'].filter(r=>r._dailyResource).length,1);
});
