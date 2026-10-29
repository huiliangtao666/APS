import {sourceRefs} from './problem-records.mjs';
/** FR-002 structural validation only. This deliberately does not convert or round quantities. */
export function validateMasterData({ products = [], materials = [], orders = [], routes = [], dependencies = [] }, original = {}) {
  const findings = [];
  const source=(table,rows,field)=>({table,field,relatedRecords:sourceRefs(table,rows,original[table]||({products,materials,orders,routes,dependencies})[table])});
  const checkRows = (rows, idField, label, required, table) => {
    const seen = new Set();
    rows.forEach((row, index) => {
      const id = (row[idField] || '').trim();
      const prefix = `${label}第 ${index + 1} 行`;
      if (!id) findings.push({ code: 'INPUT / MASTER_REQUIRED', ...source(table,[row],idField), message: `${prefix}缺少${idField}` });
      else if (seen.has(id)) findings.push({ code: 'INPUT / MASTER_DUPLICATE', ...source(table,rows.filter(r=>(r[idField]||'').trim()===id),idField), message: `${label}编号 ${id} 重复` });
      else seen.add(id);
      for (const field of required) if (!(row[field] || '').trim()) findings.push({ code: 'INPUT / MASTER_REQUIRED', ...source(table,[row],field), message: `${prefix}（${id || '编号空'}）缺少${field}` });
    });
    return seen;
  };
  const productIds = checkRows(products, '产品编号', '产品', ['产品名称', '单支净重kg', '每袋支数', '总收率', '模拟交付等待分钟'], 'products');
  const materialIds = checkRows(materials, '物料编号', '物料', ['物料名称', '单位', '类别'], 'materials');
  const numeric = (rows, fields, label, table) => rows.forEach((row, index) => fields.forEach(([field, allowZero]) => {
    const raw = (row[field] || '').trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
      findings.push({ code: 'INPUT / MASTER_VALUE', ...source(table,[row],field), message: `${label}第 ${index + 1} 行 ${field} 必须为${allowZero ? '非负' : '大于零'}数值` });
    }
  }));
  numeric(products, [['单支净重kg', false], ['每袋支数', false], ['总收率', false], ['模拟交付等待分钟', true]], '产品', 'products');
  const referencedProducts = [
    ...orders.map((r, i) => ({ id: (r['产品编号'] || '').trim(), where: `订单第 ${i + 1} 行`, ...source('orders',[r],'产品编号') })),
    ...routes.map((r, i) => ({ id: (r['产品编号'] || '').trim(), where: `工艺路线第 ${i + 1} 行`, ...source('routes',[r],'产品编号') })),
  ];
  for (const ref of referencedProducts) {
    if (!ref.id) findings.push({ code: 'INPUT / PRODUCT_REFERENCE', table:ref.table,field:ref.field,relatedRecords:ref.relatedRecords,missingTarget:{table:'products',field:'产品编号',key:ref.id}, message: `${ref.where}缺少产品编号` });
    else if (!productIds.has(ref.id)) findings.push({ code: 'INPUT / PRODUCT_REFERENCE', table:ref.table,field:ref.field,relatedRecords:ref.relatedRecords,missingTarget:{table:'products',field:'产品编号',key:ref.id}, message: `${ref.where}引用未配置的产品 ${ref.id}` });
  }
  dependencies.forEach((row, index) => {
    if (row['资源类型'] === '物料') {
      const id = (row['资源编号'] || '').trim();
      if (!id) findings.push({ code: 'INPUT / MATERIAL_REFERENCE', ...source('dependencies',[row],'资源编号'),missingTarget:{table:'materials',field:'物料编号',key:id}, message: `工序资源依赖第 ${index + 1} 行缺少物料编号` });
      else if (!materialIds.has(id)) findings.push({ code: 'INPUT / MATERIAL_REFERENCE', ...source('dependencies',[row],'资源编号'),missingTarget:{table:'materials',field:'物料编号',key:id}, message: `工序资源依赖第 ${index + 1} 行引用未配置的物料 ${id}` });
    }
  });
  return findings;
}
