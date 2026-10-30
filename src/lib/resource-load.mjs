import {personnelCandidates} from './resource-policies.mjs';
import {timetable,validInterval} from './timetable.mjs';
import {quantityMath as Q} from './material-allocation.mjs';
import {resolveExpectedSupply,PLAN_TIME_ORIGIN} from './expected-supply.mjs';
const unique=a=>[...new Set(a)];
const number=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
const exact=v=>{try{return v?.numerator!==undefined?Q.fromExact(v):Q.q(v);}catch{return null;}};
const sum=values=>{const qs=values.map(exact);return qs.some(q=>q===null)?null:qs.reduce(Q.add,Q.zero);};
const amount=q=>q===null?null:{value:Q.num(q),exact:Q.exact(q)};
const refs=(table,rows)=>rows.map(row=>({table,row}));
export const loadLimits=['仅保存方案的计划负荷，不是实时剩余可用量；未分配不代表可排或资源空闲事实','DEC02 工装阶段/动态归还、DEC03 人员阶段/技能替代、最大等待及完整联合规则仍待确认；仅解释显式保存占用','候选分配不计入已提交消耗；不跨工序累加订单完成；不把预计到料当真实到货','确认快照、保存的执行事实与当前事实分别保留；不以当前输入补算历史'];
function union(intervals){let end=-Infinity,total=0;for(const [a,b] of intervals.sort((x,y)=>x[0]-y[0])){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return total;}
// Pure projection. Reservations are aggregated once per physical reservation, never per task link.
export function resourceLoad(plan,{start=0,end=120}={}){
 if(!validInterval(start,end))throw Error('负荷窗口须为有效 [开始,结束) 分钟');
 const model=timetable(plan),input=model.input;
 const scheduled=model.tasks.filter(t=>t.status==='scheduled'&&validInterval(t.start,t.end));
 const machineIds=unique([...(input?.machines||[]).map(r=>r['设备编号']),...model.tasks.map(t=>t.machine)]).filter(Boolean);
 const machines=machineIds.map(id=>{
  const tasks=scheduled.filter(t=>t.machine===id&&t.start<end&&t.end>start);
  const spans=tasks.map(t=>[Math.max(start,t.start),Math.min(end,t.end)]);
  const known=Array.isArray(plan?.tasks)&&!model.tasks.some(t=>t.machine===id&&t.status==='scheduled'&&!validInterval(t.start,t.end));
  const busyMinutes=known?union(spans):null;
  return {id,busyMinutes,unallocatedMinutes:known?end-start-busyMinutes:null,availableNow:null,taskIds:tasks.map(t=>t.id),inputRefs:refs('machines',(input?.machines||[]).filter(r=>r['设备编号']===id))};
 });
 const reservations=[...new Map(model.reservations.map(r=>[JSON.stringify([r.type,r.resourceId,r.unit,r.start,r.end,r.quantity,[...(r.taskIds||[])].sort(),r.resourceBatchId??null,r.declarationId??null,r.productionBatchId??null,r.taskId??null,r.demandKey??null,r.postId??null,r.roleSource??null,r.poolId??null]),r])).values()];
 const configs=[...refs('tools',input?.tools||[]).map(r=>({...r,type:'工装',id:r.row['工装编码'],capacity:r.row['可用数量']})),...refs('personnelGroups',input?.personnelGroups||[]).map(r=>({...r,type:'人员',id:r.row['人员组编号'],capacity:r.row['人员数量']})),...refs('batchResources',(input?.batchResources||[]).filter(r=>r['资源类型']?.includes('空间'))).map(r=>({...r,type:'空间',id:r.row['资源编号'],capacity:r.row['容量']}))];
 const declarations=[...refs('dependencies',input?.dependencies||[]),...refs('resourceClaims',input?.resourceClaims||[])].filter(d=>['人员技能','工装','空间'].includes(d.row['资源类型'])).flatMap(d=>(d.row['资源类型']==='人员技能'?personnelCandidates(d.row):[d.row['资源编号']]).map(id=>({...d,type:d.row['资源类型']==='人员技能'?'人员':d.row['资源类型'],id,candidateGroupIds:d.row['候选人员组']?.trim()?personnelCandidates(d.row):null})));
 const keys=unique([...configs.map(c=>JSON.stringify([c.type,c.id])),...declarations.map(c=>JSON.stringify([c.type,c.id])),...reservations.filter(r=>r.type!=='设备').map(r=>JSON.stringify([r.type,r.resourceId]))]);
 const resources=keys.map(key=>{
  const [type,id]=JSON.parse(key),config=configs.find(c=>c.type===type&&c.id===id);
  const demandRows=declarations.filter(d=>d.type===type&&d.id===id);
  const demands=demandRows.map(d=>({candidateGroupIds:d.candidateGroupIds,quantity:d.row['需求数量']??null,unit:d.row['单位']||(type==='人员'?'人':'未知'),orderId:d.row['订单编号'],operation:d.row['工序编号'],taskIds:model.tasks.filter(t=>t.orderId===d.row['订单编号']&&t.operation===d.row['工序编号']).map(t=>t.id)}));
  const all=reservations.filter(r=>r.type===type&&r.resourceId===id);
  const rows=all.filter(r=>validInterval(r.start,r.end)&&r.start<end&&r.end>start);
  const units=unique(all.map(r=>r.unit).filter(Boolean));
  const invalid=all.some(r=>!validInterval(r.start,r.end)||exact(r.quantity)===null)||units.length>1;
  const points=unique(rows.flatMap(r=>[Math.max(start,r.start),Math.min(end,r.end)])).sort((a,b)=>a-b);
  let peak=Q.zero,integral=Q.zero;
  for(let i=0;i<points.length-1;i++){
   const active=rows.filter(r=>r.start<=points[i]&&r.end>points[i]);const q=sum(active.map(r=>r.quantity));
   if(q){if(Q.cmp(q,peak)>0n)peak=q;integral=Q.add(integral,Q.mul(q,Q.q(String(points[i+1]-points[i]))));}
  }
  const known=all.length>0&&!invalid;
  return {type,id,unit:units.length===1?units[0]:config?.row['单位']||(type==='人员'?'人':'未知'),capacity:number(config?.capacity),availableNow:null,status:known?'saved-reservations':'unknown',peak:known?amount(peak):null,quantityMinutes:known?amount(integral):null,reservations:rows,demands,taskIds:unique([...rows.flatMap(r=>r.taskIds||[]),...demands.flatMap(d=>d.taskIds)]),inputRefs:[...(config?[{table:config.table,row:config.row}]:[]),...demandRows.map(d=>({table:d.table,row:d.row}))]};
 });
 for(const pool of input?.personnelPools||[]){
  const members=(input.personnelGroups||[]).filter(g=>g.poolId===pool.poolId),rows=reservations.filter(r=>r.type==='人员'&&members.some(g=>g['人员组编号']===r.resourceId)&&validInterval(r.start,r.end)&&r.start<end&&r.end>start);
  const points=unique(rows.flatMap(r=>[Math.max(start,r.start),Math.min(end,r.end)])).sort((a,b)=>a-b);let peak=Q.zero,integral=Q.zero;
  for(let i=0;i<points.length-1;i++){const q=sum(rows.filter(r=>r.start<=points[i]&&r.end>points[i]).map(r=>r.quantity));if(q){if(Q.cmp(q,peak)>0n)peak=q;integral=Q.add(integral,Q.mul(q,Q.q(String(points[i+1]-points[i]))));}}
  resources.push({type:'物理人员池',id:pool.poolId,unit:'人',capacity:number(pool['总人数']),availableNow:null,status:rows.length?'saved-reservations':'unknown',peak:rows.length?amount(peak):null,quantityMinutes:rows.length?amount(integral):null,reservations:rows,demands:[],taskIds:unique(rows.flatMap(r=>r.taskIds||[r.taskId])),inputRefs:[{table:'personnelPools',row:pool},...refs('personnelGroups',members)]});
 }
 const materials=(plan?.materialDemands||[]).map((m,index)=>({...m,index,taskIds:[m.taskId],allocated:Array.isArray(m.allocations)?amount(sum(m.allocations.map(a=>a.exactQuantity??a.quantity))):null,committedConsumption:m.committed?(Array.isArray(m.allocations)?amount(sum(m.allocations.map(a=>a.exactQuantity??a.quantity))):null):amount(Q.zero),exactGap:m.exactShortage??amount(exact(m.shortage))?.exact??null,inputRefs:[...refs('bom',(input?.bom||[]).filter(r=>r['物料编号']===m.materialId&&r['产品编号']===m.productId&&r['投料工序编号']===m.operation)),...refs('inventory',(input?.inventory||[]).filter(r=>r['物料编号']===m.materialId)),...refs('supplies',(input?.supplies||[]).filter(r=>r['物料编号']===m.materialId))]}));
 const alerts=loadAlerts(plan,model,materials);
 return {provenance:{planId:plan?.id??null,runId:plan?.runId??null,inputVersion:plan?.inputVersionId??plan?.inputVersion??null,snapshotHash:plan?.snapshotHash??null,status:plan?.status??null,lines:input?unique([...(input.orders||[]),...(input.machines||[])].map(r=>r['产线编号']).filter(Boolean)):null,executionFactsVersion:plan?.conditions?.executionFactsVersion??null},window:{start,end},machines,resources,materials,alerts,hasInput:!!input,limits:loadLimits};
}

function loadAlerts(plan,model,materials){
 const input=model.input,alerts=[];
 const add=a=>alerts.push({quantity:null,unit:'未知',minute:null,taskIds:[],inputRefs:[],...a});
 if(!input)add({code:'MISSING_SAVED_INPUT',message:'缺少保存原始输入；负荷配置、条件与原始数据未知'});
 for(const m of materials)if(number(m.shortage)>0)add({code:'MATERIAL_SHORTAGE',message:m.blockedReason||m.suggestion||'保存的投料物料缺口；候选分配未提交',quantity:m.shortage,exactQuantity:m.exactGap,unit:m.unit,minute:m.feedMinute,taskIds:m.taskIds,resourceId:m.materialId,inputRefs:m.inputRefs});
 for(const o of plan?.deliveryAssessment?.orders||[]){
  if(o.delayMinutes>0||o.knownLateQuantity>0)add({code:'ORDER_LATE',message:(o.reasons||[]).map(r=>r.message).join('；')||'保存的附条件预计可交付晚于要求',quantity:o.delayedQuantity??o.knownLateQuantity,unit:o.unit,minute:o.expectedDeliverableMinute,delayMinutes:o.delayMinutes,dueMinute:o.dueMinute,taskIds:o.taskIds,orderId:o.orderId,inputRefs:refs('orders',(input?.orders||[]).filter(r=>r['订单编号']===o.orderId))});
  else if(o.delayMinutes==null)add({code:'ORDER_DELIVERY_UNKNOWN',message:(o.reasons||[]).map(r=>r.message).join('；')||'交付与延后尚未检查；不能当作零延后',quantity:o.unknownDeliverableQuantity,unit:o.unit,taskIds:o.taskIds,orderId:o.orderId,inputRefs:refs('orders',(input?.orders||[]).filter(r=>r['订单编号']===o.orderId))});
 }
 if(!plan?.deliveryAssessment)add({code:'DELIVERY_UNCHECKED',message:'无保存交付评估；订单延后未知'});
 // Expected arrivals remain conditional. An explicit saved delay/missing reference can prove an unmet condition;
 // passage of wall-clock time alone never proves that goods failed to arrive.
 const uses=input?.supplyUses||[];
 for(const use of uses){
  const supply=input.supplies?.find(s=>s['供给编号']===use['供给编号']);
  const taskIds=model.tasks.filter(t=>t.orderId===use['订单编号']&&t.operation===use['工序编号']).map(t=>t.id);
  const delays=(input.supplyDelays||[]).filter(r=>r['供给编号']===use['供给编号']);
  const effective=supply?resolveExpectedSupply([supply],delays)[0]:null;
  const ready=effective?(Date.parse(effective['生效可用时间'])-Date.parse(PLAN_TIME_ORIGIN))/60000:null;
  const related=materials.filter(m=>m.orderId===use['订单编号']&&m.operation===use['工序编号']&&m.materialId===supply?.['物料编号']);
  const unmet=!supply||related.some(m=>number(m.feedMinute)!==null&&Number.isFinite(ready)&&ready>m.feedMinute)||delays.length>0;
  add({code:unmet?'CONDITIONAL_ARRIVAL_UNMET':'CONDITIONAL_ARRIVAL',message:!supply?'引用的模拟供给缺失':`${unmet?'原预计条件未满足或投料早于可用时间':'模拟到料仍附条件；未确认真实到货'}；${delays.map(d=>d['原因']).join('；')}；预计可用 ${effective?.['生效可用时间']||'未知'}`,quantity:number(use['使用数量']),unit:input?.materials?.find(m=>m['物料编号']===supply?.['物料编号'])?.['单位']||related[0]?.unit||'未知',minute:Number.isFinite(ready)?ready:null,taskIds,resourceId:use['供给编号'],inputRefs:[{table:'supplyUses',row:use},...refs('supplies',supply?[supply]:[]),...refs('supplyDelays',delays)]});
 }
 for(const task of model.tasks)for(const r of task.reasons||[])add({code:r.classification==='data-repair'||/CONFIG|INPUT|MISSING|UNKNOWN/.test(r.code)?'MISSING_INPUT':r.code,message:`${r.code}：${r.message}`,quantity:task.quantity,unit:task.unit,minute:task.status==='scheduled'?task.start:task.assessment?.candidateMinute??null,candidate:task.status==='unplanned',taskIds:[task.id],inputRefs:task.assessment?.inputRefs||[],context:r.context??null});
 for(const f of plan?.resultAssessment?.globalFindings||[])add({code:f.code,message:f.message,taskIds:f.taskIds||[],context:f.context??null});
 return alerts;
}

export function loadCsv(report,kind='all'){
 const rows=[['FR032 保存方案资源负荷（计划模拟；非实时可用）'],['来源',JSON.stringify(report.provenance)],['窗口分钟 [开始,结束)',report.window.start,report.window.end],['边界',report.limits.join('；')],['类别','保存行 JSON（数量/单位/时间/任务/原始输入）']];
 for(const category of ['machines','resources','materials','alerts'].filter(c=>kind==='all'||c===kind))for(const row of report[category])rows.push([category,JSON.stringify(row)]);
 return rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
}
