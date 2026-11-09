/** Read-only explanation from the constraints and unrounded solution already
 * used for this response. No second capacity model or scheduling calculation. */
export function capacityExplanation(model,result,req){
 const weights=req.mode==='fixed'?req.products.map(p=>p.share):result.total>0?result.quantities:null;
 const sum=weights?.reduce((a,b)=>a+b,0)||0;
 const resources=result.constraints.map(row=>{
  const costPerKg=sum>0?row.cost.reduce((s,c,i)=>s+c*weights[i]/sum,0):null;
  return {id:row.id,costPerKg,mixLimitKg:costPerKg>0?row.budget/costPerKg:null};
 });
 const equipmentGroups=(model.equipmentFacts||[]).map(group=>{
  const rows=result.constraints.filter(r=>r.kind==='equipment'&&r.source.key===group.id);
  const checks=rows.map(row=>({...resources.find(r=>r.id===row.id),kind:row.id.startsWith('equipment:')?'occupancy':row.id.startsWith('daily:')?'daily':'calendar',budget:row.budget,unit:row.unit,name:row.name,crewId:row.id.startsWith('calendar:')?row.terms[0]?.crewId:null}));
  const limits=checks.map(c=>c.mixLimitKg).filter(x=>x!==null);
  const operations=[...new Map(model.stages.filter(s=>s.group===group.id).map(s=>[s.materialId+'|'+s.routeId,{materialId:s.materialId,routeId:s.routeId,operation:s.operation,sourceRow:s.sourceRow,batchKg:s.batchKg,spanDays:s.spanDays,daysPerKg:s.daysPerKg}])).values()];
  return {...group,operations,checks,mixLimitKg:limits.length?Math.min(...limits):null};
 });
 const productIndex=new Map(req.products.map((p,i)=>[p.id,i]));
 const toolRows=result.constraints.filter(r=>r.kind==='tools'&&(r.id.startsWith('tools:')||r.id.startsWith('shared-tools:')));
 const toolGroups=toolRows.map(row=>{
  const shared=row.id.startsWith('shared-tools:'),types=[...new Set(row.terms.map(t=>t.toolType))];
  const facts=types.map(id=>model.toolFacts?.find(g=>g.id===id)).filter(Boolean);
  const members=[...new Map(facts.flatMap(g=>g.members).map(m=>[m.id,m])).values()];
  const checks=[row,...result.constraints.filter(r=>!shared&&r.id.startsWith('minimum-tools:')&&r.source.key===row.source.key)].map(r=>({...resources.find(x=>x.id===r.id),name:r.name,budget:r.budget,unit:r.unit,minimum:r.id.startsWith('minimum-tools:')}));
  const limits=checks.map(c=>c.mixLimitKg).filter(x=>x!==null);
  const operations=new Map();
  for(const term of row.terms){
   const key=term.materialId+'|'+term.routeId+'|'+term.toolType,index=productIndex.get(term.productId);
   let op=operations.get(key);if(!op){op={materialId:term.materialId,routeId:term.routeId,operation:term.operation,sourceRow:term.sourceRow,toolType:term.toolType,requireTools:term.requireTools,batchKg:term.batchKg,spanDays:term.spanDays,daysPerKg:term.daysPerKg,referenceDailyKg:term.referenceDailyKg,effectiveDailyKg:term.effectiveDailyKg,mixQuantityPerKg:sum>0?0:null,costPerKg:sum>0?0:null,used:0};operations.set(key,op);}
   if(sum>0){op.mixQuantityPerKg+=term.quantityPerKg*weights[index]/sum;op.costPerKg+=term.coefficient*weights[index]/sum;}
   op.used+=term.coefficient*result.quantities[index];
  }
  return {id:row.id,name:row.name,types,shared,members,enabledCount:members.filter(m=>m.enabled).length,
   extra:shared?0:facts[0]?.extra??0,factor:model.scenario.toolPct/100,
   availableCount:shared?null:facts[0]?.availableCount??null,
   availableDays:shared?members.reduce((s,m)=>s+m.availableDay,0):facts[0]?.availableDays??null,
   budget:row.budget,used:row.used,headroom:row.headroom,checks,operations:[...operations.values()],
   costPerKg:resources.find(r=>r.id===row.id)?.costPerKg??null,
   mixLimitKg:limits.length?Math.min(...limits):null,
   sharedConstraintIds:shared?[]:toolRows.filter(r=>r.id.startsWith('shared-tools:')&&r.terms.some(t=>types.includes(t.toolType))).map(r=>r.id)};
 });
 const toolStages=model.stages.filter(s=>s.requireTools>0);
 const crewGroups=(model.crewFacts||[]).map(fact=>{
  const row=result.constraints.find(r=>r.id==='crew:'+fact.id),resource=resources.find(r=>r.id===row.id);
  const checks=[row,...result.constraints.filter(r=>r.id.startsWith('minimum-crew:')&&r.source.key===fact.id)].map(r=>({...resources.find(x=>x.id===r.id),name:r.name,budget:r.budget,unit:r.unit,minimum:r.id.startsWith('minimum-crew:')}));
  const limits=checks.map(c=>c.mixLimitKg).filter(x=>x!==null),operations=new Map();
  for(const stage of model.stages.filter(s=>s.crewId===fact.id)){
   const key=stage.materialId+'|'+stage.routeId,index=productIndex.get(stage.productId),coefficient=stage.quantityPerKg*stage.daysPerKg*stage.requirePeople;
   let op=operations.get(key);if(!op){op={materialId:stage.materialId,routeId:stage.routeId,operation:stage.operation,sourceRow:stage.sourceRow,group:stage.group,requirePeople:stage.requirePeople,batchKg:stage.batchKg,spanDays:stage.spanDays,daysPerKg:stage.daysPerKg,referenceDailyKg:stage.referenceDailyKg,effectiveDailyKg:stage.effectiveDailyKg,calendarRatio:stage.calendarRatio,timeFactor:stage.timeFactor,speedFactor:stage.speedFactor,mixQuantityPerKg:sum>0?0:null,costPerKg:sum>0?0:null,used:0};operations.set(key,op);}
   if(sum>0){op.mixQuantityPerKg+=stage.quantityPerKg*weights[index]/sum;op.costPerKg+=coefficient*weights[index]/sum;}
   op.used+=coefficient*result.quantities[index];
  }
  return {...fact,constraintId:row.id,budget:row.budget,used:row.used,headroom:row.headroom,binding:row.binding,costPerKg:resource.costPerKg,
   mixLimitKg:limits.length?Math.min(...limits):null,checks,operations:[...operations.values()]};
 });
 return {
  globalBatchKg:Number.isFinite(model.globalBatchKg)?model.globalBatchKg:null,
  batchSource:req.scenario.batchKg===null?'source':'simulation',
  batchRangeKg:[Math.min(...model.stages.map(s=>s.batchKg)),Math.max(...model.stages.map(s=>s.batchKg))],
  materialCount:new Set(model.stages.map(s=>s.materialId)).size,
  equipmentGroupCount:new Set(model.stages.map(s=>s.group)).size,
  crewCount:new Set(model.stages.map(s=>s.crewId)).size,
  toolPoolCount:new Set(model.stages.filter(s=>s.requireTools>0).map(s=>s.toolType)).size,
  mix:req.products.map((p,i)=>({id:p.id,sharePct:sum>0?weights[i]/sum*100:null})),
  operationCount:new Set(model.stages.map(s=>s.materialId+'|'+s.routeId)).size,
  equipmentGroups,
  crewGroups,
  solutionKg:result.total,
  toolGroups,
  toolSolutionKg:result.total,
  toolOperationCount:new Set(toolStages.map(s=>s.materialId+'|'+s.routeId)).size,
  toolEntityCount:new Set((model.toolFacts||[]).flatMap(g=>g.members.map(m=>m.id))).size,
  resources
 };
}
