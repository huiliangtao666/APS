// Offline, append-only events. Effects and fresh cumulative facts commit in one input transaction.
export const eventTypes=['插单','设备故障','人员缺勤','到料延期','物料状态变化'];
const rows=d=>d.simulationEvents||[];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const minute=v=>typeof v==='string'&&/^\d+(?:\.\d{1,12})?$/.test(v)&&Number(v)<=525600;
const issue=(i,field,message)=>({code:'EVENT_RECONCILIATION_REQUIRED',table:'simulationEvents',file:'28_模拟异常事件.csv',row:i+2,field,message});
const parse=e=>JSON.parse(e['参数JSON']);
export function validateEvents(data,checkEffects=true){
 const issues=[],seen=new Set();let last=0;
 rows(data).forEach((e,i)=>{
  const bad=(field,message)=>issues.push(issue(i,field,message));
  if(!e['事件编号']?.trim()||seen.has(e['事件编号']))bad('事件编号','事件编号为空或重复');seen.add(e['事件编号']);
  if(!minute(e['事件分钟'])||Number(e['事件分钟'])<last)bad('事件分钟','事件须按非递减时点追加，0至525600分钟');last=Number(e['事件分钟']);
  if(!minute(e['保护截止分钟'])||Number(e['保护截止分钟'])<Number(e['事件分钟']))bad('保护截止分钟','保护截止须不早于事件；区间为[事件,截止)');
  if(e['保护策略']!=='禁止未开始任务开工')bad('保护策略','仅支持显式禁止未开始任务开工；旧方案任务锁定及自动恢复未定');
  if(!eventTypes.includes(e['事件类型'])||!e['原因']?.trim())bad('事件类型','仅支持五种声明事件且须给原因');
  try{const p=parse(e);if(!p||typeof p!=='object'||Array.isArray(p))throw Error();JSON.parse(e['需处理事实JSON']||'[]').forEach(id=>{if(!(data.executionFacts||[]).some(f=>f['事实编号']===id))throw Error();});}catch{bad('参数JSON','参数须为JSON对象；需处理事实须为现有事实编号数组');}
 });
 if(checkEffects)rows(data).forEach((e,i)=>{try{const p=parse(e),type=e['事件类型'];
  if(type==='设备故障'&&!(data.downtime||[]).some(d=>d['设备编号']===p.machineId&&Number(d['起始分钟'])===Number(e['事件分钟'])&&Number(d['结束分钟'])===p.endMinute&&d['原因']===e['原因']))issues.push(issue(i,'参数JSON','已接纳故障窗口不可移除或改写；恢复语义未定'));
  if(type==='物料状态变化'&&!rows(data).slice(i+1).some(n=>n['事件类型']===type&&parse(n).lotId===p.lotId)&&(data.inventory||[]).find(l=>l['批次编号']===p.lotId)?.['质量状态']!==p.status)issues.push(issue(i,'参数JSON','当前批次状态与最近事件不一致；请追加显式状态事件'));
  if(type==='到料延期'&&!(data.supplyDelays||[]).some(d=>d['记录编号']==='EVENT-'+e['事件编号']&&d['供给编号']===p.supplyId&&d['调整后到达时间']===p.arrival&&d['调整后可用时间']===p.available))issues.push(issue(i,'参数JSON','已接纳延期记录不可移除或改写'));
 }catch{/* The schema findings above reject malformed rows. */}});
 if(rows(data).length)for(const f of data.executionFacts||[])if(Number(f['观测分钟'])<last&&f['状态']!=='已完成')issues.push(issue(rows(data).length-1,'事件分钟','在制事实观测不得早于最近事件'));
 return issues;
}
export function eventSummary(data){return {rows:structuredClone(rows(data)),eventMinute:Math.max(0,...rows(data).map(e=>Number(e['事件分钟']))),protectionUntil:Math.max(0,...rows(data).map(e=>Number(e['保护截止分钟']))),policy:'禁止未开始任务开工；未执行计划位置锁定/恢复/转机/撤销未定，禁止自动质量通过'};}
export function eventAbsences(data){return rows(data).filter(e=>e['事件类型']==='人员缺勤').map(e=>{const p=parse(e),g=(data.personnelGroups||[]).find(g=>g['人员组编号']===p.groupId);return {groupId:p.groupId,count:Number(g?.['人员数量']||0),start:Number(e['事件分钟']),end:p.endMinute};});}
export function eventRisks(data){return rows(data).flatMap(e=>JSON.parse(e['需处理事实JSON']||'[]').map(id=>{const f=(data.executionFacts||[]).find(f=>f['事实编号']===id);return {factId:id,orderId:f?.['订单编号'],operation:f?.['工序编号'],eventId:e['事件编号'],lots:[],downtime:[],message:`需处理：事件 ${e['事件编号']} / ${e['事件类型']}：${e['原因']}；保留原始事实及设备占用，不自动恢复、转机或判质量合格`};}));}
export function stageEvents(before,proposed,submitted=[]){
 const data=structuredClone(proposed),issues=[],old=rows(before),incoming=rows(data);
 const fail=(i,field,msg)=>issues.push(issue(i,field,msg));
 if(incoming.length<old.length||old.some((e,i)=>!same(e,incoming[i]))){fail(0,'事件编号','历史事件不可覆盖、删除或重排');return {data,issues};}
 const added=incoming.slice(old.length);if(!added.length)return {data,issues};
 issues.push(...validateEvents(data,false));if(issues.length)return {data,issues};
 const times=new Set(added.map(e=>e['事件分钟']));
 if(times.size!==1){fail(old.length,'事件分钟','一次原子批只接纳同一时点事件；不同事件时点须分别更新事实');return {data,issues};}
 const time=Number(added[0]['事件分钟']);
 if(time<Math.max(0,...(before.executionFacts||[]).map(f=>Number(f['观测分钟'])))){fail(old.length,'事件分钟','禁止事件回到已观测事实之前');return {data,issues};}
 if((data.executionFacts||[]).length&&!submitted.includes('executionFacts'))fail(old.length,'事件分钟','事件须同批提交完整事件时点累计事实；不得用旧进度推算');
 for(const f of data.executionFacts||[]){if(f['状态']==='已完成'?Number(f['观测分钟'])>time:Number(f['观测分钟'])!==time)fail(old.length,'事件分钟','在制观测须等于事件时点；已完成观测不得在事件之后');}
 for(let j=0;j<added.length;j++){
  const e=added[j],i=old.length+j,p=parse(e),type=e['事件类型'];let affected=[];
  const keys= type==='插单'?['order','dependencies']:type==='设备故障'?['machineId','endMinute']:type==='人员缺勤'?['groupId','endMinute']:type==='到料延期'?['supplyId','arrival','available']:['lotId','status'];
  if(Object.keys(p).some(k=>!keys.includes(k))||keys.some(k=>p[k]===undefined)){fail(i,'参数JSON','参数字段不匹配或含未支持政策');continue;}
  if(['设备故障','人员缺勤'].includes(type)&&(!Number.isFinite(p.endMinute)||p.endMinute<=time||p.endMinute>525600)){fail(i,'参数JSON','结束分钟须为事件之后至525600的数值');continue;}
  if(type==='设备故障'){
   if(!data.machines.some(m=>m['设备编号']===p.machineId)){fail(i,'参数JSON','设备不存在');continue;}
   data.downtime.push({'设备编号':p.machineId,'起始分钟':String(time),'结束分钟':String(p.endMinute),'原因':e['原因']});
   affected=(data.executionFacts||[]).filter(f=>f['当前设备']===p.machineId&&f['状态']!=='已完成'&&Number(f['开始分钟'])<p.endMinute);
  }else if(type==='人员缺勤'){
   if(!data.personnelGroups.some(g=>g['人员组编号']===p.groupId)){fail(i,'参数JSON','人员组不存在；仅支持整个组缺勤');continue;}
   affected=(data.executionFacts||[]).filter(f=>f['状态']!=='已完成'&&data.dependencies.some(d=>d['订单编号']===f['订单编号']&&d['工序编号']===f['工序编号']&&d['资源类型']==='人员技能'&&(!d['资源编号']||d['资源编号']===p.groupId)));
  }else if(type==='物料状态变化'){
   const lot=data.inventory.find(l=>l['批次编号']===p.lotId);
   if(!lot||!['待检','冻结','不合格','合格'].includes(p.status)){fail(i,'参数JSON','须为现有库存批次与显式质量状态');continue;}
   // A simulated status declaration is not an inferred quality approval.
   lot['质量状态']=p.status;
   if(p.status!=='合格')affected=(data.executionFacts||[]).filter(f=>(data.executionMaterials||[]).some(c=>c['事实编号']===f['事实编号']&&c['批次编号']===p.lotId));
  }else if(type==='到料延期'){
   const supply=data.supplies.find(s=>s['供给编号']===p.supplyId);
   const date=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
   const previous=(data.supplyDelays||[]).filter(d=>d['供给编号']===p.supplyId).at(-1);
   if(!supply||!date(p.arrival)||!date(p.available)||Date.parse(p.arrival)<Date.parse(previous?.['调整后到达时间']||supply['预计到达时间'])||Date.parse(p.available)<Date.parse(previous?.['调整后可用时间']||supply['预计可用时间'])||Date.parse(p.available)<Date.parse(p.arrival)||Date.parse(p.arrival)<Date.parse('2026-11-02T08:00:00+08:00')+time*60000){fail(i,'参数JSON','供给/带时区延期时间无效，不得提前到达、早于事件或倒退可用时间');continue;}
   data.supplyDelays.push({'记录编号':'EVENT-'+e['事件编号'],'供给编号':p.supplyId,'记录时间':new Date(Date.parse('2026-11-02T08:00:00+08:00')+time*60000).toISOString().replace('.000Z','Z'),'调整后到达时间':p.arrival,'调整后可用时间':p.available,'原因':e['原因']});
  }else if(type==='插单'){
   const o=p.order,defs=p.dependencies;
   if(!o||typeof o!=='object'||Array.isArray(o)||Object.values(o).some(v=>typeof v!=='string')||data.orders.some(x=>x['订单编号']===o['订单编号'])||o['需求类型']!=='正式订单'||o['订单状态']!=='有效'||Number(o['已完成合格数量']||0)!==0||!Array.isArray(defs)||defs.some(d=>!d||d['订单编号']!==o['订单编号']||Object.values(d).some(v=>typeof v!=='string'))){fail(i,'参数JSON','仅支持新有效正式订单及其显式依赖；不可覆盖已有订单、猜测资源或完成量');continue;}
   data.orders.push(o);data.dependencies.push(...defs);
  }
  const ids=[...new Set(affected.map(f=>f['事实编号']))];
  if(e['需处理事实JSON']&&e['需处理事实JSON']!=='[]'&&!same(JSON.parse(e['需处理事实JSON']),ids))fail(i,'需处理事实JSON','受影响事实由服务端依据事件和耗料/资源引用确定，不接受伪造');
  e['需处理事实JSON']=JSON.stringify(ids);
 }
 return {data,issues};
}
