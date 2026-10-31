import {sourceRefs} from './problem-records.mjs';
/** FR-011: simulated supply never becomes on-hand stock or a receipt confirmation. */
export const PLAN_TIME_ORIGIN = '2026-11-02T08:00:00+08:00';
const value = (row, key) => String(row[key] ?? '').trim();
// Require an explicit offset so browser locale cannot change imported business time.
export function validSupplyTime(raw) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return false;
  const [date, time] = raw.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  return calendar.toISOString().slice(0, 10) === date && Number(time.slice(0, 2)) < 24 && Number(time.slice(3, 5)) < 60 && Number.isFinite(Date.parse(raw));
}
export function validateExpectedSupply({ supplies = [], delays = [], uses = [], materials = [], orders = [], routes = [] } = {}) {
  const findings = [];
  let table='supplies', current=null, currentField='关联配置';
  const originals={supplies,supplyDelays:delays,supplyUses:uses,orders,routes,materials};
  const refs=(t,rows)=>sourceRefs(t,rows,originals[t]);
  const add = (code, message, relatedRecords=refs(table,current?[current]:[]), field=currentField, missingTarget) => findings.push({code:`SUPPLY_${code}`,message,table,row:current?originals[table].indexOf(current)+2:0,field,relatedRecords,...(missingTarget?{missingTarget}:{})});
  const ids = new Set(), lots = new Set(), delayIds = new Set(), useIds = new Set();
  const materialIds = new Set(materials.map(r => value(r, '物料编号')));
  const byId = new Map(supplies.map(r => [value(r, '供给编号'), r]));
  const required = (row, fields, label) => fields.forEach(f => { if (!value(row, f)) add('REQUIRED', `${label}缺少${f}`,undefined,f); });
  const unique = (id, seen, label, key, field) => { if (id && seen.has(id)) add('DUPLICATE', `${label} ${id} 重复`,refs(table,originals[table].filter(r=>key(r)===id)),field); seen.add(id); };
  const positive = (raw, label) => { if (!raw || !Number.isFinite(Number(raw)) || Number(raw) <= 0) add('QUANTITY', `${label}须为正有限数值`); };
  const times = (row, arrival, ready, label) => {
    for (const f of [arrival, ready]) if (!validSupplyTime(value(row, f))) add('TIME', `${label} ${f}须为带时区的有效 ISO 日期时间`,undefined,f);
    if (Date.parse(row[ready]) < Date.parse(row[arrival])) add('READY', `${label}预计可用时间不能早于预计到达`,undefined,ready);
  };
  supplies.forEach((row, i) => {
    table='supplies';current=row;currentField='预计数量';
    const label = `预计供给第 ${i + 1} 行`, id = value(row, '供给编号');
    required(row, ['供给编号', '物料编号', '批次编号', '预计数量', '预计到达时间', '预计可用时间'], label);
    unique(id, ids, '供给编号',r=>value(r,'供给编号'),'供给编号');
    unique(`${value(row, '物料编号')}/${value(row, '批次编号')}`, lots, '物料/批次',r=>`${value(r,'物料编号')}/${value(r,'批次编号')}`,'物料编号 / 批次编号');
    if (!materialIds.has(value(row, '物料编号'))) add('MATERIAL', `${label}引用未配置物料`,undefined,'物料编号',{table:'materials',key:value(row,'物料编号')});
    if(value(row,'有效期')){const d=new Date(row['有效期']+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(row['有效期'])||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==row['有效期'])add('EXPIRY',label+'有效期须为有效日历日期',undefined,'有效期');}
    positive(value(row, '预计数量'), label + '预计数量');
    times(row, '预计到达时间', '预计可用时间', label);
  });
  const delayTimeKeys = new Set();
  delays.forEach((row, i) => {
    table='supplyDelays';current=row;currentField='记录时间';
    const label = `延期模拟第 ${i + 1} 行`;
    required(row, ['记录编号', '供给编号', '记录时间', '调整后到达时间', '调整后可用时间', '原因'], label);
    unique(value(row, '记录编号'), delayIds, '延期记录编号',r=>value(r,'记录编号'),'记录编号');
    if (!byId.has(value(row, '供给编号'))) add('REFERENCE', `${label}引用不存在的供给`,undefined,'供给编号',{table:'supplies',key:value(row,'供给编号')});
    if (!validSupplyTime(value(row, '记录时间'))) add('TIME', `${label}记录时间须为带时区的有效 ISO 日期时间`);
    times(row, '调整后到达时间', '调整后可用时间', label);
    unique(`${value(row, '供给编号')}/${Date.parse(row['记录时间'])}`, delayTimeKeys, '同一供给记录时点',r=>`${value(r,'供给编号')}/${Date.parse(r['记录时间'])}`,'供给编号 / 记录时间');
  });
  for (const supply of supplies) {
    let baseline=supply, baselineTable='supplies';
    let arrival = Date.parse(supply['预计到达时间']), ready = Date.parse(supply['预计可用时间']);
    for (const row of delays.filter(r => value(r, '供给编号') === value(supply, '供给编号')).sort((a, b) => Date.parse(a['记录时间']) - Date.parse(b['记录时间']))) {
      table='supplyDelays';current=row;currentField='调整后到达时间 / 调整后可用时间';
      const nextArrival = Date.parse(row['调整后到达时间']), nextReady = Date.parse(row['调整后可用时间']);
      if (nextArrival < arrival || nextReady < ready) add('DELAY', `延期记录 ${row['记录编号']}不能提前到达或可用时间`,[...refs('supplyDelays',[row]),...refs(baselineTable,[baseline])]);
      arrival = nextArrival; ready = nextReady; baseline=row;baselineTable='supplyDelays';
    }
  }
  const totals = new Map(), members=new Map();
  uses.forEach((row, i) => {
    table='supplyUses';current=row;currentField='使用数量';
    const label = `计划供给引用第 ${i + 1} 行`, id = value(row, '供给编号');
    required(row, ['引用编号', '订单编号', '工序编号', '供给编号', '使用数量'], label);
    unique(value(row, '引用编号'), useIds, '供给引用编号',r=>value(r,'引用编号'),'引用编号');
    const order = orders.find(r => value(r, '订单编号') === value(row, '订单编号'));
    if (!order) add('ORDER', `${label}引用不存在的订单`,undefined,'订单编号',{table:'orders',key:value(row,'订单编号')});
    else if (!routes.some(r => value(r, '产品编号') === value(order, '产品编号') && value(r, '工序编号') === value(row, '工序编号'))) add('OPERATION', `${label}引用订单路线中不存在的工序`,[...refs('supplyUses',[row]),...refs('orders',[order])],'工序编号',{table:'routes',key:value(order,'产品编号')+'/'+value(row,'工序编号')});
    if (!byId.has(id)) add('REFERENCE', `${label}引用不存在的供给`,undefined,'供给编号',{table:'supplies',key:value(row,'供给编号')});
    positive(value(row, '使用数量'), label + '使用数量');
    members.set(id,[...(members.get(id)||[]),row]);
    totals.set(id, (totals.get(id) || 0) + Number(row['使用数量']));
  });
  totals.forEach((amount, id) => { if (amount > Number(byId.get(id)?.['预计数量'])) {table='supplies';current=byId.get(id);add('OVERALLOCATED', `供给 ${id} 计划使用总量超过预计数量`,[...refs('supplies',[current]),...refs('supplyUses',members.get(id))],'预计数量 / 使用数量');} });
  return findings;
}
export function resolveExpectedSupply(supplies = [], delays = []) {
  return supplies.map(supply => {
    const history = delays.filter(r => value(r, '供给编号') === value(supply, '供给编号')).sort((a, b) => Date.parse(a['记录时间']) - Date.parse(b['记录时间']));
    const last = history.at(-1);
    return { ...supply, '生效到达时间': last?.['调整后到达时间'] || supply['预计到达时间'], '生效可用时间': last?.['调整后可用时间'] || supply['预计可用时间'], '延期记录': history.map(r => ({ ...r })), '供给性质': '条件性预计供给（未确认到货）' };
  });
}
export function supplyEarliestMinute(orderId, operation, supplies = [], uses = []) {
  const needed = uses.filter(r => value(r, '订单编号') === orderId.trim() && value(r, '工序编号') === operation.trim());
  return Math.max(0, ...needed.map(use => {
    const supply = supplies.find(r => value(r, '供给编号') === value(use, '供给编号'));
    return Math.ceil((Date.parse(supply?.['生效可用时间']) - Date.parse(PLAN_TIME_ORIGIN)) / 60000);
  }));
}
export function buildSupplyConditions(tasks = [], supplies = [], uses = []) {
  return uses.filter(use => tasks.some(t => t.orderId.trim() === value(use, '订单编号') && t.operation.trim() === value(use, '工序编号'))).map(use => {
    const supply = supplies.find(r => value(r, '供给编号') === value(use, '供给编号'));
    return { ...use, ...supply, '订单编号': value(use, '订单编号'), '工序编号': value(use, '工序编号'), '引用编号': value(use, '引用编号'), '条件说明': `条件性供给：${use['供给编号']} / 批次 ${supply?.['批次编号']} / ${use['使用数量']}；预计到达 ${supply?.['生效到达时间']}，预计可用 ${supply?.['生效可用时间']}。须按期到达且满足可用条件；未确认真实到货。` };
  });
}
export function exportSupplyPlanCsv(plan) {
  const rows = [['任务编号', '订单编号', '产品编号', '工序编号', '设备编号', '开始分钟', '结束分钟', '工时分钟', '前序任务', '供给条件','物料检查','物料需求与批次分配（含未排）','生产批编号','资源批编号','合格数量kg','精确合格数量','投入装载kg','精确投入装载','拆合批检查','联合资源检查','联合资源占用','任务时间因果','订单完成与交期影响','交付评估范围','联合候选与保守回退','装载口径','加工冷却完整路线复核','程序编号','加工冷却契约']];
  for (const t of plan.tasks) rows.push([t.id, t.orderId, t.productId, t.operation, t.machine, t.start, t.end, t.duration, t.predecessor, (plan.supplyConditions || []).filter(c => value(c, '订单编号') === t.orderId.trim() && value(c, '工序编号') === t.operation.trim()).map(c => c['条件说明']).join('；'),plan.materialChecked?'已检查（支持口径）':'物料未检查',JSON.stringify((plan.materialDemands||[]).filter(r=>r.taskId===t.id)),t.productionBatchId,t.resourceBatchId,t.quantity,JSON.stringify(t.exactQuantity),t.loadKg,JSON.stringify(t.exactLoadKg),plan.batchChecked?'已检查（支持口径）':'拆合批/程序未检查',JSON.stringify(plan.jointResourceChecks||{}),JSON.stringify((plan.resourceReservations||[]).filter(r=>r.taskIds.includes(t.id))),JSON.stringify(t.timingReasons||[]),JSON.stringify(plan.deliveryAssessment?.orders.find(o=>o.orderId===t.orderId)||null),JSON.stringify(plan.deliveryAssessment?{...plan.deliveryAssessment,orders:undefined,taskCompletions:undefined}:null),JSON.stringify((plan.jointAttempts||[]).filter(a=>(a.taskIds||[]).includes(t.id))),t.loadBasis||'',JSON.stringify(plan.processRouteVerification||null),t.program||'',plan.processRouteContract||'' ]);
  for(const r of plan.materialDemands||[])if(!r.committed)rows.push([r.taskId,r.orderId,r.productId,r.operation,'','','','','','',plan.materialChecked?'已检查（未排候选，未占用）':'物料未检查',JSON.stringify(r)]);
  for(const o of plan.deliveryAssessment?.orders||[])if(!plan.tasks.some(t=>t.orderId===o.orderId)){const row=Array(rows[0].length).fill('');row[1]=o.orderId;row[2]=o.productId;row[rows[0].indexOf('订单完成与交期影响')]=JSON.stringify(o);row[rows[0].indexOf('交付评估范围')]=JSON.stringify({...plan.deliveryAssessment,orders:undefined,taskCompletions:undefined});rows.push(row);}
  if(plan.workingWindowsContract){const row=Array(rows[0].length).fill('');row[0]='P06工作窗口冻结契约';row[rows[0].indexOf('联合候选与保守回退')]=plan.workingWindowsContract+'；完整单窗；半开区间；不跨班拼接';rows.push(row);}
  for(const a of (plan.jointAttempts||[]).filter(a=>a.outcome==='unscheduled'||a.outcome==='horizon')){const row=Array(rows[0].length).fill('');row[0]=a.taskIds.join('；');row[rows[0].indexOf('联合候选与保守回退')]=JSON.stringify(a);rows.push(row);}
  return rows.map(row => row.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
}
