import {checkChangeovers,CHANGEOVER_CONTRACT} from './b12-changeover.mjs';
import {allowedWindows} from './working-windows.mjs';
import {inheritedCalendarId} from './factory-lines.mjs';
import {sourceRefs} from './problem-records.mjs';

export const applicationChangeoverContract='BR13-saved-order-v1';
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const taskFacts=t=>Object.fromEntries(['id','orderId','productId','operation','productionBatchId','resourceBatchId','machine','start','end','duration','exactQuantity','exactLoadKg'].filter(k=>t[k]!==undefined).map(k=>[k,t[k]]));
const prefix={设备:'machine:',工装:'tool:',空间:'space:'};
const source=(table,row)=>({id:table,version:JSON.stringify(row)});
export function cleaningActive(data,at){return data.rules?.some(r=>r['规则编号']==='CLEANING'&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at)));}
export function adoptChangeoverScope(scope,data,at){return scope.mode==='minimal-r1'||!cleaningActive(data,at)?scope:{...scope,checked:[...scope.checked,'BR13显式方向政策的实际相邻生产顺序/占用复核；采用以保存结果独立检查为准'],unchecked:[...scope.unchecked.filter(x=>x!=='换型清洗'),'换型自动顺序/位置搜索、历史执行清洗/质量实绩与未支持人员互斥/交接组合']};}

