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
  const add = (code, message) => findings.push({ code: `SUPPLY_${code}`, message });
  const ids = new Set(), lots = new Set(), delayIds = new Set(), useIds = new Set();
  const materialIds = new Set(materials.map(r => value(r, '物料编号')));
  const byId = new Map(supplies.map(r => [value(r, '供给编号'), r]));
  const required = (row, fields, label) => fields.forEach(f => { if (!value(row, f)) add('REQUIRED', `${label}缺少${f}`); });
  const unique = (id, seen, label) => { if (id && seen.has(id)) add('DUPLICATE', `${label} ${id} 重复`); seen.add(id); };
  const positive = (raw, label) => { if (!raw || !Number.isFinite(Number(raw)) || Number(raw) <= 0) add('QUANTITY', `${label}须为正有限数值`); };
  const times = (row, arrival, ready, label) => {
    for (const f of [arrival, ready]) if (!validSupplyTime(value(row, f))) add('TIME', `${label} ${f}须为带时区的有效 ISO 日期时间`);
    if (Date.parse(row[ready]) < Date.parse(row[arrival])) add('READY', `${label}预计可用时间不能早于预计到达`);
  };
  supplies.forEach((row, i) => {
    const label = `预计供给第 ${i + 1} 行`, id = value(row, '供给编号');
    required(row, ['供给编号', '物料编号', '批次编号', '预计数量', '预计到达时间', '预计可用时间'], label);
    unique(id, ids, '供给编号');
    unique(`${value(row, '物料编号')}/${value(row, '批次编号')}`, lots, '物料/批次');
    if (!materialIds.has(value(row, '物料编号'))) add('MATERIAL', `${label}引用未配置物料`);
    positive(value(row, '预计数量'), label + '预计数量');
    times(row, '预计到达时间', '预计可用时间', label);
  });
  const delayTimeKeys = new Set();
  delays.forEach((row, i) => {
    const label = `延期模拟第 ${i + 1} 行`;
    required(row, ['记录编号', '供给编号', '记录时间', '调整后到达时间', '调整后可用时间', '原因'], label);
    unique(value(row, '记录编号'), delayIds, '延期记录编号');
    if (!byId.has(value(row, '供给编号'))) add('REFERENCE', `${label}引用不存在的供给`);
    if (!validSupplyTime(value(row, '记录时间'))) add('TIME', `${label}记录时间须为带时区的有效 ISO 日期时间`);
    times(row, '调整后到达时间', '调整后可用时间', label);
    unique(`${value(row, '供给编号')}/${Date.parse(row['记录时间'])}`, delayTimeKeys, '同一供给记录时点');
  });
  for (const supply of supplies) {
    let arrival = Date.parse(supply['预计到达时间']), ready = Date.parse(supply['预计可用时间']);
    for (const row of delays.filter(r => value(r, '供给编号') === value(supply, '供给编号')).sort((a, b) => Date.parse(a['记录时间']) - Date.parse(b['记录时间']))) {
      const nextArrival = Date.parse(row['调整后到达时间']), nextReady = Date.parse(row['调整后可用时间']);
      if (nextArrival < arrival || nextReady < ready) add('DELAY', `延期记录 ${row['记录编号']}不能提前到达或可用时间`);
      arrival = nextArrival; ready = nextReady;
    }
  }
  const totals = new Map();
  uses.forEach((row, i) => {
    const label = `计划供给引用第 ${i + 1} 行`, id = value(row, '供给编号');
    required(row, ['引用编号', '订单编号', '工序编号', '供给编号', '使用数量'], label);
    unique(value(row, '引用编号'), useIds, '供给引用编号');
    const order = orders.find(r => value(r, '订单编号') === value(row, '订单编号'));
    if (!order) add('ORDER', `${label}引用不存在的订单`);
    else if (!routes.some(r => value(r, '产品编号') === value(order, '产品编号') && value(r, '工序编号') === value(row, '工序编号'))) add('OPERATION', `${label}引用订单路线中不存在的工序`);
    if (!byId.has(id)) add('REFERENCE', `${label}引用不存在的供给`);
    positive(value(row, '使用数量'), label + '使用数量');
    totals.set(id, (totals.get(id) || 0) + Number(row['使用数量']));
  });
  totals.forEach((amount, id) => { if (amount > Number(byId.get(id)?.['预计数量'])) add('OVERALLOCATED', `供给 ${id} 计划使用总量超过预计数量`); });
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
  const rows = [['任务编号', '订单编号', '产品编号', '工序编号', '设备编号', '开始分钟', '结束分钟', '工时分钟', '前序任务', '供给条件']];
  for (const t of plan.tasks) rows.push([t.id, t.orderId, t.productId, t.operation, t.machine, t.start, t.end, t.duration, t.predecessor, (plan.supplyConditions || []).filter(c => value(c, '订单编号') === t.orderId.trim() && value(c, '工序编号') === t.operation.trim()).map(c => c['条件说明']).join('；')]);
  return rows.map(row => row.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
}
