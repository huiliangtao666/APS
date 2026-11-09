import {rows} from './workbook-model.mjs';
import {parameterDayRatio} from './parameter-contract.mjs';
import {dayCrewCapacity,dayCrewPoints,dayResourceCapacity} from './scenario-compare-day.mjs';
const overlap=(a,b)=>a.start<b.end&&b.start<a.end;
export function scenarioDayMetrics(input,result,definition,demands,changes,tasks){
 const {startDay:start,endDay:end}=definition.selection,resources=[],overtime=[];
 for(const resource of rows(input,'设备与工装').filter(r=>r['资源类别']==='设备')){
  const id=resource['资源编号'],own=tasks.filter(t=>t.machine===id),crewIds=new Set([...rows(input,'工艺路线'),...(input.mapping?.sfRoutes||[])].filter(rt=>rt['设备组编号']===resource['资源组编号']).map(rt=>rt['班组编号'])),crews=rows(input,'班组资源').filter(c=>crewIds.has(c['班组编号'])),days=[];
  for(let day=start;day<end;day++){
   const calendar=rows(input,'工厂日历').find(c=>Number(c['日序'])===day),caps=crews.map(c=>dayResourceCapacity(input,resource,c,calendar,day)),regular=Math.max(0,...caps.map(c=>c.regular)),capacity=Math.max(0,...caps.map(c=>c.total)),occupied=own.filter(t=>Math.floor(t.start)===day).reduce((n,t)=>n+t.quantity,0),extraUsed=Math.max(0,occupied-regular);
   days.push({day,occupied,regular,available:capacity,extraUsed});
   if(extraUsed>1e-9)overtime.push({id:id+'|'+day,resource:id,day,quantity:extraUsed,unit:'千克',meaning:'超过常规日产能的计划投产量，不代表实际加班小时',taskIds:own.filter(t=>Math.floor(t.start)===day).map(t=>t.id)});
  }
  const occupied=days.reduce((n,d)=>n+d.occupied,0),available=days.reduce((n,d)=>n+d.available,0);
  resources.push({id,unit:'千克（开工日投产）',occupied,available,load:available?occupied/available:null,reason:'按开工日累计投产量 / 窗口内有效日产能；多班组共享设备取可用能力上限，不重复叠加。',tasks:own,days});
 }
 for(const crew of rows(input,'班组资源')){
  const id=crew['班组编号'],own=tasks.filter(t=>t.crew===id),points=[start,...own.flatMap(t=>[t.start,t.end]),...dayCrewPoints(input,crew,start,end)].filter(p=>start<=p&&p<end),usage=points.map(point=>({point,occupied:own.filter(t=>t.start<=point&&point<t.end).reduce((n,t)=>n+t.people,0),available:dayCrewCapacity(input,crew,point)}));
  resources.push({id,unit:'人（同时占用峰值）',occupied:Math.max(0,...usage.map(x=>x.occupied)),available:Math.max(0,...usage.map(x=>x.available)),load:Math.max(0,...usage.map(x=>x.available?x.occupied/x.available:0)),reason:'按任务起止及增人生效边界检查同时用人；增人只增加合格班组人数，不自动提高设备日产能。',tasks:own,capacityChanges:input.scenarioConditions?.personnel||[],points:usage});
 }
 for(const tool of rows(input,'设备与工装').filter(r=>r['资源类别']==='工装')){
  const id=tool['资源编号'],own=tasks.filter(t=>t.tools?.includes(id)),peak=Math.max(0,...own.map(t=>own.filter(o=>overlap(t,o)&&o.start<=t.start&&t.start<o.end).length));
  resources.push({id,unit:'套（实体工装峰值）',occupied:peak,available:Number(tool['可用数量']??1)>0?1:0,load:peak,reason:'每个编号表示一件实体工装，重叠占用由独立检查阻断。',tasks:own});
 }
 const known=demands.filter(r=>r.known),unknown=demands.filter(r=>r.status==='unknown').length,onTime=demands.filter(r=>r.status==='on_time').length;
 return {definition:definition.kpiDefinition,timeUnit:'day',scope:{demandIds:demands.map(r=>r.id),selection:definition.selection},summary:{N:demands.length,onTime,onTimeRate:demands.length?onTime/demands.length:null,unplanned:demands.filter(r=>r.status==='unplanned').length,late:demands.filter(r=>r.status==='late').length,unknown,coverage:demands.length?(demands.length-unknown)/demands.length:null,delayDays:known.reduce((n,r)=>n+r.lateDays,0),delayKnown:known.length,taskChangeRate:changes.rate,taskDenominator:changes.total,changedTasks:changes.changed,cleaningMinutes:null,overtimeMinutes:null,overtimeCapacityKg:overtime.reduce((n,r)=>n+r.quantity,0),cost:{status:'unknown',label:'按天模型不记录实际加班小时，小时费用不推算',totals:[],detail:[]}},demands,changes,resources,cleanings:[],overtime,shortages:(result.shortages||[]).filter(r=>demands.some(d=>d.id===r.need)),risks:(result.findings||[]).filter(r=>demands.some(d=>d.id===r.need)&&/效期|临期|质量|到期/.test(r.message||'')),conditions:input.scenarioConditions?.changes||[],causality:'各方案使用同一基线、执行事实与比较范围；列出日期条件、任务和供给变化，不将共同重排差异直接断言为单条件因果。按天模型不提供实际清洗/加班分钟。'};
}
