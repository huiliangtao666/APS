import {checkStageBindings,stageMappingNote} from './stage-bindings.mjs';
import {sourceRefs} from './problem-records.mjs';
// Literal v0.3 source records. These schemas do not invent runtime identities,
// date origins, material-unit conversions, fact allocation or event effects.
export const originalStageDefs=[
 {key:'originalInventory',label:'原13 库存来源（原文与显式绑定）',file:'13_物料库存批次.csv',fields:['批次编号','物料编号','库存kg或个','已占用kg或个','到达分钟','最早可用分钟','质量状态','到期分钟','共享范围']},
 {key:'originalSupply',label:'原14 到料来源（原文与显式绑定）',file:'14_预计到料与可用时间.csv',fields:['批次编号','物料编号','到料kg或个','已占用kg或个','到达分钟','最早可用分钟','质量状态','到期分钟','共享范围']},
 {key:'originalProgress',label:'原18 进度来源（原文与事实对账）',file:'18_模拟执行进度.csv',fields:['任务编号','状态','实际开始分钟','实际结束分钟','已用投入kg','说明']},
 {key:'originalEvents',label:'原19 变更来源（原文与事件绑定）',file:'19_模拟异常与条件变更.csv',fields:['事件编号','发生分钟','对象编号','变更字段','原值','新值','说明']},
];
export const originalStageNote=stageMappingNote;
export function validateOriginalStage(data){
 const issues=[];
 for(const def of originalStageDefs)(data[def.key]||[]).forEach((row,index)=>{
  const add=(field,message)=>issues.push({code:'ORIGINAL_SOURCE',table:def.key,file:def.file,row:index+2,field,message,relatedRecords:sourceRefs(def.key,[row],data[def.key])});
  // Optional cells remain literally unknown. Runtime admission, rather than a
  // guessed zero/date/status, handles incomplete source-to-model mappings.
  const required=def.key==='originalProgress'?['任务编号','状态']:def.key==='originalEvents'?['事件编号','发生分钟','对象编号','变更字段']:['批次编号','物料编号','质量状态','共享范围'];
  for(const f of required)if(!row[f]?.trim())add(f,'必填；未知值待补充，不设默认值');
  for(const f of def.fields.filter(f=>/分钟|kg或个|已用投入kg/.test(f))){const v=row[f]?.trim();if(v&&(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)||!Number.isFinite(Number(v))))add(f,'须为非负有限十进制原值，不推定单位或换算');}
  if(['originalInventory','originalSupply'].includes(def.key)){
   if(row['物料编号']&&!(data.materials||[]).some(r=>r['物料编号']===row['物料编号']))add('物料编号','引用不存在的物料编号');
   const qty=row[def.key==='originalInventory'?'库存kg或个':'到料kg或个']?.trim(),used=row['已占用kg或个']?.trim();if(qty&&used&&Number(used)>Number(qty))add('已占用kg或个','已占用数量不能大于同一原记录的数量');
  }
  if(def.key==='originalProgress'&&row['实际开始分钟']?.trim()&&row['实际结束分钟']?.trim()&&Number(row['实际结束分钟'])<Number(row['实际开始分钟']))add('实际结束分钟','结束不能早于同一原记录的开始');
 });
 return issues;
}
export function unmappedStageSources(data){
 const enabled=(data.rules||[]).some(r=>r['规则编号']==='MATERIAL'&&r['是否启用']==='是');
 const checked=enabled?data:{...data,originalInventory:[],originalSupply:[],stageMappings:(data.stageMappings||[]).filter(m=>!['originalInventory','originalSupply'].includes(m['来源类别']))};
 return checkStageBindings(checked,{forRun:true,startMinute:525600}).issues;
}
