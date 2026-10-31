import {executionState} from './execution-facts.mjs';
import {inputHash} from '../../server/run-input.mjs';
const clone=x=>structuredClone(x);
const stable=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function changes(a,b,key){
 const index=rows=>{const groups=new Map();rows.forEach((r,i)=>{const id=key(r,i);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);});return new Map([...groups].map(([id,items])=>[id,items.sort((x,y)=>stable(x).localeCompare(stable(y)))]));};
 const left=index(a),right=index(b);
 return [...new Set([...left.keys(),...right.keys()])].sort().flatMap(id=>stable(left.get(id))===stable(right.get(id))?[]:[{id,before:clone(left.get(id)??null),after:clone(right.get(id)??null)}]);
}
// Match records by business identity; duplicate identities remain grouped, never overwritten.
const identities={resourceStops:['例外编号'],personnelPools:['poolId'],factoryLines:['产线编号'],skillSubstitutions:['关系编号'],orders:['订单编号'],calendars:['日历编号','起始分钟','结束分钟'],tools:['工装编码'],personnelGroups:['人员组编号'],inventory:['批次编号'],supplies:['供给编号'],supplyDelays:['记录编号'],supplyUses:['引用编号'],rules:['规则编号'],products:['产品编号'],materials:['物料编号'],routes:['产品编号','工序编号'],times:['产品编号','工序编号'],machines:['设备编号'],bom:['版本编号','产品编号','投料工序编号','物料编号','用量类型'],dependencies:['订单编号','工序编号','资源类型','资源编号','人员岗位编号','人员参与阶段'],resourceClaims:['声明编号'],deliveryConditions:['订单编号'],batchResources:['资源编号'],downtime:['设备编号','起始分钟','结束分钟']};
export function conditionChanges(a,b){
 return Object.keys({...a,...b}).sort().flatMap(table=>changes(a[table]||[],b[table]||[],r=>JSON.stringify((identities[table]||Object.keys(r).sort()).map(k=>r[k]??null))).map(change=>{
  const single=change.before?.length===1&&change.after?.length===1;
  return {table,recordKey:change.id,kind:!change.before?'added':!change.after?'removed':single?'edited':'group-changed',before:change.before,after:change.after,fields:single?Object.keys({...change.before[0],...change.after[0]}).sort().filter(field=>stable(change.before[0][field])!==stable(change.after[0][field])).map(field=>({field,before:change.before[0][field]??null,after:change.after[0][field]??null})):null};
 }));
}
function impact(a,ad,b,bd,scopeComparable,evidence){
 const left=a.deliveryAssessment?.orders,right=b.deliveryAssessment?.orders;
 const changed=conditionChanges(ad,bd);
 const demandChanged=changed.some(c=>['orders','products','routes','bom','times','deliveryConditions'].includes(c.table));
 const settings=c=>{const {ruleEvaluationAt,checkScope,resourcePolicyVersion,...selection}=c||{};return selection;};
 const settingsComparable=stable(settings(a.conditions))===stable(settings(b.conditions));
 const orders=[...new Set([...(left||[]),...(right||[])].map(o=>o.orderId))].sort().map(orderId=>{
  const before=left?.find(o=>o.orderId===orderId)??null,after=right?.find(o=>o.orderId===orderId)??null;
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const delta=before&&after&&finite(before.expectedDeliverableMinute)&&finite(after.expectedDeliverableMinute)?after.expectedDeliverableMinute-before.expectedDeliverableMinute:null;
  const comparable=!!before&&!!after&&scopeComparable&&settingsComparable&&!demandChanged&&before.remainingQuantity===after.remainingQuantity&&before.unit===after.unit&&before.dueMinute===after.dueMinute;
  return {orderId,before:clone(before),after:clone(after),deliverableDeltaMinutes:delta,delayDeltaMinutes:before&&after&&finite(before.delayMinutes)&&finite(after.delayMinutes)?after.delayMinutes-before.delayMinutes:null,outcome:a.copiedResult||b.copiedResult?'copied-not-recalculated':!comparable?'not-comparable':delta===null?'unknown':delta<0?'earlier-conditional':delta>0?'later-conditional':'unchanged-no-delivery-improvement',bottlenecks:{before:savedBottlenecks(a,orderId),after:savedBottlenecks(b,orderId)},promised:false};
 });
 return {changedConditions:changed,settings:{before:settings(a.conditions),after:settings(b.conditions),comparable:settingsComparable,ruleEvaluationAt:{before:a.conditions?.ruleEvaluationAt??null,after:b.conditions?.ruleEvaluationAt??null}},demandChanged,orders,affectedTaskIds:[...new Set([...(evidence.tasks.changes||[]).map(c=>c.id),...(evidence.unplanned.changes||[]).map(c=>c.id),...['resources','materials'].flatMap(key=>(evidence[key].changes||[]).flatMap(c=>[...(c.before||[]),...(c.after||[])].flatMap(row=>[...(row.taskIds||[]),...(row.taskId?[row.taskId]:[])])))])].sort(),copiedResults:!!a.copiedResult||!!b.copiedResult,claim:'仅保存结果的差异；不推断单项条件因果、全局最早或真实交付',noAutomaticImprovement:true};
}
// Explain only saved evidence; changing a resource is never proof of a causal benefit.
function savedBottlenecks(plan,orderId){
 const taskIds=new Set((plan.tasks||[]).filter(t=>t.orderId===orderId).map(t=>t.id));
 const order=plan.deliveryAssessment?.orders?.find(o=>o.orderId===orderId);
 const assessed=(plan.resultAssessment?.tasks||[]).filter(t=>t.orderId===orderId);
 assessed.forEach(t=>taskIds.add(t.id));
 return {
  timing:(plan.tasks||[]).filter(t=>t.orderId===orderId).flatMap(t=>(t.timingReasons||[]).map(reason=>({taskId:t.id,reason:clone(reason)}))),
  findings:(plan.findings||[]).filter(f=>f.orderId===orderId||f.context?.orderId===orderId||(f.taskIds||[]).some(id=>taskIds.has(id))).map(clone),
  materials:plan.materialChecked===true?(plan.materialDemands||[]).filter(m=>m.orderId===orderId||taskIds.has(m.taskId)).filter(m=>m.shortage>0||(m.allocations||[]).some(x=>x.conditional)).map(clone):null,
  supplyConditions:clone(order?.supplyConditions??null),
  deliveryConditions:clone(order??null),
  unplanned:assessed.filter(t=>t.status==='unplanned').map(clone),
  inference:'saved-evidence-only'
 };
}
function projection(p,data){
 return {
  tasks:(p.tasks||[]).map(t=>({id:t.id,orderId:t.orderId,operation:t.operation,productionBatchId:t.productionBatchId??null,start:t.start,end:t.end,duration:t.duration,machine:t.machine,predecessor:t.predecessor??null})),
  // Retain full records, including candidate vs committed allocations and exact quantities.
  resources:p.resourceReservations??null,
  materials:p.materialChecked===true?p.materialDemands??null:null,
  orders:p.deliveryAssessment?.orders?.map(o=>({orderId:o.orderId,unit:o.unit,status:o.status,dueMinute:o.dueMinute,dueAt:o.dueAt,completionMinute:o.completionMinute,completionAt:o.completionAt,expectedDeliverableMinute:o.expectedDeliverableMinute,expectedDeliverableAt:o.expectedDeliverableAt,delayMinutes:o.delayMinutes,delayedQuantity:o.delayedQuantity,remainingQuantity:o.remainingQuantity,knownScheduledQuantity:o.knownCompletedQuantity,unknownDeliverableQuantity:o.unknownDeliverableQuantity,promised:false}))??null,
  // Per-operation quantities must never be summed across an order's route.
  unplanned:p.resultAssessment?.tasks?.filter(t=>t.status==='unplanned').map(t=>({id:t.id,orderId:t.orderId,operation:t.operation,productionBatchId:t.productionBatchId,quantity:t.quantity,exactQuantity:t.exactQuantity,unit:t.unit}))??null,
  inputs:data,conditions:p.conditions??null,scope:p.conditions?.checkScope??null
 };
}
export function comparePlans(a,ad,b,bd){
 // The report is a detached historical value, even if callers subsequently edit a trial.
 a=clone(a);ad=clone(ad);b=clone(b);bd=clone(bd);
 const left=projection(a,ad),right=projection(b,bd),out={};
 for(const category of ['tasks','resources','materials','orders','unplanned']){
  const x=left[category],y=right[category];
  const key=category==='tasks'||category==='unplanned'?r=>r.id:category==='orders'?r=>r.orderId:category==='materials'?r=>JSON.stringify([r.taskId,r.materialId]):r=>JSON.stringify([r.type,r.resourceId,r.taskId,r.taskIds,r.operation,r.productionBatchId]);
  out[category]={known:x!==null&&y!==null,before:x,after:y,changes:x!==null&&y!==null?changes(x,y,key):null};
 }
 out.inputs=Object.keys({...ad,...bd}).sort().flatMap(table=>stable(ad[table])===stable(bd[table])?[]:[{table,before:clone(ad[table]??null),after:clone(bd[table]??null)}]);
 out.execution={before:clone(a.execution??null),after:clone(b.execution??null),known:!!a.execution&&!!b.execution,changed:stable(a.execution??null)!==stable(b.execution??null)};
 const orderKnown=out.orders.known,orderChanged=orderKnown&&out.orders.changes.length>0;
 return {version:'FR028-v1',impact:impact(a,ad,b,bd,stable(left.scope)===stable(right.scope),out),left:{kind:a.trialId?'trial':'saved-original',copiedResult:!!a.copiedResult,planId:a.id,runId:a.runId,inputVersionId:a.inputVersionId,snapshotHash:a.snapshotHash,trialId:a.trialId??null},right:{kind:b.trialId?'trial':'saved-original',copiedResult:!!b.copiedResult,planId:b.id,runId:b.runId,inputVersionId:b.inputVersionId,snapshotHash:b.snapshotHash,trialId:b.trialId??null},conditions:{before:left.conditions,after:right.conditions,changed:stable(left.conditions)!==stable(right.conditions)},scope:{before:left.scope,after:right.scope,comparable:stable(left.scope)===stable(right.scope)},...out,orderOutcome:!orderKnown?'unknown':orderChanged?'changed-review-each-order':'unchanged-no-delivery-improvement',limits:['仅比较保存的模拟结果；不承诺全局最优或真实交付','未检查的物料分配保持未知，空数组不代表已检查','未排数量按任务/工序展示；不跨工序相加','交期变化可能来自需求或检查范围变化，须查看输入与条件差异','副本初始结果来自原运行；重算后有独立运行编号']};
}
export function restoreBlockers(state,plan){
 return {currentRevision:state.revision,currentInputVersionId:inputHash(state.data),sourcePlanId:plan?.id??null,sourceRunId:plan?.runId??null,sourceInputVersionId:plan?.inputVersionId??null,currentProgressVersion:inputHash(executionState(state.data)),executionFactsVersion:inputHash(executionState(state.data)),confirmationReference:(state.confirmations||[]).map(c=>({id:c.id,snapshotHash:c.snapshotHash})),blockers:[{code:'EXECUTION_RECONCILIATION_REQUIRED',message:'须先完成服务端恢复预检，并核对当前模拟事实与来源；禁止替换当前事实。'},{code:'CONFIRMATION_CONTRACT_UNAVAILABLE',message:'内部确认与版本化事实已提供；恢复须保留确认历史，真实Gateway及完整业务保护尚未证明。'},{code:'STALE_STOCK_RESTORE_FORBIDDEN',message:'禁止整表恢复历史库存、占用与进度；当前数据及执行事实必须保留。'}]};
}
