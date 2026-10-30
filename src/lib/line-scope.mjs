import {sourceRefs} from './problem-records.mjs';
/**
 * Enforces the confirmed P0 single-line boundary before scheduling.
 * Machines are resources owned by a line; multiple machines and operations
 * may belong to the same line.
 */
export function validateSingleLineScope(orders, machines, original={}) {
  const orderRows = Array.isArray(orders) ? orders : [];
  const machineRows = Array.isArray(machines) ? machines : [];
  const findings = [];
  const orderLines = [...new Set(orderRows.map((row) => String(row['产线编号'] ?? '').trim()).filter(Boolean))];
  const missingOrders = orderRows
    .filter((row) => !String(row['产线编号'] ?? '').trim())
    .map((row) => String(row['订单编号'] ?? '').trim() || '（未编号）');

  if (orderLines.length > 1) {
    findings.push({
      code: 'SCOPE / MULTI_LINE',
      message: `R1 仅支持单线计算；当前订单包含多条产线：${orderLines.join('、')}。请拆分为单线订单集后再计算。`,
      taskIds: [],
      relatedRecords: sourceRefs('orders', orderRows, original.orders||orderRows),
    });
  }
  if (missingOrders.length) {
    findings.push({
      code: 'INPUT / LINE_MISSING',
      message: `以下订单缺少产线编号：${missingOrders.join('、')}。请补齐后再运行单线计算。`,
      taskIds: [],
      relatedRecords: sourceRefs('orders', orderRows.filter(r=>!String(r['产线编号']??'').trim()),original.orders||orderRows),
    });
  }

  const configuredMachines = machineRows.filter((row) => String(row['设备编号'] ?? '').trim());
  const missingMachineLines = configuredMachines
    .filter((row) => !String(row['产线编号'] ?? '').trim())
    .map((row) => String(row['设备编号']).trim());
  if (missingMachineLines.length) {
    findings.push({
      code: 'INPUT / RESOURCE_LINE_MISSING',
      message: `以下设备资源缺少产线归属：${missingMachineLines.join('、')}。请补齐设备资源配置后再计算。`,
      taskIds: [],
      relatedRecords: sourceRefs('machines', configuredMachines.filter(r=>!String(r['产线编号']??'').trim()),original.machines||machineRows),
    });
  }

  const resourceLines = [...new Set(configuredMachines.map((row) => String(row['产线编号'] ?? '').trim()).filter(Boolean))];
  if (resourceLines.length > 1) {
    findings.push({
      code: 'SCOPE / RESOURCE_MULTI_LINE',
      message: `R1 仅允许一条排程产线；设备资源配置引用了多条产线：${resourceLines.join('、')}。`,
      taskIds: [],
      relatedRecords: sourceRefs('machines', configuredMachines,original.machines||machineRows),
    });
  }
  const orderLine = orderLines.length === 1 ? orderLines[0] : '';
  const otherResourceLines = orderLine ? resourceLines.filter((line) => line !== orderLine) : [];
  if (otherResourceLines.length) {
    findings.push({
      code: 'SCOPE / RESOURCE_LINE_MISMATCH',
      message: `订单排程产线为 ${orderLine}，但设备资源配置引用了其他产线：${otherResourceLines.join('、')}。请调整归属后再计算。`,
      taskIds: [],
      relatedRecords: [...sourceRefs('orders', orderRows, original.orders||orderRows), ...sourceRefs('machines', configuredMachines.filter(r=>otherResourceLines.includes(String(r['产线编号']??'').trim())),original.machines||machineRows)],
    });
  }
  return findings;
}
