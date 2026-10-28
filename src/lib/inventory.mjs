import { validRuleTime } from './business-rules.mjs';
/** FR-010 inventory accounting and availability rules. Quantities stay in the material's configured unit. */
export const DEFAULT_USABLE_QUALITY_STATUSES = ['合格'];

function validExpiry(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw;
}

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
    if (batch['物料编号'] && !materialIds.has(batch['物料编号'].trim())) findings.push({ code: 'INVENTORY_MATERIAL', message: `${prefix}引用未配置的物料 ${batch['物料编号']}` });
    for (const field of ['账面数量', '已占用数量']) {
      const raw = (batch[field] || '').trim();
      const amount = Number(raw);
      if (!raw || !Number.isFinite(amount) || amount < 0) findings.push({ code: 'INVENTORY_AMOUNT', message: `${prefix} ${field} 必须为非负数值` });
    }
    const quantity = Number(batch['账面数量']);
    const reserved = Number(batch['已占用数量']);
    if (Number.isFinite(quantity) && Number.isFinite(reserved) && reserved > quantity) findings.push({ code: 'INVENTORY_RESERVED', message: `${prefix}已占用数量不能大于账面数量` });
    if (batch['有效期'] && !validExpiry(batch['有效期'])) findings.push({ code: 'INVENTORY_EXPIRY', message: `${prefix}有效期须为有效日历日期 YYYY-MM-DD` });
    const ready = batch['预计可用时间'] || '';
    if (ready && Number.isNaN(Date.parse(ready))) findings.push({ code: 'INVENTORY_READY', message: `${prefix}预计可用时间须为有效日期时间` });
  });
  return findings;
}

export function getUsableQualityStatuses(rules = [], materialId = '', at = new Date().toISOString()) {
  const rule = rules.find(row => row['规则编号'] === 'INVENTORY');
  if (!rule || rule['是否启用']==='否' || (rule['适用对象'] && rule['适用对象']!=='*' && !rule['适用对象'].split(',').includes(materialId)) || (rule['生效时间'] && (!validRuleTime(rule['生效时间']) || Date.parse(rule['生效时间'])>Date.parse(at)))) return DEFAULT_USABLE_QUALITY_STATUSES;
  try {
    const configured = JSON.parse(rule['参数JSON'] || '{}')['可用质量状态'];
    return Array.isArray(configured) ? configured.filter(value => typeof value === 'string') : DEFAULT_USABLE_QUALITY_STATUSES;
  } catch { return DEFAULT_USABLE_QUALITY_STATUSES; }
}

export function queryInventoryAvailability(batches = [], { materialId = '', asOf = new Date().toISOString(), rules = [] } = {}) {
  const at = Date.parse(asOf);
  const date = Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : String(asOf).slice(0, 10);

  return batches.filter(batch => !materialId || batch['物料编号'] === materialId).map(batch => {
    const onHand = Number(batch['账面数量']) || 0;
    const reserved = Number(batch['已占用数量']) || 0;
    const readyAt = batch['预计可用时间'] ? Date.parse(batch['预计可用时间']) : -Infinity;
    const expiry = batch['有效期'] || '';
    const available = getUsableQualityStatuses(rules,batch['物料编号'],asOf).includes(batch['质量状态']) && (!expiry || (validExpiry(expiry) && expiry >= date)) && (!Number.isFinite(at) || readyAt <= at);
    return { ...batch, '当前可用数量': available ? Math.max(0, onHand - reserved) : 0, '账面数量': onHand, '已占用数量': reserved };
  });
}
