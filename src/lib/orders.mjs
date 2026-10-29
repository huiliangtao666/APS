import {sourceRefs} from './problem-records.mjs';
const required = ['订单编号', '产品编号', '合格需求', '数量单位', '要求可交付分钟', '优先顺序', '是否允许拆分', '产线编号', '需求类型', '订单状态'];

export function validateOrders(rows = []) {
  const issues = [];
  const seen = new Set();
  rows.forEach((row, index) => {
    const line = index + 1;
    const add=issue=>issues.push({...issue,table:'orders',row:index+2,relatedRecords:sourceRefs('orders',[row],rows)});
    for (const field of required) if (!String(row[field] ?? '').trim()) add({ code: 'ORDER_REQUIRED', line, field, message: `订单第 ${line} 行缺少${field}` });
    const id = String(row['订单编号'] ?? '').trim();
    if (id && seen.has(id)) issues.push({ table:'orders',row:index+2,relatedRecords:sourceRefs('orders',rows.filter(r=>String(r['订单编号']??'').trim()===id),rows),code: 'ORDER_DUPLICATE', line, field: '订单编号', message: `订单编号 ${id} 重复` });
    if (id) seen.add(id);
    const quantity = Number(row['合格需求']);
    if (row['合格需求'] !== '' && (!Number.isFinite(quantity) || quantity <= 0)) add({ code: 'ORDER_QUANTITY', line, field: '合格需求', message: `订单第 ${line} 行数量必须为正数` });
    if(row['已完成合格数量'] && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(row['已完成合格数量']) || !Number.isFinite(Number(row['已完成合格数量'])) || Number(row['已完成合格数量'])>quantity)) add({code:'ORDER_COMPLETED',line,field:'已完成合格数量',message:`订单第 ${line} 行已完成合格数量须为同数量单位的非负数且不超过需求；这是模拟累计完成量`});
    const priority = Number(row['优先顺序']);
    if (row['优先顺序'] !== '' && (!Number.isFinite(priority) || priority < 0)) add({ code: 'ORDER_PRIORITY', line, field: '优先顺序', message: `订单第 ${line} 行优先顺序必须为非负数` });
    const due = Number(row['要求可交付分钟']);
    if (row['要求可交付分钟'] !== '' && (!Number.isFinite(due) || due < 0)) add({ code: 'ORDER_DUE', line, field: '要求可交付分钟', message: `订单第 ${line} 行要求完成时间必须是非负分钟值` });
    if (!['是', '否'].includes(row['是否允许拆分'])) add({ code: 'ORDER_SPLIT', line, field: '是否允许拆分', message: `订单第 ${line} 行“是否允许拆分”只能为是或否` });
    if (!['正式订单', '预测'].includes(row['需求类型'])) add({ code: 'ORDER_TYPE', line, field: '需求类型', message: `订单第 ${line} 行需求类型只能为正式订单或预测` });
    if (!['有效', '已取消'].includes(row['订单状态'])) add({ code: 'ORDER_STATUS', line, field: '订单状态', message: `订单第 ${line} 行状态只能为有效或已取消` });
  });
  const lines = new Set(rows.map(r => String(r['产线编号'] ?? '').trim()).filter(Boolean));
  if (lines.size > 1) issues.push({ table:'orders',relatedRecords:sourceRefs('orders',rows),code: 'ORDER_MULTI_LINE', line: 0, field: '产线编号', message: 'P0 单次排程仅支持一条产线' });
  return issues;
}

export function appendOrderChange(history = [], orderId, field, before, after, changedAt = new Date().toISOString()) {
  if (before === after || !['合格需求', '数量单位', '要求可交付分钟'].includes(field)) return history;
  return [...history, { orderId, field, before, after, changedAt }];
}

export function isOrderSchedulable(order) {
  return order?.['订单状态'] !== '已取消';
}

// A cancel only affects future scheduling. Existing plan snapshots remain immutable history.
export function preserveStartedOrCompletedTasks(tasks = []) {
  return tasks.filter(task => ['进行中', '已完成'].includes(task.status));
}
