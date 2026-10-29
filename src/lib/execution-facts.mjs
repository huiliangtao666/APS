import {originalIssues,originalTransition} from './original-resources.mjs';
import {quantityMath as Q,executionMaterialDemand,materialPolicy} from './material-allocation.mjs';
import {getUsableQualityStatuses} from './inventory.mjs';
import {eventRisks,eventSummary} from './simulation-events.mjs';
export const factTables=['originalResourceEvents','executionFacts','executionMaterials','executionSources','simulationEvents'];
export const executionState=data=>Object.fromEntries([...factTables.filter(k=>k!=='originalResourceEvents'),...((data.originalResourceEvents||[]).length?['originalResourceEvents']:[])].map(k=>[k,data[k]||[]]));
const compare=(a,b)=>{try{return Q.cmp(Q.q(a),Q.q(b));}catch{return null;}};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const decimal=v=>typeof v==='string'&&/^\d+(?:\.\d{1,12})?$/.test(v)&&Number.isFinite(Number(v))&&Number(v)<=1e12&&Q.cmp(Q.q(v),Q.q('1000000000000'))<=0n;
const facts=data=>data.executionFacts||[];
export const factFor=(data,order,op)=>facts(data).find(f=>f['订单编号']===order&&f['工序编号']===op);
export function validateExecution(data){
 const issues=[];
 const add=(table,i,field,message)=>issues.push({code:'EXECUTION_RECONCILIATION',table,file:table==='executionFacts'?'25_模拟任务执行事实.csv':'26_模拟累计耗料.csv',row:i+2,field,message:'模拟事实须核对：'+message});
 const seen=new Set(),factIds=new Set();
 facts(data).forEach((f,i)=>{
  const bad=(field,msg)=>add('executionFacts',i,field,msg),o=(data.orders||[]).find(o=>o['订单编号']===f['订单编号']);
  const route=(data.routes||[]).find(r=>r['产品编号']===o?.['产品编号']&&r['工序编号']===f['工序编号']);
  if(!f['事实编号']?.trim()||factIds.has(f['事实编号']))bad('事实编号','编号为空或重复');factIds.add(f['事实编号']);
  const key=JSON.stringify([f['订单编号'],f['工序编号']]);if(seen.has(key))bad('工序编号','每订单工序仅一份累计事实');seen.add(key);
  if(!o||!route)bad('订单编号','订单/路线引用不存在');
  if(o&&(!['正式订单'].includes(o['需求类型'])||o['订单状态']!=='有效'))bad('订单编号','仅支持有效正式订单');
  if(o&&Number(o['已完成合格数量']||0)!==0)bad('工序完成数量','订单已完成合格量与工序执行量的重叠口径未定，禁止自动合并');
  if(o&&f['数量单位']!==o['数量单位'])bad('数量单位','须与订单单位一致，不换算');
  for(const field of ['开始分钟','观测分钟','工序完成数量','剩余工时分钟'])if(!decimal(f[field]))bad(field,'须为0至1e12、至多12位小数的十进制数');
  if(Number(f['观测分钟'])<Number(f['开始分钟'])||Number(f['观测分钟'])>525600)bad('观测分钟','须不早于开始，且不超525600分钟');
  if(f['累计报废数量']&&!decimal(f['累计报废数量']))bad('累计报废数量','须为0至1e12、至多12位小数的累计报废量，单位同订单');
  if(f['报废补做口径']&&!['待核对','按本工序BOM补做'].includes(f['报废补做口径']))bad('报废补做口径','仅待核对或显式按本工序BOM补做；不代表真实补料/质量确认');
  const state=f['状态'];if(!['已开始','部分完成','暂停','已完成'].includes(state))bad('状态','只支持已开始、部分完成、暂停、已完成');
  const qty=Number(f['工序完成数量']),demand=Number(o?.['合格需求']);
  if(compare(f['工序完成数量'],o?.['合格需求'])>0n)bad('工序完成数量','超过订单需求，禁止自动接纳超量；请核对');
  if(state==='已开始'&&compare(f['工序完成数量'],'0')!==0n)bad('工序完成数量','已开始完成量须为0；已有产出请选择部分完成');
  if(state==='部分完成'&&!(compare(f['工序完成数量'],'0')>0n&&compare(f['工序完成数量'],o?.['合格需求'])<0n))bad('工序完成数量','部分完成须大于0且小于需求');
  if(state==='暂停'&&(!f['暂停原因']?.trim()||compare(f['工序完成数量'],o?.['合格需求'])>=0n))bad('暂停原因','暂停须填原因，且仍有余量；恢复事件时点未定，不自动恢复');
  if(state==='已完成'){
   if(!decimal(f['完成分钟'])||Number(f['完成分钟'])<=Number(f['开始分钟'])||Number(f['完成分钟'])>Number(f['观测分钟']))bad('完成分钟','完成须晚于开始且不晚于观测');
   if(compare(f['工序完成数量'],o?.['合格需求'])!==0n||Number(f['剩余工时分钟'])!==0)bad('工序完成数量','完成须等于需求且剩余工时为0；不代表质量合格');
  }else if(f['完成分钟']||!(Number(f['剩余工时分钟'])>0))bad('剩余工时分钟','未完成须无完成时间且有正剩余工时');
  const m=(data.machines||[]).find(m=>m['设备编号']===f['当前设备']&&m['工序编号']===f['工序编号']&&m['产线编号']===o?.['产线编号']);
  const dep=(data.dependencies||[]).find(d=>d['订单编号']===f['订单编号']&&d['工序编号']===f['工序编号']&&d['资源类型']==='设备');
  if(!m||dep?.['资源编号']!==f['当前设备'])bad('当前设备','须匹配订单产线、工序及显式设备依赖；转机语义待定');
  if(route?.['前序工序']){const pre=factFor(data,f['订单编号'],route['前序工序']);if(!pre||pre['状态']!=='已完成'||Number(pre['完成分钟'])>Number(f['开始分钟']))bad('开始分钟','已开始下游须有不晚于开始的已完成前序事实');}
 });
 const lots=new Map(),pairs=new Set(),ids=new Set();
 (data.executionMaterials||[]).forEach((c,i)=>{
  const bad=(field,msg)=>add('executionMaterials',i,field,msg),f=facts(data).find(f=>f['事实编号']===c['事实编号']);
  const lot=(data.inventory||[]).find(b=>b['批次编号']===c['批次编号']);
  const material=(data.materials||[]).find(m=>m['物料编号']===c['物料编号']);
  if(!c['记录编号']?.trim()||ids.has(c['记录编号']))bad('记录编号','编号为空或重复');ids.add(c['记录编号']);
  const key=JSON.stringify([c['事实编号'],c['批次编号']]);if(pairs.has(key))bad('批次编号','每事实/批次只允许一条累计耗料，禁止重复累加');pairs.add(key);
  if(!f)bad('事实编号','不存在的任务事实');
  if(!lot||!material||lot['物料编号']!==c['物料编号'])bad('物料编号','须引用同物料的现有库存批次；预计供给不代表真实到货');
  if(!material||material['单位']!==c['单位'])bad('单位','须与物料主数据完全一致，不换算');
  if(!decimal(c['累计已用数量'])||!(Number(c['累计已用数量'])>0))bad('累计已用数量','须为正十进制累计值');
  else {lots.set(c['批次编号'],Q.add(lots.get(c['批次编号'])||Q.zero,Q.q(c['累计已用数量'])));}
  if(f&&decimal(c['累计已用数量']))try{
   const o=data.orders.find(o=>o['订单编号']===f['订单编号']);
   const demands=executionMaterialDemand({...data,executionFacts:f['报废补做口径']==='按本工序BOM补做'?data.executionFacts:[]},o,f['工序编号'],Number(f['开始分钟']));
   const demand=demands.find(d=>d.materialId===c['物料编号']);
   const sum=(data.executionMaterials||[]).filter(x=>x['事实编号']===c['事实编号']&&x['物料编号']===c['物料编号']).reduce((v,x)=>Q.add(v,Q.q(x['累计已用数量'])),Q.zero);
   if(!demand||Q.cmp(sum,Q.fromExact(demand.exactQuantity))>0)bad('累计已用数量','缺少支持口径的BOM或累计耗料超显式定额；补料/超耗需核对');
  }catch{bad('累计已用数量','BOM/耗料口径未明确，禁止推断剩余物料');}
 });
 for(const [id,amount] of lots){const lot=(data.inventory||[]).find(b=>b['批次编号']===id);if(lot)try{if(Q.cmp(amount,Q.sub(Q.q(lot['账面数量']),Q.q(lot['已占用数量'])))>0)issues.push({code:'EXECUTION_STOCK_OVERUSE',table:'executionMaterials',file:'26_模拟累计耗料.csv',row:0,field:'累计已用数量',message:'累计耗料超过账面减独立占用；账面须为扣耗前口径，不能重复扣减'});}catch{/* Inventory validation reports invalid amounts. */}}
 const sourceIds=new Set(),sourceFacts=new Set();
 (data.executionSources||[]).forEach((source,i)=>{
  const bad=(field,message)=>issues.push({code:'EXECUTION_SOURCE_MAPPING_REQUIRED',table:'executionSources',file:'27_模拟进度来源对账.csv',row:i+2,field,message:'来源汇总须显式核对：'+message});
  if(!source['来源编号']?.trim()||sourceIds.has(source['来源编号']))bad('来源编号','来源为空或重复，不允许重复累计');sourceIds.add(source['来源编号']);
  const f=facts(data).find(f=>f['事实编号']===source['事实编号']);
  if(!f||!source['原始任务编号']?.trim()||!source['来源说明']?.trim())bad('事实编号','须保留原始任务、来源说明并显式关联事实；不从任务名猜测');
  if(sourceFacts.has(source['事实编号']))bad('事实编号','每事实仅一份累计来源总数；不累加重复来源');sourceFacts.add(source['事实编号']);
  const rows=(data.executionMaterials||[]).filter(c=>c['事实编号']===source['事实编号']);
  if(!decimal(source['原始汇总耗料']))bad('原始汇总耗料','须为非负十进制累计源值');
  else try{
   const mapping=JSON.parse(source['原始分配JSON']);if(!Array.isArray(mapping)||mapping.length>10000)throw Error('须提供分配数组');
   const mapped=new Set();let sum=Q.zero;
   for(const part of mapping){
    if(!part||Object.keys(part).some(k=>!['记录编号','批次编号','物料编号','数量','单位'].includes(k))||!decimal(part['数量'])||compare(part['数量'],'0')<=0n||mapped.has(part['记录编号']))throw Error('分配字段、数量或重复记录无效');mapped.add(part['记录编号']);
    const row=rows.find(c=>c['记录编号']===part['记录编号']);
    if(!row||['批次编号','物料编号','单位'].some(k=>row[k]!==part[k])||part['单位']!==source['耗料单位']||compare(row['累计已用数量'],part['数量'])<0n)throw Error('须显式关联同单位现有物料/库存批次/耗料；当前累计不能少于来源分配');
    sum=Q.add(sum,Q.q(part['数量']));
   }
   if(!source['耗料单位']?.trim()||Q.cmp(sum,Q.q(source['原始汇总耗料']))!==0n)throw Error('来源总数与原始分配不守恒，禁止自动分批');
  }catch(e){bad('原始分配JSON',e.message||'缺少显式映射');}
 });
 // Recorded occupied intervals are facts. Conflicts must be reconciled, never erased.
 for(let i=0;i<facts(data).length;i++)for(let j=0;j<i;j++){const a=facts(data)[i],b=facts(data)[j],end=f=>Number(f['完成分钟']||f['观测分钟']);if(a['当前设备']===b['当前设备']&&Number(a['开始分钟'])<end(b)&&Number(b['开始分钟'])<end(a))add('executionFacts',i,'当前设备','原始执行保护区间重叠，须核对');}
 return issues;
}
export function executionTransition(before,after){
 const issues=[...originalTransition(before,after)],bad=message=>issues.push({code:'EXECUTION_RECONCILIATION_REQUIRED',table:'executionFacts',file:'25_模拟任务执行事实.csv',row:0,field:'原始事实',message});
 for(const key of factTables)for(const old of before[key]||[]){
  if(key==='originalResourceEvents')continue;
  if(key==='simulationEvents'){const next=(after[key]||[]).find(e=>e['事件编号']===old['事件编号']);if(!next||!same(old,next))bad('已接纳事件不可删除或改写；恢复/撤销策略未定');continue;}
  const id=key==='executionFacts'?'事实编号':key==='executionSources'?'来源编号':'记录编号',next=(after[key]||[]).find(f=>f[id]===old[id]);
  if(key==='executionSources'){
   if(!next||!same(old,next)){
    const index=next?(after[key]||[]).indexOf(next):(before[key]||[]).indexOf(old);
    const fields=next?Object.keys({...old,...next}).filter(field=>old[field]!==next[field]):[id];
    for(const field of fields)issues.push({code:'EXECUTION_RECONCILIATION_REQUIRED',table:key,file:'27_模拟进度来源对账.csv',row:index+2,field,recordId:old[id],protectedRecord:structuredClone(old),message:'原始来源汇总及映射不可覆盖；请保留来源并用独立核对记录处理'});
   }
   continue;
  }
  if(!next){bad('已记录模拟执行/耗料不能删除；须人工核对，原记录保留');continue;}
  const immutable=key==='executionFacts'?['事实编号','订单编号','工序编号','开始分钟','当前设备','数量单位']:['记录编号','事实编号','批次编号','物料编号','单位'];
  if(immutable.some(k=>old[k]!==next[k]))bad('原始开始、设备、任务与耗料引用不可覆盖；转机/纠错待决');
  if(key==='executionFacts'){
   if(old['完成分钟']&&old['完成分钟']!==next['完成分钟'])bad('原始完成时点不可覆盖');
   if(old['状态']==='已完成'&&!same(old,next))bad('已完成事实不可重写');
   if(old['状态']==='部分完成'&&next['状态']==='已开始'||old['状态']==='暂停'&&next['状态']!=='暂停')bad('状态倒退或暂停恢复时点/质量处置未定，须核对');
   if(compare(next['累计报废数量']||'0',old['累计报废数量']||'0')<0n)bad('累计报废数量不得倒退；原始报废保留待核对');
   for(const f of ['观测分钟','工序完成数量'])if(compare(next[f],old[f])<0n)bad(f+'不得倒退；不自动冲销已执行事实');
  }else if(compare(next['累计已用数量'],old['累计已用数量'])<0n)bad('累计耗料不得倒退；退料/冲销语义待定');
 }
 // Execution is tied to an order demand and a stable production definition.
 for(const f of facts(before)){
  const old=(before.orders||[]).find(o=>o['订单编号']===f['订单编号']),next=(after.orders||[]).find(o=>o['订单编号']===f['订单编号']);
  if(!next||['产品编号','产线编号','合格需求','数量单位','已完成合格数量','订单状态','需求类型'].some(k=>(old?.[k]||'')!==(next[k]||'')))bad('已有执行事实的订单需求/状态/合格量不可自动重基；请核对');
 }
 if(facts(before).length)for(const key of ['products','materials','bom','routes','times','dependencies','machines'])if(!same(before[key]||[],key==='dependencies'?(after[key]||[]).filter(d=>(before.orders||[]).some(o=>o['订单编号']===d['订单编号'])):after[key]||[]))bad(key+'已关联执行事实，改版及实际/剩余范围映射待FR031核对');
 for(const c of before.executionMaterials||[]){const old=before.inventory.find(b=>b['批次编号']===c['批次编号']),next=after.inventory.find(b=>b['批次编号']===c['批次编号']);if(!next||['账面数量','已占用数量','物料编号'].some(k=>old?.[k]!==next[k]))bad('已耗批次账面/占用口径不可重写；防止账面已扣后再次扣耗');}
 return issues;
}
export function executionAdmission(data,conditions){
 const eventIssues=[];if((data.simulationEvents||[]).length){const ids=(conditions.enabledRuleIds||(data.rules||[]).filter(r=>r['是否启用']==='是').map(r=>r['规则编号'])).filter(id=>{const r=(data.rules||[]).find(r=>r['规则编号']===id);return !r?.['生效时间']||Date.parse(r['生效时间'])<=Date.parse(conditions.ruleEvaluationAt||new Date().toISOString());});if(conditions.mode==='minimal-r1'||!ids.includes('CALENDAR')||(data.simulationEvents||[]).some(e=>['物料状态变化','到料延期'].includes(e['事件类型']))&&!ids.includes('MATERIAL'))eventIssues.push({code:'EVENT_POLICY_REQUIRED',message:'异常事件须使用完整支持模式及日历；物料/延期事件须启用物料规则，不得绕过事件约束'});}
 const hasOriginal=(data.originalResourceEvents||[]).length>0;
 const original=hasOriginal?originalIssues(data,{forRun:true}):[];
 if(hasOriginal)for(const r of data.originalResourceEvents){const d=JSON.parse(r['原账JSON']);if(d.status==='已核对'&&Number(conditions.startMinute??0)<d.observedAt)original.push({code:'N06_OBSERVATION_BOUNDARY',message:'新运行下界不得早于原账观测点；历史重放只作容量核对'});}
 if(!facts(data).length)return [...eventIssues,...original];
 const issues=[...eventIssues,...original],bad=message=>issues.push({code:'EXECUTION_SCOPE_UNDECIDED',table:'executionFacts',file:'25_模拟任务执行事实.csv',row:0,field:'计算口径',message});
 for(const f of facts(data))if(compare(f['累计报废数量']||'0','0')>0n&&f['报废补做口径']!=='按本工序BOM补做')bad('报废任务 '+f['事实编号']+' 的补做/补料口径待核对；不自动推断替代品、合格量或释放材料');
 if(conditions.mode==='minimal-r1')bad('有执行事实不能使用忽略保护的最小模式');
 const enabled=(conditions.enabledRuleIds||[]).filter(id=>{const row=(data.rules||[]).find(r=>r['规则编号']===id);return !row?.['生效时间']||Date.parse(row['生效时间'])<=Date.parse(conditions.ruleEvaluationAt||new Date().toISOString());});
 const full=data.executionContext||data;
 if(enabled.includes('MATERIAL'))for(const f of facts(full).filter(f=>f['状态']==='已完成'))try{const o=full.orders.find(o=>o['订单编号']===f['订单编号']);for(const demand of executionMaterialDemand(full,o,f['工序编号'],Number(f['开始分钟']))){const used=(full.executionMaterials||[]).filter(c=>c['事实编号']===f['事实编号']&&c['物料编号']===demand.materialId).reduce((a,c)=>Q.add(a,Q.q(c['累计已用数量'])),Q.zero);if(Q.cmp(used,Q.fromExact(demand.exactQuantity))!==0n)bad('已完成工序耗料与支持BOM定额未齐；不能默认其物料仍未使用或擅自补耗料');}}catch{bad('已完成工序的BOM/耗料映射不明，须核对');}
 if((hasOriginal?['CAPACITY','PROGRAM','DELIVERY']:['CAPACITY','PROGRAM','MOLD','STORAGE','DELIVERY']).some(id=>enabled.includes(id)))bad('执行事实与拆合批/联合占用/交付质量的完整协调待FR031；禁止虚构已确认执行或合格产出');
 if(!hasOriginal&&(data.dependencies||[]).some(d=>d['资源类型']==='人员技能'&&factFor(data,d['订单编号'],d['工序编号'])))bad('已开始任务人员阶段剩余范围未定，禁止重复占用');
 if(conditions.endMinute!==null&&conditions.endMinute!==undefined&&facts(data).some(f=>Number(f['观测分钟'])>conditions.endMinute))bad('计算结束早于执行观测时点，禁止裁去事实');
 return issues;
}
export function executionSummary(data,at=new Date().toISOString()){
 return {...((data.originalResourceEvents||[]).length?{originalResourceEvents:structuredClone(data.originalResourceEvents)}:{}),simulation:true,events:eventSummary(data),sources:structuredClone(data.executionSources||[]),orderImpact:executionOrderImpact(data),risks:executionRisks(data,at),protection:facts(data).map(f=>({factId:f['事实编号'],machine:f['当前设备'],originalStart:Number(f['开始分钟']),originalEnd:f['完成分钟']?Number(f['完成分钟']):null,observedUntil:Number(f['观测分钟']),policy:f['状态']==='已完成'?'保留原始完成区间':f['状态']==='暂停'?'暂停恢复未知，保留设备占用':'仅显式剩余投影；异常或失败时保留设备占用待核对'})),quantityMeaning:'工序累计产出，不是合格入库；不跨工序累加，不自动改订单合格完成量',facts:structuredClone(facts(data)),consumption:structuredClone(data.executionMaterials||[]),remaining:facts(data).map(f=>{const o=data.orders.find(o=>o['订单编号']===f['订单编号']);return {factId:f['事实编号'],orderId:f['订单编号'],operation:f['工序编号'],remainingQuantity:o?Q.num(Q.sub(Q.q(o['合格需求']),Q.q(f['工序完成数量']))):null,unit:f['数量单位'],usableOutput:Number(f['工序完成数量']),scrapQuantity:Number(f['累计报废数量']||0),scrapPolicy:f['报废补做口径']||'待核对',remainingMinutes:Number(f['剩余工时分钟']),paused:f['状态']==='暂停'};})};
}
// Current unusable consumed material or overlapping fault cannot silently become good product.
export function executionRisks(data,at=new Date().toISOString()){
 const risks=eventRisks(data);
 for(const f of facts(data)){
  const ids=(data.executionMaterials||[]).filter(c=>c['事实编号']===f['事实编号']).filter(c=>{
   const lot=(data.inventory||[]).find(b=>b['批次编号']===c['批次编号']);
   const usable=materialPolicy(data,at)?.['可用状态']||getUsableQualityStatuses(data.rules,c['物料编号'],at);
   return lot&&!usable.includes(lot['质量状态']);
  }).map(c=>c['批次编号']);
  const start=Number(f['开始分钟']),end=Number(f['完成分钟']||f['观测分钟'])+(f['状态']==='已完成'?0:Number(f['剩余工时分钟']));
  const stops=(data.downtime||[]).filter(s=>s['设备编号']===f['当前设备']&&Number(s['起始分钟'])<end&&Number(s['结束分钟'])>start);
  if(ids.length||stops.length)risks.push({factId:f['事实编号'],orderId:f['订单编号'],operation:f['工序编号'],lots:ids,downtime:structuredClone(stops),message:`已执行任务须处理：${ids.length?'已耗批次当前不可用 '+ids.join('、')+'；':''}${stops.length?'设备故障/停机与事实或显式剩余区间重叠；':''}保留原始事实，不自动认定质量合格或恢复生产`});
 }
 return risks;
}
export function executionTrialIssues(current,trial){
 const issues=executionTransition(current,trial);
 for(const c of current.executionMaterials||[]){const lot=d=>d.inventory?.find(b=>b['批次编号']===c['批次编号']);if(!same(lot(current),lot(trial)))issues.push({code:'TRIAL_CONSUMED_STOCK_PROTECTED',table:'inventory',file:'09_库存批次.csv',row:0,field:'已耗批次',message:'试算不得恢复或改写当前已耗批次的状态/库存口径；使用当前事实重算，异常处置待FR031'});}
 return issues;
}

