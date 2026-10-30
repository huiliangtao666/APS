import {quantityMath as Q} from './material-allocation.mjs';
// Fixed-output audit only: derive weights and waiting intervals from frozen rows.
// It neither groups batches nor calls the planner or resource allocator.
export function verifyBatchWait(plan,data,conditions=plan.conditions){
 if(!data||!conditions||conditions.mode==='minimal-r1')return {status:'not_checked',details:['缺少冻结支持模式输入；重量节点及等待未复核。'],findings:[]};
 const findings=[],tasks=plan.tasks||[];let checked=0;
 const add=(code,message,taskIds)=>findings.push({code,message,taskIds});
 for(const t of tasks){
  const route=data.routes.find(r=>r['产品编号']===t.productId&&r['工序编号']===t.operation);
  if(route?.['前序工序']&&route['最大等待分钟']?.trim()){
   checked++;
   const pre=tasks.find(p=>p.orderId===t.orderId&&p.operation===route['前序工序']&&p.productionBatchId===t.productionBatchId);
   const maximum=Number(route['最大等待分钟']);
   if(!pre||!Number.isFinite(maximum)||maximum<0)add('VERIFY / MAX_LAG',`${t.id} 缺少可核对的前序或有效最大等待`,[t.id]);
   else if(t.start-pre.end>maximum)add('VERIFY / MAX_LAG',`${t.id} 等待 ${t.start-pre.end} > ${maximum} 分钟，缺口 ${t.start-pre.end-maximum} 分钟`,[pre.id,t.id]);
  }
 }
 if(plan.batchChecked){
  const records=plan.productionBatches||[];
  for(const order of data.orders){
   const members=records.filter(m=>m.orderId===order['订单编号']);if(!members.length)continue;
   const product=data.products.find(p=>p['产品编号']===order['产品编号']);
   const expected=Q.sub(Q.q(order['合格需求']),Q.q(order['已完成合格数量']||'0'));
   const sum=members.reduce((s,m)=>Q.add(s,Q.fromExact(m.qualifiedKg)),Q.zero);checked++;
   if(Q.cmp(sum,expected)!==0n)add('VERIFY / BATCH_LOAD',`${order['订单编号']} 生产批合格量不守恒`,[]);
   for(const m of members)if(Q.cmp(Q.fromExact(m.inputKg),Q.div(Q.fromExact(m.qualifiedKg),Q.q(product['总收率'])))!==0n)add('VERIFY / BATCH_LOAD',`${m.id} 投入量与合格量/收率不一致`,[]);
  }
  for(const g of plan.resourceBatches||[]){
   const machine=data.machines.find(m=>m['设备编号']===g.machine),node=machine?.['装载计量基准'];
   const members=g.members.map(id=>records.find(m=>m.id===id));
   const linked=tasks.filter(t=>t.resourceBatchId===g.id);checked++;
   if(members.some(m=>!m)||new Set(g.members).size!==g.members.length||!['BOM总投入','合格产出'].includes(node)){add('VERIFY / BATCH_LOAD',`${g.id} 成员或设备重量节点无效`,linked.map(t=>t.id));continue;}
   const key=node==='合格产出'?'qualifiedKg':'inputKg';
   const weight=members.reduce((s,m)=>Q.add(s,Q.fromExact(m[key])),Q.zero);
   if(g.basis!==node||Q.cmp(Q.fromExact(g.exactLoadKg),weight)!==0n||g.loadKg!==Q.num(weight))add('VERIFY / BATCH_LOAD',`${g.id} 资源批重量与冻结设备 ${node} 不一致`,linked.map(t=>t.id));
   if(g.status==='scheduled'&&(Q.cmp(weight,Q.q(machine['最小装载kg']))<0n||Q.cmp(weight,Q.q(machine['最大装载kg']))>0n||linked.length!==members.length))add('VERIFY / BATCH_LOAD',`${g.id} 已排重量超设备上下限或覆盖缺失`,linked.map(t=>t.id));
   for(const t of linked){const m=members.find(m=>m.id===t.productionBatchId);if(!m||Q.cmp(Q.fromExact(t.exactLoadKg),Q.fromExact(m[key]))!==0n||t.loadKg!==Q.num(Q.fromExact(m[key])))add('VERIFY / BATCH_LOAD',`${t.id} 任务装载与冻结设备节点不一致`,[t.id]);}
  }
 }
 return {status:findings.length?'problem':checked?'pass':'not_checked',details:findings.length?findings.map(f=>f.message):[checked?`按冻结路线、设备节点及原订单收率复核 ${checked} 项；未调用排程器。`:'无声明等待或批次可复核。'],findings};
}
