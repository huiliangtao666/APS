import test from 'node:test';
import assert from 'node:assert/strict';
import {instantMinute,minuteTime,eventPeak,unionMinutes,routeMinutes,laborSegments,wipOccupations,knownMinuteStops,minuteResourceCandidate,MINUTE_ORIGIN} from '../server/workbook-minute.mjs';
import {integrateParameterImport} from '../server/parameter-import.mjs';
import {parameterIssues} from '../server/parameter-contract.mjs';
import {checkPrivateV2} from './equipment-minute-v2.mjs';
import {validateAtomic,specification,adoptDefinitionBounds} from '../server/parameter-contract.mjs';
import {verifyMinutePlan} from '../server/workbook-minute-verify.mjs';
import {equipmentDomain} from '../server/workbook-equipment.mjs';
import {hash} from '../server/workbook-model.mjs';

test('MC001/MC002 minute fidelity and half-open participation have independent expected values',()=>{
 const a=instantMinute('2026.11.01 08:07'),b=instantMinute('2026.11.01 08:24'),c=instantMinute('2026.11.01 08:41');
 assert.deepEqual([a,b,c],[1927,1944,1961]);assert.equal(b-a,17);
 assert.equal(minuteTime(a,MINUTE_ORIGIN),'2026.11.01 08:07');
 assert.equal(eventPeak([{start:a,end:b,amount:2},{start:b,end:c,amount:3}]),3);
 assert.equal(eventPeak([{start:a,end:b,amount:2},{start:b,end:c,amount:3},{start:1937,end:1950,amount:1}]),4);
 assert.equal(unionMinutes([{start:a,end:b},{start:b,end:c}]),34);
});
test('midnight is an exclusive instant and does not lose the following day',()=>{
 const a=instantMinute('2026.11.01 23:45'),b=instantMinute('2026.11.02 00:15');
 assert.equal(b-a,30);assert.equal(unionMinutes([{start:a,end:b}],1440,2880),15);assert.equal(unionMinutes([{start:a,end:b}],2880,4320),15);
 assert.throws(()=>instantMinute('2026-11-01T08:07:30+08:00'),/整数分钟/);
});
test('fixed duration is not scaled by quantity and minimum is not added twice',()=>{
 const r={'工时模型':'固定连续历时','基准加工分钟':'1440','固定准备分钟':'0','最短工艺分钟':'1440','基准加工量千克':'500'};
 assert.equal(routeMinutes(r,100),1440);
 assert.equal(routeMinutes({...r,'工时模型':'按量加工','基准加工分钟':'160','固定准备分钟':'15','最短工艺分钟':'0'},250),95);
});
test('minute knowledge boundary is 09:17, not the beginning of that day',()=>{
 const d={tables:{'停机安排':[{'停机编号':'DT004','资源编号':'EQ001','信息可知时刻':'2026.11.15 09:17','开始分钟偏移':'22157','结束分钟偏移':'22202'}]}};
 assert.equal(knownMinuteStops(d,instantMinute('2026.11.15 09:16')).length,0);
 assert.equal(knownMinuteStops(d,instantMinute('2026.11.15 09:17')).length,1);
});
test('V2 enum rules are explicit and CP016 expression still rejects zero/negative',()=>{
 assert.equal(validateAtomic(specification('工时模型'),'按量加工'),'按量加工');assert.throws(()=>validateAtomic(specification('工时模型'),'猜测'));
 const d={};for(const n of [0,-1])assert.throws(()=>adoptDefinitionBounds(d,{'对象编号':'X','参数名称':'每箱净重千克','参数值':String(n),'单位':'千克/箱'}));
 assert.doesNotThrow(()=>adoptDefinitionBounds(d,{'对象编号':'X','参数名称':'每箱净重千克','参数值':'10','单位':'千克/箱'}));
});