// One row per order and operation: operation output must never be summed into qualified order credit.
export function executionOrderImpact(data){
 return (data.orders||[]).map(o=>{
  const operations=(data.routes||[]).filter(r=>r['产品编号']===o['产品编号']).map(r=>{
   const f=factFor(data,o['订单编号'],r['工序编号']),scrap=Number(f?.['累计报废数量']||0);
   return {operation:r['工序编号'],predecessor:r['前序工序']||null,factId:f?.['事实编号']||null,state:f?.['状态']||'未开始',usableOutput:Number(f?.['工序完成数量']||0),scrapQuantity:scrap,remainingQuantity:Q.num(Q.sub(Q.q(o['合格需求']),Q.q(f?.['工序完成数量']||'0'))),remainingMinutes:f?Number(f['剩余工时分钟']):null,reconciliationRequired:!!f&&(eventRisks(data).some(r=>r.factId===f['事实编号'])||f['状态']==='暂停'||scrap>0&&f['报废补做口径']!=='按本工序BOM补做')};
  });
  return {orderId:o['订单编号'],unit:o['数量单位'],qualifiedCompleted:Number(o['已完成合格数量']||0),remainingQualifiedOrder:Q.num(Q.sub(Q.q(o['合格需求']),Q.q(o['已完成合格数量']||'0'))),operations,unfinishedOperations:operations.filter(op=>op.state!=='已完成').map(op=>op.operation),reconciliationRequired:operations.some(op=>op.reconciliationRequired),meaning:'工序可用产出不等于订单合格入库；报废不抵扣需求；剩余分钟仅使用显式输入，不按数量比例推算'};
 });
}
