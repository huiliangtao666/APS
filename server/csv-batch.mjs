import {packTimeFields} from '../src/lib/pack-batch.mjs';
import {minuteValidityFields} from '../src/lib/minute-validity.mjs';
import {validateR21Config,r21OrderIds} from '../src/lib/r21-stage-config.mjs';
import {parseInputCsvRecords} from '../src/lib/input-csv.mjs';
import {originalDependencyDef,runtimeDependencyFile} from '../src/lib/original-dependencies.mjs';
import {jointParameters} from '../src/lib/joint-policy.mjs';
// The isolated prototype used these same table keys, but older field shapes.
// Reuse physical-record parsing/inspection; actual runtime defs are authoritative.
import {batchKeys} from '../src/lib/csv-contract.mjs';
export {batchKeys};
export const optionalFields={times:packTimeFields,bom:['最小包装单位'],machines:['不足批处理'],inventory:minuteValidityFields,supplies:['已占用数量',...minuteValidityFields],resourceMappings:['字段权威JSON'],personnelGroups:['poolId'],orders:['已完成合格数量'],dependencies:['人员占用基准','人员检查顺序','人员配置来源','人员配置版本','人员岗位编号','候选人员组','所需班次','人员参与阶段','人员开始偏移','人员结束偏移','窗口外释放'],rules:['适用对象','生效时间']};
export function inspectCsvBatch(files,defs,repairs=[],r21Config=null,resourceRuleBinding=null){
 const tables={},sources={},issues=[],seen=new Set(),used=new Set();
 const entryFields=['是否允许拆分','需求类型','订单状态'];
 if(!Array.isArray(repairs)||repairs.length>30000)return {tables,sources,issues:[{file:'17_生产订单与交期.csv',row:1,field:'补录',reason:'补录格式无效',severity:'error'}]};
 const add=(file,row,field,reason,extra={})=>issues.push({file,row,field,reason,message:reason,severity:'error',...extra});
 for(const file of files){
  let def=defs.find(d=>d.file===file.name&&batchKeys.includes(d.key));
  if(file.name===runtimeDependencyFile)def=defs.find(d=>d.key==='dependencies');
  // Exact original headers select literal storage. A malformed/mixed runtime
  // contract still follows normal unknown/missing-header rejection.
  if(def?.key==='dependencies'&&file.name!==runtimeDependencyFile){
   try{const h=parseInputCsvRecords(file.text,{whitespace:true}).find(r=>r.cells.some(c=>c.trim()))?.cells.map(h=>h.trim());
    if(h?.length===originalDependencyDef.fields.length&&originalDependencyDef.fields.every(f=>h.includes(f)))def=defs.find(d=>d.key==='originalDependencies');
   }catch{/* Normal parser below reports the physical error. */}
  }
  if(!def){add(file.name,1,'文件','不属于当前支持的批导类别；请使用现行中文文件名及模板');continue;}
  if(seen.has(def.key)){add(file.name,1,'文件','同一批次包含重复表');continue;}seen.add(def.key);
  let raw;try{raw=parseInputCsvRecords(file.text,{whitespace:true}).filter(r=>r.cells.some(c=>c.trim()));}catch(e){add(file.name,e.line||1,'CSV 格式',e.message);continue;}
  if(raw.length<1){add(file.name,1,'表头','CSV 必须包含契约表头；未启用类别可只有表头');continue;}
  const headers=raw[0].cells.map(h=>h.trim()),headerLine=raw[0].line;
  const before=issues.length,legacy=def.key==='orders'&&headers.includes('合格需求kg');
  headers.forEach((h,i)=>{if(headers.indexOf(h)!==i)add(file.name,headerLine,h,'表头重复');if(!def.fields.includes(h)&&!(legacy&&h==='合格需求kg'))add(file.name,headerLine,h,h==='合格需求kg'?'旧原型字段；请显式填写现行合格需求、数量单位，不自动转换':'未知字段，须使用现行模板');});
  if(legacy&&headers.some(h=>['合格需求','数量单位'].includes(h)))add(file.name,headerLine,'合格需求kg','原字段与现行数量/单位并存，含义冲突；请明确采用一种表头');
  def.fields.filter(f=>!(legacy&&['合格需求','数量单位',...entryFields].includes(f))&&!(optionalFields[def.key]||[]).includes(f)&&!headers.includes(f)).forEach(f=>add(file.name,headerLine,f,'缺少契约字段'));
  if(issues.length!==before)continue;
  sources[def.key]={file:file.name,lines:raw.slice(1).map(r=>r.line),headers,originalText:file.text,records:raw.slice(1).map(r=>({line:r.line,values:Object.fromEntries(headers.map((h,i)=>[h,r.cells[i]??'']))})),mappings:legacy?[{sourceField:'合格需求kg',quantityField:'合格需求',unitField:'数量单位',unit:'kg'}]:[],repairs:[]};
  if(r21Config&&def.key==='orders'){
   const configIssues=validateR21Config(r21Config,{complete:true});
   for(const f of configIssues)add(file.name,1,f.field||'六项配置',f.message||f.code);
   const ids=raw.slice(1).map(r=>r.cells[headers.indexOf('订单编号')]);
   if(ids.length!==2||r21OrderIds.some(id=>ids.filter(x=>x===id).length!==1))add(file.name,1,'订单编号','配置补录须精确包含唯一 A/B 订单，不接受未知或重复身份');
   if(!legacy||entryFields.some(f=>headers.includes(f))||repairs.some(e=>e?.file===file.name))add(file.name,1,'补录','六项配置只用于原17缺失列；禁止与现行值或手工补录混用');
   if(issues.length!==before)continue;
   sources[def.key].r21Configuration=structuredClone(r21Config);
  }
  tables[def.key]=raw.slice(1).map(({cells,line},index)=>{
   if(cells.length!==headers.length)add(file.name,line,'整行',`列数 ${cells.length} 与表头 ${headers.length} 不一致`,{table:def.key,index});
   const row=Object.fromEntries(def.fields.map(f=>[f,headers.includes(f)?(['originalDependencies','originalInventory','originalSupply','originalProgress','originalEvents','originalBom','originalTools','originalPersonnel','resourceMappings','stageMappings'].includes(def.key)?(cells[headers.indexOf(f)]||''):(cells[headers.indexOf(f)]||'').trim()):'']));
   if(legacy){row['合格需求']=(cells[headers.indexOf('合格需求kg')]||'').trim();row['数量单位']='kg';}
   for(let n=0;n<repairs.length;n++){const e=repairs[n];if(e&&e.file===file.name&&e.row===line&&def.key==='orders'&&entryFields.includes(e.field)&&!headers.includes(e.field)&&typeof e.value==='string'){
    if(sources[def.key].repairs.some(p=>p.row===line&&p.field===e.field)){add(file.name,line,e.field,'重复补录',{table:def.key,index});continue;}
    row[e.field]=e.value.trim();used.add(n);sources[def.key].repairs.push({row:line,field:e.field,value:e.value});
   }}
   if(r21Config&&def.key==='orders'){for(const f of entryFields){const entry=r21Config.values[row['订单编号']][f];row[f]=entry.value;sources[def.key].repairs.push({row:line,field:f,value:entry.value,source:structuredClone(entry.source),configRevision:r21Config.revision});}}
   if(legacy)for(const f of entryFields)if(!row[f])add(file.name,line,f,'必填：请逐行显式补录后重新预览；原文件未提供，不设默认值',{table:def.key,index});
   const required=def.key==='orders'?['合格需求']:def.key==='times'&&row['计算方式']==='固定'?['固定分钟']:def.key==='rules'?['是否启用']:[];
   for(const f of required)if(!row[f])add(file.name,line,f,'必填，待补充；不把空白值视为 0',{table:def.key,index});
   if(def.key==='dependencies'&&!headers.includes('窗口外释放')&&row['资源类型']==='人员技能')row['窗口外释放']='是';
   return row;
  });
 }
 repairs.forEach((e,n)=>{if(!used.has(n))add(typeof e?.file==='string'?e.file:'补录',Number.isInteger(e?.row)?e.row:1,typeof e?.field==='string'?e.field:'补录','无效补录：仅允许原订单缺失字段的物理行显式值');});
 if(resourceRuleBinding!==null){
  const b=resourceRuleBinding,rows=tables.rules?.filter(r=>r['规则编号']==='MOLD'),source=sources.rules;
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).sort().join(',')!=='contract,reference'||b.contract!=='CR-DEC02-03-v1'||typeof b.reference!=='string'||!b.reference.trim()||b.reference.length>512||rows?.length!==1||rows[0]['参数JSON']!=='{}')add(source?.file||'16_排程规则配置.csv',1,'参数JSON','显式原16适配须引用CR-DEC02-03-v1及依据，并精确包含一条MOLD空对象原参数；不覆盖现行或未知参数');
  else {const index=tables.rules.indexOf(rows[0]);source.resourceRuleBinding={...structuredClone(b),row:source.lines[index],sourceValue:'{}',runtimeValue:structuredClone(jointParameters)};rows[0]['参数JSON']=JSON.stringify(jointParameters);}
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
