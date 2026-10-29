import {skillMatch} from './resource-policies.mjs';
// Merge repeated/overlapping windows of the same role by maximum headcount.
// Distinct required skills are separate concurrent demands on the same pool.
export function personnelWindows(requirements,start,end){
 const roles=new Map();
 for(const [index,r] of requirements.entries()){
  if(r['人员参与阶段']?.trim()&&['人员开始偏移','人员结束偏移'].some(k=>typeof r[k]!=='string'||!/^\d+$/.test(r[k])||!Number.isSafeInteger(Number(r[k]))||Number(r[k])>525600))throw Error(`工序 ${r['工序编号']} 明确人员窗口须显式填写整数偏移，空值不按0采用`);
  const count=Number(r['需求数量']||0),a=Number(r['人员开始偏移']||0),b=Number(r['人员结束偏移']||0);
  if(!Number.isInteger(count)||count<0||![a,b].every(Number.isFinite)||a<0||b<0||a+b>=end-start)throw Error(`工序 ${r['工序编号']} 人数或明确参与窗口无效`);
  if(!count)continue;
  const key=JSON.stringify([r['资源编号'],r['所需技能'],r['所需班次'],r['__policyRoleSource']||r['订单编号'],r['人员参与阶段']?'窗口集合':index]);
  const rows=roles.get(key)||[];rows.push({r,count,start:r['窗口外释放']==='否'?start:start+a,end:r['窗口外释放']==='否'?end:end-b});roles.set(key,rows);
 }
 const windows=[];
 for(const rows of roles.values()){
  const points=[...new Set(rows.flatMap(r=>[r.start,r.end]))].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){
   const active=rows.filter(r=>r.start<=points[i]&&r.end>points[i]);if(!active.length)continue;
   windows.push({r:active[0].r,count:Math.max(...active.map(r=>r.count)),start:points[i],end:points[i+1]});
  }
 }
 return windows;
}
export function allocatePersonnel(requirements,groups,start,end,reservations=[],substitutions=[]){
 const allocations=[];let windows;
 try{windows=personnelWindows(requirements,start,end);}catch(e){return {ok:false,reason:e.message};}
 for(const {r:requirement,count,start:from,end:until}of windows){
  const skill=(requirement['所需技能']||'').trim(),shift=(requirement['所需班次']||'').trim(),requiredGroup=(requirement['资源编号']||'').trim();
  const candidates=groups.filter(g=>g['人员组编号']&&(!requiredGroup||g['人员组编号']===requiredGroup)&&Number.isInteger(Number(g['人员数量']))&&Number(g['人员数量'])>0&&(!shift||g['班次']===shift)&&Number(g['可用起始分钟'])<=from&&Number(g['可用结束分钟'])>=until&&skillMatch(g,skill,requirement['工序编号'],substitutions)).sort((a,b)=>a['人员组编号'].localeCompare(b['人员组编号']));
  let remaining=count;
  for(const group of candidates){
   const groupId=group['人员组编号'];
   const relevant=[...reservations,...allocations].filter(r=>r.groupId===groupId&&r.start<until&&r.end>from);
   const points=[from,...relevant.map(r=>r.start).filter(t=>t>=from&&t<until)];
   const busy=Math.max(0,...points.map(t=>relevant.filter(r=>r.start<=t&&r.end>t).reduce((s,r)=>s+r.count,0)));
   const assigned=Math.min(remaining,Math.max(0,Number(group['人员数量'])-busy));
   if(assigned){const match=skillMatch(group,skill,requirement['工序编号'],substitutions);allocations.push({roleSource:requirement['__policyRoleSource']||requirement['订单编号'],groupId,count:assigned,start:from,end:until,...match,reason:`${match.reason}；${requirement['窗口外释放']==='否'?'窗口外保留，全工序占用':'窗口外释放'}；同池统一扣人数`});remaining-=assigned;}
   if(!remaining)break;
  }
  if(remaining)return {ok:false,reason:`工序 ${requirement['工序编号']} 需要 ${count} 人、技能“${skill}”${shift?'、班次“'+shift+'”':''}，参与时段 ${from}–${until} 无足够可用人员或无启用的有向替代`};
 }
 return {ok:true,allocations};
}
