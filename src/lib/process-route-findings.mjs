// Preserve producer associations; compatibility diagnostics never infer identity
// from translated messages or serialized task IDs.
export function processRouteFindings(check,plan,data){
 const findings=(check.findings||[]).map(f=>({...f}));
 for(const message of check.problems||[])if(!findings.some(f=>f.message===message))findings.push({code:'VERIFY / PROCESS_ROUTE',message,taskIds:[],sourceRead:'frozen-calendar-v1',relatedRecords:[]});
 for(const id of check.missing||[]){
  const producer=(plan.findings||[]).find(f=>f.taskIds?.includes(id));
  findings.push({...producer,code:'VERIFY / PROCESS_ROUTE',message:'完整路线缺少 '+id,taskIds:[id],sourceRead:'frozen-calendar-v1',relatedRecords:producer?.relatedRecords||[]});
 }
 return findings.map(f=>{
  if(!f.context)return f;
  const c=f.context,task=(plan.tasks||[]).find(t=>f.taskIds?.includes(t.id)&&t.orderId===c.orderId&&t.operation===c.operation);
  const deps=(data?.dependencies||[]).filter(d=>d['订单编号']===c.orderId&&d['工序编号']===c.operation&&d['资源类型']==='设备');
  return {...f,context:{...c,...(task?.productionBatchId?{productionBatchId:task.productionBatchId}:{}),...(task?.machine?{machineId:task.machine}:deps.length===1?{machineId:deps[0]['资源编号']}:{} )}};
 });
}
