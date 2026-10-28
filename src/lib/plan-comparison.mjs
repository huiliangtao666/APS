import {inputHash} from '../../server/run-input.mjs';
const clone=x=>structuredClone(x);
const stable=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function changes(a,b,key){
 const index=rows=>{const groups=new Map();rows.forEach((r,i)=>{const id=key(r,i);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);});return new Map([...groups].map(([id,items])=>[id,items.sort((x,y)=>stable(x).localeCompare(stable(y)))]));};
 const left=index(a),right=index(b);
 return [...new Set([...left.keys(),...right.keys()])].sort().flatMap(id=>stable(left.get(id))===stable(right.get(id))?[]:[{id,before:clone(left.get(id)??null),after:clone(right.get(id)??null)}]);
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
 const left=projection(a,ad),right=projection(b,bd),out={};
 for(const category of ['tasks','resources','materials','orders','unplanned']){
  const x=left[category],y=right[category];
  const key=category==='tasks'||category==='unplanned'?r=>r.id:category==='orders'?r=>r.orderId:category==='materials'?r=>JSON.stringify([r.taskId,r.materialId]):r=>JSON.stringify([r.type,r.resourceId,r.taskId,r.taskIds,r.operation,r.productionBatchId]);
  out[category]={known:x!==null&&y!==null,before:x,after:y,changes:x!==null&&y!==null?changes(x,y,key):null};
 }
 out.inputs=Object.keys({...ad,...bd}).sort().flatMap(table=>stable(ad[table])===stable(bd[table])?[]:[{table,before:clone(ad[table]??null),after:clone(bd[table]??null)}]);
 const orderKnown=out.orders.known,orderChanged=orderKnown&&out.orders.changes.length>0;
 return {version:'FR026-v1',left:{planId:a.id,runId:a.runId,inputVersionId:a.inputVersionId,snapshotHash:a.snapshotHash,trialId:a.trialId??null},right:{planId:b.id,runId:b.runId,inputVersionId:b.inputVersionId,snapshotHash:b.snapshotHash,trialId:b.trialId??null},conditions:{before:left.conditions,after:right.conditions,changed:stable(left.conditions)!==stable(right.conditions)},scope:{before:left.scope,after:right.scope,comparable:stable(left.scope)===stable(right.scope)},...out,orderOutcome:!orderKnown?'unknown':orderChanged?'changed-review-each-order':'unchanged-no-delivery-improvement',limits:['仅比较保存的模拟结果；不承诺全局最优或真实交付','未检查的物料分配保持未知，空数组不代表已检查','未排数量按任务/工序展示；不跨工序相加','交期变化可能来自需求或检查范围变化，须查看输入与条件差异','副本初始结果来自原运行；重算后有独立运行编号']};
}
export function restoreBlockers(state,plan){
 return {currentRevision:state.revision,currentInputVersionId:inputHash(state.data),sourcePlanId:plan?.id??null,sourceRunId:plan?.runId??null,sourceInputVersionId:plan?.inputVersionId??null,currentProgressVersion:null,executionFactsVersion:null,confirmationReference:null,blockers:[{code:'CURRENT_PROGRESS_RECHECK_UNAVAILABLE',message:'R5当前任务开始/完成、剩余工时及耗料事实与版本接口尚未提供，不能安全复查恢复。'},{code:'CONFIRMATION_CONTRACT_UNAVAILABLE',message:'真实确认计划及执行保护接口尚未提供，不能替换确认计划。'},{code:'STALE_STOCK_RESTORE_FORBIDDEN',message:'禁止整表恢复历史库存、占用与进度；当前数据及执行事实必须保留。'}]};
}
