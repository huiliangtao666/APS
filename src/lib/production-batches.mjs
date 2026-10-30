import {sourceRefs} from './problem-records.mjs';
import {quantityMath as Q, calculateMaterialDemand} from './material-allocation.mjs';
import {isOrderSchedulable} from './orders.mjs';
export {batchParameters,activeBatchRule} from './batch-policy.mjs';
// A conservative whole-route grouping: no product-name matching or implicit compatibility.
// kg/BOM total input is explicitly selected; arbitrary operation load nodes remain blocked.
export function prepareProductionBatches(source,orders,minute){
 const records=[],groups=[],findings=[];let serial=0,productionCount=0;
 let members=[];
 const trace=(table,rows)=>members.push(...sourceRefs(table,rows,source[table]||[]));
 const issue=(order,message)=>findings.push({relatedRecords:[...members],code:'UNPLANNED / BATCH_CONFIG',message:`订单 ${order['订单编号']}：${message}`,taskIds:[],context:{orderId:order['订单编号']}});
 for(const order of orders.filter(isOrderSchedulable)){
  members=[];trace('orders',[order]);
  try{
   if(order['数量单位']!=='kg')throw Error('拆批仅支持显式 kg 订单；其他单位的拆分粒度未决定');
   const remaining=Q.sub(Q.q(order['合格需求']),Q.q(order['已完成合格数量']||'0'));if(Q.cmp(remaining,Q.zero)===0n)continue;
   const product=source.products.find(p=>p['产品编号']===order['产品编号']);
   trace('products',product?[product]:[]);
   const input=Q.div(remaining,Q.q(product['总收率']));
   const route=source.routes.filter(r=>r['产品编号']===order['产品编号']);
   trace('routes',route);
   if(!route.length)throw Error('缺少路线');
   const machines=route.map(op=>{
    const dep=source.dependencies.filter(d=>d['订单编号']===order['订单编号']&&d['工序编号']===op['工序编号']&&d['资源类型']==='设备');
    trace('dependencies',dep);
    if(dep.length!==1)throw Error('设备依赖必须唯一');
    const machine=source.machines.find(m=>m['设备编号']===dep[0]['资源编号']);
    trace('machines',machine?[machine]:[]);
    if(!machine||machine['装载计量基准']!=='BOM总投入')throw Error('设备须显式采用 BOM总投入；其他装载重量节点未决定');
    const low=Q.q(machine['最小装载kg']),high=Q.q(machine['最大装载kg']);
    if(Q.cmp(high,Q.zero)<=0n||Q.cmp(low,high)>0n)throw Error('装载上下限须满足 0 ≤ 最小 ≤ 最大且最大 > 0');
    const batch=(source.batchResources||[]).find(r=>r['资源编号']===machine['设备编号']&&r['资源类型']==='批处理装载');
    trace('batchResources',batch?[batch]:[]);
    if(batch&&(!op['程序编号']?.trim()||!batch['允许程序'].split(';').includes(op['程序编号'])))throw Error(`工序 ${op['工序编号']} 缺少设备允许的显式程序；不能推断兼容`);
    return {machine,low,high,batch};
   });
   let high=machines[0].high,low=machines[0].low;
   for(const m of machines){high=Q.min(high,m.high);if(Q.cmp(m.low,low)>0n)low=m.low;}
   if(Q.cmp(low,high)>0n)throw Error('整条路线没有共同装载区间；分工序数量/重量节点未配置');
   const n=Number(Q.ceil(Q.div(input,high)).n);
   if(!Number.isSafeInteger(n)||n>1000||productionCount+n>1000)throw Error('超过本次最多1000生产批限制');
   if(n>1&&order['是否允许拆分']!=='是')throw Error('超过最大装载且订单不允许拆分');
   const kg=Q.div(remaining,Q.q(n)),load=Q.div(input,Q.q(n));
   // Reuse exact FR020 BOM validation at every operation. No inferred recipe mass.
   const raw=route.flatMap(op=>calculateMaterialDemand(source,order,op['工序编号'],minute,undefined,trace)).filter(d=>d.unit==='kg');
   const rawTotal=raw.reduce((sum,d)=>Q.add(sum,Q.fromExact(d.exactQuantity)),Q.zero);
   if(Q.cmp(rawTotal,input)!==0n)throw Error('装载需完整仅损失原料 BOM，总投入须与原料需求一致');
   // Existing packaging integer/rounding restrictions still apply to each production batch.
   for(const op of route){
    const whole=calculateMaterialDemand(source,order,op['工序编号'],minute,undefined,trace);
    const part=calculateMaterialDemand(source,order,op['工序编号'],minute,Q.exact(kg),trace);
    if(part.some((d,i)=>Q.cmp(Q.mul(Q.fromExact(d.exactQuantity),Q.q(n)),Q.fromExact(whole[i].exactQuantity))!==0n))throw Error('拆批后包材取整改变订单总需求；跨批取整分配未决定，拒绝自动增加或减少用料');
   }
   const signature=JSON.stringify([order['产品编号'],source.bom.filter(b=>b['产品编号']===order['产品编号']),route,machines.map(m=>m.machine['设备编号'])]);
   const made=[];
   for(let i=0;i<n;i++)made.push({id:JSON.stringify([order['订单编号'],i+1]),orderId:order['订单编号'],index:i+1,count:n,order,qualifiedKg:Q.exact(kg),inputKg:Q.exact(load),quantity:Q.num(kg),load:Q.num(load),unit:'kg'});
   records.push(...made);productionCount+=n;
   for(const member of made){
    // First fit preserves order priority. No extra production to repair an under-min group.
    let g=machines.every(m=>m.batch)&&groups.find(g=>g.signature===signature&&Q.cmp(Q.add(g.exactLoad,load),high)<=0n);
    if(!g){g={id:`FR021-RB-${++serial}`,signature,members:[],exactLoad:Q.zero,low,high,route,machines};groups.push(g);}
    g.members.push(member);g.exactLoad=Q.add(g.exactLoad,load);
   }
  }catch(e){issue(order,e.message);}
 }
 const data=structuredClone(source);
 const originals=Object.fromEntries(Object.keys(source).filter(k=>Array.isArray(source[k])).map(k=>[k,new Map(data[k].map((row,i)=>[row,source[k][i]]))]));
 data.orders=[];data.dependencies=[];data.supplyUses=[];
 const byId=new Map();
 for(const g of groups){
  g.load=Q.num(g.exactLoad);g.exactInputKg=Q.exact(g.exactLoad);g.minimum=Q.num(g.low);g.maximum=Q.num(g.high);
  g.status=Q.cmp(g.exactLoad,g.low)<0n?'blocked-under-min':'candidate';
  if(g.status!=='candidate'){findings.push({code:'UNPLANNED / UNDER_MIN_LOAD',message:`资源批 ${g.id} 装载 ${g.load}kg 低于下限 ${g.minimum}kg；尾批报问题，未自动超产或占用物料`,taskIds:g.members.flatMap(m=>g.route.map(op=>JSON.stringify([m.orderId,m.index,op['工序编号']]))),context:{load:g.load,minimum:g.minimum,maximum:g.maximum,unit:'kg'}});continue;}
  const first=g.members[0].order;
  data.orders.push({...first,'订单编号':g.id,'合格需求':'1','数量单位':'kg','已完成合格数量':'0'});byId.set(g.id,g);
  for(const op of g.route){
   const deps=source.dependencies.filter(d=>d['订单编号']===first['订单编号']&&d['工序编号']===op['工序编号']&&d['资源类型']==='设备');
   data.dependencies.push(...deps.map(d=>({...d,'订单编号':g.id})));
   // Sum each member's independently declared personnel needs; never assume shared labor.
   for(const m of g.members)data.dependencies.push(...source.dependencies.filter(d=>d['订单编号']===m.orderId&&d['工序编号']===op['工序编号']&&d['资源类型']==='人员技能').map(d=>({...d,'__policyRoleSource':m.id,'订单编号':g.id})));
  }
 }
 return {data,orders:data.orders,findings,records,groups,byId,
  originalRecords(table,rows){return rows.map(row=>originals[table]?.get(row)).filter(Boolean);},
  demands(order,operation,at){return byId.get(order['订单编号']).members.flatMap(m=>{
   const whole=calculateMaterialDemand(source,m.order,operation,at);
   const part=calculateMaterialDemand(source,m.order,operation,at,m.qualifiedKg);
   if(part.some((d,i)=>Q.cmp(Q.mul(Q.fromExact(d.exactQuantity),Q.q(m.count)),Q.fromExact(whole[i].exactQuantity))!==0n))throw Error('实际投料版本改变跨批取整总需求；分配未决定，未占用物料');
   return part.map(d=>({...d,taskId:JSON.stringify([m.orderId,m.index,operation]),productionBatchId:m.id,resourceBatchId:JSON.stringify([order['订单编号'],operation])}));
  });},
  taskIds(id){for(const g of groups)for(const op of g.route)if(id===`${g.id}-${op['工序编号']}`)return g.members.map(m=>JSON.stringify([m.orderId,m.index,op['工序编号']]));return [id];},
  expand(tasks){return tasks.flatMap(t=>byId.get(t.orderId).members.map(m=>({...t,id:JSON.stringify([m.orderId,m.index,t.operation]),orderId:m.orderId,productionBatchId:m.id,productionBatchIndex:m.index,resourceBatchId:JSON.stringify([t.orderId,t.operation]),batchGroupId:t.orderId,quantity:m.quantity,exactQuantity:m.qualifiedKg,loadKg:m.load,exactLoadKg:m.inputKg,quantityUnit:'kg',predecessor:t.predecessor?JSON.stringify([m.orderId,m.index,gPredecessor(t,source)]):'',source:t.source+' · FR021 BOM总投入/均分；资源批 '+t.orderId})));}
 };
}
function gPredecessor(t,source){return source.routes.find(r=>r['产品编号']===t.productId&&r['工序编号']===t.operation)?.['前序工序']||'';}
export function batchSummary(context,tasks){return {productionBatches:context.records.map(({order,...m})=>m),resourceBatches:context.groups.flatMap(g=>g.route.map((op,i)=>({id:JSON.stringify([g.id,op['工序编号']]),groupId:g.id,operation:op['工序编号'],machine:g.machines[i].machine['设备编号'],members:g.members.map(m=>m.id),loadKg:g.load,exactLoadKg:g.exactInputKg,minimum:Q.num(g.machines[i].low),maximum:Q.num(g.machines[i].high),basis:'BOM总投入',status:g.status==='blocked-under-min'?g.status:tasks.some(t=>t.batchGroupId===g.id&&t.operation===op['工序编号'])?'scheduled':'unplanned'})))};}
