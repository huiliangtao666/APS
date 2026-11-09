import {calendarWindow,dayCalendar,minuteCalendar,number,table,keyOf,createReportSnapshot,resolvedInput,anchor} from './query-reports/context.mjs';
import {effectiveBom,expandBom,bomLeads} from './query-reports/bom.mjs';
import {sumKnown} from './query-reports/projections.mjs';
import {sourceHash} from './query-reports/source-copy.mjs';
import {createMpsProjection} from './mps-report-projection.mjs';

export const MPS_METRICS=[
 ['independent','独立净需求','流量'],['dependent','相关净需求','流量'],['demand','净需求合计','流量'],
 ['opening','期初预计净余额','时点'],['arrival','采购预计到货量','流量'],['purchase','采购预计可用量','流量'],
 ['firm','既有制造预计可用量','流量'],['completion','主计划预计完工量','流量'],['mps','主计划预计可用量','流量'],
 ['expiry','预计失效扣减','流量'],['balance','预计期末净余额','时点'],['safety','安全库存目标','时点'],
 ['shortage','需求缺口','时点'],['safetyGap','安全库存不足（含需求缺口）','时点'],
 ['suggestMake','未下达制造补货建议','建议流量'],['suggestBuy','未下达采购补货建议','建议流量']];
export const MPS_TABLES={demands:'需求',inventory:'库存批次',incoming:'采购在途',manufacturing:'既有制造与主计划',suggestions:'补货建议',parameters:'参数与来源',risks:'风险与覆盖'};
export const mpsFail=(code,status=422)=>{throw Object.assign(Error(code),{code,status});};
export const known=value=>({value,state:'KNOWN',reason:''});
export const unknown=(reason,state='NOT_PROVIDED')=>({value:null,state,reason});
const na=()=>unknown('该物料不适用此供给类型','NOT_APPLICABLE');
const finite=v=>number(v)!==null;
const at=(v,n)=>number(n)===null?null:dayCalendar(v.identity.dayZero,Math.floor(Number(n)));
const instant=(v,n)=>number(n)===null||!v.identity.minuteOrigin?null:minuteCalendar(v.identity.minuteOrigin,Number(n));
const own=(o,k)=>Object.hasOwn(o,k);
const missing=v=>v===null||v===undefined||String(v).trim()==='';
const nextQty=(r,net,original,done)=>finite(r[net])&&number(r[net])>=0?number(r[net]):finite(r[original])&&finite(r[done])&&number(r[original])>=number(r[done])&&number(r[done])>=0?number(r[original])-number(r[done]):null;
const reportQty=(r,net,original,done)=>missing(r[net])&&missing(r[done])&&finite(r[original])&&number(r[original])>=0?number(r[original]):nextQty(r,net,original,done);
const sum=cells=>cells.every(c=>c.state==='NOT_APPLICABLE')?na():cells.some(c=>c.state!=='KNOWN')?unknown([...new Set(cells.filter(c=>c.state!=='KNOWN').map(c=>c.reason))].join('；'),cells.every(c=>c.state==='NOT_COVERED')?'NOT_COVERED':'NOT_PROVIDED'):known(sumKnown(cells.map(c=>c.value)));
const text=v=>v===null||v===undefined?'未提供':typeof v==='object'?JSON.stringify(v):String(v);

/** No current-input fallback, solver, source writes, or independent ledger.
 * v is supplied by workbookQueryContext/BoundContext AFTER existing permissions.
 * Quantity projections use frozen source records and the supplied prototype's
 * daily balance formula. They do not write actual stock or rerun the solver.
 */
