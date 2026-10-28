import {PLAN_TIME_ORIGIN} from './expected-supply.mjs';
const date=m=>Number.isFinite(m)?new Date(Date.parse(PLAN_TIME_ORIGIN)+m*60000).toISOString():null;
const ref=(table,row)=>({table,row:structuredClone(row)});
const suggestion=(kind,message)=>({kind,message,guaranteed:false,requiresNewRun:true});
export function resultState(run,report){
 const states={queued:['queued','等待计算'],running:['running','计算中'],timed_out:['time-limit-no-result','规定时间内未找到可用结果；不代表业务无解'],failed:['calculation-failure','计算失败'],cancelled:['user-cancellation','用户取消']};
 const [code,label]=states[run.status]||[report?.status||'unknown',report?.status==='scheduled'?'已得到安排（仅本次检查范围）':report?.status==='partial-unplanned'?'存在未排任务或问题':'历史结果状态未知'];
 return {code,label,globalFeasibility:'unknown',planId:run.planId||null,hasSavedResult:!!run.planId,failure:run.failure||null};
}
// Projection of frozen execution input + saved constructive output. No live data,
// optimizer rerun, execution fact, or inferred global infeasibility.
export function assessResult(data,plan,conditions={}){
 const tasks=[],orders=[],findings=plan.findings||[];
 for(const order of data.orders||[]){
  if(order['订单状态']!=='有效'||order['需求类型']!=='正式订单')continue;
  const orderId=order['订单编号'],productId=order['产品编号'];
  const remaining=Number(order['合格需求'])-Number(order['已完成合格数量']||0);
  if(remaining===0&&!(plan.tasks||[]).some(t=>t.orderId===orderId)){orders.push({orderId,status:'no-remaining-work',remainingQuantity:0,unit:order['数量单位']});continue;}
  const route=(data.routes||[]).filter(r=>r['产品编号']===productId);
  const batches=plan.batchChecked?(plan.productionBatches||[]).filter(b=>b.orderId===orderId):[];
  const units=batches.length?batches:[null];
  orders.push({orderId,status:route.length?'evaluated':'unknown-route',remainingQuantity:Number.isFinite(remaining)?remaining:null,unit:order['数量单位']});
  for(const b of units)for(const op of route){
   const operation=op['工序编号'],id=b?JSON.stringify([orderId,b.index,operation]):`${orderId}-${operation}`;
   const actual=(plan.tasks||[]).find(t=>t.id===id);
   const linked=findings.filter(f=>f.taskIds?.includes(id)||f.context?.orderId===orderId&&!f.context?.operation);
   const deps=(data.dependencies||[]).filter(d=>d['订单编号']===orderId&&d['工序编号']===operation);
   const machineId=deps.find(d=>d['资源类型']==='设备')?.['资源编号']||null;
   const machine=(data.machines||[]).find(r=>r['设备编号']===machineId);
   const materials=(plan.materialDemands||[]).filter(r=>r.taskId===id);
   const time=(data.times||[]).find(r=>r['产品编号']===productId&&r['工序编号']===operation);
   const candidate=linked.find(f=>f.context?.candidateMinute!=null)?.context.candidateMinute??materials[0]?.feedMinute??null;
   const reasons=linked.map(f=>({...structuredClone(f),classification:/未决定|未配置.*口径|未批准|未实现/.test(f.message)?'unresolved':f.code.includes('PREDECESSOR')?'blocked-predecessor':/CONFIG|INPUT|RULE/.test(f.code)?'data-repair':'observed-blocker'}));
   if(!actual&&!reasons.length)reasons.push({code:'UNKNOWN_TASK_CAUSE',classification:'unknown',message:'本任务未排；没有可验证的逐任务原因。请核对本次全局问题，不推断具体瓶颈。',taskIds:[id]});
   const codes=linked.map(f=>f.code).join(' '),suggestions=[];
   if(reasons.some(r=>r.classification==='data-repair'))suggestions.push(suggestion('data-repair','核对关联输入的引用、单位、工时及规则参数，修复后另开计算。'));
   if(materials.some(r=>r.shortage>0)){
    suggestions.push(suggestion('data-repair','核对库存账面、占用、模拟质量状态、有效期及显式预计供给；不得将待检/冻结/不合格直接改为真实合格。'));
    suggestions.push(suggestion('delay','仅在已有合法可用供给或调整后的有效窗口成立时，尝试推迟计划并重新计算。'));
    suggestions.push(suggestion('demand-edit','评估减少或拆分允许拆分的需求，保留单位、拆批和包材取整约束后重新计算。'));
   }
   if(/CALENDAR|HORIZON|PERSONNEL|JOINT_RESOURCE/.test(codes))suggestions.push(suggestion('delay','核对候选日期、工厂窗口、停机与占用释放时点；尝试调整计划范围或推迟后重新计算。'));
   if(/PERSONNEL|JOINT_RESOURCE/.test(codes))suggestions.push(suggestion('simulated-capacity','核对已声明人数/技能/班次或工装/空间数量及窗口；只在模拟输入中调整相关容量后重新计算。'));
   if(reasons.some(r=>r.classification==='blocked-predecessor'))suggestions.push(suggestion('delay','先核对同订单前序未排的保存原因；解决其阻塞后另开计算，不能绕过工序先后。'));
   if(/BATCH_CONFIG/.test(codes)&&!reasons.some(r=>r.classification==='unresolved'))suggestions.push(suggestion('demand-edit','核对需求与允许拆分设置、最大装载及包材取整约束后重新计算，不自动改变需求。'));
   if(/UNDER_MIN_LOAD/.test(codes))suggestions.push(suggestion('demand-edit','核对资源批实际装载与最小装载；仅按允许的需求或兼容组批修改后重新计算，不自动超产。'));
   const refs=[ref('orders',order),ref('routes',op),...deps.map(r=>ref('dependencies',r))];
   if(time)refs.push(ref('times',time));if(machine)refs.push(ref('machines',machine));
   refs.push(...(data.calendars||[]).filter(r=>r['日历编号']===machine?.['日历编号']).map(r=>ref('calendars',r)),...(data.downtime||[]).filter(r=>r['设备编号']===machineId).map(r=>ref('downtime',r)));
   refs.push(...(data.resourceClaims||[]).filter(r=>r['订单编号']===orderId&&r['工序编号']===operation).map(r=>ref('resourceClaims',r)));
   const claims=(data.resourceClaims||[]).filter(r=>r['订单编号']===orderId&&r['工序编号']===operation);
   refs.push(...(data.tools||[]).filter(r=>claims.some(c=>c['资源编号']===r['工装编码'])).map(r=>ref('tools',r)),...(data.batchResources||[]).filter(r=>r['资源编号']===machineId||claims.some(c=>c['资源编号']===r['资源编号'])).map(r=>ref('batchResources',r)));
   if(/PERSONNEL/.test(codes))refs.push(...(data.personnelGroups||[]).map(r=>ref('personnelGroups',r)));
   for(const m of materials){refs.push(...(data.bom||[]).filter(r=>r['产品编号']===productId&&r['物料编号']===m.materialId&&r['投料工序编号']===operation).map(r=>ref('bom',r)),...(data.inventory||[]).filter(r=>r['物料编号']===m.materialId).map(r=>ref('inventory',r)),...(data.supplies||[]).filter(r=>r['物料编号']===m.materialId).map(r=>ref('supplies',r)));}
   const supplyIds=(data.supplies||[]).filter(r=>materials.some(m=>m.materialId===r['物料编号'])).map(r=>r['供给编号']);
   refs.push(...(data.supplyDelays||[]).filter(r=>supplyIds.includes(r['供给编号'])).map(r=>ref('supplyDelays',r)),...(data.supplyUses||[]).filter(r=>r['订单编号']===orderId&&r['工序编号']===operation).map(r=>ref('supplyUses',r)));
   tasks.push({id,orderId,productId,operation,productionBatchId:b?.id||null,status:actual?'scheduled':'unplanned',quantity:b?.quantity??(Number.isFinite(remaining)?remaining:null),exactQuantity:b?.qualifiedKg||null,unit:order['数量单位'],machineId,requiredDuration:time&&Number(time['固定分钟'])>0?Number(time['固定分钟']):null,candidateMinute:candidate,candidateAt:date(candidate),start:actual?.start??null,end:actual?.end??null,startAt:date(actual?.start),endAt:date(actual?.end),reasons,suggestions,materials:structuredClone(materials),inputRefs:refs,timingReasons:structuredClone(actual?.timingReasons||[])});
  }
 }
 const missing=tasks.filter(t=>t.status==='unplanned').length;
 return {version:'FR024-v1',status:missing||findings.length||orders.some(o=>o.status==='unknown-route')?'partial-unplanned':'scheduled',globalFeasibility:'unknown',scheduledCount:tasks.length-missing,unplannedCount:missing,orders,tasks,globalFindings:structuredClone(findings.filter(f=>!f.taskIds?.length)),scope:structuredClone(plan.ruleSnapshot?.checkScope||conditions.checkScope||null),unknown:tasks.filter(t=>t.reasons.some(r=>r.classification==='unknown')).map(t=>t.id),unresolved:['最大等待、动态释放、跨批取整及未批准的阶段语义'],unsupported:['AC21执行事实、保护时段及异常重排尚未实现；无产品质量事实推断'],limits:['未排与构造搜索失败不代表全局业务无解','候选日期不是已安排日期；缺失数量/日期保持未知','建议需修改模拟输入并另开计算，不保证得到可行结果','完成、可交付与附条件质量/效期评估分别见保存的交付报告']};
}
export function resultCsv(run,plan){
 const report=plan?.resultAssessment;
 const rows=[['FR024 运行结果与原因'],['运行编号',run?.id||plan?.runId||'未知'],['输入版本',run?.inputVersionId||plan?.inputVersionId||'未知'],['快照',run?.snapshotHash||plan?.snapshotHash||'未知'],['运行状态',JSON.stringify(resultState(run||{status:'unknown'},report))],['结果报告',report?JSON.stringify(report):run&&!run.planId?'本次无已保存结果；未使用当前输入生成任务或补算原因':'历史结果原因未知；未使用当前输入补算'],['交付评估',plan?.deliveryAssessment?JSON.stringify(plan.deliveryAssessment):'未知']];
 return rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
