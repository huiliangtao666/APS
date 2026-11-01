import {checkChangeovers,CHANGEOVER_CONTRACT} from './b12-changeover.mjs';
import {allowedWindows} from './working-windows.mjs';
import {inheritedCalendarId} from './factory-lines.mjs';
import {originalProtection} from './execution-resource-ledger.mjs';
import {validatePhysicalPools,poolCapacityAt,poolPolicyPoints} from './physical-pools.mjs';
import {sourceRefs} from './problem-records.mjs';

export const applicationChangeoverContract='BR13-saved-order-v1';
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const taskFacts=t=>Object.fromEntries(['id','orderId','productId','operation','productionBatchId','resourceBatchId','machine','start','end','duration','exactQuantity','exactLoadKg'].filter(k=>t[k]!==undefined).map(k=>[k,t[k]]));
const prefix={设备:'machine:',工装:'tool:',空间:'space:'};
const source=(table,row)=>({id:table,version:JSON.stringify(row)});
export function cleaningActive(data,at){return data.rules?.some(r=>r['规则编号']==='CLEANING'&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at)));}
export function adoptChangeoverScope(scope,data,at){return scope.mode==='minimal-r1'||!cleaningActive(data,at)?scope:{...scope,checked:[...scope.checked,'BR13显式方向政策的实际相邻生产顺序/占用复核；采用以保存结果独立检查为准'],unchecked:[...scope.unchecked.filter(x=>x!=='换型清洗'),'现场物理清洗与质量放行的真实性；有界顺序搜索不证明全局无解']};}

