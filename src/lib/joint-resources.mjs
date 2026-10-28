import {quantityMath as Q} from './material-allocation.mjs';
import {jointParameters,jointFlags} from './joint-policy.mjs';
export {jointParameters,jointFlags,validateJointResources} from './joint-policy.mjs';
const typeRule=t=>t==='工装'?'MOLD':t==='空间'?'STORAGE':null;
export function claimsFor(data,members,operation,flags){
 return members.flatMap(m=>(data.resourceClaims||[]).filter(c=>c['订单编号']===m.orderId&&c['工序编号']===operation&&flags[typeRule(c['资源类型'])]).map(c=>{
  const tooling=c['资源类型']==='工装';
  const resource=tooling?(data.tools||[]).find(t=>t['工装编码']===c['资源编号']):(data.batchResources||[]).find(t=>t['资源编号']===c['资源编号']);
  return {declarationId:c['声明编号'],orderId:m.orderId,productionBatchId:m.id||'',type:c['资源类型'],resourceId:c['资源编号'],unit:c['单位'],quantity:c['需求数量'],capacity:tooling?resource['可用数量']:resource['容量'],before:Number(c['提前占用分钟']),after:Number(c['后延占用分钟']),operation};
 }));
}
// Half-open event sweep, using exact rational capacities. Candidate claims count together.
export function previewResources(claims,start,end,reservations=[]){
 const allocations=claims.map(c=>({...c,start:start-c.before,end:end+c.after}));
 for(const a of allocations){
  if(a.start<0)return {ok:false,reason:`${a.resourceId} 提前取得早于分钟0`,nextStart:a.before};
  const same=[...reservations,...allocations].filter(r=>r.type===a.type&&r.resourceId===a.resourceId&&r.start<a.end&&r.end>a.start);
  const points=[a.start,...same.map(r=>r.start).filter(t=>t>=a.start&&t<a.end)];
  for(const t of points){
   const active=same.filter(r=>r.start<=t&&r.end>t);
   const total=active.reduce((s,r)=>Q.add(s,Q.q(r.quantity)),Q.zero);
   if(Q.cmp(total,Q.q(a.capacity))>0n){
    const releases=reservations.filter(r=>r.type===a.type&&r.resourceId===a.resourceId&&r.end>a.start).map(r=>r.end+a.before).filter(t=>t>start);
    return {ok:false,reason:`${a.type} ${a.resourceId} 在分钟 ${t} 累计需求 ${Q.num(total)} ${a.unit} > 容量 ${a.capacity} ${a.unit}；占用 [${a.start},${a.end})，含提前/后延释放`,nextStart:releases.length?Math.min(...releases):undefined};
   }
  }
 }
 return {ok:true,allocations};
}
