import {productionYield} from './workbook-bom-profile.mjs';
import {verifyPackAmounts} from './verify-pack-batch.mjs';
import {verifyWorkingWindows} from './verify-working-windows.mjs';
import {quantityMath as Q,calculateMaterialDemand,remainingExecutionDemand,feedTime} from './material-allocation.mjs';
import {minuteMode,minuteInstant,validateMinuteValidity} from './minute-validity.mjs';
import {inventoryBusinessDate} from './inventory.mjs';
import {resolveExpectedSupply} from './expected-supply.mjs';
// Fixed-output verification: no planner, preview, allocator or candidate search.
// Demand formulas are shared; lot eligibility, conservation and cumulative usage
// are recomputed from frozen sources, never from the ledger's remaining/quality labels.
export function verifyJointConditions(plan,data,conditions){
 try{return verifyFixed(plan,data,conditions);}catch(e){return ['冻结联合条件无法复核：'+e.message];}
}
function verifyFixed(plan,data,conditions){
 if(!data||!Array.isArray(data.rules))return ['缺少冻结输入/规则，不能完成联合复核'];
 if(plan.jointConditionsContract!==conditions.jointConditionsContract)return ['联合条件冻结契约缺失/不符'];
 const issues=verifyWorkingWindows(plan,data,conditions),add=m=>issues.push(m),tasks=plan.tasks||[],rows=plan.materialDemands||[];
 const at=conditions.ruleEvaluationAt,enabled=id=>data.rules.some(r=>r['规则编号']===id&&r['是否启用']==='是'&&conditions.enabledRuleIds.includes(id)&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at)));
 if(conditions.jointConditionsContract!=='FR022-joint-v1')return ['未知联合条件契约，不能完成复核'];
 const material=enabled('MATERIAL');let policy=null;
 try{if(material)policy=JSON.parse(data.rules.find(r=>r['规则编号']==='MATERIAL')['参数JSON']);}catch{add('冻结物料策略无效');}
 if(material!==!!plan.materialChecked)add('物料采用标志与冻结启用条件不一致');
 const used=new Map(),uses=new Map(),seen=new Set();
 const sum=(map,key,amount)=>map.set(key,Q.add(map.get(key)||Q.zero,amount));
 for(const c of data.executionMaterials||[])sum(used,'inventory:'+c['批次编号'],Q.q(c['累计已用数量']));
 const supplies=resolveExpectedSupply(data.supplies||[],data.supplyDelays||[]);
 for(const task of tasks){
  const fact=(data.executionFacts||[]).find(f=>f['订单编号']===task.orderId&&f['工序编号']===task.operation);
  if(fact?.['状态']==='已完成')continue; // Historical facts are not new commitments.
  const machine=data.machines.find(m=>m['设备编号']===task.machine&&m['工序编号']===task.operation);
  const dep=data.dependencies.find(d=>d['订单编号']===task.orderId&&d['工序编号']===task.operation&&d['资源类型']==='设备');
  if(!machine||!dep||dep['资源编号']!==task.machine)add(`${task.id} 设备与冻结依赖不符`);
  const calendar=machine?.['日历编号']?.trim()||data.calendars?.[0]?.['日历编号'];
  const windows=(data.calendars||[]).filter(c=>c['日历编号']===calendar&&c['是否工作']==='是').map(c=>[Number(c['起始分钟']),Number(c['结束分钟'])]).sort((a,b)=>a[0]-b[0]);
  let covered=task.start;
  for(const [start,end] of windows)if(start<=covered&&end>covered)covered=end;
  if((data.calendars||[]).some(c=>c['日历编号']===calendar&&c['是否工作']!=='是'&&Number(c['起始分钟'])<task.end&&Number(c['结束分钟'])>task.start))add(`${task.id} 与冻结非工作日历重叠`);
  if(covered<task.end)add(`${task.id} 完整机器区间未被冻结工作日历覆盖`);
  if((data.downtime||[]).some(d=>d['设备编号']===task.machine&&Number(d['起始分钟'])<task.end&&Number(d['结束分钟'])>task.start))add(`${task.id} 与冻结设备停机重叠`);
  if(!material||!policy)continue;
  try{
   const order=data.orders.find(o=>o['订单编号']===task.orderId);
   let batchKg=null;
   if(task.productionBatchId){
    // Derive equal split from original order, yield and route capacity, never
    // accept a smaller self-reported batch quantity as a reduced material need.
    if(order['数量单位']!=='kg')throw Error('生产批单位不受支持');
    const product=data.products.find(p=>p['产品编号']===order['产品编号']);
    const remaining=Q.sub(Q.q(order['合格需求']),Q.q(order['已完成合格数量']||'0'));
    const route=data.routes.filter(r=>r['产品编号']===order['产品编号']);
    const pair=route.some(r=>String(r['最大等待分钟']??'').trim()!=='');
    const maxima=route.map(r=>{const dep=data.dependencies.find(d=>d['订单编号']===order['订单编号']&&d['工序编号']===r['工序编号']&&d['资源类型']==='设备');const m=data.machines.find(m=>m['设备编号']===dep?.['资源编号']),max=Q.q(m['最大装载kg']);return m['装载计量基准']==='合格产出'?Q.div(max,productionYield(data,product['产品编号'])):max;});
    const maximum=maxima.reduce((a,b)=>Q.min(a,b)),count=Number(Q.ceil(Q.div(Q.div(remaining,productionYield(data,product['产品编号'])),maximum)).n);
    batchKg=Q.exact(Q.div(remaining,Q.q(count)));
    if(!Number.isSafeInteger(task.productionBatchIndex)||task.productionBatchIndex<1||task.productionBatchIndex>count||task.productionBatchId!==JSON.stringify([task.orderId,task.productionBatchIndex])||Q.cmp(Q.fromExact(task.exactQuantity),Q.fromExact(batchKg))!==0n||task.quantity!==Q.num(Q.fromExact(batchKg)))add(`${task.id} 生产批成员身份/均分数量与冻结订单及装载上限不符`);
   }
   const expected=task.productionBatchId?calculateMaterialDemand(data,order,task.operation,task.start,batchKg):remainingExecutionDemand(data,order,task.operation,task.start);
   const amounts=task.productionBatchId?verifyPackAmounts(data,order,task.operation,task.start,batchKg,task.productionBatchIndex):null;
   if(amounts)for(const d of expected)if(amounts.has(d.materialId)){const value=amounts.get(d.materialId);d.quantity=Q.num(value);d.exactQuantity=Q.exact(value);}
   const saved=rows.filter(r=>r.taskId===task.id&&r.committed);
   if(saved.length!==expected.length)add(`${task.id} 已排任务物料需求覆盖不完整`);
   for(const demand of expected){
    const matches=saved.filter(r=>r.materialId===demand.materialId&&r.unit===demand.unit&&r.version===demand.version);
    if(matches.length!==1){add(`${task.id}/${demand.materialId} 物料需求缺失/重复`);continue;}
    const row=matches[0];seen.add(row);
    if(row.feedMinute!==task.start||Q.cmp(Q.fromExact(row.exactQuantity),Q.fromExact(demand.exactQuantity))!==0n||row.quantity!==Q.num(Q.fromExact(demand.exactQuantity))||Q.cmp(Q.fromExact(row.exactShortage),Q.zero)!==0n||row.shortage!==0)add(`${task.id}/${demand.materialId} 冻结需求量或投料时点不符/存在缺口`);
    let allocated=Q.zero;
    for(const a of row.allocations||[]){
     const amount=Q.fromExact(a.exactQuantity);allocated=Q.add(allocated,amount);
     if(Q.cmp(amount,Q.zero)<=0n||a.quantity!==Q.num(amount))add(`${task.id}/${demand.materialId} 分配数量无效`);
     const key=(a.conditional?'supply:':'inventory:')+(a.conditional?a.supplyId:a.lotId);
     const source=a.conditional?supplies.find(s=>s['供给编号']===a.supplyId):(data.inventory||[]).find(s=>s['批次编号']===a.lotId);
     const date=inventoryBusinessDate(feedTime(task.start));
     if(!source||source['物料编号']!==demand.materialId||source['批次编号']!==a.lotId||(!minuteMode(source)?source['有效期']<date:validateMinuteValidity(source).length>0||Date.parse(feedTime(task.start))>Date.parse(minuteInstant(source['时间原点'],source['到期分钟']))||Date.parse(feedTime(task.start))===Date.parse(minuteInstant(source['时间原点'],source['到期分钟']))&&source['到期边界']==='截止前')){add(`${task.id}/${a.lotId} 分配来源/效期不符`);continue;}
     if(a.conditional){
      if(!policy['允许预计供给']||!policy['预计状态'].includes(source['质量状态'])||Date.parse(source['生效可用时间'])>Date.parse(feedTime(task.start)))add(`${task.id}/${a.lotId} 条件供给未就绪`);
      const candidates=(data.supplyUses||[]).filter(u=>u['订单编号']===task.orderId&&u['工序编号']===task.operation&&u['供给编号']===a.supplyId);
      const limit=candidates.reduce((s,u)=>Q.add(s,Q.q(u['使用数量'])),Q.zero),useKey=JSON.stringify([task.orderId,task.operation,a.supplyId]);sum(uses,useKey,amount);
      if(!candidates.length||Q.cmp(uses.get(useKey),limit)>0n)add(`${task.id}/${a.lotId} 超出显式供给引用量`);
     }else if(!policy['可用状态'].includes(source['质量状态'])||source['预计可用时间']&&Date.parse(source['预计可用时间'])>Date.parse(feedTime(task.start)))add(`${task.id}/${a.lotId} 库存质量/就绪时点不满足`);
     sum(used,key,amount);
     const capacity=a.conditional?Q.sub(Q.q(source['预计数量']),Q.q(source['已占用数量']||'0')):Q.sub(Q.q(source['账面数量']),Q.q(source['已占用数量']));
     if(Q.cmp(used.get(key),capacity)>0n)add(`${a.lotId} 累计分配超出冻结可用量`);
     const remaining=Q.sub(capacity,used.get(key));
     if(a.remaining!==Q.num(remaining)||a.exactRemaining&&Q.cmp(Q.fromExact(a.exactRemaining),remaining)!==0n)add(`${a.lotId} 剩余物料数量与独立累计账不符`);
    }
    if(Q.cmp(allocated,Q.fromExact(demand.exactQuantity))!==0n)add(`${task.id}/${demand.materialId} 需求与分配不守恒`);
   }
  }catch(e){add(`${task.id} 无法重建冻结物料需求：${e.message}`);}
 }
 for(const row of rows.filter(r=>r.committed))if(!seen.has(row))add(`${row.taskId}/${row.materialId} 无已排任务需求的物料提交`);
 return issues;
}
