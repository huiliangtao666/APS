import {hash,rows} from './workbook-model.mjs';
import {urgentError} from './urgent-order-input.mjs';
import {routeMinutes,laborSegments,boundary,shiftWindows} from './workbook-minute.mjs';
import {batchTrace} from './urgent-workspace-trace.mjs';

export const WORKSPACE_CONTRACT='CR-URGENT-WORKSPACE-20261105:R1';
export const STRATEGIES=['gap','delay','overtime'];
const fail=(field,message)=>{throw urgentError('URGENT_WORKSPACE_POLICY',message,{issues:[{sheet:'插单策略',field,message}]});};
const integer=(n,field)=>{if(!Number.isSafeInteger(n))fail(field,field+'须明确为日历整数分钟，空白不代表0');return n;};
export function validateWorkspace(value,p,d){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('策略','请明确冻结边界与策略');
 const w=structuredClone(value),observed=p.facts.observationMinute;
 integer(w.freezeMinute,'冻结截止');integer(w.semiFreezeMinute,'半冻结截止');
 if(!(observed<=w.freezeMinute&&w.freezeMinute<=w.semiFreezeMinute&&w.semiFreezeMinute<=p.selection.endDay*1440))fail('冻结截止','须满足观察时点≤冻结截止≤半冻结截止≤窗口结束');
 const protection=boundary(d,'重排保护时段',p.selection.startDay);if(w.freezeMinute<observed+protection)fail('冻结截止','冻结截止不能早于当前有效P重排保护时段；请在同源参数页明确维护P值');
 if(!STRATEGIES.includes(w.strategy))fail('策略','请选择空隙插入、允许顺延或显式加班');
 if(!['local','full'].includes(w.scope))fail('修复范围','请选择局部闭包或全量对照');
 if(!Array.isArray(w.seedTaskIds)||w.seedTaskIds.some(x=>typeof x!=='string'))fail('影响起点','须为明确任务列表');
 if(!Array.isArray(w.overtime))fail('加班','须为明确加班列表，无加班填空列表');
 for(const o of w.overtime){
  integer(o.start,'加班开始');integer(o.end,'加班结束');
  const resource=rows(d,'设备与工装').find(r=>r['资源编号']===o.resource&&r['资源类别']==='设备'),crew=rows(d,'班组资源').find(c=>c['班组编号']===o.crew);
  if(!resource||!crew||o.start<observed||o.end<=o.start||Math.floor(o.start/1440)!==Math.floor((o.end-1)/1440)||o.end>p.selection.endDay*1440||!String(o.source||'').trim())fail('加班','加班须明确合格设备、班组、同日非空时段、来源及窗口');
  if(!Number.isSafeInteger(o.people)||o.people<=0||o.people>Number(crew['每班可用人数'])||!Number.isFinite(o.capacityKg)||o.capacityKg<=0)fail('加班容量','须明确配套人数及设备可增加的千克日容量');
  if(!Array.isArray(o.tools)||o.tools.some(id=>!rows(d,'设备与工装').some(r=>r['资源编号']===id&&r['资源类别']==='工装'&&Number(r['可用数量'])>0)))fail('加班工装','须明确可用的实体工装列表');
  if(shiftWindows(d,crew,Math.floor(o.start/1440),o.resource).filter(s=>!s.overtime).some(s=>s.start<o.end&&o.start<s.end))fail('加班时段','加班不得与原有班次重叠重复增加容量');
  if(!rows(d,'工艺路线').some(r=>r['设备组编号']===resource['资源组编号']&&r['班组编号']===o.crew))fail('加班资格','设备与班组没有实际路线资格');
 }
 for(let i=0;i<w.overtime.length;i++)for(const b of w.overtime.slice(i+1)){const a=w.overtime[i];if(a.start<b.end&&b.start<a.end&&(a.resource===b.resource||a.crew===b.crew||a.tools.some(t=>b.tools.includes(t))))fail('加班时段','同设备/班组/实体工装的加班登记不可重叠');}
 if(w.strategy==='overtime'&&!w.overtime.length)fail('加班','开启加班策略还须登记实际配套资源与时段');
 if(!Array.isArray(w.events)||!Array.isArray(w.exceptions))fail('事件','须明确事件和冻结例外列表');
 const ids=new Set();for(const e of w.events){
  if(!e.id||ids.has(e.id)||!['fault','quality'].includes(e.type)||!e.source)fail('事件','事件须有唯一编号、类型及来源');ids.add(e.id);
  integer(e.occurredMinute,'事件发生');integer(e.knownMinute,'事件可知');
  if(e.knownMinute<e.occurredMinute)fail('事件可知','可知时点不得早于发生');
  if(e.type==='fault'){
   if(!rows(d,'设备与工装').some(r=>r['资源编号']===e.resource))fail('故障设备','设备未知');
   if(e.recoveryConfirmed!==true&&e.recoveryConfirmed!==false)fail('恢复确认','须明确恢复是否已确认');
   if(e.recoveryConfirmed){integer(e.recoveryMinute,'恢复时点');if(e.recoveryMinute<e.knownMinute)fail('恢复时点','恢复不得早于故障可知时点');}
  }else if(!e.supplyId)fail('质量批次','须明确实际批次编号');
 }
 for(const x of w.exceptions)if(!x.taskId||!String(x.reason||'').trim()||!Number.isSafeInteger(x.revision)||x.revision<1||!Array.isArray(x.attributes)||x.attributes.some(a=>!['resumeAfterFault'].includes(a)))fail('冻结例外','须明确任务、仅续作属性、原因及修订；不得解除已发生事实');
 return {...w,contract:WORKSPACE_CONTRACT};
}
export function taskZone(t,p,w){const f=p.facts.tasks.find(f=>f.id===t.id);return ['started','completed','locked'].includes(f?.status)?'fact':t.start<w.freezeMinute?'frozen':t.start<w.semiFreezeMinute?'semi':'free';}

