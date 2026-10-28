import {timetable,validInterval} from './timetable.mjs';
// A read-only explanation of frozen evidence; never a solver or a live-capacity check.
export function problemInterval(plan,finding){
 if(!finding)return null;
 const tasks=(plan?.tasks||[]).filter(t=>finding.taskIds?.includes(t.id));
 if(finding.interval&&validInterval(finding.interval.start,finding.interval.end))return {...finding.interval};
 // Legacy saved findings can be explained only when exactly two real endpoints exist.
 if(tasks.length!==2)return null;
 const [a,b]=tasks;
 if(/MACHINE_OVERLAP/.test(finding.code)&&a.machine===b.machine){
  const start=Math.max(a.start,b.start),end=Math.min(a.end,b.end);
  if(validInterval(start,end))return {kind:'machine-overlap',machine:a.machine,start,end};
 }
 if(/PRECEDENCE/.test(finding.code)){
  const next=a.predecessor===b.id?a:b.predecessor===a.id?b:null;
  const prior=next===a?b:a;
  if(next&&validInterval(next.start,prior.end))return {kind:'precedence',start:next.start,end:prior.end,priorEnd:prior.end,nextStart:next.start,violationDuration:prior.end-next.start};
 }
 return null;
}
export function taskEvidence(plan,id){
 const model=timetable(plan),task=model.tasks.find(t=>t.id===id);
 if(!task)return null;
 const input=model.input,match=r=>r['订单编号']===task.orderId&&r['工序编号']===task.operation;
 const demands=(input?.dependencies||[]).filter(match);
 const claims=(input?.resourceClaims||[]).filter(match);
 const resources=[...demands,...claims].map(row=>{
  const type=row['资源类型'],resourceId=row['资源编号'];
  const config=type==='设备'?input?.machines?.find(r=>r['设备编号']===resourceId):type==='人员技能'?input?.personnelGroups?.find(r=>r['人员组编号']===resourceId):type==='工装'?input?.tools?.find(r=>r['工装编码']===resourceId):input?.batchResources?.find(r=>r['资源编号']===resourceId);
  const reservations=model.reservations.filter(r=>r.resourceId===resourceId&&r.taskIds?.includes(id));
  return {type,resourceId,demand:row['需求数量']??row['数量']??null,unit:row['单位']|| (type==='人员技能'?'人':null),available:config?.['人员数量']??config?.['可用数量']??config?.['容量']??null,config:config||null,declaration:row,reservations,decision:reservations.length?'保存的计划占用已提交；容量是配置总量，非此刻剩余可用量':'无保存的占用决策；是否满足未知'};
 });
 return {task,resources,materials:(plan.materialDemands||[]).filter(r=>r.taskId===id).map(r=>({...r,allocated:r.allocations?.reduce((n,a)=>n+Number(a.quantity),0)??null})),predecessor:model.tasks.find(t=>t.id===task.predecessor)||null,successors:model.tasks.filter(t=>t.predecessor===id),inputRefs:task.assessment?.inputRefs||[],hasInput:!!input};
}
