import {validatePhysicalPools} from './physical-pools.mjs';
import {sourceRefs} from './problem-records.mjs';
// One policy source per declaration; no name/grade based skill rules.
export const skillsOf=value=>String(value||'').split(/[;,，；\s]+/).filter(Boolean);
// Empty candidate field preserves an explicit single group; never means all groups.
export const personnelCandidates=r=>r['候选人员组']?.trim()?String(r['候选人员组']).split(/[,，]/).map(s=>s.trim()):r['资源编号']?.trim()?[r['资源编号'].trim()]:[];
export const whole='显式逐生产批完整区间';
export const windowMode='明确窗口';
export function migratePolicies(input){
 const d=structuredClone(input);d.skillSubstitutions??=[];
 d.resourceClaims=(d.resourceClaims||[]).map(c=>({...c,'窗口开始偏移分钟':c['窗口开始偏移分钟']??'0','窗口结束偏移分钟':c['窗口结束偏移分钟']??'0','参数来源':c['参数来源']??'逐项声明'}));
 d.dependencies=(d.dependencies||[]).map(r=>r['资源类型']==='人员技能'?{...r,'窗口外释放':r['窗口外释放']??'是'}:r);
 return d;
}
export function effectiveClaim(c,data){
 const t=(data.tools||[]).find(t=>t['工装编码']===c['资源编号']);
 return c['资源类型']==='工装'&&c['参数来源']==='工装配置'?{...c,...Object.fromEntries(['需求数量','提前占用分钟','后延占用分钟'].map(k=>[k,t?.[k==='需求数量'?'每任务需求数量':k]]))}:c;
}
const minute=v=>typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)<=525600;
// Only constraints actually adopted at the evaluation instant require an
// original execution ledger. Personnel dependencies remain intrinsic even when LABOR is off.
export function validatePolicyExecution(data,at=new Date().toISOString(),mode='supported'){
 if(mode==='minimal-r1')return [];
 const active=id=>(data.rules||[]).some(r=>r['规则编号']===id&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at)));
 return (data.executionFacts||[]).flatMap((f,i)=>{
  const same=r=>r['订单编号']===f['订单编号']&&r['工序编号']===f['工序编号'];
  const missing=[...(data.resourceClaims||[]).filter(c=>same(c)&&active(c['资源类型']==='工装'?'MOLD':'STORAGE')).map(c=>`${c['资源类型']} ${c['资源编号']}（声明 ${c['声明编号']}）`),...(data.dependencies||[]).filter(d=>same(d)&&d['资源类型']==='人员技能').map(d=>`人员 ${d['资源编号']} / ${d['所需技能']}`)];
  return missing.length?[{relatedRecords:[...sourceRefs('executionFacts',[f],data.executionFacts),...sourceRefs('resourceClaims',(data.resourceClaims||[]).filter(c=>same(c)&&active(c['资源类型']==='工装'?'MOLD':'STORAGE')),data.resourceClaims||[]),...sourceRefs('dependencies',(data.dependencies||[]).filter(d=>same(d)&&d['资源类型']==='人员技能'),data.dependencies||[])],code:'INPUT / RESOURCE_POLICY',table:'executionFacts',file:'25_模拟任务执行事实.csv',row:i+2,field:'工序编号',message:`${f['订单编号']}/${f['工序编号']} 该任务已有执行事实，原始工装/人员占用事实未建模；缺少 ${missing.join('、')} 的原始取得/参与起止、数量及归还/释放事实。本次阻断采用这些资源约束，不把阶段偏移重置到剩余工时，也不改写历史。`}]:[];
 });
}
export function validatePolicies(data,at=new Date().toISOString(),mode='supported',checkExecution=true){
 const refs=(table,rows)=>sourceRefs(table,rows,data[table]||[]);
 const issues=[...validatePhysicalPools(data,{at})];const add=(table,i,field,message,relatedRecords=refs(table,[data[table][i]]))=>issues.push({relatedRecords,code:'INPUT / RESOURCE_POLICY',table,row:i+2,field,message,...(table==='dependencies'?{file:'12_工序资源与物料依赖.csv'}:{})});
 const skillSet=new Set((data.personnelGroups||[]).flatMap(g=>skillsOf(g['技能'])));
 for(const [i,r]of (data.dependencies||[]).entries())if(r['资源类型']==='人员技能'&&r['所需技能'])skillSet.add(r['所需技能']);
 if(checkExecution)issues.push(...validatePolicyExecution(data,at,mode));
 const seen=new Set();
 for(const [i,r]of (data.skillSubstitutions||[]).entries()){
  const fail=(f,m,baseline=[])=>add('skillSubstitutions',i,f,m,[...refs('skillSubstitutions',[r]),...baseline]),key=JSON.stringify([r['可提供技能'],r['所需技能'],r['适用工序']]);
  if(!r['关系编号']?.trim())fail('关系编号','必填');
  if(seen.has(key))add('skillSubstitutions',i,'可提供技能','同方向及范围只能有一条关系，禁止重叠覆盖',refs('skillSubstitutions',(data.skillSubstitutions||[]).filter(x=>JSON.stringify([x['可提供技能'],x['所需技能'],x['适用工序']])===key)));seen.add(key);
  for(const k of ['可提供技能','所需技能'])if(!r[k]?.trim()||r[k]!==r[k].trim()||!skillSet.has(r[k]))fail(k,'须引用人员组已声明技能或现有需求技能',r[k]?.trim()&&r[k]===r[k].trim()?[...refs('personnelGroups',data.personnelGroups||[]),...refs('dependencies',(data.dependencies||[]).filter(d=>d['资源类型']==='人员技能'&&d['所需技能']))]:[]);
  if(r['可提供技能']===r['所需技能'])fail('所需技能','同技能自动匹配，无须替代关系');
  if(!['是','否'].includes(r['是否启用']))fail('是否启用','仅接受是或否；否表示禁止该范围的有向替代');
  if(r['适用工序']!=='*'&&!(data.routes||[]).some(x=>x['工序编号']===r['适用工序']))fail('适用工序','须为 * 或单个现有工序编号；精确工序优先于 *，禁用也覆盖 *',refs('routes',data.routes||[]));
 }
 for(const [i,t]of (data.tools||[]).entries())for(const k of ['提前占用分钟','后延占用分钟'])if(!minute(t[k]))add('tools',i,k,'须为0–525600整数分钟');
 for(const [i,t]of (data.tools||[]).entries()){
  for(const field of ['可用起始分钟','可用结束分钟'])if(!minute(t[field]))add('tools',i,field,'工装可用期须显式填写 0–525600 的整数分钟');
  if(minute(t['可用起始分钟'])&&minute(t['可用结束分钟'])&&Number(t['可用结束分钟'])<=Number(t['可用起始分钟']))add('tools',i,'可用结束分钟','工装可用期结束须大于开始');
 }
 for(const [i,g]of (data.personnelGroups||[]).entries())if(!Number.isSafeInteger(Number(g['人员数量']))||Number(g['人员数量'])<1)add('personnelGroups',i,'人员数量','人数须为安全正整数；所有技能共用该人数池');
 const claimKeys=new Set();
 for(const [i,c]of (data.resourceClaims||[]).entries()){
  const fail=(f,m,relatedRecords)=>add('resourceClaims',i,f,m,relatedRecords);
  const claimKey=JSON.stringify([c['订单编号'],c['工序编号'],c['资源类型'],c['资源编号']]);
  if(claimKeys.has(claimKey))fail('资源编号','同一订单/工序/资源仅允许一条占用声明；多个或重叠工装窗口当前禁止，避免整段与阶段叠加',refs('resourceClaims',(data.resourceClaims||[]).filter(x=>JSON.stringify([x['订单编号'],x['工序编号'],x['资源类型'],x['资源编号']])===claimKey)));claimKeys.add(claimKey);
  if(c['参数来源']!==undefined&&!['逐项声明','工装配置'].includes(c['参数来源']))fail('参数来源','仅支持逐项声明或工装配置');
  if(c['参数来源']==='工装配置'){
   if(c['资源类型']!=='工装')fail('参数来源','空间只能逐项声明');
   for(const k of ['需求数量','提前占用分钟','后延占用分钟'])if(c[k]?.trim())fail(k,'采用工装配置时此字段须留空，避免两套冲突来源；预览显示有效值');
  }
  const effective=effectiveClaim(c,data);
  for(const k of ['提前占用分钟','后延占用分钟'])if(!minute(effective[k]))fail(k,'有效值须为0–525600整数分钟',[...refs('resourceClaims',[c]),...(c['参数来源']==='工装配置'?refs('tools',(data.tools||[]).filter(t=>t['工装编码']===c['资源编号']).slice(0,1)):[])]);
  const a=c['窗口开始偏移分钟']??'0',b=c['窗口结束偏移分钟']??'0';
  if(!minute(a)||!minute(b))fail('窗口开始偏移分钟','窗口偏移须为0–525600的整数分钟');
  if(c['占用口径']===whole&&(Number(a)!==0||Number(b)!==0))fail('占用口径','整工序占用不能同时配置阶段窗口');
  if(c['占用口径']===windowMode){
   const o=(data.orders||[]).find(o=>o['订单编号']===c['订单编号']);
   const duration=Number((data.times||[]).find(t=>t['产品编号']===o?.['产品编号']&&t['工序编号']===c['工序编号'])?.['固定分钟']);
   if(!(Number(a)+Number(b)<duration))fail('窗口结束偏移分钟','明确窗口须短于已配置固定工时；从开始+偏移到结束−偏移，不猜阶段时长',[...refs('resourceClaims',[c]),...refs('orders',o?[o]:[]),...refs('times',(data.times||[]).filter(t=>t['产品编号']===o?.['产品编号']&&t['工序编号']===c['工序编号']).slice(0,1))]);
  }
 }
 for(const [i,r]of (data.dependencies||[]).entries())if(r['资源类型']!=='人员技能'&&['人员岗位编号','候选人员组','人员参与阶段','人员开始偏移','人员结束偏移','窗口外释放'].some(k=>r[k]?.trim()))add('dependencies',i,'人员参与阶段','人员阶段/偏移/释放仅适用于人员技能依赖；设备及其他资源请使用其对应配置');
 for(const [i,r]of (data.dependencies||[]).entries())if(r['资源类型']==='人员技能'){
  if(r['人员岗位编号']!==undefined&&(typeof r['人员岗位编号']!=='string'||r['人员岗位编号'].length>64||r['人员岗位编号']!==r['人员岗位编号'].trim()||/[\x00-\x1f\x7f]/.test(r['人员岗位编号'])))add('dependencies',i,'人员岗位编号','岗位编号为1–64字符（旧配置可留空），不得包含首尾空白或控制字符');
  if(r['窗口外释放']!==undefined&&!['是','否'].includes(r['窗口外释放']))add('dependencies',i,'窗口外释放','仅接受是或否；否表示全工序保留人数');
  if(!Number.isSafeInteger(Number(r['需求数量']))||Number(r['需求数量'])<1)add('dependencies',i,'需求数量','人员需求必须为安全正整数');
  if(!r['所需技能']?.trim())add('dependencies',i,'所需技能','人员必须填写所需技能');
  // Unnamed legacy rows retain the old blank=whole-operation protocol. A
  // named window must supply both boundaries, including an explicit zero.
  if(r['人员参与阶段']?.trim())for(const k of ['人员开始偏移','人员结束偏移'])if(!minute(r[k]))add('dependencies',i,k,'明确人员窗口须显式填写0–525600整数分钟；空值不按0采用');
  const ids=personnelCandidates(r),field=r['候选人员组']?.trim()?'候选人员组':'资源编号';
  if(r['候选人员组']?.trim()&&r['资源编号']?.trim())add('dependencies',i,field,'候选集合与单组资源编号互斥，请仅填写一种；不隐含优先组');
  if(!ids.length||ids.some(id=>!id)||new Set(ids).size!==ids.length||ids.length>32)add('dependencies',i,field,'显式填写1–32个不重复人员组编号，以逗号分隔；空集合不代表任意组');
  for(const id of ids)if(!(data.personnelGroups||[]).some(g=>g['人员组编号']===id))add('dependencies',i,field,`须引用现有人员组 ${id}；同池多个技能只共享一份人数容量`,[...refs('dependencies',[r]),...refs('personnelGroups',data.personnelGroups||[])]);
 }
 const posts=new Map(),postRows=new Map();
 for(const [i,r] of (data.dependencies||[]).entries())if(r['资源类型']==='人员技能'&&r['人员岗位编号']?.trim()){
  const key=JSON.stringify([r['订单编号'],r['工序编号'],r['人员岗位编号']]);
  const contract=JSON.stringify([[...personnelCandidates(r)].sort(),r['所需技能'],r['所需班次']||'']);
  if(posts.has(key)&&posts.get(key)!==contract)add('dependencies',i,'人员岗位编号','同订单同工序同岗位的候选组、技能及班次须一致；独立岗位请使用不同编号',refs('dependencies',[postRows.get(key),r]));
  posts.set(key,contract);postRows.set(key,r);
 }
 return issues;
}
// Exact operation override, then wildcard; no reverse edge, no transitive search.
export function skillMatch(group,required,operation,relations=[]){
 const skills=skillsOf(group['技能']);
 if(!required||skills.includes(required))return {providedSkill:required,requiredSkill:required,relationId:'',reason:'同技能匹配'};
 for(const provided of skills){
  const edges=relations.filter(r=>r['可提供技能']===provided&&r['所需技能']===required);
  const edge=edges.find(r=>r['适用工序']===operation)||edges.find(r=>r['适用工序']==='*');
  if(edge?.['是否启用']==='是')return {providedSkill:provided,requiredSkill:required,relationId:edge['关系编号'],reason:`有向替代 ${provided} → ${required}（${edge['关系编号']}，${edge['适用工序']}）`};
 }
 return null;
}
