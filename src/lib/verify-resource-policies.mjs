import {resourceConflicts} from './resource-conflicts.mjs';
import {quantityMath as Q} from './material-allocation.mjs';
// Fixed-output checker: rebuild expected windows from frozen inputs, never call
// allocation/preview/scheduler functions and never search for a new position.
export function verifyResourcePolicies(plan,data,conditions=plan.conditions){
 const unchecked=message=>({status:'not_checked',details:[message]});
 if(!data)return unchecked('缺少冻结输入，无法复核资源参数；未检查。');
 if(!Array.isArray(data.rules))return unchecked('缺少冻结规则，无法确定资源采用范围；未检查。');
 if((conditions?.mode??plan.ruleSnapshot?.checkScope?.mode)==='minimal-r1')return unchecked('minimal-r1 未采用工装/空间/人员参数检查；未检查。');
 const at=conditions?.ruleEvaluationAt??plan.ruleSnapshot?.at;
 if(!at||!Number.isFinite(Date.parse(at)))return unchecked('缺少冻结规则生效判定时刻，无法确定资源采用范围；未检查。');
 if(!['resourceClaims','tools','dependencies','personnelGroups','batchResources','skillSubstitutions'].every(k=>Array.isArray(data[k])))return unchecked('冻结资源配置不完整，无法重建需求；未检查。');
 const problems=[],reservations=plan.resourceReservations||[],tasks=plan.tasks||[];
 const add=m=>problems.push(m),num=(r,k,fallback=0)=>Number(r[k]??fallback);
 const enabled=id=>(data.rules||[]).some(r=>r['规则编号']===id&&r['是否启用']==='是'&&(!conditions?.enabledRuleIds||conditions.enabledRuleIds.includes(id))&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at)));
 for(const id of ['MOLD','STORAGE'])if(enabled(id)!==(plan.rules||[]).includes(id))add(`${id} 结果采用标志与冻结规则/运行选择/生效时刻不一致`);
 const split=s=>String(s||'').split(/[;,，；\s]+/).filter(Boolean);
 const matches=(g,required,op,r)=>{
  const have=split(g['技能']);if(have.includes(required))return r.providedSkill===required&&!r.relationId;
  const edges=(data.skillSubstitutions||[]).filter(e=>have.includes(e['可提供技能'])&&e['所需技能']===required);
  return edges.some(e=>{
   const exact=edges.find(x=>x['可提供技能']===e['可提供技能']&&x['适用工序']===op),chosen=exact||(e['适用工序']==='*'?e:null);
   return chosen&&chosen['是否启用']==='是'&&r.providedSkill===chosen['可提供技能']&&r.relationId===chosen['关系编号'];
  });
 };
 const seen=new Set(),expectedReservations=new Set();
 for(const task of tasks){
  // One resource-batch leader represents personnel; tooling declarations remain per production batch.
  const personnelKey=task.resourceBatchId||task.id;
  if(!seen.has(personnelKey)){
   seen.add(personnelKey);
   const members=task.resourceBatchId?tasks.filter(t=>t.resourceBatchId===task.resourceBatchId):[task];
   const requirements=members.flatMap(m=>(data.dependencies||[]).filter(d=>d['订单编号']===m.orderId&&d['工序编号']===m.operation&&d['资源类型']==='人员技能').map(d=>({...d,__policyRoleSource:m.productionBatchId||m.orderId})));
   const saved=reservations.filter(r=>r.type==='人员'&&(r.taskIds||[r.taskId]).includes(task.id));
   // Independently derive allowed sets and role identities from frozen rows.
   // Old ledgers without demandKey are accepted only for original single groups.
   const expected=requirements.map((d,index)=>{
    const ids=d['候选人员组']?.trim()?String(d['候选人员组']).split(/[,，]/).map(s=>s.trim()):d['资源编号']?.trim()?[d['资源编号'].trim()]:[];
    if(!ids.length||ids.some(id=>!id)||new Set(ids).size!==ids.length||ids.length>32||d['候选人员组']?.trim()&&d['资源编号']?.trim())add(`${task.id} 冻结人员候选配置无效`);
    const key=JSON.stringify([[...ids].sort(),d['所需技能']||'',d['所需班次']||'',d.__policyRoleSource,d['人员参与阶段']?'窗口集合':index]);
    const start=d['窗口外释放']==='否'?task.start:task.start+num(d,'人员开始偏移'),end=d['窗口外释放']==='否'?task.end:task.end-num(d,'人员结束偏移');
    if(!(end>start))add(`${task.id} 人员窗口超出实际工序`);
    return {d,ids,key,start,end,count:num(d,'需求数量')};
   });
   const keyFor=r=>r.demandKey||expected.find(e=>!e.d['候选人员组']?.trim()&&e.ids[0]===r.resourceId&&e.d['所需技能']===r.requiredSkill&&e.d.__policyRoleSource===r.roleSource)?.key;
   const roles=new Set([...expected.map(e=>e.key),...saved.map(r=>keyFor(r))]);
   for(const role of roles){
    const want=expected.filter(e=>e.key===role),got=saved.filter(r=>keyFor(r)===role);
    const points=[...new Set([...want.flatMap(e=>[e.start,e.end]),...got.flatMap(e=>[e.start,e.end])])].sort((a,b)=>a-b);
    for(const t of points.slice(0,-1)){
     const active=want.filter(e=>e.start<=t&&e.end>t);
     const demand=Math.max(0,...active.map(e=>e.count));
     const allocated=got.filter(r=>r.start<=t&&r.end>t).reduce((s,r)=>s+Number(r.quantity),0);
     if(demand!==allocated)add(`${task.id} ${role||'未知需求'} 在分钟 ${t} 人员覆盖 ${allocated} ≠ 配置 ${demand}`);
    }
   }
   for(const r of saved){
    expectedReservations.add(r);
    const g=(data.personnelGroups||[]).find(g=>g['人员组编号']===r.resourceId),needs=expected.filter(e=>e.key===keyFor(r)&&e.ids.includes(r.resourceId)&&e.d['所需技能']===r.requiredSkill&&e.d.__policyRoleSource===r.roleSource);
    if(!Number.isSafeInteger(Number(r.quantity))||!g||!matches(g,r.requiredSkill,task.operation,r)||!needs.length||needs.some(e=>e.d['所需班次']&&g['班次']!==e.d['所需班次']))add(`${task.id} 人员候选/需求/技能/有向替代/班次来源不匹配`);
   }
  }
  for(const c of (data.resourceClaims||[]).filter(c=>c['订单编号']===task.orderId&&c['工序编号']===task.operation&&enabled(c['资源类型']==='工装'?'MOLD':'STORAGE'))){
   const tool=(data.tools||[]).find(t=>t['工装编码']===c['资源编号']),inherit=c['参数来源']==='工装配置',quantity=inherit?tool?.['每任务需求数量']:c['需求数量'];
   const before=inherit?tool?.['提前占用分钟']:c['提前占用分钟'],after=inherit?tool?.['后延占用分钟']:c['后延占用分钟'];
   const start=task.start+(c['占用口径']==='明确窗口'?num(c,'窗口开始偏移分钟'):0)-Number(before),end=task.end-(c['占用口径']==='明确窗口'?num(c,'窗口结束偏移分钟'):0)+Number(after);
   const got=reservations.filter(r=>r.declarationId===c['声明编号']&&(r.taskIds||[r.taskId]).includes(task.id)&&(!task.productionBatchId||r.productionBatchId===task.productionBatchId));
   got.forEach(r=>expectedReservations.add(r));
   if(got.length!==1||got[0].resourceId!==c['资源编号']||got[0].start!==start||got[0].end!==end||Number(got[0].quantity)!==Number(quantity))add(`${task.id} ${c['声明编号']} 工装/空间占用与配置不一致或缺失`);
  }
 }
 for(const r of reservations.filter(r=>r.type!=='设备')){
  if(!expectedReservations.has(r))add(`${r.resourceId} 存在无有效配置来源的资源占用`);
  const g=r.type==='人员'?(data.personnelGroups||[]).find(g=>g['人员组编号']===r.resourceId):r.type==='工装'?(data.tools||[]).find(g=>g['工装编码']===r.resourceId):(data.batchResources||[]).find(g=>g['资源编号']===r.resourceId);
  const capacity=Number(g?.[r.type==='人员'?'人员数量':r.type==='工装'?'可用数量':'容量']);
  if(!g||!(capacity>0)||!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.start<0||r.end<=r.start||(!Number.isFinite(Number(r.quantity))||!(Number(r.quantity)>0))){add(`${r.resourceId} 资源/数量/区间无效`);continue;}
  if(r.start<num(g,'可用起始分钟')||r.end>num(g,'可用结束分钟',525600))add(`${r.resourceId} 不在实际可用期 [${g['可用起始分钟']??0},${g['可用结束分钟']??525600})`);
  if(r.type==='人员')for(const e of data.simulationEvents||[])if(e['事件类型']==='人员缺勤'){try{const v=JSON.parse(e['参数JSON']);if(v.groupId===r.resourceId&&Number(e['事件分钟'])<r.end&&v.endMinute>r.start)add(`${r.resourceId} 与冻结缺勤 [${e['事件分钟']},${v.endMinute}) 冲突`);}catch{add('冻结缺勤配置无效');}}
  const same=reservations.filter(x=>x.type===r.type&&x.resourceId===r.resourceId);
  for(const t of [r.start,...same.map(x=>x.start).filter(t=>t>=r.start&&t<r.end)])if(Q.cmp(same.filter(x=>x.start<=t&&x.end>t).reduce((s,x)=>Q.add(s,Q.q(x.quantity)),Q.zero),Q.q(String(capacity)))>0n)add(`${r.resourceId} 在分钟 ${t} 超容量 ${capacity}（所有技能合计）`);
  if(!(r.taskIds||[r.taskId]).some(id=>tasks.some(t=>t.id===id)))add(`${r.resourceId} 存在无任务资源占用`);
 }
 const findings=resourceConflicts(plan,data,conditions);
 const hasPolicy=enabled('MOLD')||enabled('STORAGE')||(data.dependencies||[]).some(d=>d['资源类型']==='人员技能');
 return {findings,status:problems.length?'problem':tasks.length&&hasPolicy?'pass':'not_checked',details:problems.length?problems:[`工装 ${enabled('MOLD')?'已启用':'未检查（未启用）'}；空间 ${enabled('STORAGE')?'已启用':'未检查（未启用）'}；人员按已配置依赖检查。`,tasks.length&&hasPolicy?'按冻结配置重建已采用的工装/人员窗口、覆盖人数、单向替代、可用期与同池总容量；相邻释放合法。':'没有已排任务或已采用的资源配置可复核。']};
}
