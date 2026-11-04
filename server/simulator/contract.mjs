import {createHash} from 'node:crypto';

export const VERSION = 'aps-independent-simulator@1';
export class SimulationError extends Error {
  constructor(code, path, message, status = 422) {
    super(message); Object.assign(this, {code, path, status});
  }
}
export function requireThat(ok, code, path, message, status) {
  if (!ok) throw new SimulationError(code, path, message, status);
}
export function canonical(value) {
  if (value === null || typeof value !== 'object') {
    requireThat(value !== undefined && (typeof value !== 'number' || Number.isFinite(value)),
      'INVALID_JSON', '', '不能保存未知值或非有限数');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
// Hash canonical tokens in bounded chunks. Native parameter archives can exceed
// 15MB: retaining their complete canonical string beside two detached source
// trees exhausts the fixed 192MiB import process. Sorted keys and scalar JSON
// spelling remain exactly those of canonical(), including its validation.
function writeCanonical(value,write) {
  if(value===null||typeof value!=='object'){write(canonical(value));return;}
  if(Array.isArray(value)){
    write('[');for(let i=0;i<value.length;i++){if(i)write(',');if(i in value)writeCanonical(value[i],write);}write(']');return;
  }
  write('{');let first=true;
  for(const key of Object.keys(value).sort()){
    if(!first)write(',');first=false;write(JSON.stringify(key));write(':');writeCanonical(value[key],write);
  }
  write('}');
}
export function fingerprint(value) {
  const h=createHash('sha256');let parts=[],length=0;
  const flush=()=>{if(parts.length)h.update(parts.join(''));parts=[];length=0;};
  writeCanonical(value,text=>{parts.push(text);length+=text.length;if(length>=16384)flush();});flush();
  return h.digest('hex');
}
// The copy has the same canonical object-key order and JSON scalar behavior,
// without allocating then parsing a second complete serialized model.
export function copy(value) {
  if(value===null||typeof value!=='object')return JSON.parse(canonical(value));
  if(Array.isArray(value)){
    // Preserve legacy rejection/normalization of sparse canonical array input.
    for(let i=0;i<value.length;i++)if(!(i in value))return JSON.parse(canonical(value));
    return value.map(copy);
  }
  const out={};for(const key of Object.keys(value).sort())Object.defineProperty(out,key,{value:copy(value[key]),enumerable:true,writable:true,configurable:true});return out;
}
export function id(value, path) {
  requireThat(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value),
    'INVALID_ID', path, '编号须为字母数字、短横或下划线，最长96字符'); return value;
}
export function minute(value, path = 'time') {
  requireThat(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:00(?:Z|[+-]\d\d:\d\d)$/.test(value),
    'MINUTE_REQUIRED', path, '时刻必须含时区并精确到整数分钟');
  const n = Date.parse(value) / 60000;
  requireThat(Number.isSafeInteger(n), 'INVALID_TIME', path, '无效时刻');
  const local = value.slice(0, 19), offset = value.endsWith('Z') ? 0 :
    (Number(value.slice(-5, -3)) * 60 + Number(value.slice(-2))) * (value.at(-6) === '-' ? -1 : 1);
  requireThat(new Date((n + offset) * 60000).toISOString().slice(0, 19) === local,
    'INVALID_TIME', path, '日期或分钟越界'); return n;
}
export function date(value, path = 'date') {
  requireThat(typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value), 'INVALID_DATE', path, '使用日历日期');
  minute(value + 'T00:00:00Z', path); return value;
}
export const nextDate = value => new Date(Date.parse(date(value) + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
export function atoms(value, material, path) {
  const n = value * material.scale;
  requireThat(typeof value === 'number' && Number.isFinite(value) && value >= 0 &&
    Number.isSafeInteger(Math.round(n)) && Math.abs(n - Math.round(n)) < 0.000001,
  'QUANTITY_PRECISION', path, '数量缺失、负数或不符合显式物料精度'); return Math.round(n);
}
export function amount(n, material) {
  requireThat(Number.isSafeInteger(n) && n >= 0, 'QUANTITY_OVERFLOW', material.id, '数量溢出或负库存');
  return n / material.scale;
}
export const gapDescriptions = {
  G01: 'Excel期初在制不是完整累计执行账', G02: 'Excel和CSV原点不同；负分钟不能截零',
  G03: '部分收货与净未收没有完整目标映射', G04: '发运和签收须独立履约账',
  G05: 'CSV扣耗前账面须证明同批次同谱系等价', G06: '完工、入库、放行和暂停处置分开',
  G07: '多时点日批尚未真实原子接纳', G08: '真实连接和持久目标回执未验证', G09: '迟报不倒改历史run',
};
