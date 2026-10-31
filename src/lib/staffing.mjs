import {occupationErrors,occupationInterval,hasOccupation} from './personnel-occupation.mjs';
import {poolCapacityAt,poolPolicyPoints,validatePhysicalPools} from './physical-pools.mjs';
import {allowedWindows} from './working-windows.mjs';
import {skillMatch,personnelCandidates} from './resource-policies.mjs';
// Merge repeated/overlapping windows of the same role by maximum headcount.
// Distinct required skills are separate concurrent demands on the same pool.
export function personnelWindows(requirements,start,end){
 const roles=new Map();
 for(const [index,r] of requirements.entries()){
  if(r['人员参与阶段']?.trim()&&['人员开始偏移','人员结束偏移'].some(k=>typeof r[k]!=='string'||!/^\d+$/.test(r[k])||!Number.isSafeInteger(Number(r[k]))||Number(r[k])>525600))throw Error(`工序 ${r['工序编号']} 明确人员窗口须显式填写整数偏移，空值不按0采用`);
  const count=Number(r['需求数量']||0),a=Number(r['人员开始偏移']||0),b=Number(r['人员结束偏移']||0);
  if(!Number.isInteger(count)||count<0||![a,b].every(Number.isFinite)||a<0||b<0||a+b>=end-start)throw Error(`工序 ${r['工序编号']} 人数或明确参与窗口无效`);
  if(!count)continue;
  const key=JSON.stringify([[...personnelCandidates(r)].sort(),r['所需技能']||'',r['所需班次']||'',r['__policyRoleSource']||r['订单编号'],...(r['人员岗位编号']?.trim()?['岗位',r['人员岗位编号'].trim()]:[r['人员参与阶段']?'窗口集合':index])]);
  const interval=occupationInterval(r,start,end);
  const rows=roles.get(key)||[];rows.push({r,count,...interval});roles.set(key,rows);
 }
 const windows=[];
 for(const [demandKey,rows] of roles.entries()){
  const points=[...new Set(rows.flatMap(r=>[r.start,r.end]))].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){
   const active=rows.filter(r=>r.start<=points[i]&&r.end>points[i]);if(!active.length)continue;
   windows.push({demandKey,r:active[0].r,sourceRows:active.map(a=>a.r),baseWindows:active.map(a=>[a.baseStart,a.baseEnd]),count:Math.max(...active.map(r=>r.count)),start:points[i],end:points[i+1]});
  }
 }
 return windows;
}
// Bounded integer distribution search over complete participation windows. No
// mutation of caller reservations; rejected branches never become resource use.
export function allocatePersonnel(requirements,groups,start,end,reservations=[],substitutions=[],pools=[],windowContext){
 if(pools.length){const issues=validatePhysicalPools({personnelPools:pools,personnelGroups:groups,dependencies:requirements},{forRun:false});if(issues.length)return {ok:false,reason:issues.map(i=>`${i.file}:${i.row}:${i.field} ${i.message}`).join('；')};}
 requirements=effectivePersonnelRequirements(requirements,groups,pools);
 const covers=(g,a,b)=>Number(g['可用起始分钟'])<=a&&Number(g['可用结束分钟'])>=b&&(!windowContext||allowedWindows(windowContext.data,windowContext.calendarId,'人员',g['人员组编号'],Number(g['可用起始分钟']),Number(g['可用结束分钟'])).some(([s,e])=>s<=a&&b<=e));
 const prechecked=new Map();
 // Order is actually executed: check base availability BEFORE expanding for this path.
 for(const r of requirements){const errors=occupationErrors(r);if(errors.length)return {ok:false,reason:errors.map(([k,m])=>k+' '+m).join('；')};
  if(r['人员检查顺序']==='先检查可用性再扩展占用'){
   const whole=r['窗口外释放']==='否'||r['人员占用基准']==='完整工序';
   const a=whole?start:start+Number(r['人员开始偏移']||0),b=whole?end:end-Number(r['人员结束偏移']||0);
   prechecked.set(r,new Set(groups.filter(g=>covers(g,a,b)).map(g=>g['人员组编号'])));
  }
 }
 let windows;try{windows=personnelWindows(requirements,start,end);}catch(e){return {ok:false,reason:e.message};}
 const allocations=[];let steps=0,limited=false;
 const limit=50000;
 if(requirements.some(r=>{const ids=personnelCandidates(r);return Number(r['需求数量'])>0&&(!ids.length||ids.length>32||new Set(ids).size!==ids.length||ids.some(id=>!id)||r['候选人员组']?.trim()&&r['资源编号']?.trim());}))return {ok:false,reason:'人员须显式绑定单组或有限候选集合（互斥）；缺少候选不是任意组'};
 const jobs=windows.map(w=>({...w,candidates:groups.filter(g=>personnelCandidates(w.r).includes(g['人员组编号'])&&Number.isSafeInteger(Number(g['人员数量']))&&Number(g['人员数量'])>0&&(!w.r['所需班次']||g['班次']===w.r['所需班次'])&&w.sourceRows.every(r=>!prechecked.has(r)||prechecked.get(r).has(g['人员组编号']))&&Number(g['可用起始分钟'])<=w.start&&Number(g['可用结束分钟'])>=w.end&&(!windowContext||allowedWindows(windowContext.data,windowContext.calendarId,'人员',g['人员组编号'],Number(g['可用起始分钟']),Number(g['可用结束分钟'])).some(([a,b])=>a<=w.start&&w.end<=b))&&skillMatch(g,w.r['所需技能'],w.r['工序编号'],substitutions)).sort((a,b)=>a['人员组编号'].localeCompare(b['人员组编号']))})).sort((a,b)=>a.candidates.length-b.candidates.length||a.demandKey.localeCompare(b.demandKey)||a.start-b.start);
 if(jobs.length>256)return {ok:false,reason:'人员候选搜索边界：超过256个参与窗口；本次未找到分配，不代表数学不可行',searchStatus:'limit'};
 const poolMode=pools.length>0||groups.some(g=>g.poolId?.trim());
 if(poolMode&&groups.some(g=>!g.poolId||!pools.some(p=>p.poolId===g.poolId&&p['是否启用']==='是'&&['是','否'].includes(p['允许共用'])&&Number.isSafeInteger(Number(p['总人数']))&&Number(p['总人数'])>0)))return {ok:false,reason:'P10待配置：显式poolId、已启用策略池与有限总人数缺失'};
 function available(g,w){
  const used=[...reservations,...allocations].filter(r=>r.groupId===g['人员组编号']&&r.start<w.end&&r.end>w.start);
  const points=[w.start,...used.map(r=>r.start).filter(t=>t>=w.start&&t<w.end)];
  const groupFree=Math.max(0,Number(g['人员数量'])-Math.max(0,...points.map(t=>used.filter(r=>r.start<=t&&r.end>t).reduce((sum,r)=>sum+r.count,0))));
  if(!poolMode)return groupFree;
  const pool=pools.find(p=>p.poolId===g.poolId);
  // Derive identity from the frozen group table, never from reservation labels.
  const same=[...reservations,...allocations].filter(r=>groups.find(x=>x['人员组编号']===r.groupId)?.poolId===g.poolId&&r.start<w.end&&r.end>w.start);
  if(pool['允许共用']==='否'){
   if(pool['互斥粒度']==='人员组互斥'&&same.some(r=>r.groupId!==g['人员组编号']))return 0;
   if(pool['互斥粒度']==='工序互斥'&&reservations.some(r=>groups.find(x=>x['人员组编号']===r.groupId)?.poolId===g.poolId&&r.start<w.end&&r.end>w.start))return 0;
  }
  const boundaries=[w.start,...same.map(r=>r.start),...poolPolicyPoints(pool)].filter(t=>t>=w.start&&t<w.end);
  const free=Math.min(...boundaries.map(t=>poolCapacityAt(pool,t)-same.filter(r=>r.start<=t&&r.end>t).reduce((s,r)=>s+r.count,0)));
  return Math.max(0,Math.min(groupFree,free));
 }
 function search(index){
  if(++steps>limit){limited=true;return false;}if(index===jobs.length){
   if(!windowContext)return true;
   // Each explicitly declared phase needs a stable cohort for its whole span.
   // Segmentation for overlapping max-demand roles must not create a handover.
   for(const r of requirements){
    const phase=personnelWindows([r],start,end)[0];if(!phase)continue;
    const index=requirements.indexOf(r),role=JSON.stringify([[...personnelCandidates(r)].sort(),r['所需技能']||'',r['所需班次']||'',r['__policyRoleSource']||r['订单编号'],...(r['人员岗位编号']?.trim()?['岗位',r['人员岗位编号'].trim()]:[r['人员参与阶段']?'窗口集合':index])]);
    const rows=allocations.filter(a=>a.demandKey===role&&a.start<phase.end&&a.end>phase.start);
    const points=[...new Set([phase.start,...rows.flatMap(a=>[a.start,a.end]).filter(t=>t>phase.start&&t<phase.end)])];
    const stable=groups.reduce((sum,g)=>sum+Math.min(...points.map(t=>rows.filter(a=>a.groupId===g['人员组编号']&&a.start<=t&&a.end>t).reduce((n,a)=>n+a.count,0))),0);
    if(stable<phase.count)return false;
   }
   return true;
  }
  const w=jobs[index];
  function distribute(c,remaining){
   if(++steps>limit){limited=true;return false;}if(!remaining)return search(index+1);
   if(c===w.candidates.length)return false;
   const g=w.candidates[c],max=Math.min(remaining,available(g,w));
   const rest=w.candidates.slice(c+1).reduce((sum,g)=>sum+available(g,w),0),min=Math.max(0,remaining-rest);
   for(let n=max;n>=min;n--){
    if(n){const match=skillMatch(g,w.r['所需技能'],w.r['工序编号'],substitutions);allocations.push({demandKey:w.demandKey,postId:w.r['人员岗位编号']?.trim()||'',roleSource:w.r['__policyRoleSource']||w.r['订单编号'],groupId:g['人员组编号'],...(poolMode?{poolId:g.poolId}:{}),count:n,start:w.start,end:w.end,...(w.sourceRows.some(hasOccupation)?{occupationPolicies:w.sourceRows.filter(hasOccupation).map(r=>({scope:r['人员占用基准'],order:r['人员检查顺序'],before:Number(r['提前占用分钟']),after:Number(r['后延占用分钟']),source:r['人员配置来源'],version:r['人员配置版本']}))}:{}),...match,reason:`${match.reason}；岗位 ${w.r['人员岗位编号']?.trim()||'旧配置未编号'}；显式候选 ${personnelCandidates(w.r).join('、')}；${w.r['窗口外释放']==='否'?'窗口外保留，全工序占用':'窗口外释放'}；同池统一扣人数；${pools.find(p=>p.poolId===g.poolId)?.['互斥粒度']||'旧组契约'}；${pools.find(p=>p.poolId===g.poolId)?.['交接模式']||'旧组契约'}`});}
    if(distribute(c+1,remaining-n))return true;
    if(n)allocations.pop();if(limited)return false;
   }
   return false;
  }
  return distribute(0,w.count);
 }
 let found;try{found=search(0);}catch(e){if(!(e instanceof RangeError))throw e;limited=true;}
 const shortage=[];
 const future=windowContext?windows.flatMap(w=>groups.filter(g=>personnelCandidates(w.r).includes(g['人员组编号'])).flatMap(g=>allowedWindows(windowContext.data,windowContext.calendarId,'人员',g['人员组编号'],Number(g['可用起始分钟']),Number(g['可用结束分钟'])).filter(([a,b])=>b-a>=w.end-w.start).map(([a])=>a-(w.start-start)))).filter(t=>t>start):[];
 future.push(...windows.flatMap(w=>[...reservations.map(r=>r.end),...groups.filter(g=>personnelCandidates(w.r).includes(g['人员组编号'])).map(g=>Number(g['可用起始分钟']))].map(t=>t-(w.start-start))).filter(t=>t>start));
 future.push(...windows.flatMap(w=>pools.flatMap(poolPolicyPoints).map(t=>t-(w.start-start))).filter(t=>t>start));
 const nextStart=future.length?Math.min(...future):undefined;
 for(const p of pools){
  const fixed=jobs.filter(w=>w.candidates.length&&w.candidates.every(g=>g.poolId===p.poolId));
  const old=reservations.filter(r=>groups.find(g=>g['人员组编号']===r.groupId)?.poolId===p.poolId);
  const points=[...new Set([...fixed,...old].flatMap(r=>[r.start,r.end]))].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){const t=points[i],demand=[...fixed,...old].filter(r=>r.start<=t&&r.end>t).reduce((s,r)=>s+r.count,0);if(demand>Number(p['总人数']))shortage.push(`池 ${p.poolId} 组 ${groups.filter(g=>g.poolId===p.poolId).map(g=>g['人员组编号']).join('/')} [${t},${points[i+1]}) 固定池需求 ${demand} 人 / 可用 ${p['总人数']} 人 / 差额 ${demand-Number(p['总人数'])}`);}
 }
 // Explain fixed-group bottlenecks separately from the physical total. A
 // candidate set is not a commitment to each member, so only fixed jobs count.
 for(const g of groups){
  const fixed=jobs.filter(w=>personnelCandidates(w.r).length===1&&personnelCandidates(w.r)[0]===g['人员组编号']);
  const old=reservations.filter(r=>r.groupId===g['人员组编号']);
  const points=[...new Set([...fixed,...old].flatMap(r=>[r.start,r.end]))].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){
   const t=points[i],active=[...fixed,...old].filter(r=>r.start<=t&&r.end>t),demand=active.reduce((n,r)=>n+r.count,0);
   if(demand>Number(g['人员数量']))shortage.push(`组 ${g['人员组编号']} 池 ${g.poolId||'旧组契约'} [${t},${points[i+1]}) 岗位 ${[...new Set(active.map(w=>w.r?.['人员岗位编号']||w.postId||'既有占用'))].join('/')} 需求 ${demand} 人 / 资格上限 ${g['人员数量']} 人 / 差额 ${demand-Number(g['人员数量'])}`);
  }
 }
 const availability=windowContext?jobs.filter(w=>!w.candidates.length).slice(0,8).map(w=>`岗位 ${w.r['人员岗位编号']||'未编号'} 要求 ${w.r['所需技能']||'未填技能'}/${w.r['所需班次']||'未限定班次'} [${w.start},${w.end})；`+groups.filter(g=>personnelCandidates(w.r).includes(g['人员组编号'])).map(g=>`${g['人员组编号']} 技能 ${g['技能']} 班次 ${g['班次']||'未填'} 可用整窗 ${JSON.stringify(allowedWindows(windowContext.data,windowContext.calendarId,'人员',g['人员组编号'],Number(g['可用起始分钟']),Number(g['可用结束分钟'])))} 停用 ${JSON.stringify((windowContext.data.resourceStops||[]).filter(r=>r['资源类型']==='人员'&&r['资源编号']===g['人员组编号']))}`).join('；')).join('；'):'';
 if(found)return {ok:true,allocations,searchStatus:'found',searchSteps:steps};
 return {ok:false,nextStart,searchStatus:limited?'limit':'exhausted',searchSteps:steps,reason:limited?'人员候选搜索边界：达到50000步或运行时递归边界；本次未找到分配，不代表数学不可行':`人员显式候选在单个继承工厂工作窗口（扣除人员停用例外）及当前参与窗口、班次、技能和已有占用下无足够可用人数；组资格上限与物理池唯一总人数同时限制；${pools.map(p=>`池 ${p.poolId} 总人数 ${p['总人数']}；${p['互斥粒度']||'旧契约'}；${p['交接模式']||'旧契约'} [${p['交接起始分钟']||'-'},${p['交接结束分钟']||'-'}) 上限 ${p['交接容量人数']||'-'} 人；${p['占用策略']||'依赖声明'}`).join('、')}；${shortage.join('；')}；${availability}；有限整窗分配未找到解，不代表其他排程时点不可行`};
}

export function effectivePersonnelRequirements(requirements,groups,pools){return requirements.map(r=>{const ids=personnelCandidates(r),p=pools.find(p=>groups.some(g=>ids.includes(g['人员组编号'])&&g.poolId===p.poolId));return p?.['占用策略']==='全工序保留'?{...r,'窗口外释放':'否'}:r;});}
