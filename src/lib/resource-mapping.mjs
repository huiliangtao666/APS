import {originalResourceDefs} from './original-resources.mjs';
export const resourceMappingDef={key:'resourceMappings',label:'原05/06 显式运行映射',file:'31_原05与06运行映射.csv',fields:['配置编号','配置版本','合同版本','状态','来源类别','来源编号','源记录JSON','运行编号','运行记录JSON','别名','映射模式','源类型','共享范围原文','适用产线','范围模式','容量单位','时间单位','释放策略','配置依据','字段权威JSON']};
export const mappingOptions={'合同版本':['FR013-resource-map-v1','FR013-resource-map-v2'],'状态':['NOT_READY_CONFIG','READY'],'来源类别':['originalTools','originalPersonnel'],'映射模式':['DIRECT_IDENTITY','EXPLICIT_SAME_ENTITY'],'范围模式':['全局唯一池'],'容量单位':['套','人'],'时间单位':['分钟'],'释放策略':['半开端点释放']};
const positive=v=>typeof v==='string'&&/^[1-9]\d*$/.test(v)&&Number.isSafeInteger(Number(v));
const minute=v=>typeof v==='string'&&/^\d+$/.test(v.trim())&&Number.isSafeInteger(Number(v))&&Number(v)<=525600;
export const sameRecord=(a,b)=>!!a&&!!b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>typeof a[k]==='string'&&a[k]===b[k]);
const json=v=>{try{return JSON.parse(v);}catch{return null;}};
export function mappingFingerprintInput(d){return Object.fromEntries(['originalTools','originalPersonnel','resourceMappings','tools','personnelGroups','personnelPools','resourceClaims','dependencies','skillSubstitutions','rules'].map(k=>[k,d[k]||[]]));}
export function validateResourceMappings(d,{forRun=false}={}){
 const issues=[],seenSource=new Set(),seenTarget=new Map();
 const add=(i,field,message)=>issues.push({code:'NOT_READY_CONFIG',table:'resourceMappings',file:resourceMappingDef.file,row:i+2,field,message});
 for(const [i,m] of (d.resourceMappings||[]).entries()){
  const fail=(f,t)=>add(i,f,t),ready=m['状态']==='READY';
  if(!['READY','NOT_READY_CONFIG'].includes(m['状态']))fail('状态','显式选择READY或NOT_READY_CONFIG');
  if(!positive(m['配置版本']))fail('配置版本','显式填写安全正整数版本；变更映射须递增');
  if(!m['配置编号']?.trim())fail('配置编号','稳定配置身份必填');
  if(!ready){if(m['映射模式']==='EXPLICIT_SAME_ENTITY')fail('状态','同实体配置须完整预览为READY；缺权威或冲突不能保存为启用映射');if(forRun)fail('状态','本映射待配置，禁止新运行；完成来源及运行配置后启用');continue;}
  for(const f of resourceMappingDef.fields.filter(f=>f!=='别名'&&f!=='字段权威JSON'))if(!m[f]?.trim())fail(f,'启用映射须显式填写；不推定业务值');
  for(const [f,options] of Object.entries(mappingOptions))if(!options.includes(m[f]))fail(f,`当前仅支持 ${options.join(' / ')}；未知组合未启用`);
  const def=originalResourceDefs.find(s=>s.key===m['来源类别']);if(!def){fail('来源类别','仅支持原05/06');continue;}
  const tool=def.key==='originalTools',id=tool?'资源编号':'人员组编号',targetKey=tool?'tools':'personnelGroups',targetId=tool?'工装编码':'人员组编号';
  const sources=(d[def.key]||[]).filter(s=>s[id]===m['来源编号']),s=sources[0],targets=(d[targetKey]||[]).filter(t=>t[targetId]===m['运行编号']),t=targets[0];
  const sk=JSON.stringify([def.key,m['来源编号']]),tk=JSON.stringify([targetKey,m['运行编号']]);
  if(seenSource.has(sk))fail('来源编号','一个来源只支持一条映射；多窗口/重复身份未启用');seenSource.add(sk);
  const group=seenTarget.get(tk)||[];group.push({m,i});seenTarget.set(tk,group);
  if(m['映射模式']==='EXPLICIT_SAME_ENTITY'&&m['合同版本']!=='FR013-resource-map-v2')fail('合同版本','多来源显式同实体须使用v2合同');
  if(m['映射模式']==='DIRECT_IDENTITY'&&m['字段权威JSON']?.trim())fail('字段权威JSON','DIRECT_IDENTITY不采用字段权威；请显式选择同实体模式');
  if(sources.length!==1){fail('来源编号','须精确引用唯一原字段记录；不按名称匹配');continue;}
  if(!sameRecord(s,json(m['源记录JSON'])))fail('源记录JSON','原记录已变化或缺快照；重新核原文、更新映射版本，不自动采纳');
  if(targets.length!==1){fail('运行编号',`须显式配置唯一${targetKey}运行记录；不自动创建实体`);continue;}
  if(!sameRecord(t,json(m['运行记录JSON'])))fail('运行记录JSON','运行记录已变化或缺快照；须重预览并更新映射版本');
  if(m['容量单位']!==(tool?'套':'人'))fail('容量单位',tool?'现工装合同仅支持套；件/重量换算无批准依据':'人员合同仅支持整数人；工时/班次单位不可换算');
  if(m['源类型']!==(tool?s['资源类型']:'人员技能'))fail('源类型','工具须逐字声明原类型；人员须显式声明人员技能，不按名字猜类型');
  if(tool&&!['模具','工具'].includes(s['资源类型'].trim()))fail('源类型','本版仅将原模具/工具显式绑定工装；其他类型未启用');
  if(m['共享范围原文']!==s['共享范围'])fail('共享范围原文','须逐字保留原共享范围，不能丢失/改写');
  if(!m['适用产线']||(d.machines||[]).some(r=>r['产线编号']!==m['适用产线'])||!(d.machines||[]).some(r=>r['产线编号']===m['适用产线'])||!(d.factoryLines||[]).some(r=>r['产线编号']===m['适用产线']))fail('适用产线','须显式引用当前单运行产线；跨产线联合运行/复制池容量未启用');
  if(!['全工厂','*'].includes(s['共享范围'].trim()))fail('范围模式','当前仅支持显式全工厂/*至全局唯一容量；产线/工序局部共享合同未启用');
  const capacity=tool?'可用数量':'可用人数',targetCapacity=tool?'可用数量':'人员数量',start=tool?'最早可用分钟':'起始分钟',end=tool?'最晚可用分钟':'结束分钟';
  const a=tool?'可用起始分钟':'可用起始分钟',b=tool?'可用结束分钟':'可用结束分钟';
  if(!positive(s[capacity]?.trim())||Number(t[targetCapacity])!==Number(s[capacity]))fail('运行记录JSON','来源容量须为正整数且与运行工装容量/组资格人数相等；0容量运行语义未启用');
  if(!minute(s[start])||!minute(s[end])||Number(s[end])<=Number(s[start])||Number(t[a])!==Number(s[start])||Number(t[b])!==Number(s[end]))fail('时间单位','源窗口须为0–525600整数分钟且逐值等于运行窗口；小数/日期/小时转换未启用');
  if(tool){
   for(const c of (d.resourceClaims||[]).filter(c=>c['资源类型']==='工装'&&c['资源编号']===m['运行编号']))for(const field of ['单位','占用口径','窗口开始偏移分钟','窗口结束偏移分钟','参数来源'])if(!c[field]?.trim())fail('运行编号',`表23 ${c['声明编号']} 缺显式${field}；不补默认`);
   if(t['是否启用']!=='是')fail('运行编号','运行工装须显式启用');
   if(!(d.resourceClaims||[]).some(c=>c['资源类型']==='工装'&&c['资源编号']===m['运行编号']))fail('运行编号','须配置表23显式需求/单位/占用来源；不猜每任务数量或自动生成声明');
   if(forRun&&!(d.rules||[]).some(r=>r['规则编号']==='MOLD'&&r['是否启用']==='是'))fail('运行编号','新运行须启用MOLD，不能保存映射却忽略工装');
  }else{
   if(t['技能']!==s['技能'])fail('运行记录JSON','原技能文本须原样映射；不自动改技能名或计算资格交集');
   if(!t['人员组名称']?.trim()||!t['班次']?.trim())fail('运行记录JSON','组名与班次必须显式配置，不能用技能名/窗口猜值');
   const p=(d.personnelPools||[]).find(p=>p.poolId===t.poolId);
   if(!p||p['是否启用']!=='是'||p['适用范围']!=='*')fail('运行编号','人员组须显式绑定已启用的全局物理池；组人数仅资格上限，不增加池唯一容量');
   for(const c of (d.dependencies||[]).filter(c=>c['资源类型']==='人员技能'&&(c['资源编号']===m['运行编号']||(c['候选人员组']||'').split(/[,，]/).map(x=>x.trim()).includes(m['运行编号']))))for(const field of ['需求数量','所需技能','所需班次','人员参与阶段','人员开始偏移','人员结束偏移','窗口外释放'])if(!c[field]?.trim())fail('运行编号',`表12 ${c['订单编号']}/${c['工序编号']} 缺显式${field}；不补默认`);
   if(!(d.dependencies||[]).some(c=>c['资源类型']==='人员技能'&&(c['资源编号']===m['运行编号']||(c['候选人员组']||'').split(/[,，]/).map(x=>x.trim()).includes(m['运行编号']))))fail('运行编号','须配置表12显式技能/班次/人数/占用窗口；不自动生成需求');
  }
 }
 for(const group of seenTarget.values()){
  const multi=group.length>1;
  for(const {m,i} of group){
   if(multi&&m['映射模式']!=='EXPLICIT_SAME_ENTITY')add(i,'运行编号','多来源必须全部显式选择EXPLICIT_SAME_ENTITY，不自动去重或累加容量');
   if(m['映射模式']!=='EXPLICIT_SAME_ENTITY')continue;
   const def=originalResourceDefs.find(s=>s.key===m['来源类别']);
   const fields=def.fields.slice(1),authority=json(m['字段权威JSON']);
   if(!authority||typeof authority!=='object'||Array.isArray(authority)||Object.keys(authority).length!==fields.length||fields.some(f=>!Object.hasOwn(authority,f))){add(i,'字段权威JSON','须为每个原字段（来源编号除外）显式选择唯一来源配置编号及配置版本');continue;}
   for(const field of fields){
    const choice=authority[field];
    const selected=choice&&typeof choice==='object'&&!Array.isArray(choice)&&Object.keys(choice).sort().join(',')==='配置版本,配置编号'&&group.filter(x=>x.m['配置编号']===choice['配置编号']&&x.m['配置版本']===choice['配置版本']);
    if(!selected||selected.length!==1){add(i,'字段权威JSON',`${field} 权威必须引用同实体组内唯一配置及其当前版本`);continue;}
    if(group.some(x=>{const a=json(x.m['字段权威JSON']);return !a||a[field]?.['配置编号']!==choice['配置编号']||a[field]?.['配置版本']!==choice['配置版本'];}))add(i,'字段权威JSON',`${field} 同实体全部来源必须选择相同权威及版本，无默认优先级`);
   }
   const sourceRows=group.map(x=>(d[def.key]||[]).find(r=>r[def.fields[0]]===x.m['来源编号'])).filter(Boolean);
   // Distinct source identifiers/names are aliases. Operational fields must agree.
   for(const field of fields.filter(f=>f!=='资源名称'))if(sourceRows.some(r=>r[field]!==sourceRows[0]?.[field]))add(i,'字段权威JSON',`${field} 来源冲突；权威选择不允许覆盖类型、单位、窗口、容量、人数或资格冲突`);
   for(const field of ['来源类别','源类型','共享范围原文','适用产线','范围模式','容量单位','时间单位','释放策略','运行记录JSON'])if(group.some(x=>field==='运行记录JSON'?!sameRecord(json(x.m[field]),json(m[field])):x.m[field]!==m[field]))add(i,field,'同实体运行合同不一致；不生成第二个身份或容量');
  }
 }
 if(forRun)for(const def of originalResourceDefs)for(const s of d[def.key]||[]){const field=def.key==='originalTools'?'资源编号':'人员组编号';if(!(d.resourceMappings||[]).some(m=>m['状态']==='READY'&&m['来源类别']===def.key&&m['来源编号']===s[field]))add(-2,'来源编号',`${def.file} ${s[field]} 缺READY显式映射；资料不能冒充运行资源`);}
 return issues;
}
export function resourceMappingTransition(before,after,records=[]){
 return (after.resourceMappings||[]).flatMap((m,i)=>{
  const historical=records.filter(r=>r.target==='resourceMappings').flatMap(r=>[...(r.before||[]),...(r.after||[])]).filter(p=>p['配置编号']===m['配置编号']);
  if(!(before.resourceMappings||[]).some(p=>p['配置编号']===m['配置编号'])&&historical.some(p=>Number(p['配置版本'])>=Number(m['配置版本'])))return [{code:'NOT_READY_CONFIG',table:'resourceMappings',file:resourceMappingDef.file,row:i+2,field:'配置版本',message:'重新引入配置身份须高于历史最高版本，禁止版本复用'}];
  const old=(before.resourceMappings||[]).find(p=>p['配置编号']===m['配置编号']);
  return old&&!sameRecord(old,m)&&Number(m['配置版本'])<=Number(old['配置版本'])?[{code:'NOT_READY_CONFIG',table:'resourceMappings',file:resourceMappingDef.file,row:i+2,field:'配置版本',message:'相同配置身份修改须递增版本；旧输入快照不变'}]:[];
 });
}