export function createMpsReport(v,q={}){
 const from=q.fromDate||at(v,v.run?.selection.startDay??1),to=q.toDateInclusive||at(v,(v.run?.selection.endDay??15)-1);
 const window=calendarWindow(v.identity.dayZero,from,to);
 const ready=!!v.run?.result&&['completed','partial'].includes(v.run.status);
 const snapshot=createReportSnapshot({...(ready?{frozenInput:v.input,run:v.run}:{dataset:v.input}),datasetId:v.identity.datasetId,version:v.identity.version,dayZero:v.identity.dayZero,scope:ready||!v.run?v.identity.scope:'dataset',actor:v.actor},{read:true});
 // A pending run exposes its raw frozen inputs only. No effective parameter
 // resolution or numeric matrix is claimed without a successful result.
 const effectiveDay=v.run?.provenance?.effectiveAt??v.run?.selection.startDay??window.start;
 const d=v.run&&!ready?snapshot.input:resolvedInput(snapshot,effectiveDay),p=ready?v.run.result:null;
 const graph=effectiveBom(d,window.start),leads=bomLeads(d,graph);
 const events=[],stocks=[],details=Object.fromEntries(Object.keys(MPS_TABLES).map(k=>[k,[]])),diagnostics=[...graph.diagnostics];
 const reference=ready?'选定计划冻结输入/结果':v.run?'选定计划冻结输入参考，运行未成功/未完成':'输入参考，未作有限资源验证';
 const sources=(t,r)=>({table:t,key:keyOf(t,r),row:r._row??null});
 const add=(kind,id,materialId,values,refs=[],raw=null)=>{const row={id,materialId,values:{id,materialId,...values},refs,raw};details[kind].push(row);return row;};
 const event=(metric,materialId,date,quantity,record,reason='',unit=null)=>events.push({metric,materialId,date,quantity,record:record.id,reason,unit});
 const dateEvent=(metric,materialId,day,quantity,row,reason,unit)=>event(metric,materialId,at(v,day),quantity,row,reason,unit);
 const selected=new Set((p?.demandResults||[]).map(r=>r.id)),seenDemands=new Set();
 for(const r of table(d,'每日需求')){
  if(p&&!selected.has(r['需求编号']))continue;
  const id=r['需求编号'];if(!id||seenDemands.has(id)){diagnostics.push({code:'DEMAND_ID_CONFLICT',id});event('independent',r['成品编号'],null,null,{id:'conflict:'+id},'需求身份冲突，未选择任一重复来源','千克');continue;}seenDemands.add(id);
  const original=number(r['需求千克']);
  // Use the original demand when execution fields are absent, as requested.
  // Explicit zero and invalid execution facts must not fall back to gross demand.
  const originalFallback=missing(r['净剩余需求千克'])&&missing(r['已发运千克'])&&original!==null&&original>=0;
  const net=reportQty(r,'净剩余需求千克','需求千克','已发运千克');
  const day=number(r['按要求日最晚发运日']),result=p?.demandResults?.find(x=>x.id===id);
  const row=add('demands','demand:'+id,r['成品编号'],{kind:'独立需求',quantity:net,original,executed:number(r['已发运千克']),netRemaining:number(r['净剩余需求千克']),unit:'千克',needDate:at(v,day),customerDate:at(v,r['需求日']),customer:r['客户编号'],earliestArrival:at(v,r['最早到货日']),latestArrival:at(v,r['最晚到货日']),plannedArrival:at(v,result?.arrivalDay),status:result?.status??'输入参考',condition:originalFallback?'未提供净剩余及发运记录，按原始需求量展示':net===null?'需求数量或发运执行数据缺失/无效':'净剩余来源已提供',overdue:day!==null&&day<window.start},[sources('每日需求',r)],r);
  dateEvent('independent',row.materialId,day,net,row,'需求数量或工厂发运日期缺失/无效','千克');
 }
 // Keep saved allocations as drill-down evidence, separate from the complete
 // frozen input requirements. Never add both collections to the same metric.
 if(p){for(const [i,a]of (p.allocations||[]).entries()){
  const isFeed=a.kind==='WIP剩余待投'||(a.consumer&&a.consumer!==a.need);
  if(!isFeed)continue;
  const t=(p.tasks||[]).find(t=>t.id===a.taskId),minute=number(a.feedMinute),date=v.identity.timeUnit==='minute'?instant(v,minute)?.slice(0,10)??null:at(v,a.feedDay);
  add('demands','allocation:'+i,a.materialId,{kind:'冻结成功投料分配（不重复计入相关需求）',quantity:number(a.quantity),unit:a.unit??graph.materials.get(a.materialId)?.['基础单位']??null,needDate:date,feedTime:instant(v,minute),parent:a.consumer,need:a.need,task:a.taskId??null,production:t?.productionId??null,status:'冻结分配证据',condition:'仅展示成功分配；相关需求另取冻结输入物料需求来源'},[{collection:'allocations',index:i}],a);
 }}
 for(const r of table(d,'物料需求来源')){
  const row=add('demands','reference:'+r['物料需求编号'],r['所需物料编号'],{kind:'相关需求',quantity:reportQty(r,'净剩余需求数量','需求数量','已投料数量'),original:number(r['需求数量']),executed:number(r['已投料数量']),netRemaining:number(r['净剩余需求数量']),unit:r['数量单位']??null,needDate:at(v,r['需料日']),parent:r['父项编号'],status:p?'冻结输入需料':'输入需料',condition:'按来源需料日展示，不与成功投料分配重复叠加'},[sources('物料需求来源',r)],r);
  dateEvent('dependent',row.materialId,r['需料日'],row.values.quantity,row,'需料数量或日期未提供',r['数量单位']);
 }
 for(const r of table(d,'期初库存')){
  const qty=number(r['当前数量']),occupied=number(r['期初已占用量']),release=number(r['放行日']),expiry=number(r['到期日']),snap=number(r['快照日']);
  const qualification=['已放行','合格'].includes(r['质量状态']);
  const free=qty===null||occupied===null||release===null||expiry===null||snap===null?null:qualification&&release<=snap&&snap<expiry?Math.max(0,qty-occupied):0;
  const reason=occupied===null?'未提供占用数量':occupied!==0?'已扣除来源记录的占用量':'明确零占用';
  const row=add('inventory','stock:'+r['库存批次编号'],r['物料编号'],{quantity:qty,occupied,free,unit:r['数量单位']??null,snapshotDate:at(v,snap),releaseDate:at(v,release),expiryDate:at(v,expiry),quality:r['质量状态']??null,warehouse:r['仓库编号']??null,location:r['库位编号']??null,condition:reason+'；查询起点库存按同源供需逐日推演'},[sources('期初库存',r)],r);
  stocks.push(row);
 }
 // Additional source families are appended below before any filtering/aggregation.
 const context={v,q,d,p,ready,window,from,to,snapshot,graph,leads,events,stocks,details,diagnostics,reference,add,event,dateEvent,sources};
 appendSupply(context);
 return finishReport(context);
}

