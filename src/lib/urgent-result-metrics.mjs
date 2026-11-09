const EPS=1e-6;
const unique=(rows,key)=>[...new Map(rows.map(r=>[r[key],r])).values()];
const lineage=t=>[t.orderId,t.productId,t.routeStepId].join('|');
const statuses={not_started:'未开工',started:'已开工',locked:'已锁定',completed:'已完成'};
export function demandPlanCheck(row){
 const q=[row.quantity,row.completedQuantity??0,row.scheduledQuantity,row.unplannedQuantity];
 if(!q.every(n=>Number.isFinite(n)&&n>=0)||Math.abs(q[1]+q[2]+q[3]-q[0])>EPS)return {planned:false,reason:'数量字段不完整或数量不守恒'};
 if(q[3]>EPS)return {planned:false,reason:q[1]+q[2]>EPS?'仅部分数量排入':'全部数量未排入'};
 if(!Number.isFinite(row.lateDays))return {planned:false,reason:'缺少可核验的交付日期'};
 if(row.lateDays>0)return {planned:false,reason:`数量已完整安排，预计迟交 ${row.lateDays} 天`};
 if(row.afterArrival&&row.latestArrival&&row.afterArrival>row.latestArrival)return {planned:false,reason:'预计到货晚于最晚允许到货日'};
 return {planned:true,reason:q[1]>=q[0]-EPS?'已全部实际交付，冻结结果中的交付时间满足要求':'数量完整且交付时间满足要求'};
}

// One original task is counted once. Split/merged replacements are assessed
// cumulatively at each original deadline; a fragment cannot be credited twice.
export function originalTaskChecks(baselineTasks,facts,result){
 const byFact=new Map((facts?.tasks||[]).map(f=>[f.id,f])),daily=result?.timeUnit!=='minute';
 const before=unique(baselineTasks||[],'id').map(t=>{
  const f=byFact.get(t.id),start=(daily?f?.startDay:f?.startMinute)??t.start,end=(daily?f?.endDay:f?.endMinute)??t.end;
  return {...t,start,end,quantity:f?.quantity??t.quantity,status:f?.status||t.executionStatus||null};
 });
 const groups=new Map();for(const t of before){const key=lineage(t);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
 return before.map(t=>{
  const group=groups.get(lineage(t)),after=(result?.tasks||[]).filter(x=>lineage(x)===lineage(t));
  const deadline=daily?Math.ceil(t.end-EPS):t.end;
  const required=group.filter(x=>(daily?Math.ceil(x.end-EPS):x.end)<=deadline).reduce((n,x)=>n+x.quantity,0);
  const valid=after.filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>=x.start&&Number.isFinite(x.quantity)&&x.quantity>=0);
  const eligible=valid.filter(x=>x.end<=deadline+EPS),onTime=eligible.reduce((n,x)=>n+x.quantity,0),total=valid.reduce((n,x)=>n+x.quantity,0);
  const validTarget=Number.isFinite(deadline)&&Number.isFinite(t.quantity)&&t.quantity>=0&&group.every(x=>Number.isFinite(x.end)&&Number.isFinite(x.quantity)&&x.quantity>=0);
  const planned=!!result&&validTarget&&onTime+EPS>=required;
  const reason=!result?'缺少冻结排程结果':!validTarget?'原任务数量或截止时间不完整':planned?'同需求、产品、工序在本截止时间内的累计数量已满足':!after.length?'本次没有对应工序安排':total+EPS<required?'对应工序数量不足':'对应工序未能在原截止时间内完成';
  return {taskId:t.id,demandId:t.orderId,productId:t.productId,routeStepId:t.routeStepId,status:t.status,statusLabel:statuses[t.status]||'-',quantity:t.quantity,unit:t.unit||'千克',deadline,requiredQuantity:required,onTimeQuantity:onTime,scheduledQuantity:total,planned,reason,before:t,after};
 });
}

export function buildUrgentMetrics(impact,{facts,baselineTasks,result}={}){
 const urgent=unique(impact.tabs?.urgent||[],'demandId').map(r=>({...r,...demandPlanCheck(r),kind:'插单'}));
 const original=unique(impact.tabs?.orders||[],'demandId').map(r=>({...r,...demandPlanCheck(r),kind:'原需求'}));
 const base=baselineTasks||unique((impact.tabs?.changes||[]).flatMap(c=>c.beforeTasks||[]),'id');
 const tasks=originalTaskChecks(base,facts,result);
 const originals=new Map(tasks.map(t=>[t.taskId,t]));
 const adjustment=(records,status)=>unique(records||[],'taskId').map(r=>({...r,status,statusLabel:statuses[status],reason:r.after?.length?'开始、结束、数量、设备、班组或工装安排发生变化':'原任务对应剩余工作本次未排入'}));
 const started=adjustment(impact.adjustments?.warnings?.records,'started'),unstarted=adjustment(impact.adjustments?.reminders?.records,'not_started');
 // Locked tasks must remain unchanged. Only actual differences in the selected
 // result count here; verified unlock trials belong to separate advice below.
 const locked=tasks.filter(t=>t.status==='locked').filter(t=>{
  const actual=(result?.tasks||[]).find(x=>x.id===t.taskId),a=t.before;
  return !actual||['start','end','quantity','machine','crew','people','tools'].some(k=>JSON.stringify(a[k])!==JSON.stringify(actual[k]));
 }).map(t=>({...t,reason:'已锁定原任务在当前结果中缺失或安排发生变化，请核对保护检查'}));
 const enrich=rows=>rows.map(r=>({...r,...(originals.has(r.taskId)?{productId:originals.get(r.taskId).productId,routeStepId:originals.get(r.taskId).routeStepId}:{} )}));
 return {contract:'urgent-result-metrics-v2',urgent,demands:unique([...urgent,...original],'demandId'),originalTasks:tasks,adjustments:{started:enrich(started),locked,unstarted:enrich(unstarted)},suggestions:(impact.adjustments?.lockSuggestions||[]).filter(s=>s.verification==='pass'),adviceStatus:impact.adjustments?.adviceStatus||null};
}
