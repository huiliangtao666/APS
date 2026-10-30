export const TOOL_FIELDS = ['工装编码','工装名称','适用任务','可用数量','每任务需求数量','提前占用分钟','后延占用分钟','是否启用','说明'];

export function toolDiagnostics(rows) {
  const issues = [];
  const seen = new Set();
  rows.forEach((row, index) => {
    const line = index + 2;
    const add=(message,field,members=[index])=>issues.push({message,field,index,members});
    const code = (row['工装编码'] || '').trim();
    if (!code) add(`第 ${line} 行：工装编码必填`,'工装编码');
    else if (seen.has(code)) add(`第 ${line} 行：工装编码 ${code} 重复`,'工装编码',rows.flatMap((r,i)=>(r['工装编码']||'').trim()===code?[i]:[]));
    else seen.add(code);
    if (!(row['工装名称'] || '').trim()) add(`第 ${line} 行：工装名称必填`,'工装名称');
    if (!(row['适用任务'] || '').trim()) add(`第 ${line} 行：适用任务必填（使用工序编号，多个值以 | 分隔）`,'适用任务');
    for (const field of ['可用数量', '每任务需求数量']) {
      const value = Number(row[field]);
      if (!Number.isInteger(value) || value < 1) add(`第 ${line} 行：${field} 必须为大于 0 的整数`,field);
    }
    for (const field of ['提前占用分钟', '后延占用分钟']) {
      const value = Number(row[field]);
      if (row[field] === '' || !Number.isInteger(value) || value < 0) add(`第 ${line} 行：${field} 必须为大于等于 0 的整数`,field);
    }
    if (!['是', '否'].includes(row['是否启用'] || '')) add(`第 ${line} 行：是否启用只能为“是”或“否”`,'是否启用');
  });
  return issues;
}

export const validateTools=rows=>toolDiagnostics(rows).map(d=>d.message);
