import {quantityMath as Q} from './material-allocation.mjs';
// Deliberately reconstruct from frozen event rows, not scheduler projections or
// originalProtection(). This checker does not allocate or move any task.
export function verifyOriginalResources(plan,data,conditions={}){
 const events=data?.originalResourceEvents||[];
 if(!events.length&&!conditions.originalResourceContract)return null;
 const errors=[],bad=m=>errors.push(m),views=new Map(),ids=new Set();
 try{
  if(conditions.originalResourceContract!=='N06-finite-v1'||!events.length)throw Error('缺冻结原账或契约');
  for(const r of events){
   if(ids.has(r['事件编号']))throw Error('重复事件');ids.add(r['事件编号']);
   const prior=views.get(r['原账编号']);
   if((prior?.eventId||'')!==(r['前事件编号']||''))throw Error('前事件链断裂');
   views.set(r['原账编号'],{eventId:r['事件编号'],doc:JSON.parse(r['原账JSON'])});
  }
  const full=data.executionContext||data,expected=[],facts=new Set(),occupancies=new Set();
  for(const [ledgerId,{eventId,doc:d}] of views){
   if(d.status!=='已核对'||!d.ruleVersion||!d.historicalRules||!d.sources?.length)throw Error('草稿/历史规则来源不完整');
   if(d.observedAt>conditions.startMinute)bad('运行早于原账观测点');
   const sources=new Set(d.sources.filter(s=>s.sha256?.match(/^[a-f0-9]{64}$/)&&s.location&&s.provider&&s.reviewer).map(s=>s.id));
   for(const f of d.facts){
    if(facts.has(f.factId)||!full.executionFacts.some(x=>x['事实编号']===f.factId&&JSON.stringify(x)===JSON.stringify(f.snapshot)))throw Error('累计事实缺失/重复/过期');facts.add(f.factId);
    for(const t of f.tasks)for(const type of ['工装','空间','人员']){
     const a=d.adoption.filter(a=>a.taskId===t.id&&a.type===type);
     if(a.length!==1||!sources.has(a[0].source)||!['采用','未采用'].includes(a[0].state))throw Error('实际采用集合缺项');
     if(a[0].state==='采用'&&!a[0].occupancyIds.length||a[0].state==='未采用'&&a[0].occupancyIds.length)throw Error('采用声明矛盾');
    }
   }
   for(const o of d.occupancies){
    if(occupancies.has(o.id))throw Error('重复物理取得');occupancies.add(o.id);
    const p=d.identities.find(p=>p.physicalId===o.physicalId);
    if(!p||!sources.has(p.source)||!sources.has(o.acquireSource)||!sources.has(o.releaseSource)||o.end===null||!(o.start<o.end&&o.end<=d.observedAt)||!Number.isFinite(o.start)||!Number.isFinite(o.end)||Q.cmp(Q.q(o.quantity),Q.zero)<=0n||o.unit!==p.unit)throw Error('未知释放/区间/数量/来源/身份无效');
    if(!o.members.length||o.members.some(t=>!d.adoption.some(a=>a.taskId===t&&a.type===p.type&&a.state==='采用'&&a.occupancyIds.includes(o.id))))throw Error('占用成员无法重建');
    expected.push({ledgerId,eventId,occupancyId:o.id,physicalId:p.physicalId,historicalId:p.historicalId,type:p.type,resourceId:p.type==='人员'?o.people.currentGroupId:p.currentId,...(p.type==='人员'?{poolId:p.currentId,originalGroupId:o.people.groupId}:{}),quantity:o.quantity,unit:o.unit,start:o.start,end:o.end,members:[...o.members],observedAt:d.observedAt,sourceIds:[o.acquireSource,o.releaseSource]});
   }
  }
  for(const f of full.executionFacts||[]){if(!facts.has(f['事实编号']))bad('缺全范围事实 '+f['事实编号']);
   const task=(plan.tasks||[]).find(t=>t.orderId===f['订单编号']&&t.operation===f['工序编号']);
   if(task&&f['状态']==='已完成'&&(task.start!==Number(f['开始分钟'])||task.end!==Number(f['完成分钟'])||task.machine!==f['当前设备']))bad('原已完成任务被移动/改写');
  }
  if(JSON.stringify(expected)!==JSON.stringify(plan.originalResourceProtection))bad('结果原始保护账缺失或身份/量/端点/来源与冻结事件不一致');
  // Only future planned windows trigger capacity legality; historical excess is
  // preserved evidence and must not force an operator to rewrite actual facts.
  const planned=plan.resourceReservations||[];
  for(const r of planned.filter(r=>['工装','空间','人员'].includes(r.type))){
   const group=r.type==='人员'?data.personnelGroups.find(g=>g['人员组编号']===r.resourceId):null;
   const pool=group?data.personnelPools?.find(p=>p.poolId===group.poolId):null;
   const same=x=>x.type===r.type&&(r.type==='人员'?x.poolId===group?.poolId:x.resourceId===r.resourceId);
   const facts=expected.filter(same);
   const supply=r.type==='工装'?data.tools.find(x=>x['工装编码']===r.resourceId):r.type==='空间'?data.batchResources.find(x=>x['资源编号']===r.resourceId):pool;
   const capacity=supply?.[r.type==='工装'?'可用数量':r.type==='空间'?'容量':'总人数'];
   if(capacity===undefined)throw Error('缺当前供给');
   const planSame=planned.filter(x=>x.type===r.type&&(r.type==='人员'?data.personnelGroups.find(g=>g['人员组编号']===x.resourceId)?.poolId===group?.poolId:x.resourceId===r.resourceId));
   const rows=[...facts,...planSame],points=[r.start,...rows.map(x=>x.start).filter(t=>t>=r.start&&t<r.end)];
   for(const t of points){const total=rows.filter(x=>x.start<=t&&x.end>t).reduce((s,x)=>Q.add(s,Q.q(x.quantity)),Q.zero);if(Q.cmp(total,Q.q(capacity))>0n)bad(`${r.type} ${r.resourceId} 在 ${t} 原账加新计划超当前供给`);}
   if(group){const rows=[...expected.filter(x=>x.type==='人员'&&x.resourceId===r.resourceId),...planned.filter(x=>x.type==='人员'&&x.resourceId===r.resourceId)];for(const t of [r.start,...rows.map(x=>x.start).filter(t=>t>=r.start&&t<r.end)])if(Q.cmp(rows.filter(x=>x.start<=t&&x.end>t).reduce((s,x)=>Q.add(s,Q.q(x.quantity)),Q.zero),Q.q(group['人员数量']))>0n)bad('人员原账加计划超过组资格上限');}
  }
 }catch(e){bad('冻结原账无法独立重建：'+e.message);}
 return {status:errors.length?'problem':'pass',details:errors.length?errors:['从冻结事件、原件关联、实际采用集合重建全范围原账，按实际物理取得去重并核对容量。']};
}
