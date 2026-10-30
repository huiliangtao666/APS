import {effectiveClaim,windowMode} from './resource-policies.mjs';
import {quantityMath as Q} from './material-allocation.mjs';
import {jointParameters,jointFlags} from './joint-policy.mjs';
export {jointParameters,legacyJointParameters,jointFlags,validateJointResources} from './joint-policy.mjs';
const typeRule=t=>t==='工装'?'MOLD':t==='空间'?'STORAGE':null;
export function claimsFor(data,members,operation,flags){
 return members.flatMap(m=>(data.resourceClaims||[]).filter(c=>c['订单编号']===m.orderId&&c['工序编号']===operation&&flags[typeRule(c['资源类型'])]).map(raw=>{
  const c=effectiveClaim(raw,data);
  const tooling=c['资源类型']==='工装';
  const resource=tooling?(data.tools||[]).find(t=>t['工装编码']===c['资源编号']):(data.batchResources||[]).find(t=>t['资源编号']===c['资源编号']);
  return {offsetStart:c['占用口径']===windowMode?Number(c['窗口开始偏移分钟']||0):0,offsetEnd:c['占用口径']===windowMode?Number(c['窗口结束偏移分钟']||0):0,availableFrom:tooling?Number(resource['可用起始分钟']??0):0,availableUntil:tooling?Number(resource['可用结束分钟']??525600):525600,reason:`${c['占用口径']}；${c['参数来源']||'逐项声明'}；提前 ${c['提前占用分钟']} / 后延 ${c['后延占用分钟']} 分钟`,declarationId:c['声明编号'],orderId:m.orderId,productionBatchId:m.id||'',type:c['资源类型'],resourceId:c['资源编号'],unit:c['单位'],quantity:c['需求数量'],capacity:tooling?resource['可用数量']:resource['容量'],before:Number(c['提前占用分钟']),after:Number(c['后延占用分钟']),operation};
 }));
}
// Half-open event sweep, using exact rational capacities. Candidate claims count together.
export function previewResources(claims,start,end,reservations=[]){
 const allocations=claims.map(c=>({...c,start:start+(c.offsetStart||0)-c.before,end:end-(c.offsetEnd||0)+c.after}));
 for(const a of allocations){
  if(!(a.end>a.start))return {ok:false,reason:`${a.resourceId} 窗口不在本次实际工序时长内；请核对剩余工时/窗口配置`};
  if(a.start<(a.availableFrom??0)||a.end>(a.availableUntil??525600))return {ok:false,reason:`${a.resourceId} 占用 [${a.start},${a.end}) 超出可用期 [${a.availableFrom??0},${a.availableUntil??525600})`,nextStart:a.start<(a.availableFrom??0)?(a.availableFrom??0)-(a.offsetStart||0)+a.before:undefined};
  if(a.start<0)return {ok:false,reason:`${a.resourceId} 提前取得早于分钟0`,nextStart:a.before};
  const same=[...reservations,...allocations].filter(r=>r.type===a.type&&r.resourceId===a.resourceId&&r.start<a.end&&r.end>a.start);
  const points=[a.start,...same.map(r=>r.start).filter(t=>t>=a.start&&t<a.end)];
  for(const t of points){
   const active=same.filter(r=>r.start<=t&&r.end>t);
   const total=active.reduce((s,r)=>Q.add(s,Q.q(r.quantity)),Q.zero);
   if(Q.cmp(total,Q.q(a.capacity))>0n){
    const releases=reservations.filter(r=>r.type===a.type&&r.resourceId===a.resourceId&&r.end>a.start).map(r=>r.end+a.before-(a.offsetStart||0)).filter(t=>t>start);
    return {ok:false,reason:`${a.type} ${a.resourceId} 在分钟 ${t} 累计需求 ${Q.num(total)} ${a.unit} > 容量 ${a.capacity} ${a.unit}；占用 [${a.start},${a.end})，含提前/后延释放`,nextStart:releases.length?Math.min(...releases):undefined};
   }
  }
 }
 return {ok:true,allocations};
}
