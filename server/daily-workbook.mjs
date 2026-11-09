import {rows,dayDate,refreshDerived,hash} from './workbook-model.mjs';
import {requireThat as need,date,atoms} from './simulator/contract.mjs';
import {sourceToken,ready,balances,invalidate,reconcile} from './daily-model.mjs';
export const dayIndex=value=>{date(value);return Math.round((Date.parse(value+'T00:00:00Z')-Date.parse('2026-10-31T00:00:00Z'))/86400000);};
export function workbookOpening(d,policies){
 need(policies?.scales&&policies?.purchaseReceipts,'DAILY_OPENING_POLICY','policies','须明确物料精度及采购收货策略');
 const materials=Object.fromEntries(rows(d,'物料主数据').map(r=>[r['物料编号'],{unit:r['基础单位'],scale:policies.scales[r['物料编号']]}]));
 const lots=rows(d,'期初库存').map(r=>{const q=Number(r['当前数量']),quality=({'合格':'qualified','已放行':'qualified','待检':'pending','冻结':'frozen'})[r['质量状态']];need(quality&&r['当前数量']!==undefined&&r['期初已占用量']!==undefined&&r['到期日']!==undefined,'DAILY_OPENING_GAP',r['库存批次编号'],'期初质量、占用、效期或数量缺失');need(r['数量单位']===materials[r['物料编号']]?.unit,'DAILY_UNIT',r['库存批次编号'],'须先沿原单位换算入口统一基础单位');return {id:r['库存批次编号'],materialId:r['物料编号'],quantity:q,qualified:quality==='qualified'?q:0,pending:quality==='pending'?q:0,frozen:quality==='frozen'?q:0,reserved:Number(r['期初已占用量']),expiresDate:dayDate(Number(r['到期日'])),location:r['库位编号']};});
 const demands=rows(d,'每日需求').map(r=>({id:r['需求编号'],materialId:r['成品编号'],required:Number(r['需求千克']),shipped:0,cancelled:0,dueDate:dayDate(Number(r['需求日'])),customer:r['客户编号']}));
 // Existing transit is explicitly declared net-open by the caller; do not invent received history.
 const purchases=rows(d,'既有采购在途').map(r=>{need(policies.transitBasis==='NET_OPEN','DAILY_TRANSIT_BASIS','policies','须核定原在途为净未收量');need(policies.purchaseReceipts[r['在途记录编号']],'DAILY_RECEIPT_POLICY',r['在途记录编号'],'缺明确仿真收货策略');return {id:r['在途记录编号'],materialId:r['物料编号'],ordered:Number(r['订购数量']),received:0,cancelled:0,issued:true,status:'effective',dueDate:dayDate(Number(r['约定到货日'])),receipt:policies.purchaseReceipts[r['在途记录编号']],sourceRow:r};});
 const tasks=openingWip(d,policies,materials);
 return {materials,lots,demands,purchases,tasks,resources:[],movements:[]};
}
export function projectDaily(d,b){
 const out=structuredClone(d),at=dayIndex(b.date),find=(table,key,value)=>rows(d,table).find(r=>r[key]===value)||{};
 out.tables['期初库存']=b.state.lots.flatMap(l=>['qualified','pending','frozen'].filter(k=>l[k]>0).map(k=>({...find('期初库存','库存批次编号',l.id),'库存批次编号':l.id+'-'+k,_dailyLotId:l.id,'物料编号':l.materialId,'当前数量':String(l[k]),'数量单位':b.state.materials[l.materialId].unit,'期初已占用量':String(k==='qualified'?l.reserved:0),'质量状态':({qualified:'合格',pending:'待检',frozen:'冻结'})[k],'放行日':String(k==='qualified'?at:44),'到期日':String(dayIndex(l.expiresDate)),'快照日':String(at),'库位编号':l.location})));
 out.tables['期初在制']=b.state.tasks.filter(t=>t.openingWip&&t.output<t.limit).map(t=>({...t.sourceRow,'预计合格产出':String(t.limit-t.output),'数量单位':b.state.materials[t.materialId].unit}));
 const wipIds=new Set(out.tables['期初在制'].map(r=>r['在制批次编号']));out.tables['在制剩余映射']=rows(d,'在制剩余映射').filter(r=>wipIds.has(r['在制批次编号']));if(out.mapping)out.mapping.wip_remaining=(out.mapping.wip_remaining||[]).filter(r=>wipIds.has(r.id));
 out.tables['每日需求']=b.state.demands.map(r=>{const base=find('每日需求','需求编号',r.id),m=rows(d,'物料主数据').find(m=>m['物料编号']===r.materialId);need(Number(m?.['每箱净重千克'])>0,'DAILY_DEMAND_UNIT',r.id,'缺原每箱净重');return {...base,'需求编号':r.id,'成品编号':r.materialId,'客户编号':r.customer,'需求箱数':String((r.required-r.cancelled-r.shipped)/Number(m['每箱净重千克'])),'需求日':String(dayIndex(r.dueDate))};}).filter(r=>Number(r['需求箱数'])>0);
 out.tables['既有采购在途']=b.state.purchases.filter(p=>p.issued&&p.ordered>p.received+p.cancelled).map(p=>{const base=p.sourceRow||find('既有采购在途','在途记录编号',p.id);need(base['供货关系编号']||p.relationId,'DAILY_PURCHASE_RELATION',p.id,'缺现有供货关系，不能编造');return {...base,'在途记录编号':p.id,'采购订单编号':p.id,'订单行号':String(base['订单行号']||1),'物料编号':p.materialId,'供货关系编号':p.relationId||base['供货关系编号'],'供应商编号':p.supplierId||base['供应商编号'],'订购数量':String(p.ordered-p.received-p.cancelled),'数量单位':b.state.materials[p.materialId].unit,'约定到货日':String(dayIndex(p.dueDate)),'预计放行日':String(dayIndex(p.dueDate)),'预计到期日':String(dayIndex(p.receipt.expiresDate)),'在途状态':'已下单'};});
 // Reuse the native net-open transit model; drafts stay conditional, never transit.
 out.dailyContext={branchId:b.id,date:b.date,sourceToken:b.sourceToken,granularity:b.granularity};
 out.dailySnapshot={branchId:b.id,date:b.date,balances:balances(b),movements:structuredClone(b.state.movements),parentCheckpoint:b.history.at(-1)?.hash??null,adopted:structuredClone(b.adopted)};
 out.tables['停机安排']=rows(d,'停机安排').filter(r=>!r._dailyResource);
 for(const r of b.state.resources)if(!r.ready&&(!r.until||r.until>=b.date))out.tables['停机安排'].push({'停机编号':'DAILY-'+r.id,'资源编号':r.id,'开始日':String(at),'结束日':String(dayIndex(r.until||b.endDate)+1),'可知日':String(at),'停机类型':'显式仿真事件','说明':r.disposition,_dailyResource:true});
 for(const table of ['期初库存','每日需求','既有采购在途'])out.tables[table].forEach((row,i)=>row._row=i+3);
 refreshDerived(out,at);return out;
}
export function dailyRunContext(s,d){
 const b=(s.dailyBranches||[]).find(b=>b.datasetId===d.id);if(!b)return null;
 need(!b.ended&&b.sourceToken===sourceToken(d)&&ready(b),'DAILY_NOT_READY','confirmations','本日输入或确认已变化，请刷新四领域');
 return {branchId:b.id,date:b.date,revision:b.revision,sourceToken:b.sourceToken,granularity:b.granularity,parentCheckpoint:b.history.at(-1)?.hash??null};
}
export function adoptDaily(b,r,d){
 need(r?.dailyContext&&r.dailyContext.branchId===b.id&&r.dailyContext.date===b.date&&r.dailyContext.sourceToken===b.sourceToken&&b.sourceToken===sourceToken(d),'DAILY_STALE_CANDIDATE','run','候选来源已变化，只可查询',409);
 need(ready(b)&&['completed','partial'].includes(r.status)&&r.result&&r.resultHash===hash(r.result),'DAILY_PLAN_NOT_READY','run','须有已保存且独立检查通过的真实运行');
 const groups=new Map();for(const t of r.result.tasks){const key=t.productionId;const old=groups.get(key);if(!old||t.end>old.end)groups.set(key,t);}
 const ids=[];for(const [key,t]of groups){
  const stable='task-'+hash({branch:b.id,productionId:key,product:t.productId,need:t.orderId}).slice(0,40),old=b.state.tasks.find(x=>x.id===stable);
  const recipe=rows(d,'物料清单').filter(x=>x['父项编号']===t.productId&&Number(x['生效日'])<=dayIndex(b.date)&&dayIndex(b.date)<Number(x['失效日'])).map(x=>({materialId:x['子项编号'],perOutput:Number(x['子项基准用量'])/Number(x['父项基准产出千克']),source:x['用量关系编号']}));
  need(recipe.every(x=>Number.isFinite(x.perOutput)&&x.perOutput>0),'DAILY_RECIPE',stable,'投料定额无效');
  if(!old)b.state.tasks.push({id:stable,sourceTaskId:t.id,productionId:key,materialId:t.productId,limit:t.quantity,output:0,consumed:{},recipe,planHash:r.resultHash});
  else {need(old.materialId===t.productId,'DAILY_TASK_PROTECTION',stable,'稳定作业不得换物料');old.limit=old.output+t.quantity;old.planHash=r.resultHash;}ids.push(stable);
 }
 b.adopted={runId:r.id,inputHash:r.inputHash,resultHash:r.resultHash,sourceToken:b.sourceToken,date:b.date,taskIds:[...new Set([...ids,...b.state.tasks.filter(t=>t.openingWip&&t.output<t.limit).map(t=>t.id)])]};b.candidate={runId:r.id,status:'adopted',stale:false};return b.adopted;
}

