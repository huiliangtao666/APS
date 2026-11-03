import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentDomain} from '../server/workbook-equipment.mjs';
const make=()=>({identity:{fingerprint:'F',dayZero:'2026-10-31',runId:'SYN'},input:{tables:{
 '物料主数据':[{'物料编号':'FG','基础单位':'千克'},{'物料编号':'RM','基础单位':'千克'}],
 '物料清单':[], '每日需求':[{'需求编号':'DE','成品编号':'FG','需求日':'1','需求箱数':'13','每箱净重千克':'5','需求千克':'65','最晚到货日':'2',_row:31}],
 '设备与工装':['EQ1','EQ2'].map(id=>({'资源编号':id,'资源类别':'设备','资源组编号':'G','标准日产能千克':'2000','单次批量上限千克':'600',_row:3})),
 '班组资源':[{'班组编号':'TM','每班可用人数':'18','标准日班次数':'2','周日班次数':'1'}],
 '工艺路线':[{'路线工序编号':'RT1','跨日历时天数':'1','最大等待天数':'0','班组编号':'TM',_row:74},{'路线工序编号':'RT4','跨日历时天数':'1','工序名称':'冷却'}],
 '工厂日历':[{'日序':'1','公历日期':'20261101','生产班次数':'1','日产能分子':'1','日产能分母':'2',_row:4}],
 '期初在制':[{'在制批次编号':'WP4','成品编号':'FG','预计合格产出':'200','当前工序名称':'冷却','已开工日':'0','预计完工日':'2','预计放行日':'2',_row:6}],
 '停机安排':[{'停机编号':'STOP','资源编号':'EQ2','开始日':'3','结束日':'4','可知日':'1',_row:7}]
 },mapping:{version:'SIM-EXPLICIT',wip_remaining:[{id:'WP4',product:'FG',resource:'EQ2',quantity_kg:'200',current_route_step:'RT4',current_occupancy_day_interval:[0,2],remaining_labor_pool:'TM',remaining_labor_count:'2',remaining_route_steps:['RT5'],source:{sheet:'期初在制',row:6}}]}},run:{id:'SYN',selection:{startDay:1,endDay:15,currentDay:1},result:{timeUnit:'day',tasks:[{id:'T43',machine:'EQ1',orderId:'DE',productId:'FG',productionId:'B1',routeStepId:'RT1',label:'备料解冻',quantity:65,start:1,end:2,crew:'TM',people:2,tools:['TL1'],predecessor:'',source:{sheet:'工艺路线',row:74}},{id:'NEXT',machine:'EQ2',orderId:'DE',productId:'FG',productionId:'B1',routeStepId:'RT2',label:'后续',quantity:65,start:2,end:2.1,crew:'TM',people:2,tools:[],predecessor:'T43'}],demandResults:[{id:'DE',productId:'FG',quantity:65,unit:'千克',status:'scheduled',arrivalDay:8,latestArrivalDay:2,lateDays:6}],allocations:[{taskId:'T43',need:'DE',materialId:'RM',quantity:15.88,supplyId:'inventory:L1',feedDay:1,conditional:false},{taskId:'NEXT',need:'DE',materialId:'RM',quantity:2,supplyId:'inventory:L2',feedDay:2,conditional:false}],findings:[{need:'OTHER',message:'其他需求问题'},{need:'DE',message:'同需求其他过程记录'}],shortages:[],suggestions:[],verification:{status:'pass',scope:['已保存范围'],notChecked:['未检查项'],issues:[]}}}});
