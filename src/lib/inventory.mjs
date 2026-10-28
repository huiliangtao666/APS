/** FR-010 inventory accounting and availability rules. Quantities stay in the material's configured unit. */
export const DEFAULT_USABLE_QUALITY_STATUSES = ['合格'];

export function validateInventoryBatches(batches = [], materials = []) {
  const findings = [];
  const ids = new Set();
  const materialIds = new Set(materials.map(row => (row['物料编号'] || '').trim()).filter(Boolean));
  batches.forEach((batch, index) => {
    const prefix = `库存批次第 ${index + 1} 行`;
    const id = (batch['批次编号'] || '').trim();
    if (!id) findings.push({ code: 'INVENTORY_REQUIRED', message: `${prefix}缺少批次编号` });
    else if (ids.has(id)) findings.push({ code: 'INVENTORY_DUPLICATE', message: `批次编号 ${id} 重复` });
    ids.add(id);
    for (const field of ['物料编号', '有效期', '位置', '质量状态']) {
      if (!(batch[field] || '').trim()) findings.push({ code: 'INVENTORY_REQUIRED', message: `${prefix}（${id || '编号空'}）缺少${field}` });
    }
    if (materialIds.size && batch['物料编号'] && !materialIds.has(batch['物料编号'].trim())) findings.push({ code: 'INVENTORY_MATERIAL', message: `${prefix}引用未配置的物料 ${batch['物料编号']}` });
    for (const field of ['账面数量', '已占用数量']) {
      const raw = (batch[field] || '').trim();
      const amount = Number(raw);
      if (!raw || !Number.isFinite(amount) || amount < 0) findings.push({ code: 'INVENTORY_AMOUNT', message: `${prefix} ${field} 必须为非负数值` });
    }
    const quantity = Number(batch['账面数量']);
    const reserved = Number(batch['已占用数量']);
    if (Number.isFinite(quantity) && Number.isFinite(reserved) && reserved > quantity) findings.push({ code: 'INVENTORY_RESERVED', message: `${prefix}已占用数量不能大于账面数量` });
    if (batch['有效期'] && !/^\d{4}-\d{2}-\d{2}$/.test(batch['有效期'])) findings.push({ code: 'INVENTORY_EXPIRY', message: `${prefix}有效期须使用 YYYY-MM-DD` });
    else if (batch['有效期'] && Number.isNaN(Date.parse(`${batch['有效期']}T00:00:00Z`))) findings.push({ code: 'INVENTORY_EXPIRY', message: `${prefix}有效期不是有效日期` });
    const ready = batch['预计可用时间'] || '';
    if (ready && Number.isNaN(Date.parse(ready))) findings.push({ code: 'INVENTORY_READY', message: `${prefix}预计可用时间须为有效日期时间` });
  });
  return findings;
}

export function getUsableQualityStatuses(rules = []) {
  const rule = rules.find(row => row['规则编号'] === 'INVENTORY');
  if (!rule) return DEFAULT_USABLE_QUALITY_STATUSES;
  try {
    const configured = JSON.parse(rule['参数JSON'] || '{}')['可用质量状态'];
    return Array.isArray(configured) ? configured.filter(value => typeof value === 'string') : DEFAULT_USABLE_QUALITY_STATUSES;
  } catch { return DEFAULT_USABLE_QUALITY_STATUSES; }
}

export function queryInventoryAvailability(batches = [], { materialId = '', asOf = new Date().toISOString(), rules = [] } = {}) {
  const at = Date.parse(asOf);
  const date = Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : String(asOf).slice(0, 10);
  const usableStatuses = getUsableQualityStatuses(rules);
  return batches.filter(batch => !materialId || batch['物料编号'] === materialId).map(batch => {
    const onHand = Number(batch['账面数量']) || 0;
    const reserved = Number(batch['已占用数量']) || 0;
    const readyAt = batch['预计可用时间'] ? Date.parse(batch['预计可用时间']) : -Infinity;
    const expiry = batch['有效期'] || '';
    const available = usableStatuses.includes(batch['质量状态']) && (!expiry || expiry >= date) && (!Number.isFinite(at) || readyAt <= at);
    return { ...batch, '当前可用数量': available ? Math.max(0, onHand - reserved) : 0, '账面数量': onHand, '已占用数量': reserved };
  });
}