// WIP is already in process at the opening boundary. Prior consumption belongs
// to that boundary, never a second deduction from the current physical lots.
export function openingWip(d,policies,materials){
 return rows(d,'期初在制').map(row=>{
  const key=row['在制批次编号'],f=policies.wipFacts?.[key],mapping=(d.mapping?.wip_remaining||[]).filter(w=>w.id===key);
  need(f&&f.source&&typeof f.disposition==='string'&&f.disposition&&Number.isFinite(f.output)&&f.output>=0&&f.consumedByMaterial&&mapping.length===1&&mapping[0].remaining_route_steps?.length&&mapping[0].resource&&mapping[0].remaining_labor_pool&&mapping[0].remaining_labor_count>0,'DAILY_WIP_MAPPING_REQUIRED',key,'须明确累计产出/已耗料事实、来源及原有限资源剩余映射');
  const materialId=row['成品编号'];need(row['数量单位']===materials[materialId]?.unit,'DAILY_WIP_UNIT',key,'在制须为本物料基础单位');
  const remaining=Number(row['预计合格产出']);need(Number.isFinite(remaining)&&remaining>=0,'DAILY_WIP_QUANTITY',key,'须明确尚未产出量');
  const recipe=rows(d,'物料清单').filter(r=>r['父项编号']===materialId&&Number(r['生效日'])<=Number(row['已开工日'])&&Number(row['已开工日'])<Number(r['失效日'])).map(r=>({materialId:r['子项编号'],perOutput:Number(r['子项基准用量'])/Number(r['父项基准产出千克']),source:r['用量关系编号']}));
  need(recipe.length&&recipe.every(r=>r.perOutput>0&&Object.hasOwn(f.consumedByMaterial,r.materialId)),'DAILY_WIP_FACT_GAP',key,'每项冻结BOM须有显式累计耗料（含0）');
  for(const r of recipe){atoms(f.consumedByMaterial[r.materialId],materials[r.materialId],key);need(f.consumedByMaterial[r.materialId]>=f.output*r.perOutput,'DAILY_WIP_FACT_GAP',key,'累计产出缺对应已耗料事实');}
  return {id:'wip-'+key,openingWip:true,productionId:key,materialId,limit:remaining+f.output,output:f.output,consumed:{},historicalConsumed:structuredClone(f.consumedByMaterial),recipe,sourceRow:structuredClone(row),remainingMapping:structuredClone(mapping[0]),source:structuredClone(f.source),disposition:f.disposition};
 });
}
export function rememberSource(b,d){b.sourceBaseline={token:sourceToken(d),tables:structuredClone(d.tables),mapping:structuredClone(d.mapping??null)};}
export function rebaseDaily(b,d){
 if(b.sourceToken===sourceToken(d))return false;
 const base=b.sourceBaseline;need(base,'DAILY_REBASE_BASE_REQUIRED','source','旧目标缺来源基准，须从已保存来源恢复，不能重放累计事实');
 const before=base.tables,changed=t=>hash(before[t]||[])!==hash(rows(d,t));
 const by=(a,k)=>new Map(a.map(r=>[r[k],r]));
 if(changed('物料主数据')){
  const mats=by(rows(d,'物料主数据'),'物料编号');
  for(const [id,m]of Object.entries(b.state.materials))need(mats.get(id)?.['基础单位']===m.unit,'DAILY_REBASE_UNIT',id,'已有实际账物料不得删除/改量纲');
  for(const [id,r]of mats)if(!b.state.materials[id]){const scale=b.policies.scales[id];need(scale,'DAILY_REBASE_SCALE',id,'新增物料须给出精度');b.state.materials[id]={unit:r['基础单位'],scale};}
 }
 if(changed('每日需求')){
  const incoming=by(rows(d,'每日需求'),'需求编号');
  for(const old of b.state.demands){const row=incoming.get(old.id);if(row){need(row['成品编号']===old.materialId,'DAILY_REBASE_IDENTITY',old.id,'已执行需求不得换物料');old.required=old.shipped+old.cancelled+Number(row['需求千克']);old.dueDate=dayDate(Number(row['需求日']));old.customer=row['客户编号'];incoming.delete(old.id);}else old.required=old.shipped+old.cancelled;}
  for(const row of incoming.values())b.state.demands.push({id:row['需求编号'],materialId:row['成品编号'],required:Number(row['需求千克']),shipped:0,cancelled:0,dueDate:dayDate(Number(row['需求日'])),customer:row['客户编号']});
 }
 if(changed('期初库存')){
  const next=new Map();
  for(const row of rows(d,'期初库存')){
   const exact=b.state.lots.find(l=>l.id===row['库存批次编号']),key=row._dailyLotId||exact?.id||row['库存批次编号'].replace(/-(qualified|pending|frozen)$/,'');
   const old=b.state.lots.find(l=>l.id===key),category=({'合格':'qualified','已放行':'qualified','待检':'pending','冻结':'frozen'})[row['质量状态']],quantity=Number(row['当前数量']);
   need(category&&row['数量单位']===b.state.materials[row['物料编号']]?.unit,'DAILY_REBASE_UNIT',key,'库存数量/质量/单位须明确');
   need(!old||old.materialId===row['物料编号'],'DAILY_REBASE_IDENTITY',key,'同批次不得换物料');
   const item=next.get(key)||{...structuredClone(old||{}),id:key,materialId:row['物料编号'],quantity:0,qualified:0,pending:0,frozen:0,reserved:0,location:row['库位编号'],expiresDate:dayDate(Number(row['到期日']))};
   need(item.location===row['库位编号']&&item.expiresDate===dayDate(Number(row['到期日'])),'DAILY_REBASE_LOT',key,'同批次分类行属性冲突');
   item.quantity+=quantity;item[category]+=quantity;item.reserved+=Number(row['期初已占用量']);next.set(key,item);
  }
  const ids=new Set([...b.state.lots.map(l=>l.id),...next.keys()]);
  for(const key of ids){const old=b.state.lots.find(l=>l.id===key),item=next.get(key)||{...old,quantity:0,qualified:0,pending:0,frozen:0,reserved:0},delta=item.quantity-(old?.quantity||0);if(delta)b.state.movements.push({id:'rebase-'+hash({token:sourceToken(d),key}).slice(0,40),source:{kind:'ACCEPTED_WORKBOOK_REVISION',token:sourceToken(d)},date:b.date,lotId:key,materialId:item.materialId,quantity:delta,unit:b.state.materials[item.materialId].unit,kind:'SOURCE_REBASE'});next.set(key,item);}
  b.state.lots=[...next.values()];
 }
 if(changed('既有采购在途')){
  const incoming=by(rows(d,'既有采购在途'),'在途记录编号');
  for(const old of b.state.purchases.filter(p=>p.issued)){
   const row=incoming.get(old.id);if(row){need(row['物料编号']===old.materialId,'DAILY_REBASE_IDENTITY',old.id,'采购不得换物料');old.ordered=old.received+old.cancelled+Number(row['订购数量']);old.dueDate=dayDate(Number(row['约定到货日']));old.sourceRow=structuredClone(row);incoming.delete(old.id);}else old.cancelled=old.ordered-old.received;
  }
  for(const row of incoming.values()){const receipt=b.policies.purchaseReceipts[row['在途记录编号']];need(receipt,'DAILY_RECEIPT_POLICY',row['在途记录编号'],'新采购须显式收货策略');b.state.purchases.push({id:row['在途记录编号'],materialId:row['物料编号'],ordered:Number(row['订购数量']),received:0,cancelled:0,issued:true,status:'effective',dueDate:dayDate(Number(row['约定到货日'])),receipt,sourceRow:structuredClone(row)});}
 }
 if(changed('期初在制')||hash(base.mapping?.wip_remaining||[])!==hash(d.mapping?.wip_remaining||[])){
  const incoming=openingWip(d,b.policies,b.state.materials);
  for(const t of incoming){const old=b.state.tasks.find(x=>x.id===t.id);if(old){need(t.output===old.output&&hash(t.historicalConsumed)===hash(old.historicalConsumed),'DAILY_WIP_FACT_CONFLICT',t.id,'已执行累计账不得被输入覆盖');t.consumed=old.consumed;}b.state.tasks=b.state.tasks.filter(x=>x.id!==t.id);b.state.tasks.push(t);}
  for(const old of b.state.tasks.filter(t=>t.openingWip&&!incoming.some(x=>x.id===t.id)))need(old.output===old.limit,'DAILY_WIP_DELETE',old.id,'未完成在制不得静默删除');
 }
 reconcile(b);invalidate(b,['demand','inventory','production','replenishment']);b.sourceToken=sourceToken(d);rememberSource(b,d);return true;
}
