import {quantityMath as Q,createMaterialAllocator,materialPolicy} from './material-allocation.mjs';
import {claimsFor,previewResources,jointFlags} from './joint-resources.mjs';
import {effectivePersonnelRequirements,allocatePersonnel} from './staffing.mjs';
import {allowedWindows,windowFit} from './working-windows.mjs';
import {inheritedCalendarId} from './factory-lines.mjs';
import {prepareCoolingMembers} from './process-cooling-adapter.mjs';
import {scheduleCoolingPairs} from './process-cooling.mjs';
import {establishProcessProduction,operationMachine,processDemands,selectedRecipe,processRouteContract} from './process-route.mjs';

// Server-owned constructive path for the bounded kg/fixed-program pair. A private
// candidate contains all resource ledgers and multi-time material deductions.
export function scheduleProcessRoute(data,orders,at,conditions){
 const {records,contexts}=establishProcessProduction(data,orders),byId=new Map(records.map(b=>[b.id,b]));
 const tasks=[],reservations=[],materialDemands=[],attempts=[],findings=[],groups=[];
 const allocator=createMaterialAllocator(data,materialPolicy(data,at)),flags=jointFlags(data,at);
 const start=conditions.startMinute??0,end=conditions.endMinute??Math.max(...data.calendars.map(r=>Number(r['结束分钟'])));
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start)throw Error('配对须有合法整数计划区间');
 if((data.executionFacts||[]).length||(data.simulationEvents||[]).length||Object.keys(conditions.taskPositions||{}).length)throw Error('配对路线尚不支持执行事实/事件恢复或固定位置组合；未释放保护');
 const idFor=(b,op)=>JSON.stringify([b.orderId,b.index,op]);
 const issue=(b,operations,message,code='UNPLANNED / PROCESS_PAIR')=>findings.push({code,message,taskIds:operations.map(op=>idFor(b,op)),context:{productionBatchId:b.id}});
 const materialNext=minute=>allocator.futureMinutes.find(t=>t>minute);
 const newCandidate=()=>({tasks:[],reservations:[],materials:allocator.begin()});
 function previewOperation(candidate,members,op,startMinute,resourceBatchId){
  const first=members[0],context=contexts.get(first.orderId),machine=operationMachine(data,first.orderId,op['工序编号']);
  const time=data.times.find(t=>t['产品编号']===first.order['产品编号']&&t['工序编号']===op['工序编号']),duration=Number(time['固定分钟']),finish=startMinute+duration;
  const all=[...reservations,...candidate.reservations],taskIds=members.map(b=>idFor(b,op['工序编号']));
  const fail=(reason,next,kind)=>({ok:false,reason,next,kind,operation:op['工序编号'],memberIds:members.map(b=>b.id),start:startMinute});
  if(finish>end)return fail('完整工序超出计划范围',undefined,'HORIZON');
  const windows=allowedWindows(data,inheritedCalendarId(data,machine),'设备',machine['设备编号'],start,end),fit=windowFit(windows,startMinute,finish);
  if(!fit.ok)return fail('机器完整区间不在工厂/停机窗口',fit.nextStart,'CALENDAR');
  const conflict=all.find(r=>r.type==='设备'&&r.resourceId===machine['设备编号']&&r.start<finish&&r.end>startMinute);
  if(conflict)return fail('设备已有占用',conflict.end,'MACHINE');
  const isHeat=op===context.heat,basis=machine['装载计量基准'];
  const load=members.reduce((s,b)=>Q.add(s,Q.fromExact(basis==='合格产出'?b.qualifiedKg:b.inputKg)),Q.zero);
  if(Q.cmp(load,Q.q(machine['最小装载kg']))<0n||Q.cmp(load,Q.q(machine['最大装载kg']))>0n)return fail('装载不在上下限；不自动超产',undefined,'LOAD');
  if(members.length>1&&!isHeat)return fail('仅加工资源批允许合炉',undefined,'GROUP');
  const calendarId=inheritedCalendarId(data,machine);
  let claims=claimsFor(data,members,op['工序编号'],flags).map(c=>c.type==='工装'?{...c,allowedWindows:allowedWindows(data,calendarId,c.type,c.resourceId,c.availableFrom,c.availableUntil)}:c);
  // The declared cooling space uses the production member's qualified output.
  // A numeric declaration must agree; it is never multiplied as furnace input.
  const resource=previewResources(claims,startMinute,finish,all);
  if(!resource.ok)return fail(resource.reason,resource.nextStart,'RESOURCE');
  const requirements=effectivePersonnelRequirements(members.flatMap(b=>data.dependencies.filter(d=>d['订单编号']===b.orderId&&d['工序编号']===op['工序编号']&&d['资源类型']==='人员技能').map(d=>({...d,__policyRoleSource:b.id}))),data.personnelGroups,data.personnelPools||[]);
  const personnel=allocatePersonnel(requirements,data.personnelGroups,startMinute,finish,all.filter(r=>r.type==='人员').map(r=>({...r,groupId:r.resourceId,count:Number(r.quantity)})),data.skillSubstitutions||[],data.personnelPools||[],{data,calendarId});
  if(!personnel.ok){
   const next=[personnel.nextStart,...all.filter(r=>r.type==='人员'&&r.end>startMinute).map(r=>r.end),...data.personnelGroups.map(g=>Number(g['可用起始分钟']))].filter(t=>Number.isFinite(t)&&t>startMinute);
   return fail(personnel.reason,next.length?Math.min(...next):undefined,'PERSONNEL');
  }
  const demands=members.flatMap(b=>processDemands(data,b,op['工序编号'],startMinute).map(d=>({...d,resourceBatchId})));
  const allocation=candidate.materials.stage(demands,startMinute);
  if(!allocation.ok)return fail('物料不足；整份候选未提交',materialNext(startMinute),'MATERIAL');
  candidate.reservations.push(...resource.allocations.map(r=>({...r,taskIds:r.productionBatchId?members.filter(b=>b.id===r.productionBatchId).map(b=>idFor(b,op['工序编号'])):taskIds})),...personnel.allocations.map(r=>({...r,type:'人员',resourceId:r.groupId,quantity:String(r.count),unit:'人',taskIds})),{type:'设备',resourceId:machine['设备编号'],quantity:'1',unit:'台',start:startMinute,end:finish,taskIds,resourceBatchId});
  for(const b of members){
   const prior=op['前序工序']?idFor(b,op['前序工序']):'',actual=[...tasks,...candidate.tasks].find(t=>t.id===prior);
   if(prior&&(!actual||actual.end>startMinute))return fail('实际前序缺失/尚未完成',undefined,'PREDECESSOR');
   candidate.tasks.push({id:idFor(b,op['工序编号']),orderId:b.orderId,productId:b.order['产品编号'],productionBatchId:b.id,productionBatchIndex:b.index,resourceBatchId,batchGroupId:resourceBatchId,operation:op['工序编号'],label:op['工序名称'],machine:machine['设备编号'],start:startMinute,end:finish,duration,predecessor:prior,quantity:b.quantity,exactQuantity:b.qualifiedKg,quantityUnit:'kg',loadKg:Q.num(Q.fromExact(basis==='合格产出'?b.qualifiedKg:b.inputKg)),exactLoadKg:basis==='合格产出'?b.qualifiedKg:b.inputKg,loadBasis:basis,program:op['程序编号']||'',source:processRouteContract+' · 实际前序/完整联合候选',timingReasons:[]});
  }
  return {ok:true};
 }
 const accept=c=>{for(const t of c.tasks)t.timingReasons=attempts.filter(a=>(a.memberIds||[]).includes(t.productionBatchId)||(a.taskIds||[]).includes(t.id)||a.memberId===t.productionBatchId).map(a=>({...a}));c.materials.commit();tasks.push(...c.tasks);reservations.push(...c.reservations);materialDemands.push(...c.materials.rows);};
 function individual(b,op){
  const previous=op['前序工序']?tasks.find(t=>t.id===idFor(b,op['前序工序'])):null;
  if(op['前序工序']&&!previous){issue(b,[op['工序编号']],'实际前序未排；未占用任何候选');return false;}
  let minute=Math.max(start,previous?.end??start);
  for(let i=0;i<1000;i++){
   const c=newCandidate();let checked;try{checked=previewOperation(c,[b],op,minute,JSON.stringify([b.id,op['工序编号']]));}catch(e){checked={ok:false,reason:e.message};}
   attempts.push({stage:'individual',taskIds:[idFor(b,op['工序编号'])],candidate:minute,...checked});
   if(checked.ok){accept(c);return true;}c.materials.rollback();
   if(checked.next>minute){minute=checked.next;continue;}issue(b,[op['工序编号']],checked.reason);return false;
  }
  issue(b,[op['工序编号']],'候选达到1000次边界；不表示全局无解');return false;
 }
 // Actual upstream operations, one immutable production identity at a time.
 for(const b of records){const ctx=contexts.get(b.orderId),prefix=ctx.heat?ctx.route.slice(0,ctx.heatIndex):ctx.route;for(const op of prefix)individual(b,op);}
 const paired=records.filter(b=>contexts.get(b.orderId).heat);
 const prepared=prepareCoolingMembers({data,productionBatches:paired,upstreamTasks:tasks,startMinute:start,endMinute:end});
 for(const f of prepared.findings)for(const memberId of f.memberIds){const b=byId.get(memberId),ctx=contexts.get(b.orderId);issue(b,[ctx.heat['工序编号'],ctx.cool['工序编号']],f.message);}
 const pending=[...prepared.members],heatFloor=new Map(),coolFloor=new Map(),recipeAt=new Map();
 const upstreamRecipe=m=>materialDemands.filter(d=>d.productionBatchId===m.id&&d.committed).map(d=>[d.operation,d.materialId,d.version,d.effective]);
 const busy=()=>reservations.filter(r=>['设备','空间'].includes(r.type)).map(r=>({resource:(r.type==='设备'?'machine:':'space:')+r.resourceId,quantity:r.quantity,start:r.start,end:r.end}));
 while(pending.length){
  let done=false,limit=pending.length,lastCandidate=null,lastMessage='候选达到1000次边界；不表示全局无解';
  for(let retry=0;retry<1000;retry++){
   const members=pending.slice(0,limit).map(m=>({...m,readyMinute:Math.max(m.readyMinute,heatFloor.get(m.id)||0),recipeKey:JSON.stringify([selectedRecipe(data,m.productId,recipeAt.get(m.id)??m.readyMinute),upstreamRecipe(m)]),coolWindows:m.coolWindows.map(([a,b])=>[Math.max(a,coolFloor.get(m.id)||0),b]).filter(([a,b])=>b>a)}));
   const proposal=scheduleCoolingPairs({members,reservations:busy(),endMinute:end});
   attempts.push(...proposal.attempts.map(a=>({...a,stage:'pair-proposal',retry:retry+1})));
   const group=proposal.groups[0];
   if(!group){lastMessage=proposal.findings.map(f=>f.message).join('；')||lastMessage;break;}
   // A rejected first-priority member must not silently disappear because a later
   // group has a valid proposal. Preserve its explicit unplanned finding.
   if(!group.memberIds.includes(pending[0].id)){lastMessage=proposal.findings.filter(f=>f.memberIds.includes(pending[0].id)).map(f=>f.message).join('；');break;}
   const selected=group.memberIds.map(id=>byId.get(id)),ctx=contexts.get(selected[0].orderId);
   const heatTime=proposal.tasks.find(t=>t.productionBatchId===selected[0].id&&t.operation===ctx.heat['工序编号']).start;
   let recipeChanged=false;
   for(const b of selected){const m=members.find(m=>m.id===b.id),key=JSON.stringify([selectedRecipe(data,m.productId,heatTime),upstreamRecipe(m)]);if(key!==m.recipeKey){recipeAt.set(b.id,heatTime);recipeChanged=true;}}
   if(recipeChanged){attempts.push({stage:'pair-recipe-rebuild',memberIds:group.memberIds,heatTime,retry:retry+1});continue;}
   const resourceBatchId=JSON.stringify(['R4-HEAT-'+(groups.length+1),ctx.heat['工序编号']]);
   const c=newCandidate();lastCandidate=c;let checked;
   try{
    checked=previewOperation(c,selected,ctx.heat,heatTime,resourceBatchId);
    if(checked.ok){
     const coolTasks=proposal.tasks.filter(t=>group.memberIds.includes(t.productionBatchId)&&t.operation===contexts.get(t.orderId).cool['工序编号']).sort((a,b)=>a.start-b.start);
     for(const t of coolTasks){const b=byId.get(t.productionBatchId);checked=previewOperation(c,[b],contexts.get(b.orderId).cool,t.start,JSON.stringify([b.id,t.operation]));if(!checked.ok)break;}
    }
   }catch(e){checked={ok:false,reason:e.message};}
   attempts.push({stage:'pair-joint',retry:retry+1,heatTime,memberIds:group.memberIds,...checked});
   if(checked.ok){
    accept(c);groups.push({id:resourceBatchId,groupId:resourceBatchId,operation:ctx.heat['工序编号'],machine:c.tasks[0].machine,members:group.memberIds,loadKg:Q.num(Q.fromExact(group.exactInputKg)),exactLoadKg:group.exactInputKg,minimum:Number(operationMachine(data,selected[0].orderId,ctx.heat['工序编号'])['最小装载kg']),maximum:Number(operationMachine(data,selected[0].orderId,ctx.heat['工序编号'])['最大装载kg']),basis:'BOM总投入',program:ctx.heat['程序编号'],status:'scheduled'});
    for(const id of group.memberIds)pending.splice(pending.findIndex(m=>m.id===id),1);done=true;break;
   }
   c.materials.rollback();lastMessage=checked.reason;
   if(checked.next>checked.start){
    const isCool=checked.operation===ctx.cool['工序编号'];
    // If members of this same candidate compete for a resource beyond the wait
    // window, retry a smaller furnace group instead of chasing both forever.
    if(isCool&&selected.length>1&&checked.next>heatTime+members[0].heatDuration+members[0].maxWait){limit=1;continue;}
    if(isCool)for(const id of checked.memberIds)coolFloor.set(id,checked.next);
    else for(const id of group.memberIds)heatFloor.set(id,checked.next);
    continue;
   }
   if(selected.length>1){limit=1;continue;}break;
  }
  if(!done){
   const m=pending.shift(),b=byId.get(m.id),ctx=contexts.get(b.orderId);
   issue(b,[ctx.heat['工序编号'],ctx.cool['工序编号']],lastMessage+'；整对设备/空间/工装/人员/物料候选已丢弃');
   if(lastCandidate)materialDemands.push(...lastCandidate.materials.rows.filter(r=>r.productionBatchId===b.id).map(r=>({...r,committed:false,blockedReason:lastMessage})));
  }
 }
 // Downstream starts only after the whole pair was committed.
 for(const b of records){const ctx=contexts.get(b.orderId);if(ctx.cool)for(const op of ctx.route.slice(ctx.coolIndex+1))individual(b,op);}
 // Include individual operation groups as well; only heat groups have >1 member.
 for(const t of tasks.filter(t=>!groups.some(g=>g.id===t.resourceBatchId))){const m=operationMachine(data,t.orderId,t.operation);groups.push({id:t.resourceBatchId,groupId:t.resourceBatchId,operation:t.operation,machine:t.machine,members:[t.productionBatchId],loadKg:t.loadKg,exactLoadKg:t.exactLoadKg,minimum:Number(m['最小装载kg']),maximum:Number(m['最大装载kg']),basis:t.loadBasis,status:'scheduled'});}
 return {tasks,findings,resourceReservations:reservations,materialDemands,jointAttempts:attempts.map(a=>({...a,taskIds:a.taskIds||records.filter(b=>(a.memberIds||[a.memberId]).includes(b.id)).flatMap(b=>{const ctx=contexts.get(b.orderId);return ctx.heat?[idFor(b,ctx.heat['工序编号']),idFor(b,ctx.cool['工序编号'])]:[];})})),productionBatches:records.map(({order,...b})=>b),resourceBatches:groups,batchChecked:true,materialChecked:true,jointResourceChecks:flags,processRouteContract};
}
