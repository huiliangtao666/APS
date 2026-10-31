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

// Follow only this run's explicit material identities. No parsing task IDs or
// joining today's BOM/profile onto historical demand, including unplanned tasks.
export function materialTaskSources(view,taskIds){
 const input=view.snapshot.originalInput,demands=(view.plan.materialDemands||[]).filter(r=>taskIds.includes(r.taskId));
 const tasks=view.plan.tasks.filter(t=>taskIds.includes(t.id)),facts=(input.executionFacts||[]).filter(f=>tasks.some(t=>t.orderId===f['订单编号']&&t.operation===f['工序编号'])),consumed=(input.executionMaterials||[]).filter(c=>facts.some(f=>f['事实编号']===c['事实编号']));
 if(!demands.length&&!facts.length)return [];
 const materialIds=new Set(demands.map(r=>r.materialId)),productIds=new Set(demands.map(r=>r.productId)),orderIds=new Set(demands.map(r=>r.orderId));
 for(const c of consumed)materialIds.add(c['物料编号']);
 const lotIds=new Set(demands.flatMap(r=>[...r.allocations.map(a=>a.lotId),...(r.excludedLots||[]).map(l=>l.lotId)]));
 for(const c of consumed)lotIds.add(c['批次编号']);
 const supplyIds=new Set(demands.flatMap(r=>r.allocations.map(a=>a.supplyId).filter(Boolean)));
 for(const use of input.supplyUses||[])if(demands.some(d=>d.orderId===use['订单编号']&&d.operation===use['工序编号']))supplyIds.add(use['供给编号']);
 const tables={orders:(input.orders||[]).filter(r=>orderIds.has(r['订单编号'])),products:(input.products||[]).filter(r=>productIds.has(r['产品编号'])),materials:(input.materials||[]).filter(r=>materialIds.has(r['物料编号'])),
  bom:(input.bom||[]).filter(r=>demands.some(d=>d.productId===r['产品编号']&&d.materialId===r['物料编号']&&d.operation===r['投料工序编号']&&d.version===r['版本编号']&&d.effective===r['生效日期'])),
  inventory:(input.inventory||[]).filter(r=>lotIds.has(r['批次编号'])&&materialIds.has(r['物料编号'])),
  supplies:(input.supplies||[]).filter(r=>supplyIds.has(r['供给编号'])),supplyDelays:(input.supplyDelays||[]).filter(r=>supplyIds.has(r['供给编号'])),
  supplyUses:(input.supplyUses||[]).filter(r=>demands.some(d=>d.orderId===r['订单编号']&&d.operation===r['工序编号']&&supplyIds.has(r['供给编号']))),
  rules:(input.rules||[]).filter(r=>['MATERIAL','INVENTORY'].includes(r['规则编号']))};
 tables.executionFacts=facts;tables.executionMaterials=consumed;tables.executionSources=(input.executionSources||[]).filter(s=>facts.some(f=>f['事实编号']===s['事实编号']));
 tables.stageMappings=(input.stageMappings||[]).filter(m=>m['来源类别']==='originalProgress'&&facts.some(f=>f['事实编号']===m['运行编号'])||m['来源类别']==='originalEvents'||m['来源类别']==='originalInventory'&&lotIds.has(m['运行编号'])||m['来源类别']==='originalSupply'&&supplyIds.has(m['运行编号']));
 tables.originalInventory=(input.originalInventory||[]).filter(r=>tables.stageMappings.some(m=>m['来源类别']==='originalInventory'&&m['来源编号']===r['批次编号']));
 tables.originalSupply=(input.originalSupply||[]).filter(r=>tables.stageMappings.some(m=>m['来源类别']==='originalSupply'&&m['来源编号']===r['批次编号']));
 tables.originalProgress=(input.originalProgress||[]).filter(r=>tables.stageMappings.some(m=>m['来源类别']==='originalProgress'&&m['来源编号']===r['任务编号']));
 tables.originalEvents=(input.originalEvents||[]).filter(r=>tables.stageMappings.some(m=>m['来源类别']==='originalEvents'&&m['来源编号']===r['事件编号']));
 const refs=[];
 for(const [table,rows] of Object.entries(tables))for(const row of rows){
  const index=input[table].indexOf(row),csv=view.plan.inputCsvSources?.[table];
  const same=csv?.canonicalRows?.[index]&&JSON.stringify(csv.canonicalRows[index])===JSON.stringify(row);
  const line=same?(csv.records?.[index]?.line??csv.lines?.[index]):null;
  const verified=Number.isSafeInteger(line)&&line>=2&&typeof csv?.sha256==='string'&&!!csv.sha256&&typeof csv?.file==='string';
  refs.push({table,index,row,canonicalRow:index+2,physicalRow:verified?line:null,file:verified?csv.file:null,sourceSha256:verified?csv.sha256:null,inputVersionId:view.run.inputVersionId});
 }
 return refs;
}