// Conservative fixed point over actual route/production, shared resources and
// allocated supply. BOM only supplies possible resource groups, never a claim
// that an unrecorded batch was actually consumed.
export function impactClosure(d,p,base,w){
 const ids=new Set(w.seedTaskIds),reasons=new Map();
 for(const id of ids)if(!base.tasks.some(t=>t.id===id))fail('影响起点','未知基准任务 '+id);
 const productIds=new Set(p.batches.filter(b=>b.status!=='withdrawn').flatMap(b=>b.demands.map(r=>r['成品编号']))),seen=new Set();
 function products(id){if(seen.has(id))return;seen.add(id);for(const b of rows(d,'物料清单').filter(b=>b['父项编号']===id&&Number(b['生效日'])<=p.selection.startDay&&p.selection.startDay<Number(b['失效日'])))products(b['子项编号']);}
 for(const id of productIds)products(id);
 const routes=rows(d,'工艺路线').filter(r=>seen.has(r['成品编号'])),groups=new Set(routes.map(r=>r['设备组编号'])),crews=new Set(routes.map(r=>r['班组编号'])),tools=new Set(routes.flatMap(r=>d.mapping?.tool_pools?.[r['所需工装类型']]||[]));
 const machines=new Set(rows(d,'设备与工装').filter(r=>groups.has(r['资源组编号'])).map(r=>r['资源编号']));
 for(const e of w.events.filter(e=>e.knownMinute<=p.facts.observationMinute)){if(e.type==='fault')machines.add(e.resource);else for(const a of base.allocations.filter(a=>a.supplyId===e.supplyId))for(const t of base.tasks.filter(t=>t.orderId===a.need))ids.add(t.id);}
 for(const t of base.tasks)if(machines.has(t.machine)||crews.has(t.crew)||t.tools.some(x=>tools.has(x))){ids.add(t.id);reasons.set(t.id,'插单完整路线可能共享设备/班组/工装');}
 let changed=true;while(changed){changed=false;const inside=base.tasks.filter(t=>ids.has(t.id)),supplies=new Set(base.allocations.filter(a=>inside.some(t=>t.orderId===a.need||t.productionId===a.consumer?.split('|')[0])).map(a=>a.supplyId));
  for(const t of base.tasks)if(!ids.has(t.id)&&(inside.some(a=>a.productionId===t.productionId||a.predecessor===t.id||t.predecessor===a.id||a.machine===t.machine||a.crew===t.crew||a.tools.some(x=>t.tools.includes(x)))||base.allocations.some(a=>a.need===t.orderId&&supplies.has(a.supplyId)))){ids.add(t.id);reasons.set(t.id,'实际工序/共享资源/已分配供给连锁');changed=true;}
 }
 return {taskIds:[...ids].sort(),reasons:Object.fromEntries(reasons),method:'conservative-actual-dependency-fixed-point',localFailureMeaning:'局部未找到候选；可明确扩围或建立全量对照，不代表全局无解'};
}

