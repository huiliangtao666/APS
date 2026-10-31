import {operationDuration,timeFor} from './pack-batch.mjs';
import {inheritedCalendarId} from './factory-lines.mjs';
import {sourceRefs} from './problem-records.mjs';
import {quantityMath as Q,calculateMaterialDemand,feedTime} from './material-allocation.mjs';
import {inventoryBusinessDate} from './inventory.mjs';
import {isOrderSchedulable} from './orders.mjs';

export const processRouteContract='R4-kg-fixed-pair-v1';
export const one=(rows,label)=>{if(rows.length!==1)throw Error(`${label} 须唯一，实际 ${rows.length}`);return rows[0];};
export const integer=(raw,label)=>{if(!/^\d+$/.test(String(raw??''))||!Number.isSafeInteger(Number(raw)))throw Error(`${label} 须显式非负整数`);return Number(raw);};
export const processRequested=data=>(data.routes||[]).some(r=>String(r['最大等待分钟']??'').trim()!=='');
export function adoptProcessScope(scope,data,at){
 if(scope.mode==='minimal-r1'||!processRequested(data)||!data.rules.some(r=>r['规则编号']==='MAX_LAG'&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at))))return scope;
 return {...scope,checked:[...scope.checked,'显式kg固定程序加工/冷却：真实上下游、仅加工合炉、最大等待与合格产出完整冷却区间、多时点整对提交'],unchecked:scope.unchecked.map(s=>s==='最大等待、动态下游释放与其他空间单位'?'任意装载节点/通用分阶段重组、动态下游释放及其他空间单位':s),note:scope.note+' 显式加工/冷却完整路线由冻结源独立复核；采用范围不代替复核结果。'};
}
export function orderedOperations(data,product){
 const rows=data.routes.filter(r=>r['产品编号']===product),out=[];
 let next=one(rows.filter(r=>!r['前序工序']),'顺序路线起点');
 while(next){if(out.includes(next))throw Error('路线循环');out.push(next);const children=rows.filter(r=>r['前序工序']===next['工序编号']);if(children.length>1)throw Error('仅支持顺序路线');next=children[0];}
 if(out.length!==rows.length||new Set(rows.map(r=>r['工序编号'])).size!==rows.length)throw Error('路线悬空或工序重复');return out;
}
export function operationMachine(data,orderId,op){
 const dep=one(data.dependencies.filter(d=>d['订单编号']===orderId&&d['工序编号']===op&&d['资源类型']==='设备'),'设备依赖');
 if(dep['需求数量']!=='1'||integer(dep['提前占用分钟'],'设备提前')!==0||integer(dep['后延占用分钟'],'设备后延')!==0)throw Error('仅支持显式1台设备及零偏移');
 return one(data.machines.filter(m=>m['设备编号']===dep['资源编号']&&m['工序编号']===op),'工序设备');
}
export function selectedRecipe(data,product,minute){
 const rows=data.bom.filter(b=>b['产品编号']===product&&b['生效日期']<=inventoryBusinessDate(feedTime(minute)));
 if(!rows.length)throw Error('缺少已生效BOM');const latest=rows.map(r=>r['生效日期']).sort().at(-1);
 const current=rows.filter(r=>r['生效日期']===latest);one([...new Set(current.map(r=>r['版本编号']))],'同日BOM版本');return current;
}
// Production identity never contains a resource group. Only the explicit heat
// operation may aggregate identities; cooling and every other operation stay individual.
export function establishProcessProduction(data,orders){
 const records=[],contexts=new Map();
 for(const order of orders.filter(isOrderSchedulable)){
  if(order['数量单位']!=='kg')throw Error('配对路线仅支持显式kg；其他粒度未决定');
  const product=one(data.products.filter(p=>p['产品编号']===order['产品编号']),'产品'),yieldRate=Q.q(product['总收率']);
  if(Q.cmp(yieldRate,Q.zero)<=0n||Q.cmp(yieldRate,Q.one)>0n)throw Error('总收率须在(0,1]');
  const remaining=Q.sub(Q.q(order['合格需求']),Q.q(order['已完成合格数量']||'0'));if(Q.cmp(remaining,Q.zero)<0n)throw Error('订单已完成数量超过合格需求');if(Q.cmp(remaining,Q.zero)===0n)continue;
  const route=orderedOperations(data,order['产品编号']),cools=route.filter(r=>String(r['最大等待分钟']??'').trim()!=='');
  if(cools.length>1)throw Error('仅支持一个显式加工/冷却配对');
  const cool=cools[0],heat=cool?one(route.filter(r=>r['工序编号']===cool['前序工序']),'加工前序'):null,hi=route.indexOf(heat),ci=route.indexOf(cool);
  let outputMax=null;
  for(const [i,op]of route.entries()){
   const m=operationMachine(data,order['订单编号'],op['工序编号']),basis=m['装载计量基准'];
   if(basis!=='BOM总投入'&&!((cool&&i>=ci||timeFor(data,order['产品编号'],op['工序编号'])?.['包装作业边界'])&&basis==='合格产出'))throw Error('仅支持加工总投入和冷却起合格产出；任意装载节点未决定');
   if(cool&&(i===hi&&basis!=='BOM总投入'||i===ci&&basis!=='合格产出'))throw Error('加工/冷却装载口径不符');
   const min=Q.q(m['最小装载kg']),max=Q.q(m['最大装载kg']);if(Q.cmp(max,Q.zero)<=0n||Q.cmp(min,max)>0n)throw Error('装载上下限无效');
   const limit=basis==='BOM总投入'?Q.mul(max,yieldRate):max;outputMax=outputMax?Q.min(outputMax,limit):limit;
   const batch=data.batchResources.filter(r=>r['资源编号']===m['设备编号']&&r['资源类型']==='批处理装载');
   if(batch.length&&(op!==heat||batch.length!==1||!op['程序编号']||!batch[0]['允许程序'].split(';').includes(op['程序编号'])))throw Error('本路线只允许显式加工程序合炉，其他分阶段合批未决定');
  }
  if(heat&&!data.batchResources.some(r=>r['资源类型']==='批处理装载'&&r['资源编号']===operationMachine(data,order['订单编号'],heat['工序编号'])['设备编号']))throw Error('加工缺少显式批处理配置');
  const count=Number(Q.ceil(Q.div(remaining,outputMax)).n);
  if(!Number.isSafeInteger(count)||count<1||records.length+count>1000)throw Error('生产批超过1000边界');
  if(count>1&&order['是否允许拆分']!=='是')throw Error('超过装载上限且订单禁止拆分');
  const kg=Q.div(remaining,Q.q(count)),input=Q.div(kg,yieldRate);
  for(let index=1;index<=count;index++)records.push(Object.freeze({id:JSON.stringify([order['订单编号'],index]),orderId:order['订单编号'],index,count,order,qualifiedKg:Q.exact(kg),inputKg:Q.exact(input),quantity:Q.num(kg),load:Q.num(input),unit:'kg'}));
  contexts.set(order['订单编号'],{order,route,heat,cool,heatIndex:hi,coolIndex:ci});
 }
 return {records,contexts};
}
export function processDemands(data,b,operation,minute){
 const whole=calculateMaterialDemand(data,b.order,operation,minute);let part=calculateMaterialDemand(data,b.order,operation,minute,b.qualifiedKg);
 const time=timeFor(data,b.order['产品编号'],operation);
 if(time?.['包装作业边界']==='同订单合并'){
  const kg=Q.fromExact(b.qualifiedKg),current=calculateMaterialDemand(data,b.order,operation,minute,Q.exact(Q.mul(kg,Q.q(b.index)))),prior=b.index>1?calculateMaterialDemand(data,b.order,operation,minute,Q.exact(Q.mul(kg,Q.q(b.index-1)))):null;
  part=part.map((d,i)=>{if(d.unit==='kg')return d;const amount=Q.sub(Q.fromExact(current[i].exactQuantity),prior?Q.fromExact(prior[i].exactQuantity):Q.zero);return {...d,quantity:Q.num(amount),exactQuantity:Q.exact(amount),formula:d.formula+'；同订单合并作业累计取整差额（技术拆批不重复取整）',packBoundary:'同订单合并',packWorkId:JSON.stringify([b.orderId,operation])};});
 }else if(time?.['包装作业边界'])part=part.map(d=>({...d,packBoundary:'逐生产批',packWorkId:JSON.stringify([b.orderId,b.index,operation])}));
 if(!timeFor(data,b.order['产品编号'],operation)?.['包装作业边界']&&part.some((d,i)=>Q.cmp(Q.mul(Q.fromExact(d.exactQuantity),Q.q(b.count)),Q.fromExact(whole[i].exactQuantity))!==0n))throw Error('跨生产批包材取整分配未决定；不改变总需求');
 const all=orderedOperations(data,b.order['产品编号']).flatMap(op=>calculateMaterialDemand(data,b.order,op['工序编号'],minute,b.qualifiedKg)).filter(d=>d.unit==='kg');
 if(Q.cmp(all.reduce((s,d)=>Q.add(s,Q.fromExact(d.exactQuantity)),Q.zero),Q.fromExact(b.inputKg))!==0n)throw Error('完整原料BOM与生产批总投入不守恒');
 return part.map(d=>({...d,taskId:JSON.stringify([b.orderId,b.index,operation]),productionBatchId:b.id}));
}

