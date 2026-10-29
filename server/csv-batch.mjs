import {parseInputCsvRecords} from '../src/lib/input-csv.mjs';
// The isolated prototype used these same table keys, but older field shapes.
// Reuse physical-record parsing/inspection; actual runtime defs are authoritative.
export const batchKeys=['orders','routes','times','machines','dependencies','rules'];
export const optionalFields={orders:['已完成合格数量'],dependencies:['候选人员组','所需班次','人员参与阶段','人员开始偏移','人员结束偏移','窗口外释放'],rules:['适用对象','生效时间']};
export function inspectCsvBatch(files,defs){
 const tables={},sources={},issues=[],seen=new Set();
 const add=(file,row,field,reason,extra={})=>issues.push({file,row,field,reason,message:reason,severity:'error',...extra});
 for(const file of files){
  const def=defs.find(d=>d.file===file.name&&batchKeys.includes(d.key));
  if(!def){add(file.name,1,'文件','不属于当前批导六表；请使用现行中文文件名及模板');continue;}
  if(seen.has(def.key)){add(file.name,1,'文件','同一批次包含重复表');continue;}seen.add(def.key);
  let raw;try{raw=parseInputCsvRecords(file.text,{whitespace:true}).filter(r=>r.cells.some(c=>c.trim()));}catch(e){add(file.name,e.line||1,'CSV 格式',e.message);continue;}
  if(raw.length<2){add(file.name,1,'表头','CSV 必须包含表头和至少一行数据');continue;}
  const headers=raw[0].cells.map(h=>h.trim()),headerLine=raw[0].line;
  const before=issues.length;
  headers.forEach((h,i)=>{if(headers.indexOf(h)!==i)add(file.name,headerLine,h,'表头重复');if(!def.fields.includes(h))add(file.name,headerLine,h,h==='合格需求kg'?'旧原型字段；请显式填写现行合格需求、数量单位，不自动转换':'未知字段，须使用现行模板');});
  def.fields.filter(f=>!(optionalFields[def.key]||[]).includes(f)&&!headers.includes(f)).forEach(f=>add(file.name,headerLine,f,'缺少契约字段'));
  if(issues.length!==before)continue;
  sources[def.key]={file:file.name,lines:raw.slice(1).map(r=>r.line),headers};
  tables[def.key]=raw.slice(1).map(({cells,line},index)=>{
   if(cells.length!==headers.length)add(file.name,line,'整行',`列数 ${cells.length} 与表头 ${headers.length} 不一致`,{table:def.key,index});
   const row=Object.fromEntries(def.fields.map(f=>[f,headers.includes(f)?(cells[headers.indexOf(f)]||'').trim():'']));
   const required=def.key==='orders'?['合格需求']:def.key==='times'&&row['计算方式']==='固定'?['固定分钟']:def.key==='rules'?['是否启用']:[];
   for(const f of required)if(!row[f])add(file.name,line,f,'必填，待补充；不把空白值视为 0',{table:def.key,index});
   if(def.key==='dependencies'&&!headers.includes('窗口外释放')&&row['资源类型']==='人员技能')row['窗口外释放']='是';
   return row;
  });
 }
 return {tables,sources,issues};
}
export function physicalIssues(issues,sources,defs){
 return issues.map(issue=>{
  const table=issue.table||defs.find(d=>d.file===issue.file)?.key,source=sources[table];
  const index=issue.row>=2?issue.row-2:null;
  return {...issue,table,index:source&&index!==null?index:undefined,file:source?.file||issue.file||defs.find(d=>d.key===table)?.file||'当前配置',row:source&&index!==null?source.lines[index]??0:issue.row||0,reason:issue.reason||issue.message||issue.code||'需检查关联配置',severity:issue.severity||'error',inBatch:!!source};
 });
}