export function prepareWorkspace(d,p,base,override){
 if(!p.workspace)return null; // Historical #67 inputs keep their original model.
 const w=validateWorkspace({...p.workspace,...override},p,d),closure=impactClosure(d,p,base,w),inside=new Set(closure.taskIds),zones=Object.fromEntries(base.tasks.map(t=>[t.id,taskZone(t,p,w)]));
 const withdrawn=new Set(p.batches.filter(b=>b.status==='withdrawn').flatMap(b=>b.demands.map(r=>r['需求编号'])));
 const fixed=base.tasks.filter(t=>!withdrawn.has(t.orderId)&&(zones[t.id]==='frozen'||w.strategy==='gap'&&!p.batches.some(b=>b.demands.some(r=>r['需求编号']===t.orderId))||w.scope==='local'&&!inside.has(t.id)));
 const semi=base.tasks.filter(t=>zones[t.id]==='semi'&&!fixed.includes(t));
 const result={...w,policyHash:hash(w),closure,zones,fixedTaskIds:fixed.map(t=>t.id),semiTasks:structuredClone(semi),baselineTasks:structuredClone(base.tasks),eventsHash:hash(w.events),configurationHash:hash(rows(d,'配置参数'))};
 result.qualityAffected=[...new Set([...batchTrace(d,p,base).nodes.filter(n=>n.affected).map(n=>n.id),...w.events.filter(e=>e.type==='quality'&&e.knownMinute<=p.facts.observationMinute).map(e=>e.supplyId)])];
 d.urgentWorkspace=result;
 for(const e of w.events.filter(e=>e.knownMinute<=p.facts.observationMinute&&e.type==='fault')){
  if(!e.recoveryConfirmed)throw urgentError('URGENT_RECOVERY_PENDING','故障 '+e.id+' 恢复未确认，待处置；不能排成成功',{eventId:e.id});
  d.tables['停机安排']??=[];d.tables['停机安排'].push({'停机编号':'UW-'+e.id,'资源编号':e.resource,'开始分钟偏移':String(e.occurredMinute),'结束分钟偏移':String(e.recoveryMinute),'信息可知时刻':new Date(Date.parse(d.minuteOrigin)+e.knownMinute*60000).toISOString(),_source:{eventId:e.id,source:e.source}});
 }
 for(const e of w.events.filter(e=>e.knownMinute<=p.facts.observationMinute&&e.type==='quality')){
  const id=e.supplyId.replace(/^inventory:/,'');const stock=rows(d,'期初库存').find(r=>r['库存批次编号']===id);if(stock)stock['质量状态']='冻结';
 }
 return result;
}

