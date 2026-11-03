import {explainFinding,explainShortage} from '../src/lib/workbook-explanations.mjs';
import {explainEquipmentNode} from './workbook-node-analysis.mjs';
const rows=(d,t)=>d.tables?.[t]||[];
const n=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const fail=(code,status=422)=>{throw Object.assign(Error(code),{code,status});};
const col=(key,label,extra={})=>({key,label,...extra});
const record=(id,values,explanation)=>({id,values,...(explanation?{explanation}:{})});
const friendly=v=>v===null||v===undefined||v===''?'未提供':Array.isArray(v)?v.map(friendly).join('、')||'显式空列表':typeof v==='object'?Object.entries(v).map(([k,x])=>k+'：'+friendly(x)).join('；'):String(v);
/** A task card reads the same frozen demand; it never computes a new plan. */
export function taskCard(v,{record:parent,a,c,node,section='overview',offset=0}){
 if(!['overview','chain','resources','materials','sources'].includes(section))fail('INVALID_TASK_SECTION');
 if(!Number.isSafeInteger(offset)||offset<0)fail('INVALID_PAGE');
 const task=a.tasks.find(t=>t.id===node?.id&&t.orderId===parent.id);
 if(node?.kind!=='task'||!task||node.resource!==task.machine)fail('NODE_NOT_IN_QUERY',404);
 const d=v.input,p=v.run.result,tools=Array.isArray(task.tools)?task.tools:[],material=rows(d,'物料主数据').find(m=>m['物料编号']===task.productId),demand=rows(d,'每日需求').find(r=>r['需求编号']===parent.id),finished=rows(d,'物料主数据').find(m=>m['物料编号']===demand?.['成品编号']);
 const rawRoute=rows(d,'工艺路线').find(r=>r['路线工序编号']===task.routeStepId),route=rawRoute||(d.mapping?.sfRoutes||[]).find(r=>r['路线工序编号']===task.routeStepId),machine=rows(d,'设备与工装').find(r=>r['资源编号']===task.machine),crew=rows(d,'班组资源').find(r=>r['班组编号']===task.crew);
 const fields=[],groups=[],add=(label,value)=>fields.push({label,value:value===undefined?null:value}),name=(id,label)=>[id,label].filter(Boolean).join(' '),date=value=>n(value)===null?null:new Date(Date.parse(v.identity.dayZero+'T00:00:00Z')+Number(value)*86400000).toISOString().slice(0,10);
 const routeSource=rawRoute?'工艺路线':route?'半成品路线映射':'工艺来源未保存';
 const taskInfo={id:task.id,orderId:task.orderId,label:task.label,productId:task.productId,productName:material?.['物料名称']??null,machine:task.machine,machineName:machine?.['资源名称']??null,start:task.start,end:task.end,quantity:task.quantity??null,unit:'千克',physicalStatus:task.physicalStatus??null,productionId:task.productionId,predecessor:task.predecessor??null,recordId:parent.id,outsideWindow:task.start>=c.end||task.end<=c.start};
 const out={task:taskInfo,section,fields,groups,analysis:null,total:0,nextOffset:null,note:'本次运行的冻结计划；已排不代表现场完成或已交付。日期及数量沿用本次运行口径。'};
 const group=(id,title,columns,records,kind='table')=>groups.push({id,title,columns,records,kind});
 const sourceRef=(sheet,r,key)=>`${sheet} · ${key||'编号未提供'} · ${r?._row?'第 '+r._row+' 行':'原行未提供'}`;
 if(section==='overview'){
  for(const [label,value]of [['任务编号',task.id],['需求编号',task.orderId],['任务物料',name(task.productId,material?.['物料名称'])],['需求成品',name(demand?.['成品编号'],finished?.['物料名称'])||null],['工序',task.label],['设备',name(task.machine,machine?.['资源名称'])],['任务数量',n(task.quantity)===null?null:task.quantity+' 千克'],['生产批次',task.productionId],['现场进度',task.physicalStatus??null],['计划状态','已排（计划记录）'],['真实前序',task.predecessor||null],['路线工序编号',task.routeStepId]])add(label,value);
  // This detail may navigate to a same-demand task outside the chart window;
  // membership is checked above. E1's visible-node analysis gate is unchanged.
  out.analysis=explainEquipmentNode(v,{record:{...parent,resource:task.machine,tasks:a.tasks.filter(t=>t.orderId===parent.id)},a,c:{...c,start:Math.min(c.start,task.start),end:Math.max(c.end,task.end)},node});
 }else if(section==='chain'){
  const related=a.tasks.filter(t=>t.orderId===parent.id).sort((x,y)=>x.start-y.start||x.end-y.end||String(x.id).localeCompare(String(y.id))),map=new Map(related.map(t=>[t.id,t]));
  group('chain','同一需求的冻结工序（按真实前序关联，分生产批次）',[col('taskId','任务编号',{fixed:true}),col('label','工序'),col('productionId','生产批次'),col('productId','物料'),col('machine','设备'),col('start','开始时刻',{format:'instant',timeUnit:'minute'}),col('end','结束时刻（不含）',{format:'instant',timeUnit:'minute'}),col('duration','历时（分钟）'),col('predecessor','真实前序'),col('physicalStatus','现场进度')],related.map(t=>{const prev=map.get(t.predecessor);return record(t.id,{taskId:t.id,label:t.label,productionId:t.productionId,productId:t.productId,machine:t.machine,start:t.start,end:t.end,duration:t.end-t.start,predecessor:t.predecessor||null,linkedPredecessor:prev&&prev.productionId===t.productionId?prev.id:null,physicalStatus:t.physicalStatus??null});}));
 }else if(section==='resources'){
  for(const [label,value]of [['设备组',name(machine?.['资源组编号']||route?.['设备组编号'],machine?.['资源组名称']||route?.['设备组名称'])||null],['班组',name(task.crew,crew?.['班组名称'])],['任务需求人数',n(task.people)===null?null:task.people+' 人'],['每班可用人数',n(crew?.['每班可用人数'])===null?null:crew['每班可用人数']+' 人'],['工艺所需工装类型',route?.['所需工装类型']??null],['工艺每批工装套数',n(route?.['每批工装套数'])===null?null:route['每批工装套数']+' 套'],['已分配实体工装',Array.isArray(task.tools)?task.tools.join('、')||'显式无实体工装':null],['设备单批上限',n(machine?.['单次批量上限千克'])===null?null:machine['单次批量上限千克']+' 千克']])add(label,value);
  group('tools','已分配实体工装的冻结原文',[col('id','资源编号'),col('name','资源名称'),col('type','资源组 / 类型'),col('available','可用数量（实体套）'),col('batch','单次批量上限（千克）'),col('source','来源')],tools.map(id=>{const r=rows(d,'设备与工装').find(r=>r['资源编号']===id);return record(id,{id,name:r?.['资源名称']??null,type:r?.['资源组名称']||r?.['资源组编号']||null,available:n(r?.['可用数量']),batch:n(r?.['单次批量上限千克']),source:sourceRef('设备与工装',r,id)});}));
 }else if(section==='materials'){
  add('风险说明','未保存问题或分配记录不等于已完成全部齐套检查；同需求记录可能属于其他工序。');
  const findings=(p.findings||[]).filter(f=>f.taskId===task.id||f.need===task.orderId),shortages=(p.shortages||[]).filter(s=>s.taskId===task.id||s.need===task.orderId);
  group('risks','本任务及同需求的风险记录',[col('scope','关联范围'),col('type','类型'),col('material','物料'),col('quantity','缺口数量'),col('unit','单位'),col('message','说明')],[...findings.map((f,i)=>record('f'+i,{scope:f.taskId===task.id?'本任务':'同需求',type:f.code,material:f.materialId??null,quantity:null,unit:null,message:f.message||f.code},explainFinding(f,{...p,dayZero:v.identity.dayZero}))),...shortages.map((s,i)=>record('s'+i,{scope:s.taskId===task.id?'本任务':'同需求',type:'净缺口',material:s.materialId,quantity:s.quantity,unit:s.unit??null,message:'冻结缺料记录；不推定唯一瓶颈'},explainShortage(s,{...p,dayZero:v.identity.dayZero})))]);
  group('allocations','本任务保存的投料 / 供给分配',[col('material','物料'),col('quantity','分配数量'),col('unit','单位'),col('supply','供给编号'),col('feed','投料时点',p.timeUnit==='minute'?{format:'instant',timeUnit:'minute'}:{}),col('nature','性质')],(p.allocations||[]).filter(x=>x.taskId===task.id).map((x,i)=>record('a'+i,{material:x.materialId,quantity:x.quantity,unit:rows(d,'物料主数据').find(m=>m['物料编号']===x.materialId)?.['基础单位']??null,supply:x.supplyId,feed:p.timeUnit==='minute'?x.feedMinute:date(x.feedDay),nature:x.conditional?'条件供给（不代表实物已到）':'实物来源的计划分配'})));
  // Keep other feeding operations visible as raw BOM references. Do not infer
  // adopted feed mapping from a human-readable operation name.
  group('bom','任务物料的父项 BOM 冻结原文（含其他投料工序）',[col('id','用量关系编号'),col('child','子项编号'),col('name','子项名称'),col('quantity','子项基准用量'),col('parentQuantity','父项基准产出（千克）'),col('unit','数量单位'),col('feed','投料位置'),col('mapping','本工序投料映射'),col('row','原行')],rows(d,'物料清单').filter(b=>b['父项编号']===task.productId).map(b=>{const mappings=(d.mapping?.feed_mappings||[]).filter(f=>f.bom_id===b['用量关系编号']);return record(b['用量关系编号'],{id:b['用量关系编号'],child:b['子项编号'],name:b['子项名称']||rows(d,'物料主数据').find(m=>m['物料编号']===b['子项编号'])?.['物料名称']||null,quantity:b['子项基准用量']??null,parentQuantity:b['父项基准产出千克']??null,unit:b['数量单位']??null,feed:b['投料位置']??null,mapping:!mappings.length?'未保存映射':mappings.some(f=>f.route_step_id===task.routeStepId)?'本工序':'其他工序',row:b._row??null});}));
 }else{
  for(const [label,value]of [['来源性质','本次 APS 运行冻结计划；保留原文件身份，后续维护不回写本运行'],['需求来源',sourceRef('每日需求',demand,parent.id)],['工艺来源',sourceRef(routeSource,route,task.routeStepId)],['设备来源',sourceRef('设备与工装',machine,task.machine)],['原工艺跨日历时',n(route?.['跨日历时天数'])===null?null:route['跨日历时天数']+' 天'],['参数口径','只读取本次冻结输入及已保存有效参数；未保存来源时明确标为缺失']])add(label,value);
  const dates=new Set(['需求日','最早到货日','最晚到货日','生效日','失效日']);
  for(const [id,title,r,sheet,key]of [['route','冻结工艺字段',route,routeSource,task.routeStepId],['demand','冻结需求字段',demand,'每日需求',parent.id],['machine','冻结设备字段',machine,'设备与工装',task.machine],['crew','冻结班组字段',crew,'班组资源',task.crew]]){
   group(id,title+' · '+sourceRef(sheet,r,key),[col('field','字段'),col('value','值')],Object.entries(r||{}).filter(([k])=>!k.startsWith('_')).map(([field,value])=>record(field,{field,value:dates.has(field)?date(value):friendly(value),cell:r?._cells?.[field]??null,formula:r?._formulas?.[field]??null})),'fields');
  }
  const objects=new Set([task.routeStepId,task.productId,task.machine,task.crew,...tools,'CAL','GLOBAL']);
  group('parameters','本对象相关的冻结有效参数',[col('object','对象'),col('field','参数'),col('value','有效值'),col('unit','单位'),col('from','生效日期'),col('to','失效日期'),col('source','来源 / 范围')],(d.effectiveParameters?.values||[]).filter(r=>objects.has(r.object)).map((r,i)=>record('p'+i,{object:r.object,field:r.field,value:friendly(r.value),unit:r.unit??null,from:date(r.from),to:date(r.to),source:[r.sourceRole,r.scope].filter(Boolean).join(' / ')||'来源未保存'})));
 }
 // One bounded page over the section's groups; metadata discloses groups that
 // continue on another page. Never silently sample long BOMs or task chains.
 const all=groups.flatMap(g=>g.records.map(r=>({group:g.id,record:r}))),part=[];let bytes=0;
 for(const item of all.slice(offset,offset+100)){const size=Buffer.byteLength(JSON.stringify(item));if(size>120000)fail('DETAIL_RECORD_LIMIT',413);if(bytes+size>160000)break;part.push(item);bytes+=size;}
 out.total=all.length;out.nextOffset=offset+part.length<all.length?offset+part.length:null;
 out.groups=groups.map(g=>({...g,total:g.records.length,records:part.filter(x=>x.group===g.id).map(x=>x.record)}));
 return out;
}
