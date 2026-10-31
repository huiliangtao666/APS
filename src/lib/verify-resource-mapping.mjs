// Independent source/target reconstruction. No scheduler, mapper or allocator call.
export function verifyResourceMappingSnapshot(d,conditions){
 if(!conditions?.originalResourceContract)return (d.resourceMappings||[]).length?['冻结映射缺合同标识，禁止降级']:[];// old frozen input keeps old meaning
 const problems=[];
 if(JSON.stringify(conditions.originalResourceMappings)!==JSON.stringify((d.resourceMappings||[]).map(m=>({id:m['配置编号'],version:m['配置版本']}))))problems.push('冻结映射配置版本清单不一致');
 if(!['FR013-resource-map-v1','FR013-resource-map-v2'].includes(conditions.originalResourceContract))return ['未知原05/06冻结映射合同'];
 if(conditions.originalResourceContract==='FR013-resource-map-v2'&&!Array.isArray(conditions.originalResourceEntities))return [...problems,'缺完整冻结实体清单'];
 if(!(d.resourceMappings||[]).length)return ['原05/06冻结合同缺映射，禁止降级为旧字段合同'];
 for(const m of d.resourceMappings){
  const tool=m['来源类别']==='originalTools',rows=d[m['来源类别']]||[],source=rows.find(r=>r[tool?'资源编号':'人员组编号']===m['来源编号']),target=(d[tool?'tools':'personnelGroups']||[]).find(r=>r[tool?'工装编码':'人员组编号']===m['运行编号']);
  const equal=(row,text)=>{try{const p=JSON.parse(text);return row&&Object.keys(row).length===Object.keys(p).length&&Object.keys(row).every(k=>row[k]===p[k]);}catch{return false;}};
  if(m['状态']!=='READY'||!['FR013-resource-map-v1',...(conditions.originalResourceContract==='FR013-resource-map-v2'?['FR013-resource-map-v2']:[])].includes(m['合同版本'])||!equal(source,m['源记录JSON'])||!equal(target,m['运行记录JSON'])){problems.push(`${m['配置编号']} 来源/运行冻结记录与版本不一致`);continue;}
  if(m['容量单位']!==(tool?'套':'人')||m['时间单位']!=='分钟'||!['DIRECT_IDENTITY',...(m['合同版本']==='FR013-resource-map-v2'?['EXPLICIT_SAME_ENTITY']:[])].includes(m['映射模式'])||m['范围模式']!=='全局唯一池'||m['释放策略']!=='半开端点释放')problems.push(`${m['配置编号']} 不支持的冻结单位/模式`);
  if(m['适用产线']!==conditions.lineId)problems.push(`${m['配置编号']} 运行产线不属于显式映射范围`);
  if(source['共享范围']!==m['共享范围原文']||!['全工厂','*'].includes(source['共享范围'].trim()))problems.push(`${m['配置编号']} 共享范围不一致`);
  const keys=tool?[['可用数量','可用数量'],['最早可用分钟','可用起始分钟'],['最晚可用分钟','可用结束分钟']]:[['可用人数','人员数量'],['起始分钟','可用起始分钟'],['结束分钟','可用结束分钟']];
  if(keys.some(([s,t])=>Number(source[s])!==Number(target[t])))problems.push(`${m['配置编号']} 原数量/窗口未被运行目标采用`);
  if(!tool&&(source['技能']!==target['技能']||!(d.personnelPools||[]).some(p=>p.poolId===target.poolId)))problems.push(`${m['配置编号']} 人员技能/物理池不一致`);
 }
 // Independently reconstruct identity membership and per-field versioned authority.
 const identities=new Map();
 for(const m of d.resourceMappings){const key=JSON.stringify([m['来源类别'],m['运行编号']]);const g=identities.get(key)||[];g.push(m);identities.set(key,g);}
 for(const group of identities.values()){
  const tool=group[0]['来源类别']==='originalTools';
  const id=tool?'资源编号':'人员组编号';
  const fields=tool?['资源名称','资源类型','可用数量','最早可用分钟','最晚可用分钟','共享范围']:['技能','可用人数','起始分钟','结束分钟','共享范围'];
  const sources=group.map(m=>(d[m['来源类别']]||[]).find(s=>s[id]===m['来源编号']));
  const equalRecord=(a,b)=>!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
  const parse=text=>{try{return JSON.parse(text);}catch{return null;}};
  const entity=conditions.originalResourceContract==='FR013-resource-map-v2'?conditions.originalResourceEntities?.filter(e=>e.sourceType===group[0]['来源类别']&&e.runtimeId===group[0]['运行编号']):null;
  if(conditions.originalResourceContract==='FR013-resource-map-v2'&&(!entity||entity.length!==1||entity[0].sources?.length!==group.length))problems.push('同实体冻结来源清单缺失或重复');
  const frozen=entity?.length===1&&Array.isArray(entity[0].sources)?entity[0]:null;
  for(const m of group){
   const recordRow=(d[m['来源类别']]||[]).findIndex(r=>r[id]===m['来源编号'])+2;
   if(frozen&&(frozen.sources.filter(x=>x.configurationId===m['配置编号']&&x.version===m['配置版本']&&x.sourceId===m['来源编号']&&x.recordRow===recordRow).length!==1||!equalRecord(frozen.runtimeRecord,parse(m['运行记录JSON']))))problems.push(`${m['配置编号']} 冻结实体运行记录或来源行不一致`);
   if(group.length>1&&(m['合同版本']!=='FR013-resource-map-v2'||m['映射模式']!=='EXPLICIT_SAME_ENTITY'))problems.push(`${m['配置编号']} 多来源缺显式同实体合同`);
   if(m['映射模式']!=='EXPLICIT_SAME_ENTITY')continue;
   const a=parse(m['字段权威JSON']);
   if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).length!==fields.length){problems.push(`${m['配置编号']} 缺完整字段权威`);continue;}
   for(const field of fields){
    const c=a[field];
    if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).sort().join(',')!=='配置版本,配置编号'||group.filter(x=>x['配置编号']===c['配置编号']&&x['配置版本']===c['配置版本']).length!==1||group.some(x=>{const b=parse(x['字段权威JSON'])?.[field];return b?.['配置编号']!==c['配置编号']||b?.['配置版本']!==c['配置版本'];}))problems.push(`${m['配置编号']} ${field} 权威不唯一或版本陈旧`);
    const chosen=group.find(x=>x['配置编号']===c?.['配置编号']);
    const value=chosen?parse(chosen['源记录JSON'])?.[field]:undefined;
    if(frozen&&(frozen.fields?.[field]?.configurationId!==c?.['配置编号']||frozen.fields?.[field]?.version!==c?.['配置版本']||frozen.fields?.[field]?.value!==value))problems.push(`${m['配置编号']} ${field} 冻结权威值未采用`);
    if(field!=='资源名称'&&sources.some(x=>!x||x[field]!==sources[0]?.[field]))problems.push(`${m['配置编号']} ${field} 多来源冲突`);
   }
   for(const field of ['源类型','共享范围原文','适用产线','范围模式','容量单位','时间单位','释放策略','运行记录JSON'])if(group.some(x=>field==='运行记录JSON'?!equalRecord(parse(x[field]),parse(m[field])):x[field]!==m[field]))problems.push(`${m['配置编号']} 同实体冻结合同不一致`);
  }
 }
 if(conditions.originalResourceContract==='FR013-resource-map-v2'&&conditions.originalResourceEntities?.length!==identities.size)problems.push('冻结实体数量与唯一运行身份不一致');
 for(const [key,id] of [['originalTools','资源编号'],['originalPersonnel','人员组编号']])for(const s of d[key]||[]){
  if((d.originalDependencies||[]).length){const types=key==='originalTools'?['模具','工具']:['人员'],rule=key==='originalTools'?'MOLD':'LABOR';
   const enabled=(d.rules||[]).some(r=>r['规则编号']===rule&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(conditions.ruleEvaluationAt)));
   if(!enabled||!d.originalDependencies.some(r=>types.includes(r['资源类型'])&&r['资源编号']===s[id]))continue;
  }
  if(d.resourceMappings.filter(m=>m['来源类别']===key&&m['来源编号']===s[id]&&m['状态']==='READY').length!==1)problems.push(`${s[id]} 原记录缺唯一READY映射`);
 }
 return problems;
}
