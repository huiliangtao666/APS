import {effectiveParameters} from './parameter-contract.mjs';
import {rows,hash} from './workbook-model.mjs';
import {equipmentActual} from './workbook-equipment.mjs';
import {unionMinutes,eventPeak} from './workbook-minute.mjs';
import {dayResourceCapacity,dayCrewCapacity,dayCrewPoints} from './scenario-compare-day.mjs';
import {capacityDayInput} from './capacity-analysis-model.mjs';
import {analyzeCapacity} from './capacity-analysis.mjs';
import {scheduleCapacityOptions} from './schedule-capacity-input.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n),ratio=(n,d)=>d>0?n/d:null;
const overlap=(o,a,b)=>o.start<b&&(o.toolEnd??o.end)>a;
const date=(v,n)=>new Date(Date.parse(v.identity.dayZero+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function resourceDay(v,actual,d,day){
 const start=day*1440,end=start+1440,all=actual.occ.filter(o=>overlap(o,start,end)),calendar=rows(d,'工厂日历').find(r=>Number(r['日序'])===day),routes=[...rows(d,'工艺路线'),...(d.mapping?.sfRoutes||[])],out=[];
 const physical=rows(d,'设备与工装').map(r=>({...r}));for(const r of d.mapping?.resources||[])if(!physical.some(p=>p['资源编号']===r.id))physical.push({'资源编号':r.id,'资源名称':r.id,'资源类别':r.kind,'资源组编号':r.group,'可用数量':r.units,'标准日产能千克':r.daily_kg,'单次批量上限千克':r.batch_kg,'同时占位上限千克':r.occupancy_kg,_mapped:true});
 for(const resource of physical){
  const id=resource['资源编号'],machine=resource['资源类别']==='设备',own=all.filter(o=>machine?o.resource===id:o.tools?.includes(id)),taskIds=[...new Set(own.map(o=>o.taskId))],ops=routes.filter(r=>machine?r['设备组编号']===resource['资源组编号']:own.some(o=>o.routeStepId===r['路线工序编号']));
  const common={id,kind:machine?'equipment':'tools',name:resource['资源名称']||id,taskIds,operations:[...new Set(ops.map(o=>o['工序名称']||o['路线工序编号']))],sources:[{table:resource._mapped?'资源映射':'设备与工装',object:id,row:resource._row??null}],wipCount:own.filter(o=>o.kind==='WIP物理保留').length};
  if(machine){
   const stops=actual.stops.filter(o=>o.resource===id),stopped=unionMinutes(stops,start,end),used=unionMinutes(own,start,end),available=Number(resource['可用数量']??1)>0?Math.max(0,1440-stopped):0;
   const crews=rows(d,'班组资源').filter(c=>ops.some(o=>o['班组编号']===c['班组编号'])),caps=crews.map(c=>dayResourceCapacity(d,resource,c,calendar,day).total),dailyKg=caps.length?Math.max(...caps):null,startedKg=actual.tasks.filter(t=>t.machine===id&&start<=t.start&&t.start<end).reduce((n,t)=>n+t.quantity,0),load=ratio(used,available),kgLoad=ratio(startedKg,dailyKg);
   out.push({...common,used,available,unit:'自然分钟',load:load===null?kgLoad:kgLoad===null?load:Math.max(load,kgLoad),occupancyLoad:load,startedKg,dailyKg,stopped,overload:used>available+1e-6||dailyKg!==null&&startedKg>dailyKg+1e-6,parameterSources:Object.fromEntries(['生产班次数','日产能分母'].map(field=>[field,[{table:'工厂日历',object:String(day),row:calendar?._row??null}]])),parameters:{标准日产能千克:Number(resource['标准日产能千克']),单次批量上限千克:Number(resource['单次批量上限千克']),生产班次数:Number(calendar?.['生产班次数']??calendar?.['日产能分子']),日产能分母:Number(calendar?.['日产能分母'])},explanation:'自然占用取任务、清洗及WIP的区间并集；可用自然分钟=1440−已知停机并集。投产千克只记开工日，按工厂/合格班组交集折算；多班组取可行上限，不相加。负荷取自然占用比例与日投产比例较大值。'});
  }else if(resource['资源类别']==='工装'){
   const unknown=all.some(o=>!o.toolsKnown),used=unknown?null:eventPeak(own.map(o=>({start:o.start,end:o.toolEnd??o.end})),start,end),available=Number(resource['可用数量']??1)>0?1:0;
   out.push({...common,used,available,unit:'实体套（峰值）',load:used===null?null:ratio(used,available),overload:used!==null&&used>available,parameters:{来源可用数量:Number(resource['可用数量']??1),实体编号数:1},explanation:unknown?'存在未明确实体工装的历史占用，本日峰值无法完整核定。':'按实体编号及释放时刻计算并发峰值，包含WIP；同一编号只算一套。增加资源须新增实体，不能把可用数量由1改大后重复计数。'});
  }
 }
 for(const crew of rows(d,'班组资源')){
  const id=crew['班组编号'],own=all.filter(o=>o.crew===id),segments=own.flatMap(o=>(o.labor||[]).map(l=>({...l,amount:o.people}))),unknown=segments.some(o=>!finite(o.amount));
  const points=[start,...segments.flatMap(o=>[o.start,o.end]),...dayCrewPoints(d,crew,day,day+1).map(n=>n*1440)].filter(n=>start<=n&&n<end);
  let used=0,available=dayCrewCapacity(d,crew,day),load=0,overload=false;
  for(const point of points){const n=segments.filter(o=>o.start<=point&&point<o.end).reduce((n,o)=>n+o.amount,0),cap=dayCrewCapacity(d,crew,point/1440),weight=cap>0?n/cap:n>0?Infinity:0;if(weight>load||n>used&&weight===load){used=n;available=cap;load=weight;}if(n>cap)overload=true;}
  out.push({id,kind:'crew',name:crew['班组名称']||id,taskIds:[...new Set(own.map(o=>o.taskId))],operations:[...new Set(routes.filter(o=>o['班组编号']===id).map(o=>o['工序名称']||o['路线工序编号']))],sources:[{table:'班组资源',object:id,row:crew._row??null}],wipCount:own.filter(o=>o.kind==='WIP物理保留').length,used:unknown?null:used,available,unit:'人（同时占用）',load:unknown||!Number.isFinite(load)?null:load,overload:!unknown&&overload,parameters:{每班可用人数:Number(crew['每班可用人数']),标准日班次数:Number(crew['标准日班次数']),周日班次数:Number(crew['周日班次数'])},explanation:unknown?'历史占用缺少实际人数，不能按0计算峰值。':'在任务、WIP及人数变更边界检查同时用人，按实际人员参与段计算；班次数不直接乘为人数。工厂和班组日历还共同限制设备投产能力。'});
 }
 return out.sort((a,b)=>Number(b.overload)-Number(a.overload)||(b.load??-1)-(a.load??-1));
}
export function scheduleCapacityAnalysis(v,body){
 const run=v.run;if(!run?.result)throw Error('请先选择有结果的冻结运行');
 if(run.result.timeUnit!=='day')throw Error('本版产能排产瓶颈分析支持按天运行，请选择按天排程结果');
 const from=run.selection.startDay,to=run.selection.endDay,selectedDay=body.day===undefined?from:Number(body.day);
 if(!Number.isSafeInteger(selectedDay)||selectedDay<from||selectedDay>=to)throw Error('查看日期须在本次排程窗口内');
 const actual=equipmentActual(v),days=[],resolvedDays=new Map();let resources;
 for(let n=from;n<to;n++){
  // Calendar rows resolve their own dates. Reuse the detached resolution only
  // while the full native effective parameter set stays identical.
  const stamp=hash(effectiveParameters(v.input,n,v.identity.scope));let d=resolvedDays.get(stamp);if(!d){d=capacityDayInput(v,n);resolvedDays.set(stamp,d);}
  const rs=resourceDay(v,actual,d,n),pressure=rs.filter(r=>r.overload||r.load!==null&&r.load>=.9),own=actual.tasks.filter(t=>n*1440<=t.start&&t.start<(n+1)*1440);
  days.push({day:n,date:date(v,n),taskCount:own.length,pressure:pressure.length,peakLoad:Math.max(0,...rs.map(r=>r.load??0)),top:pressure.slice(0,3).map(r=>r.name)});if(n===selectedDay)resources=rs;
 }
 const demands=run.result.demandResults.map(r=>{const source=rows(v.input,'每日需求').find(d=>d['需求编号']===r.id),due=Number(source?.['最晚到货日']),arrival=finite(r.arrivalDay)?r.arrivalDay:null,complete=r.status==='scheduled'&&(r.unplannedQuantity??0)<=1e-6;return {id:r.id,productId:r.productId,quantity:r.quantity,arrivalDay:arrival,dueDay:Number.isFinite(due)?due:null,status:!complete?'unplanned':arrival===null||!Number.isFinite(due)?'unknown':arrival<=due?'on_time':'late',reason:(run.result.findings||[]).filter(f=>f.need===r.id).map(f=>f.message).join('；')};});
 const options=scheduleCapacityOptions(v.input).filter(o=>o.table!=='工厂日历'||Number(o.object)>=from&&Number(o.object)<to),byId=new Map(options.map(o=>[o.id,o])),suggestions=[];
 for(const r of resources.filter(r=>r.overload||r.load!==null&&r.load>=.9).slice(0,6)){
  const key=r.kind==='crew'?'CP119|'+r.id+'|每班可用人数':'add|'+r.id,option=byId.get(key);if(option)suggestions.push({id:key,label:r.kind==='crew'?r.name+'增加2名同技能人员':r.name+'新增1'+(r.kind==='tools'?'套同型工装':'台兼容设备'),patch:{id:key,before:option.value,after:r.kind==='crew'?option.value+2:1},reason:r.kind==='crew'?'当日同时用人峰值 '+r.used+' / '+r.available+' 人；增加同技能人数后，仍须满足设备、工装和日历约束。':r.kind==='tools'?'当日实体并发峰值 '+r.used+' / '+r.available+' 套；增加独立工装后，通过重排验证交付改善。':'当日自然占用 '+r.used+' / '+r.available+' 分钟；增配同组设备后，仍须满足工装、班组和物料约束。'});
 }
 const productWeights=new Map();for(const r of demands)productWeights.set(r.productId,(productWeights.get(r.productId)||0)+r.quantity);
 let theoretical=null,theoreticalError=null;try{
  if(v.input.scenarioConditions?.personnel?.length||v.input.scenarioConditions?.overtime?.length)throw Error('本运行包含独立的分日增人或加班条件，理论模型未合并这些条件；请以实际占用和真实重排为准。');
  const products=[...productWeights].map(([id,share])=>({id,share}));if(products.length>40)throw Error('所选运行超过40种成品，联合理论分析暂不生成；实际负荷仍完整显示。');
  theoretical=analyzeCapacity(v,{identity:v.identity,products,mode:'fixed',scenario:{},fromDate:date(v,selectedDay),toDateInclusive:date(v,selectedDay),knownAsOfDate:date(v,run.selection.currentDay??from),detailDay:date(v,selectedDay),thresholdPct:20});
 }catch(e){theoreticalError=e.message;}
 for(const r of resources)r.navigableTaskIds=r.taskIds.filter(id=>actual.tasks.some(t=>t.id===id));
 return {identity:v.identity,day:selectedDay,date:date(v,selectedDay),days,resources,demands,options,suggestions,theoretical,theoreticalError,summary:{total:demands.length,onTime:demands.filter(r=>r.status==='on_time').length,late:demands.filter(r=>r.status==='late').length,unplanned:demands.filter(r=>r.status==='unplanned').length,unknown:demands.filter(r=>r.status==='unknown').length,tasks:actual.tasks.length,pressure:resources.filter(r=>r.overload||r.load!==null&&r.load>=.9).length},meaning:'基于当前冻结排程的真实任务、WIP、已知停机及有效配置。90%以上为优先核查的资源压力，不直接证明未排原因；改善效果须由同基线真实重排验证。理论上限不扣既有任务，不表示剩余可插入量。'};
}