// A fault changes the future continuation, never the elapsed segment. Reserve
// the equipment and tools through the interruption; personnel work only in the
// explicit productive segments. The full physical checker still has final say.
export function continueFaultTask(d,p,t){
 const w=d.urgentWorkspace;if(!w)return t;
 if(t.interruption&&w.events.some(e=>e.id===t.interruption.eventId&&e.recoveryConfirmed&&e.recoveryMinute===t.interruption.recoveryMinute))return t;
 const events=w.events.filter(e=>e.type==='fault'&&e.resource===t.machine&&e.knownMinute<=p.facts.observationMinute&&t.start<e.occurredMinute&&e.occurredMinute<t.end);
 if(!events.length)return t;if(events.length!==1)throw urgentError('URGENT_FAULT_MULTIPLE','同一任务多次中断须补完整分段执行事实，不能推测净剩余');
 const e=events[0],f=p.facts.tasks.find(f=>f.id===t.id);
 if(f?.status!=='started'||!w.exceptions.some(x=>x.taskId===t.id&&x.attributes.includes('resumeAfterFault')))throw urgentError('URGENT_FAULT_EXCEPTION','故障穿越已保护任务，须明确已执行事实及仅续作的冻结例外',{taskId:t.id,eventId:e.id});
 const rt=rows(d,'工艺路线').find(r=>r['路线工序编号']===t.routeStepId),executed=e.occurredMinute-t.start,total=routeMinutes(rt,t.quantity),remaining=total-executed;
 if(remaining<=0||e.recoveryMinute<e.occurredMinute)throw urgentError('URGENT_FAULT_FACT','执行分钟与原工时矛盾，请核对事实');
 const resume=e.recoveryMinute,end=resume+remaining,segments=[{start:t.start,end:e.occurredMinute},{start:resume,end}];
 if(end>p.selection.endDay*1440)throw urgentError('URGENT_FAULT_WINDOW','净剩余续作超出窗口，请明确扩展');
 return {...t,end,endMinute:end,toolEndMinute:end+Number(rt['工装后延释放分钟']),laborIntervals:segments.flatMap(s=>laborSegments(rt,s.start,s.end)),executionSegments:segments,interruption:{eventId:e.id,source:e.source,occurredMinute:e.occurredMinute,knownMinute:e.knownMinute,recoveryMinute:resume,executedMinutes:executed,remainingMinutes:remaining,originalEnd:t.end,policyHash:w.policyHash}};
}

export function workspaceCheck(d,plan){
 const w=d.urgentWorkspace;if(!w)return [];
 const issues=[],original=w.baselineTasks,actual=plan.tasks||[],key=t=>[t.orderId,t.productId,t.routeStepId].join('|');
 for(const a of plan.allocations||[])if(w.qualityAffected.includes(a.supplyId)&&!a.executionConsumed)issues.push('质量影响批次不得新增消耗/交付 '+a.supplyId);
 for(const k of new Set(w.semiTasks.map(key))){const group=original.filter(x=>key(x)===k).sort((a,b)=>b.start-a.start),next=actual.filter(x=>key(x)===k);let valid=group.length===next.length;
  for(const a of group){const at=next.findIndex(b=>b.machine===a.machine&&b.crew===a.crew&&hash(b.tools)===hash(a.tools)&&b.quantity===a.quantity&&b.end-b.start===a.end-a.start&&b.start>=a.start);if(at<0)valid=false;else next.splice(at,1);}
  if(!valid)issues.push('半冻结仅允许顺延，设备/数量/工时/工装不得变化 '+k);
 }
 for(const t of d.urgentOrder.seedTasks.filter(t=>t.interruption)){
  const x=actual.find(x=>x.id===t.id),e=w.events.find(e=>e.id===t.interruption.eventId),rt=rows(d,'工艺路线').find(r=>r['路线工序编号']===t.routeStepId);
  if(!x||hash(x.executionSegments)!==hash(t.executionSegments)||!e?.recoveryConfirmed||x.start!==t.start||x.end!==e.recoveryMinute+t.interruption.remainingMinutes||x.executionSegments.reduce((n,s)=>n+s.end-s.start,0)!==routeMinutes(rt,x.quantity))issues.push('故障续作执行/净剩余不守恒 '+t.id);
 }
 return issues;
}
