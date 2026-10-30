// Independent source/target reconstruction. No scheduler, mapper or allocator call.
export function verifyResourceMappingSnapshot(d,conditions){
 if(!conditions?.originalResourceContract)return (d.resourceMappings||[]).length?['冻结映射缺合同标识，禁止降级']:[];// old frozen input keeps old meaning
 const problems=[];
 if(JSON.stringify(conditions.originalResourceMappings)!==JSON.stringify((d.resourceMappings||[]).map(m=>({id:m['配置编号'],version:m['配置版本']}))))problems.push('冻结映射配置版本清单不一致');
 if(conditions.originalResourceContract!=='FR013-resource-map-v1')return ['未知原05/06冻结映射合同'];
 if(!(d.resourceMappings||[]).length)return ['原05/06冻结合同缺映射，禁止降级为旧字段合同'];
 for(const m of d.resourceMappings){
  const tool=m['来源类别']==='originalTools',rows=d[m['来源类别']]||[],source=rows.find(r=>r[tool?'资源编号':'人员组编号']===m['来源编号']),target=(d[tool?'tools':'personnelGroups']||[]).find(r=>r[tool?'工装编码':'人员组编号']===m['运行编号']);
  const equal=(row,text)=>{try{const p=JSON.parse(text);return row&&Object.keys(row).length===Object.keys(p).length&&Object.keys(row).every(k=>row[k]===p[k]);}catch{return false;}};
  if(m['状态']!=='READY'||m['合同版本']!==conditions.originalResourceContract||!equal(source,m['源记录JSON'])||!equal(target,m['运行记录JSON'])){problems.push(`${m['配置编号']} 来源/运行冻结记录与版本不一致`);continue;}
  if(m['容量单位']!==(tool?'套':'人')||m['时间单位']!=='分钟'||m['映射模式']!=='DIRECT_IDENTITY'||m['范围模式']!=='全局唯一池'||m['释放策略']!=='半开端点释放')problems.push(`${m['配置编号']} 不支持的冻结单位/模式`);
  if(m['适用产线']!==conditions.lineId)problems.push(`${m['配置编号']} 运行产线不属于显式映射范围`);
  if(source['共享范围']!==m['共享范围原文']||!['全工厂','*'].includes(source['共享范围'].trim()))problems.push(`${m['配置编号']} 共享范围不一致`);
  const keys=tool?[['可用数量','可用数量'],['最早可用分钟','可用起始分钟'],['最晚可用分钟','可用结束分钟']]:[['可用人数','人员数量'],['起始分钟','可用起始分钟'],['结束分钟','可用结束分钟']];
  if(keys.some(([s,t])=>Number(source[s])!==Number(target[t])))problems.push(`${m['配置编号']} 原数量/窗口未被运行目标采用`);
  if(!tool&&(source['技能']!==target['技能']||!(d.personnelPools||[]).some(p=>p.poolId===target.poolId)))problems.push(`${m['配置编号']} 人员技能/物理池不一致`);
 }
 for(const [key,id] of [['originalTools','资源编号'],['originalPersonnel','人员组编号']])for(const s of d[key]||[])if(d.resourceMappings.filter(m=>m['来源类别']===key&&m['来源编号']===s[id]&&m['状态']==='READY').length!==1)problems.push(`${s[id]} 原记录缺唯一READY映射`);
 return problems;
}