// No private workbooks are committed. This is an opt-in input/integration check,
// not a Worker run and not permission to retry a latched OOM or exhausted window.
test('private V2 full import and both file orders resolve the same adopted values',{skip:!process.env.APS_V2_BUSINESS_FILE||!process.env.APS_V2_PARAMETER_FILE},()=>{
 assert.equal(checkPrivateV2().manifest.result,'PASS');
});

test('overlapping head and tail labor participation counts the same people once',()=>{
 const segments=laborSegments({'人员参与方式':'首尾参与','开始参与分钟':'15','结束参与分钟':'15'},100,117);
 assert.deepEqual(segments,[{start:100,end:117}]);
 assert.equal(eventPeak(segments.map(s=>({...s,amount:2}))),2);
});
test('WIP reservations outside the selected horizon are excluded, physical release is retained',()=>{
 const d={mapping:{wip_remaining:[{id:'W',current_occupancy_minute_interval:[100,200],current_tools:['T'],tool_release:220,labor_end_minutes:15}]}};
 assert.equal(wipOccupations(d,0,100).length,0);
 assert.equal(wipOccupations(d,200,300)[0].end,200);
 assert.equal(wipOccupations(d,220,300).length,0);
 assert.equal(wipOccupations(d,150,180)[0].toolEnd,220);
});

// Hand-computed examples exercise the projection, rather than using the planner
// as its own oracle. They contain no private V2 data and are not a substitute for
// the full original-workbook check or real run/browser acceptance.
function equipmentExample(){
 const equipment=(id,kind='设备')=>({'资源编号':id,'资源名称':id,'资源类别':kind,'资源组编号':'G','可用数量':'1','标准日产能千克':'1000','资源占用方式':'独占','生产日历方式':'工厂班次'});
 const task=(id,start,end,people)=>({id,start,end,duration:end-start,startMinute:start,endMinute:end,toolEndMinute:end,laborIntervals:[{start,end}],machine:'EQ1',crew:'C',people,tools:['TL1'],productId:'M1',orderId:'DE1',productionId:'BATCH1',routeStepId:'RT1',label:'真实工序',quantity:100,source:{sheet:'工艺路线',row:null}});
 const input={id:'D',version:2,productionContract:'workbook-minute-v2',fileHash:'business-original',tables:{
  '物料主数据':[{'物料编号':'M1','物料名称':'成品1'},{'物料编号':'M2','物料名称':'在制品'},{'物料编号':'RM','基础单位':'千克'}],
  '物料清单':[],
  '每日需求':[{'需求编号':'DE1','成品编号':'M1','需求日':'1','客户编号':'CU'},{'需求编号':'DE0','成品编号':'M1','需求日':'1','客户编号':'CU'}],
  '客户与交付':[{'客户编号':'CU','客户名称':'客户'}],
  '设备与工装':[equipment('EQ1'),equipment('EQ2'),equipment('TL1','工装'),equipment('TL2','工装')],
  '班组资源':[{'班组编号':'C','班组名称':'班组','每班可用人数':'5','标准日班次数':'2','周日班次数':'1'}],
  '工艺路线':[{'路线工序编号':'RT1','设备组编号':'G','班组编号':'C'}],
  '工厂日历':[{'日序':'1','生产班次数':'1','日产能分母':'2'},{'日序':'2','生产班次数':'2','日产能分母':'2'}],
  '生产班次':[{'开始分钟偏移':'1920'},{'开始分钟偏移':'3360'},{'开始分钟偏移':'3840'}],
  '停机安排':[]
 },mapping:{wip_remaining:[{id:'W1',product:'M2',resource:'EQ1',quantity:50,current_route_step:'RT1',current_occupancy_minute_interval:[1900,1950],remaining_labor_pool:'C',remaining_labor_count:1,labor_end_minutes:15,current_tools:['TL2'],tool_release:1950,source:{sheet:'在制剩余映射',row:null}}]},effectiveParameters:{values:['第一班开始分钟','第一班结束分钟','第二班开始分钟','第二班结束分钟'].map((field,i)=>({object:'CAL',field,value:[480,960,960,1440][i],from:0,to:44}))}};
 const result={timeUnit:'minute',tasks:[task('T1',1927,1944,2),{...task('T2',1944,1961,3),predecessor:'T1'}],demandResults:[{id:'DE1',productId:'M1',status:'scheduled',quantity:200,unit:'千克',readyDay:1,arrivalDay:1},{id:'DE0',productId:'M1',status:'unplanned',quantity:20,unit:'千克',readyDay:null,arrivalDay:null}],findings:[{code:'NO_SUPPLY',need:'DE0',message:'没有供给'}],shortages:[{id:'S1',materialId:'RM',quantity:20,unit:'千克',need:'DE0',needDay:1}],allocations:[],suggestions:[],verification:{status:'pass',notChecked:[]}};
 return {input,actor:'owner',identity:{fingerprint:'F',dayZero:'2026-10-31',minuteOrigin:MINUTE_ORIGIN,runId:'R'},run:{id:'R',selection:{startDay:1,endDay:3,currentDay:1},result}};
}
const equipmentQuery=(view,extra={})=>({view,fromDate:'2026-11-01',toDateInclusive:'2026-11-01',pageSize:100,sort:'id',direction:'asc',...extra});

