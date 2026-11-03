import {hash} from './workbook-model.mjs';
import {parameterDayRatio} from './parameter-contract.mjs';
import {effectiveBom,expandBom} from './query-reports/bom.mjs';
import {selectionPredicate,changeSelection,candidatePage,searchText} from './query-reports/selections.mjs';
import {minuteMode,minuteTime,knownMinuteStops,wipOccupations,eventPeak,unionMinutes,shiftWindows} from './workbook-minute.mjs';
import {explainEquipmentNode} from './workbook-node-analysis.mjs';
import {riskTimeline,explainRiskNode} from './workbook-risk-timeline.mjs';
import {taskCard} from './workbook-task-card.mjs';
import {explainFinding,explainShortage} from '../src/lib/workbook-explanations.mjs';
const rows=(d,t)=>d.tables?.[t]||[],error=(code,status=422)=>{throw Object.assign(Error(code),{code,status});};
export const EQUIPMENT_VIEWS={E1:'设备甘特',E2:'需求交付',E3:'设备负荷',E4:'人员工装',E5:'物料风险',E6:'任务明细'};
const labels={suggestionId:'采购建议编号',relationId:'供货关系',supplierId:'供应商',orderDate:'建议下单日期',availableDate:'建议可用日期',netGap:'原缺口',id:'业务键',machine:'设备编号',earliestArrivalDate:'最早要求到货日',latestArrivalDate:'最晚要求到货日',cleaningMinutes:'清洗自然分钟',dailyCapacityKg:'冻结日投产能力（kg）',workingOccupiedMinutes:'工作窗内占用分钟',peakOccupancy:'占用峰值',occupancyDimension:'占用量纲',occupancyCapacity:'占用容量',overlap:'超占提示',name:'名称',group:'设备组',taskCount:'真实任务数',wipCount:'WIP保留数',status:'结果状态',orderId:'需求编号',productId:'物料编号',productName:'物料名称',productionId:'生产批次',routeStepId:'路线工序',operation:'工序',label:'工序名称',start:'开始时刻',end:'结束时刻（不含）',duration:'历时（分钟）',quantity:'数量',unit:'单位',crew:'班组',people:'参与人数',tools:'实体工装',predecessor:'真实前序',physicalStatus:'现场进度',customer:'客户',region:'区域',grade:'等级',requiredDate:'需求日期',readyDate:'计划就绪日期',arrivalDate:'计划到货日期',lateDays:'迟到（天）',reason:'未排/条件原因',day:'日期',taskMinutes:'任务自然分钟',wipMinutes:'WIP自然分钟',occupiedMinutes:'自然占用并集分钟',startedBatchKg:'开工日投产量（kg）',availableWorkMinutes:'可用工作分钟',utilization:'工时利用率',peak:'并发峰值',available:'可用数量',remaining:'余量',dimension:'量纲',need:'需求/在制',materialId:'物料',needDate:'需料日期',sourceKind:'风险来源',conditional:'条件供给',meaning:'口径',source:'来源',key:'业务键',sheet:'工作表',row:'原行',fileHash:'文件hash',mappingHash:'映射hash',parameterHash:'参数hash',resultHash:'结果hash',inputHash:'输入hash',startDay:'开始日',endDay:'结束日',timeUnit:'时间单位',toolEndMinute:'工装释放时刻',resource:'资源',kind:'占用性质',code:'问题代码',message:'说明'};
const cols=records=>[...new Set(records.flatMap(r=>Object.keys(r.values)))].map(key=>({key,label:labels[key]||key,fixed:key==='id',...(['start','end','toolEndMinute'].includes(key)?{format:'instant',timeUnit:'minute'}:{}),...(key==='day'||key.endsWith('Date')?{format:'date',timeUnit:'day'}:{})}));
const finite=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const dateAt=(d,zero='2026-10-31')=>new Date(Date.parse(zero+'T00:00:00Z')+d*86400000).toISOString().slice(0,10);
const day=(s,zero)=>{if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s))error('INVALID_DATE');const n=(Date.parse(s+'T00:00:00Z')-Date.parse(zero+'T00:00:00Z'))/86400000;if(!Number.isInteger(n)||dateAt(n,zero)!==s)error('INVALID_DATE');return n;};
const sourceRef=(sheet,r,key)=>({sheet,row:r?._row??null,key});
const rec=(id,values,extra={})=>({id,values:{id,...values},...extra});
const chartTask=(t,materials,resources)=>({...Object.fromEntries(['id','orderId','productionId','productId','machine','label','start','end','quantity','predecessor'].map(k=>[k,t[k]??null])),productName:materials.get(t.productId)?.['物料名称']??null,machineName:resources.get(t.machine)?.['资源名称']??null,physicalStatus:t.physicalStatus??null,unit:'千克'});
const publicRow=r=>Object.fromEntries(Object.entries(r||{}).filter(([k])=>!k.startsWith('_')));
function universe(v,field){const d=v.input,ds=rows(d,'每日需求');let opts;
 if(field==='machine')opts=rows(d,'设备与工装').filter(r=>r['资源类别']==='设备').map(r=>({id:r['资源编号'],name:r['资源名称']}));
 else if(field==='group')opts=rows(d,'设备与工装').filter(r=>r['资源类别']==='设备').map(r=>({id:r['资源组编号'],name:r['资源组名称']}));
 else if(field==='productId')opts=rows(d,'物料主数据').map(r=>({id:r['物料编号'],name:r['物料名称']}));
 else if(field==='orderId')opts=ds.map(r=>({id:r['需求编号'],name:r['成品名称']+' '+r['客户名称']}));
 else if(field==='status')opts=[{id:'scheduled',name:'已排'},{id:'unplanned',name:'未排'}];
 else error('INVALID_FILTER');return [...new Map(opts.map(o=>[o.id,o])).values()];}
