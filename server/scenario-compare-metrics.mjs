import {scenarioDayMetrics} from './scenario-compare-day-metrics.mjs';
import {hash,rows,dayDate} from './workbook-model.mjs';
import {shiftWindows,unionMinutes,weightSharedResource,wipOccupations} from './workbook-minute.mjs';
import {KPI_DEFINITION,scError} from './scenario-compare-policy.mjs';
const numeric=n=>typeof n==='number'&&Number.isFinite(n);
const signature=t=>({start:t.start,end:t.end,machine:t.machine,crew:t.crew,people:t.people,tools:t.tools,quantity:t.quantity,status:t.executionStatus??null});
const lineage=t=>t.productionId&&t.routeStepId&&t.orderId?[t.orderId,t.productionId,t.routeStepId].join('|'):null;
export function taskChanges(base,candidate,ids){
 const daily=base.timeUnit==='day'||candidate.timeUnit==='day',keyOf=t=>daily?(t.orderId&&t.productId&&t.routeStepId?[t.orderId,t.productId,t.routeStepId].join('|'):null):lineage(t);
 const groups=ts=>{const m=new Map();for(const t of ts.filter(t=>!ids||ids.has(t.orderId))){const key=keyOf(t);if(!key)return null;(m.get(key)||m.set(key,[]).get(key)).push(t);}return m;};
 const a=groups(base.tasks||[]),b=groups(candidate.tasks||[]);if(!a||!b)return {comparable:false,rate:null,total:null,changed:null,records:[],reason:'缺少稳定需求/生产批/路线工序谱系'};
 const encode=ts=>hash(ts.map(t=>{const value=signature(t);if(daily)delete value.status;return value;}).sort((a,b)=>a.start-b.start||a.end-b.end||String(a.machine).localeCompare(String(b.machine))));
 const records=[...a].map(([id,before])=>{const after=b.get(id)||[],changed=encode(before)!==encode(after);return {id,demandId:before[0].orderId,materialId:before[0].productId,changed,removed:!after.length,before,after,reason:changed?'同基准重新计算产生差异；条件与资源/供给证据如下，未证明单一因果':'未变化'};});
 const total=daily?records.reduce((n,r)=>n+r.before.length,0):records.length,changed=records.filter(r=>r.changed).reduce((n,r)=>n+(daily?r.before.length:1),0);return {comparable:true,method:daily?'同需求/产品/工序组核对拆合变化，组内变化计入全部原任务':'稳定生产批/工序谱系',total,changed,rate:total?changed/total:null,records,newTasks:[...b].filter(([key])=>!a.has(key)).flatMap(([,v])=>v)};
}
export function scenarioMetrics(input,result,base,definition,filter={}){
 if(definition.kpiDefinition!==KPI_DEFINITION)throw scError('KPI_DEFINITION','指标定义不同，须另建比较组','kpiDefinition',409);
 if(definition.timeUnit&&[result.timeUnit,base.timeUnit].some(unit=>unit!==definition.timeUnit))throw scError('TIME_UNIT','比较结果与冻结基准的时间单位不一致','timeUnit',409);
 const selected=new Set(definition.demandIds),materialIds=filter.materialIds===undefined?null:new Set(filter.materialIds),demandIds=filter.demandIds===undefined?null:new Set(filter.demandIds);
 const source=rows(input,'每日需求').filter(r=>selected.has(r['需求编号'])&&(!materialIds||materialIds.has(r['成品编号']))&&(!demandIds||demandIds.has(r['需求编号']))),ids=new Set(source.map(r=>r['需求编号'])),byId=new Map((result.demandResults||[]).map(r=>[r.id,r]));
 const demands=source.map(s=>{
  const r=byId.get(s['需求编号']),quantity=Number(s['需求千克']),scheduled=r?.completedQuantity!==undefined&&r?.scheduledQuantity!==undefined?r.completedQuantity+r.scheduledQuantity:r?.status==='scheduled'?r.quantity:null;
  const uncovered=numeric(r?.unplannedQuantity)?r.unplannedQuantity:numeric(scheduled)?Math.max(0,quantity-scheduled):null;
  const due=Number(s['最晚到货日']),arrival=numeric(r?.arrivalDay)?r.arrivalDay:null,known=numeric(due)&&arrival!==null&&uncovered===0;
  return {id:s['需求编号'],materialId:s['成品编号'],unit:'千克',quantity,uncoveredQuantity:uncovered,requiredDate:Number.isFinite(due)?dayDate(due):null,arrivalDate:arrival!==null?dayDate(arrival):null,lateDays:known?Math.max(0,arrival-due):null,status:r?.status==='unplanned'||uncovered>0?'unplanned':!known?'unknown':arrival<=due?'on_time':'late',known,source:s._source||{sheet:'每日需求',row:s._row},allocations:(result.allocations||[]).filter(a=>a.need===s['需求编号']),findings:(result.findings||[]).filter(a=>a.need===s['需求编号'])};
 });
 const known=demands.filter(r=>r.known),onTime=demands.filter(r=>r.status==='on_time'),tasks=(result.tasks||[]).filter(t=>ids.has(t.orderId)),changes=taskChanges(base,result,ids),start=definition.selection.startDay*1440,end=definition.selection.endDay*1440;
 if(result.timeUnit==='day')return scenarioDayMetrics(input,result,definition,demands,changes,tasks);
 const resourceRecords=[],wip=wipOccupations(input,start,end);
 for(const r of rows(input,'设备与工装').filter(r=>r['资源类别']==='设备')){
  const own=tasks.filter(t=>t.machine===r['资源编号']),windows=[],crewIds=[...new Set(rows(input,'工艺路线').filter(rt=>rt['设备组编号']===r['资源组编号']).map(rt=>rt['班组编号']))];
  for(const c of rows(input,'班组资源').filter(c=>crewIds.includes(c['班组编号'])))for(let day=definition.selection.startDay;day<definition.selection.endDay;day++)windows.push(...shiftWindows(input,c,day,r['资源编号']));
  // Equipment minutes cannot be added to kg occupancy of a shared chamber.
  const shared=weightSharedResource(r),physical=[...own.map(t=>({start:t.cleaning?.start??t.start,end:t.end,quantity:t.quantity})),...wip.filter(w=>w.resource===r['资源编号'])],occupied=shared?physical.reduce((n,t)=>n+Math.max(0,Math.min(end,t.end)-Math.max(start,t.start))*t.quantity,0):unionMinutes(physical,start,end),available=windows.length?(shared?Number(r['同时占位上限千克']):1)*unionMinutes(windows,start,end):null;
  resourceRecords.push({id:r['资源编号'],unit:shared?'千克×分钟':'设备分钟',occupied,available,load:available?occupied/available:null,reason:available===null?'缺少可证明的有效班次容量':null,tasks:own,wip:wip.filter(w=>w.resource===r['资源编号']),windows});
 }
 const cleanings=tasks.filter(t=>t.cleaning).map(t=>({id:t.id,resource:t.machine,...t.cleaning,minutes:t.cleaning.end-t.cleaning.start}));
 for(const crew of rows(input,'班组资源')){
  const id=crew['班组编号'],regular=[],extra=(input.scenarioConditions?.personnel||[]).filter(c=>c.crew===id),ot=(input.scenarioConditions?.overtime||[]).filter(c=>c.crew===id),own=tasks.filter(t=>t.crew===id);
  for(let day=definition.selection.startDay;day<definition.selection.endDay;day++)regular.push(...shiftWindows(input,crew,day).filter(w=>!w.overtime));
  const labor=[...own.flatMap(t=>(t.laborIntervals||[]).map(l=>({...l,people:t.people,taskId:t.id}))),...cleanings.filter(t=>t.crew===id).map(t=>({...t,people:t.people})),...wip.filter(w=>w.crew===id).flatMap(w=>w.labor.map(l=>({...l,people:w.people,taskId:w.taskId})))];
  const occupied=labor.reduce((n,l)=>n+Math.max(0,Math.min(end,l.end)-Math.max(start,l.start))*l.people,0),available=regular.length?Number(crew['每班可用人数'])*unionMinutes(regular,start,end)+extra.reduce((n,c)=>n+(c.after-c.before)*Math.max(0,Math.min(end,c.end)-Math.max(start,c.start)),0)+ot.reduce((n,c)=>n+c.people*Math.max(0,Math.min(end,c.end)-Math.max(start,c.start)),0):null;
  resourceRecords.push({id,unit:'人×分钟',occupied,available,load:available?occupied/available:null,reason:available===null?'班组有效日历缺失':null,tasks:own,labor,windows:[...regular,...ot],capacityChanges:extra});
 }
 for(const tool of rows(input,'设备与工装').filter(r=>r['资源类别']==='工装')){const id=tool['资源编号'],own=tasks.filter(t=>t.tools.includes(id)),physical=[...own.map(t=>({start:t.start,end:t.toolEndMinute})),...wip.filter(w=>w.tools.includes(id)).map(w=>({start:w.start,end:w.toolEnd??w.end}))];resourceRecords.push({id,unit:'实体工装分钟',occupied:unionMinutes(physical,start,end),available:null,load:null,reason:'没有独立工装有效日历，不推定全天可用；实际重用仍由全局独立检查阻断',tasks:own});}
 const overtime=(input.scenarioConditions?.overtime||[]).map(o=>{const own=tasks.filter(t=>t.machine===o.resource&&t.crew===o.crew),segments=own.map(t=>({start:Math.max(t.cleaning?.start??t.start,o.start),end:Math.min(t.end,o.end)})).filter(s=>s.end>s.start);return {id:o.id,conditionId:o.id,resource:o.resource,start:o.start,end:o.end,minutes:unionMinutes(segments,o.start,o.end),source:o.source,segments,taskIds:own.map(t=>t.id)};}).filter(r=>r.minutes>0);
 const shortages=(result.shortages||[]).filter(r=>ids.has(r.need)),risks=(result.findings||[]).filter(r=>ids.has(r.need)&&/效期|临期|质量|到期/.test(JSON.stringify(r)));
 const cost=knownCost(overtime,definition.costs||[]);
 const unknown=demands.filter(r=>r.status==='unknown').length;
 return {definition:KPI_DEFINITION,scope:{demandIds:[...ids],selection:definition.selection},summary:{N:demands.length,onTime:onTime.length,onTimeRate:demands.length?onTime.length/demands.length:null,unplanned:demands.filter(r=>r.status==='unplanned').length,late:demands.filter(r=>r.status==='late').length,unknown,coverage:demands.length?(demands.length-unknown)/demands.length:null,delayDays:known.reduce((n,r)=>n+r.lateDays,0),delayKnown:known.length,taskChangeRate:changes.rate,taskDenominator:changes.total,changedTasks:changes.changed,cleaningMinutes:cleanings.reduce((n,r)=>n+r.minutes,0),overtimeMinutes:overtime.reduce((n,r)=>n+r.minutes,0),cost},demands,changes,resources:resourceRecords,cleanings,overtime,shortages,risks,conditions:input.scenarioConditions?.changes||[],causality:'列出显式条件、任务谱系、实际供给与瓶颈；未证明单条件因果，无改善是合法结果'};
}
export function knownCost(overtime,rates){
 if(!Array.isArray(rates))throw scError('COST','费率须为明确列表','costs');
 const detail=overtime.map(o=>{const matches=rates.filter(r=>r.enabled===true&&r.category==='overtime'&&r.resource===o.resource&&r.unit==='元/小时'&&typeof r.currency==='string'&&Number.isFinite(r.rate)&&r.rate>=0&&Number.isSafeInteger(r.start)&&Number.isSafeInteger(r.end)&&r.start<=o.start&&o.end<=r.end);return {...o,amount:matches.length===1?o.minutes*matches[0].rate/60:null,currency:matches.length===1?matches[0].currency:null};});
 if(!rates.some(r=>r.enabled===true))return {status:'unknown',label:'费用未启用或定义缺失',totals:[],detail};
 const currencies=[...new Set(detail.filter(r=>r.amount!==null).map(r=>r.currency))];return {status:'known_items_only',label:'已知项目小计，非完整总成本',unknown:detail.filter(r=>r.amount===null).length,totals:currencies.map(currency=>({currency,amount:detail.filter(r=>r.currency===currency).reduce((n,r)=>n+r.amount,0)})),detail};
}
