import {quantityMath as Q} from './material-allocation.mjs';
import {PLAN_TIME_ORIGIN} from './expected-supply.mjs';
import {deliveryActive,validateDelivery} from './delivery-policy.mjs';
const instant=minute=>{if(minute===null||!Number.isFinite(minute))return null;const date=new Date(Date.parse(PLAN_TIME_ORIGIN)+minute*60000);return Number.isFinite(date.getTime())?date.toISOString():null;};
const minute=raw=>(Date.parse(raw)-Date.parse(PLAN_TIME_ORIGIN))/60000;
const number=raw=>String(raw??'').trim()!==''&&Number.isFinite(Number(raw))?Number(raw):null;
// Assess the saved constructive result only. No optimizer, promise or execution fact.
export function assessDelivery(data,plan,at,conditions={}){
 const minimal=conditions.mode==='minimal-r1',active=!minimal&&deliveryActive(data,at);
 const scope=plan.ruleSnapshot?.checkScope;
 const orders=(data.orders||[]).filter(o=>o['需求类型']==='正式订单'&&o['订单状态']==='有效').map(order=>{
  const orderId=order['订单编号'],unit=order['数量单位'],product=(data.products||[]).find(p=>p['产品编号']===order['产品编号']);
  const tasks=plan.tasks.filter(t=>t.orderId===orderId),route=(data.routes||[]).filter(r=>r['产品编号']===order['产品编号']);
  const reasons=[],supplyConditions=(plan.supplyConditions||[]).filter(c=>c['订单编号']===orderId);
  const materialRows=(plan.materialDemands||[]).filter(r=>r.orderId===orderId);
  const allocations=materialRows.filter(r=>r.committed).flatMap(r=>r.allocations.map(a=>({...a,taskId:r.taskId,materialId:r.materialId,feedMinute:r.feedMinute})));
  const quality=(data.deliveryConditions||[]).find(r=>r['订单编号']===orderId)||null;
  const due=number(order['要求可交付分钟']);
  let required=null,remaining=null,knownComplete=Q.zero,unknown=Q.zero,late=Q.zero,completion=null,deliverable=null,delay=null;
  let status='unknown',batches=[];
  try{
   required=Q.q(order['合格需求']);remaining=Q.sub(required,Q.q(order['已完成合格数量']||'0'));
   if(Q.cmp(remaining,Q.zero)<0n)throw Error('订单已完成数量超过需求');
   if(Q.cmp(remaining,Q.zero)===0n)reasons.push({code:'NO_REMAINING_WORK',message:'订单没有剩余工作；历史合格数量没有可交付/质量/效期事实，不推断交付成功'});
   const records=plan.batchChecked?(plan.productionBatches||[]).filter(b=>b.orderId===orderId):[{id:null,exactQuantity:Q.exact(remaining)}];
   for(const b of records){
    let qty=plan.batchChecked?Q.fromExact(b.qualifiedKg):remaining;
    if(plan.batchChecked&&unit!=='kg')throw Error('生产批kg与订单单位不一致，缺少已验证换算');
    const bt=tasks.filter(t=>!plan.batchChecked||t.productionBatchId===b.id);
    const missing=route.filter(op=>bt.filter(t=>t.operation===op['工序编号']&&Number.isFinite(t.end)).length!==1).map(r=>r['工序编号']);
    const complete=route.length>0&&!missing.length&&bt.length===route.length;
    const end=complete?Math.max(...bt.map(t=>t.end)):null;
    if(complete)knownComplete=Q.add(knownComplete,qty);
    batches.push({productionBatchId:b.id,quantity:Q.num(qty),exactQuantity:Q.exact(qty),unit,taskIds:bt.map(t=>t.id),missingOperations:missing,completionMinute:end,completionAt:instant(end),deliverableMinute:null,deliverableAt:null});
   }
   if(Q.cmp(knownComplete,remaining)>0n)throw Error('完成数量超过订单余量');
   unknown=remaining;
   if(Q.cmp(remaining,Q.zero)>0n&&batches.length&&batches.every(b=>b.completionMinute!==null)&&Q.cmp(knownComplete,remaining)===0n)completion=Math.max(...batches.map(b=>b.completionMinute));
   else reasons.push({code:'INCOMPLETE',message:'未排、缺工序或无剩余工作；订单完成/可交付时间及全量延后未知'});
   if(!active)reasons.push({code:minimal?'MINIMAL_UNCHECKED':'DELIVERY_UNCHECKED',message:minimal?'R1最小模式不检查物料/质量/交付条件':'DELIVERY未启用或未生效，交付与延后未知'});
   if(!plan.materialChecked||!plan.batchChecked)reasons.push({code:'SCOPE_INCOMPLETE',message:'缺少物料齐套或拆合批/容量检查；不推断可交付或零延后'});
   if(route.some(r=>r['最大等待分钟']?.trim()))reasons.push({code:'MAX_WAIT_UNRESOLVED',message:'路线声明最大等待；最大等待/上游调整未实现，不能输出可交付结论'});
   for(const [type,flag]of [['工装','MOLD'],['空间','STORAGE']])if(!plan.jointResourceChecks?.[flag]&&[...(data.resourceClaims||[]),...(data.dependencies||[])].some(r=>r['订单编号']===orderId&&r['资源类型']===type))reasons.push({code:'JOINT_SCOPE_UNCHECKED',message:`订单声明${type}条件，但本方案未检查，交付未知`});
   const wait=number(product?.['模拟交付等待分钟']);
   if(wait===null||wait<0||!Number.isSafeInteger(wait))reasons.push({code:'WAIT_UNKNOWN',message:'产品模拟交付等待须显式配置非负整数分钟'});
   if(!quality)reasons.push({code:'QUALITY_UNKNOWN',message:'缺少显式订单模拟质量与有效期条件'});
   else if(!['模拟合格','模拟预计可用'].includes(quality['模拟质量状态']))reasons.push({code:'QUALITY_BLOCKED',message:'待检或模拟不合格，不能按预计合格交付'});
   if(validateDelivery(data).some(i=>i.message&&(!quality||i.row===(data.deliveryConditions||[]).indexOf(quality)+2)))reasons.push({code:'DELIVERY_CONFIG',message:'模拟交付条件校验失败'});
   if(due===null||instant(due)===null)reasons.push({code:'DUE_UNKNOWN',message:'订单要求时间缺失，不能计算延后'});
   const gates=reasons.filter(r=>!['INCOMPLETE','NO_REMAINING_WORK','DUE_UNKNOWN'].includes(r.code));
   if(active&&!gates.length){
    unknown=Q.zero;
    for(const b of batches){
     if(b.completionMinute===null){unknown=Q.add(unknown,Q.fromExact(b.exactQuantity));continue;}
     const afterWait=b.completionMinute+wait,ready=quality['模拟质量可用时间']?minute(quality['模拟质量可用时间']):0;
     const candidate=Math.max(afterWait,ready);
     if(instant(candidate)===null||quality['模拟有效期截止时间']!=='不适用'&&minute(quality['模拟有效期截止时间'])-candidate<Number(quality['要求剩余有效分钟'])){
      unknown=Q.add(unknown,Q.fromExact(b.exactQuantity));reasons.push({code:'REMAINING_LIFE',productionBatchId:b.productionBatchId,message:'候选交付时剩余有效期不足；未放松效期条件'});continue;
     }
     reasons.push({code:'POST_COMPLETION_WAIT',productionBatchId:b.productionBatchId,from:b.completionMinute,to:afterWait,message:`生产完成后按产品配置等待 ${wait} 分钟`});
     if(ready>afterWait)reasons.push({code:'SIMULATED_QUALITY_READY',productionBatchId:b.productionBatchId,from:afterWait,to:ready,message:`模拟质量可用条件 ${quality['模拟质量可用时间']} 晚于等待完成；仍须条件成立`});
     b.deliverableMinute=candidate;b.deliverableAt=instant(candidate);
     if(due!==null&&candidate>due)late=Q.add(late,Q.fromExact(b.exactQuantity));
    }
    // Account for orders rejected before production records could be built.
    const represented=batches.reduce((a,b)=>Q.add(a,Q.fromExact(b.exactQuantity)),Q.zero);
    if(Q.cmp(represented,remaining)<0n)unknown=Q.add(unknown,Q.sub(remaining,represented));
    if(completion!==null&&Q.cmp(unknown,Q.zero)===0n){deliverable=Math.max(...batches.map(b=>b.deliverableMinute));delay=due===null||instant(due)===null?null:Math.max(0,deliverable-due);status=delay===null?'conditional-time':delay>0?'conditional-late':'conditional-assessed';}
    else status='incomplete';
   }
  }catch(e){completion=null;deliverable=null;delay=null;status='unknown';reasons.push({code:'QUANTITY_UNKNOWN',message:String(e.message)});unknown=remaining||Q.zero;}
  const exact=q=>q===null?null:Q.exact(q),num=q=>q===null?null:Q.num(q);
  return {orderId,productId:order['产品编号'],unit,status,promised:false,requiredQuantity:num(required),exactRequiredQuantity:exact(required),remainingQuantity:num(remaining),exactRemainingQuantity:exact(remaining),knownCompletedQuantity:Q.num(knownComplete),knownLateQuantity:due===null?null:Q.num(late),exactKnownLateQuantity:due===null?null:Q.exact(late),unknownDeliverableQuantity:remaining===null?null:Q.num(unknown),exactUnknownDeliverableQuantity:remaining===null?null:Q.exact(unknown),delayedQuantity:deliverable===null||delay===null?null:Q.num(late),delayMinutes:delay,dueMinute:due,dueAt:instant(due),completionMinute:completion,completionAt:instant(completion),expectedDeliverableMinute:deliverable,expectedDeliverableAt:instant(deliverable),batches,reasons,taskIds:tasks.map(t=>t.id),timingReasons:tasks.map(t=>({taskId:t.id,reasons:t.timingReasons||[],source:t.source})),supplyConditions,materialAllocations:allocations,qualityCondition:quality?{...quality}:null,waitMinutes:product?.['模拟交付等待分钟']??null,findings:plan.findings.map(f=>({...f,scope:'本次运行问题，可能影响多个订单'}))};
 });
 return {version:'FR023-v1',label:'找到的可行时间（仅保存的已检查范围；附条件）',timeOrigin:PLAN_TIME_ORIGIN,mode:minimal?'minimal-r1':'supported',active,promised:false,scope:scope||null,limits:['非全局最早；构造搜索不保证找到所有可行排法','DEC02、最大等待、动态下游释放等未决语义保留','模拟物料/质量条件须成立；无真实交付承诺','运输与跨工厂承诺不属于P0'],taskCompletions:plan.tasks.map(t=>({taskId:t.id,orderId:t.orderId,productionBatchId:t.productionBatchId||null,resourceBatchId:t.resourceBatchId||null,completionMinute:t.end,completionAt:instant(t.end)})),orders};
}
