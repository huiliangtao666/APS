import {savedInterval} from './verification-endpoints.mjs';
import {timetable,validInterval} from './timetable.mjs';
// A read-only explanation of frozen evidence; never a solver or a live-capacity check.
export function problemInterval(plan,finding){
 if(!finding)return null;
 const ids=finding.taskIds;
 if(!Array.isArray(ids)||ids.length!==2||new Set(ids).size!==2)return null;
 const tasks=(plan?.tasks||[]).filter(t=>ids.includes(t.id));
 if(tasks.length!==2)return null;
 const [a,b]=tasks,ai=savedInterval(a),bi=savedInterval(b);
 // Raw saved tasks are authoritative, even when a persisted finding claims numeric geometry.
 if(!ai||!bi)return null;
 let derived=null;
 if(/MACHINE_OVERLAP/.test(finding.code)&&a.machine&&a.machine===b.machine){
  const start=Math.max(ai.start,bi.start),end=Math.min(ai.end,bi.end);
  if(validInterval(start,end))derived={kind:'machine-overlap',machine:a.machine,start,end};
 }
 if(/PRECEDENCE/.test(finding.code)){
  const next=a.predecessor===b.id?a:b.predecessor===a.id?b:null;
  const ni=next===a?ai:bi,pi=next===a?bi:ai;
  if(next&&validInterval(ni.start,pi.end))derived={kind:'precedence',start:ni.start,end:pi.end,priorEnd:pi.end,nextStart:ni.start,violationDuration:pi.end-ni.start};
 }
 if(!derived)return null;
 if(finding.interval){
  // Reject stale, unsupported or contradictory structured evidence instead of drawing it.
  for(const [key,value] of Object.entries(derived))if(finding.interval[key]!==value)return null;
 }
 return derived;
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