// Validated identities carry the selected literal and record position into each new run.
// Runtime capacities remain the single explicitly configured target record.
export function freezeResourceEntities(d){
 const groups=new Map();
 for(const m of d.resourceMappings||[]){const key=JSON.stringify([m['来源类别'],m['运行编号']]);groups.set(key,[...(groups.get(key)||[]),m]);}
 return [...groups.values()].map(group=>{
  const m=group[0],def=originalResourceDefs.find(x=>x.key===m['来源类别']);
  const authorities=m['映射模式']==='EXPLICIT_SAME_ENTITY'?json(m['字段权威JSON']):null;
  return {sourceType:m['来源类别'],runtimeId:m['运行编号'],runtimeRecord:json(m['运行记录JSON']),sources:group.map(g=>({configurationId:g['配置编号'],version:g['配置版本'],sourceId:g['来源编号'],recordRow:(d[def.key]||[]).findIndex(r=>r[def.fields[0]]===g['来源编号'])+2})),fields:authorities?Object.fromEntries(def.fields.slice(1).map(field=>{const c=authorities[field],selected=group.find(g=>g['配置编号']===c['配置编号']);return [field,{configurationId:c['配置编号'],version:c['配置版本'],value:json(selected['源记录JSON'])[field]}];})):null};
 });
}