test('E1/E2/E3/E4 retain no-task resources, unplanned demand, WIP and distinct load bases',()=>{
 const v=equipmentExample(),e1=equipmentDomain.query(v,equipmentQuery('E1'));
 assert.equal(e1.total,2);assert.equal(e1.records.find(r=>r.id==='EQ2').values.taskCount,0);
 const delivery=equipmentDomain.query(v,equipmentQuery('E2')).records.find(r=>r.id==='DE0');
 assert.equal(delivery.values.readyDate,null);assert.equal(delivery.values.arrivalDate,null);
 const load=equipmentDomain.query(v,equipmentQuery('E3')).records.find(r=>r.values.machine==='EQ1').values;
 assert.equal(load.taskMinutes,34);assert.equal(load.wipMinutes,50);assert.equal(load.occupiedMinutes,61);
 assert.equal(load.startedBatchKg,200);assert.equal(load.dailyCapacityKg,500);assert.equal(load.availableWorkMinutes,480);
 // WIP [1935,1950) intersects T1 then T2, so peak is 3+1=4, not 2+3+1.
 const crew=equipmentDomain.query(v,equipmentQuery('E4')).records.find(r=>r.values.resource==='C').values;
 assert.equal(crew.peak,4);assert.equal(crew.available,5);assert.equal(crew.remaining,1);
});
test('all views honor an explicit empty material selection; selected products constrain load and labor',()=>{
 const v=equipmentExample();
 for(const view of ['E1','E2','E3','E4','E5','E6'])assert.equal(equipmentDomain.query(v,equipmentQuery(view,{filters:{productId:{mode:'NONE'}}})).total,0,view);
 const filters={productId:{mode:'VALUES',values:['M1']}};
 assert.equal(equipmentDomain.query(v,equipmentQuery('E3',{filters})).records[0].values.wipMinutes,0);
 assert.equal(equipmentDomain.query(v,equipmentQuery('E4',{filters})).records.find(r=>r.values.resource==='C').values.peak,3);
});
test('a retained tool remains occupied after its production task ended on the previous day',()=>{
 const v=equipmentExample();v.input.mapping.wip_remaining=[];
 v.run.result.tasks=[{...v.run.result.tasks[0],start:2800,end:2875,toolEndMinute:2890,laborIntervals:[{start:2800,end:2875}]}];
 const q=equipmentQuery('E4',{fromDate:'2026-11-02',toDateInclusive:'2026-11-02'});
 assert.equal(equipmentDomain.query(v,q).records.find(r=>r.values.resource==='TL1').values.peak,1);
 assert.equal(equipmentDomain.query(v,{...q,view:'E6'}).total,0);
});
test('E5 retains risks without tasks and applies date and result filters without inventing a need time',()=>{
 const v=equipmentExample(),q=equipmentQuery('E5',{filters:{status:{mode:'VALUES',values:['unplanned']}}});
 const r=equipmentDomain.query(v,q);assert.equal(r.total,2);
 assert.equal(r.records.find(r=>r.values.code==='NO_SUPPLY').values.needDate,null);
 assert.equal(equipmentDomain.query(v,{...q,fromDate:'2026-11-02',toDateInclusive:'2026-11-02'}).total,0);
});
test('E3 day details use the frozen calendar, and E6 follows only real same-batch predecessor edges',()=>{
 const v=equipmentExample(),q=equipmentQuery('E3'),page=equipmentDomain.query(v,q);
 const detail=equipmentDomain.detail(v,{query:q,queryFingerprint:page.queryFingerprint,id:'EQ1|1',table:'basis'});
 assert.ok(detail.records.some(r=>r.values.sheet==='工厂日历'));
 const exact=equipmentQuery('E6',{taskId:'T1'}),tasks=equipmentDomain.query(v,exact);
 assert.equal(tasks.total,1);
 assert.deepEqual(equipmentDomain.detail(v,{query:exact,queryFingerprint:tasks.queryFingerprint,id:'T1',table:'chain'}).records.map(r=>r.id),['T1','T2']);
 assert.throws(()=>equipmentDomain.query(v,{...exact,queryFingerprint:'wrong'}),/QUERY_CHANGED/);
});
test('full-query sorting, count and export include a unique match beyond 500 records',()=>{
 const v=equipmentExample(),template=v.run.result.tasks[0];v.input.mapping.wip_remaining=[];
 v.run.result.tasks=Array.from({length:601},(_,i)=>({...template,id:'T'+String(i).padStart(4,'0'),label:i===600?'末页唯一标记':'工序'}));
 const q=equipmentQuery('E6',{pageSize:500}),seen=new Set();let offset=0,fp;
 do{const page=equipmentDomain.query(v,{...q,offset,queryFingerprint:fp});fp=page.queryFingerprint;assert.equal(page.total,601);for(const r of page.records){assert.ok(!seen.has(r.id));seen.add(r.id);}if(page.nextOffset===null)break;assert.ok(page.nextOffset>offset);offset=page.nextOffset;}while(true);
 assert.equal(seen.size,601);
 const exported=[...equipmentDomain.export(v,{...q,queryFingerprint:fp})].map(s=>JSON.parse(s));assert.equal(exported.length,602);
 assert.equal(equipmentDomain.query(v,{...q,q:'末页唯一标记'}).total,1);
 assert.throws(()=>equipmentDomain.export(v,{...q,queryFingerprint:'changed'}),/QUERY_CHANGED/);
});
test('legacy day coordinates retain their own origin and never overwrite the frozen input or result',()=>{
 const v=equipmentExample();delete v.input.productionContract;v.input.mapping.wip_remaining=[];
 v.identity.minuteOrigin='2026-11-02T08:00:00+08:00';v.run.result.timeUnit='day';
 v.run.result.tasks=[{...v.run.result.tasks[0],start:1.25,end:1.5,startMinute:-3000,endMinute:-2640}];
 const before=hash(v),q=equipmentQuery('E6'),page=equipmentDomain.query(v,q);
 assert.equal(page.records[0].values.start,1800);
 const out=[...equipmentDomain.export(v,{...q,queryFingerprint:page.queryFingerprint})].map(s=>JSON.parse(s));
 assert.equal(out[1].values.startTime,'2026.11.01 06:00');assert.equal(hash(v),before);
});

