import {occupationErrors,occupationFields} from './personnel-occupation.mjs';
import {sameRecord} from './resource-mapping.mjs';

// An explicit user draft, never an inferred customer profile or a write API.
export const personnelProfileFields=[...occupationFields,'提前占用分钟','后延占用分钟'];
export function personnelProfileDraft(data,indices,profile){
 if(!Array.isArray(indices)||!indices.length||new Set(indices).size!==indices.length)throw Error('请选择不重复的人员依赖行');
 if(!profile||Object.keys(profile).some(k=>!personnelProfileFields.includes(k)))throw Error('人员profile只接受占用基准、检查顺序、提前/后延及来源版本');
 for(const f of personnelProfileFields)if(typeof profile[f]!=='string'||!profile[f].trim())throw Error('请显式填写 '+f+'；不补默认值');
 const issues=occupationErrors(profile);if(issues.length)throw Error(issues.map(([f,m])=>f+'：'+m).join('；'));
 const dependencies=structuredClone(data.dependencies||[]);
 for(const i of indices){if(!Number.isInteger(i)||!dependencies[i]||dependencies[i]['资源类型']!=='人员技能')throw Error('所选行必须为现有人员技能依赖');Object.assign(dependencies[i],profile);}
 return {dependencies};
}

// Update only mappings whose selected group actually changed. Shared physical
// pool capacity is an independent explicit input and is never multiplied here.
export function personnelMappingDraft(data,saved,{simulation=false,groupIds=[]}={}){
 if(!groupIds.length||new Set(groupIds).size!==groupIds.length)throw Error('请明确选择要更新映射的人员组');
 const mappings=structuredClone(data.resourceMappings||[]),sources=structuredClone(data.originalPersonnel||[]);
 let changed=0;
 for(const id of groupIds){
  const group=(data.personnelGroups||[]).filter(g=>g['人员组编号']===id);
  if(group.length!==1)throw Error('人员组须唯一存在：'+id);
  const selected=mappings.filter(m=>m['来源类别']==='originalPersonnel'&&m['运行编号']===id&&m['状态']==='READY');
  if(selected.length!==1||selected[0]['映射模式']!=='DIRECT_IDENTITY'||selected[0]['合同版本']!=='FR013-resource-map-v1')throw Error('本操作须唯一v1直接人员映射；多来源请逐字段维护权威：'+id);
  const m=selected[0],rows=sources.filter(s=>s['人员组编号']===m['来源编号']);
  if(rows.length!==1)throw Error('先补齐映射引用的唯一原06记录');
  const source=rows[0],runtime=group[0],fields=[['技能','技能'],['可用人数','人员数量'],['起始分钟','可用起始分钟'],['结束分钟','可用结束分钟']];
  if(fields.some(([a,b])=>source[a]!==runtime[b])&&!simulation)throw Error('人数、技能或可用期与原06不同；请明确选择可替换模拟配置，或恢复来源值');
  if(simulation)for(const [a,b]of fields)source[a]=runtime[b];
  let priorSource,priorRuntime;try{priorSource=JSON.parse(m['源记录JSON']);priorRuntime=JSON.parse(m['运行记录JSON']);}catch{throw Error('人员映射快照无效，请先核对');}
  if(sameRecord(source,priorSource)&&sameRecord(runtime,priorRuntime))continue;
  const old=(saved.resourceMappings||[]).find(s=>s['配置编号']===m['配置编号']);
  const version=Math.max(Number(old?.['配置版本']??m['配置版本']),Number(m['配置版本']));
  if(!Number.isSafeInteger(version)||version<1||version===Number.MAX_SAFE_INTEGER)throw Error('人员映射版本须可递增的安全正整数');
  m['配置版本']=String(version+1);m['源记录JSON']=JSON.stringify(source);m['运行记录JSON']=JSON.stringify(runtime);
  if(simulation)m['配置依据']='可替换模拟配置（非客户事实）；本次人员草稿显式采用，原06 CSV字节及历史保留。原依据：'+m['配置依据'];
  changed++;
 }
 if(!changed)throw Error('所选人员组没有需要更新的映射快照');
 return {tables:{personnelGroups:structuredClone(data.personnelGroups||[]),originalPersonnel:sources,resourceMappings:mappings},changed};
}
