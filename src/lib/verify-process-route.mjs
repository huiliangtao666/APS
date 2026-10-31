import {quantityMath as Q,feedTime} from './material-allocation.mjs';
import {inventoryBusinessDate} from './inventory.mjs';
import {verifyResourcePolicies} from './verify-resource-policies.mjs';
import {verifyJointConditions} from './verify-joint-conditions.mjs';

// Fixed-output, frozen-source checker. No planner, candidate, identity builder,
// adapter, process scheduler or allocation imports. Group labels never authorize
// shared occupancy: compatible source members, exact loads and ledger coverage do.
export function verifyProcessRoute(plan,data,conditions={}){
 const problems=[],missing=[],orders=[],expected=new Map(),groups=new Map(),tasks=plan.tasks||[];
 const add=m=>problems.push(m),same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
 const only=(rows,label)=>{if(rows.length!==1)throw Error(label+' 必须唯一');return rows[0];};
 const eq=(a,b)=>a&&b&&Q.cmp(Q.fromExact(a),Q.fromExact(b))===0n;
 const active=id=>data.rules.some(r=>r['规则编号']===id&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(conditions.ruleEvaluationAt)));
 const recipe=(product,minute)=>{const b=data.bom.filter(r=>r['产品编号']===product&&r['生效日期']<=inventoryBusinessDate(feedTime(minute)));const day=b.map(r=>r['生效日期']).sort().at(-1);const rows=b.filter(r=>r['生效日期']===day);only([...new Set(rows.map(r=>r['版本编号']))],'实际投料BOM版本');return JSON.stringify(rows);};
 try{
  if(!data||!conditions.ruleEvaluationAt)throw Error('缺少冻结源或规则判定时间');
  if(!['orders','products','routes','times','machines','dependencies','bom','inventory','supplies','supplyUses','supplyDelays','resourceClaims','batchResources','tools','personnelGroups','skillSubstitutions','calendars','downtime','resourceStops'].every(k=>Array.isArray(data[k])))throw Error('冻结源表不完整');
  if(plan.processRouteContract!=='R4-kg-fixed-pair-v1')add('缺少服务端完整路线契约');
  if(!plan.batchChecked||!plan.materialChecked)add('生产批/物料采用标志缺失');
  if(conditions.jointConditionsContract!=='FR022-joint-v1'||conditions.workingWindowsContract!=='P06-windows-v1')add('缺少完整联合资源/工作窗口冻结契约');
  if(!['MATERIAL','CAPACITY','PROGRAM','MAX_LAG','STORAGE','CALENDAR','MACHINE','PRECEDENCE'].every(id=>active(id)&&conditions.enabledRuleIds?.includes(id)))add('完整配对所需规则未全部采用并生效');
  for(const order of data.orders.filter(o=>o['需求类型']!=='预测'&&o['订单状态']==='有效')){
   const oid=order['订单编号'],pid=order['产品编号'],product=only(data.products.filter(p=>p['产品编号']===pid),'产品');
   if(order['数量单位']!=='kg')throw Error('非kg生产身份未定义');
   const yieldRate=Q.q(product['总收率']),remaining=Q.sub(Q.q(order['合格需求']),Q.q(order['已完成合格数量']||'0'));
   if(Q.cmp(remaining,Q.zero)===0n)continue;
   const route=data.routes.filter(r=>r['产品编号']===pid),coolRows=route.filter(r=>String(r['最大等待分钟']??'').trim()!=='');
   if(coolRows.length>1)throw Error('超出一个显式配对的范围');
   const cool=coolRows[0],heat=cool?only(route.filter(r=>r['工序编号']===cool['前序工序']),'加工前序'):null;
   const ordered=[];let cursor=only(route.filter(r=>!r['前序工序']),'路线起点');
   while(cursor){if(ordered.includes(cursor))throw Error('路线循环');ordered.push(cursor);const children=route.filter(r=>r['前序工序']===cursor['工序编号']);if(children.length>1)throw Error('路线分支');cursor=children[0];}
   if(ordered.length!==route.length)throw Error('路线不完整');
   const machines=new Map();let maxOutput=null;
   for(const op of ordered){
    const dep=only(data.dependencies.filter(d=>d['订单编号']===oid&&d['工序编号']===op['工序编号']&&d['资源类型']==='设备'),'设备依赖'),m=only(data.machines.filter(m=>m['设备编号']===dep['资源编号']&&m['工序编号']===op['工序编号']),'设备');
    if(dep['需求数量']!=='1'||dep['提前占用分钟']!=='0'||dep['后延占用分钟']!=='0')add(`${oid}/${op['工序编号']} 设备数量/偏移不受支持`);
    const basis=m['装载计量基准'];
    if(basis!=='BOM总投入'&&!(cool&&ordered.indexOf(op)>=ordered.indexOf(cool)&&basis==='合格产出'))add(`${oid}/${op['工序编号']} 未批准的装载节点`);
    if(op===heat&&basis!=='BOM总投入'||op===cool&&basis!=='合格产出')add(`${oid} 加工/冷却口径不符`);
    const cap=Q.q(m['最大装载kg']),output=basis==='BOM总投入'?Q.mul(cap,yieldRate):cap;maxOutput=maxOutput?Q.min(maxOutput,output):output;machines.set(op['工序编号'],m);
   }
   const count=Number(Q.ceil(Q.div(remaining,maxOutput)).n);if(!Number.isSafeInteger(count)||count<1||count>1000)throw Error('冻结生产批数量无效');
   if(count>1&&order['是否允许拆分']!=='是')add(`${oid} 非法拆批`);
   const qualified=Q.div(remaining,Q.q(count)),input=Q.div(qualified,yieldRate),localMissing=[];
   const saved=(plan.productionBatches||[]).filter(b=>b.orderId===oid);
   if(saved.length!==count)add(`${oid} 生产身份覆盖不完整`);
   for(let index=1;index<=count;index++){
    const bid=JSON.stringify([oid,index]),record=saved.filter(b=>b.id===bid),b=record[0];expected.set(bid,{oid,index,qualified,input,route:ordered,heat,cool});
    if(record.length!==1||b.index!==index||b.count!==count||b.unit!=='kg'||!eq(b.qualifiedKg,Q.exact(qualified))||!eq(b.inputKg,Q.exact(input))||b.quantity!==Q.num(qualified)||b.load!==Q.num(input))add(`${bid} 生产身份/数量与冻结订单不符`);
    for(const op of route){
     const id=JSON.stringify([oid,index,op['工序编号']]),matches=tasks.filter(t=>t.id===id);
     if(!matches.length){missing.push(id);localMissing.push(id);continue;}
     if(matches.length!==1){add(`${id} 工序重复`);continue;}const t=matches[0],m=machines.get(op['工序编号']);
     const time=only(data.times.filter(r=>r['产品编号']===pid&&r['工序编号']===op['工序编号']),'固定工时');
     if(t.orderId!==oid||t.productId!==pid||t.productionBatchId!==bid||t.productionBatchIndex!==index||t.operation!==op['工序编号']||t.quantityUnit!=='kg'||!eq(t.exactQuantity,Q.exact(qualified))||t.quantity!==Q.num(qualified)||t.machine!==m['设备编号'])add(`${id} 任务身份/数量/设备不符`);
     if(time['计算方式']!=='固定'||!(Number(time['固定分钟'])>0)||t.duration!==Number(time['固定分钟'])||!Number.isSafeInteger(t.start)||!Number.isSafeInteger(t.end)||t.end!==t.start+t.duration||t.start<(conditions.startMinute??0)||conditions.endMinute!=null&&t.end>conditions.endMinute)add(`${id} 完整固定工时/范围不符`);
     const pred=op['前序工序']?JSON.stringify([oid,index,op['前序工序']]):'',prior=tasks.find(t=>t.id===pred);
     if(t.predecessor!==pred||pred&&(!prior||t.start<prior.end))add(`${id} 真实前序缺失/顺序错误`);
     if(op===cool&&(!prior||!/^\d+$/.test(String(op['最大等待分钟']))||t.start-prior.end>Number(op['最大等待分钟'])))add(`${id} 最大等待超限/未配置`);
     if((t.program||'')!==(op['程序编号']||'')||t.loadBasis!==m['装载计量基准'])add(`${id} 程序/装载口径不符`);
     const load=m['装载计量基准']==='合格产出'?qualified:input;
     if(!eq(t.exactLoadKg,Q.exact(load))||t.loadKg!==Q.num(load))add(`${id} 投入/合格产出重量不符`);
     if(!t.resourceBatchId)add(`${id} 缺少资源批身份`);
     const group=groups.get(t.resourceBatchId)||[];group.push({t,op,m,load,qualified,bid,heat,cool});groups.set(t.resourceBatchId,group);
    }
   }
   orders.push({orderId:oid,status:localMissing.length?'partial':'pass',missing:localMissing});
  }
  if(!expected.size)add('冻结源没有可复核的待排生产身份');
  if((plan.productionBatches||[]).some(b=>!expected.has(b.id)))add('存在无冻结订单依据的生产身份');
  if(tasks.some(t=>!expected.has(t.productionBatchId)||!expected.get(t.productionBatchId).route.some(r=>t.id===JSON.stringify([t.orderId,t.productionBatchIndex,r['工序编号']]))))add('存在无冻结来源的任务');
  const machineRows=(plan.resourceReservations||[]).filter(r=>r.type==='设备'),seenMachines=new Set(),seenSummaries=new Set();
  for(const [id,members]of groups){
   const first=members[0],isHeat=first.op===first.heat;
   if(!isHeat&&members.length!==1)add(`${id} 非加工工序非法共享资源批`);
   const compatibility=x=>{
    const info=expected.get(x.bid),upstream=info.route.slice(0,info.route.indexOf(info.heat)).flatMap(op=>{
     const task=tasks.find(t=>t.productionBatchId===x.bid&&t.operation===op['工序编号']);
     if(!task)return [];
     const current=JSON.parse(recipe(task.productId,task.start));return current.filter(b=>b['投料工序编号']===op['工序编号']).map(b=>[op['工序编号'],b['物料编号'],b['版本编号'],b['生效日期']]);
    });
    return JSON.stringify([x.t.productId,info.route,x.t.program,x.t.machine,x.t.start,x.t.end,recipe(x.t.productId,x.t.start),upstream]);
   };
   if(isHeat){
    if(members.some(x=>x.op!==x.heat||compatibility(x)!==compatibility(first)))add(`${id} 合炉成员实际投料配方/路线/程序/区间不兼容`);
    const batch=only(data.batchResources.filter(r=>r['资源编号']===first.t.machine&&r['资源类型']==='批处理装载'),'加工程序配置');
    if(batch['单位']!=='kg'||Q.cmp(Q.q(batch['容量']),Q.q(first.m['最大装载kg']))!==0n||!batch['允许程序'].split(';').includes(first.op['程序编号']))add(`${id} 加工允许程序/容量不符`);
   }
   if(members.some(x=>x.t.machine!==first.t.machine||x.t.start!==first.t.start||x.t.end!==first.t.end||x.t.operation!==first.t.operation))add(`${id} 资源组成员区间/机器/工序不一致`);
   const load=members.reduce((s,x)=>Q.add(s,x.load),Q.zero),min=Q.q(first.m['最小装载kg']),max=Q.q(first.m['最大装载kg']);
   if(Q.cmp(load,min)<0n||Q.cmp(load,max)>0n)add(`${id} 资源装载超出源上下限`);
   const saved=(plan.resourceBatches||[]).filter(r=>r.id===id),summary=saved[0];
   if(saved.length!==1||!same(summary.members,members.map(x=>x.bid))||summary.operation!==first.t.operation||summary.machine!==first.t.machine||summary.basis!==first.m['装载计量基准']||!eq(summary.exactLoadKg,Q.exact(load))||summary.loadKg!==Q.num(load)||summary.minimum!==Q.num(min)||summary.maximum!==Q.num(max)||summary.status!=='scheduled')add(`${id} 资源批摘要/覆盖不符`);
   if(summary)seenSummaries.add(summary);
   const rows=machineRows.filter(r=>r.resourceBatchId===id),r=rows[0];
   if(rows.length!==1||r.resourceId!==first.t.machine||r.start!==first.t.start||r.end!==first.t.end||r.quantity!=='1'||r.unit!=='台'||!same(r.taskIds||[],members.map(x=>x.t.id)))add(`${id} 机器须单次占用且完整覆盖真实成员`);
   if(r)seenMachines.add(r);
   for(const x of members.filter(x=>x.op===x.cool)){
    const dep=only(data.dependencies.filter(d=>d['订单编号']===x.t.orderId&&d['工序编号']===x.t.operation&&d['资源类型']==='空间'),'冷却空间依赖');
    const space=only(data.batchResources.filter(r=>r['资源编号']===dep['资源编号']&&r['资源类型']==='共享冷却空间'),'共享冷却空间');
    const claim=only(data.resourceClaims.filter(c=>c['订单编号']===x.t.orderId&&c['工序编号']===x.t.operation&&c['资源类型']==='空间'&&c['资源编号']===dep['资源编号']),'冷却空间声明');
    if(space['单位']!=='kg'||claim['单位']!=='kg'||claim['占用口径']!=='显式逐生产批完整区间'||dep['提前占用分钟']!=='0'||dep['后延占用分钟']!=='0'||claim['提前占用分钟']!=='0'||claim['后延占用分钟']!=='0'||Q.cmp(Q.q(claim['需求数量']),x.qualified)!==0n||Q.cmp(Q.q(dep['需求数量']),x.qualified)!==0n)add(`${x.t.id} 冷却须按合格产出完整区间占用kg`);
   }
  }
  if(machineRows.some(r=>!seenMachines.has(r))||(plan.resourceBatches||[]).some(r=>!seenSummaries.has(r)))add('存在无真实工序来源的机器占用或资源组摘要');
  const unique=[...groups.values()].map(m=>m[0].t);
  for(let i=0;i<unique.length;i++)for(let j=i+1;j<unique.length;j++)if(unique[i].machine===unique[j].machine&&unique[i].start<unique[j].end&&unique[j].start<unique[i].end)add(`${unique[i].id}/${unique[j].id} 独占机器重叠`);
  problems.push(...verifyJointConditions(plan,data,conditions));
  const resource=verifyResourcePolicies(plan,data,conditions);if(resource.status==='problem')problems.push(...resource.details);
 }catch(e){add('冻结完整路线无法复核：'+e.message);}
 return {status:problems.length?'problem':missing.length?'partial':'pass',problems,missing,orders:orders.map(o=>({...o,status:problems.length?'problem':o.status})),source:'frozen-source-full-route-v1'};
}