export function validateProcessPairConfiguration(data,at){
 const active=id=>data.rules.some(r=>r['规则编号']===id&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at)));
 if(!active('MAX_LAG'))return [];
 try{
  if(!processRequested(data))throw Error('MAX_LAG须有显式加工/冷却顺序配对，不能由client提示启用');
  for(const id of ['MATERIAL','CAPACITY','PROGRAM','STORAGE','CALENDAR'])if(!active(id))throw Error(`配对须同时采用 ${id}`);
  const {records,contexts}=establishProcessProduction(data,data.orders.filter(o=>o['需求类型']!=='预测'));
  for(const b of records){const ctx=contexts.get(b.orderId);if(!ctx.cool)continue;
   integer(ctx.cool['最大等待分钟'],'最大等待分钟');
   for(const op of ctx.route){const t=one(data.times.filter(t=>t['产品编号']===b.order['产品编号']&&t['工序编号']===op['工序编号']),'固定工时');const duration=operationDuration(data,b.order['产品编号'],op['工序编号'],t['包装作业边界']==='同订单合并'?Q.exact(Q.mul(Q.fromExact(b.qualifiedKg),Q.q(b.count))):b.qualifiedKg);if(!Number.isSafeInteger(duration)||duration<=0)throw Error('完整路线须为正整数分钟；不自动舍入');}
   const dep=one(data.dependencies.filter(d=>d['订单编号']===b.orderId&&d['工序编号']===ctx.cool['工序编号']&&d['资源类型']==='空间'),'冷却空间依赖');
   const space=one(data.batchResources.filter(r=>r['资源编号']===dep['资源编号']&&r['资源类型']==='共享冷却空间'),'共享冷却空间');
   const claim=one(data.resourceClaims.filter(c=>c['订单编号']===b.orderId&&c['工序编号']===ctx.cool['工序编号']&&c['资源类型']==='空间'&&c['资源编号']===dep['资源编号']),'冷却空间声明');
   if(space['单位']!=='kg'||claim['单位']!=='kg'||claim['占用口径']!=='显式逐生产批完整区间'||[dep,claim].some(r=>r['提前占用分钟']!=='0'||r['后延占用分钟']!=='0')||Q.cmp(Q.q(claim['需求数量']),Q.fromExact(b.qualifiedKg))!==0n||Q.cmp(Q.q(dep['需求数量']),Q.fromExact(b.qualifiedKg))!==0n)throw Error('冷却须显式按每生产批合格产出kg完整占用；其他释放/装载语义未决定');
  }
  return [];
 }catch(e){
  const rules=data.rules.filter(r=>r['规则编号']==='MAX_LAG');
  return [{table:'rules',row:data.rules.indexOf(rules[0])+2,field:'是否启用',code:'INPUT / PROCESS_PAIR',message:e.message,taskIds:[],sourceRead:'frozen-calendar-v1',relatedRecords:[...sourceRefs('rules',rules,data.rules),...sourceRefs('routes',data.routes.filter(r=>String(r['最大等待分钟']??'').trim()!==''),data.routes)]}];
 }
}