// This adapter checks the actual saved production sequence. It does not search
// for a new order or silently move production to make a cleaning policy fit.
export function assessApplicationChangeovers(plan,data,conditions={}){
 if(!cleaningActive(data,conditions.ruleEvaluationAt))return {active:false,status:'not_checked',findings:[],acceptedOccupations:[]};
 const findings=[],fail=(code,message,taskIds=[])=>findings.push({code:'BR13 / '+code,message,taskIds,sourceRead:'frozen-calendar-v1',relatedRecords:sourceRefs('rules',data.rules.filter(r=>r['规则编号']==='CLEANING'),data.rules)});
 let configuration,domain=null,groupEvidence=[];
 try{
  const rule=data.rules.find(r=>r['规则编号']==='CLEANING');configuration=JSON.parse(rule['参数JSON']);
  if(configuration.contract!==applicationChangeoverContract||configuration.startPolicy!=='前序结束'||!Array.isArray(configuration.policies)||!configuration.source?.id||!configuration.source?.version)throw Error('显式合同、来源版本、前序结束起算及完整方向政策数组必填');
  const resources=new Map(),personnel=new Map(),groupRows=[];
  const windows=(calendar,type,id,a=0,b=525600)=>allowedWindows(data,calendar,type,id,a,b).map(([start,end])=>({start,end}));
  const register=(type,id)=>{
   const key=prefix[type]+id;if(!prefix[type])throw Error('未知换型资源类型 '+type);
   if(resources.has(key))return key;
   const table=type==='设备'?'machines':type==='工装'?'tools':'batchResources',field=type==='设备'?'设备编号':type==='工装'?'工装编码':'资源编号';
   const matches=(data[table]||[]).filter(r=>r[field]===id);if(matches.length!==1)throw Error('缺唯一冻结资源 '+type+'/'+id);
   const row=matches[0],capacity=Number(row[type==='设备'?'__exclusive':type==='工装'?'可用数量':'容量']??(type==='设备'?1:NaN));
   if(!integer(capacity)||capacity<=0)throw Error('换型域仅支持可精确表示的正整数资源容量 '+id);
   const machine=type==='设备'?row:data.machines[0],calendar=inheritedCalendarId(data,machine);
   if(type!=='设备'&&new Set(data.machines.map(m=>inheritedCalendarId(data,m))).size!==1)throw Error('辅助资源须有唯一明确的继承日历 '+id);
   resources.set(key,{id:key,capacity,capacityScope:'independent',windows:windows(calendar,type,id,type==='工装'?Number(row['可用起始分钟']):0,type==='工装'?Number(row['可用结束分钟']):525600),unavailable:[],source:source(table,row)});return key;
  };
  const staff=(groupId)=>{
   if(new Set(data.machines.map(m=>inheritedCalendarId(data,m))).size!==1)throw Error('换型人员跨多个设备日历的接缝尚未复核；不能用首设备日历代替');
   const groups=(data.personnelGroups||[]).filter(g=>g['人员组编号']===groupId);if(groups.length!==1)throw Error('缺唯一换型人员组 '+groupId);
   const group=groups[0],pool=(data.personnelPools||[]).find(p=>p.poolId===group.poolId&&p['是否启用']==='是');
   if(!pool||pool['互斥粒度']!=='无互斥'||pool['交接模式']!=='不设交接限制'||pool['允许共用']!=='是')throw Error('换型须有显式可共享的唯一物理池；互斥/交接组合未采用 '+groupId);
   const id='pool:'+pool.poolId,capacity=Number(pool['总人数']);if(!integer(capacity)||capacity<=0)throw Error('物理池人数无效');
   if(!personnel.has(id))personnel.set(id,{id,capacity,capacityScope:'independent',skills:[],windows:windows(inheritedCalendarId(data,data.machines[0]),'人员池',pool.poolId),unavailable:[],source:source('personnelPools',pool)});
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
  for(const [index,r]of (plan.resourceReservations||[]).entries()){
   if(!integer(Number(r.quantity))||Number(r.quantity)<=0)throw Error('换型联合复核仅支持可精确表示的正整数占用 '+r.resourceId);
   const id=r.type==='人员'?staff(r.resourceId).id:register(r.type,r.resourceId);
   existingOccupations.push({id:'production:'+index,kind:r.type==='人员'?'personnel':'resource',resourceId:id,start:r.start,end:r.end,quantity:Number(r.quantity),source:source('production-reservations',r)});
   if(r.type==='人员')groupEvidence.push({groupId:r.resourceId,quantity:Number(r.quantity),start:r.start,end:r.end,source:source('production-reservations',r)});
  }
  if((data.executionFacts||[]).length||(plan.originalResourceProtection||[]).length)throw Error('带历史执行事实的清洗顺序/原占用接缝尚未复核；保护原事实，不把当前方案当完整现场顺序');
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
    transitions.push({id:JSON.stringify([machineId,from.id,to.id]),from:from.productId,to:to.productId,resourceId:register('设备',machineId),fromTaskId:from.id,toTaskId:to.id,predecessorEnd:from.end,start:from.end,successorStart:to.start,source:source('actual-adjacent-production',{from,to})});
   }
  }
  const input={config:{contract:CHANGEOVER_CONTRACT,source:configuration.source,timebase:{unit:'minute',origin:'2026-11-02T08:00:00+08:00'},products:data.products.map(p=>p['产品编号']),resources:[...resources.values()],personnel:[...personnel.values()],policies},transitions,existingOccupations,horizon:{start:conditions.startMinute??0,end:conditions.endMinute??Math.max(...data.calendars.map(c=>Number(c['结束分钟'])))},source:source('frozen-production-and-policy',{tasks:(plan.tasks||[]).map(taskFacts),configuration})};
  domain=checkChangeovers(input);
  const domainFindings=domain.findings.filter(f=>!(f.code==='NO_TRANSITIONS'&&!transitions.length));
  for(const f of domainFindings)fail(f.code,f.message+(f.policyId?'；政策 '+f.policyId:'')+(f.readyAt!==undefined?'；最早 '+f.readyAt:''),f.taskIds||[]);
  // The domain sweeps global physical pools. Separately verify every original
  // group/skill qualification and its full participation window/capacity.
  for(const o of domain.requiredOccupations.filter(o=>o.kind==='personnel')){
   for(const r of groupRows.filter(r=>r.policyId===o.policyId&&r.phase===o.phase))groupEvidence.push({...r,start:o.start,end:o.end});
  }
  for(const groupId of new Set(groupEvidence.map(r=>r.groupId))){
   const g=data.personnelGroups.find(g=>g['人员组编号']===groupId),rows=groupEvidence.filter(r=>r.groupId===groupId),calendar=inheritedCalendarId(data,data.machines[0]);
   const available=allowedWindows(data,calendar,'人员',groupId,Number(g['可用起始分钟']),Number(g['可用结束分钟']));
   for(const row of rows)if(!available.some(([a,b])=>a<=row.start&&b>=row.end))fail('GROUP_WINDOW','换型或生产人员不在组资格/班次/例外完整窗口 '+groupId);
   for(const minute of rows.map(r=>r.start))if(rows.filter(r=>r.start<=minute&&r.end>minute).reduce((n,r)=>n+r.quantity,0)>Number(g['人员数量']))fail('GROUP_CAPACITY','换型与生产超过人员组资格人数 '+groupId);
  }
  if(!transitions.length)domain={...domain,domainValid:domainFindings.length===0,status:'no-adjacent-transition',findings:domainFindings,notChecked:[...domain.notChecked,'本方案没有相邻生产转换；不声称方向政策已实际采用']};
 }catch(e){fail('CONFIG_OR_LINKAGE',e.message);}
 return {contract:applicationChangeoverContract,active:true,status:findings.length?'problem':'pass',findings,configuration,domain,groupEvidence,acceptedOccupations:findings.length?[]:domain?.acceptedOccupations||[],scope:'实际相邻生产任务/资源批、冻结方向政策与全部占用检查；不搜索新顺序或自动顺延；不代表现场清洗或质量放行'};
}

export function verifyApplicationChangeovers(plan,data,conditions){
 const current=assessApplicationChangeovers(plan,data,conditions);if(!current.active)return null;
 const problems=[...current.findings.map(f=>f.message)];
 if(!equal(current,plan.changeoverAssessment))problems.push('保存的换型方向、实际相邻任务、政策/资源来源或占用与冻结源不一致');
 return {status:problems.length?'problem':'pass',details:problems.length?problems:['由实际保存任务重建全部相邻顺序并独立核对方向政策、共享池、日历、时间与占用；未信任保存的合法提案。']};
}
