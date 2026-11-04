import {quantityMath as Q} from '../src/lib/material-allocation.mjs';
import {boundary,minuteParameter} from './workbook-minute.mjs';
import {hash,rows} from './workbook-model.mjs';
import {urgentError,URGENT_CONTRACT,requireMinute} from './urgent-order-input.mjs';

export function freezeUrgent(d,p,base){
 requireMinute(d);if(p.facts.sourceResultHash!==hash(base))throw urgentError('URGENT_FACT_SOURCE_CHANGED','原计划结果已变化，请重新核对执行事实');
 const priorityDirection=minuteParameter(d,'GLOBAL','客户服务优先级排序方向',d.parameterContext?.effectiveDay??p.selection.startDay);if(!['数值小优先','数值大优先'].includes(priorityDirection))throw urgentError('URGENT_PRIORITY_DIRECTION','缺少明确的客户服务优先级排序方向，不猜测数值大/小优先');
 const protectionMinutes=boundary(d,'重排保护时段',p.selection.startDay);if(!Number.isSafeInteger(protectionMinutes)||protectionMinutes<0)throw urgentError('URGENT_PROTECTION','重排保护时段须为明确的非负整数分钟');
 const factById=new Map(p.facts.tasks.map(f=>[f.id,f])),statuses=new Map(p.facts.tasks.map(f=>[f.id,f.status])),seedTasks=base.tasks.filter(t=>statuses.get(t.id)!=='not_started'||t.start<p.facts.observationMinute+protectionMinutes&&t.end>p.facts.observationMinute).map(t=>{const f=factById.get(t.id);return {...structuredClone(t),start:f?.startMinute??t.start,startMinute:f?.startMinute??t.start,end:f?.endMinute??t.end,endMinute:f?.endMinute??t.end,quantity:f?.quantity??t.quantity,cleaning:structuredClone(f?.cleaning??t.cleaning),laborIntervals:structuredClone(f?.laborIntervals??t.laborIntervals),toolEndMinute:f?.toolEndMinute??t.toolEndMinute,executionStatus:statuses.get(t.id)==='not_started'?'locked':statuses.get(t.id)};});
 const protectedIds=new Set(seedTasks.map(t=>t.id));
 for(const t of seedTasks)if(t.predecessor&&!protectedIds.has(t.predecessor))throw urgentError('URGENT_PREDECESSOR_FACT','受保护任务的前序须有明确保留事实 '+t.id);
 const seedAllocations=[];
 const allocationFacts=p.facts.allocations||[];
 if(seedTasks.length&&!allocationFacts.length&&(base.allocations||[]).length)throw urgentError('URGENT_CONSUMPTION_FACT_MISSING','有执行/锁定任务时必须明确实际耗料及锁定供给，不能按计划比例推定');
 for(const f of allocationFacts.filter(f=>f.quantity>0)){
  const a=base.allocations[f.index];if(!a||hash(a)!==f.sourceHash)throw urgentError('URGENT_CONSUMPTION_SOURCE','耗料或锁定供给来源变化');
  const actual={...structuredClone(a),quantity:f.quantity,exactQuantity:Q.exact(Q.q(String(f.quantity))),feedMinute:f.feedMinute,feedDay:Math.floor(f.feedMinute/1440),urgentProtected:true,executionConsumed:f.kind==='consumed',protectionKind:f.kind};
  if(rows(d,'物料主数据').find(m=>m['物料编号']===a.materialId)?.['基础单位']==='个'&&!Number.isInteger(actual.quantity))throw urgentError('URGENT_CONSUMPTION_UNIT','实物个数不得为小数 '+a.materialId);seedAllocations.push(actual);
 }
 for(const a of seedAllocations.filter(a=>a.supplyId.startsWith('production:')))if(!protectedIds.has(a.source?.taskId))throw urgentError('URGENT_MATERIAL_FACT_INCOMPLETE','已投/锁定物料的制造来源缺少完成/保留事实 '+a.supplyId);
 const baseGroups=[];
 for(const t of seedTasks){let g=baseGroups.find(g=>g.id===t.productionId);if(!g){g={id:t.productionId,orderId:t.orderId,productId:t.productId,tasks:[]};baseGroups.push(g);}g.tasks.push(t);}
 for(const g of baseGroups){const routes=rows(d,'工艺路线').filter(r=>r['成品编号']===g.productId).sort((a,b)=>Number(a['工序顺序'])-Number(b['工序顺序'])),last=routes.at(-1)?.['路线工序编号'];
  g.quantity=Math.max(...routes.map(r=>(base.tasks||[]).filter(t=>t.productionId===g.id&&t.routeStepId===r['路线工序编号']).reduce((n,t)=>n+t.quantity,0)));
  g.outputConsumed=seedAllocations.filter(a=>a.supplyId==='production:'+g.id).reduce((n,a)=>n+a.quantity,0);
  g.finalRoute=last;
 }
 const included=p.batches.filter(b=>b.effectiveMinute<=p.facts.observationMinute);
 const future=p.batches.filter(b=>b.effectiveMinute>p.facts.observationMinute);
 if(future.length)throw urgentError('URGENT_FUTURE_BATCH','存在尚未到观察时点的生效批次，请明确推进观察时点后计算。',{batchIds:future.map(b=>b.id)});
 const outside=rows(d,'每日需求').filter(r=>Number(r['需求日'])<p.selection.startDay||Number(r['需求日'])>=p.selection.endDay);
 if(outside.length)throw urgentError('URGENT_OUTSIDE_WINDOW','全部剩余需求须明确纳入窗口，不能静默过滤窗外需求。',{demands:outside.map(r=>({id:r['需求编号'],day:Number(r['需求日'])}))});
 d.urgentOrder={contract:URGENT_CONTRACT,planId:p.id,revision:p.revision,factsRevision:p.factsRevision,baseRunId:p.headRunId,baseResultHash:hash(base),batchIds:included.map(b=>b.id),observationMinute:p.facts.observationMinute,protectionMinutes,priorityDirection,effectiveMinute:Math.max(p.facts.observationMinute,...included.map(b=>b.effectiveMinute)),seedTasks,seedAllocations,baseGroups,completed:p.facts.completed,configurationChanges:p.configurationChanges||[],baseParameterHash:base.source?.parameterHash,strategy:'urgent > customer priority > delivery deadline > effective sequence > demand ID',factsHash:hash(p.facts)};
 return d;
}

