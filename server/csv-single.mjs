import {parseInputCsvRecords} from '../src/lib/input-csv.mjs';
// Preserve the existing single-table field contract and literal cell values.
// Source positions are metadata, never accepted from the browser as row numbers.
const optional={executionFacts:['累计报废数量','报废补做口径'],orders:['已完成合格数量'],bom:['损坏比例'],supplies:['质量状态','有效期'],dependencies:['所需班次','人员参与阶段','人员开始偏移','人员结束偏移','窗口外释放'],rules:['适用对象','生效时间'],tools:['可用起始分钟','可用结束分钟'],resourceClaims:['窗口开始偏移分钟','窗口结束偏移分钟','参数来源']};
const defaults={'窗口外释放':'是','可用起始分钟':'0','可用结束分钟':'525600','窗口开始偏移分钟':'0','窗口结束偏移分钟':'0','参数来源':'逐项声明'};
export function inspectSingleCsv(file,def){
 const tables={},sources={},issues=[];
 const add=(row,field,message)=>issues.push({table:def.key,file:file.name,row,field,message,reason:message,severity:'error',inBatch:true});
 let records;
 try{records=parseInputCsvRecords(file.text).filter(r=>r.cells.some(c=>c.trim()));}catch(e){add(e.line||1,'CSV 格式',e.message);return {tables,sources,issues};}
 if(records.length<2){add(records[0]?.line||1,'表头','CSV 需要表头和至少一行数据');return {tables,sources,issues};}
 const headers=records[0].cells.map(h=>h.trim()),headerLine=records[0].line;
 headers.forEach((h,i)=>{if(headers.indexOf(h)!==i)add(headerLine,h,'表头重复');if(!def.fields.includes(h))add(headerLine,h,'未知字段，须使用现行模板');});
 def.fields.filter(f=>!(optional[def.key]||[]).includes(f)&&!headers.includes(f)).forEach(f=>add(headerLine,f,'缺少契约字段'));
 sources[def.key]={file:file.name,lines:records.slice(1).map(r=>r.line),headers};
 if(issues.length)return {tables,sources,issues};
 tables[def.key]=records.slice(1).map(({cells,line})=>{
  if(cells.length!==headers.length)add(line,'整行',`列数 ${cells.length} 与表头 ${headers.length} 不一致`);
  return Object.fromEntries(def.fields.map(f=>[f,headers.includes(f)?cells[headers.indexOf(f)]||'':defaults[f]||'']));
 });
 return {tables,sources,issues};
}
