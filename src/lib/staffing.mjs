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
  const rows=roles.get(key)||[];rows.push({r,count,start:r['窗口外释放']==='否'?start:start+a,end:r['窗口外释放']==='否'?end:end-b});roles.set(key,rows);
 }
 const windows=[];
 for(const [demandKey,rows] of roles.entries()){
  const points=[...new Set(rows.flatMap(r=>[r.start,r.end]))].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){
   const active=rows.filter(r=>r.start<=points[i]&&r.end>points[i]);if(!active.length)continue;
   windows.push({demandKey,r:active[0].r,count:Math.max(...active.map(r=>r.count)),start:points[i],end:points[i+1]});
  }
 }
 return windows;
}
// Bounded integer distribution search over complete participation windows. No
// mutation of caller reservations; rejected branches never become resource use.
export function allocatePersonnel(requirements,groups,start,end,reservations=[],substitutions=[]){
 let windows;try{windows=personnelWindows(requirements,start,end);}catch(e){return {ok:false,reason:e.message};}
 const allocations=[];let steps=0,limited=false;
 const limit=50000;
 if(requirements.some(r=>{const ids=personnelCandidates(r);return Number(r['需求数量'])>0&&(!ids.length||ids.length>32||new Set(ids).size!==ids.length||ids.some(id=>!id)||r['候选人员组']?.trim()&&r['资源编号']?.trim());}))return {ok:false,reason:'人员须显式绑定单组或有限候选集合（互斥）；缺少候选不是任意组'};
 const jobs=windows.map(w=>({...w,candidates:groups.filter(g=>personnelCandidates(w.r).includes(g['人员组编号'])&&Number.isSafeInteger(Number(g['人员数量']))&&Number(g['人员数量'])>0&&(!w.r['所需班次']||g['班次']===w.r['所需班次'])&&Number(g['可用起始分钟'])<=w.start&&Number(g['可用结束分钟'])>=w.end&&skillMatch(g,w.r['所需技能'],w.r['工序编号'],substitutions)).sort((a,b)=>a['人员组编号'].localeCompare(b['人员组编号']))})).sort((a,b)=>a.candidates.length-b.candidates.length||a.demandKey.localeCompare(b.demandKey)||a.start-b.start);
 if(jobs.length>256)return {ok:false,reason:'人员候选搜索边界：超过256个参与窗口；本次未找到分配，不代表数学不可行',searchStatus:'limit'};
 function available(g,w){
  const used=[...reservations,...allocations].filter(r=>r.groupId===g['人员组编号']&&r.start<w.end&&r.end>w.start);
  const points=[w.start,...used.map(r=>r.start).filter(t=>t>=w.start&&t<w.end)];
  return Math.max(0,Number(g['人员数量'])-Math.max(0,...points.map(t=>used.filter(r=>r.start<=t&&r.end>t).reduce((sum,r)=>sum+r.count,0))));
 }
 function search(index){
  if(++steps>limit){limited=true;return false;}if(index===jobs.length)return true;
  const w=jobs[index];
  function distribute(c,remaining){
   if(++steps>limit){limited=true;return false;}if(!remaining)return search(index+1);
   if(c===w.candidates.length)return false;
   const g=w.candidates[c],max=Math.min(remaining,available(g,w));
   const rest=w.candidates.slice(c+1).reduce((sum,g)=>sum+available(g,w),0),min=Math.max(0,remaining-rest);
   for(let n=max;n>=min;n--){
    if(n){const match=skillMatch(g,w.r['所需技能'],w.r['工序编号'],substitutions);allocations.push({demandKey:w.demandKey,postId:w.r['人员岗位编号']?.trim()||'',roleSource:w.r['__policyRoleSource']||w.r['订单编号'],groupId:g['人员组编号'],count:n,start:w.start,end:w.end,...match,reason:`${match.reason}；岗位 ${w.r['人员岗位编号']?.trim()||'旧配置未编号'}；显式候选 ${personnelCandidates(w.r).join('、')}；${w.r['窗口外释放']==='否'?'窗口外保留，全工序占用':'窗口外释放'}；同池统一扣人数`});}
    if(distribute(c+1,remaining-n))return true;
    if(n)allocations.pop();if(limited)return false;
   }
   return false;
  }
  return distribute(0,w.count);
 }
 let found;try{found=search(0);}catch(e){if(!(e instanceof RangeError))throw e;limited=true;}
 if(found)return {ok:true,allocations,searchStatus:'found',searchSteps:steps};
 return {ok:false,searchStatus:limited?'limit':'exhausted',searchSteps:steps,reason:limited?'人员候选搜索边界：达到50000步或运行时递归边界；本次未找到分配，不代表数学不可行':'人员显式候选在当前参与窗口、班次、技能和已有占用下无足够可用人数；有限整窗分配未找到解，不代表其他排程时点不可行'};
}