const query=(extra={})=>({view:'E1',fromDate:'2026-11-01',toDateInclusive:'2026-11-14',pageSize:100,...extra});
function explain(v,node,id='EQ1',q=query()){
 const page=equipmentDomain.query(v,q);return equipmentDomain.detail(v,{id,query:q,queryFingerprint:page.queryFingerprint,table:'analysis',node}).analysis;
}
test('day task explains its exact frozen duration, calendar capacity, task-specific material and late demand',()=>{
 const v=make(),before=JSON.stringify(v),out=explain(v,{kind:'task',id:'T43'});
 assert.equal(out.node.id,'T43');assert.ok(out.facts.some(f=>f.value.includes('2026-11-01 00:00 — 2026-11-02 00:00')));
 assert.ok(out.basis.some(b=>b.logic?.includes('固定跨日历时 1 天 × 1440')));assert.ok(out.basis.some(b=>b.label==='开工日能力'&&b.value.includes('× 当日比例 0.5 = 1,000')));
 assert.equal(out.materialTotal,1);assert.equal(out.materials[0].supply,'inventory:L1');assert.ok(out.problems.some(p=>p.scope==='同需求交付'&&p.message.includes('晚 6 天')));assert.ok(!out.problems.some(p=>p.message==='其他需求问题'));
 assert.equal(out.problems.find(p=>p.message==='同需求其他过程记录').scope,'同需求/在制计算记录');assert.equal(out.verification.status,'pass');assert.ok(out.missing.some(x=>x.includes('结构化有效参数')));assert.equal(JSON.stringify(v),before);
});
test('WIP analysis binds to its own raw row, reservation and remaining work without inventing tools or a task quantity',()=>{
 const out=explain(make(),{kind:'wip',id:'WP4'},'EQ2');
 assert.ok(out.facts.some(f=>f.label==='预计合格产出'&&f.value.startsWith('200')));assert.ok(out.facts.some(f=>f.value.includes('2026-10-31 00:00 — 2026-11-02 00:00')));
 assert.ok(out.missing.some(x=>x.includes('当前实体工装编号')));assert.ok(out.sources.some(s=>s.sheet==='期初在制'&&s.row===6));assert.equal(out.sources.find(s=>s.sheet==='期初在制').fields.find(f=>f.field==='预计完工日').value,'2026-11-02');
 assert.ok(out.basis.find(b=>b.label==='剩余工序').value.includes('RT5'));assert.ok(out.basis.find(b=>b.label==='剩余工序').value.includes('未生成'));assert.equal(out.materialTotal,0);
});
test('hidden, foreign-resource, wrong-kind and stale-query nodes are rejected',()=>{
 const v=make();assert.throws(()=>explain(v,{kind:'task',id:'T43'},'EQ2'),/NODE_NOT_IN_QUERY/);assert.throws(()=>explain(v,{kind:'wip',id:'T43'}),/NODE_NOT_IN_QUERY/);
 assert.throws(()=>explain(v,{kind:'task',id:'MISSING'}),/NODE_NOT_IN_QUERY/);assert.throws(()=>explain(v,{kind:'task',id:'T43'},'EQ1',query({fromDate:'2026-11-02'})),/NODE_NOT_IN_QUERY/);
 const page=equipmentDomain.query(v,query());assert.throws(()=>equipmentDomain.detail(v,{id:'EQ1',query:query({fromDate:'2026-11-02'}),queryFingerprint:page.queryFingerprint,table:'analysis',node:{kind:'task',id:'T43'}}),/QUERY_CHANGED/);
});
test('known downtime is explained as an unavailable interval and never as a production task',()=>{
 const out=explain(make(),{kind:'stop',id:'STOP'},'EQ2');assert.ok(out.headline.includes('已知停机'));assert.equal(out.materialTotal,0);assert.ok(out.facts[0].value.includes('2026-11-03 00:00 — 2026-11-04 00:00'));assert.ok(!out.facts.some(f=>f.label==='本任务加工量'));
});
test('minute task uses quantity formula while unknown or mismatching source values remain explicit',()=>{
 const v=make();v.run.result.timeUnit='minute';v.identity.minuteOrigin='2026-10-31T00:00:00+08:00';v.input.productionContract='workbook-minute-v2';v.input.mapping.wip_remaining=[];v.input.tables['停机安排']=[];
 const t=v.run.result.tasks[0];Object.assign(t,{start:1927,end:2022,startMinute:1927,endMinute:2022,toolEndMinute:2022,laborIntervals:[{start:1927,end:2022}],quantity:250});v.run.result.tasks=[t];Object.assign(v.input.tables['工艺路线'][0],{'工时模型':'按量加工','基准加工分钟':'160','固定准备分钟':'15','最短工艺分钟':'0','基准加工量千克':'500'});
 const out=explain(v,{kind:'task',id:'T43'});assert.ok(out.basis.find(b=>b.label==='历时计算').value.includes('95 分钟'));assert.ok(out.basis.find(b=>b.label==='历时计算').logic.includes('250 ÷ 基准量 500 × 基准加工 160'));assert.ok(!out.problems.some(p=>p.scope==='本节点核对'));
 v.run.result.tasks[0].end++;assert.ok(explain(v,{kind:'task',id:'T43'}).problems.some(p=>p.scope==='本节点核对'));
 delete v.input.tables['工艺路线'][0]['基准加工分钟'];assert.ok(explain(v,{kind:'task',id:'T43'}).missing.some(x=>x.includes('工时字段不完整')));
});

