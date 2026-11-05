import {hash,rows} from './workbook-model.mjs';
import {supplyLots} from './workbook-supply.mjs';
import {urgentError} from './urgent-order-input.mjs';
import {boundary} from './workbook-minute.mjs';

const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const bad=message=>{throw urgentError('URGENT_TRACE_INVALID',message);};
export function validateTrace(value,p){
 if(!Array.isArray(value))bad('实际批次关系须为列表');const ids=new Set();
 for(const r of value){
  if(!r.id||ids.has(r.id)||!r.from||!r.to||r.from===r.to||!r.source||!r.unit||!['consume','transform','ship'].includes(r.kind))bad('实际记录须明确唯一编号、上下游批次、实耗/转化/发运、单位及原始来源');ids.add(r.id);
  if(![r.inputQuantity,r.outputQuantity,r.lossQuantity].every(finite)||r.inputQuantity<=0||Math.abs(r.inputQuantity-r.outputQuantity-r.lossQuantity)>1e-8)bad('实际转化须满足投入=产出+损耗，不能按BOM推定');
  if(!Number.isSafeInteger(r.minute)||r.minute>p.facts.observationMinute)bad('实际关系时刻须为不晚于观察点的日历分钟');
 }
 const outgoing=new Map();for(const r of value)outgoing.set(r.from,[...(outgoing.get(r.from)||[]),r.to]);
 const active=new Set(),done=new Set();function visit(id){if(active.has(id))bad('实际批次链不能循环');if(done.has(id))return;active.add(id);for(const to of outgoing.get(id)||[])visit(to);active.delete(id);done.add(id);}for(const id of outgoing.keys())visit(id);
 return structuredClone(value);
}

export function batchTrace(d,p,base){
 const edges=validateTrace(p.trace||[],p),nodes=new Map();
 const get=(id,unit)=>{if(!nodes.has(id))nodes.set(id,{id,unit,received:0,receivedKnown:false,used:0,shipped:0,loss:0,sources:[],relation:'actual'});const n=nodes.get(id);if(n.unit!==unit)bad('批次单位不一致，不能跨单位求和 '+id);return n;};
 for(const r of rows(d,'期初库存')){const n=get('inventory:'+r['库存批次编号'],r['数量单位']);n.received=Number(r['当前数量']);n.receivedKnown=true;n.reserved=Number(r['期初已占用量']||0);n.sources.push(r._source||{sheet:'期初库存',row:r._row,key:r['库存批次编号']});}
 // Task-level consumption is evidence only for the recorded allocation. No
 // output or shipment is inferred from a planned manufacturing/BOM edge.
 const claims=(p.facts.allocations||[]).filter(f=>f.kind==='consumed'&&f.quantity>0).map(f=>{const a=base.allocations[f.index];return a?{id:'fact:'+f.index,from:a.supplyId,to:a.consumer,inputQuantity:f.quantity,outputQuantity:f.quantity,lossQuantity:0,unit:a.unit||rows(d,'物料主数据').find(m=>m['物料编号']===a.materialId)?.['基础单位'],minute:f.feedMinute,kind:'consume',source:{allocationIndex:f.index,sourceHash:f.sourceHash,source:a.source}}:null;}).filter(Boolean);
 const all=[...claims,...edges];
 for(const e of all){const from=get(e.from,e.unit),to=get(e.to,e.unit);from.used+=e.inputQuantity;from.loss+=e.lossQuantity;to.received+=e.outputQuantity;to.receivedKnown=true;if(e.kind==='ship'){from.shipped+=e.outputQuantity;to.relation='shipped_pending_disposition';}from.sources.push(e.source);to.sources.push(e.source);}
 for(const n of nodes.values()){n.remaining=n.receivedKnown?n.received-n.used:null;if(n.remaining!==null&&n.remaining< -1e-8)bad('实耗/发运超过有证据的批次量 '+n.id);if(!n.receivedKnown)n.relation='关联未知';}
 const quality=p.workspace?.events.filter(e=>e.type==='quality'&&e.knownMinute<=p.facts.observationMinute)||[],affected=new Set(quality.map(e=>e.supplyId));let changed=true;
 while(changed){changed=false;for(const e of all)if(affected.has(e.from)&&!affected.has(e.to)){affected.add(e.to);changed=true;}}
 return {planId:p.id,baseRunId:p.headRunId,inputHash:p.inputHash,factsHash:hash(p.facts),traceHash:hash(p.trace||[]),policyHash:p.workspace?hash(p.workspace):null,nodes:[...nodes.values()].map(n=>({...n,affected:affected.has(n.id)})),edges:all,quality,unknown:quality.filter(e=>!all.some(a=>a.from===e.supplyId)).map(e=>({supplyId:e.supplyId,relation:'关联未知',message:'没有实际批次记录；BOM展示不能代替实耗证据'})),automaticRecall:false,automaticScrap:false};
}

