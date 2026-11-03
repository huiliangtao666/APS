import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculateWorkbook} from '../server/workbook-plan.mjs';
import {equipmentDomain} from '../server/workbook-equipment.mjs';
import {explainFinding} from '../src/lib/workbook-explanations.mjs';
const input=()=>{
 const d=JSON.parse(fs.readFileSync(new URL('./parameter-fixture-data.json',import.meta.url)));
 Object.assign(d,{id:'SYNTHETIC-EXPLANATION',version:1,fileHash:'synthetic',profile:'excel-qualified-output-202611-r1',bindings:[]});
 d.tables['期初在制']=[];d.mapping.wip_remaining=[];
 d.tables['工艺路线']=d.tables['工艺路线'].filter(r=>r['路线工序编号']==='MOCK-RS');
 d.tables['物料清单']=d.tables['物料清单'].filter(r=>r['用量关系编号']==='MOCK-REMAIN');
 d.mapping.feed_mappings=d.mapping.feed_mappings.filter(f=>f.bom_id==='MOCK-REMAIN');
 d.tables['每日需求'][0]['需求日']='1';
 d.tables['停机安排']=[{'停机编号':'SYN-STOP','资源编号':'MOCK-E','开始日':'1','结束日':'2','可知日':'0'}];
 return d;
};
const select={startDay:1,endDay:5,currentDay:1};
const context=(d,p)=>({input:d,identity:{fingerprint:'SYN',dayZero:'2026-10-31',runId:'SYN'},run:{id:'SYN',selection:select,result:p}});
const query={view:'E2',fromDate:'2026-11-01',toDateInclusive:'2026-11-04',pageSize:100};
test('actual-feed expiry records the rejected allocation before demand rollback; equality is expired',()=>{
 const d=input();d.tables['期初库存'].find(l=>l['物料编号']==='MOCK-REM')['到期日']='2';
 const before=JSON.stringify(d),p=calculateWorkbook(d,select),f=p.findings.find(f=>f.code==='MATERIAL_AT_ACTUAL_FEED');
 assert.ok(f);assert.equal(p.demandResults[0].status,'unplanned');assert.equal(p.tasks.length,0);assert.equal(p.allocations.length,0);assert.equal(p.shortages.length,0);
 assert.equal(f.routeStepId,'MOCK-RS');assert.equal(f.materialId,'MOCK-REM');assert.equal(f.evidence.supplyId,'inventory:LOT-MOCK-REM');
 assert.deepEqual([f.evidence.allocatedFeed,f.evidence.actualFeed,f.evidence.ready,f.evidence.expiry],[1,2,0,2]);
 const e=explainFinding(f,p);assert.ok(e.facts.includes('判定：投料时已到期'));assert.ok(e.facts.includes('实际校验投料时点：2026-11-02'));
 assert.ok(e.effect.includes('不自动重选'));assert.equal(JSON.stringify(d),before);
 d.tables['期初库存'].find(l=>l['物料编号']==='MOCK-REM')['到期日']='3';
 const valid=calculateWorkbook(d,select);assert.equal(valid.demandResults[0].status,'scheduled');assert.equal(valid.findings.length,0);
});
test('E2 with no generated tasks still has demand-scoped risks, readable rules and frozen route parameters',()=>{
 const d=input();d.tables['期初库存'].find(l=>l['物料编号']==='MOCK-REM')['到期日']='2';
 const p=calculateWorkbook(d,select),v=context(d,p);v.input.effectiveParameters={values:[{object:'MOCK-RS',field:'最大等待天数',value:'0'}]};
 const before=JSON.stringify(v),page=equipmentDomain.query(v,query),detail=table=>equipmentDomain.detail(v,{id:'SUPPLY-D',query,queryFingerprint:page.queryFingerprint,table});
 assert.equal(detail('record').explanationTotal,1);assert.equal(detail('record').explanations[0].title,'实际投料时供给不再适用');
 assert.equal(detail('risk').records[0].values.code,'MATERIAL_AT_ACTUAL_FEED');
 const rule=detail('rules').records[0].values;assert.ok(rule['本次判定依据'].includes('inventory:LOT-MOCK-REM'));assert.ok(rule['结果处理'].includes('撤销该需求'));assert.ok(rule['完善位置'].includes('库存汇总'));
 assert.equal(detail('parameters').records[0].values.object,'MOCK-RS');assert.equal(JSON.stringify(v),before);
});
test('legacy DE620-style finding shows rules without inventing a batch, date, or an expiry diagnosis',()=>{
 const p={dayZero:'2026-10-31',demandResults:[{id:'DE620',status:'unplanned'}]},f={code:'MATERIAL_AT_ACTUAL_FEED',need:'DE620'};
 const e=explainFinding(f,p);assert.equal(e.facts.length,0);assert.ok(e.limitation.includes('未保存'));assert.ok(e.logic.includes('到期边界不含'));assert.ok(e.effect.includes('未排'));
 assert.ok(!JSON.stringify(e).includes('2026-11-02'));assert.ok(!JSON.stringify(e).includes('判定：投料时已到期'));
});
test('minute evidence uses minute offsets and recognizes not-yet-available supply',()=>{
 const e=explainFinding({code:'MATERIAL_AT_ACTUAL_FEED',evidence:{kind:'material-at-feed',timeUnit:'minute',actualFeed:1927,ready:1944,expiry:3000}},{dayZero:'2026-10-31'});
 assert.ok(e.facts.includes('实际校验投料时点：2026-11-01 08:07'));assert.ok(e.facts.includes('判定：投料时尚未可用'));
});
test('finite-capacity evidence reports the window without inventing a unique bottleneck',()=>{
 const p=calculateWorkbook(input(),{...select,endDay:2}),f=p.findings.find(f=>f.code==='FINITE_CAPACITY');
 assert.equal(f.evidence.windowEnd,2);assert.equal(f.evidence.quantity,10);assert.ok(explainFinding(f,p).logic.includes('唯一瓶颈'));
});
test('maximum-wait evidence preserves the actual legacy integer-day comparison',()=>{
 const d=input(),r=d.tables['工艺路线'][0];d.tables['工艺路线']=[{...r,'路线工序编号':'FIRST','工序顺序':'1','跨日历时天数':'1'},r];
 d.tables['停机安排'][0]['开始日']='2';d.tables['停机安排'][0]['结束日']='3';d.mapping.feed_mappings[0].route_step_id='FIRST';
 const p=calculateWorkbook(d,select),f=p.findings.find(f=>f.code==='MAX_WAIT');assert.ok(f);
 assert.deepEqual([f.evidence.predecessorEnd,f.evidence.candidateStart,f.evidence.comparedWait,f.evidence.maxWait],[2,3,1,0]);
 assert.ok(explainFinding(f,p).facts.includes('实际比较等待：1 天'));
});
test('shelf-life evidence stores both compared boundaries',()=>{
 const d=input();d.tables['停机安排']=[];d.tables['每日需求'][0]['需求日']='10';d.tables['物料主数据'].find(m=>m['物料编号']==='MOCK-FG')['保质天数']='1';d.tables['客户与交付'][0]['到货剩余保质比例']='1';
 const p=calculateWorkbook(d,{...select,endDay:15}),f=p.findings.find(f=>f.code==='DELIVERY_SHELF');assert.ok(f);
 assert.equal(f.evidence.requiredExpiry,11);assert.equal(f.evidence.expiry,2.1);assert.equal(p.demandResults[0].status,'unplanned');
});
test('rules paginate without cross-demand leakage, mutation or loss of late entries',()=>{
 const d=input(),v=context(d,{timeUnit:'day',tasks:[],demandResults:[{id:'SUPPLY-D',productId:'MOCK-FG',quantity:10,status:'unplanned'}],findings:[...Array.from({length:105},(_,i)=>({need:'SUPPLY-D',code:'MATERIAL_AT_ACTUAL_FEED',message:'记录'+i})),{need:'OTHER',code:'MAX_WAIT'}],shortages:[],allocations:[],suggestions:[]});
 const page=equipmentDomain.query(v,query),r=equipmentDomain.detail(v,{id:'SUPPLY-D',query,queryFingerprint:page.queryFingerprint,table:'rules',offset:100});
 assert.equal(r.total,105);assert.equal(r.records.length,5);assert.equal(r.nextOffset,null);assert.ok(r.records.every(x=>x.values['需求/在制']==='SUPPLY-D'));
});
test('a shortage-only unplanned demand still explains its supply policy in details',()=>{
 const d=input();d.tables['期初库存'].find(l=>l['物料编号']==='MOCK-REM')['当前数量']='0';
 const p=calculateWorkbook(d,select),v=context(d,p),page=equipmentDomain.query(v,query),detail=equipmentDomain.detail(v,{id:'SUPPLY-D',query,queryFingerprint:page.queryFingerprint,table:'rules'});
 assert.equal(p.findings.length,0);assert.equal(detail.ruleDetails.length,1);assert.ok(detail.ruleDetails[0].facts.includes('记录缺口：10 千克'));assert.ok(detail.ruleDetails[0].logic.includes('不会自动成为供给'));
});