test('quantity-based historical duration uses the same day capacity and does not falsely report a missing route formula',()=>{
 const v=make();v.input.tables['工艺路线'][0]['跨日历时天数']='0';v.run.result.tasks[0].end=1+94/1440;
 const out=explain(v,{kind:'task',id:'T43'}),duration=out.basis.find(b=>b.label==='历时计算');assert.ok(duration.logic.includes('65 ÷ 当日能力 1,000 × 1440'));assert.ok(duration.value.includes('94 分钟'));assert.ok(!duration.logic.includes('不足'));assert.ok(!out.problems.some(p=>p.scope==='本节点核对'));
});
test('material explanation retains the frozen BOM ratio and separates process need from each supply allocation',()=>{
 const v=make();v.input.tables['物料清单']=[{'用量关系编号':'BM','子项编号':'RM','子项基准用量':'244.318182','父项基准产出千克':'1000','数量单位':'千克',_row:9}];v.input.mapping.feed_mappings=[{bom_id:'BM',route_step_id:'RT1'}];
 const out=explain(v,{kind:'task',id:'T43'});assert.ok(out.materials[0].calculation.includes('65 千克 × 子项基准 244.318182 ÷ 父项基准 1000'));assert.ok(out.materials[0].calculation.includes('多批供给'));assert.equal(out.materials[0].bomSource.row,9);
 v.input.tables['物料清单'].push({...v.input.tables['物料清单'][0]});assert.ok(explain(v,{kind:'task',id:'T43'}).materials[0].calculation.includes('未找到唯一'));
});

test('demand Gantt analysis matches equipment Gantt and rejects tasks from other demands or machines',()=>{
 const v=make(),q=query({view:'E2'}),page=equipmentDomain.query(v,q),request={query:q,queryFingerprint:page.queryFingerprint,table:'analysis',id:'DE',node:{kind:'task',id:'T43',resource:'EQ1'}};
 const result=equipmentDomain.detail(v,request).analysis;
 assert.deepEqual(result,explain(v,{kind:'task',id:'T43'},'EQ1'));
 assert.equal(result.node.resource,'EQ1');assert.ok(result.sources.some(s=>s.sheet==='设备与工装'&&s.key==='EQ1'));
 assert.throws(()=>equipmentDomain.detail(v,{...request,node:{...request.node,resource:'EQ2'}}),/NODE_NOT_IN_QUERY/);
 assert.throws(()=>equipmentDomain.detail(v,{...request,node:{...request.node,kind:'wip',id:'WP4'}}),/NODE_NOT_IN_QUERY/);
 v.run.result.tasks.push({...v.run.result.tasks[0],id:'FOREIGN',orderId:'OTHER'});
 assert.throws(()=>equipmentDomain.detail(v,{...request,node:{...request.node,id:'FOREIGN'}}),/NODE_NOT_IN_QUERY/);
 const narrow=query({view:'E2',toDateInclusive:'2026-11-01'}),fp=equipmentDomain.query(v,narrow).queryFingerprint;
 assert.throws(()=>equipmentDomain.detail(v,{...request,query:narrow,queryFingerprint:fp,node:{kind:'task',id:'NEXT',resource:'EQ2'}}),/NODE_NOT_IN_QUERY/);
});