const optionFp=(v,field)=>hash({context:v.identity.fingerprint,field});
function setup(v,q){if(!EQUIPMENT_VIEWS[q.view])error('INVALID_VIEW');const a=q.fromDate?day(q.fromDate,v.identity.dayZero):v.run?.selection.startDay??1,b=q.toDateInclusive?day(q.toDateInclusive,v.identity.dayZero)+1:v.run?.selection.endDay??15;if(a<0||b<=a||b-a>28||b>44)error('INVALID_DATE_WINDOW');
 const filters={};for(const [field,s]of Object.entries(q.filters||{})){const universeList=universe(v,field),fp=optionFp(v,field);filters[field]=selectionPredicate(s.fingerprint?s:{...s,fingerprint:fp},universeList,fp);}
 const products=universe(v,'productId').filter(o=>!filters.productId||filters.productId.matches(o)).map(o=>o.id),graph=effectiveBom(v.input,a),scope=expandBom(graph,products,q.includeBom===true);
 const matches=(field,id)=>!filters[field]||filters[field].matches({id:String(id??'')});
 return {start:a*1440,end:b*1440,from:a,to:b,filters,scope,graph,matches,q:searchText(q.q||'')};}
function actual(v){const p=v.run?.result;if(!p)return {tasks:[],occ:[],stops:[]};const minute=p.timeUnit==='minute';
 const seen=new Set();
 const tasks=(p.tasks||[]).map(t=>{
  if(seen.has(t.id))error('DUPLICATE_TASK_ID',409);seen.add(t.id);
  if(minute&&(!Number.isSafeInteger(t.start)||!Number.isSafeInteger(t.end)||t.end<=t.start))error('MINUTE_INTERVAL_INVALID',409);
  // day tasks are relative to dayZero; their separate legacy startMinute
  // values use a different origin. Convert from the frozen day coordinates.
  return {...t,start:minute?t.start:t.start*1440,end:minute?t.end:t.end*1440,duration:minute?t.end-t.start:(t.end-t.start)*1440,toolEndMinute:minute?t.toolEndMinute:t.end*1440,laborIntervals:minute?t.laborIntervals:[{start:t.start*1440,end:t.end*1440}]};
 });
 const facts=new Map((v.input.mapping?.wip_remaining||[]).map(w=>[w.id,w]));
 const wip=(minute?wipOccupations(v.input,-Infinity,Infinity):(v.input.mapping?.wip_remaining||[]).map(w=>({start:w.current_occupancy_day_interval[0]*1440,end:w.current_occupancy_day_interval[1]*1440,resource:w.resource,crew:w.remaining_labor_pool,people:w.remaining_labor_count,tools:w.current_tools||[],toolsKnown:Array.isArray(w.current_tools),taskId:w.id,kind:'WIP物理保留',labor:[{start:w.current_occupancy_day_interval[0]*1440,end:w.current_occupancy_day_interval[1]*1440}]}))).map(o=>({...o,toolsKnown:Array.isArray(o.tools),productId:facts.get(o.taskId)?.product,orderId:o.taskId,productionId:o.taskId,routeStepId:facts.get(o.taskId)?.current_route_step}));
 const occ=[...tasks.map(t=>({...t,resource:t.machine,taskId:t.id,labor:t.laborIntervals||[],tools:t.tools||[],toolsKnown:Array.isArray(t.tools),toolEnd:t.toolEndMinute,kind:'真实任务'})),...tasks.filter(t=>t.cleaning).map(t=>({...t.cleaning,labor:[{start:t.cleaning.start,end:t.cleaning.end}],tools:[],taskId:t.id+'-CLEAN',parentTaskId:t.id,productId:t.productId,orderId:t.orderId,kind:'清洗'})),...wip];
 const stops=minute?knownMinuteStops(v.input,v.run.selection.currentMinute??v.run.selection.currentDay*1440):rows(v.input,'停机安排').filter(r=>Number(r['可知日'])<=v.run.selection.currentDay).map(r=>({id:r['停机编号'],resource:r['资源编号'],start:Number(r['开始日'])*1440,end:Number(r['结束日'])*1440}));return {tasks,occ,stops};}