// Saved-output checker: reconstruct actual adjacency and all physical debits.
// Candidate search lives in the planner; verification never invokes that search.
export function assessApplicationChangeovers(plan,data,conditions={}){
 if(!cleaningActive(data,conditions.ruleEvaluationAt))return {active:false,status:'not_checked',findings:[],acceptedOccupations:[]};
 const findings=[],fail=(code,message,taskIds=[])=>findings.push({code:'BR13 / '+code,message,taskIds,sourceRead:'frozen-calendar-v1',relatedRecords:sourceRefs('rules',data.rules.filter(r=>r['规则编号']==='CLEANING'),data.rules)});
 let configuration,domain=null,groupEvidence=[],historyEvidence=[];
 try{
  const rule=data.rules.find(r=>r['规则编号']==='CLEANING');configuration=JSON.parse(rule['参数JSON']);
  if(configuration.contract!==applicationChangeoverContract||configuration.startPolicy!=='前序结束'||!Array.isArray(configuration.policies)||!configuration.source?.id||!configuration.source?.version)throw Error('显式合同、来源版本、前序结束起算及完整方向政策数组必填');
  const resources=new Map(),personnel=new Map(),groupRows=[];
  const poolIssues=validatePhysicalPools(data,{at:conditions.ruleEvaluationAt,forRun:true,allowLegacy:true});
  if(poolIssues.length)throw Error(poolIssues.map(x=>x.message).join('；'));
  const histories=configuration.completedTransitions??[];
  validateCleaningHistory(histories,data);
  if((plan.tasks||[]).length&&histories.some(h=>h.observedAt>(conditions.startMinute??0)))throw Error('清洗实绩观测晚于本次计划起点，禁止将未来声明当已完成');
  const allCalendars=[...new Set(data.machines.map(m=>inheritedCalendarId(data,m)))];
  const windows=(calendar,type,id,a=0,b=525600)=>allowedWindows(data,calendar,type,id,a,b).map(([start,end])=>({start,end}));
  const register=(type,id)=>{
   const key=prefix[type]+id;if(!prefix[type])throw Error('未知换型资源类型 '+type);
   if(resources.has(key))return key;
   const table=type==='设备'?'machines':type==='工装'?'tools':'batchResources',field=type==='设备'?'设备编号':type==='工装'?'工装编码':'资源编号';
   const matches=(data[table]||[]).filter(r=>r[field]===id);if(matches.length!==1)throw Error('缺唯一冻结资源 '+type+'/'+id);
   const row=matches[0],capacity=Number(row[type==='设备'?'__exclusive':type==='工装'?'可用数量':'容量']??(type==='设备'?1:NaN));
   if(!integer(capacity)||capacity<=0)throw Error('换型域仅支持可精确表示的正整数资源容量 '+id);
   const machine=type==='设备'?row:data.machines[0],calendar=inheritedCalendarId(data,machine);

   resources.set(key,{id:key,capacity,capacityScope:'independent',windows:(type==='设备'?[calendar]:allCalendars).flatMap(c=>windows(c,type,id,type==='工装'?Number(row['可用起始分钟']):0,type==='工装'?Number(row['可用结束分钟']):525600)),unavailable:[],source:source(table,row)});return key;
  };
  const staff=(groupId)=>{
   const groups=(data.personnelGroups||[]).filter(g=>g['人员组编号']===groupId);if(groups.length!==1)throw Error('缺唯一换型人员组 '+groupId);
   const group=groups[0],pool=(data.personnelPools||[]).find(p=>p.poolId===group.poolId&&p['是否启用']==='是');
   if(!pool)throw Error('换型须显式映射唯一已启用物理池 '+groupId);
   const id='pool:'+pool.poolId,capacity=Number(pool['总人数']);if(!integer(capacity)||capacity<=0)throw Error('物理池人数无效');
   if(!personnel.has(id))personnel.set(id,{id,capacity,capacityScope:'independent',skills:[],windows:allCalendars.flatMap(c=>windows(c,'人员池',pool.poolId)),unavailable:[],source:source('personnelPools',pool)});
   const registry=personnel.get(id);for(const skill of group['技能'].split(/[;,，；|]/).map(x=>x.trim()).filter(Boolean))if(!registry.skills.includes(skill))registry.skills.push(skill);
   return {group,pool,id};
  };
  const resourceDemands=rows=>{
   if(!Array.isArray(rows))throw Error('资源需求须显式数组，[]表示无需占用');
   return rows.map(r=>({id:register(r.type,r.id),quantity:r.quantity}));
  };
  const personnelDemands=(rows,policyId,phase)=>{
   if(!Array.isArray(rows))throw Error('人员需求须显式数组，[]表示不需人员');const aggregated=new Map();
   for(const r of rows){const {group,pool,id}=staff(r.groupId);
    if(!Number.isSafeInteger(r.quantity)||r.quantity<=0||!personnel.get(id).skills.includes(r.skill)||!group['技能'].split(/[;,，；|]/).map(x=>x.trim()).includes(r.skill))throw Error('换型人员数量或技能资格无效 '+r.groupId);
    groupRows.push({policyId,phase,groupId:r.groupId,poolId:pool.poolId,quantity:r.quantity,skill:r.skill,source:source('personnelGroups',group)});
    const old=aggregated.get(id);if(old)old.quantity+=r.quantity;else aggregated.set(id,{id,quantity:r.quantity,skill:r.skill});
   }return [...aggregated.values()];
  };
  const policies=configuration.policies.map(p=>{
   if(!p.validation||!Array.isArray(p.resourceIds))throw Error('方向政策缺适用设备或验证阶段');
   return {...p,resourceIds:p.resourceIds.map(id=>register('设备',id)),resources:resourceDemands(p.resources),personnel:personnelDemands(p.personnel,p.id,'changeover'),validation:{...p.validation,resources:resourceDemands(p.validation.resources),personnel:personnelDemands(p.validation.personnel,p.id,'validation')}};
  });
  const existingOccupations=[];
  const taskById=new Map((plan.tasks||[]).map(t=>[t.id,t]));
  const originalRows=(data.originalResourceEvents||[]).length?originalProtection(data):[];
  const jointRows=[...(plan.resourceReservations||[]),...originalRows.map(r=>({...r,end:r.end??525600,taskIds:r.members,originalFact:true}))];
  for(const [index,r]of jointRows.entries()){
   if(r.end<=(conditions.startMinute??0))continue; // Past facts retain original rules, never debit today's future pool.
   // A production-only resource absent from every cleaning demand cannot
   // conflict with cleaning. Its exact decimal ledger stays with the existing
   // route/resource independent checker; do not coerce kg into integer units.
   if(r.type!=='人员'&&!resources.has(prefix[r.type]+r.resourceId))continue;
   if(!integer(Number(r.quantity))||Number(r.quantity)<=0)throw Error('换型联合复核仅支持可精确表示的正整数占用 '+r.resourceId);
   const id=r.type==='人员'?staff(r.resourceId).id:register(r.type,r.resourceId);
   existingOccupations.push({id:'production:'+index,kind:r.type==='人员'?'personnel':'resource',resourceId:id,start:r.start,end:r.end,quantity:Number(r.quantity),source:source('production-reservations',r)});
   if(r.type==='人员')groupEvidence.push({groupId:r.resourceId,poolId:data.personnelGroups.find(g=>g['人员组编号']===r.resourceId)?.poolId,quantity:Number(r.quantity),start:r.start,end:r.end,owner:(r.taskIds||[r.taskId]).map(id=>taskById.get(id)?.resourceBatchId||id).sort().join('|'),machineIds:[...new Set((r.taskIds||[r.taskId]).map(id=>taskById.get(id)?.machine).filter(Boolean))],originalFact:!!r.originalFact,source:source('production-reservations',r)});
  }
  const groups=new Map();
  for(const t of plan.tasks||[]){
   if(!integer(t.start)||!integer(t.end)||t.end<=t.start)throw Error('生产任务必须有完整安全整数区间 '+t.id);
   const key=t.resourceBatchId||t.id,old=groups.get(key);
   if(old){if(old.machine!==t.machine||old.start!==t.start||old.end!==t.end||old.productId!==t.productId)throw Error('同资源批成员的机器/区间/产品不一致');old.memberIds.push(t.id);}
   else groups.set(key,{...taskFacts(t),memberIds:[t.id]});
  }
  const transitions=[];
  for(const machineId of new Set([...groups.values()].map(t=>t.machine))){
   const tasks=[...groups.values()].filter(t=>t.machine===machineId).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
   for(let i=1;i<tasks.length;i++){
    const from=tasks[i-1],to=tasks[i];
    if(from.end>to.start)fail('PRODUCTION_OVERLAP','生产资源批先后区间重叠',[...from.memberIds,...to.memberIds]);
    const completed=histories.find(h=>h.machineId===machineId&&h.fromTaskId===from.id&&h.toTaskId===to.id);
    if(completed){
     if(completed.from!==from.productId||completed.to!==to.productId||completed.start<from.end||completed.readyAt>to.start)fail('HISTORY_LINK','已完成清洗与实际方向/前后任务时间不一致',[...from.memberIds,...to.memberIds]);
     historyEvidence.push({...completed,adopted:true,futureDebit:false});continue;
    }
    const facts=(data.executionContext||data).executionFacts||[];
    const started=facts.find(f=>f['订单编号']===to.orderId&&f['工序编号']===to.operation);
    if(started){fail('HISTORY_REQUIRED','已开始后序须有来源支持的已完成清洗；不能按今天政策回算或补造历史',[...from.memberIds,...to.memberIds]);continue;}
    transitions.push({id:JSON.stringify([machineId,from.id,to.id]),from:from.productId,to:to.productId,resourceId:register('设备',machineId),fromTaskId:from.id,toTaskId:to.id,predecessorEnd:from.end,start:from.end,successorStart:to.start,source:source('actual-adjacent-production',{from,to})});
   }
  }
  for(const h of histories)if(!historyEvidence.some(x=>x.id===h.id))historyEvidence.push({...h,adopted:false,futureDebit:false});
  const input={config:{contract:CHANGEOVER_CONTRACT,source:configuration.source,timebase:{unit:'minute',origin:'2026-11-02T08:00:00+08:00'},products:data.products.map(p=>p['产品编号']),resources:[...resources.values()],personnel:[...personnel.values()],policies},transitions,existingOccupations,horizon:{start:conditions.startMinute??0,end:conditions.endMinute??Math.max(...data.calendars.map(c=>Number(c['结束分钟'])))},source:source('frozen-production-and-policy',{tasks:(plan.tasks||[]).map(taskFacts),configuration})};
  domain=checkChangeovers(input);
  const domainFindings=domain.findings.filter(f=>!(f.code==='NO_TRANSITIONS'&&!transitions.length));
  for(const f of domainFindings)fail(f.code,f.message+(f.policyId?'；政策 '+f.policyId:'')+(f.readyAt!==undefined?'；最早 '+f.readyAt:''),f.taskIds||[]);
  // The domain sweeps global physical pools. Separately verify every original
  // group/skill qualification and its full participation window/capacity.
  for(const o of domain.requiredOccupations.filter(o=>o.kind==='personnel')){
   for(const r of groupRows.filter(r=>r.policyId===o.policyId&&r.phase===o.phase))groupEvidence.push({...r,start:o.start,end:o.end,owner:o.transitionId,machineIds:[transitions.find(t=>t.id===o.transitionId)?.resourceId?.replace(/^machine:/,'')].filter(Boolean),transitionId:o.transitionId});
  }
  for(const groupId of new Set(groupEvidence.map(r=>r.groupId))){
   const g=data.personnelGroups.find(g=>g['人员组编号']===groupId),rows=groupEvidence.filter(r=>r.groupId===groupId);
   for(const row of rows.filter(r=>!r.originalFact))for(const machineId of row.machineIds){
    const machine=data.machines.find(m=>m['设备编号']===machineId),calendar=inheritedCalendarId(data,machine);
    const available=allowedWindows(data,calendar,'人员',groupId,Number(g['可用起始分钟']),Number(g['可用结束分钟']));
    const poolAvailable=allowedWindows(data,calendar,'人员池',g.poolId);
    if(!available.some(([a,b])=>a<=row.start&&b>=row.end)||!poolAvailable.some(([a,b])=>a<=row.start&&b>=row.end))fail('GROUP_WINDOW','换型或生产人员不在实际设备继承的工厂/人员/物理池完整窗口 '+groupId);
   }
   for(const minute of rows.map(r=>r.start))if(rows.filter(r=>r.start<=minute&&r.end>minute).reduce((n,r)=>n+r.quantity,0)>Number(g['人员数量']))fail('GROUP_CAPACITY','换型与生产超过人员组资格人数 '+groupId);
  }
  // Auxiliary resources inherit the actual transition machine calendar, not the
  // first configured machine. Union registry windows alone cannot prove this.
  for(const o of domain.requiredOccupations.filter(o=>o.kind==='resource')){
   const t=transitions.find(t=>t.id===o.transitionId),machine=data.machines.find(m=>'machine:'+m['设备编号']===t.resourceId);
   const type=o.resourceId.startsWith('machine:')?'设备':o.resourceId.startsWith('tool:')?'工装':'空间',id=o.resourceId.replace(/^[^:]+:/,'');
   if(!allowedWindows(data,inheritedCalendarId(data,machine),type,id).some(([a,b])=>a<=o.start&&b>=o.end))fail('RESOURCE_WINDOW','换型资源须同时满足实际设备继承工厂日历 '+id,o.taskIds);
  }
  for(const pool of data.personnelPools||[]){
   const rows=groupEvidence.filter(r=>r.poolId===pool.poolId),points=[...new Set([...rows.flatMap(r=>[r.start,r.end]),...poolPolicyPoints(pool)])].sort((a,b)=>a-b);
   for(const minute of points){
    const active=rows.filter(r=>r.start<=minute&&r.end>minute),demand=active.reduce((n,r)=>n+BigInt(r.quantity),0n),cap=poolCapacityAt(pool,minute);
    if(demand>BigInt(cap))fail('POOL_HANDOVER','物理池 '+pool.poolId+' 分钟 '+minute+' 联合需求 '+demand+' / 交接有效容量 '+cap);
    if(pool['允许共用']==='否'&&(pool['互斥粒度']==='人员组互斥'?new Set(active.map(r=>r.groupId)).size>1:new Set(active.map(r=>r.owner)).size>1))fail('POOL_MUTEX','换型/生产违反物理池 '+pool.poolId+' '+pool['互斥粒度']);
   }
  }
  if(!transitions.length)domain={...domain,domainValid:domainFindings.length===0,status:'no-adjacent-transition',findings:domainFindings,notChecked:[...domain.notChecked,'本方案没有相邻生产转换；不声称方向政策已实际采用']};
 }catch(e){fail('CONFIG_OR_LINKAGE',e.message);}
 return {contract:applicationChangeoverContract,active:true,status:findings.length?'problem':'pass',findings,configuration,domain,groupEvidence,historyEvidence,acceptedOccupations:findings.length?[]:domain?.acceptedOccupations||[],scope:'实际相邻生产任务/资源批、来源支持的已完成清洗（不重复扣算）、未来方向政策/日历/唯一物理池；顺序搜索见changeoverSearch；不代表现场清洗或质量放行'};
}