function appendSupply(c){
 const {v,d,p,graph,add,event,dateEvent,sources}=c,seen=new Set();
 for(const r of table(d,'既有采购在途')){
  const id=JSON.stringify([r['采购订单编号'],r['订单行号']]);
  const duplicate=seen.has(id);seen.add(id);
  const s=table(d,'供应商与供货条件').find(s=>s['供货关系编号']===r['供货关系编号']&&s['物料编号']===r['物料编号']);
  const arrival=number(r['约定到货日']),release=number(r['预计放行日']),inspection=number(s?.['检验天数']);
  const available=arrival===null||release===null||inspection===null?null:Math.max(release,arrival+inspection);
  const net=reportQty(r,'净未收数量','订购数量','已收数量'),cancelled=['作废','取消','冻结','待检'].includes(r['在途状态']);
  const condition=duplicate?'采购单行身份冲突':cancelled?'来源状态不可作为合格供给':net===null?'采购数量缺失/无效':missing(r['净未收数量'])&&missing(r['已收数量'])?'未提供收货执行记录，按订购数量展示':'按净未收数量展示';
  const row=add('incoming','po:'+r['在途记录编号'],r['物料编号'],{quantity:net,ordered:number(r['订购数量']),received:number(r['已收数量']),unit:r['数量单位']??null,po:r['采购订单编号'],line:r['订单行号'],supplier:r['供应商编号'],arrivalDate:at(v,arrival),releaseDate:at(v,release),availableDate:at(v,available),inspectionDays:inspection,status:r['在途状态'],condition},[sources('既有采购在途',r),...(s?[sources('供应商与供货条件',s)]:[])],r);
  dateEvent('arrival',row.materialId,arrival,duplicate?null:cancelled?0:net,row,condition,row.values.unit);
  dateEvent('purchase',row.materialId,available,duplicate?null:cancelled?0:net,row,condition,row.values.unit);
 }
 const wips=new Set(table(d,'期初在制').map(r=>r['在制批次编号']));
 for(const r of table(d,'期初在制')){
  const row=add('manufacturing','wip:'+r['在制批次编号'],r['成品编号'],{kind:'既有制造',quantity:reportQty(r,'尚未入库净余量','预计合格产出','已入库数量'),original:number(r['预计合格产出']),executed:number(r['已入库数量']),netRemaining:number(r['尚未入库净余量']),unit:r['数量单位']??null,completionDate:at(v,r['预计完工日']),availableDate:at(v,r['预计放行日']),completionTime:r['预计完工时刻']??null,releaseTime:r['预计放行时刻']??null,status:'既有在制预计供给',condition:'优先净余量；缺少入库执行记录时按预计合格产出展示'},[sources('期初在制',r)],r);
  dateEvent('firm',row.materialId,r['预计放行日'],row.values.quantity,row,row.values.condition,row.values.unit);
 }
 if(p){
  const groups=new Map();for(const t of p.tasks||[]){if(!t.productionId)continue;if(!groups.has(t.productionId))groups.set(t.productionId,[]);groups.get(t.productionId).push(t);}
  for(const [id,tasks]of groups){
   if(wips.has(id))continue; // WIP enters only the existing-manufacturing family.
   const allocation=(p.allocations||[]).find(a=>a.supplyId==='production:'+id&&a.kind==='本次制造产出');
   const final=tasks.find(t=>t.id===allocation?.source?.taskId);
   const last=final?tasks.filter(t=>t.routeStepId===final.routeStepId):[];
   const quantity=last.length?sumKnown(last.map(t=>t.quantity)):null,materialId=final?.productId??tasks[0].productId;
   const complete=last.length?Math.max(...last.map(t=>t.end)):null;
   const completeTime=v.identity.timeUnit==='minute'?instant(v,complete):null,completeDate=completeTime?.slice(0,10)??(v.identity.timeUnit==='minute'?null:at(v,complete));
   const inspection=number(graph.materials.get(materialId)?.['检验提前期天数']);
   const availableDate=complete!==null&&inspection!==null&&inspection>=0?(v.identity.timeUnit==='minute'?instant(v,complete+inspection*1440)?.slice(0,10)??null:at(v,complete+inspection)):null;
   const row=add('manufacturing','production:'+id,materialId,{kind:'新增主计划',quantity,unit:graph.materials.get(materialId)?.['基础单位']??null,startTime:v.identity.timeUnit==='minute'?instant(v,Math.min(...tasks.map(t=>t.start))):null,completionDate:completeDate,completionTime:completeTime,availableDate,releaseTime:null,productionId:id,taskIds:tasks.map(t=>t.id).join('、'),status:'冻结制造安排',condition:'末道产出计量一次；预计可用日为完工日加物料检验提前期'},[{collection:'tasks',productionId:id},{collection:'allocations',supplyId:'production:'+id}],{tasks,allocation});
   event('completion',materialId,completeDate,quantity,row,row.values.condition,row.values.unit);
   event('mps',materialId,availableDate,quantity,row,row.values.condition,row.values.unit);
  }
  for(const [i,s]of (p.suggestions||[]).entries()){
   const row=add('suggestions','suggestion:'+i,s.materialId,{kind:'采购',quantity:number(s.quantity),unit:s.unit??graph.materials.get(s.materialId)?.['基础单位']??null,needDate:at(v,s.needDay),orderDate:at(v,s.orderDay),availableDate:at(v,s.availableDay),lateDays:number(s.lateDays),status:s.status??'未下达参考',condition:'不进入基准供给；转正式需单据谱系去重'},[{collection:'suggestions',index:i}],s);
   const adopted=(d.drafts||[]).some(x=>x.status==='adopted'&&x.sourceRun===v.run.id&&x.suggestionId===s.id);
   if(adopted){row.values.status='已转正式供给，不再计未下达建议';row.values.condition+='；正式供给详见原采购草案/冻结来源';}
   else dateEvent('suggestBuy',row.materialId,s.availableDay,row.values.quantity,row,'建议可用日期/数量未提供',row.values.unit);
  }
 }
 for(const [t,kind,metric,quantity,day]of [['生产补给建议','制造','suggestMake','建议生产量','本版最早预计完成日'],...(!p?[['采购订单草案','采购','suggestBuy','建议采购数量','预计放行日']]:[])])for(const r of table(d,t)){
  const inspection=number(graph.materials.get(r['物料编号'])?.['检验提前期天数']);
  const available=kind==='制造'?number(r['预计放行日'])??(finite(r[day])&&inspection!==null&&inspection>=0?number(r[day])+inspection:null):number(r[day]);
  const row=add('suggestions','reference:'+t+':'+(r['生产建议编号']??r['采购建议编号']),r['物料编号'],{kind,quantity:number(r[quantity]),unit:r['数量单位']??null,needDate:at(v,r['需求日']??r['生产需料日']),orderDate:at(v,r['建议下单日']??r['本版最早可开工日']),completionDate:kind==='制造'?at(v,r[day]):null,availableDate:at(v,available),arrivalDate:at(v,r['预计到货日']),MOQ:number(r['最小订货量']),multiple:number(r['订货倍数']),status:r['单据状态']??'输入参考',condition:'按来源建议量展示，不计入正式供给；制造可用日按完工加检验提前期'},[sources(t,r)],r);
  if(!['已下达','已转正式','已采用','取消','作废'].includes(r['单据状态']))dateEvent(metric,row.materialId,available,row.values.quantity,row,'建议数量或可用日期未提供',row.values.unit);
 }
 for(const [i,f]of (p?.findings||[]).entries())add('risks','finding:'+i,f.materialId??null,{kind:f.code,need:f.need??null,task:f.taskId??null,message:f.message,condition:'过程风险；不能以日末总量替代分钟/客户资格检查'},[{collection:'findings',index:i}],f);
 for(const [i,s]of (p?.shortages||[]).entries())add('risks','shortage:'+i,s.materialId,{kind:'冻结未满足需求',quantity:number(s.quantity),unit:s.unit??null,needDate:at(v,s.needDay),need:s.need,condition:'原运行缺口证据，不是PAB派生缺口'},[{collection:'shortages',index:i}],s);
}

