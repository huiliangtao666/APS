import {minuteMode,MINUTE_ORIGIN,MINUTE_ENGINE,minuteResourceCandidate,wipOccupations,boundary,minuteTime} from './workbook-minute.mjs';
import {verifyMinutePlan} from './workbook-minute-verify.mjs';
import {selectionDataset} from './workbook-selection.mjs';
import {effectiveParameters,parameterDayRatio} from './parameter-contract.mjs';
import {supplyReadiness,supplyLots} from './workbook-supply.mjs';
import {rows,index,dayMinute,procurement,refreshDerived,PROFILE,hash} from './workbook-model.mjs';
import {quantityMath as Q} from '../src/lib/material-allocation.mjs';
const exact=v=>Q.exact(Q.q(String(v))),number=e=>Q.num(Q.fromExact(e));
const overlap=(a,b)=>a.start<b.end&&b.start<a.end;
export function workbookNeed(b,target) {let v=Q.div(Q.mul(Q.q(String(b['子项基准用量'])),Q.q(String(target))),Q.q(String(b['父项基准产出千克'])));if(b['数量单位']==='个')v=Q.ceil(v);return Q.exact(v);}
export function calculateWorkbook(data,selection) {
 const resolved=refreshDerived(structuredClone(data),selection.startDay??1),sourceIdentity={mappingHash:hash(data.mapping),parameterHash:hash(rows(data,'配置参数'))},d=selectionDataset(resolved,selection),ready=supplyReadiness(d);if(!ready.ready)throw Error('数据尚未就绪：'+ready.issues.map(i=>i.code+':'+i.message).join('；'));
 const current=selection.currentDay??1,start=selection.startDay??current,end=selection.endDay??start+14,isMinute=minuteMode(d),currentMinute=selection.currentMinute??current*1440;
 if(![current,start,end].every(Number.isInteger)||current<0||start<current||end<=start||end>44)throw Error('日窗口无效');
 const mats=index(d,'物料主数据','物料编号'),customers=index(d,'客户与交付','客户编号'),calendar=index(d,'工厂日历','日序');
 const routes=[...rows(d,'工艺路线'),...d.mapping.sfRoutes],resources=rows(d,'设备与工装').map(r=>({...r}));
 for(const r of d.mapping.resources||[])if(!resources.some(s=>s['资源编号']===r.id))resources.push({'资源编号':r.id,'资源类别':r.kind,'资源组编号':r.group,'可用数量':r.units,'单次批量上限千克':r.batch_kg,'标准日产能千克':r.daily_kg,'同时占位上限千克':r.occupancy_kg||''});
 const standardBatch=d.parameterContract?Number(effectiveParameters(d,start,d.parameterContext?.scope).find(p=>p['对象编号']==='GLOBAL'&&p['参数名称']==='标准生产批量千克')?.['参数值']??Infinity):Infinity;
 const tasks=[],allocations=[],shortages=[],suggestions=[],findings=[],occupancy=[],daily=new Map(),lots=[];let serial=0;
 const activeStops=rows(d,'停机安排').filter(r=>Number(r['可知日'])<=current);
 lots.push(...supplyLots(d));
 if(isMinute)for(const l of lots){const r=rows(d,l.source.sheet).find(r=>r._row===l.source.row);l.ready=l.ready===null?null:(l.id.startsWith('inventory:')&&Number(r?.['放行日'])<=Number(r?.['快照日'])&&Number(r?.['快照日'])===0?1440:l.ready*1440+boundary(d,'日粒度放行时点分钟',start,'CAL'))/1440;l.expiry=(l.expiry*1440+boundary(d,'批次到期日内失效分钟',start))/1440;if(l.id.startsWith('transit:')){const supplier=rows(d,'供应商与供货条件').find(x=>x['供货关系编号']===r?.['供货关系编号']);l.ready=Math.max(l.ready,(Number(r?.['约定到货日'])*1440+boundary(d,'日粒度到货时点分钟',start,'CAL')+Number(supplier?.['检验天数'])*1440)/1440);}}
 // Reserve every relevant already-started physical occupation before planning
 // any remaining WIP. A failed continuation cannot release historical locks.
 if(isMinute)occupancy.push(...wipOccupations(d,start*1440,end*1440).map(o=>({...o,start:o.start/1440,end:o.end/1440})));
 for(const w of !isMinute&&d.parameterPrecedence?d.mapping.wip_remaining||[]:[]){const startAt=Math.max(start,w.current_occupancy_day_interval[0]),endAt=w.current_occupancy_day_interval[1];if(endAt>startAt)occupancy.push({start:startAt,end:endAt,resource:w.resource,crew:w.remaining_labor_pool,people:Number(w.remaining_labor_count),tools:(d.mapping.tool_pools[w.remaining_tool_type]||[]).slice(0,Number(w.remaining_tool_count)),taskId:w.id});}

 function qualifiedLots(id,day,need,consumer){const demand=consumer===need?rows(d,'每日需求').find(r=>r['需求编号']===need&&r['成品编号']===id):null,customer=demand?customers.get(demand['客户编号']):null,minExpiry=demand?day+Number(customer['运输天数'])+Number(demand['到货剩余保质天数']):day;return lots.filter(l=>l.material===id&&l.quality&&l.ready!==null&&l.ready<=day&&day<l.expiry&&l.expiry>=minExpiry).sort((a,b)=>a.expiry-b.expiry||a.id.localeCompare(b.id));}
 function allocate(id,qty,day,need,kind,consumer=need){let left=qty;for(const l of qualifiedLots(id,day,need,consumer)){const take=Math.min(left,Math.max(0,l.quantity-l.used));if(take<=0)continue;l.used+=take;left-=take;allocations.push({need,materialId:id,supplyId:l.id,quantity:take,exactQuantity:exact(take),feedDay:day,conditional:l.conditional,kind,consumer,source:l.source});if(left<1e-9)return 0;}return Math.max(0,left);}
 function miss(id,qty,day,need){if(qty<1e-9)return;const m=mats.get(id);const shortage={id:'SHORT-'+(++serial),materialId:id,quantity:qty,unit:m['基础单位'],needDay:day,need,source:m._cells?{sheet:'物料主数据',row:m._row}:null};shortages.push(shortage);
  if(m['物料来源']!=='制造'){const suppliers=rows(d,'供应商与供货条件').filter(r=>r['物料编号']===id).sort((a,b)=>Number(a['采购优先级'])-Number(b['采购优先级']));if(suppliers[0]){const s=suppliers[0];suggestions.push({...shortage,netGap:qty,...procurement(qty,s,day,current),supplierId:s['供应商编号'],relationId:s['供货关系编号'],status:'reference',sourceVersion:d.version});}}
 }
 function resourceJobs(route,qty,earliest,previous,need,productId,productionId){
  const candidates=resources.filter(r=>r['资源类别']==='设备'&&r['资源组编号']===route['设备组编号']&&(!d.parameterContract||r['可用数量']===undefined||Number(r['可用数量'])>0));
  const crew=rows(d,'班组资源').find(r=>r['班组编号']===route['班组编号']),people=Number(route['需求人数']),toolCount=Number(route['每批工装套数']),pool=(d.mapping.tool_pools[route['所需工装类型']]||[]).filter(id=>!d.parameterContract||Number(resources.find(r=>r['资源编号']===id)?.['可用数量'])>0);
  if(!candidates.length||!crew||people>Number(crew['每班可用人数'])||toolCount>pool.length)return null;
  let left=qty,cursor=earliest,last=previous,firstStart;
  while(left>1e-9){let chosen;
   if(isMinute)chosen=minuteResourceCandidate({d,route,quantity:left,earliest:cursor,end,occupancy,daily,resources,crew,pool,standardBatch,currentMinute});
   for(let day=Math.max(start,Math.floor(cursor));!isMinute&&day<end&&!chosen;day++){
    const c=calendar.get(String(day));if(!c)continue;const ratio=parameterDayRatio(d,c,crew,day);if(ratio<=0)continue;
    for(const r of candidates){const id=r['资源编号'];if(activeStops.some(s=>s['资源编号']===id&&Number(s['开始日'])<=day&&day<Number(s['结束日'])))continue;
     const toolCaps=pool.map(t=>Number(resources.find(x=>x['资源编号']===t)?.['单次批量上限千克'])).filter(n=>n>0).sort((a,b)=>b-a);const toolLimit=d.parameterContract&&toolCount&&toolCaps.length===pool.length?toolCaps.slice(0,toolCount).reduce((n,c)=>n+c,0):Infinity;
     const capacity=Number(r['标准日产能千克'])*ratio,key=id+'|'+day,available=capacity-(daily.get(key)||0),batch=Math.min(left,Number(r['单次批量上限千克']),available,Number(r['同时占位上限千克'])||Infinity,toolLimit,standardBatch);if(!(batch>0)||!(capacity>0))continue;
     const span=Number(route['跨日历时天数']),duration=span>0?span:Math.max(1/1440,Math.ceil(batch/capacity*1440)/1440);
     let at=Math.max(day,cursor);const relevant=occupancy.filter(x=>x.end>at);
     const points=[at,...relevant.map(o=>o.end).filter(t=>t>=at&&t<day+1)].sort((a,b)=>a-b);
     for(at of points){const until=at+duration;if((span===0&&until>day+1+1e-9)||until>end)continue;
      const job={start:at,end:until};if(activeStops.some(s=>s['资源编号']===id&&overlap(job,{start:Number(s['开始日']),end:Number(s['结束日'])})))continue;
      if(span>0&&Array.from({length:Math.ceil(until)-Math.floor(at)},(_,i)=>calendar.get(String(Math.floor(at)+i))).some(c=>!c||Number(c['生产班次数'])<=0))continue;
      const conflict=relevant.filter(o=>overlap(o,job));if(conflict.some(o=>o.resource===id))continue;
      const times=[at,...conflict.map(o=>o.start).filter(t=>t>=at&&t<until)];if(times.some(t=>people+conflict.filter(o=>o.crew===crew['班组编号']&&o.start<=t&&t<o.end).reduce((n,o)=>n+o.people,0)>Number(crew['每班可用人数'])))continue;
      const tools=pool.filter(t=>!conflict.some(o=>o.tools.includes(t))&&(!d.parameterContract||!Number(resources.find(x=>x['资源编号']===t)?.['单次批量上限千克'])||batch<=Number(resources.find(x=>x['资源编号']===t)['单次批量上限千克'])*toolCount)).slice(0,toolCount);if(tools.length<toolCount)continue;
      chosen={...job,resource:id,crew:crew['班组编号'],people,tools,quantity:batch,key,route};break;
     }if(chosen)break;
    }
   }
   if(!chosen)return null;
   const task={id:'DAY-T'+(++serial),orderId:need,productId,productionId,operation:route['工序编号'],routeStepId:route['路线工序编号'],label:route['工序名称'],machine:chosen.resource,resource:chosen.resource,start:chosen.start,end:chosen.end,startMinute:isMinute?Math.round(chosen.start*1440):dayMinute(chosen.start),endMinute:isMinute?Math.round(chosen.end*1440):dayMinute(chosen.end),duration:chosen.end-chosen.start,predecessor:last||'',quantity:chosen.quantity,crew:chosen.crew,people:chosen.people,tools:chosen.tools,...(isMinute?{laborIntervals:chosen.labor,toolEndMinute:chosen.toolEnd,cleaning:chosen.cleaning,physicalStatus:'未提供',durationMinutes:Math.round((chosen.end-chosen.start)*1440)}:{}),source:{sheet:route._row?'工艺路线':'仿真补充路线',row:route._row||null,mappingVersion:d.mapping.version}};
   firstStart??=chosen.start;tasks.push(task);if(chosen.cleaning)occupancy.push({...chosen.cleaning,start:chosen.cleaning.start/1440,end:chosen.cleaning.end/1440,tools:[],labor:[{start:chosen.cleaning.start,end:chosen.cleaning.end}],taskId:task.id+'-CLEAN'});occupancy.push({...chosen,taskId:task.id});daily.set(chosen.key,(daily.get(chosen.key)||0)+chosen.quantity);left-=chosen.quantity;cursor=chosen.end;last=task.id;
  }return {start:firstStart,end:cursor,last};
 }
 function produce(id,qty,needDay,need,depth=0,consumer=need){if(depth>mats.size)throw Error('BOM循环');const m=mats.get(id);const callId='MAKE-'+(++serial);let supplyDay=needDay;
  if(m['物料来源']!=='制造'){
   const candidates=[Math.max(start,needDay),...lots.filter(l=>l.material===id&&l.quality).map(l=>Math.max(start,needDay,l.ready??Infinity))].filter(day=>day<end).sort((a,b)=>a-b);
   supplyDay=candidates.find(day=>qualifiedLots(id,day,need,consumer).reduce((n,l)=>n+Math.max(0,l.quantity-l.used),0)>=qty-1e-9)??needDay;
  }
  const remaining=allocate(id,qty,supplyDay,need,'需求',consumer);if(remaining<1e-9)return {ok:true,ready:Math.max(start,supplyDay),task:''};
  if(m['物料来源']!=='制造'){miss(id,remaining,needDay,need);return {ok:false};}
  const rs=routes.filter(r=>r['成品编号']===id).sort((a,b)=>Number(a['工序顺序'])-Number(b['工序顺序']));let at=start,prev='',okay=true;
  for(const route of rs){const feedConsumer=callId+'|'+route['路线工序编号'];const feed=rows(d,'物料清单').filter(b=>b['父项编号']===id&&Number(b['生效日'])<=Math.floor(at)&&Math.floor(at)<Number(b['失效日'])&&d.mapping.feed_mappings.some(f=>f.bom_id===b['用量关系编号']&&f.route_step_id===route['路线工序编号']));
   for(const b of feed){const n=number(workbookNeed(b,remaining)),child=produce(b['子项编号'],n,isMinute?at:Math.floor(at),need,depth+1,feedConsumer);if(!child.ok)okay=false;else at=Math.max(at,child.ready);}
   if(!okay)break;const job=resourceJobs(route,remaining,at+(prev?Number(route['最小等待天数']||0):0),prev,need,id,callId);if(!job){findings.push({code:'FINITE_CAPACITY',message:'有限资源/日容量/窗口不能安排 '+id+' '+route['工序名称'],need,routeStepId:route['路线工序编号'],sheet:'工艺路线',row:route._row,field:'设备组编号',cell:route._cells?.['设备组编号']||''});okay=false;break;}if(prev&&(d.parameterContract?(job.start-at)>(isMinute?Number(route['最大等待分钟'])/1440:Number(route['最大等待天数']))+1e-9:Math.floor(job.start)-Math.floor(at)>Number(route['最大等待天数']))){okay=false;findings.push({code:'MAX_WAIT',message:'前序完成后的等待超过配置上限，候选已撤销',need,sheet:'工艺路线',row:route._row,field:'最大等待天数',cell:route._cells?.['最大等待天数']});break;}const consumption=allocations.filter(a=>a.consumer===feedConsumer);for(const a of consumption){const supply=lots.find(l=>l.id===a.supplyId);if(supply&&(!(supply.ready<=(isMinute?job.start:Math.floor(job.start)))||!((isMinute?job.start:Math.floor(job.start))<supply.expiry))){okay=false;findings.push({code:'MATERIAL_AT_ACTUAL_FEED',message:'实际投料日的供给资格/效期不成立，候选已撤销',need,sheet:'物料清单',field:'投料位置'});}a.feedDay=isMinute?Math.floor(job.start):job.start;if(isMinute)a.feedMinute=Math.round(job.start*1440);a.taskId=tasks.find(t=>t.routeStepId===route['路线工序编号']&&t.start===job.start&&t.orderId===need)?.id;}if(!okay)break;at=job.end;prev=job.last;
  }
  if(!okay)return {ok:false};allocations.push({need,materialId:id,supplyId:'production:'+callId,quantity:remaining,exactQuantity:exact(remaining),feedDay:isMinute?Math.floor(at):Math.ceil(at),...(isMinute?{feedMinute:Math.round(at*1440)}:{}),conditional:true,kind:'本次制造产出',consumer,source:{taskId:prev,productId:id,productionId:callId}});return {ok:true,ready:at,task:prev};
 }
 // WIP is conditional and has its own remaining operations/materials. Never reissue historical ingredients.
 for(const w of d.mapping.wip_remaining){const beforeTasks=tasks.length,beforeAlloc=allocations.length,beforeOcc=occupancy.length,beforeLots=lots.map(l=>l.used),beforeDaily=new Map(daily);const record=rows(d,'期初在制').find(r=>r['在制批次编号']===w.id);if(!record)continue;
  if(!isMinute&&!d.parameterPrecedence){const occupied={start:Math.max(start,w.current_occupancy_day_interval[0]),end:w.current_occupancy_day_interval[1]};if(occupied.end>occupied.start)occupancy.push({...occupied,resource:w.resource,crew:w.remaining_labor_pool,people:Number(w.remaining_labor_count),tools:(d.mapping.tool_pools[w.remaining_tool_type]||[]).slice(0,Number(w.remaining_tool_count)),taskId:w.id});}
  const qty=Number(record['预计合格产出']);let okay=true,at=isMinute?Math.max(start,w.current_occupancy_minute_interval[1]/1440):Math.max(start,Number(record['预计完工日'])),last='';
  for(const rid of w.remaining_route_steps.filter(rid=>!isMinute||rid!==w.current_route_step)){const route=routes.find(r=>r['路线工序编号']===rid);if(!route){okay=false;break;}
   const feedStart=allocations.length;
   for(const bid of w.remaining_material_bom_ids.filter(id=>d.mapping.feed_mappings.some(f=>f.bom_id===id&&f.route_step_id===rid))){const b=rows(d,'物料清单').find(b=>b['用量关系编号']===bid),amount=number(workbookNeed(b,qty)),from=allocations.length,left=allocate(b['子项编号'],amount,isMinute?at:Math.floor(at),w.id,'WIP剩余待投');for(const a of allocations.slice(from))a.bomId=bid;if(left>1e-9){okay=false;miss(b['子项编号'],left,Math.floor(at),w.id);}}
   if(!okay)break;const job=resourceJobs(route,qty,at,last,w.id,w.product,w.id);if(!job){okay=false;break;}
   for(const a of allocations.slice(feedStart)){const l=lots.find(l=>l.id===a.supplyId);a.feedDay=isMinute?Math.floor(job.start):job.start;if(isMinute)a.feedMinute=Math.round(job.start*1440);a.taskId=tasks.find(t=>t.productionId===w.id&&t.routeStepId===rid)?.id;if(!l||l.ready>(isMinute?job.start:Math.floor(job.start))||(isMinute?job.start:Math.floor(job.start))>=l.expiry)okay=false;}
   if(!okay)break;at=job.end;last=job.last;
  }
  if(okay)lots.push({id:'wip:'+w.id,material:w.product,quantity:qty,used:0,ready:isMinute?Math.max(at,w.releaseMinute/1440):Math.max(Math.ceil(at),Number(record['预计放行日'])),expiry:(isMinute?at:Math.ceil(at))+Number(mats.get(w.product)['保质天数']),quality:true,conditional:true,source:{sheet:'期初在制',row:record._row,remainingMapping:d.mapping.version}});
  else {tasks.length=beforeTasks;allocations.length=beforeAlloc;occupancy.length=beforeOcc;lots.forEach((l,i)=>l.used=beforeLots[i]);daily.clear();for(const [k,v]of beforeDaily)daily.set(k,v);findings.push({code:'WIP_REMAINING',message:'在制剩余资源或待投物料无法满足，未计入供给',need:w.id,sheet:'期初在制',row:record._row,field:'预计完工日'});}
 }
 const demands=rows(d,'每日需求').filter(r=>Number(r['需求日'])>=start&&Number(r['需求日'])<end&&(!selection.demandIds||selection.demandIds.includes(r['需求编号']))),results=[];
 for(const r of demands){const beforeTasks=tasks.length,beforeAlloc=allocations.length,beforeOcc=occupancy.length,beforeLots=lots.map(l=>l.used),beforeDaily=new Map(daily);
  const qty=Number(r['需求千克']),c=customers.get(r['客户编号']),target=Number(r['按要求日最晚发运日']),earliest=Number(r['最早到货日'])-Number(c['运输天数']);
  const need=r['需求编号'],result=produce(r['成品编号'],qty,Math.max(start,target),need);
  if(result.ok&&tasks.slice(beforeTasks).some(t=>t.productId===r['成品编号'])&&Math.max(earliest,result.ready)+Number(c['运输天数'])+Number(r['到货剩余保质天数'])>result.ready+Number(mats.get(r['成品编号'])['保质天数'])){result.ok=false;findings.push({code:'DELIVERY_SHELF',message:'到货剩余保质期不足，候选已撤销',need,sheet:'每日需求',row:r._row,field:'到货剩余保质天数'});}if(!result.ok){tasks.length=beforeTasks;allocations.length=beforeAlloc;occupancy.length=beforeOcc;lots.forEach((l,i)=>l.used=beforeLots[i]);daily.clear();for(const [k,v]of beforeDaily)daily.set(k,v);}
  const readyDay=result.ok?Math.max(earliest,result.ready):null;
  const arrival=result.ok?(isMinute?Math.floor(Math.max(earliest+boundary(d,'最早交付日内时点分钟',start)/1440,result.ready)):Math.ceil(readyDay))+Number(c['运输天数']):null;
  results.push({id:need,productId:r['成品编号'],quantity:qty,unit:'千克',status:result.ok?'scheduled':'unplanned',readyDay,arrivalDay:arrival,latestArrivalDay:Number(r['最晚到货日']),lateDays:result.ok?Math.max(0,arrival-Number(r['最晚到货日'])):null,source:{sheet:'每日需求',row:r._row,cell:r._cells?.['需求箱数']}});
 }
 const plan={profile:PROFILE,timeUnit:isMinute?'minute':'day',dayZero:'2026-10-31',minuteOrigin:isMinute?MINUTE_ORIGIN:'2026-11-02T08:00:00+08:00',conditions:{...selection,startDay:start,endDay:end,currentDay:current,interval:'[start,end)'},tasks,findings,allocations,shortages,suggestions,demandResults:results,demandSummary:{records:demands.length,totalKg:results.reduce((n,r)=>n+r.quantity,0),scheduled:results.filter(r=>r.status==='scheduled').length,unplanned:results.filter(r=>r.status==='unplanned').length},source:{datasetId:d.id,version:d.version,fileHash:d.fileHash,mappingHash:sourceIdentity.mappingHash,parameterHash:sourceIdentity.parameterHash,profile:PROFILE},checkScope:ready.supported,status:results.some(r=>r.status==='unplanned')?'partial':'completed'};
 if(isMinute){plan.engineIdentity=MINUTE_ENGINE;plan.datasetVersion=d.datasetVersion;plan.timezone=d.timezone;plan.occupations=occupancy.map(o=>({...o,start:Math.round(o.start*1440),end:Math.round(o.end*1440),route:undefined}));for(const t of tasks){t.start=t.startMinute;t.end=t.endMinute;t.duration=t.durationMinutes;t.startTime=minuteTime(t.start);t.endTime=minuteTime(t.end);}for(const a of allocations){a.feedMinute??=Math.round(a.feedDay*1440);a.feedDay=Math.floor(a.feedMinute/1440);}}
 plan.verification=verifyWorkbookPlan(d,plan);return plan;
}
export function verifyWorkbookPlan(d,plan) {
 if(plan.timeUnit==='minute')return verifyMinutePlan(d,plan);
 d=selectionDataset(d,plan.conditions);
 const issues=[],tasks=plan.tasks||[],resources=index(d,'设备与工装','资源编号'),crews=index(d,'班组资源','班组编号'),capacity=new Map(),calendar=index(d,'工厂日历','日序');
 for(const r of d.mapping?.resources||[])if(!resources.has(r.id))resources.set(r.id,{'标准日产能千克':r.daily_kg,'单次批量上限千克':r.batch_kg});
 for(let i=0;i<tasks.length;i++){const t=tasks[i],r=resources.get(t.machine);if(!(t.end>t.start)||!r)issues.push('无效占用 '+t.id);if(t.quantity>Number(r?.['单次批量上限千克']))issues.push('超单批 '+t.id);if(tasks.slice(0,i).some(o=>o.machine===t.machine&&overlap(o,t)))issues.push('设备重叠 '+t.id);
  const previous=tasks.find(o=>o.id===t.predecessor);if(previous&&previous.end>t.start+1e-9)issues.push('前序未完成 '+t.id);
  const k=t.machine+'|'+Math.floor(t.start);capacity.set(k,(capacity.get(k)||0)+t.quantity);
  const crew=crews.get(t.crew);if(d.parameterContract&&crew){const day=Math.floor(t.start),ratio=parameterDayRatio(d,calendar.get(String(day)),crew,day),used=tasks.filter(o=>o.machine===t.machine&&o.crew===t.crew&&Math.floor(o.start)===day).reduce((n,o)=>n+o.quantity,0);if(!(ratio>0)||used>Number(r?.['标准日产能千克'])*ratio+1e-7)issues.push('工厂/班组日历容量超限 '+t.id);}
  for(const point of [t.start,...tasks.filter(o=>o.crew===t.crew&&overlap(o,t)).map(o=>o.start).filter(n=>n>=t.start&&n<t.end)])if(tasks.filter(o=>o.crew===t.crew&&o.start<=point&&point<o.end).reduce((n,o)=>n+o.people,0)>Number(crew?.['每班可用人数']))issues.push('人员超占 '+t.id);
  if(d.parameterContract&&(r?.['可用数量']!==undefined&&!(Number(r['可用数量'])>0)||t.tools?.some(id=>!(Number(resources.get(id)?.['可用数量'])>0))))issues.push('已采用资源数量为零或未知 '+t.id);
  if(d.parameterContract&&t.tools?.some(id=>{const cap=Number(resources.get(id)?.['单次批量上限千克']);return cap>0&&t.quantity>cap*t.tools.length+1e-9;}))issues.push('工装批容量超限 '+t.id);
  if(tasks.some(o=>o!==t&&overlap(o,t)&&o.tools.some(tool=>t.tools.includes(tool))))issues.push('工装重叠 '+t.id);
  if(rows(d,'停机安排').some(s=>Number(s['可知日'])<=plan.conditions.currentDay&&s['资源编号']===t.machine&&overlap(t,{start:Number(s['开始日']),end:Number(s['结束日'])})))issues.push('停机占用 '+t.id);
 }
 for(const [k,used]of capacity){const [id,day]=k.split('|'),c=calendar.get(day),r=resources.get(id);if(used>Number(r['标准日产能千克'])*Number(d.parameterContract?c['生产班次数']:c['日产能分子'])/Number(c['日产能分母'])+1e-7)issues.push('超日产能 '+k);}
 const ids=new Set();for(const r of plan.demandResults||[]){if(ids.has(r.id))issues.push('重复需求 '+r.id);ids.add(r.id);}
 const selected=rows(d,'每日需求').filter(r=>Number(r['需求日'])>=plan.conditions.startDay&&Number(r['需求日'])<plan.conditions.endDay&&(!plan.conditions.demandIds||plan.conditions.demandIds.includes(r['需求编号'])));if(!selected.length||selected.length!==ids.size||selected.some(r=>!ids.has(r['需求编号'])))issues.push('需求覆盖不守恒');
 for(const r of plan.demandResults||[]){const source=selected.find(s=>s['需求编号']===r.id);if(!source||r.productId!==source['成品编号']||r.unit!=='千克'||!Number.isFinite(r.quantity)||r.quantity!==Number(source['需求千克'])||!['scheduled','unplanned'].includes(r.status))issues.push('需求身份/数量/状态不符 '+r.id);}
 const summary=plan.demandSummary,scheduled=(plan.demandResults||[]).filter(r=>r.status==='scheduled').length;
 if(!summary||summary.records!==selected.length||summary.totalKg!==selected.reduce((n,r)=>n+Number(r['需求千克']),0)||summary.scheduled!==scheduled||summary.unplanned!==selected.length-scheduled)issues.push('需求汇总与冻结源不符');
 if(plan.timeUnit!=='day'||plan.dayZero!=='2026-10-31'||plan.minuteOrigin!=='2026-11-02T08:00:00+08:00')issues.push('时间单位或原点不符');
 for(const t of tasks)if(![t.start,t.end,t.quantity,t.people].every(Number.isFinite)||!(t.quantity>0)||!(t.people>0)||!crews.has(t.crew)||!Array.isArray(t.tools)||new Set(t.tools).size!==t.tools.length||t.start<plan.conditions.startDay||t.end>plan.conditions.endDay||t.startMinute!==dayMinute(t.start)||t.endMinute!==dayMinute(t.end))issues.push('任务数量/资源/时间单位不符 '+t.id);
 // Independent check includes locked WIP occupations even if no continuation
 // task was feasible. These are original physical reservations, not new supply.
 const locks=(d.parameterPrecedence?d.mapping.wip_remaining||[]:[]).map(w=>({id:w.id,start:Math.max(plan.conditions.startDay,w.current_occupancy_day_interval[0]),end:w.current_occupancy_day_interval[1],resource:w.resource,crew:w.remaining_labor_pool,people:Number(w.remaining_labor_count),tools:(d.mapping.tool_pools[w.remaining_tool_type]||[]).slice(0,Number(w.remaining_tool_count))})).filter(w=>w.end>w.start);
 for(const t of tasks){const shared=locks.filter(w=>w.id!==t.productionId&&overlap(t,w));if(shared.some(w=>w.resource===t.machine||w.tools.some(id=>t.tools.includes(id))))issues.push('已执行WIP物理锁定冲突 '+t.id);const points=[t.start,...shared.map(w=>w.start).filter(x=>t.start<=x&&x<t.end)];for(const at of points){const used=tasks.filter(x=>x.crew===t.crew&&x.start<=at&&at<x.end).reduce((n,x)=>n+x.people,0)+locks.filter(w=>w.crew===t.crew&&w.start<=at&&at<w.end&&w.id!==t.productionId).reduce((n,w)=>n+w.people,0);if(used>Number(crews.get(t.crew)?.['每班可用人数']))issues.push('已执行WIP人员锁定超占 '+t.id);}}
 const usage=new Map();for(const a of plan.allocations||[]){const total=(usage.get(a.supplyId)||0)+a.quantity;usage.set(a.supplyId,total);if(!(a.quantity>=0)||!Number.isFinite(a.quantity))issues.push('无效物料数量 '+a.supplyId);
  const [kind,id]=a.supplyId.split(':');let capacity,ready,expiry,quality=true;
  if(kind==='inventory'){const lot=rows(d,'期初库存').find(r=>r['库存批次编号']===id);if(!lot){issues.push('不存在的库存身份 '+id);continue;}if(a.materialId!==lot['物料编号'])issues.push('库存物料身份不符 '+id);capacity=Number(lot['当前数量'])-Number(lot['期初已占用量']);ready=Number(lot['放行日']);expiry=Number(lot['到期日']);quality=['已放行','合格'].includes(lot['质量状态']);}
  else if(kind==='transit'){const lot=rows(d,'既有采购在途').find(r=>r['在途记录编号']===id);if(!lot){issues.push('不存在的在途身份 '+id);continue;}if(a.materialId!==lot['物料编号'])issues.push('在途物料身份不符 '+id);const s=rows(d,'供应商与供货条件').find(s=>s['供货关系编号']===lot['供货关系编号']);capacity=Number(lot['订购数量']);ready=Math.max(Number(lot['预计放行日']),Number(lot['约定到货日'])+Number(s['检验天数']));expiry=Number(lot['预计到期日']);quality=!['作废','取消','冻结','待检'].includes(lot['在途状态']);if(!a.conditional)issues.push('在途冒充实物 '+id);}
  else if(kind==='draft'){const lot=(d.drafts||[]).find(r=>r.id===id);if(!lot||lot.status!=='adopted'){issues.push('未采用草稿供给 '+id);continue;}if(a.materialId!==lot.materialId)issues.push('草稿物料身份不符 '+id);capacity=lot.quantity;ready=lot.availableDay;expiry=lot.expiryDay;if(!a.conditional)issues.push('草稿冒充实物 '+id);}
  else if(kind==='production'){const final=tasks.find(t=>t.id===a.source.taskId);if(!final||final.productId!==a.materialId){issues.push('制造来源不存在 '+id);continue;}const outputs=tasks.filter(t=>t.productionId===final.productionId&&t.routeStepId===final.routeStepId);capacity=outputs.reduce((n,t)=>n+t.quantity,0);ready=Math.max(...outputs.map(t=>t.end));expiry=ready+Number(rows(d,'物料主数据').find(m=>m['物料编号']===a.materialId)['保质天数']);}
  else if(kind==='wip'){if(!a.conditional)issues.push('WIP冒充实物 '+id);const w=rows(d,'期初在制').find(w=>w['在制批次编号']===id),mapping=d.mapping.wip_remaining.find(w=>w.id===id);if(!w||!mapping||!mapping.remaining_route_steps.every(rid=>tasks.some(t=>t.orderId===id&&t.routeStepId===rid))){issues.push('WIP未完成剩余工序 '+id);continue;}if(a.materialId!==w['成品编号'])issues.push('WIP物料身份不符 '+id);capacity=Number(w['预计合格产出']);ready=Math.max(Number(w['预计放行日']),...tasks.filter(t=>t.orderId===id).map(t=>Math.ceil(t.end)));expiry=Math.max(...tasks.filter(t=>t.orderId===id).map(t=>Math.ceil(t.end)))+Number(rows(d,'物料主数据').find(m=>m['物料编号']===a.materialId)['保质天数']);}
  else {issues.push('未知供给身份 '+a.supplyId);continue;}
  if(!quality||!(ready<=a.feedDay+1e-8)||!(a.feedDay<expiry)||total>capacity+1e-6)issues.push('供给资格/余额错误 '+a.supplyId);
 }
 for(const w of d.mapping.wip_remaining||[]){const source=rows(d,'期初在制').find(r=>r['在制批次编号']===w.id);if(!source||!tasks.some(t=>t.productionId===w.id))continue;
  for(const bid of w.remaining_material_bom_ids){const b=rows(d,'物料清单').find(b=>b['用量关系编号']===bid);if(!b){issues.push('WIP待投来源缺失 '+w.id);continue;}const expected=number(workbookNeed(b,Number(source['预计合格产出']))),actual=(plan.allocations||[]).filter(a=>a.consumer===w.id&&(a.bomId?a.bomId===bid:a.materialId===b['子项编号'])&&a.kind==='WIP剩余待投').reduce((n,a)=>n+a.quantity,0);if(Math.abs(expected-actual)>1e-6)issues.push('WIP待投数量不守恒 '+w.id+'/'+bid);}
 }
 const groups=new Map();for(const t of tasks){const key=t.productionId+'|'+t.routeStepId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
 for(const [consumer,group]of groups){const first=group[0];if(d.mapping.wip_remaining.some(w=>w.id===first.productionId))continue;const qty=group.reduce((n,t)=>n+t.quantity,0),day=Math.floor(Math.min(...group.map(t=>t.start)));
  for(const f of d.mapping.feed_mappings.filter(f=>f.route_step_id===first.routeStepId)){const b=rows(d,'物料清单').find(b=>b['用量关系编号']===f.bom_id);if(!b||!(Number(b['生效日'])<=day&&day<Number(b['失效日'])))continue;const expected=Number(b['子项基准用量'])*qty/Number(b['父项基准产出千克']),need=b['数量单位']==='个'?Math.ceil(expected):expected,actual=(plan.allocations||[]).filter(a=>a.consumer===consumer&&a.materialId===b['子项编号']).reduce((n,a)=>n+a.quantity,0);if(Math.abs(need-actual)>1e-6)issues.push('投料数量不守恒 '+consumer+'/'+b['子项编号']);}
 }
 return {status:issues.length?'problem':'pass',issues:[...new Set(issues)],scope:['设备/人员/工装有限占用','日产能','前序','可知日停机','完整需求身份','物料供给身份/质量/可用期/累计余额','按BOM投料数量守恒'],notChecked:[],inputHash:hash(d)};
}
