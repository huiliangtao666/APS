export type CsvRow = Record<string, string>;
export type CsvDef = { key: string; file: string; fields: string[] };
export type CsvIssue = { file: string; row: number; field: string; reason: string };
export type CsvBatch = { tables: Record<string, CsvRow[]>; issues: CsvIssue[] };

export const r1Keys = ['orders', 'routes', 'times', 'machines', 'dependencies', 'rules'];

type ParsedCsvRow = { cells: string[]; line: number };

function parseCsvRecords(text: string): ParsedCsvRow[] {
  const rows: ParsedCsvRow[] = []; let row: string[] = []; let cell = ''; let quoted = false;
  let line = 1; let rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else { cell += c; if (c === '\n') line++; }
    }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push({ cells: row, line: rowLine }); row = []; cell = ''; line++; rowLine = line; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push({ cells: row, line: rowLine }); }
  return rows.filter(r => r.cells.some(c => c.trim()));
}

export function parseCsv(text: string): string[][] {
  return parseCsvRecords(text).map(r => r.cells);
}

const uniqueFields: Record<string, string[]> = {
  orders: ['订单编号'], routes: ['产品编号', '工序编号'], times: ['产品编号', '工序编号'],
  machines: ['设备编号'], dependencies: ['订单编号', '工序编号', '资源类型', '资源编号'], rules: ['规则编号'],
};
const numericFields: Record<string, string[]> = {
  orders: ['合格需求kg', '要求可交付分钟', '优先顺序'],
  routes: ['最大等待分钟'], times: ['固定分钟', '速度支每分钟'],
  machines: ['最小装载kg', '最大装载kg'],
  dependencies: ['需求数量', '提前占用分钟', '后延占用分钟'],
};

