import {queryInventoryAvailability,inventoryEligibility} from './inventory.mjs';
import {executionInventory,materialPolicy,quantityMath as q} from './material-allocation.mjs';
// Read-only projection: no adopted-plan reservations or physical stock writes.
export function inventoryView(data,asOf=new Date().toISOString()){
 const policy=materialPolicy(data,asOf),net=executionInventory(data);
 return queryInventoryAvailability(net,{asOf,rules:data.rules||[]}).map(row=>{
  const original=data.inventory.find(b=>b['批次编号']===row['批次编号']);
  const state=policy&&Array.isArray(policy['可用状态'])?inventoryEligibility(net.find(b=>b['批次编号']===row['批次编号']),asOf,policy['可用状态']):null;
  return {...row,'账面数量':Number(original['账面数量']),'累计模拟耗料':q.num(q.sub(q.q(original['账面数量']),q.q(row['账面数量']))),'扣耗后余额':row['账面数量'],'分配前可用数量':state?(state.eligible?q.num(q.sub(q.q(row['账面数量']),q.q(row['已占用数量']))):0):null,'分配守卫':state?(state.reasons.join('；')||'满足本规则质量、效期与预计可用条件'):policy?'MATERIAL 缺少可用状态列表；分配资格未检查，不推断默认状态':'MATERIAL 未启用或未生效；未检查分配','质量状态来源':'模拟数据维护','查询规则':'INVENTORY（沿用既有查询规则）','分配规则':policy?'MATERIAL（沿用既有独立状态配置）':'未采用'};
 });
}
