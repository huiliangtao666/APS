import {validateSharingProfile,lineCandidates} from './b16-sharing.mjs';
import {independentlyVerifyPlan} from './independent-verification.mjs';
import {quantityMath as Q} from './material-allocation.mjs';
import {sourceRefs} from './problem-records.mjs';

export const b16Capability='B16-multiline-v1';
export const b16Defs=[
 {key:'b16Profiles',label:'B16多线配置（显式可替换模拟）',file:'38_B16多线配置.csv',fields:['配置编号','配置JSON']},
 {key:'b16MachineOptions',label:'B16逐线设备候选',file:'39_B16逐线设备候选.csv',fields:['订单编号','工序编号','产线编号','设备编号']},
];
const issue=(code,message,taskIds=[],relatedRecords=[])=>({code:'B16 / '+code,message,taskIds,relatedRecords});
const rows=data=>Object.fromEntries(['orders','products','materials','machines','routes','times','factoryLines','inventory','supplies','supplyDelays','supplyUses','bom','rules','tools','personnelGroups','personnelPools','dependencies','resourceClaims','batchResources','skillSubstitutions','calendars','downtime','resourceStops'].map(k=>[k,data[k]||[]]));
const machineAllowed=(profile,m,line)=>m?.['产线编号']===line||profile.machineScopes?.some(s=>s.resourceId===m?.['设备编号']&&s.allowCrossLine===true&&s.lineIds.includes(line));
export function applicationProfile(data,id){
 const records=(data.b16Profiles||[]).filter(r=>r['配置编号']===id);
 if(records.length!==1)throw Error('B16 配置编号不存在或不唯一，请在数据与CSV维护B16多线配置');
 let profile;try{profile=JSON.parse(records[0]['配置JSON']);}catch{throw Error('B16 配置JSON须为有效对象');}
 if(Array.isArray(profile?.selections)&&profile.selections.some(s=>!(data.orders||[]).some(o=>o['订单编号']===s.orderId)))throw Error('B16选线配置引用未知订单');
 const findings=validateB16Scope(profile,data);
 if(findings.length)throw Error(findings.map(f=>f.message).join('；'));
 return profile;
}
export function validateB16Configuration(data){
 const findings=[];
 for(const r of data.b16Profiles||[]){try{applicationProfile(data,r['配置编号']);}catch(e){findings.push({...issue('CONFIG',e.message),table:'b16Profiles',field:'配置JSON',row:(data.b16Profiles||[]).indexOf(r)+2,file:b16Defs[0].file});}}
 for(const [i,r] of (data.b16MachineOptions||[]).entries()){
  const order=(data.orders||[]).find(o=>o['订单编号']===r['订单编号']),machine=(data.machines||[]).find(m=>m['设备编号']===r['设备编号']);
  if(!order||!machine||machine['工序编号']!==r['工序编号']||!(data.routes||[]).some(op=>op['产品编号']===order['产品编号']&&op['工序编号']===r['工序编号'])||!(data.factoryLines||[]).some(l=>l['产线编号']===r['产线编号']))findings.push({...issue('MACHINE_OPTION','逐线设备候选须引用已有订单、合法工序、设备及产线'),table:'b16MachineOptions',field:'设备编号',row:i+2,file:b16Defs[1].file});
 }
 return findings;
}
export function validateB16Scope(profile,data){
 const d=rows(data);let findings;
 profile=profile&&{...profile,selections:Array.isArray(profile.selections)?profile.selections.filter(s=>d.orders.some(o=>o["订单编号"]===s.orderId)):profile.selections};
 try{findings=validateSharingProfile(profile,d);}catch{ return [issue('PROFILE','多线配置结构无效；需要显式lines/products/resources/materials/selections')]; }
 if(findings.length)return findings;
 if(profile.machineScopes!==undefined&&!Array.isArray(profile.machineScopes))return [issue('MACHINE_SCOPE','machineScopes须为显式数组')];
 const scopes=profile.machineScopes||[],seen=new Set();
 for(const s of scopes){const machine=d.machines.find(m=>m['设备编号']===s.resourceId);
  if(!machine||seen.has(s.resourceId)||!Array.isArray(s.lineIds)||!s.lineIds.length||new Set(s.lineIds).size!==s.lineIds.length||s.lineIds.some(id=>!profile.lines.some(l=>l.id===id))||s.capacity!=='1'||s.factoryId!==profile.lines[0].factoryId||typeof s.allowCrossLine!=='boolean'||s.lineIds.length>1&&!s.allowCrossLine||!s.lineIds.includes(machine?.['产线编号']))findings.push(issue('MACHINE_SCOPE','物理设备须唯一身份、容量1、同厂显式适用线与共享许可：'+s.resourceId));
  seen.add(s.resourceId);
 }
 for(const order of d.orders){const candidate=lineCandidates(profile,order['产品编号'],profile.selections.find(s=>s.orderId===order['订单编号']));if(candidate.status!=='pass')findings.push(issue('SELECTION',order['订单编号']+'：'+candidate.reason));}
 for(const g of d.personnelGroups)if(!g['技能']||!g['班次']||!/^\d+$/.test(g['可用起始分钟']||'')||!/^\d+$/.test(g['可用结束分钟']||'')||Number(g['可用结束分钟'])<=Number(g['可用起始分钟']))findings.push(issue('SHIFT','人员须显式技能、班次和可用区间：'+g['人员组编号']));
 return findings;
}
// No new score: declared product-line order, existing task priority and first
// complete feasible candidate. Bounded search never claims global infeasibility.
export function assignmentCandidates(profile,data){
 let assignments=[{}];const choices=[];
 for(const order of data.orders){
  const oid=order['订单编号'];const selected=profile.selections.find(s=>s.orderId===oid);
  const possible=lineCandidates(profile,order['产品编号'],selected);
  if(possible.status!=='pass')throw Error('B16 '+oid+' '+possible.reason);
  const candidates=possible.candidates.filter(line=>(data.routes||[]).filter(op=>op['产品编号']===order['产品编号']).every(op=>{
   const options=(data.b16MachineOptions||[]).filter(r=>r['订单编号']===oid&&r['工序编号']===op['工序编号']&&r['产线编号']===line);
   return options.length===1&&data.machines.some(m=>m['设备编号']===options[0]['设备编号']&&m['工序编号']===op['工序编号']&&machineAllowed(profile,m,line));
  }));
  if(!candidates.length)throw Error('B16 '+oid+' 没有完整合法逐工序设备候选；请维护39_B16逐线设备候选.csv');
  choices.push({orderId:oid,mode:selected.mode,legalLines:possible.candidates,completeMachineCandidates:candidates});
  if(assignments.length*candidates.length>128)throw Error('B16 自动候选组合超过128，请显式指定部分订单产线后再试；不表示无解');
  assignments=assignments.flatMap(a=>candidates.map(line=>({...a,[oid]:line})));
 }
 if(!data.orders.length)throw Error('B16 没有选中订单');
 return {policy:'显式适用线顺序中首个完整可行候选；沿用本次既有任务排序；不承诺全局最优',limit:128,choices,assignments};
}
export function resolveAssignment(data,profile,assignment){
 const resolved=structuredClone(data);
 resolved.orders=resolved.orders.map(o=>({...o,'产线编号':assignment[o['订单编号']]}));
 resolved.dependencies=resolved.dependencies.filter(d=>d['资源类型']!=='设备');
 for(const order of resolved.orders)for(const op of resolved.routes.filter(r=>r['产品编号']===order['产品编号'])){
  const oid=order['订单编号'],line=assignment[oid];
  const option=resolved.b16MachineOptions.find(r=>r['订单编号']===oid&&r['工序编号']===op['工序编号']&&r['产线编号']===line);
  const original=data.dependencies.find(d=>d['订单编号']===oid&&d['工序编号']===op['工序编号']&&d['资源类型']==='设备');
  resolved.dependencies.push({...original,'订单编号':oid,'工序编号':op['工序编号'],'资源类型':'设备','资源编号':option['设备编号'],'需求数量':'1'});
 }
 return resolved;
}
export function validateB16PlanScope(plan,data,conditions){
 const profile=conditions?.b16Profile;
 if(!data||!profile)return [issue('FROZEN','缺少冻结的B16配置或输入')];
 const findings=validateB16Scope(profile,data);if(findings.length)return findings;
 const assignments=plan.lineAssignments||Object.fromEntries(data.orders.map(o=>[o['订单编号'],o['产线编号']]));
 const refs=(table,records)=>sourceRefs(table,records,data[table]||[]);
 const usedLines=(ids)=>[...new Set(ids.map(id=>plan.tasks.find(t=>t.id===id)).filter(Boolean).map(t=>assignments[t.orderId]))];
 for(const t of plan.tasks||[]){
  const order=data.orders.find(o=>o['订单编号']===t.orderId),machine=data.machines.find(m=>m['设备编号']===t.machine),line=assignments[t.orderId];
  const allowed=order?lineCandidates(profile,order['产品编号'],profile.selections.find(s=>s.orderId===t.orderId)):null;
  const options=(data.b16MachineOptions||[]).filter(r=>r['订单编号']===t.orderId&&r['工序编号']===t.operation&&r['产线编号']===line);
  if(!order||allowed?.status!=='pass'||!allowed.candidates.includes(line)||t.lineId!==undefined&&t.lineId!==line||!machine||machine['工序编号']!==t.operation||!machineAllowed(profile,machine,line)||options.length!==1||options[0]['设备编号']!==t.machine||t.productId!==order['产品编号'])findings.push(issue('APPLICABILITY','任务/产品/所选产线/显式设备候选不匹配：'+t.id,[t.id],[...refs('orders',order?[order]:[]),...refs('machines',machine?[machine]:[]),...refs('b16MachineOptions',options)]));
 }
 for(const order of data.orders){
  const remaining=Q.sub(Q.q(order['合格需求']),Q.q(order['已完成合格数量']||'0'));
  for(const op of data.routes.filter(r=>r['产品编号']===order['产品编号'])){
   const tasks=(plan.tasks||[]).filter(t=>t.orderId===order['订单编号']&&t.operation===op['工序编号']);
   try{const total=tasks.reduce((n,t)=>Q.add(n,t.exactQuantity?Q.fromExact(t.exactQuantity):Q.q(String(t.quantity))),Q.zero);
    if(Q.cmp(total,remaining)!==0n)throw Error();
   }catch{findings.push(issue('QUANTITY','工序合格需求数量未完整覆盖或重复：'+order['订单编号']+' / '+op['工序编号'],tasks.map(t=>t.id)));}
   if(tasks.some(t=>t.end>Number(order['要求可交付分钟'])))findings.push(issue('DUE','候选超过订单明确交期：'+order['订单编号'],tasks.map(t=>t.id)));
  }
 }
 for(const r of plan.resourceReservations||[]){
  const lines=usedLines(r.taskIds||[r.taskId]);
  if(r.type==='设备'){const machine=data.machines.find(m=>m['设备编号']===r.resourceId);if(!machine||lines.some(line=>!machineAllowed(profile,machine,line)))findings.push(issue('MACHINE_SCOPE','设备占用超出显式可用线：'+r.resourceId,r.taskIds||[r.taskId]));continue;}
  if(!['工装','人员'].includes(r.type))continue;
  const scope=profile.resources.find(s=>s.type===r.type&&s.resourceId===r.resourceId);
  if(!scope||lines.some(line=>!scope.lineIds.includes(line))||scope.lineIds.length>1&&!scope.allowCrossLine)findings.push(issue('RESOURCE_SCOPE','占用超出资源显式适用线或共享许可：'+r.resourceId,r.taskIds||[r.taskId]));
 }
 for(const demand of plan.materialDemands||[]){const line=assignments[demand.orderId],scope=profile.materials.find(m=>m.materialId===demand.materialId);if(!scope||!scope.lineIds.includes(line))findings.push(issue('MATERIAL_SCOPE','物料不适用于所选产线：'+demand.materialId,[demand.taskId]));}
 return findings;
}
export function checkB16Plan(plan,data,conditions,at){
 const findings=validateB16PlanScope(plan,data,conditions);
 for(const order of data.orders){
  const oid=order['订单编号'];
  for(const op of data.routes.filter(r=>r['产品编号']===order['产品编号'])){
   const tasks=plan.tasks.filter(t=>t.orderId===oid&&t.operation===op['工序编号']);
   if(!tasks.length&&Q.cmp(Q.q(order['合格需求']),Q.q(order['已完成合格数量']||'0'))>0n)findings.push(issue('COVERAGE','订单工序未完整覆盖：'+oid+' / '+op['工序编号'],[],sourceRefs('orders',[order],data.orders)));
   if(tasks.length>1&&!plan.batchChecked)findings.push(issue('DUPLICATE','非拆批工序重复：'+oid+' / '+op['工序编号'],tasks.map(t=>t.id)));
  }
 }
 const resolved=resolveAssignment(data,conditions.b16Profile,plan.lineAssignments||Object.fromEntries(data.orders.map(o=>[o['订单编号'],o['产线编号']])));
 const report=independentlyVerifyPlan(plan,resolved.orders,resolved.routes,plan.rules,at,resolved,conditions);
 findings.push(...report.findings);
 for(const [name,check]of Object.entries(report.checks))if(check.status==='problem')findings.push(issue('CHECK',name+'：'+check.details.map(v=>typeof v==='string'?v:JSON.stringify(v)).join('；')));
 // These enabled core families must be positively checked; no not_checked PASS.
 for(const name of ['lineScope','machineOverlap','precedence','calendar','resourcePolicies','jointConditions',...((plan.batchChecked||plan.rules.some(id=>['CAPACITY','MAX_LAG'].includes(id)))?['batchAndWait']:[])])if(report.checks[name]?.status!=='pass')findings.push(issue('NOT_CHECKED','必需独立检查未通过：'+name));
 return {contract:b16Capability,status:findings.length||plan.findings.length?'problem':'pass',findings,checks:report.checks,independentReport:report,qaUat:'NOT_EXECUTED'};
}
