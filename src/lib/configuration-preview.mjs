import {assessRules,ruleCatalog} from './business-rules.mjs';
import {effectiveClaim,personnelCandidates,skillMatch} from './resource-policies.mjs';

const tableNames={rules:'表16排程规则',tools:'表18工装配置',resourceClaims:'表23资源占用声明',dependencies:'表12工序资源依赖',personnelGroups:'表19人员组',skillSubstitutions:'表29有向技能替代',batchResources:'表15空间与组批规则'};
export const configurationContract='FR017-preview-v1';
export const unsupportedCombinations=[
 {id:'岗位',reason:'尚无独立岗位身份；同组同技能重叠窗口按最大人数，不能用阶段名称冒充两个独立岗位。'},
 {id:'跨组物理池',reason:'每个人员组编号独立计人数；尚无跨组共享物理池身份，不能将同一批人员复制为多个组。'},
 {id:'多班组合',reason:'每组只有单一班次及一个可用区间；尚无跨班交接和容量连续性模型。'}
];
// A derived view of the same persisted rows and resolver used by Worker/checker.
// Never writes business data or synthesizes a historical snapshot.
export function configurationPreview(data,at=new Date().toISOString(),mode='supported'){
 const assessment=assessRules(data,at,true,mode),issues=assessment.issues;
 const rules=ruleCatalog.map(c=>{
  const setting=assessment.settings.find(s=>s.id===c.id);
  const related=issues.filter(i=>i.table==='rules'&&(i.row===0||data.rules?.[i.row-2]?.['规则编号']===c.id)||c.id==='MOLD'&&['tools','resourceClaims'].includes(i.table)||c.id==='STORAGE'&&['batchResources','resourceClaims'].includes(i.table)||c.id==='LABOR'&&['dependencies','personnelGroups','skillSubstitutions'].includes(i.table));
  const state=!c.supported?'未支持':!setting?'缺项':!setting.enabled?'未启用':related.length?'缺项':setting.status==='本次最小模式未检查'?'本次未检查':!setting.active?'待生效':'采用';
  return {id:c.id,name:c.name,state,active:state==='采用',effectiveFrom:setting?.effectiveFrom||'',scope:setting?.scope||'*',issues:related};
 });
 const stateOf=id=>rules.find(r=>r.id===id)?.state||'缺项';
 const rows=[];
 const add=(table,index,raw,effective,scope,sources={},state='采用',notes=[])=>{
  const diagnostics=issues.filter(i=>i.table===table&&(i.row===0||i.row===index+2));
  rows.push({table,row:index+2,scope,state:diagnostics.length?'缺项':state,notes,issues:diagnostics,fields:Object.entries(effective).map(([field,value])=>({field,value:value??'',source:sources[field]||`${tableNames[table]||table} 第${index+2}行 / ${field}`,raw:raw[field]??''}))});
 };
 (data.rules||[]).forEach((r,i)=>add('rules',i,r,r,`规则 ${r['规则编号']}；适用对象 ${r['适用对象']||'*'}；生效 ${r['生效时间']||'立即'}`,{},stateOf(r['规则编号']),['规则参数不覆盖资源表；资源需求/容量/窗口仍来自以下原始表。']));
 (data.batchResources||[]).forEach((r,i)=>add('batchResources',i,r,r,`资源 ${r['资源编号']}；${r['资源类型']}；容量 ${r['容量']||r['最大容量']||'见字段'}`,{},r['资源类型']==='共享冷却空间'?stateOf('STORAGE'):stateOf('CAPACITY')));
 (data.tools||[]).forEach((r,i)=>add('tools',i,r,r,`工装 ${r['工装编码']}；适用工序 ${r['适用任务']}；容量为本资源共享`,{},r['是否启用']==='是'?stateOf('MOLD'):'未启用',['仅显式选择“工装配置”的声明继承；没有声明不自动采用。']));
 (data.resourceClaims||[]).forEach((r,i)=>{
  const effective=effectiveClaim(r,data),sources={};
  if(r['参数来源']==='工装配置')for(const k of ['需求数量','提前占用分钟','后延占用分钟'])sources[k]=`继承工装 ${r['资源编号']} / ${k==='需求数量'?'每任务需求数量':k}`;
  add('resourceClaims',i,r,effective,`订单 ${r['订单编号']} / 工序 ${r['工序编号']} / ${r['资源类型']} ${r['资源编号']}`,sources,stateOf(r['资源类型']==='工装'?'MOLD':'STORAGE'),['逐项声明与工装继承互斥，不叠加；窗口=[工序开始+开始偏移−提前,工序结束−结束偏移+后延)。']);
 });
 (data.personnelGroups||[]).forEach((r,i)=>add('personnelGroups',i,r,r,`人员组 ${r['人员组编号']}；所有技能共享 ${r['人员数量']} 人；班次 ${r['班次']}`,{},'采用',['仅实际引用该组的需求参与计算；不同组不能表达同一物理池。']));
 (data.dependencies||[]).forEach((r,i)=>{
  if(r['资源类型']!=='人员技能')return;
  const legacy=!r['人员参与阶段']?.trim(),effective={...r};const sources={};
  if(legacy)for(const k of ['人员开始偏移','人员结束偏移'])if(!r[k]?.trim()){effective[k]='0';sources[k]='旧无名单窗口兼容；非新增默认值';}
  const notes=[`明确候选：${personnelCandidates(r).join('、')}；不隐含任意组。`,r['窗口外释放']==='否'?'全工序保留人数':'仅参与窗口占用；窗口外释放','人员依赖是既有必要保护，LABOR关闭仍采用；最小模式不检查人员。'];
  for(const id of personnelCandidates(r)){
   const g=(data.personnelGroups||[]).find(g=>g['人员组编号']===id);
   const m=g&&skillMatch(g,r['所需技能'],r['工序编号'],data.skillSubstitutions||[]);
   notes.push(`${id}：${m?.reason||'无可用同技能或显式单跳替代'}；实际还需满足班次、可用期及共享人数。`);
  }
  add('dependencies',i,r,effective,`订单 ${r['订单编号']} / 工序 ${r['工序编号']} / 窗口 ${r['人员参与阶段']||'旧单窗口'}`,sources,mode==='minimal-r1'?'本次未检查':'采用',notes);
 });
 (data.skillSubstitutions||[]).forEach((r,i)=>{
  const overridden=(data.skillSubstitutions||[]).filter(s=>r['适用工序']==='*'&&s['可提供技能']===r['可提供技能']&&s['所需技能']===r['所需技能']&&s['适用工序']!=='*').map(s=>s['适用工序']);
  add('skillSubstitutions',i,r,r,`${r['可提供技能']} → ${r['所需技能']}；工序 ${r['适用工序']}`,{},r['是否启用']==='是'?'采用':'未启用',[`精确工序优先于 *，禁止关系同样覆盖；本行被覆盖工序：${overridden.join('、')||'无'}。`,'仅同技能或显式单跳；不反向、不传递；仅被实际需求引用时采用。']);
 });
 return {contract:configurationContract,at,rules,rows,unsupportedCombinations,issues,note:'当前配置派生预览，尚非运行结果；新运行按服务端时刻与选择冻结。仿真/迁移值待确认，不代表现场批准。'};
}