export function verifyApplicationChangeovers(plan,data,conditions){
 const current=assessApplicationChangeovers(plan,data,conditions);if(!current.active)return null;
 const problems=[...current.findings.map(f=>f.message)];
 if(!equal(current,plan.changeoverAssessment))problems.push('保存的换型方向、实际相邻任务、政策/资源来源或占用与冻结源不一致');
 return {status:problems.length?'problem':'pass',details:problems.length?problems:['由实际保存任务重建全部相邻顺序并独立核对方向政策、共享池、日历、时间与占用；未信任保存的合法提案。']};
}

// Explicit completed facts are separate from today's policy proposals. They
// cannot be deleted or rewritten by configuration maintenance or trial input.
function historyOf(data){
 const rule=(data.rules||[]).find(r=>r['规则编号']==='CLEANING');
 return rule?JSON.parse(rule['参数JSON']).completedTransitions??[]:[];
}
function validateCleaningHistory(rows,data){
 if(!Array.isArray(rows)||rows.length>10000)throw Error('已完成清洗须显式事实数组');
 const ids=new Set(),edges=new Set();
 for(const h of rows){
  if(!h||typeof h!=='object'||Object.keys(h).some(k=>!['id','machineId','fromTaskId','toTaskId','from','to','start','end','readyAt','observedAt','source'].includes(k)))throw Error('已完成清洗字段无效');
  for(const k of ['id','machineId','fromTaskId','toTaskId','from','to'])if(typeof h[k]!=='string'||!h[k].trim()||h[k]!==h[k].trim())throw Error('已完成清洗缺稳定身份/方向 '+k);
  if(ids.has(h.id)||edges.has(JSON.stringify([h.machineId,h.fromTaskId,h.toTaskId])))throw Error('已完成清洗身份或任务边重复，不能重复扣算');
  ids.add(h.id);edges.add(JSON.stringify([h.machineId,h.fromTaskId,h.toTaskId]));
  if(h.fromTaskId===h.toTaskId||!data.machines.some(m=>m['设备编号']===h.machineId)||[h.from,h.to].some(id=>!data.products.some(p=>p['产品编号']===id)))throw Error('已完成清洗须唯一设备/已知产品及不同前后任务');
  if(['start','end','readyAt','observedAt'].some(k=>!integer(h[k])||h[k]>525600)||!(h.start<=h.end&&h.end<=h.readyAt&&h.readyAt<=h.observedAt))throw Error('已完成清洗须满足开始≤完成≤验证完成≤观测，禁止未来事实');
  if(!h.source||Object.keys(h.source).some(k=>!['id','version'].includes(k))||['id','version'].some(k=>typeof h.source[k]!=='string'||!h.source[k].trim()))throw Error('已完成清洗须原件来源及版本');
 }
}
export function cleaningHistoryTransition(before,after){
 try{
  const old=historyOf(before),next=historyOf(after);validateCleaningHistory(next,after);
  if(old.some(h=>!next.some(n=>n.id===h.id&&equal(n,h))))throw Error('已完成清洗实绩不可删除/改写；历史纠正须具名交PM，不以当前政策回算历史');
  return [];
 }catch(e){return [{code:'BR13_HISTORY_RECONCILIATION',table:'rules',field:'参数JSON',message:e.message}];}
}

// Deterministic bounded order candidates, no synthetic policy or rewritten input.
// Full scheduling runs for each order; exhausting this list is not global proof.
export function changeoverOrderCandidates(ids,limit=120){
 if(ids.length>8)return [];
 const result=[],queue=[ids],seen=new Set([JSON.stringify(ids)]);
 while(queue.length&&result.length<limit){
  const row=queue.shift();result.push(row);
  for(let i=0;i+1<row.length&&seen.size<limit;i++){
   const next=[...row];[next[i],next[i+1]]=[next[i+1],next[i]];const key=JSON.stringify(next);
   if(!seen.has(key)&&seen.size<limit){seen.add(key);queue.push(next);}
  }
 }
 return result;
}