// Domain-owned frozen row associations. The UI owner may bind these occurrences
// to input versions/CSV physical rows; this layer never guesses original lines.
export function processTaskSources(data,orderId,operations,minute){
 const refs=[];const take=(table,predicate)=>{const rows=data[table]||[];refs.push(...sourceRefs(table,rows.filter(predicate),rows));};
 const order=(data.orders||[]).find(o=>o['订单编号']===orderId),product=order?.['产品编号'];
 const opIds=new Set(operations),deps=(data.dependencies||[]).filter(d=>d['订单编号']===orderId&&opIds.has(d['工序编号']));
 const machineIds=new Set(deps.filter(d=>d['资源类型']==='设备').map(d=>d['资源编号']));
 const claims=(data.resourceClaims||[]).filter(c=>c['订单编号']===orderId&&opIds.has(c['工序编号']));
 const ids=new Set([...deps,...claims].map(d=>d['资源编号']));
 take('orders',o=>o['订单编号']===orderId);take('products',p=>p['产品编号']===product);
 take('routes',r=>r['产品编号']===product&&opIds.has(r['工序编号']));take('times',r=>r['产品编号']===product&&opIds.has(r['工序编号']));
 take('dependencies',d=>deps.includes(d));take('machines',m=>machineIds.has(m['设备编号']));
 take('resourceClaims',c=>claims.includes(c));take('batchResources',r=>ids.has(r['资源编号']));
 take('tools',t=>ids.has(t['工装编码']));
 const personnel=(data.personnelGroups||[]).filter(g=>deps.some(d=>d['资源类型']==='人员技能'&&(d['资源编号']===g['人员组编号']||(d['候选人员组']||'').split(';').includes(g['人员组编号']))));
 take('personnelGroups',g=>personnel.includes(g));take('personnelPools',p=>personnel.some(g=>g.poolId===p.poolId));
 const calendars=new Set((data.machines||[]).filter(m=>machineIds.has(m['设备编号'])).map(m=>inheritedCalendarId(data,m)));
 take('factoryLines',l=>l['产线编号']===order?.['产线编号']);take('calendars',c=>calendars.has(c['日历编号']));
 take('downtime',d=>machineIds.has(d['设备编号']));take('resourceStops',d=>ids.has(d['资源编号']));
 take('rules',()=>true);
 if(Number.isSafeInteger(minute)){const selected=selectedRecipe(data,product,minute);take('bom',b=>selected.includes(b));}
 return refs;
}