export function inspectBatch(files: Array<{ name: string; text: string }>, defs: CsvDef[], current: Record<string, CsvRow[]>): CsvBatch {
  const issues: CsvIssue[] = []; const defsByFile = new Map(defs.map(d => [d.file, d]));
  const tables: Record<string, CsvRow[]> = {};
  const tableLines: Record<string, number[]> = {};
  for (const file of files) {
    const def = defsByFile.get(file.name);
    if (!def || !r1Keys.includes(def.key)) { issues.push({ file: file.name, row: 1, field: '文件', reason: '不属于 R1 六类 CSV' }); continue; }
    if (tables[def.key]) { issues.push({ file: file.name, row: 1, field: '文件', reason: '同一批次包含重复表' }); continue; }
    const raw = parseCsvRecords(file.text); if (raw.length < 2) { issues.push({ file: file.name, row: 1, field: '表头', reason: 'CSV 必须包含表头和至少一行数据' }); continue; }
    const headers = raw[0].cells.map((h, i) => (i === 0 ? h.replace(/^\ufeff/, '') : h).trim());
    const duplicates = headers.filter((h, i) => headers.indexOf(h) !== i);
    for (const h of [...new Set(duplicates)]) issues.push({ file: file.name, row: 1, field: h, reason: '表头重复' });
    for (const field of def.fields) if (!headers.includes(field)) issues.push({ file: file.name, row: 1, field, reason: '缺少契约字段' });
    if (def.fields.some(f => !headers.includes(f)) || duplicates.length) continue;
    const records = raw.slice(1);
    const rows = records.map(({ cells, line }) => {
      if (cells.length !== headers.length) issues.push({ file: file.name, row: line, field: '整行', reason: `列数 ${cells.length} 与表头 ${headers.length} 不一致` });
      return Object.fromEntries(def.fields.map(f => [f, cells[headers.indexOf(f)]?.trim() ?? '']));
    });
    tables[def.key] = rows;
    tableLines[def.key] = records.map(record => record.line);
    rows.forEach((r, i) => {
      const rowNo = tableLines[def.key][i];
      for (const field of uniqueFields[def.key] || []) if (!r[field]?.trim()) issues.push({ file: file.name, row: rowNo, field, reason: '唯一键字段不能为空' });
      for (const field of numericFields[def.key] || []) {
        const value = r[field]?.trim(); if (!value) continue;
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) issues.push({ file: file.name, row: rowNo, field, reason: '必须是数值（单位按字段名）' });
      }
      if (def.key === 'orders' && !r['合格需求kg']?.trim()) issues.push({ file: file.name, row: rowNo, field: '合格需求kg', reason: '需求量必须大于 0 kg' });
      else if (def.key === 'orders' && Number(r['合格需求kg']) <= 0) issues.push({ file: file.name, row: rowNo, field: '合格需求kg', reason: '需求量必须大于 0 kg' });
      if (def.key === 'orders' && r['优先顺序'] && !Number.isInteger(Number(r['优先顺序']))) issues.push({ file: file.name, row: rowNo, field: '优先顺序', reason: '优先顺序必须为整数' });
      if (def.key === 'times' && r['计算方式'] === '固定' && !r['固定分钟']?.trim()) issues.push({ file: file.name, row: rowNo, field: '固定分钟', reason: '固定工时必须大于 0 分钟' });
      else if (def.key === 'times' && r['计算方式'] === '固定' && Number(r['固定分钟']) <= 0) issues.push({ file: file.name, row: rowNo, field: '固定分钟', reason: '固定工时必须大于 0 分钟' });
      if (def.key === 'rules' && !['是', '否'].includes(r['是否启用']?.trim())) issues.push({ file: file.name, row: rowNo, field: '是否启用', reason: '仅接受“是”或“否”' });
      if (def.key === 'rules' && r['参数JSON']) { try { JSON.parse(r['参数JSON']); } catch { issues.push({ file: file.name, row: rowNo, field: '参数JSON', reason: '不是有效 JSON' }); } }
    });
    for (const fields of uniqueFields[def.key] ? [uniqueFields[def.key]] : []) {
      const seen = new Set<string>(); rows.forEach((r, i) => { const key = fields.map(f => r[f]).join('\u0000'); if (fields.every(f => r[f]) && seen.has(key)) issues.push({ file: file.name, row: tableLines[def.key][i], field: fields.join(' + '), reason: '唯一键重复' }); seen.add(key); });
    }
  }
  const merged = { ...current, ...tables };
  const orderIds = new Set((merged.orders || []).map(r => r['订单编号']));
  const routeKeys = new Set((merged.routes || []).map(r => `${r['产品编号']}\u0000${r['工序编号']}`));
  const machineIds = new Map((merged.machines || []).map(r => [r['设备编号'], r['工序编号']]));
  const timeKeys = new Set((merged.times || []).map(r => `${r['产品编号']}\u0000${r['工序编号']}`));
  const check = (key: string, i: number, field: string, reason: string) => { const def = defs.find(d => d.key === key)!; issues.push({ file: def.file, row: tableLines[key]?.[i] ?? i + 2, field, reason }); };
  (merged.orders || []).forEach((o, i) => { if (o['产品编号'] && !(merged.routes || []).some(r => r['产品编号'] === o['产品编号'])) check('orders', i, '产品编号', '引用的产品没有工艺路线'); });
  (merged.routes || []).forEach((r, i) => {
    if (r['前序工序'] && !routeKeys.has(`${r['产品编号']}\u0000${r['前序工序']}`)) check('routes', i, '前序工序', '引用的前序工序不存在于同产品路线');
    if (!timeKeys.has(`${r['产品编号']}\u0000${r['工序编号']}`)) check('routes', i, '工序编号', '缺少匹配的产品/工序工时记录');
  });
  (merged.dependencies || []).forEach((d, i) => {
    if (d['订单编号'] && !orderIds.has(d['订单编号'])) check('dependencies', i, '订单编号', '引用的订单不存在');
    const order = (merged.orders || []).find(o => o['订单编号'] === d['订单编号']);
    if (order && !routeKeys.has(`${order['产品编号']}\u0000${d['工序编号']}`)) check('dependencies', i, '工序编号', '引用的工序不属于该订单产品路线');
    if (d['资源类型'] === '设备') {
      const op = machineIds.get(d['资源编号']); if (!machineIds.has(d['资源编号'])) check('dependencies', i, '资源编号', '引用的设备不存在');
      else if (op !== d['工序编号']) check('dependencies', i, '工序编号', '设备配置的工序与依赖工序不一致');
    }
  });
  const graph = new Map<string, string[]>(); (merged.routes || []).forEach(r => { const k = `${r['产品编号']}\u0000${r['工序编号']}`; graph.set(k, r['前序工序'] ? [`${r['产品编号']}\u0000${r['前序工序']}`] : []); });
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (node: string): boolean => { if (visiting.has(node)) return true; if (visited.has(node)) return false; visiting.add(node); const cycle = (graph.get(node) || []).some(visit); visiting.delete(node); visited.add(node); return cycle; };
  const cycles = [...graph.keys()].filter(visit);
  if (cycles.length) { const r = (merged.routes || []).find(x => cycles.includes(`${x['产品编号']}\u0000${x['工序编号']}`)); if (r) check('routes', (merged.routes || []).indexOf(r), '前序工序', '工艺路线存在循环引用'); }
  return { tables, issues };
}
