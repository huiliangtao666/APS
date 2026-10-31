// CR-R21-UAT02-20261031. No customer values are inferred here.
export const r21Fields = Object.freeze({
  '是否允许拆分': ['是', '否'], '需求类型': ['正式订单', '预测'], '订单状态': ['有效', '已取消'],
});
export const r21OrderIds = ['A', 'B'];
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x);
const exact = (x, keys) => plain(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
export function partialR21Seed() {
  const values = Object.fromEntries(r21OrderIds.map(id => [id, Object.fromEntries(Object.keys(r21Fields).map(f => [f, null]))]));
  values.A['是否允许拆分'] = { value: '否', source: { kind: 'simulation', reference: 'CR-R21-UAT02-20261031 partial software seed; 模拟，非客户事实', version: 'seed-v1' } };
  values.B['需求类型'] = { value: '正式订单', source: { kind: 'simulation', reference: 'CR-R21-UAT02-20261031 partial software seed; 模拟，非客户事实', version: 'seed-v1' } };
  return { contract: 'R21-config-v1', revision: 0, values };
}
export function validateR21Config(config, { complete = false } = {}) {
  const issues = [];
  if (!exact(config, ['contract', 'revision', 'values']) || config.contract !== 'R21-config-v1' || !Number.isSafeInteger(config.revision) || config.revision < 0 || !exact(config.values, r21OrderIds)) return [{ code: 'R21_CONFIG_SHAPE', message: '仅支持 A/B 六项独立配置及明确版本' }];
  for (const id of r21OrderIds) {
    if (!exact(config.values[id], Object.keys(r21Fields))) { issues.push({ code: 'R21_CONFIG_SHAPE', orderId: id }); continue; }
    for (const [field, allowed] of Object.entries(r21Fields)) {
      const entry = config.values[id][field];
      const add = code => issues.push({ code, orderId: id, field, message: `${id} ${field}：待补充或来源/值无效；不设隐式默认值` });
      if (entry === null) { if (complete) add('R21_CONFIG_MISSING'); continue; }
      if (!exact(entry, ['value', 'source']) || !allowed.includes(entry.value)) { add('R21_CONFIG_VALUE'); continue; }
      const s = entry.source;
      if (!exact(s, ['kind', 'reference', 'version']) || !['simulation', 'user-supplied'].includes(s.kind) || !['reference', 'version'].every(k => typeof s[k] === 'string' && s[k].trim() && s[k].length <= 500)) add('R21_CONFIG_SOURCE');
    }
  }
  return issues;
}
export function configuredR21Orders(orders, config) {
  const issues = validateR21Config(config, { complete: true });
  for (const id of r21OrderIds) if (orders.filter(o => o['订单编号'] === id).length !== 1) issues.push({ code: 'R21_ORDER_IDENTITY', orderId: id });
  if (issues.length) return { valid: false, issues };
  return { valid: true, issues: [], orders: orders.map(o => r21OrderIds.includes(o['订单编号']) ? { ...o, ...Object.fromEntries(Object.entries(config.values[o['订单编号']]).map(([f, e]) => [f, e.value])) } : { ...o }), provenance: structuredClone(config) };
}
// This metadata stays outside the original CSV row, preserving all bytes/fields.
export function r21DeviceUsage(data, source) {
  const routeOps = new Set((data.routes || []).map(r => r['工序编号']));
  const refs = new Set((data.dependencies || []).filter(r => r['资源类型'] === '设备').map(r => r['资源编号']));
  return (data.machines || []).map((row, index) => ({
    machineId: row['设备编号'], index, row: structuredClone(row),
    usage: refs.has(row['设备编号']) ? 'referenced' : 'unused',
    operationInStageRoute: routeOps.has(row['工序编号']),
    source: source ? { file: source.file, sha256: source.sha256 || null, line: source.records?.[index]?.line ?? source.lines?.[index] ?? null, originalValues: structuredClone(source.records?.[index]?.values ?? null) } : null,
  }));
}
// Integration seam: only the unused-machine operation-in-route finding is
// permitted by D01. Duplicate IDs, bad fields, references and all other findings remain.
export function r21DevicePolicy(findings, data) {
  const unused = new Set(r21DeviceUsage(data).filter(m => m.usage === 'unused' && !m.operationInStageRoute).map(m => m.index));
  const permitted = [], blocking = [];
  for (const f of findings) {
    const index = f.index ?? (Number.isInteger(f.row) ? f.row - 2 : -1);
    const row = data.machines?.[index];
    const refs = f.relatedRecords || [];
    const bound = refs.length ? refs.some(r => r.table === 'machines' && JSON.stringify(r.row) === JSON.stringify(row)) : f.row === index + 2 && f.field === '工序编号';
    if (f.code === 'INPUT / MACHINE_OPERATION_REFERENCE' && f.table === 'machines' && unused.has(index) && bound) permitted.push({ ...f, severity: 'info', policy: 'CR-R21-UAT02-20261031:D01', message: '本阶段未使用设备保留导入；原字段和来源不变' });
    else blocking.push(f);
  }
  return { blocking, permitted, devices: r21DeviceUsage(data) };
}
