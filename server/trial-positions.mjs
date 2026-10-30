import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';
import {executionState} from '../src/lib/execution-facts.mjs';
import {eventSummary} from '../src/lib/simulation-events.mjs';
import {activeBatchRule} from '../src/lib/batch-policy.mjs';
import {quantityMath as Q} from '../src/lib/material-allocation.mjs';
import {freezeRunInput,inputHash} from './run-input.mjs';
import {calculate} from './planner.ts';

export const taskPosition=t=>({orderId:t.orderId,operation:t.operation,machine:t.machine,start:t.start,end:t.end,duration:t.duration});
export function movableTask(task,...datasets){
 return !!task&&!task.productionBatchId&&!task.resourceBatchId&&datasets.every(d=>
  !(d.executionFacts||[]).some(f=>f['订单编号']===task.orderId&&f['工序编号']===task.operation)&&
  !(d.executionSources||[]).some(f=>f['原始任务编号']===task.id)&&
  !(d.orders||[]).some(o=>o['订单编号']===task.orderId&&Number(o['已完成合格数量']||0)>0));
}
export function positionGuard(s,trial,plan){
 if(!trial||trial.status!=='active')return 'trial_inactive';
 if(!plan||plan.trialId!==trial.id||plan.id!==trial.latestPlanId||plan.revision!==trial.revision)return 'current_trial_plan_required';
 if(plan.status!=='draft')return 'immutable_plan';
 const input=s.inputVersions?.[plan.inputVersionId],run=s.runs?.find(r=>r.id===plan.runId);
 if(!input||inputHash(input.data)!==plan.inputVersionId||plan.inputVersionId!==inputHash(trial.data)||!run||run.snapshotHash!==plan.snapshotHash||inputHash({conditions:run.conditions,executionData:run.executionData})!==run.snapshotHash)return 'historical_inputs_unavailable';
 if(inputHash(executionState(s.data))!==inputHash(executionState(trial.data))||run.conditions.executionFactsVersion!==inputHash(executionState(s.data)))return 'current_execution_changed';
 return null;
}
export const positionToken=(s,t,p)=>inputHash({revision:t.revision,latest:t.latestPlanId,plan:p,data:t.data,currentFacts:executionState(s.data),locks:t.locks||{}});
const selection=c=>Object.fromEntries(['mode','orderIds','startMinute','endMinute','priority','enabledRuleIds'].map(k=>[k,c[k]]));
export function freezePositions(data,conditions,positions,at){
 const f=freezeRunInput(data,selection(conditions),at);
 if(Object.keys(positions).length)f.conditions.taskPositions=structuredClone(positions);
 f.snapshotHash=inputHash({conditions:f.conditions,executionData:f.executionData});return f;
}
// A separate fixed-output checker. It never asks the engine to find a better slot.
// Calendar and capacity sweeps inspect saved output at its exact proposed position.
export function checkPositions(plan,base,data,conditions,positions,locks){
 const report=independentlyVerifyPlan(plan,data.orders,data.routes,plan.rules,new Date().toISOString(),data,conditions),issues=[];
 const add=(code,message,taskIds=[])=>issues.push({code:'POSITION / '+code,message,taskIds});
 for(const [name,c] of Object.entries(report.checks))if(c.status==='problem')add('INDEPENDENT_'+name,c.details.join('；'),plan.tasks.map(t=>t.id));
 if(conditions.mode!=='supported'||activeBatchRule(data,conditions.ruleEvaluationAt))add('UNSUPPORTED','最小模式及生产批/合批移动尚未检查');
 if(plan.tasks.length!==base.tasks.length||base.tasks.some(t=>!plan.tasks.some(n=>n.id===t.id&&n.orderId===t.orderId&&n.productId===t.productId&&n.operation===t.operation&&n.predecessor===t.predecessor&&n.duration===t.duration)))add('IDENTITY_DURATION','任务身份、数量范围或工时不一致；不接纳部分移动结果',base.tasks.map(t=>t.id));
 if(data.routes.some(r=>r['最大等待分钟']?.trim()))add('UNSUPPORTED','路线最大等待未支持，不能证明移动可行');
 for(const type of ['工装','空间'])if(!plan.jointResourceChecks?.[type==='工装'?'MOLD':'STORAGE']&&[...(data.dependencies||[]),...(data.resourceClaims||[])].some(r=>r['资源类型']===type))add('RESOURCE_UNCHECKED',`${type} 条件尚未检查，不能证明可行`);
 const event=eventSummary(data),observed=Math.max(event.eventMinute,...(data.executionFacts||[]).map(f=>Number(f['观测分钟'])));
 for(const task of plan.tasks){
  const ids=[task.id],p=positions[task.id],dep=data.dependencies.find(d=>d['订单编号']===task.orderId&&d['工序编号']===task.operation&&d['资源类型']==='设备');
  if(p&&inputHash(taskPosition(task))!==inputHash(p))add('FIXED_POSITION','指定位置未被原样保留',ids);
  const machine=data.machines.find(m=>m['设备编号']===task.machine),order=data.orders.find(o=>o['订单编号']===task.orderId);
  if(!machine||dep?.['资源编号']!==task.machine||machine['工序编号']!==task.operation||machine['产线编号']!==order?.['产线编号'])add('MACHINE_FORBIDDEN',`任务 ${task.id} 的机器 ${task.machine} 不匹配显式设备依赖、工序或产线`,ids);
  const protectedTask=!movableTask(task,data);
  if(!protectedTask&&(task.start<Math.max(conditions.startMinute,observed,event.protectionUntil)||conditions.endMinute!=null&&task.end>conditions.endMinute))add('PROTECTION_HORIZON',`任务 ${task.id} 位于当前观测/保护时段或计划范围之外`,ids);
  const calendar=machine?.['日历编号']||data.calendars[0]?.['日历编号'];
  const windows=data.calendars.filter(c=>c['日历编号']===calendar);
  if(!protectedTask&&(!windows.some(c=>c['是否工作']==='是'&&Number(c['起始分钟'])<=task.start&&Number(c['结束分钟'])>=task.end)||windows.some(c=>c['是否工作']!=='是'&&Number(c['起始分钟'])<task.end&&Number(c['结束分钟'])>task.start)))add('CALENDAR',`任务 ${task.id} 不在日历 ${calendar} 连续工作窗口 [${task.start},${task.end})`,ids);
  for(const d of data.downtime.filter(d=>d['设备编号']===task.machine))if(!protectedTask&&Number(d['起始分钟'])<task.end&&Number(d['结束分钟'])>task.start)add('DOWNTIME',`任务 ${task.id} 与 ${task.machine} 停机 [${d['起始分钟']},${d['结束分钟']}) 冲突：${d['原因']}`,ids);
 }
 for(const [id,p] of Object.entries(locks))if(!plan.tasks.some(t=>t.id===id&&inputHash(taskPosition(t))===inputHash(p)))add('LOCK_CONFLICT',`锁定 ${id} 在 ${p.machine} [${p.start},${p.end}) 无法满足，锁定保留`,[id]);
 const reservations=plan.resourceReservations||[];
 for(const r of reservations){
  const resource=r.type==='工装'?data.tools.find(t=>t['工装编码']===r.resourceId):r.type==='空间'?data.batchResources.find(t=>t['资源编号']===r.resourceId):r.type==='人员'?data.personnelGroups.find(t=>t['人员组编号']===r.resourceId):null;
  if(r.type==='设备')continue;
  const cap=r.type==='工装'?resource?.['可用数量']:r.type==='空间'?resource?.['容量']:resource?.['人员数量'];
  if(cap==null){add('RESOURCE_UNKNOWN',`无法核对资源 ${r.resourceId}`,r.taskIds);continue;}
  const same=reservations.filter(x=>x.type===r.type&&x.resourceId===r.resourceId);
  for(const minute of [r.start,...same.map(x=>x.start).filter(t=>t>=r.start&&t<r.end)]){
   const live=same.filter(x=>x.start<=minute&&x.end>minute),sum=live.reduce((v,x)=>Q.add(v,Q.q(x.quantity)),Q.zero);
   if(Q.cmp(sum,Q.q(cap))>0n)add('RESOURCE_CAPACITY',`${r.type} ${r.resourceId} 在分钟 ${minute} 超容量 ${cap}`,live.flatMap(x=>x.taskIds||[x.taskId]));
  }
  if(r.type==='人员'&&(r.start<Number(resource['可用起始分钟'])||r.end>Number(resource['可用结束分钟'])))add('PERSONNEL_WINDOW',`人员 ${r.resourceId} 不在可用窗口`,r.taskIds);
 }
 const demandKey=rows=>rows.map(r=>({taskId:r.taskId,materialId:r.materialId,quantity:r.quantity,exactQuantity:r.exactQuantity,unit:r.unit})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 if(inputHash(demandKey(plan.materialDemands||[]))!==inputHash(demandKey(base.materialDemands||[])))add('EXACT_QUANTITY','移动前后的物料需求精确数量不同；不能推断守恒');
 // Preserve upstream unknown checks. A successful supported check is never a proof of all rules.
 const unchecked=conditions.checkScope?.unchecked||[];
 return {checkedAt:new Date().toISOString(),checks:report.checks,findings:[...(plan.findings||[]),...issues],unchecked,scope:'固定结果独立核对单线、机器、顺序、日历、保护、保存资源容量及精确物料需求；其余上游语义保持未检查'};
}
export function evaluatePosition(trial,base,positions,locks){
 const frozen=freezePositions(trial.data,base.conditions,positions,new Date().toISOString());
 const result=calculate(frozen.executionData,trial.revision+1,frozen.conditions.ruleEvaluationAt,frozen.conditions);
 const engineCheck=checkPositions(result,base,frozen.executionData,frozen.conditions,positions,locks);
 // Inspect the exact candidate independently even if the scheduler refuses a task.
 // Otherwise dropping an invalid task could turn a broken edge into a misleading pass.
 const candidateTasks=base.tasks.map(t=>({...t,...(positions[t.id]||{})}));
 const candidateReservations=(base.resourceReservations||[]).map(r=>{
  const id=r.taskIds?.[0]||r.taskId,old=base.tasks.find(t=>t.id===id),p=positions[id];
  return old&&p?{...r,start:r.start+p.start-old.start,end:r.end+p.start-old.start,...(r.type==='设备'?{resourceId:p.machine}:{})}:r;
 });
 const candidateCheck=checkPositions({...base,tasks:candidateTasks,resourceReservations:candidateReservations,findings:[]},base,frozen.executionData,frozen.conditions,positions,locks);
 const check={...candidateCheck,engineChecks:engineCheck.checks,findings:[...engineCheck.findings,...candidateCheck.findings],feasibility:'supported-position-only',candidateTasks};
 return {frozen,result,check,valid:check.findings.length===0};
}