// The complete private V2 exposed relational CP066 catalog metadata. These
// small public examples verify the same import/validation seam without another
// private eight-stage attempt or a planner call.
const pairedCatalog=()=>({parameterWorkbook:true,tables:{'配置参数':[
 ['P-LOW','最低温度','-25'],['P-HIGH','最高温度','-18']
].map(([id,field,value],i)=>({'参数编号':id,'对象编号':'LOC','参数名称':field,'参数值':value,'单位':'摄氏度','生效日':'0','失效日':'44',_row:i+3}))},parameterDefinitions:[{'参数编号':'CP066','最大值':'须≥最低温度'}],parameterCategories:[],parameterAnnotations:{discussions:[],questions:[],reference:[]},parameterCounts:{definitions:1,instances:2},classification:[],issues:[],warnings:[],schemaVersion:'explicit-regression'});
const pairedOptions={id:'paired-example',name:'explicit paired bounds',expectedVersion:0,fileHash:'synthetic-P',adoptParameters:true,actor:'owner'};
test('P catalog relational boundary permits parameter-first adoption and preserves strict scalar bounds',()=>{
 const parsed=pairedCatalog(),before=hash(parsed),r=integrateParameterImport(parsed,null,pairedOptions);
 assert.deepEqual(r.issues,[]);assert.equal(hash(parsed),before);
 assert.equal(r.d.parameterDefinitions[0]['最大值'],'须≥最低温度');
 assert.equal(r.d.tables['配置参数'].length,2);
 assert.deepEqual(r.d.tables['配置参数'].map(p=>p['参数值']),['-25','-18']);
 assert.ok(r.d.tables['配置参数'].every(p=>p._sourceRole==='P'&&!p._candidate));
 const d={tables:{'库区库位':[{'库位编号':'LOC','最低温度':'-25','最高温度':'-18'}]},parameterDefinitions:parsed.parameterDefinitions};
 assert.doesNotThrow(()=>adoptDefinitionBounds(d,{'对象编号':'LOC','参数名称':'最低温度','参数值':'-25'}));
 assert.throws(()=>adoptDefinitionBounds({...d,parameterDefinitions:[{'参数编号':'CP066','最大值':'须≥未知字段'}]},{'对象编号':'LOC','参数名称':'最低温度','参数值':'-25'}),/有限数值/);
 assert.throws(()=>adoptDefinitionBounds({parameterDefinitions:[{'参数编号':'CP016','最小值':'>0'}]},{'参数名称':'每箱净重千克','参数值':'0'}),/P目录边界/);
});
test('P catalog relational boundary still rejects reversed temperatures and waiting at future effective boundaries',()=>{
 const r=integrateParameterImport(pairedCatalog(),null,pairedOptions),d=r.d;
 d.tables['库区库位']=[{'库位编号':'LOC','最低温度':'-25','最高温度':'-18'}];
 assert.deepEqual(parameterIssues(d,{completeness:false}),[]);
 d.tables['配置参数'].push({...d.tables['配置参数'][0],'参数编号':'FUTURE-LOW','参数值':'-10','生效日':'7','失效日':'8',_sourceRole:'EDIT'});
 const temperatureIssues=parameterIssues(d,{completeness:false});
 assert.ok(temperatureIssues.some(i=>i.code==='PARAMETER_RELATION'&&i.record==='LOC'&&i.field==='最低温度'&&i.sheet==='库区库位'&&i.message==='最低温度不得大于最高温度；dataset，日7'));
 assert.ok(!temperatureIssues.some(i=>i.code==='PARAMETER_INVALID'));
 d.tables['配置参数'].pop();
 d.tables['配置参数'].push({...d.tables['配置参数'][0],'参数编号':'TRIAL-LOW','参数值':'-10','生效日':'7','失效日':'8',_sourceRole:'EDIT',_scope:'trial:temperature'});
 const scoped=parameterIssues(d,{completeness:false}).filter(i=>i.code==='PARAMETER_RELATION');
 assert.deepEqual(scoped.map(i=>[i.record,i.field,i.message]),[['LOC','最低温度','最低温度不得大于最高温度；trial:temperature，日7']]);
 console.log('REJECTION_FACTS '+JSON.stringify({temperatureIssues,scoped}));
 const waiting={parameterDefinitions:[{'参数编号':'CP093','最大值':'须≥最小等待'}],tables:{'工艺路线':[{'路线工序编号':'ROUTE','最小等待天数':'0','最大等待天数':'1'}],'配置参数':[
 {'参数编号':'MIN','对象编号':'ROUTE','参数名称':'最小等待天数','参数值':'2','单位':'天','生效日':'7','失效日':'8',_sourceRole:'P'},
 {'参数编号':'MAX','对象编号':'ROUTE','参数名称':'最大等待天数','参数值':'1','单位':'天','生效日':'0','失效日':'44',_sourceRole:'P'}]}};
 const waitingIssues=parameterIssues(waiting,{completeness:false});
 assert.ok(waitingIssues.some(i=>i.code==='PARAMETER_RELATION'&&i.record==='ROUTE'&&i.field==='最小等待天数'&&i.message==='最小等待天数不得大于最大等待天数；dataset，日7'));
 console.log('REJECTION_FACTS '+JSON.stringify({waitingIssues}));
 assert.ok(!parameterIssues(waiting,{completeness:false}).some(i=>i.code==='PARAMETER_INVALID'));
});