function project(v,q){const date=n=>Number.isFinite(n)?dateAt(n,v.identity.dayZero):null;const c=setup(v,q),d=v.input,p=v.run?.result,a=actual(v),materials=new Map(rows(d,'物料主数据').map(r=>[r['物料编号'],r])),res=new Map(rows(d,'设备与工装').map(r=>[r['资源编号'],r]));
 const taskFilters=t=>(!q.taskId||t.id===q.taskId)&&c.matches('machine',t.machine)&&c.matches('group',res.get(t.machine)?.['资源组编号'])&&c.scope.ids.has(t.productId)&&c.matches('orderId',t.orderId)&&c.matches('status',p?.demandResults.find(r=>r.id===t.orderId)?.status??'scheduled');
 const selectedTasks=a.tasks.filter(taskFilters),tasks=selectedTasks.filter(t=>t.start<c.end&&t.end>c.start),taskIds=new Set(selectedTasks.map(t=>t.id));
 const limited=!!q.taskId||Object.entries(c.filters).some(([f,s])=>s.selectedCount<universe(v,f).length),empty=Object.values(c.filters).some(s=>s.selectedCount===0);
 const occupations=a.occ.filter(o=>o.start<c.end&&Math.max(o.end,o.toolEnd??o.end)>c.start).filter(o=>o.kind==='真实任务'?taskIds.has(o.taskId):o.kind==='清洗'?taskIds.has(o.parentTaskId):o.start<c.end&&(o.toolEnd??o.end)>c.start&&c.matches('machine',o.resource)&&c.matches('group',res.get(o.resource)?.['资源组编号'])&&c.scope.ids.has(o.productId)&&c.matches('orderId',o.orderId)&&c.matches('status','scheduled'));
 const resourceIds=new Set(occupations.map(o=>o.resource));
 let out=[];
 if(!p)return {records:[],c,a,note:v.run?'运行'+v.run.status+'；尚无可用结果。':'无run；输入参考与实际排程分开。'};
 if(q.view==='E1')out=rows(d,'设备与工装').filter(r=>r['资源类别']==='设备'&&c.matches('machine',r['资源编号'])&&c.matches('group',r['资源组编号'])&&(!limited||resourceIds.has(r['资源编号']))).map(r=>{const id=r['资源编号'],ts=tasks.filter(t=>t.machine===id),w=occupations.filter(o=>o.resource===id&&o.kind==='WIP物理保留'&&o.start<c.end&&o.end>c.start);return rec(id,{machine:id,name:r['资源名称'],group:r['资源组编号'],taskCount:ts.length,wipCount:w.length,status:ts.length?'本运行有已排任务':'本运行无已排任务；不代表现场空闲'}, {resource:id,taskIds:ts.map(t=>t.id),refs:[sourceRef('设备与工装',r,id)],tasks:ts.map(t=>({id:t.id,orderId:t.orderId,productionId:t.productionId,productId:t.productId,label:t.label,start:t.start,end:t.end,quantity:t.quantity,predecessor:t.predecessor})),layers:[...w.map(o=>({id:o.taskId,start:o.start,end:o.end,kind:o.kind})),...a.stops.filter(s=>s.resource===id&&s.start<c.end&&s.end>c.start).map(s=>({...s,kind:'可知停机'}))]});});
 if(q.view==='E2')out=p.demandResults.filter(r=>c.scope.ids.has(r.productId)&&c.matches('orderId',r.id)&&c.matches('status',r.status)).filter(r=>{const de=rows(d,'每日需求').find(x=>x['需求编号']===r.id);return Number(de?.['需求日'])>=c.from&&Number(de?.['需求日'])<c.to;}).map(r=>{const source=rows(d,'每日需求').find(x=>x['需求编号']===r.id),customer=rows(d,'客户与交付').find(x=>x['客户编号']===source?.['客户编号']);return rec(r.id,{orderId:r.id,productId:r.productId,productName:materials.get(r.productId)?.['物料名称'],customer:customer?.['客户名称']??null,region:customer?.['区域名称']??null,grade:customer?.['客户等级']??null,quantity:r.quantity,unit:r.unit,requiredDate:source?date(Number(source['需求日'])):null,earliestArrivalDate:source&&finite(source['最早到货日'])!==null?date(Number(source['最早到货日'])):null,latestArrivalDate:source&&finite(source['最晚到货日'])!==null?date(Number(source['最晚到货日'])):null,readyDate:finite(r.readyDay)===null?null:date(Math.floor(r.readyDay)),arrivalDate:finite(r.arrivalDay)===null?null:date(r.arrivalDay),lateDays:r.lateDays,status:r.status,taskCount:a.tasks.filter(t=>t.orderId===r.id).length,reason:p.findings.filter(f=>f.need===r.id).map(f=>f.message).join('；')||'计划/条件结果；无实际交付实绩'}, {refs:[{sheet:'每日需求',row:source?._row??null,key:r.id}]});});
 if(q.view==='E6')out=tasks.map(t=>rec(t.id,{...Object.fromEntries(['orderId','productId','productionId','routeStepId','operation','label','machine','start','end','duration','quantity','crew','people','tools','predecessor','toolEndMinute'].map(k=>[k,t[k]??null])),productName:materials.get(t.productId)?.['物料名称'],unit:'千克',physicalStatus:t.physicalStatus||'未提供'}, {taskIds:[t.id],refs:[{sheet:t.source?.sheet,row:t.source?.row??null,key:t.routeStepId}]}));
 if(q.view==='E3')for(const r of rows(d,'设备与工装').filter(r=>r['资源类别']==='设备'&&c.matches('machine',r['资源编号'])&&c.matches('group',r['资源组编号'])&&(!limited||resourceIds.has(r['资源编号'])))){
  const id=r['资源编号'],own=occupations.filter(o=>o.resource===id),full=a.occ.filter(o=>o.resource===id),task=own.filter(o=>o.kind==='真实任务'),wip=own.filter(o=>o.kind==='WIP物理保留');
  // Availability uses the complete frozen machine route context, independently
  // of which product is being displayed. Ambiguous crew bases stay unknown.
  const crewIds=[...new Set(rows(d,'工艺路线').filter(rt=>rt['设备组编号']===r['资源组编号']).map(rt=>rt['班组编号']))],crew=crewIds.length===1?rows(d,'班组资源').find(x=>x['班组编号']===crewIds[0]):null;
  for(let day=c.from;day<c.to;day++){
   const start=day*1440,end=start+1440,cal=rows(d,'工厂日历').find(x=>Number(x['日序'])===day),stops=a.stops.filter(s=>s.resource===id);
   const windows=minuteMode(d)&&crew&&cal?shiftWindows(d,crew,day):null;
   // Intersect interval unions so overlapping configured shifts or downtimes
   // cannot subtract the same minute twice.
   const base=windows?unionMinutes(windows,start,end):null,stopWork=windows?intersections(windows,stops,start,end):null,available=base===null?null:base-stopWork;
   const working=windows?intersections(windows,own,start,end):null;
   const rawCapacity=finite(r['标准日产能千克']),ratio=crew&&cal?(minuteMode(d)?Math.min(Number(cal['生产班次数'])/Number(cal['日产能分母']),windows.length/Number(crew['标准日班次数'])):parameterDayRatio(d,cal,crew,day)):null;
   const capacity=rawCapacity!==null&&Number.isFinite(ratio)&&ratio>=0?rawCapacity*ratio:null;
   const shared=r['资源占用方式']==='重量共享',peak=shared?eventPeak(own.map(o=>({...o,amount:o.quantity})),start,end):eventPeak(own,start,end),weight=shared?finite(r['同时占位上限千克']):null;
   out.push(rec(id+'|'+day,{machine:id,name:r['资源名称'],group:r['资源组编号'],day,taskMinutes:unionMinutes(task,start,end),wipMinutes:unionMinutes(wip,start,end),cleaningMinutes:unionMinutes(own.filter(o=>o.kind==='清洗'),start,end),occupiedMinutes:unionMinutes(own,start,end),startedBatchKg:task.filter(t=>t.start>=start&&t.start<end).reduce((n,t)=>n+t.quantity,0),dailyCapacityKg:capacity,availableWorkMinutes:available,workingOccupiedMinutes:working,utilization:available>0&&!shared&&r['生产日历方式']==='工厂班次'?working/available:null,peakOccupancy:peak,occupancyDimension:shared?'千克':'台',occupancyCapacity:shared?weight:1,overlap:shared?(weight===null?null:peak>weight):peak>1,meaning:available===null?'工作分母口径未提供；自然历时与开工日投产量分列':'冻结班组窗口扣可知停机；日量仅记开工日；热力颜色不代表全约束通过'}, {taskIds:task.filter(t=>t.start<end&&t.end>start).map(t=>t.taskId),resource:id,day,refs:[sourceRef('设备与工装',r,id),sourceRef('工厂日历',cal,String(day))],resourceContext:{crewIds,completeOccupationCount:full.length}}));
  }
 }
 if(q.view==='E4'){
  const definitions=[...rows(d,'班组资源').map(r=>({id:r['班组编号'],name:r['班组名称'],dimension:'人',available:finite(r['每班可用人数']),crew:true,source:sourceRef('班组资源',r,r['班组编号'])})),...rows(d,'设备与工装').filter(r=>r['资源类别']==='工装').map(r=>({id:r['资源编号'],name:r['资源名称'],dimension:'实体套',available:finite(r['可用数量']),source:sourceRef('设备与工装',r,r['资源编号'])}))];
  for(const r of definitions){
   const own=occupations.filter(o=>r.crew?o.crew===r.id:o.tools?.includes(r.id));if(limited&&!own.length)continue;
   for(let day=c.from;day<c.to;day++){
    const start=day*1440,end=(day+1)*1440,unknown=r.crew?own.some(o=>finite(o.people)===null):occupations.some(o=>o.toolsKnown===false),segments=r.crew?own.flatMap(o=>(o.labor||[]).map(l=>({...l,amount:o.people}))):own.map(o=>({start:o.start,end:o.toolEnd??o.end})),peak=unknown?null:eventPeak(segments,start,end);
    out.push(rec(r.id+'|'+day,{resource:r.id,name:r.name,day,peak,available:r.available,remaining:r.available===null||peak===null?null:r.available-peak,dimension:r.dimension,meaning:unknown?'历史映射未提供实体/人数，峰值不推测':r.crew?'事件峰值；首尾参与及WIP尾段，不乘班次':'实体区间；包含WIP及有依据后延归还'}, {taskIds:own.filter(o=>o.start<end&&(o.toolEnd??o.end)>start).map(o=>o.taskId),resource:r.id,day,refs:[r.source]}));
   }
  }
 }
 if(q.view==='E5'){
  const risk=(id,kind,r,values)=>rec(id,{sourceKind:kind,materialId:r.materialId??null,quantity:r.quantity??null,unit:r.unit??materials.get(r.materialId)?.['基础单位']??null,need:r.need??null,needDate:finite(r.needDay??r.feedDay)===null?null:date(Math.floor(r.needDay??r.feedDay)),taskId:r.taskId??null,productionId:r.source?.productionId??null,...values},{need:r.need,taskIds:r.taskId?[r.taskId]:[],refs:[r.source].filter(Boolean),timeline:riskTimeline(v,id.split(':')[0],r)});
  out=[...(p.shortages||[]).map(r=>risk('shortage:'+r.id,'真实净缺口',r,{conditional:null,meaning:'未排需求也保留真实缺口'})),...(p.findings||[]).map((r,i)=>risk('finding:'+i,'运行问题',r,{code:r.code,message:r.message,quantity:null,unit:null,meaning:'未测待料/损耗保持未知'})),...(p.allocations||[]).map((r,i)=>risk('allocation:'+i,r.conditional?'条件供给分配':'供给分配',r,{conditional:r.conditional===true,meaning:r.supplyId,supplyId:r.supplyId})),...(p.suggestions||[]).map((r,i)=>risk('suggestion:'+i,'参考采购建议（未采用非实物）',r,{conditional:true,meaning:'建议不自动下达，不回填供给',suggestionId:r.id??null,relationId:r.relationId??null,supplierId:r.supplierId??null,orderDate:finite(r.orderDay)===null?null:date(r.orderDay),availableDate:finite(r.availableDay)===null?null:date(r.availableDay),lateDays:r.lateDays??null,netGap:r.netGap??r.quantity??null}))].filter(r=>{
   const demand=p.demandResults.find(x=>x.id===r.need),source=rows(d,'每日需求').find(x=>x['需求编号']===r.need),material=r.values.materialId||demand?.productId;
   const eventDate=r.values.needDate,filterDate=eventDate||(source?date(Number(source['需求日'])):null);
   return (!material||c.scope.ids.has(material))&&(!r.need||c.matches('orderId',r.need))&&c.matches('status',demand?.status)&&(!filterDate||filterDate>=date(c.from)&&filterDate<date(c.to));
  });
 }
 if(q.view==='E5'&&q.riskScope!==undefined){
  if(!['risk','supply','all'].includes(q.riskScope))error('INVALID_RISK_SCOPE');
  if(q.riskScope!=='all')out=out.filter(r=>q.riskScope==='risk'?r.id.startsWith('shortage:')||r.id.startsWith('finding:'):r.id.startsWith('allocation:')||r.id.startsWith('suggestion:'));
 }
 if(empty)out=[];
 if(out.length>50000)error('PROJECTION_LIMIT',413);
 if(c.q)out=out.filter(r=>JSON.stringify(r.values).toLowerCase().includes(c.q));
 const key=q.sort||'id',direction=q.direction==='desc'?-1:1;out.sort((a,b)=>{const x=a.values[key],y=b.values[key];return ((typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''),'zh-CN',{numeric:true}))||a.id.localeCompare(b.id))*direction;});
 return {records:out,c,a,note:'全部为同run冻结结果；计算完成不代表生产完成/已交付。日量、自然历时与工作利用率分别解释。'};
}
function intersections(a,b,start,end){return unionMinutes(a.flatMap(x=>b.map(y=>({start:Math.max(start,x.start,y.start),end:Math.min(end,x.end,y.end)}))),start,end);}
function displayInstant(value,v){
 if(value===null||!Number.isFinite(value))return null;
 if(v.run.result.timeUnit==='minute')return minuteTime(value,v.identity.minuteOrigin);
 // Old day values retain any sub-minute precision and their original dayZero.
 const point=new Date(Date.parse(v.identity.dayZero+'T00:00:00+08:00')+(value+480)*60000).toISOString();
 return point.slice(0,point.endsWith('00.000Z')?16:point.endsWith('.000Z')?19:23).replace(/-/g,'.').replace('T',' ');
}
function fingerprint(v,q){const {offset,chunkOffset,queryFingerprint,columns,scope,ids,identity,...filters}=q;return hash({identity:v.identity,query:filters});}
function checked(v,q){const r=project(v,q),fp=fingerprint(v,q);if(q.queryFingerprint&&q.queryFingerprint!==fp)error('QUERY_CHANGED',409);return {...r,fp};}
export const equipmentDomain={
 catalog(v){return {views:Object.entries(EQUIPMENT_VIEWS).map(([id,label])=>({id,label})),fromDate:dateAt(v.run?.selection.startDay??1,v.identity.dayZero),toDateInclusive:dateAt((v.run?.selection.endDay??15)-1,v.identity.dayZero),preferenceScope:hash(v.actor),note:v.run?'同运行冻结六视图':'无run，只能查输入参考'};},
 options(v,q){const field=q.field,options=universe(v,field),fp=optionFp(v,field);let s=(q.query?.filters||{})[field]||{mode:'ALL',fingerprint:fp};if(!s.fingerprint)s={...s,fingerprint:fp};if(q.action)s=changeSelection(options,s,q.action,fp);const p=candidatePage(options,s,{search:q.search||'',offset:q.offset||0,limit:100},fp);return {...p,selectedTotal:p.selected,items:p.items.map(x=>({...x,label:x.id+' · '+(x.name||x.id),selected:x.checked}))};},
 query(v,q){const {records,c,fp,note}=checked(v,q),size=q.pageSize??100,offset=q.chunkOffset??q.offset??0;if(![100,200,500].includes(size)||!Number.isSafeInteger(offset)||offset<0)error('INVALID_PAGE');const part=[];let bytes=0;for(const r of records.slice(offset,offset+size)){const n=Buffer.byteLength(JSON.stringify(r));if(n>120000)error('RECORD_LIMIT',413);if(bytes+n>180000)break;part.push(r);bytes+=n;}const summary={};for(const r of records){const u=r.values.unit;if(u&&typeof r.values.quantity==='number'){const kind=r.values.sourceKind||(q.view==='E6'?'任务加工量（跨工序不等于交付量）':'需求量');summary[kind]??={};summary[kind][u]=(summary[kind][u]||0)+r.values.quantity;}}
 return {view:q.view,queryFingerprint:fp,records:part,total:records.length,offset,nextOffset:offset+part.length<records.length?offset+part.length:null,columns:cols(records),summaryByUnit:summary,diagnostics:c.graph.diagnostics,note,notProvided:!v.run?.result?['真实运行结果']:[]};},
 detail(v,q){
  const query=q.query||q,{records,fp,a,c}=checked(v,{...query,queryFingerprint:q.queryFingerprint});
  // Gantt tasks are paged separately: a large demand must not inflate one
  // summary record beyond the transport limit or silently lose its task chain.
  if(q.table==='equipment-load-matrix'){
   if(query.view!=='E3')error('MATRIX_REQUIRES_EQUIPMENT_LOAD');
   const offset=q.offset??0;if(!Number.isSafeInteger(offset)||offset<0)error('INVALID_PAGE');
   const grouped=new Map();for(const row of records){const id=row.values.machine;if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(row);}
   const real=new Set(a.tasks.map(t=>t.id));
   const matrix=[...grouped].map(([id,cells])=>{
    const ids=new Set(cells.flatMap(r=>r.taskIds||[])),days=new Set(cells.map(r=>r.values.day));
    const complete=days.size===c.to-c.from&&cells.every(r=>r.values.day>=c.from&&r.values.day<c.to);
    const occupied=cells.reduce((sum,r)=>sum+r.values.occupiedMinutes,0),stops=a.stops.filter(s=>s.resource===id);
    return {id,taskCount:[...ids].filter(id=>real.has(id)).length,windowOccupancy:complete?occupied/((c.to-c.from)*1440):null,records:cells.map(r=>({id:r.id,values:r.values,downtimeMinutes:unionMinutes(stops,r.values.day*1440,(r.values.day+1)*1440)}))};
   });
   const part=[];let bytes=0;for(const row of matrix.slice(offset,offset+100)){const n=Buffer.byteLength(JSON.stringify(row));if(n>120000)error('DETAIL_RECORD_LIMIT',413);if(bytes+n>180000)break;part.push(row);bytes+=n;}
   return {queryFingerprint:fp,resources:part,total:matrix.length,nextOffset:offset+part.length<matrix.length?offset+part.length:null};
  }
  if(q.table==='personnel-matrix'){
   if(query.view!=='E4')error('MATRIX_REQUIRES_PERSONNEL');
   const offset=q.offset??0;if(!Number.isSafeInteger(offset)||offset<0)error('INVALID_PAGE');
   const groups=new Map();for(const row of records){const id=row.values.resource;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);}
   const real=new Set(a.tasks.map(t=>t.id)),matrix=[...groups].map(([id,cells])=>{const ids=new Set(cells.flatMap(r=>r.taskIds||[]));return {id,taskCount:[...ids].filter(id=>real.has(id)).length,records:cells.map(r=>({id:r.id,values:r.values}))};});
   const part=[];let bytes=0;for(const row of matrix.slice(offset,offset+100)){const n=Buffer.byteLength(JSON.stringify(row));if(n>120000)error('DETAIL_RECORD_LIMIT',413);if(bytes+n>180000)break;part.push(row);bytes+=n;}
   return {queryFingerprint:fp,resources:part,total:matrix.length,nextOffset:offset+part.length<matrix.length?offset+part.length:null};
  }
  if(q.table==='timeline'){
   if(query.view!=='E2')error('TIMELINE_REQUIRES_DEMAND');
   if(!Array.isArray(q.orderIds)||q.orderIds.length>500||q.orderIds.some(id=>typeof id!=='string'||!records.some(r=>r.id===id)))error('RECORD_NOT_FOUND',404);
   const offset=q.offset??0;if(!Number.isSafeInteger(offset)||offset<0)error('INVALID_PAGE');
   const materials=new Map(rows(v.input,'物料主数据').map(r=>[r['物料编号'],r])),resources=new Map(rows(v.input,'设备与工装').map(r=>[r['资源编号'],r]));
   const wanted=new Set(q.orderIds),tasks=a.tasks.filter(t=>wanted.has(t.orderId)&&t.start<c.end&&t.end>c.start),part=[];let bytes=0;
   for(const t of tasks.slice(offset,offset+500)){const row=chartTask(t,materials,resources),n=Buffer.byteLength(JSON.stringify(row));if(n>120000)error('DETAIL_RECORD_LIMIT',413);if(bytes+n>180000)break;part.push(row);bytes+=n;}
   return {queryFingerprint:fp,tasks:part,total:tasks.length,nextOffset:offset+part.length<tasks.length?offset+part.length:null};
  }
  const record=records.find(r=>r.id===q.id);if(!record)error('RECORD_NOT_FOUND',404);
  if(q.table==='task-card'){
   if(query.view!=='E2')error('TASK_CARD_REQUIRES_DEMAND');
   return {queryFingerprint:fp,...taskCard(v,{record,a,c,node:q.node,section:q.section,offset:q.offset})};
  }
  const p=v.run.result,ids=new Set(query.view==='E2'?a.tasks.filter(t=>t.orderId===record.id).map(t=>t.id):record.taskIds||[]),selectedTasks=a.tasks.filter(t=>ids.has(t.id)),task=selectedTasks[0],resource=record.resource||record.values.resource||record.values.machine,day=record.day??record.values.day;
  // An unplanned E2 demand has no task IDs. Bind its details by the real demand
  // ID as well; otherwise risks and route/parameter sources disappear entirely.
  const needs=new Set([record.need,record.values.need,record.values.orderId,...selectedTasks.map(t=>t.orderId)].filter(Boolean));
  const relatedFindings=(p.findings||[]).filter(f=>needs.has(f.need)||f.taskId&&ids.has(f.taskId));
  const relatedShortages=(p.shortages||[]).filter(s=>needs.has(s.need)||s.taskId&&ids.has(s.taskId)),explanationPlan={...p,dayZero:v.identity.dayZero};
  const explanations=[...relatedFindings.map(f=>explainFinding(f,explanationPlan)),...relatedShortages.map(s=>explainShortage(s,explanationPlan))];
  const own=a.occ.filter(o=>ids.has(o.taskId)||ids.has(o.parentTaskId)||o.resource===resource||o.crew===resource||o.tools?.includes(resource)).filter(o=>!Number.isInteger(day)||o.start<(day+1)*1440&&Math.max(o.end,o.toolEnd??o.end)>day*1440);
  const keys=new Set([resource,record.need,...(record.resourceContext?.crewIds||[]),...selectedTasks.flatMap(t=>[t.routeStepId,t.productId,t.machine,t.crew,...(t.tools||[])]),...own.flatMap(o=>[o.resource,o.crew,...(o.tools||[])]),...(record.refs||[]).map(r=>r?.key)].filter(Boolean));
  for(const f of relatedFindings)for(const key of [f.routeStepId,f.materialId])if(key)keys.add(key);
  for(const s of relatedShortages)if(s.materialId)keys.add(s.materialId);
  for(const r of rows(v.input,'每日需求'))if(needs.has(r['需求编号'])){keys.add(r['成品编号']);keys.add(r['客户编号']);}
  const sourceRows=[...(record.refs||[]).filter(Boolean),...selectedTasks.map(t=>({...t.source,key:t.routeStepId})),...own.filter(o=>o.source).map(o=>o.source)];
  for(const f of relatedFindings)if(f.evidence?.supplySource?.sheet)sourceRows.push({...f.evidence.supplySource,key:f.evidence.supplyId});
  for(const [sheet,key]of [['设备与工装','资源编号'],['班组资源','班组编号'],['工艺路线','路线工序编号']])for(const r of rows(v.input,sheet))if(keys.has(r[key]))sourceRows.push(sourceRef(sheet,r,r[key]));
  if(Number.isInteger(day))for(const sheet of ['工厂日历','生产班次'])for(const r of rows(v.input,sheet))if(sheet==='工厂日历'?Number(r['日序'])===day:Math.floor(Number(r['开始分钟偏移'])/1440)===day)sourceRows.push(sourceRef(sheet,r,r['班次日历编号']||String(day)));
  let values=[];const tab=q.table||'record';
  if(tab==='analysis'){
   if(query.view==='E5')return {queryFingerprint:fp,analysis:explainRiskNode(v,{record,node:q.node})};
   if(!['E1','E2'].includes(query.view))error('NODE_ANALYSIS_REQUIRES_GANTT');
   let nodeRecord=record;
   if(query.view==='E2'){
    const selected=selectedTasks.find(t=>t.id===q.node?.id);
    if(q.node?.kind!=='task'||!selected||q.node.resource!==selected.machine)error('NODE_NOT_IN_QUERY',404);
    nodeRecord={...record,resource:selected.machine,tasks:selectedTasks};
   }
   return {queryFingerprint:fp,analysis:explainEquipmentNode(v,{record:nodeRecord,a,c,node:q.node})};
  }
  if(tab==='record')values=[record];
  else if(tab==='rules')values=explanations.map((e,i)=>rec('rule:'+i,{'需求/在制':e.need,'问题类型':e.title,'处理规则':e.logic,'本次判定依据':e.facts.join('；')||'本记录未保存具体候选数值','结果处理':e.effect,'完善位置':e.action,'证据说明':e.limitation}));
  else if(tab==='chain'){
   // Follow real predecessor edges inside one production batch, never list order.
   const byId=new Map(a.tasks.map(t=>[t.id,t])),edges=new Map();
   for(const t of a.tasks){const prev=byId.get(t.predecessor);if(!prev||prev.productionId!==t.productionId)continue;for(const [x,y]of [[t.id,prev.id],[prev.id,t.id]]){if(!edges.has(x))edges.set(x,[]);edges.get(x).push(y);}}
   const chain=new Set(ids),queue=[...ids];for(let i=0;i<queue.length;i++)for(const id of edges.get(queue[i])||[])if(!chain.has(id)){chain.add(id);queue.push(id);}
   values=a.tasks.filter(t=>chain.has(t.id)).map(t=>rec(t.id,publicRow(t)));
  }else if(tab==='resources')values=own.map(o=>rec(o.taskId+'|'+o.kind,{...publicRow(o),labor:o.labor}));
  else if(tab==='risk'){
   values=[...(p.shortages||[]),...(p.allocations||[]),...(p.findings||[]),...(p.suggestions||[])].filter(r=>needs.has(r.need)||r.taskId&&ids.has(r.taskId)).map((r,i)=>rec(String(i),publicRow(r)));
  }else if(tab==='parameters')values=(v.input.effectiveParameters?.values||[]).filter(r=>keys.has(r.object)||['CAL','GLOBAL'].includes(r.object)).map((r,i)=>rec(String(i),r));
  else if(tab==='basis'){
   const relevant=[['设备与工装','资源编号'],['班组资源','班组编号'],['工艺路线','路线工序编号']];
   for(const [sheet,key]of relevant)for(const r of rows(v.input,sheet))if(keys.has(r[key])){values.push(rec(sheet+'|'+r[key],{sheet,...publicRow(r)}));sourceRows.push(sourceRef(sheet,r,r[key]));}
   if(Number.isInteger(day)){
    for(const sheet of ['工厂日历','生产班次'])for(const r of rows(v.input,sheet))if(sheet==='工厂日历'?Number(r['日序'])===day:Math.floor(Number(r['开始分钟偏移'])/1440)===day){values.push(rec(sheet+'|'+r._row,{sheet,...publicRow(r)}));sourceRows.push(sourceRef(sheet,r,r['班次日历编号']||String(day)));}
    for(const stop of a.stops)if(keys.has(stop.resource)&&stop.start<(day+1)*1440&&stop.end>day*1440)values.push(rec('stop|'+stop.id,stop));
   }
   values.push(rec('verification',{status:p.verification?.status??null,issues:p.verification?.issues??null,notChecked:p.verification?.notChecked??null,meaning:'冻结检查结论；缺失不等于通过，热力颜色不代表全约束通过'}));
  }else if(tab==='sources'){
   const unique=new Map(sourceRows.map(r=>{const value={...r,fileHash:r.fileHash||v.input.fileHash,row:r.row??null};return [JSON.stringify(value),value];}));
   values=[...[...unique.values()].map((r,i)=>rec('source:'+i,r)),rec('identity',{runId:v.run.id,...v.identity}),rec('mapping',{version:v.input.mapping?.version??null,meaning:'只读本run冻结映射；原行缺失保留null'})];
  }else error('INVALID_DETAIL_SECTION');
  const offset=q.offset||0;if(!Number.isSafeInteger(offset)||offset<0)error('INVALID_PAGE');
  const part=[];let bytes=0;for(const r of values.slice(offset,offset+100)){const n=Buffer.byteLength(JSON.stringify(r));if(n>120000)error('DETAIL_RECORD_LIMIT',413);if(bytes+n>180000)break;part.push(r);bytes+=n;}
  const explanationNote=explanations.length?'处理规则说明展示判定及撤销逻辑；历史未保存的候选数值明确标为缺失。':needs.size?'本对象没有保存计算问题记录；这不表示所有业务约束通过。':'请在需求交付或物料风险中打开具体需求，查看其处理规则。';
  return {queryFingerprint:fp,records:part,total:values.length,nextOffset:offset+part.length<values.length?offset+part.length:null,columns:cols(values),ruleDetails:tab==='rules'?explanations.slice(offset,offset+part.length):[],explanations:tab==='record'?explanations.slice(0,3):[],explanationTotal:explanations.length,explanationNote,note:'只读冻结来源；缺行号保留null，现场状态/损耗不推测',links:task?a.tasks.filter(t=>t.productionId===task.productionId&&(t.id===task.predecessor||t.predecessor===task.id)).map(t=>({id:t.id,label:t.id})):[]};
 },
 export(v,q){const {records,fp}=checked(v,q),selected=q.scope==='SELECTED'?new Set(q.ids||[]):null;const columns=q.columns?.length?q.columns:cols(records).map(c=>c.key);if(columns.some(k=>!cols(records).some(c=>c.key===k)))error('INVALID_COLUMNS');return (function*(){yield JSON.stringify({type:'identity',identity:v.identity,queryFingerprint:fp,columns,total:records.filter(r=>!selected||selected.has(r.id)).length})+'\n';for(const r of records)if(!selected||selected.has(r.id)){const value=Object.fromEntries(columns.map(k=>[k,r.values[k]??null]));for(const key of ['start','end','toolEndMinute'])if(Object.hasOwn(value,key)){value[key+'Time']=displayInstant(value[key],v);}yield JSON.stringify({id:r.id,values:value})+'\n';}})();}
};
