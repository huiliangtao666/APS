import {validateOriginalResources} from '../src/lib/original-resources.mjs';
import {validateFactoryLines} from '../src/lib/factory-lines.mjs';
import {validateBatchResources} from '../src/lib/batch-policy.mjs';
import { assessRules } from '../src/lib/business-rules.mjs';
import { validateMasterData } from '../src/lib/master-data.mjs';
import { validateProcessConfig } from '../src/lib/process-config.mjs';
import { validateSingleLineScope } from '../src/lib/line-scope.mjs';
import { validateOrders } from '../src/lib/orders.mjs';
import { validateBomConfig } from '../src/lib/bom-config.mjs';
import { validateInventoryBatches } from '../src/lib/inventory.mjs';
import { validateExpectedSupply } from '../src/lib/expected-supply.mjs';

import {validateExecution} from '../src/lib/execution-facts.mjs';
import {validateEvents} from '../src/lib/simulation-events.mjs';
import {recordKeys as keys} from '../src/lib/record-identity.mjs';
export {recordKeys} from '../src/lib/record-identity.mjs';
// Both imports and edits validate the complete proposed state, before any write.
export function validateInputs(defs,data,{at=new Date().toISOString(),checkPolicyExecution=true}={}){
 const issues=[...validateOriginalResources(data),...validateEvents(data),...validateFactoryLines(data)];
 const add=(table,index,field,message)=>issues.push({table,file:defs.find(d=>d.key===table).file,row:index+2,field,message});
 for(const def of defs){
  const seen=new Set();
  (data[def.key]||[]).forEach((r,i)=>{
   const required={machines:['设备名称','产线编号','日历编号','最小装载kg','最大装载kg','装载计量基准'],calendars:['工厂编号'],downtime:['原因']};
   for(const f of required[def.key]||[])if(!r[f]?.trim())add(def.key,i,f,'字段不能为空');
   for(const f of keys[def.key])if(!(def.key==='dependencies'&&(f==='人员岗位编号'||f==='人员参与阶段'||f==='资源编号'&&r['资源类型']==='人员技能'&&r['候选人员组']?.trim()))&&!r[f]?.trim())add(def.key,i,f,'唯一键字段不能为空');
   const key=JSON.stringify(keys[def.key].map(f=>r[f]?.trim()||''));
   if(seen.has(key))add(def.key,i,keys[def.key].join(' + '),'唯一键重复');seen.add(key);
   const numeric=def.fields.filter(f=>/分钟|数量|净重kg|每袋支数|总收率|装载kg|配置用量|合格需求|优先顺序|速度支每分钟|人员开始偏移|人员结束偏移/.test(f)&&f!=='数量单位');
   for(const f of numeric)if(r[f]?.trim()&&(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(r[f].trim())||!Number.isFinite(Number(r[f]))))add(def.key,i,f,'须为非负十进制数值，单位按字段名');
   if(['calendars','downtime','personnelGroups'].includes(def.key)){
    const start=def.key==='personnelGroups'?'可用起始分钟':'起始分钟',end=def.key==='personnelGroups'?'可用结束分钟':'结束分钟';
    if(!r[start]?.trim()||!r[end]?.trim()||!(Number(r[end])>Number(r[start])))add(def.key,i,end,'结束分钟须大于起始分钟');
   }
   if(def.key==='personnelGroups'&&(!r['人员组名称']?.trim()||!Number.isInteger(Number(r['人员数量']))||Number(r['人员数量'])<1))add(def.key,i,'人员数量','人员组须有名称及正整数人数');
   if(def.key==='machines'&&Number(r['最大装载kg'])<Number(r['最小装载kg']))add(def.key,i,'最大装载kg','最大装载不能小于最小装载');
   if(def.key==='orders'&&!['kg','支','袋','箱'].includes(r['数量单位']))add(def.key,i,'数量单位','支持 kg、支、袋、箱；不自动换算');
   if(def.key==='orders'&&!Number.isInteger(Number(r['优先顺序'])))add(def.key,i,'优先顺序','优先顺序须为整数');
   if(['rules','calendars'].includes(def.key)){
    const field=def.key==='rules'?'是否启用':'是否工作';if(!['是','否'].includes(r[field]))add(def.key,i,field,'仅接受是或否');
   }
   if(def.key==='rules'){
    if(!r['中文名称']?.trim())add(def.key,i,'中文名称','中文名称不能为空');
    try{const p=JSON.parse(r['参数JSON']||'{}');if(!p||Array.isArray(p)||typeof p!=='object')throw Error();}catch{add(def.key,i,'参数JSON','规则参数须为 JSON 对象');}
   }
  });
 }
 const ref=(table,field,target,targetField)=>{(data[table]||[]).forEach((r,i)=>{if(r[field]&&!(data[target]||[]).some(t=>t[targetField]===r[field]))add(table,i,field,`引用不存在的${targetField} ${r[field]}`);});};
 ref('machines','日历编号','calendars','日历编号');ref('downtime','设备编号','machines','设备编号');ref('routes','产品编号','products','产品编号');
 (data.dependencies||[]).forEach((r,i)=>{
  if(r['资源类型']==='人员技能'&&!r['候选人员组']?.trim()&&!(data.personnelGroups||[]).some(p=>p['人员组编号']===r['资源编号']))add('dependencies',i,'资源编号','引用不存在的人员组');
  if(r['资源类型']==='设备'&&!data.machines.some(m=>m['设备编号']===r['资源编号']&&m['工序编号']===r['工序编号']))add('dependencies',i,'资源编号','设备与工序不匹配');
 });
 const collect=(fallback,findings)=>{for(const f of findings){
  const aliases=[['supplyUses',/计划供给引用|供给引用编号/],['supplyDelays',/延期模拟|延期记录|同一供给记录时点/],['supplies',/预计供给|供给编号|物料\/批次|^供给 /],['dependencies',/工序资源依赖/],['times',/工序工时|工时重复|缺少工时配置|需配置正数固定分钟/],['machines',/设备资源|设备编号 /],['routes',/工艺路线|路线存在循环|引用不存在的前序工序/],['materials',/^物料第|^物料编号 /],['products',/^产品第/],['orders',/^订单第/]];
  const table=f.table||aliases.find(([,pattern])=>pattern.test(f.message))?.[0]||fallback;
  const def=defs.find(d=>d.key===table);
  const line=f.line||Number(f.message.match(/第\s*(\d+)\s*行/)?.[1]);
  const field=f.field||def.fields.find(x=>f.message.includes(x))||'关联配置';
  // Aggregate checks have no single source row; row 0 explicitly means table-level.
  issues.push({...f,table,file:def.file,row:f.row??(line?line+1:0),field});
 }};
 collect('orders',validateOrders(data.orders));collect('machines',validateSingleLineScope(data.orders,data.machines));collect('products',validateMasterData(data));collect('routes',validateProcessConfig(data));collect('bom',validateBomConfig(data));collect('inventory',validateInventoryBatches(data.inventory,data.materials));
 collect('supplies',validateExpectedSupply({supplies:data.supplies,delays:data.supplyDelays,uses:data.supplyUses,materials:data.materials,orders:data.orders,routes:data.routes}));
 collect('batchResources',validateBatchResources(data));
 issues.push(...validateExecution(data));
 issues.push(...assessRules(data,at,false,'supported',checkPolicyExecution).issues);
 return issues;
}