export function replacementCheck(d,p,base,request){
 const {supplyId,quantity,allocationIndex}=request,a=base.allocations[allocationIndex],lot=supplyLots(d).find(l=>l.id===supplyId),f=p.facts.allocations?.find(f=>f.index===allocationIndex);
 if(!Number.isSafeInteger(allocationIndex)||!a||!lot||!finite(quantity)||quantity<=0)bad('替代须明确现有投料分配、实际备选批次和正数量');
 if(a.consumer===a.need)bad('成品交付不作为未投料替代，请选择实际工序投料分配');
 if(a.supplyId===supplyId||lot.material!==a.materialId||!lot.quality)bad('备选须为同物料不同的合格实际批次');
 const stock=rows(d,'期初库存').find(r=>'inventory:'+r['库存批次编号']===supplyId);if(!stock)bad('本次替代仅接受合格有效在库批次，不把在途或参考建议当实物');
 const observed=p.facts.observationMinute,feed=Math.max(observed,a.feedMinute),ready=lot.ready===null?null:Number(stock['放行日'])<=Number(stock['快照日'])&&Number(stock['快照日'])===0?1440:lot.ready*1440+boundary(d,'日粒度放行时点分钟',0,'CAL'),expiry=lot.expiry===null?null:lot.expiry*1440+boundary(d,'批次到期日内失效分钟',0);
 if(ready===null||expiry===null||feed<ready||feed>=expiry)bad('备选放行/效期不能覆盖实际投料时刻');
 if(batchTrace(d,p,base).nodes.some(n=>n.id===supplyId&&n.affected))bad('备选批次正处于质量扰动，不能挪用');
 const actual=(p.facts.allocations||[]).filter(x=>x.quantity>0&&base.allocations[x.index]?.supplyId===supplyId).reduce((n,x)=>n+x.quantity,0),reserved=(p.replacements||[]).filter(x=>x.supplyId===supplyId).reduce((n,x)=>n+x.quantity,0),available=Math.max(0,lot.quantity-lot.used-actual-reserved),unfed=Math.max(0,a.quantity-(f?.quantity||0)-(p.replacements||[]).filter(x=>x.allocationIndex===allocationIndex).reduce((n,x)=>n+x.quantity,0));
 if(quantity>available+1e-8||quantity>unfed+1e-8)throw urgentError('URGENT_REPLACEMENT_LIMIT','替代量超过合格未占用量或未投料量',{available,unfed,unit:lot.unit||a.unit,quantity});
 return {supplyId,allocationIndex,quantity,available,unfed,unit:a.unit,feedMinute:feed,allocation:{...structuredClone(a),supplyId,source:structuredClone(lot.source),quantity,feedMinute:feed,feedDay:Math.floor(feed/1440),urgentProtected:true,executionConsumed:false,protectionKind:'locked'},source:{originalSupplyId:a.supplyId,sourceHash:hash(a),inputHash:p.inputHash,factsHash:hash(p.facts)}};
}
