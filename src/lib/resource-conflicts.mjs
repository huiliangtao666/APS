import {poolCapacityAt,poolPolicyPoints} from './physical-pools.mjs';
import {quantityMath as Q} from './material-allocation.mjs';
// Fixed saved-result projection; never searches or invokes an allocator. Every
// interval is an actual ledger window, including acquisition/return extensions.
export function resourceConflicts(plan,data,conditions=plan.conditions){
 if(!data||!Array.isArray(data.rules)||!conditions?.ruleEvaluationAt||conditions.mode==='minimal-r1')return [];
 const at=Date.parse(conditions.ruleEvaluationAt);if(!Number.isFinite(at))return [];
 const enabled=id=>data.rules.some(r=>r['规则编号']===id&&r['是否启用']==='是'&&(!conditions.enabledRuleIds||conditions.enabledRuleIds.includes(id))&&(!r['生效时间']||Date.parse(r['生效时间'])<=at));
 const tasks=plan.tasks||[],all=plan.resourceReservations||[],result=[];
 const grouped=new Map();
 for(const r of all){
  if(!['人员','工装','空间'].includes(r.type)||r.type==='工装'&&!enabled('MOLD')||r.type==='空间'&&!enabled('STORAGE'))continue;
  if(!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.start<0||r.end<=r.start||!(Number(r.quantity)>0)||!Number.isFinite(Number(r.quantity)))continue;
  const ids=[...new Set(r.taskIds||[r.taskId])].filter(id=>tasks.some(t=>t.id===id));if(!ids.length)continue;
  const key=JSON.stringify([r.type,r.resourceId]),list=grouped.get(key)||[];list.push({r,ids});grouped.set(key,list);
 }
 for(const [key,rows] of grouped){
  const [type,resourceId]=JSON.parse(key),table=type==='人员'?'personnelGroups':type==='工装'?'tools':'batchResources',field=type==='人员'?'人员组编号':type==='工装'?'工装编码':'资源编号';
  const config=data[table]?.find(g=>g[field]===resourceId),baseCapacity=Number(config?.[type==='人员'?'人员数量':type==='工装'?'可用数量':'容量']);if(!config||!Number.isFinite(baseCapacity)||baseCapacity<=0)continue;
  const units=[...new Set(rows.map(x=>x.r.unit))];if(units.length!==1||!units[0])continue;
  const availableStart=Number(config['可用起始分钟']??0),availableEnd=Number(config['可用结束分钟']??525600);if(!Number.isFinite(availableStart)||!Number.isFinite(availableEnd)||availableEnd<=availableStart)continue;
  const absences=[];if(type==='人员')for(const e of data.simulationEvents||[])if(e['事件类型']==='人员缺勤'){try{const p=JSON.parse(e['参数JSON']);if(p.groupId===resourceId&&Number.isFinite(Number(e['事件分钟']))&&Number.isFinite(p.endMinute))absences.push({start:Number(e['事件分钟']),end:p.endMinute,row:e});}catch{}}
  const points=[...new Set([...rows.flatMap(x=>[x.r.start,x.r.end]),availableStart,availableEnd,...absences.flatMap(x=>[x.start,x.end])])].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){
   const start=points[i],end=points[i+1],active=rows.filter(x=>x.r.start<=start&&x.r.end>start);if(!active.length)continue;
   const effectiveCapacity=start<availableStart||end>availableEnd||absences.some(e=>e.start<end&&e.end>start)?0:baseCapacity;
   const total=active.reduce((s,x)=>Q.add(s,Q.q(x.r.quantity)),Q.zero);if(Q.cmp(total,Q.q(String(effectiveCapacity)))<=0n)continue;
   const taskIds=[...new Set(active.flatMap(x=>x.ids))].sort(),declarations=[];let known=true;
   for(const {r,ids} of active)for(const id of ids){const task=tasks.find(t=>t.id===id);
    const refs=type==='人员'?(data.dependencies||[]).filter(d=>d['资源类型']==='人员技能'&&d['订单编号']===task.orderId&&d['工序编号']===task.operation&&d['所需技能']===r.requiredSkill&&(d['候选人员组']?.trim()?d['候选人员组'].split(/[,，]/).map(s=>s.trim()):[d['资源编号']]).includes(resourceId)):(data.resourceClaims||[]).filter(c=>c['声明编号']===r.declarationId&&c['订单编号']===task.orderId&&c['工序编号']===task.operation&&c['资源编号']===resourceId&&c['资源类型']===type);
    if(!refs.length){known=false;break;}for(const row of refs)if(!declarations.some(d=>d.table===(type==='人员'?'dependencies':'resourceClaims')&&JSON.stringify(d.row)===JSON.stringify(row)))declarations.push({table:type==='人员'?'dependencies':'resourceClaims',row});
   }
   // Unknown declarations remain generic verification problems, never invented geometry.
   if(!known||!declarations.length)continue;
   const interval={kind:'resource-capacity',type,resourceId,start,end,demand:Q.num(total),exactDemand:Q.exact(total),effectiveCapacity,baseCapacity,unit:units[0],taskIds};
   const evidence={ruleEvaluationAt:conditions.ruleEvaluationAt,ruleIds:type==='人员'?['人员显式依赖']: [type==='工装'?'MOLD':'STORAGE'],resourcePolicyVersion:conditions.resourcePolicyVersion??null,inputVersionId:plan.inputVersionId??null,snapshotHash:plan.snapshotHash??null,configuration:{table,row:config},declarations,ledger:active.map(x=>x.r),absences:absences.filter(e=>e.start<end&&e.end>start),basis:'按保存的实际占用窗口半开区间合计；同池跨技能共扣，工装含提前取得/后延归还；有效容量=配置容量在可用期内扣冻结缺勤（整组缺勤为0）；余额=有效容量−合计需求'};
   result.push({code:'VERIFY / RESOURCE_POLICY',message:`${type} ${resourceId} 超容量 ${effectiveCapacity}；[${start},${end}) 合计需求 ${interval.demand} ${units[0]} / 有效容量 ${effectiveCapacity} ${units[0]}`,taskIds,interval,evidence});
  }
 }
 for(const pool of data.personnelPools||[]){
  const members=(data.personnelGroups||[]).filter(g=>g.poolId===pool.poolId),rows=all.filter(r=>r.type==='人员'&&members.some(g=>g['人员组编号']===r.resourceId));
  const points=[...new Set([...rows.flatMap(r=>[r.start,r.end]),...poolPolicyPoints(pool)])].filter(Number.isFinite).sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){
   const start=points[i],end=points[i+1],active=rows.filter(r=>r.start<=start&&r.end>start),demand=active.reduce((s,r)=>s+Number(r.quantity),0),capacity=poolCapacityAt(pool,start);
   const owners=new Set(active.flatMap(r=>(r.taskIds||[r.taskId]).map(id=>tasks.find(t=>t.id===id)?.resourceBatchId||id)));
   const mutex=pool['允许共用']==='否'&&(pool['互斥粒度']==='人员组互斥'?new Set(active.map(r=>r.resourceId)).size>1:owners.size>1);
   if(!(demand>capacity)&&!mutex)continue;
   const taskIds=[...new Set(active.flatMap(r=>r.taskIds||[r.taskId]))].sort();
   result.push({code:'VERIFY / PHYSICAL_POOL',message:`物理池 ${pool.poolId} [${start},${end}) 需求 ${demand} 人 / 窗口有效容量 ${capacity} 人 / 差额 ${Math.max(0,demand-capacity)}；互斥 ${pool['互斥粒度']||'旧核心无互斥'} ${mutex?'违反':'未违反'}`,taskIds,
    interval:{kind:'resource-capacity',type:'物理人员池',resourceId:pool.poolId,start,end,demand,effectiveCapacity:capacity,baseCapacity:Number(pool['总人数']),unit:'人',taskIds},
    evidence:{configuration:{table:'personnelPools',row:pool},members,ledger:active,ruleEvaluationAt:conditions.ruleEvaluationAt,resourcePolicyVersion:conditions.resourcePolicyVersion,inputVersionId:plan.inputVersionId,snapshotHash:plan.snapshotHash,basis:'从冻结组映射重建同池成员，半开区间全组累计；组资格上限仍分别保留'}});
  }
 }
 return result;
}
