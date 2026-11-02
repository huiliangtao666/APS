import {table,ref,number,dayCalendar,minuteDay,minuteCalendar,publicValues,LIMITS,fail} from './context.mjs';

const row=(id,values,refs=[],extra={})=>({id,values,refs,...extra});
export function taskInterval(s,t){
  if(number(t.startMinute)!==null&&number(t.endMinute)!==null&&s.identity.minuteOrigin)return {start:minuteDay(s.identity,t.startMinute),end:minuteDay(s.identity,t.endMinute),
    startMinute:number(t.startMinute),endMinute:number(t.endMinute),startTime:minuteCalendar(s.identity.minuteOrigin,t.startMinute),endTime:minuteCalendar(s.identity.minuteOrigin,t.endMinute)};
  if(number(t.start)!==null&&number(t.end)!==null&&s.identity.timeUnit==='day')return {start:Number(t.start),end:Number(t.end),startMinute:null,endMinute:null,startTime:null,endTime:null};
  return {start:null,end:null,startMinute:null,endMinute:null,startTime:null,endTime:null};
}
const overlaps=(a,b)=>a.start!==null&&a.end!==null&&a.start<b.end&&b.start<a.end;
export function unionMinutes(intervals,start,end){
  const segments=intervals.map(x=>[Math.max(start,x.start),Math.min(end,x.end)]).filter(([a,b])=>a<b).sort((a,b)=>a[0]-b[0]);
  let total=0,left=null,right=null;for(const [a,b]of segments){if(left===null){left=a;right=b;}else if(a>right){total+=right-left;left=a;right=b;}else right=Math.max(right,b);}return (total+(left===null?0:right-left))*1440;
}
export function intervalPeak(intervals,start,end,value=x=>1){
  const points=[];for(const x of intervals){const n=number(value(x));if(n===null)return null;const a=Math.max(start,x.start),b=Math.min(end,x.end);if(a<b)points.push([a,n],[b,-n]);}
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let current=0,peak=0;for(const [,v]of points){current+=v;peak=Math.max(peak,current);}return peak;
}
export function frozenOccupations(s,d){
  if(!s.run)return [];
  const actual=(s.run.result.tasks||[]).map((t,index)=>({...t,...taskInterval(s,t),resource:t.resource||t.machine,runRef:{collection:'tasks',index,id:t.id},kind:'冻结任务'}));
  const reserved=(d.mapping?.wip_remaining||[]).filter(w=>Array.isArray(w.current_occupancy_day_interval)&&w.current_occupancy_day_interval.length===2).map(w=>{
    const tools=d.mapping?.tool_pools?.[w.remaining_tool_type],count=number(w.remaining_tool_count);
    return {id:w.id,resource:w.resource,start:number(w.current_occupancy_day_interval[0]),end:number(w.current_occupancy_day_interval[1]),
      crew:w.remaining_labor_pool,people:number(w.remaining_labor_count),tools:Array.isArray(tools)&&count!==null?tools.slice(0,count):null,quantity:null,
      kind:'已开工在制保留占用',mappingRef:{collection:'wip_remaining',id:w.id,version:d.mapping?.version}};
  });
  return [...actual,...reserved];
}
export function capacityRows(s,d,q,ctx){
  const {view,window:w}=q,resources=table(d,'设备与工装'),stops=table(d,'停机安排'),calendar=new Map(table(d,'工厂日历').map(r=>[number(r['日序']),r])),crew=new Map(table(d,'班组资源').map(r=>[r['班组编号'],r]));
  const routes=[...table(d,'工艺路线'),...(d.mapping?.sfRoutes||[]).map((r,i)=>({...r,_queryMappingIndex:i}))].filter(r=>ctx.scope.ids.has(r['成品编号']));
  const relevantGroups=new Set(routes.map(r=>r['设备组编号']));
  const materialRestricted=q.roots.length<ctx.graph.materials.size;
  const visible=resources.filter(r=>!materialRestricted||relevantGroups.has(r['资源组编号'])||routes.some(rt=>rt['所需工装类型']===r['资源组编号']));
  const visibleIds=new Set(visible.map(r=>r['资源编号']));
  if(view==='capacity.equipment')return visible.map(r=>row('resource:'+r['资源编号'],publicValues(r),[ref('设备与工装',r)]));
  if(view==='capacity.routes')return routes.map((r,i)=>{const c=crew.get(r['班组编号']);return row('route:'+(r['路线工序编号']||i),{
    ...publicValues(r),crewAvailable:c?.['每班可用人数']??null,crewStandardShifts:c?.['标准日班次数']??null,crewSundayShifts:c?.['周日班次数']??null},
    [...(r._queryMappingIndex===undefined?[ref('工艺路线',r)]:[]),...(c?[ref('班组资源',c)]:[])],{materialIds:[r['成品编号']],mappingRefs:r._queryMappingIndex===undefined?[]:[{collection:'sfRoutes',index:r._queryMappingIndex}]});});
  const interval=r=>number(r.startMinute)!==null&&number(r.endMinute)!==null?taskInterval(s,r):{start:number(r['开始日']),end:number(r['结束日'])};
  if(view==='capacity.stops')return stops.filter(r=>visibleIds.has(r['资源编号'])&&overlaps(interval(r),w)).map(r=>row('stop:'+r['停机编号'],{
    ...publicValues(r),...interval(r),startDate:dayCalendar(s.identity.dayZero,interval(r).start),endDate:dayCalendar(s.identity.dayZero,interval(r).end),
    knownAsOf:number(r['可知日'])===null?null:Number(r['可知日'])<=q.knownAt,knownDate:dayCalendar(s.identity.dayZero,number(r['可知日']))},[ref('停机安排',r)]));
  const occupations=frozenOccupations(s,d),rows=[];
  if(visible.length*(w.end-w.start)>LIMITS.records)fail('PROJECTION_TOO_LARGE',413);
  for(const r of visible)for(let day=w.start;day<w.end;day++){
    const id=r['资源编号'],slot={start:day,end:day+1},c=calendar.get(day),numerator=number(c?.['日产能分子']),denominator=number(c?.['日产能分母']),standard=number(r['标准日产能千克']);
    const ratio=numerator===null||denominator===null||denominator<=0?null:numerator/denominator,base=standard===null||ratio===null?null:standard*ratio;
    const known=stops.filter(x=>x['资源编号']===id&&number(x['可知日'])!==null&&Number(x['可知日'])<=q.knownAt&&overlaps(interval(x),slot));
    const downtime=unionMinutes(known.map(interval),day,day+1),actual=occupations.filter(t=>(t.resource===id||t.tools?.includes(id))&&overlaps(t,slot));
    const unknownIntervals=occupations.some(t=>(t.resource===id||t.tools?.includes(id))&&(t.start===null||t.end===null||t.end<t.start));
    const crewPeaks=Object.fromEntries([...new Set(actual.map(x=>x.crew).filter(Boolean))].map(id=>[id,intervalPeak(actual.filter(x=>x.crew===id),day,day+1,x=>x.people)]));
    const starts=occupations.filter(t=>t.kind==='冻结任务'&&t.resource===id&&t.start>=day&&t.start<day+1);
    rows.push(row('resource-day:'+JSON.stringify([id,day]),{...publicValues(r),day,date:dayCalendar(s.identity.dayZero,day),standardDailyKg:standard,
      calendarNumerator:numerator,calendarDenominator:denominator,calendarRatio:ratio,calendarCapacityKg:base,
      referenceAvailableKg:downtime===0?base:downtime>=1440?0:null,knownStopMinutes:downtime,
      occupiedNaturalMinutes:s.run&&!unknownIntervals?unionMinutes(actual,day,day+1):null,occupationPeak:s.run&&!unknownIntervals?intervalPeak(actual,day,day+1):null,
      startedBatchKg:s.run&&!unknownIntervals?starts.some(t=>number(t.quantity)===null)?null:starts.reduce((n,t)=>n+Number(t.quantity),0):null,
      crewPeaks:s.run&&!unknownIntervals?crewPeaks:null,utilization:null,waitingLoss:null,dailyOutputAllocation:null,
      capacityMeaning:'单资源参考日历能力；自然日相交分钟不是工时利用率，投产量只记任务开始日'},
      [ref('设备与工装',r),...(c?[ref('工厂日历',c)]:[]),...known.map(x=>ref('停机安排',x))],
      {runRefs:actual.filter(x=>x.runRef).map(x=>x.runRef),mappingRefs:actual.filter(x=>x.mappingRef).map(x=>x.mappingRef),
        notProvided:[...(!s.run?['冻结排程占用']:[]),...(unknownIntervals?['冻结任务区间缺失或无效']:[]),...(base===null?['明确资源/日历能力']:[]),...(downtime>0&&downtime<1440?['日内可用区间与停机扣减依据']:[]),'可用工时分母','实测待料损失','跨日数量分配依据']}));
  }
  return rows;
}
