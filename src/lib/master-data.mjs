import {sourceRefs} from './problem-records.mjs';
/** Structural checks plus explicit integer bags and capped ratio; no conversion. */
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
  // Compare decimal text exactly: Number() would round 1.0000000000000000001
  // to 1, admitting both fractional bags and yields over 100%.
  products.forEach((row, index) => {
    const check = (field, valid, message) => {
      if (!valid) findings.push({code:'INPUT / MASTER_VALUE', ...source('products',[row],field), message:`产品第 ${index+1} 行 ${field} ${message}`});
    };
    const bag = (row['每袋支数'] || '').trim();
    check('每袋支数', /^(?:\d+)(?:\.0*)?$/.test(bag) && /[1-9]/.test(bag.split('.')[0]), '须为正整数（支/袋），不接受小数支数，不自动取整');
    const rate = (row['总收率'] || '').trim();
    // Existing CSV stores a ratio: 0.96 = 96%, 1 = 100%; never infer % syntax.
    check('总收率', /^(?:0*\.\d*[1-9]\d*|0*1(?:\.0*)?)$/.test(rate), '须为大于0且不超过1的比例（1 = 100%），须显式配置');
  });

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
