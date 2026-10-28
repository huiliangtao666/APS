/** FR-003 validates versioned BOM records without inferring yield, loss, or conversion rules. */
export function validateBomConfig({ products = [], materials = [], routes = [], bom = [] }) {
  const findings = [];
  const productIds = new Set(products.map(row => (row['产品编号'] || '').trim()).filter(Boolean));
  const materialById = new Map(materials.map(row => [(row['物料编号'] || '').trim(), row]));
  const routeKeys = new Set(routes.map(row => `${(row['产品编号'] || '').trim()}\u0000${(row['工序编号'] || '').trim()}`));
  const versionDates = new Map();
  const lines = new Set();
  bom.forEach((row, index) => {
    const prefix = `BOM第 ${index + 1} 行`;
    const version = (row['版本编号'] || '').trim();
    const product = (row['产品编号'] || '').trim();
    const effective = (row['生效日期'] || '').trim();
    const operation = (row['投料工序编号'] || '').trim();
    const material = (row['物料编号'] || '').trim();
    const type = (row['用量类型'] || '').trim();
    const qty = (row['配置用量'] || '').trim();
    const unit = (row['用量单位'] || '').trim();
    const basis = (row['用量基准'] || '').trim();
    const required = [['版本编号',version],['产品编号',product],['生效日期',effective],['投料工序编号',operation],['用量类型',type],['物料编号',material],['配置用量',qty],['用量单位',unit],['用量基准',basis]];
    for (const [field, value] of required) if (!value) findings.push({code:'INPUT / BOM_REQUIRED',message:`${prefix}缺少${field}`});
    if (effective && !/^\d{4}-\d{2}-\d{2}$/.test(effective)) findings.push({code:'INPUT / BOM_DATE',message:`${prefix}生效日期须为 YYYY-MM-DD`});
    else if (effective) { const date = new Date(`${effective}T00:00:00Z`); if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== effective) findings.push({code:'INPUT / BOM_DATE',message:`${prefix}生效日期不是有效日历日期`}); }
    if (qty && (!Number.isFinite(Number(qty)) || Number(qty) <= 0)) findings.push({code:'INPUT / BOM_QUANTITY',message:`${prefix}配置用量必须为大于零的数值`});
    if (type && !['BOM物料','包装物料'].includes(type)) findings.push({code:'INPUT / BOM_TYPE',message:`${prefix}用量类型须为 BOM物料 或 包装物料`});
    if (product && !productIds.has(product)) findings.push({code:'INPUT / BOM_PRODUCT_REFERENCE',message:`${prefix}引用未配置的产品 ${product}`});
    if (material && !materialById.has(material)) findings.push({code:'INPUT / BOM_MATERIAL_REFERENCE',message:`${prefix}引用未配置的物料 ${material}`});
    if (product && operation && !routeKeys.has(`${product}\u0000${operation}`)) findings.push({code:'INPUT / BOM_OPERATION_REFERENCE',message:`${prefix}产品 ${product} 没有投料工序 ${operation}`});
    if (material && unit && materialById.has(material) && unit !== (materialById.get(material)['单位'] || '').trim()) findings.push({code:'INPUT / BOM_UNIT_MISMATCH',message:`${prefix}用量单位“${unit}”与物料 ${material} 主数据单位“${materialById.get(material)['单位']}”不一致；不会换算`});
    const versionKey = `${product}\u0000${version}`;
    if (product && version && effective) {
      if (versionDates.has(versionKey) && versionDates.get(versionKey) !== effective) findings.push({code:'INPUT / BOM_VERSION_DATE',message:`产品 ${product} 的 BOM 版本 ${version} 出现多个生效日期`});
      else versionDates.set(versionKey, effective);
    }
    const lineKey = `${product}\u0000${version}\u0000${operation}\u0000${material}`;
    if (product && version && operation && material) { if (lines.has(lineKey)) findings.push({code:'INPUT / BOM_LINE_DUPLICATE',message:`${prefix}产品/版本/工序/物料组合重复`}); lines.add(lineKey); }
  });
  return findings;
}
