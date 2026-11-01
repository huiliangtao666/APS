import {minuteMode,minuteInstant,validateMinuteValidity} from './minute-validity.mjs';
import {sourceRefs} from './problem-records.mjs';
import { validRuleTime } from './business-rules.mjs';
import { validSupplyTime } from './expected-supply.mjs';
/** FR-010 inventory accounting and availability rules. Quantities stay in the material's configured unit. */
// v0.3 factory timezone Asia/Shanghai; inherited minute origin is +08:00.
export const inventoryBusinessDate = raw => new Date(Date.parse(raw)+8*60*60000).toISOString().slice(0,10);
export const DEFAULT_USABLE_QUALITY_STATUSES = ['合格'];
const decimal = raw => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(raw).trim()) && Number.isFinite(Number(raw));
const decimalDifference=(a,b)=>{
 const parse=v=>{const [whole,fraction='']=String(v).trim().split('.');return {n:BigInt((whole||'0')+fraction),scale:fraction.length};};
 const x=parse(a),y=parse(b),scale=Math.max(x.scale,y.scale);
 return {n:x.n*10n**BigInt(scale-x.scale)-y.n*10n**BigInt(scale-y.scale),scale};
};

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
    const add=(code,field,message,members=[batch])=>findings.push({code,table:'inventory',row:index+2,field,message,relatedRecords:sourceRefs('inventory',members,batches)});
    const prefix = `库存批次第 ${index + 1} 行`;
    const id = (batch['批次编号'] || '').trim();
    if (!id) add('INVENTORY_REQUIRED','批次编号',`${prefix}缺少批次编号`);
    else if (ids.has(id)) add('INVENTORY_DUPLICATE','批次编号',`批次编号 ${id} 重复`,batches.filter(r=>(r['批次编号']||'').trim()===id));
    ids.add(id);
    for (const field of ['物料编号', ...(minuteMode(batch)?[]:['有效期']), '位置', '质量状态']) {
      if (!(batch[field] || '').trim()) add('INVENTORY_REQUIRED',field,`${prefix}（${id || '编号空'}）缺少${field}`);
    }
    if (batch['物料编号'] && !materialIds.has(batch['物料编号'].trim())) add('INVENTORY_MATERIAL','物料编号',`${prefix}引用未配置的物料 ${batch['物料编号']}`);
    for (const field of ['账面数量', '已占用数量']) {
      const raw = (batch[field] || '').trim();
      const amount = Number(raw);
      if (!decimal(raw) || amount < 0) add('INVENTORY_AMOUNT',field,`${prefix} ${field} 必须为非负有限十进制数值`);
    }
    const quantity = Number(batch['账面数量']);
    const reserved = Number(batch['已占用数量']);
    const overReserved=decimal(batch['账面数量'])&&decimal(batch['已占用数量'])
      ? decimalDifference(batch['账面数量'],batch['已占用数量']).n<0n
      : Number.isFinite(quantity)&&Number.isFinite(reserved)&&reserved>quantity;
    if (overReserved) add('INVENTORY_RESERVED','已占用数量',`${prefix}已占用数量不能大于账面数量`);
    for(const message of validateMinuteValidity(batch))add('INVENTORY_EXPIRY','分钟时效',message);
    if (!minuteMode(batch) && batch['有效期'] && !validExpiry(batch['有效期'])) add('INVENTORY_EXPIRY','有效期',`${prefix}有效期须为有效日历日期 YYYY-MM-DD`);
    const ready = batch['预计可用时间'] || '';
    if (ready && !validSupplyTime(ready)) add('INVENTORY_READY','预计可用时间',`${prefix}预计可用时间须为带时区的有效日期时间`);
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

// The caller supplies the existing rule's allowed statuses; no new state mapping.
export function inventoryEligibility(batch, asOf, usableStatuses, {readyAt}={}) {
  const at=Date.parse(asOf), reasons=[];
  if(!Number.isFinite(at)) reasons.push('查询时点无效');
  if(!usableStatuses.includes(batch['质量状态'])) reasons.push('模拟质量状态不在本规则可用列表');
  if(minuteMode(batch)){
   reasons.push(...validateMinuteValidity(batch));
   try{const expiry=Date.parse(minuteInstant(batch['时间原点'],batch['到期分钟']));if(at>expiry||at===expiry&&batch['到期边界']==='截止前')reasons.push('已过显式分钟到期边界');}catch{}
  }else if(!validExpiry(batch['有效期']||'')) reasons.push('有效期无效');
  else if(Number.isFinite(at)&&batch['有效期']<inventoryBusinessDate(asOf)) reasons.push('已过有效期');
  const ready=readyAt||batch['预计可用时间'];
  if(ready&&(!validSupplyTime(ready)||Date.parse(ready)>at)) reasons.push('尚未到预计可用时间或时间无效');
  if(!decimal(batch['账面数量'])||!decimal(batch['已占用数量'])||decimalDifference(batch['账面数量'],batch['已占用数量']).n<0n) reasons.push('数量或占用无效');
  return {eligible:reasons.length===0,reasons};
}
// Decimal subtraction avoids 0.3 - 0.1 exposing 0.199999... as usable stock.
function netQuantity(a,b){
 const {n,scale}=decimalDifference(a,b);
 return Math.max(0,Number(n)/10**scale);
}
export function queryInventoryAvailability(batches = [], { materialId = '', asOf = new Date().toISOString(), rules = [] } = {}) {
  return batches.filter(batch => !materialId || batch['物料编号'] === materialId).map(batch => {
    const state=inventoryEligibility(batch,asOf,getUsableQualityStatuses(rules,batch['物料编号'],asOf));
    return { ...batch, '当前可用数量': state.eligible ? netQuantity(batch['账面数量'],batch['已占用数量']) : 0, '账面数量': Number(batch['账面数量']), '已占用数量': Number(batch['已占用数量']), '不可用原因':state.reasons.join('；') };
  });
}
