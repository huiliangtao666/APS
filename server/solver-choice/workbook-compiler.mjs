import {computationInput} from '../workbook-workbench.mjs';
import {copyReportSource} from '../query-reports/source-copy.mjs';
const cloneForParameters=input=>{const d=copyReportSource(computationInput(input));delete d.parameterChangeLog;d.tables=Object.fromEntries(Object.entries(input.tables).map(([table,values])=>[table,d.tables[table]??values]));return d;};
import {rows,refreshDerived,hash,PROFILE} from '../workbook-model.mjs';
import {selectionDataset} from '../workbook-selection.mjs';
import {supplyReadiness,supplyLots} from '../workbook-supply.mjs';
import {minuteMode,MINUTE_ENGINE,boundary,shiftWindows,knownMinuteStops,wipOccupations,weightSharedResource} from '../workbook-minute.mjs';
import {urgentDemandOrder} from '../urgent-order-engine.mjs';
import {effectiveParameters} from '../parameter-contract.mjs';
import {SolverProblem,fingerprint} from './contract.mjs';
import {validateWorkbookModel} from './workbook-model.mjs';
import {ratio,safe,lcm} from './exact.mjs';
import {quantityLattice,decimalProduct,sourceLotQuantity} from './quantity-lattice.mjs';
import {encodeWide as encode,coefficientWide as coefficient,batchBoundWide as exactBatchBound,packModel,minInteger,maxInteger} from './exact-protocol.mjs';
import {workbookLimbCertificate} from './limb-integer.mjs';
export const WORKBOOK_MODEL='aps-cpsat-workbook:v2';
const reject=(code,message,details={})=>{throw new SolverProblem(code,message,details);};
const int=(v,path,min=0)=>{if(String(v??'').trim()===''||!Number.isSafeInteger(Number(v))||Number(v)<min)reject('CP_WORKBOOK_INPUT','须有显式整数',{path,value:v});return Number(v);};
const combos=(list,n)=>{if(n===0)return [[]];if(n>list.length)return [];return list.flatMap((x,i)=>combos(list.slice(i+1),n-1).map(xs=>[x,...xs]));};
const merged=windows=>{const result=[];for(const [a,b]of windows.sort((x,y)=>x[0]-y[0])){const last=result.at(-1);if(last&&last[1]>=a)last[1]=Math.max(last[1],b);else result.push([a,b]);}return result;};
export function prepareSolverWorkbook(input,selection,diagnostic=null){
 if((input.scenarioConditions?.personnel.length||input.scenarioConditions?.overtime.length))reject('CP_SCENARIO_COVERAGE','当前CP-SAT编译器未覆盖本次逐时增人/加班条件；请显式选择基础引擎，不静默回退');
 if(!minuteMode(input))reject('CP_TIME_CONTRACT_UNSUPPORTED','CP-SAT仅支持已批准的真实分钟工作簿',{actual:input.productionContract});
 const s={...selection},start=int(s.startDay,'startDay'),end=int(s.endDay,'endDay'),current=int(s.currentDay,'currentDay');
 if(start<current||end<=start||end>44)reject('CP_WINDOW','日窗口无效');
 if(s.currentMinute!==undefined&&(int(s.currentMinute,'currentMinute')<current*1440||s.currentMinute>=end*1440))reject('CP_WINDOW','观察分钟不在有效窗口');
 if(input.urgentOrder&&s.demandIds!==undefined)reject('CP_URGENT_SELECTION','插单必须保留全部原单与已生效插单');
 if(s.demandIds!==undefined&&(!Array.isArray(s.demandIds)||!s.demandIds.length||new Set(s.demandIds).size!==s.demandIds.length))reject('CP_DEMAND_COVERAGE','需求选择须非空且唯一');
 diagnostic?.('prepare.clone-and-derived',{inputRows:Object.values(input.tables).reduce((n,r)=>n+r.length,0)});
 let resolved=refreshDerived(cloneForParameters(input),start);
 diagnostic?.('prepare.projection',{});
 // Derived binary-float tails are not new source precision. Rebuild only the
 // CP view from the already-resolved original decimal multiplicands.
 for(const r of rows(resolved,'每日需求')){const m=rows(resolved,'物料主数据').find(m=>m['物料编号']===r['成品编号']);if(m)r['需求千克']=decimalProduct(r['需求箱数'],m['每箱净重千克']);}
 const d=selectionDataset(resolved,s);diagnostic?.('prepare.readiness',{parameters:rows(d,'配置参数').length});const ready=supplyReadiness(d);
 if(!ready.ready)reject('CP_WORKBOOK_NOT_READY','所选业务资料或必要约束不完整',{issues:ready.issues});
 const demands=urgentDemandOrder(d,rows(d,'每日需求').filter(r=>Number(r['需求日'])>=start&&Number(r['需求日'])<end&&(!s.demandIds||s.demandIds.includes(r['需求编号']))));
 if(!demands.length||s.demandIds&&s.demandIds.some(id=>!demands.some(r=>r['需求编号']===id)))reject('CP_DEMAND_COVERAGE','所选需求为空或已变化');
 resolved=null;diagnostic?.('prepare.hash-source',{});
 return {input:d,selection:s,demands,ready,source:{inputHash:fingerprint(input),configurationHash:hash({parameters:rows(input,'配置参数'),mapping:input.mapping,context:input.parameterContext}),selectionHash:fingerprint(s),datasetId:input.id,version:input.version,fileHash:input.fileHash,mappingHash:hash(input.mapping),parameterHash:hash(rows(input,'配置参数')),profile:PROFILE}};
}
// Quantity obligations come from source rows. No call to calculateWorkbook or
// minuteResourceCandidate occurs here: unscheduled jobs, all alternatives,
// conditional manufactured supply and all selected demand reach the real model.
function buildWorkbookModel(input,selection,conditions,{diagnostic=null}={}){
 const prepared=prepareSolverWorkbook(input,selection,diagnostic),{input:d,demands,source}=prepared,start=selection.startDay*1440,end=selection.endDay*1440,current=selection.currentMinute??selection.currentDay*1440,u=d.urgentOrder;
 diagnostic?.('compile.lattice',{});
 const lattice=quantityLattice(d),scales=Object.fromEntries(Object.entries(lattice.materials).map(([id,s])=>[id,{...s,scale:BigInt(s.scale)}])),materials=new Map(rows(d,'物料主数据').map(r=>[r['物料编号'],r])),routes=rows(d,'工艺路线'),boms=rows(d,'物料清单');
 if(d.mapping.sfRoutes?.length)reject('CP_ROUTE_PROFILE_UNSUPPORTED','日粒度仿真补充路线不能冒充分钟路线',{routeIds:d.mapping.sfRoutes.map(r=>r['路线工序编号'])});
 // Propagate exact ratio denominators down an acyclic BOM. No kg or package is
 // rounded to fit the solver; an unsafe denominator is a located input block.
 const qty=(id,value,path)=>encode(value,scales[id]?.scale,path),physical=rows(d,'设备与工装'),crews=rows(d,'班组资源'),resourceById=new Map(physical.map(r=>[r['资源编号'],r])),crewById=new Map(crews.map(r=>[r['班组编号'],r]));
 let weightScale=1n;for(const [id,s]of Object.entries(scales))if(s.unit==='千克'&&materials.get(id)['物料来源']==='制造')weightScale=lcm(weightScale,BigInt(s.scale));for(const r of physical)for(const f of ['同时占位上限千克','单次批量上限千克','标准日产能千克'])if(String(r[f]??'').trim()){const x=ratio(r[f]);weightScale=lcm(weightScale,BigInt(x.d));}
 const wscale=weightScale,weight=value=>encode(value,wscale,'resource kg');
 const resources=physical.filter(r=>Number(r['可用数量'])>0).map(r=>({id:r['资源编号'],capacity:r['资源类别']==='设备'&&weightSharedResource(r)?weight(r['同时占位上限千克']):1n,unit:r['资源类别']==='设备'&&weightSharedResource(r)?'scaled-kg':'entity',calendar:[[start,end+Math.max(0,...routes.map(r=>Number(r['工装后延释放分钟'])))]]}));
 for(const c of crews){const windows=[];for(let day=selection.startDay;day<selection.endDay;day++)windows.push(...shiftWindows(d,c,day).map(x=>[x.start,x.end]));resources.push({id:'crew:'+c['班组编号'],capacity:BigInt(int(c['每班可用人数'],'crew capacity')),unit:'person',calendar:merged(windows)});}
 const model={contract:WORKBOOK_MODEL,source,selection:structuredClone(selection),window:[start,end],objective:conditions.objective,partialPolicy:{kind:'explicit_partial',version:u?.contract||'workbook-demand-atomic-v1',source:u?'既有插单允许净量部分未排；无新增权重/目标':'既有工作簿每需求整条保留或撤销；无新增权重/目标'},scales,weightScale:wscale,resources,groups:[],tasks:[],lots:[],feeds:[],demands:[],reservations:[],stops:knownMinuteStops(d,current),sequences:[],rules:[],metadata:{minuteEngine:MINUTE_ENGINE,quantitySource:'exact frozen source rational lattice; no rounding except existing package ceiling',frozenUrgent:u?structuredClone(u):null}};
 const floor=Math.max(start,u?.effectiveMinute??start),byGroup=new Map(),seedIds=new Set(u?.seedTasks.map(t=>t.id)||[]);let serial=0;
 const boundaryRelease=boundary(d,'日粒度放行时点分钟',selection.startDay,'CAL'),boundaryExpiry=boundary(d,'批次到期日内失效分钟',selection.startDay),boundaryArrival=boundary(d,'日粒度到货时点分钟',selection.startDay,'CAL');
 for(const lot of supplyLots(d)){const record=rows(d,lot.source.sheet||'').find(r=>r._row===lot.source.row);let ready=lot.ready===null?null:lot.ready*1440+boundaryRelease;
  if(lot.id.startsWith('inventory:')&&Number(record?.['放行日'])<=Number(record?.['快照日'])&&Number(record?.['快照日'])===0)ready=1440;
  if(lot.id.startsWith('transit:')){const supplier=rows(d,'供应商与供货条件').find(r=>r['供货关系编号']===record?.['供货关系编号']);ready=Math.max(ready,Number(record['约定到货日'])*1440+boundaryArrival+Number(supplier['检验天数'])*1440);}
  model.lots.push({id:lot.id,materialId:lot.material,quantity:qty(lot.material,sourceLotQuantity(lot,d),lot.id),reserved:0n,ready,expiry:lot.expiry*1440+boundaryExpiry,qualityEligible:lot.quality&&ready!==null,conditional:lot.conditional,source:lot.source});
 }
 function reserve(id,resourceId,a,b,amount,source){if(b>a&&amount>0&&resources.some(r=>r.id===resourceId))model.reservations.push({id,resourceId,start:a,end:b,amount:BigInt(amount),source});}
 for(const w of wipOccupations(d,start,end)){const r=resourceById.get(w.resource);reserve(w.taskId+':physical',w.resource,w.start,w.end,weightSharedResource(r)?weight(w.quantity):1,w.source);for(const [i,l]of w.labor.entries())reserve(w.taskId+':labor:'+i,'crew:'+w.crew,l.start,l.end,w.people,w.source);for(const tool of w.tools)reserve(w.taskId+':tool:'+tool,tool,w.start,w.toolEnd,1,w.source);}
 if(model.metadata.frozenUrgent)model.metadata.frozenUrgent.wipDaily=(d.mapping.wip_remaining||[]).filter(w=>Math.floor(w.current_occupancy_minute_interval[0]/1440)>=selection.startDay&&Math.floor(w.current_occupancy_minute_interval[0]/1440)<selection.endDay).map(w=>({resourceId:w.resource,quantityScaled:weight(w.quantity),day:Math.floor(w.current_occupancy_minute_interval[0]/1440)}));
 const standard=effectiveParameters(d,selection.startDay,d.parameterContext?.scope).find(p=>p['对象编号']==='GLOBAL'&&p['参数名称']==='标准生产批量千克');
 if(!standard||!(Number(standard['参数值'])>0))reject('CP_BATCH_SOURCE','标准生产批量缺少明确有效来源');
 function options(route,group,maxQuantity,seed){
  const c=crewById.get(route['班组编号']),toolCount=int(route['每批工装套数'],'toolCount'),pool=(d.mapping.tool_pools[route['所需工装类型']]||[]).filter(id=>Number(resourceById.get(id)?.['可用数量'])>0),tools=seed?[seed.tools]:combos(pool,toolCount),out=[];
  if(!c)reject('CP_CREW_SOURCE','路线班组缺失',{routeId:route['路线工序编号']});
  for(const r of physical.filter(r=>r['资源类别']==='设备'&&r['资源组编号']===route['设备组编号']&&Number(r['可用数量'])>0&&(!seed||r['资源编号']===seed.machine)))for(const ts of tools){
   if(ts.length!==toolCount||ts.some(id=>!pool.includes(id)))continue;
   // Capacity bounds are rationals. A floor is a bound on integer model units,
   // not truncation of a business input or a manufactured quantity.
   const cap=exactBatchBound([r['单次批量上限千克'],standard['参数值'],...(weightSharedResource(r)?[r['同时占位上限千克']]:[])],ts.map(id=>resourceById.get(id)['单次批量上限千克']),toolCount,scales[group.materialId].scale);if(cap<=0)continue;
   const days=[];for(let day=selection.startDay;day<selection.endDay;day++){const cal=rows(d,'工厂日历').find(x=>Number(x['日序'])===day);if(!cal)continue;const shifts=shiftWindows(d,c,day),n=Number(cal['生产班次数']),den=Number(cal['日产能分母']);if(!Number.isFinite(n)||!(den>0))reject('CP_CALENDAR_SOURCE','日历容量缺少来源',{day});const ar=ratio(n,den),br=ratio(shifts.length,c['标准日班次数']),cr=BigInt(ar.n)*BigInt(br.d)<=BigInt(br.n)*BigInt(ar.d)?ar:br,base=ratio(r['标准日产能千克']);days.push([day,BigInt(base.n)*BigInt(cr.n)*BigInt(wscale)/(BigInt(base.d)*BigInt(cr.d))]);}
   const windows=[];for(let day=selection.startDay;day<selection.endDay;day++)windows.push(...shiftWindows(d,c,day).map(x=>[x.start,x.end]));
   out.push({id:r['资源编号']+'|'+ts.join(','),resourceId:r['资源编号'],crewId:c['班组编号'],people:int(route['需求人数'],'people'),tools:ts,capacity:minInteger(maxQuantity,cap),shared:weightSharedResource(r),weightMultiplier:wscale/scales[group.materialId].scale,days,shifts:windows,deviceCalendar:r['生产日历方式']==='工厂班次'?merged(windows):[[start,end]],crossShift:route['允许跨班连续']==='是',toolTail:int(route['工装后延释放分钟'],'toolTail')});
  }
  if(!out.length)reject('CP_RESOURCE_ALTERNATIVES','必要路线无合格设备/实体工具候选',{routeId:route['路线工序编号'],groupId:group.id});return out;
 }
 function makeGroup(materialId,maxQuantity,{id,needId,wip=null,seeds=[],fixed=false}={},ancestors=[]){
  if(model.groups.length%16===0)diagnostic?.('compile.groups',{groups:model.groups.length,tasks:model.tasks.length,feeds:model.feeds.length});
  id??='CP-G'+(++serial);if(byGroup.has(id))return byGroup.get(id);if(ancestors.includes(materialId))reject('CP_BOM_CYCLE','BOM循环',{materialId});
  const material=materials.get(materialId);if(!material||material['物料来源']!=='制造'||scales[materialId].unit!=='千克')reject('CP_MANUFACTURE_PROFILE','制造物料须有明确千克量纲及分钟路线',{materialId});
  const routeList=routes.filter(r=>r['成品编号']===materialId).sort((a,b)=>Number(a['工序顺序'])-Number(b['工序顺序']));if(!routeList.length)reject('CP_ROUTE_SOURCE','制造路线缺失',{materialId});
  const g={id,materialId,maxQuantity,needId,wip:wip?structuredClone(wip):null,fixedQuantity:fixed?maxQuantity:null,routes:[],seeds:structuredClone(seeds)};byGroup.set(id,g);model.groups.push(g);
  let previous=null;
  for(const rt of routeList){const rid=rt['路线工序编号'];if(wip&&(rid===wip.current_route_step||!wip.remaining_route_steps.includes(rid)))continue;
   const retained=seeds.filter(t=>t.routeStepId===rid),retainedQuantity=retained.reduce((n,t)=>n+qty(materialId,t.quantity,'seed '+t.id),0n),route={id:rid,source:structuredClone(rt),previous,taskIds:[],retainedQuantity,minLag:previous?int(Number(rt['最小等待天数']||0)*1440,'minLag'):0,maxLag:previous?int(rt['最大等待分钟'],'maxLag'):null,durationRatio:coefficient(1,scales[materialId].scale,rt['基准加工分钟'],rt['基准加工量千克'])};g.routes.push(route);
   for(const t of retained){const task={id:t.id,groupId:id,routeId:rid,maxQuantity:qty(materialId,t.quantity,t.id),seed:structuredClone(t),options:options(rt,g,qty(materialId,t.quantity,t.id),t)};model.tasks.push(task);route.taskIds.push(t.id);}
   const op=options(rt,g,maxQuantity),minCap=minInteger(...op.map(x=>x.capacity)),remaining=maxInteger(0n,maxQuantity-retainedQuantity),count=safe((remaining+minCap-1n)/minCap,'batch count');
   if(count>10000||model.tasks.length+count>100000)reject('CP_MODEL_SIZE','明确结构上界；未删减义务',{count,groupId:id});
   for(let n=0;n<count;n++){const tid=id+'|'+rid+'|'+n;model.tasks.push({id:tid,groupId:id,routeId:rid,maxQuantity:minInteger(maxQuantity,maxInteger(...op.map(x=>x.capacity))),earliest:wip?Math.max(floor,wip.current_occupancy_minute_interval[1]):floor,options:op});route.taskIds.push(tid);}
   previous=rid;
  }
  const wid=wip?'wip:'+id:'production:'+id,lot={id:wid,materialId,quantity:maxQuantity,reserved:0n,ready:wip?Math.max(start,wip.releaseMinute):floor,expiry:end+int(material['保质天数'],'shelf')*1440,qualityEligible:true,conditional:true,producerGroup:id,shelfLife:int(material['保质天数'],'shelf')*1440,source:wip?{sheet:'期初在制',row:rows(d,'期初在制').find(x=>x['在制批次编号']===id)?._row,remainingMapping:d.mapping.version}:{productionId:id,productId:materialId}};
  model.lots.push(lot);g.lotId=wid;
  for(const route of g.routes){
   const candidates=boms.filter(b=>b['父项编号']===materialId&&(!wip||wip.remaining_material_bom_ids.includes(b['用量关系编号']))&&d.mapping.feed_mappings.some(f=>f.bom_id===b['用量关系编号']&&f.route_step_id===route.id)&&Number(b['生效日'])<selection.endDay&&selection.startDay<Number(b['失效日']));
   for(const b of candidates){const c=coefficient(scales[b['子项编号']].scale,scales[materialId].scale,b['子项基准用量'],b['父项基准产出千克']),upper=(maxQuantity*c.n+c.d-1n)/c.d;
    const feed={id:id+'|'+route.id+'|'+b['用量关系编号'],groupId:id,routeId:route.id,materialId:b['子项编号'],coefficient:c,ceil:scales[b['子项编号']].unit==='个',maxQuantity:upper,needId,consumer:wip?id:id+'|'+route.id,bomId:b['用量关系编号'],validity:[Number(b['生效日'])*1440,Number(b['失效日'])*1440],source:{sheet:'物料清单',row:b._row},kind:wip?'WIP剩余待投':'需求'};
    model.feeds.push(feed);if(materials.get(feed.materialId)?.['物料来源']==='制造'&&upper>0){const child=makeGroup(feed.materialId,upper,{needId},[...ancestors,materialId]);feed.manufacturedLotId=child.lotId;}
   }
  }
  return g;
 }
 // Existing WIP and protected production are complete original groups; their
 // historical allocations and physical locks are never reconstructed by ratio.
 for(const w of d.mapping.wip_remaining||[]){const record=rows(d,'期初在制').find(r=>r['在制批次编号']===w.id);if(!record)reject('CP_WIP_SOURCE','在制原始记录缺失',{id:w.id});makeGroup(w.product,qty(w.product,record['预计合格产出'],w.id),{id:w.id,needId:w.id,wip:w,seeds:(u?.seedTasks||[]).filter(t=>t.productionId===w.id)});}
 for(const g of u?.baseGroups||[])if(!byGroup.has(g.id))makeGroup(g.productId,qty(g.productId,g.quantity,g.id),{id:g.id,needId:g.orderId,seeds:g.tasks,fixed:true});
 for(const r of demands){const id=r['需求编号'],materialId=r['成品编号'],amount=qty(materialId,r['需求千克'],id),completed=qty(materialId,u?.completed[id]||0,id+' completed'),locked=(u?.seedAllocations||[]).filter(a=>a.need===id&&a.consumer===id&&a.materialId===materialId).reduce((n,a)=>n+qty(materialId,a.quantity,id+' locked'),0n),remaining=amount-maxInteger(completed,locked),customer=rows(d,'客户与交付').find(c=>c['客户编号']===r['客户编号']);
  if(remaining<0)reject('CP_EXECUTION_QUANTITY','完成/保护分配超过原需求',{id});
  const demand={id,materialId,quantity:amount,completedQuantity:completed,protectedQuantity:maxInteger(0n,locked-completed),remaining,atomic:!u,source:structuredClone(r),transportDays:Number(customer['运输天数']),minShelfMinutes:(Number(customer['运输天数'])+Number(r['到货剩余保质天数']))*1440,earliest:Math.max(floor,(Number(r['最早到货日'])-Number(customer['运输天数']))*1440+boundary(d,'最早交付日内时点分钟',selection.startDay)),target:Math.max(floor,Number(r['按要求日最晚发运日'])*1440)};model.demands.push(demand);
  if(remaining>0){const feed={id:'delivery:'+id,demandId:id,materialId,maxQuantity:remaining,needId:id,consumer:id,kind:'需求',source:{sheet:'每日需求',row:r._row},minShelfMinutes:demand.minShelfMinutes};model.feeds.push(feed);if(materials.get(materialId)?.['物料来源']==='制造'){const g=makeGroup(materialId,remaining,{needId:id});feed.manufacturedLotId=g.lotId;}}
 }
 for(const id of seedIds)if(!model.tasks.some(t=>t.id===id))reject('CP_PROTECTED_ROUTE_UNSUPPORTED','已保护任务未映射到原剩余路线，不能丢弃',{taskId:id});
 model.protectedAllocations=structuredClone(u?.seedAllocations||[]);
 for(const f of model.feeds)if(f.groupId)f.protectedQuantity=model.protectedAllocations.filter(a=>a.consumer===f.consumer&&a.materialId===f.materialId&&(!a.bomId||a.bomId===f.bomId)).reduce((n,a)=>n+qty(f.materialId,a.quantity,'protected feed '+f.id),0n);
 for(const a of model.protectedAllocations){const lot=model.lots.find(l=>l.id===a.supplyId);if(!lot)reject('CP_PROTECTED_SUPPLY','已投/锁定来源缺失',{supplyId:a.supplyId});lot.reserved+=qty(a.materialId,a.quantity,'protected '+a.supplyId);if(lot.reserved>lot.quantity)reject('CP_PROTECTED_SUPPLY','已投/锁定数量超供给',{supplyId:a.supplyId});}
 for(const f of model.feeds)f.eligibleLotIds=model.lots.filter(l=>l.materialId===f.materialId&&l.qualityEligible&&(!l.producerGroup||l.id.startsWith('wip:')||l.id===f.manufacturedLotId||byGroup.get(l.producerGroup)?.fixedQuantity!==null)).map(l=>l.id);
 for(const r of physical.filter(r=>r['资源类别']==='设备')){const members=model.tasks.flatMap(t=>t.options.filter(o=>o.resourceId===r['资源编号']).map(o=>({taskId:t.id,optionId:o.id,productId:byGroup.get(t.groupId).materialId,crewId:o.crewId})));if(!members.length)continue;const transitions=rows(d,'换型清洗').filter(x=>x['设备组编号']===r['资源组编号']).map(x=>({from:x['前产品编号'],to:x['后产品编号'],minutes:int(x['清洗分钟'],'clean minutes'),people:int(x['清洗人数'],'clean people'),source:x['清洗规则编号'],row:x._row}));for(const a of members)for(const b of members)if(a.taskId!==b.taskId&&!transitions.some(t=>t.from===a.productId&&t.to===b.productId))reject('CP_CLEANING_SOURCE','有向清洗矩阵缺少必需规则',{resourceId:r['资源编号'],from:a.productId,to:b.productId});model.sequences.push({resourceId:r['资源编号'],shared:weightSharedResource(r),members,transitions});}
 const ruleObjects={quantity:demands.map(r=>r['需求编号']),bom:boms.map(b=>b['用量关系编号']),fefo:model.lots.map(l=>l.id),routes:model.groups.map(g=>g.id),calendar:resources.map(r=>r.id),labor:crews.map(c=>c['班组编号']),tools:physical.filter(r=>r['资源类别']==='工装').map(r=>r['资源编号']),weight:physical.filter(weightSharedResource).map(r=>r['资源编号']),cleaning:model.sequences.map(s=>s.resourceId),wip:(d.mapping.wip_remaining||[]).map(w=>w.id),execution:[...seedIds]};
 model.rules=Object.entries(ruleObjects).map(([id,objects])=>({id,enabled:true,supported:true,dataComplete:true,version:MINUTE_ENGINE,objects}));
 if(conditions.inputHash!==source.inputHash||conditions.selectionHash!==source.selectionHash)reject('CP_MODEL_SOURCE_CHANGED','编译条件与冻结来源不符');
 diagnostic?.('compile.pack',{groups:model.groups.length,tasks:model.tasks.length,feeds:model.feeds.length});
 return packModel(model);
}
// The builder frame (projected workbook, indexes, raw BigInt model) is gone
// before certificate generation/validation. No explicit GC is required.
export function compileWorkbookModel(input,selection,conditions,{diagnostic=null,certificateSink=null}={}){
 const packed=buildWorkbookModel(input,selection,conditions,{diagnostic});
 diagnostic?.('compile.certificate',{groups:packed.groups.length,tasks:packed.tasks.length,feeds:packed.feeds.length});
 if(packed.contract==='aps-cpsat-workbook:v3')packed.integerBounds=workbookLimbCertificate(packed,null,{diagnostic,sink:certificateSink});
 diagnostic?.('compile.model-hash',{});packed.modelHash=fingerprint(packed);
 return validateWorkbookModel(packed,{copy:false,diagnostic});
}
