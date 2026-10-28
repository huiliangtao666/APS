import {validateTools} from '../../prototypes/fr006-config-only/src/tool-validation.mjs';
export const jointParameters={占用口径:'显式逐生产批完整区间',数量口径:'每生产批声明数量',FR006任务默认:'不自动采用，须逐批声明'};
export function jointFlags(data,at=new Date().toISOString()) {
 return Object.fromEntries(['MOLD','STORAGE'].map(id=>[id,(data.rules||[]).some(r=>r['规则编号']===id&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at)))]));
}
const decimal=s=>typeof s==='string'&&/^\d+(?:\.\d+)?$/.test(s)&&Number.isFinite(Number(s));
const minute=s=>decimal(s)&&Number.isSafeInteger(Number(s));
const canonical=s=>{if(!decimal(s))return 'INVALID:'+s;const [a,b='']=s.split('.');return a.replace(/^0+(?=\d)/,'')+'.'+b.replace(/0+$/,'');};
const typeRule=t=>t==='工装'?'MOLD':t==='空间'?'STORAGE':null;
export function validateJointResources(data,at){
 const issues=[],flags=jointFlags(data,at),claims=data.resourceClaims||[];
 const add=(message,table='resourceClaims',row=0)=>issues.push({code:'INPUT / JOINT_RESOURCE',message,table,row});
 for(const message of validateTools(data.tools||[]))add(message,'tools');
 for(const t of data.tools||[])for(const k of ['可用数量','每任务需求数量'])if(!decimal(t[k])||!Number.isSafeInteger(Number(t[k]))||Number(t[k])<1)add(`工装 ${t['工装编码']} ${k} 须为安全正整数套，不支持科学计数或其他单位`,'tools');
 const seen=new Set();
 for(const [i,c] of claims.entries()){
  const prefix=`资源占用声明 ${c['声明编号']||'（空）'}：`,fail=m=>add(prefix+m,'resourceClaims',i+2);
  if(!c['声明编号']||seen.has(c['声明编号']))fail('声明编号须非空且唯一');seen.add(c['声明编号']);
  const order=(data.orders||[]).find(o=>o['订单编号']===c['订单编号']);
  if(!order||!(data.routes||[]).some(r=>r['产品编号']===order['产品编号']&&r['工序编号']===c['工序编号']))fail('须引用有效订单及该产品的工序编号');
  const kind=typeRule(c['资源类型']);if(!kind)fail('资源类型仅支持 工装 或 空间；其他语义未决定');
  if(!decimal(c['需求数量'])||!(Number(c['需求数量'])>0))fail('需求数量须为显式正有限十进制数');
  if(!minute(c['提前占用分钟'])||!minute(c['后延占用分钟']))fail('提前/后延占用分钟须显式填写非负安全整数；不能推断DEC02释放');
  if(c['占用口径']!==jointParameters.占用口径)fail(`占用口径须为 ${jointParameters.占用口径}；下游开始/结束或准备拆卸阶段释放未支持`);
  if(kind==='MOLD'){
   const t=(data.tools||[]).find(t=>t['工装编码']===c['资源编号']);
   if(!t||t['是否启用']!=='是')fail('须引用已启用工装配置');
   else if(!t['适用任务'].split('|').includes(c['工序编号']))fail('工装适用任务未明确包含该工序编号');
   if(c['单位']!=='套'||!Number.isSafeInteger(Number(c['需求数量'])))fail('工装数量须为安全整数套；不换算其他单位');
  }else if(kind==='STORAGE'){
   const s=(data.batchResources||[]).find(s=>s['资源编号']===c['资源编号']&&s['资源类型']==='共享冷却空间');
   if(!s)fail('须引用表15共享冷却空间；不能借用机器装载容量');
   if(!['kg','位置'].includes(c['单位'])||s&&s['单位']!==c['单位'])fail('空间单位须与容量同为kg或位置；不隐式换算重量节点');
   if(c['单位']==='位置'&&!Number.isSafeInteger(Number(c['需求数量'])))fail('位置需求须为安全整数');
  }
 }
 for(const [id,on]of Object.entries(flags))if(on){
  if(!claims.some(c=>typeRule(c['资源类型'])===id))add(`${id} 已启用但缺少表23显式占用声明；填写逐生产批数量/单位及提前取得、后延释放分钟。DEC02仍未批准。`);
  for(const d of data.dependencies||[]){
   const matches=id==='MOLD'?['模具','工具'].includes(d['资源类型']):d['资源类型']==='空间';
   if(!matches)continue;
   const explicit=claims.filter(c=>typeRule(c['资源类型'])===id&&c['订单编号']===d['订单编号']&&c['工序编号']===d['工序编号']&&c['资源编号']===d['资源编号']);
   if(explicit.length!==1)add(`依赖 ${d['订单编号']}/${d['工序编号']}/${d['资源编号']} 须有唯一显式占用声明；不推断需求数量或释放边界`);
   else for(const k of ['需求数量','提前占用分钟','后延占用分钟'])if(d[k]?.trim()&&canonical(d[k])!==canonical(explicit[0][k]))add(`依赖 ${d['订单编号']}/${d['工序编号']}/${d['资源编号']} 的 ${k} 与表23冲突；请统一显式配置，不能猜测优先级`);
  }
 }
 // Existing machine dependency fields are not silently interpreted as preparation/release rules.
 for(const d of data.dependencies||[])if(d['资源类型']==='设备'&&['提前占用分钟','后延占用分钟'].some(k=>d[k]&&(!decimal(d[k])||Number(d[k])!==0)))add(`设备依赖 ${d['订单编号']}/${d['工序编号']} 非零提前/后延占用尚未支持；请明确机器阶段语义或使用零偏移`);
 for(const d of data.dependencies||[])if(d['资源类型']==='设备'&&d['需求数量']&&canonical(d['需求数量'])!=='1.')add(`设备依赖 ${d['订单编号']}/${d['工序编号']} 仅支持单台给定独占设备；非1需求不能忽略，请明确设备处理方式`);
 return issues;
}