test('V2 resource literals preserve weight-capacity sharing and tool set units without weakening checks',()=>{
 const parsed=pairedCatalog();parsed.parameterDefinitions=[];
 parsed.tables['配置参数']=[
 {'参数编号':'OCC','对象编号':'EQ','参数名称':'资源占用方式','参数值':'重量容量共享','单位':'枚举','生效日':'0','失效日':'44'},
 {'参数编号':'TOOLS','对象编号':'TL','参数名称':'可用数量','参数值':'1','单位':'套','生效日':'0','失效日':'44'}];
 const r=integrateParameterImport(parsed,null,pairedOptions);assert.deepEqual(r.issues,[]);
 assert.equal(r.d.tables['配置参数'][0]['参数值'],'重量容量共享');
 r.d.tables['设备与工装']=[{'资源编号':'EQ','资源类别':'设备'},{'资源编号':'TL','资源类别':'工装'}];
 assert.deepEqual(parameterIssues(r.d,{completeness:false}),[]);
 r.d.tables['设备与工装'][1]['资源类别']='设备';
 const equipmentUnit=parameterIssues(r.d,{completeness:false});
 assert.ok(equipmentUnit.some(i=>i.record==='TOOLS'&&i.field==='参数值'&&i.code==='PARAMETER_INVALID'&&i.message==='套仅适用于实体工装可用数量'));
 r.d.tables['设备与工装'][1]['资源类别']='工装';r.d.tables['配置参数'][1]['单位']='千克';
 const massUnit=parameterIssues(r.d,{completeness:false});
 assert.ok(massUnit.some(i=>i.record==='TOOLS'&&i.field==='参数值'&&i.code==='PARAMETER_INVALID'&&['可用数量单位不匹配：千克','对象单位映射已变化，保留来源维度并拒绝静默重解释'].includes(i.message)));
 console.log('REJECTION_FACTS '+JSON.stringify({equipmentUnit,massUnit}));
 assert.throws(()=>validateAtomic(specification('资源占用方式'),'任意共享'));
 assert.throws(()=>validateAtomic(specification('可用数量'),'1.5'));
});
test('V2 weight-capacity sharing independently limits allocator and frozen WIP checker at 5000kg',()=>{
 const resource={'资源编号':'EQ','资源类别':'设备','资源组编号':'G','可用数量':'1','单次批量上限千克':'5000','同时占位上限千克':'5000','标准日产能千克':'10000','资源占用方式':'重量容量共享','生产日历方式':'工厂班次'},crew={'班组编号':'C','每班可用人数':'10','标准日班次数':'2','周日班次数':'2'};
 const d={productionContract:'workbook-minute-v2',tables:{'工厂日历':[{'日序':'0','生产班次数':'1','日产能分母':'2'}],'生产班次':[{'开始分钟偏移':'480'}],'停机安排':[],'设备与工装':[resource],'班组资源':[crew]},effectiveParameters:{values:['第一班开始分钟','第一班结束分钟','第二班开始分钟','第二班结束分钟'].map((field,i)=>({object:'CAL',field,value:[480,960,960,1440][i],from:0,to:44}))},mapping:{feed_mappings:[],wip_remaining:[]}};
 const route={'设备组编号':'G','成品编号':'M','需求人数':'0','每批工装套数':'0','工时模型':'固定连续历时','基准加工分钟':'17','固定准备分钟':'0','最短工艺分钟':'0','基准加工量千克':'500','人员参与方式':'全程参与','允许跨班连续':'否','结束参与分钟':'0','开始参与分钟':'0','工装后延释放分钟':'0'};
 const args={d,route,quantity:2000,earliest:480/1440,end:1,occupancy:[{resource:'EQ',start:480/1440,end:600/1440,quantity:3000,tools:[],people:0}],daily:new Map(),resources:[resource],crew,pool:[],standardBatch:5000,currentMinute:0};
 assert.equal(minuteResourceCandidate(args).start*1440,480);
 args.occupancy[0].quantity=4000;assert.equal(minuteResourceCandidate(args).start*1440,600);
 resource['资源占用方式']='独占';args.occupancy[0].quantity=3000;assert.equal(minuteResourceCandidate(args).start*1440,600);
 resource['资源占用方式']='重量容量共享';
 const w=(id,quantity)=>({id,resource:'EQ',quantity,current_occupancy_minute_interval:[480,600],current_tools:[],tool_release:600,remaining_labor_pool:'C',remaining_labor_count:0,labor_end_minutes:0,remaining_route_steps:[],remaining_material_bom_ids:[]});
 d.mapping.wip_remaining=[w('A',3000),w('B',2000)];
 const plan={engineIdentity:'workbook-minute-v2',minuteOrigin:MINUTE_ORIGIN,timeUnit:'minute',timezone:'Asia/Shanghai',conditions:{startDay:0,endDay:1,currentMinute:0},tasks:[],demandResults:[],allocations:[]};
 assert.equal(verifyMinutePlan(d,plan).status,'pass');
 d.mapping.wip_remaining[1].quantity=2001;assert.ok(verifyMinutePlan(d,plan).issues.includes('共享重量超占 EQ'));
 d.mapping.wip_remaining[1].quantity=2000;resource['资源占用方式']='独占';assert.ok(verifyMinutePlan(d,plan).issues.includes('独占设备超占 EQ'));
});