function finishReport(c){
 const {v,q,d,p,ready,window,graph,leads,events,stocks,details,add,sources}=c;
 const days=Array.from({length:window.end-window.start},(_,i)=>at(v,window.start+i));
 const planStart=number(v.run?.selection.startDay),planEnd=number(v.run?.selection.endDay);
 const coverage=date=>ready&&planStart!==null&&planEnd!==null&&date>=at(v,planStart)&&date<at(v,planEnd);
 // Resolve effective safety parameters once per date, rather than cloning and
 // resolving the complete frozen workbook for every material and cell.
 const safetyMaterials=new Map();
 const safetyFor=date=>{
  const day=(Date.parse(date)-Date.parse(v.identity.dayZero))/86400000;
  const effective=v.run?v.run.provenance?.effectiveAt??planStart:day;
  if(!safetyMaterials.has(effective)){
   const active=v.run?c.d:resolvedInput(c.snapshot,effective);
   safetyMaterials.set(effective,new Map(table(active,'物料主数据').map(r=>[r['物料编号'],r])));
  }
  return safetyMaterials.get(effective);
 };
 const eventIndex=new Map();for(const e of events){const key=JSON.stringify([e.materialId,e.metric]);if(!eventIndex.has(key))eventIndex.set(key,[]);eventIndex.get(key).push(e);}
 const projection=createMpsProjection({...c,days},eventIndex);
 const metric=(material,key,date)=>{
  if(['opening','balance','shortage','safetyGap','expiry'].includes(key)){
   if(v.run&&!coverage(date))return unknown('计划未覆盖','NOT_COVERED');
   const value=projection(material,date);
   if(!value)return unknown('推演所需的库存、数量、日期或单位未提供');
   if(key==='safetyGap'){
    const safety=number(safetyFor(date).get(material['物料编号'])?.['安全库存量']);
    return safety===null?unknown('未提供安全库存目标'):known(Math.max(0,safety-value.balance));
   }
   return known(key==='shortage'?Math.max(0,-value.balance):value[key]);
  }
  if(['firm','completion','mps','suggestMake'].includes(key)&&material['物料来源']==='采购')return na();
  if(['arrival','purchase','suggestBuy'].includes(key)&&material['物料来源']==='制造')return na();
  if(v.run&&!ready)return unknown('选定运行尚无成功结果，冻结原始输入仅供参考','NOT_COVERED');
  if(key==='independent'&&p&&!Array.isArray(p.demandResults))return unknown('运行未提供需求选择结果集合','NOT_PROVIDED');
  if(key==='safety'){
   const m=safetyFor(date).get(material['物料编号']);
   return finite(m?.['安全库存量'])?known(number(m['安全库存量'])):unknown('有效参数未提供安全库存目标');
  }
  if(key==='demand')return sum([metric(material,'independent',date),metric(material,'dependent',date)]);
  if(['completion','mps'].includes(key)&&!coverage(date))return unknown(v.run?'计划未覆盖':'未选择成功运行','NOT_COVERED');
  const relevant=(eventIndex.get(JSON.stringify([material['物料编号'],key]))||[]).filter(e=>e.date===date||e.date===null);
  if(relevant.some(e=>e.date===null))return unknown('来源事件日期未覆盖；'+[...new Set(relevant.filter(e=>e.date===null).map(e=>e.reason))].join('；'));
  if(relevant.some(e=>e.unit!==material['基础单位']))return unknown('来源单位与SKU基础单位不一致，不猜换算');
  if(relevant.some(e=>e.quantity===null))return unknown([...new Set(relevant.filter(e=>e.quantity===null).map(e=>e.reason))].join('；'));
  // Empty can mean real zero only for an explicitly present, complete source.
  const sourceTable={independent:'每日需求',dependent:'物料需求来源',arrival:'既有采购在途',purchase:'既有采购在途',firm:'期初在制',suggestBuy:'采购订单草案',suggestMake:'生产补给建议'}[key];
  if(!relevant.length&&sourceTable&&!own(d.tables,sourceTable)&&!(key==='suggestBuy'&&p&&Array.isArray(p.suggestions)))return unknown('来源集合未提供：'+sourceTable,'NOT_PROVIDED');
  if(!relevant.length&&key==='completion'&&!Array.isArray(p?.tasks))return unknown('运行未提供任务集合','NOT_PROVIDED');
  if(!relevant.length&&key==='independent'&&v.run&&!coverage(date))return unknown('冻结需求选择不覆盖此日期','NOT_COVERED');
  return known(sumKnown(relevant.map(e=>e.quantity)));
 };
 const records=[];
 for(const [id,m]of graph.materials){
  const lead=leads.get(id),lots=stocks.filter(s=>s.materialId===id);
  const sumStock=field=>lots.some(s=>s.values.unit!==m['基础单位'])?null:lots.length?sumKnown(lots.map(s=>s.values[field])):own(d.tables,'期初库存')?0:null;
  const sameDates=new Set(lots.map(s=>s.values.snapshotDate)).size<=1;
  const totals={};for(const [key,,kind]of MPS_METRICS)totals[key]=kind==='时点'?metric(m,key,days.at(-1)):sum(days.map(date=>metric(m,key,date)));
  const reason='冻结来源数量展示；余额按期初＋采购可用＋既有制造＋主计划可用－需求－失效推演；建议不计供给';
  const rawTotal=(kind,field,dateField)=>{
   const rows=details[kind].filter(r=>r.materialId===id&&(kind!=='demands'||r.values.kind==='独立需求'));
   if(rows.some(r=>!r.values[dateField]||r.values.unit!==m['基础单位']))return null;
   return sumKnown(rows.filter(r=>r.values[dateField]>=c.from&&r.values[dateField]<=c.to).map(r=>r.values[field]));
  };
  const values={id,name:m['物料名称']??null,category:m['物料类别']??null,source:m['物料来源']??null,unit:m['基础单位']??null,
   snapshotDate:sameDates?lots[0]?.values.snapshotDate??null:'混合快照，不合计',snapshotPhysical:sameDates?sumStock('quantity'):null,snapshotFree:sameDates?sumStock('free'):null,
   sourceDemand:own(d.tables,'每日需求')&&(!p||Array.isArray(p.demandResults))?rawTotal('demands','original','needDate'):null,sourceOrdered:own(d.tables,'既有采购在途')?rawTotal('incoming','ordered','arrivalDate'):null,
   sourceWIP:own(d.tables,'期初在制')?sumKnown(details.manufacturing.filter(r=>r.materialId===id&&r.values.kind==='既有制造').map(r=>r.values.unit===m['基础单位']?r.values.original:null)):null,
   queryOpening:metric(m,'opening',days[0]),ownLead:lead?.own??null,cumulativeLead:lead?.total??null,
   risk:totals.shortage.state==='KNOWN'&&totals.shortage.value>0?'需求缺口':totals.safetyGap.state==='KNOWN'&&totals.safetyGap.value>0?'低于安全库存':Object.values(totals).some(t=>t.state==='NOT_PROVIDED')?'来源未提供':'正常',coverage:reason,...totals};
  records.push({id,materialId:id,values,refs:[sources('物料主数据',m)]});
  add('parameters','material:'+id,id,{name:values.name,unit:values.unit,ownLead:values.ownLead,cumulativeLead:values.cumulativeLead,leadMeaning:'有效BOM关键路径参考天数，非有限资源承诺',safetyPolicy:m['安全库存策略']??null,safetyDays:number(m['安全库存覆盖天数']),lotSize:number(m['生产批量']),MOQ:number(m['最小订货量']),multiple:number(m['订货倍数']),planner:m['计划员']??'未维护',ATP:'本期不提供',forecast:'本期不提供',fences:'只使用既有明确冻结/保护规则；不猜围栏缩写'},[sources('物料主数据',m)],m);
  add('risks','coverage:'+id,id,{kind:'覆盖与口径',message:reason,condition:'日末总量不证明分钟齐套或客户批次适用；未写回库存/计划'},[sources('物料主数据',m)]);
  add('risks','projection:'+id,id,{kind:'预计数量推演',queryOpening:values.queryOpening,opening:totals.opening,balance:totals.balance,expiry:totals.expiry,shortage:totals.shortage,safetyGap:totals.safetyGap,message:reason},[sources('物料主数据',m),...lots.flatMap(r=>r.refs)]);
 }
 for(const r of table(d,'配置参数'))add('parameters','parameter:'+(r['参数编号']??r._row),r['对象编号'],{parameterId:r['参数编号'],object:r['对象编号'],name:r['参数名称'],value:r['参数值'],unit:r['单位'],effectiveDate:at(v,r['生效日']),expiryDate:at(v,r['失效日']),scope:r._scope??null,sourceRole:r._sourceRole??null,status:'同版本参数原件；实际采用规则见有效参数'},[sources('配置参数',r)],r);
 for(const r of graph.edges)add('parameters','bom:'+r['用量关系编号'],r['父项编号'],{kind:'有效BOM展示边',parent:r['父项编号'],child:r['子项编号'],baseOutput:number(r['父项基准产出千克']),quantity:number(r['子项基准用量']),unit:r['数量单位'],effectiveDate:at(v,r['生效日']),expiryDate:at(v,r['失效日']),condition:'仅用于展示路径，不据展开生成需求；原始多父消耗另保留'},[sources('物料清单',r)],r);
 const filters=q.filters||{};
 if(!filters||typeof filters!=='object'||Array.isArray(filters)||Object.keys(filters).some(k=>!['materialId','category','source','risk'].includes(k)))mpsFail('MPS_FILTER_INVALID');
 const all=records;
 const queryText=typeof q.q==='string'?q.q:'';if(queryText.length>200)mpsFail('MPS_SEARCH_LIMIT');
 let roots=all.filter(r=>[r.id,r.values.name].some(x=>String(x??'').toLowerCase().includes(queryText.toLowerCase()))&&Object.entries(filters).every(([k,s])=>mpsSelected(s,k==='materialId'?r.id:r.values[k]))).map(r=>r.id);
 const scope=expandBom(graph,roots,q.includeBom===true);
 const filtered=all.filter(r=>scope.ids.has(r.id)).map(r=>({...r,values:{...r.values,bomRoots:[...(scope.rootsById.get(r.id)||[])]}}));
 const queryFingerprint=sourceHash({identity:v.identity,quantityPolicy:'source-daily-v1',from:c.from,to:c.to,q:queryText,filters,includeBom:q.includeBom===true});
 return {...c,all,records:filtered,scope,days,metric,projection,queryFingerprint,coverage,reference:c.reference,
  meta:{identity:v.identity,fromDate:c.from,toDateInclusive:c.to,dataMeaning:c.reference,runStatus:v.run?.status??'未选择运行',runWindow:v.run?.selection??null,generatedAt:v.run?.completedAt??v.run?.createdAt??d.createdAt??null,sourceFiles:v.sources?.sourceFiles??[],formulaStatus:'SOURCE_QUANTITY_PROJECTION',quantityBasis:'优先净余或扣执行量；未提供执行记录时直接展示原始需求、订购量及预计合格产出',ATP:'本期不提供',forecast:'本期不提供',cost:'不作成本优化',permissions:'权限测试OUT_OF_SCOPE_BY_USER；既有控制保持',note:'预计余额按来源数量推演；时点余额不按天合计；不跨SKU或异单位合计；建议不进入基准供给。'}};
}

