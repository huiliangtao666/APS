// Follow the frozen result's axis; legacy CSV minute fields do not change it.
export function urgentRunEligibility(run){
 const result=run?.result;
 if(!result)return {eligible:false,code:'URGENT_BASE_NOT_READY',message:'请先在排程流程选定已有结果的生产计划。'};
 if(!['completed','partial'].includes(run.status)||result.verification?.status!=='pass')return {eligible:false,code:'URGENT_BASE_NOT_READY',message:'插单基准须为独立检查通过的完整或部分未排生产计划。'};
 const daily=result.timeUnit==='day';
 if(!['day','minute'].includes(result.timeUnit))return {eligible:false,code:'URGENT_PROFILE_UNSUPPORTED',message:'请选择按天或分钟排程结果。'};
 if(!Array.isArray(result.tasks)||result.tasks.some(t=>!Number.isFinite(t.start)||!Number.isFinite(t.end)||t.end<=t.start)||daily&&(!/^\d{4}-\d{2}-\d{2}$/.test(result.dayZero||'')||!Number.isFinite(Date.parse(result.dayZero+'T00:00:00Z')))||!daily&&(result.engineIdentity!=='workbook-minute-v2'||!Number.isFinite(Date.parse(result.minuteOrigin))||result.tasks.some(t=>!Number.isSafeInteger(t.start)||!Number.isSafeInteger(t.end))))return {eligible:false,code:daily?'URGENT_DAY_RESULT_INVALID':'URGENT_MINUTE_RESULT_INVALID',message:'所选结果缺少有效的时间原点或任务区间，请重新排程并检查。'};
 return {eligible:true,code:'READY',message:(daily?'按天计划':'分钟计划')+'可建立插单上下文；执行事实仍需逐项明确。'};
}
export function urgentFactTime(value,run){
 const result=run?.result;
 if(!Number.isFinite(value))return '';
 if(result?.timeUnit==='day'){
  const at=Date.parse(result.dayZero+'T00:00:00Z')+Math.floor(value)*86400000;
  return Number.isFinite(at)?new Date(at).toISOString().slice(0,10):'';
 }
 if(result?.timeUnit!=='minute'||!Number.isSafeInteger(value)||typeof result.minuteOrigin!=='string')return '';
 const at=Date.parse(result.minuteOrigin)+(value+480)*60000;
 return Number.isFinite(at)?new Date(at).toISOString().slice(0,16):'';
}
// Returns a point on the selected axis (days for a day result).
export function urgentFactMinute(value,run){
 if(!value)return NaN;
 if(run?.result?.timeUnit==='day'){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;
  const at=(Date.parse(value+'T00:00:00Z')-Date.parse(run.result.dayZero+'T00:00:00Z'))/86400000;
  return Number.isSafeInteger(at)&&urgentFactTime(at,run)===value?at:NaN;
 }
 if(run?.result?.timeUnit!=='minute')return NaN;
 const at=(Date.parse(value+':00+08:00')-Date.parse(run.result.minuteOrigin))/60000;
 return Number.isSafeInteger(at)?at:NaN;
}