test('E5 procurement references retain former preview fields and remain nonphysical suggestions',()=>{
 const v=equipmentExample();v.run.result.suggestions=[{id:'SUG-RELOCATE',need:'DE0',materialId:'RM',quantity:23,unit:'千克',needDay:1,relationId:'REL1',supplierId:'SUP1',orderDay:1,availableDay:3,lateDays:2,netGap:20}];
 const q=equipmentQuery('E5'),page=equipmentDomain.query(v,q),row=page.records.find(r=>r.values.suggestionId==='SUG-RELOCATE');
 assert.ok(row);assert.equal(row.values.sourceKind,'参考采购建议（未采用非实物）');assert.equal(row.values.relationId,'REL1');assert.equal(row.values.availableDate,'2026-11-03');assert.equal(row.values.orderDate,'2026-11-01');assert.equal(row.values.lateDays,2);assert.equal(row.values.quantity,23);assert.equal(row.values.netGap,20);
 const detail=equipmentDomain.detail(v,{query:q,queryFingerprint:page.queryFingerprint,id:row.id,table:'record'});assert.equal(detail.records[0].values.relationId,'REL1');assert.equal(detail.records[0].values.availableDate,'2026-11-03');
 v.run.result.suggestions[0].availableDay=null;assert.equal(equipmentDomain.query(v,q).records.find(r=>r.id===row.id).values.availableDate,null);
});
