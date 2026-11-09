import {hash} from './workbook-model.mjs';
import {capacityDefaults,capacityOptions,capacityRequest,capacityDayInput,buildCapacityConstraints,solveCapacityModel} from './capacity-analysis-model.mjs';
import {evaluateCapacity} from './capacity-lp.mjs';
import {capacityExplanation} from './capacity-explanation.mjs';
export {capacityOptions};
const round=n=>Math.floor((n+1e-9)*1000)/1000;
const finite=n=>Number.isFinite(n)?n:null;
const limits='连续稳态产能上限；包括所选制造物料及其制造子件。假设物料充足、无既有任务占用；未验证逐批时序、换型清洗、交付、期初在制或取整，须通过排程确认可执行量。';
const summary=r=>{const {terms,cost,...rest}=r;return {...rest,termCount:terms.length};};
function suggestions(d,v,req,current){
 const candidates=[],s=req.scenario,seen=new Set();
 const add=(id,label,patch)=>{if(seen.has(id))return;seen.add(id);candidates.push({id,label,patch});};
 for(const row of current.bottlenecks){const key=row.source.key;
  if(row.kind==='crew'){const available=current.constraints.find(r=>r.id==='crew:'+key)?.budget??0,required=Math.max(...row.terms.map(t=>t.requirePeople||0)),extra=Math.max(2,Math.ceil((required-available)/Math.max(s.crewPct/100,.01)));add('crew:'+key,'班组 '+key+' 增加'+extra+'名同技能人员',{crewAdds:{...s.crewAdds,[key]:(s.crewAdds[key]||0)+extra}});}
  if(row.kind==='tools'){const available=current.constraints.find(r=>r.id==='tools:'+key)?.budget??0,required=Math.max(...row.terms.map(t=>t.requireTools||0)),extra=Math.max(2,Math.ceil((required-available)/Math.max(s.toolPct/100,.01)));add('tools:'+key,'工装池 '+key+' 增加'+extra+'套兼容工装',{toolAdds:{...s.toolAdds,[key]:(s.toolAdds[key]||0)+extra}});}
  if(row.kind==='equipment')add('equipment:'+key,'设备组 '+key+' 增加1个兼容机位',{equipmentAdds:{...s.equipmentAdds,[key]:(s.equipmentAdds[key]||0)+1}});
 }
 if(s.timePct<200)add('time','有效工作时间增加20个百分点',{timePct:Math.min(200,s.timePct+20)});
 if(s.speedPct<200)add('speed','可变加工速度提高20个百分点',{speedPct:Math.min(200,s.speedPct+20)});
 if(s.recoveryPct<100)add('stops','恢复已知停机时段（需先确认可调整）',{recoveryPct:100});
 if(s.crewPct<100)add('attendance','恢复班组满员出勤',{crewPct:100});
 if(s.toolPct<100)add('toolAvailability','恢复工装100%可用',{toolPct:100});
 const calendar=d.tables['工厂日历'].find(c=>Number(c['日序'])===req.day);
 if(Number(calendar?.[d.parameterContract?'生产班次数':'日产能分子'])===0)add('calendar','恢复标准生产班次',{shifts:Number(calendar['日产能分母'])});
 const batch=Math.max(...current.constraints.flatMap(r=>r.terms.map(t=>t.batchKg)));if(Number.isFinite(batch)&&batch>0&&batch<80000)add('batch','标准批量提高25%（仍受设备和工装上限约束）',{batchKg:Math.ceil(batch*1.25)});
 const single=candidates.slice(0,12),out=[];
 const test=c=>{try{const scenario={...s,...c.patch};if(Object.values(scenario.crewAdds).some(v=>v>100)||Object.values(scenario.toolAdds).some(v=>v>100)||Object.values(scenario.equipmentAdds).some(v=>v>100))return;
  const model=buildCapacityConstraints(d,v,req,req.day,scenario),result=solveCapacityModel(model,req),gain=Math.max(0,result.total-current.total);
  out.push({...c,before:round(current.total),after:round(result.total),gain:Math.max(0,Math.round((round(result.total)-round(current.total))*1000)/1000),gainPct:current.total>0?gain/current.total*100:null,bottlenecks:[...new Set(result.bottlenecks.map(r=>r.name))].slice(0,3),meaning:gain>1e-6?'已用同一分析模型重算，预计可提升上限；实施前仍须排程验证。':'单独调整暂无提升，仍受其他共享资源或固定自然历时约束。'});
 }catch{/* A suggestion must be demonstrably calculable before presenting it. */}};
 single.forEach(test);
 const resource=single.filter(c=>/^(crew|tools|equipment):/.test(c.id));
 if(resource.length>=2){const patch={};for(const c of resource)for(const [key,value]of Object.entries(c.patch))patch[key]={...(patch[key]||s[key]),...value};test({id:'combined',label:'联合改善：'+resource.map(c=>c.label).join('；'),patch});}
 return out.sort((a,b)=>b.gain-a.gain);
}
export function analyzeCapacity(v,body,{detail=false}={}){
 const req=capacityRequest(v,body),cache=new Map();
 function calculate(day,scenario=req.scenario){let d=cache.get(day);if(!d){d=capacityDayInput(v,day);if(day===req.day)cache.set(day,d);}const model=buildCapacityConstraints(d,v,req,day,scenario);return {d,model,result:solveCapacityModel(model,req)};}
 if(detail){
  const {result}=calculate(req.day),row=result.constraints.find(r=>r.id===body.constraintId);if(!row)throw Object.assign(Error('资源约束已变化，请重新查询'),{status:409});
  const offset=body.offset??0;if(!Number.isInteger(offset)||offset<0)throw Object.assign(Error('明细分页无效'),{status:422});
  return {identity:v.identity,analysisFingerprint:req.fingerprint,date:req.detailDay,constraint:summary(row),terms:row.terms.slice(offset,offset+50),total:row.terms.length,offset,nextOffset:offset+50<row.terms.length?offset+50:null,formula:'所选物料每千克资源占用 × 各物料产量，合计不得超过同一共享资源预算；制造BOM子件用量逐层合并。'};
 }
 const days=[];let selected;
 for(let day=req.from;day<=req.to;day++){
  try{const value=calculate(day);if(day===req.day)selected=value;const {model,result}=value;
   days.push({day,date:model.calendar.date,total:round(result.total),calendar:model.calendar,events:model.events,bottlenecks:result.bottlenecks.slice(0,4).map(summary),comparison:Object.fromEntries(result.constraints.map(c=>[c.id,{budget:c.budget,cost:c.cost}]))});
  }catch(e){days.push({day,date:new Date(Date.parse(v.identity.dayZero+'T00:00:00Z')+day*86400000).toISOString().slice(0,10),total:null,error:e.message,bottlenecks:[],events:[]});}
 }
 // Release other per-day source clones before counterfactual calculations.
 const selectedD=cache.get(req.day);cache.clear();if(selectedD)cache.set(req.day,selectedD);
 const valid=days.filter(d=>d.total!==null),average=valid.length?valid.reduce((s,d)=>s+d.total,0)/valid.length:null;
 const reference=[...valid].sort((a,b)=>Math.abs(a.total-average)-Math.abs(b.total-average)||a.day-b.day)[0];
 const referenceComparison=reference?.comparison;
 for(const day of days){
  day.deviationPct=average>0&&day.total!==null?(day.total-average)/average*100:null;
  day.anomaly=day.total===null?'missing':day.deviationPct<=-req.thresholdPct?'low':day.deviationPct>=req.thresholdPct?'high':'normal';
  const causes=[];
  if(day.total===null)causes.push(day.error);
  else{
   causes.push('主要约束：'+(day.bottlenecks.map(r=>r.name).join('、')||'未发现有限约束'));
   causes.push('工厂生产 '+day.calendar.actualShifts+' 班 / 标准 '+day.calendar.standardShifts+' 班'+(day.calendar.sunday?'；按各班组周日班次取交集':''));
   for(const crew of day.calendar.crews.filter(c=>day.bottlenecks.some(r=>r.kind==='crew'&&r.source.key===c.id)))causes.push('瓶颈班组 '+crew.name+'：当日 '+crew.actualShifts+' 班 / 标准 '+crew.standardShifts+' 班；不把班次数重复乘为人数');
   if(reference&&day.day!==reference.day)for(const row of day.bottlenecks){const prev=referenceComparison[row.id],now=day.comparison[row.id];if(!prev)continue;
    if(Math.abs(prev.budget-now.budget)>1e-8)causes.push(row.name+'预算 '+Number(now.budget.toFixed(4))+'，对比日 '+reference.date+' 为 '+Number(prev.budget.toFixed(4))+' '+row.unit);
    if(hash(prev.cost)!==hash(now.cost)){const changes=now.cost.map((cost,i)=>Math.abs(cost-prev.cost[i])>1e-10?req.products[i].id+'：'+Number(prev.cost[i].toPrecision(6))+' → '+Number(cost.toPrecision(6)):null).filter(Boolean).slice(0,3);causes.push(row.name+'每千克资源占用变化（对比日 '+reference.date+' → 本日，'+row.unit+'/千克）：'+changes.join('；')+'。按当日有效参数、日历交集与批量折算，具体路线见资源明细');}
   }
   if(day.events.length)causes.push('相关已知停机：'+day.events.map(e=>e.resource+' / '+e.id+(e.recoveredPct?'（已模拟恢复'+e.recoveredPct+'%）':'')).join('、')+'；是否压低上限以瓶颈约束为准');
   if(day.anomaly==='high')causes.push('高于区间均值不代表超负荷；本日限制较少或其他日期低产能拉低均值，可优先安排生产，但须检查物料与交付时序');
   if(day.anomaly==='low')causes.push('优先改善上述瓶颈；点击本日查看各项措施重算后的增量，避免增加非瓶颈资源');
  }
  day.causes=causes;delete day.comparison;
 }
 const total=valid.length===days.length?valid.reduce((s,d)=>s+d.total,0):null;
 const response={identity:v.identity,analysisFingerprint:req.fingerprint,contract:'capacity-day-upper-bound-v1',request:req,meaning:limits,days,average:finite(average),periodTotal:total,completeDays:valid.length,selected:null};
 if(selected){
  const {d,model,result}=selected;let baseline;try{baseline=calculate(req.day,capacityDefaults).result;}catch{/* The current scenario may repair an unavailable baseline. */}
  const materialMap=new Map(d.tables['物料主数据'].map(m=>[m['物料编号'],m]));
  const products=req.products.map((p,i)=>{const weights=req.products.map((_,j)=>i===j?1:0),solo=evaluateCapacity(model.constraints,weights,'fixed').total,m=materialMap.get(p.id),q=result.quantities[i],box=Number(m['每箱净重千克']),piece=Number(m['每件净重千克']);
   return {id:p.id,name:m['物料名称'],share:result.total>0?q/result.total*100:0,quantityKg:round(q),boxes:box>0?round(q/box):null,pieces:piece>0?round(q/piece):null,soloKg:round(solo)};
  });
  const frontier=req.products.length===2?Array.from({length:21},(_,i)=>{const x=evaluateCapacity(model.constraints,[i,20-i],'fixed');return {aPct:i*5,aKg:round(x.quantities[0]),bKg:round(x.quantities[1]),totalKg:round(x.total)};}):[];
  const weights=req.mode==='max'&&result.total>0?result.quantities:req.products.map(p=>p.share),weightSum=weights.reduce((a,b)=>a+b,0)||1;
  const byKind=Object.fromEntries(['equipment','tools','crew'].map(kind=>{let bound=Infinity;for(const row of model.constraints.filter(r=>r.kind===kind)){const cost=row.cost.reduce((s,c,i)=>s+c*weights[i]/weightSum,0);if(cost>0)bound=Math.min(bound,row.budget/cost);}return [kind,Number.isFinite(bound)?round(bound):null];}));
  response.selected={date:req.detailDay,total:round(result.total),baseline:baseline?round(baseline.total):null,gain:baseline?Math.round((round(result.total)-round(baseline.total))*1000)/1000:null,bottlenecks:result.bottlenecks.map(summary),constraints:result.constraints.map(summary),products,frontier,byKind,suggestions:suggestions(d,v,req,result),calendar:model.calendar,stageCount:model.stages.length,includesManufacturedChildren:true,calculation:capacityExplanation(model,result,req)};
 }
 // The normalized internal numeric window is not part of the public request.
 response.request={products:req.products,mode:req.mode,scenario:req.scenario,fromDate:req.fromDate,toDateInclusive:req.toDateInclusive,knownAsOfDate:req.knownAsOfDate,detailDay:req.detailDay,thresholdPct:req.thresholdPct};
 return response;
}
