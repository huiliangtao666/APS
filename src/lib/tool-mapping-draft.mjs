import {sameRecord} from './resource-mapping.mjs';

// Explicit, user-triggered simulation only. Source CSV bytes are outside these
// tables and remain unchanged. The ordinary server transition/preview gates
// still validate this draft; this function never saves or bypasses permissions.
export function toolMappingDraft(data,saved,{simulation=false}={}){
 const mappings=structuredClone(data.resourceMappings||[]),sources=structuredClone(data.originalTools||[]);
 let changed=0;
 for(const m of mappings.filter(m=>m['来源类别']==='originalTools'&&m['状态']==='READY')){
  const tool=(data.tools||[]).find(t=>t['工装编码']===m['运行编号']);
  const source=sources.find(s=>s['资源编号']===m['来源编号']);
  if(!tool||!source)throw Error('先补齐映射引用的工装和来源记录');
  if(m['映射模式']!=='DIRECT_IDENTITY'||m['合同版本']!=='FR013-resource-map-v1')throw Error('本操作仅用于直接映射；同实体多来源请逐字段维护权威');
  const fields=[['可用数量','可用数量'],['最早可用分钟','可用起始分钟'],['最晚可用分钟','可用结束分钟']];
  const differs=fields.some(([a,b])=>source[a]!==tool[b]);
  if(differs&&!simulation)throw Error('容量或可用期与来源不同；先明确选择可替换模拟配置，或修改工装使其与来源一致');
  if(simulation)for(const [a,b]of fields)source[a]=tool[b];
  let priorSource,priorRuntime;
  try{priorSource=JSON.parse(m['源记录JSON']);priorRuntime=JSON.parse(m['运行记录JSON']);}catch{throw Error('映射快照无效，请核对原配置');}
  if(sameRecord(source,priorSource)&&sameRecord(tool,priorRuntime))continue;
  const old=(saved.resourceMappings||[]).find(s=>s['配置编号']===m['配置编号']);
  const version=Math.max(Number(old?.['配置版本']??m['配置版本']),Number(m['配置版本']));
  if(!Number.isSafeInteger(version)||version<1||version===Number.MAX_SAFE_INTEGER)throw Error('映射版本必须是可递增的安全正整数');
  m['配置版本']=String(version+1);m['源记录JSON']=JSON.stringify(source);m['运行记录JSON']=JSON.stringify(tool);
  if(simulation)m['配置依据']='可替换模拟配置（非客户事实）；容量/可用期由本次工装草稿显式采用；原CSV字节保留。原依据：'+m['配置依据'];
  changed++;
 }
 if(!changed)throw Error('没有需要更新的直接工装映射');
 return {tables:{tools:structuredClone(data.tools||[]),originalTools:sources,resourceMappings:mappings},changed};
}