export function urgentDemandOrder(d,demands){
 if(!d.urgentOrder)return demands;
 const customers=new Map(rows(d,'客户与交付').map(r=>[r['客户编号'],r]));
 return [...demands].sort((a,b)=>{
  const urgent=Number(!!b._urgent)-Number(!!a._urgent);if(urgent)return urgent;if(!a._urgent&&!b._urgent)return 0;
  const first=Number(customers.get(a['客户编号'])?.['服务优先级']),second=Number(customers.get(b['客户编号'])?.['服务优先级']);if(!Number.isFinite(first)||!Number.isFinite(second))throw urgentError('URGENT_PRIORITY_MISSING','插单客户服务优先级缺少明确有效值');
  if(first!==second&&!d.urgentOrder.priorityDirection)throw urgentError('URGENT_PRIORITY_DIRECTION','缺少服务优先级排序方向');
  return (first-second)*(d.urgentOrder.priorityDirection==='数值大优先'?-1:1)||Number(a['按要求日最晚发运日'])-Number(b['按要求日最晚发运日'])||(a._urgent.sequence-b._urgent.sequence)||String(a['需求编号']).localeCompare(String(b['需求编号']));
 });
}

// Additional independent invariants. The physical/supply checker runs as well.
export function verifyUrgent(d,p){
 const u=d.urgentOrder;if(!u)return [];
 const issues=[],byId=new Map(p.tasks.map(t=>[t.id,t])),seeds=new Set(u.seedTasks.map(t=>t.id));
 if(p.conditions?.demandIds!==undefined)issues.push('插单运行不能筛除原单或已生效插单');
 for(const t of u.seedTasks){const actual=byId.get(t.id);if(!actual||['id','orderId','productId','productionId','routeStepId','machine','start','end','quantity','crew','people','toolEndMinute','tools','laborIntervals','cleaning','predecessor'].some(k=>JSON.stringify(t[k])!==JSON.stringify(actual[k])))issues.push('执行/保护事实变化 '+t.id);}
 for(const t of p.tasks)if(!seeds.has(t.id)&&t.start<u.effectiveMinute)issues.push('新增任务早于生效/观察时刻 '+t.id);
 for(const a of u.seedAllocations)if(!(p.allocations||[]).some(x=>hash(x)===hash(a)))issues.push('已耗/锁定分配被释放 '+a.supplyId);
 const results=new Map(p.demandResults.map(r=>[r.id,r]));
 for(const r of rows(d,'每日需求')){const x=results.get(r['需求编号']);if(!x||![x.quantity,x.completedQuantity,x.scheduledQuantity,x.unplannedQuantity].every(n=>Number.isFinite(n)&&n>=0)||x.completedQuantity!==(u.completed[x.id]||0)||Math.abs(x.completedQuantity+x.scheduledQuantity+x.unplannedQuantity-x.quantity)>1e-6||(x.status==='scheduled')!==(x.unplannedQuantity<1e-9))issues.push('插单/普通需求净量或状态不守恒 '+r['需求编号']);}
 if(p.urgentOrder?.factsHash!==u.factsHash||JSON.stringify(p.urgentOrder?.batchIds)!==JSON.stringify(u.batchIds))issues.push('冻结事实或批次不一致');
 const allProducts=new Map(rows(d,'工艺路线').map(r=>[r['成品编号'],rows(d,'工艺路线').filter(x=>x['成品编号']===r['成品编号']).sort((a,b)=>Number(a['工序顺序'])-Number(b['工序顺序']))]));
 const productions=new Map();for(const t of p.tasks)(productions.get(t.productionId)||productions.set(t.productionId,[]).get(t.productionId)).push(t);
 for(const [id,tasks]of productions){if(d.mapping.wip_remaining.some(w=>w.id===id))continue;const routes=allProducts.get(tasks[0].productId)||[],last=routes.at(-1)?.['路线工序编号'],output=tasks.filter(t=>t.routeStepId===last).reduce((n,t)=>n+t.quantity,0);if(output>0)for(const rt of routes){const amount=tasks.filter(t=>t.routeStepId===rt['路线工序编号']).reduce((n,t)=>n+t.quantity,0);if(amount+1e-6<output)issues.push('路线谱系输入/产出不守恒 '+id+'/'+rt['路线工序编号']);}}
 const groups=new Map();for(const t of p.tasks){const k=t.productionId+'|'+t.routeStepId;groups.set(k,(groups.get(k)||0)+t.quantity);}
 for(const g of u.baseGroups){const output=(p.allocations||[]).filter(a=>a.supplyId==='production:'+g.id).reduce((n,a)=>n+a.quantity,0),finalQty=groups.get(g.id+'|'+g.finalRoute)||0;if(output>finalQty+1e-6)issues.push('保留产出超量使用 '+g.id);}
 return issues;
}