export function mpsSelected(s,value){
 if(!s)return true;
 if(typeof s!=='object'||!['ALL','NONE','VALUES'].includes(s.mode))mpsFail('MPS_SELECTION_INVALID');
 for(const key of ['values','exclude'])if(s[key]!==undefined&&(!Array.isArray(s[key])||s[key].length>1000||s[key].some(x=>typeof x!=='string')))mpsFail('MPS_SELECTION_INVALID');
 if(s.mode==='NONE')return false;
 return s.mode==='ALL'?!s.exclude?.includes(String(value??'未提供')):!!s.values?.includes(String(value??'未提供'));
}

export function mpsSource(c,ref){
 if(ref.table){const row=table(c.d,ref.table).find(r=>c.sources(ref.table,r).key===ref.key&&(ref.row===null||ref.row===r._row));return row?{...anchor(c.snapshot,ref.table,row),identity:c.v.identity}:{...ref,state:'来源行未定位',identity:c.v.identity};}
 return {...ref,runId:c.v.run?.id??null,resultHash:c.v.identity.resultHash??null};
}
export function mpsDisplay(value){return value&&typeof value==='object'&&own(value,'state')?value.state==='KNOWN'?String(value.value):({NOT_APPLICABLE:'不适用',NOT_COVERED:'未覆盖',NOT_PROVIDED:'未提供',PENDING_REVIEW:'未提供'}[value.state]||value.state)+'：'+value.reason:text(value);}
export function mpsPublicRow(row){return {id:row.id,values:row.values,refs:row.refs};}
