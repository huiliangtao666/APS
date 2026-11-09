export const defaultCompletionPercent=status=>status==='completed'?100:status==='started'?50:0;
const finite=v=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v));
const rounded=n=>Number(n.toFixed(9));
export function completionPercent(task,status,footprint={}){
 if(footprint.completionPercent!==undefined)return footprint.completionPercent;
 if(status==='completed')return 100;
 if(status==='started'&&finite(footprint.executedQuantity)&&(footprint.quantity??task.quantity)>0)return rounded(Number(footprint.executedQuantity)/(footprint.quantity??task.quantity)*100);
 return defaultCompletionPercent(status);
}
export function editTaskCompletion(task,status,footprint,percent){
 const quantity=footprint.quantity??task.quantity;
 return {...footprint,completionPercent:percent,executedQuantity:finite(percent)?rounded(quantity*Number(percent)/100):''};
}

// Each allocation is attributed to its consuming task(s), never to the supply
// task. Final-route output is listed once per production; it is not delivery.
export function progressProjection(run,draft,context,observationDay){
 const result=run?.result||{},tasks=result.tasks||[],progress=new Map();
 const taskRows=tasks.map(t=>{const f=draft.footprints[t.id]||{},percent=completionPercent(t,draft.statuses[t.id],f),quantity=f.quantity??t.quantity,done=finite(percent)&&Number(percent)>=0&&Number(percent)<=100?rounded(quantity*Number(percent)/100):null;progress.set(t.id,{quantity,baselineQuantity:t.quantity,done});return {id:t.id,demandId:t.orderId,productionId:t.productionId,materialId:t.productId,operation:t.label,quantity,percent,done};});
 const allocations={},consumed=[];
 for(const [index,a]of (result.allocations||[]).entries()){
  const ids=context?.allocationTasks?.[index]||[],linked=ids.map(id=>progress.get(id)).filter(Boolean),target=linked.reduce((n,t)=>n+t.quantity,0),baseline=linked.reduce((n,t)=>n+t.baselineQuantity,0),done=linked.reduce((n,t)=>n+(t.done||0),0),unit=context?.materials?.[a.materialId]?.unit||a.unit||'物料基础单位';
  const raw=baseline>0?a.quantity*Math.min(1,done/baseline):0,calculated=Math.min(a.quantity,unit==='个'?Math.ceil(raw-1e-9):rounded(raw));
  const old=draft.allocations?.[index]||{},saved=context?.savedAllocations?.find(f=>f.index===index),protectedFact=saved?.quantity>0;
  let next={...old,index,kind:calculated>0?'consumed':'none',quantity:String(calculated),feedMinute:protectedFact?saved.feedDay:calculated>0?observationDay:old.feedMinute??observationDay};
  // Delivery, old real consumption and explicit locks remain authoritative.
  if(!ids.length)next={...old,index};
  else if(protectedFact&&(saved.kind==='locked'||saved.quantity>calculated))next={...old,index,kind:saved.kind,quantity:String(saved.quantity),feedMinute:saved.feedDay};
  allocations[index]=next;
  if(ids.length||Number(next.quantity)>0)consumed.push({index,demandId:a.need,materialId:a.materialId,name:context?.materials?.[a.materialId]?.name||a.materialId,supplyId:a.supplyId,taskIds:ids,planned:a.quantity,unit,calculated,quantity:next.kind==='consumed'?Number(next.quantity)||0:0,locked:next.kind==='locked'?Number(next.quantity)||0:0,percent:target>0?rounded(done/target*100):0,date:next.feedMinute,kind:next.kind});
 }
 const groups=new Map();for(const t of tasks){const key=t.productionId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
 const completed=[];
 for(const [productionId,group]of groups){const route=context?.finalRoutes?.[group[0].productId];if(!route)continue;const final=group.filter(t=>t.routeStepId===route),quantity=final.reduce((n,t)=>n+(progress.get(t.id)?.quantity||0),0),done=final.reduce((n,t)=>n+(progress.get(t.id)?.done||0),0);if(!final.length)continue;
  completed.push({productionId,demandId:group[0].orderId,materialId:group[0].productId,name:context?.materials?.[group[0].productId]?.name||group[0].productId,quantity,done:rounded(done),percent:quantity>0?rounded(done/quantity*100):0,taskIds:final.map(t=>t.id),unit:'千克'});
 }
 return {allocations,consumed,completed,tasks:taskRows};
}
