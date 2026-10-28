export const batchParameters={装载计量基准:'BOM总投入',拆批方式:'均分',尾批处理:'报问题',合批条件:'同产品同版本同路线同程序',人员需求:'逐生产批累加'};
export function activeBatchRule(data,at){return (data.rules||[]).some(r=>r['规则编号']==='CAPACITY'&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at)));}

const canonicalDecimal=value=>{const parts=String(value).split('.');return (parts[0].replace(/^0+(?=\d)/,'')||'0')+'.'+(parts[1]||'').replace(/0+$/,'');};
// Table15 is the canonical machine program whitelist; prose never becomes executable.
export function validateBatchResources(data){
 const issues=[];const seen=new Set();
 for(const r of data.batchResources||[]){
  const id=r['资源编号'];const fail=message=>issues.push({code:'INPUT / BATCH_RESOURCE',message:`组批资源 ${id||'（空）'}：${message}`});
  if(!id||seen.has(id))fail('资源编号须非空且唯一');seen.add(id);
  if(!['批处理装载','共享冷却空间'].includes(r['资源类型']))fail('资源类型未支持；不得推断处理方式');
  if(!(r['单位']==='kg'||r['资源类型']==='共享冷却空间'&&r['单位']==='位置')||!/^\d+(?:\.\d+)?$/.test(r['容量']||'')||!(Number(r['容量'])>0)||!Number.isFinite(Number(r['容量'])))fail('容量须为正有限 kg 或空间位置数；其他单位语义未决定');
  if(r['单位']==='位置'&&!Number.isSafeInteger(Number(r['容量'])))fail('位置容量须为安全正整数');
  if(r['资源类型']==='批处理装载'){
   const machine=(data.machines||[]).find(m=>m['设备编号']===id);
   if(!machine)fail('批处理装载须引用有效设备');
   else if(canonicalDecimal(machine['最大装载kg'])!==canonicalDecimal(r['容量']))fail('表03最大装载与表15容量冲突，不能猜测优先级');
   const list=(r['允许程序']||'').split(';');if(list.some(p=>!p.trim()||p!==p.trim())||new Set(list).size!==list.length)fail('允许程序须为显式、无重复的分号列表');
  }
 }
 return issues;
}
