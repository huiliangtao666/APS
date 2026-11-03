import {assertSnapshot,permit,fail,digest,canonical,LIMITS,bounded,table,number,calendarDay,calendarWindow,resolvedInput,publicValues,anchor,rawRecord,ref,workbookSchema} from './context.mjs';
import {parameterView} from '../parameter-contract.mjs';
import {VIEWS,projectRows,aggregateRows,inventorySummaryRows,graphContext,materialUniverse,sumKnown} from './projections.mjs';
import {candidatePage,changeSelection,selectionPredicate,selectionFingerprint,searchText} from './selections.mjs';
import {taskInterval} from './capacity.mjs';

const fields={
  'demand.daily':['客户编号','区域编号','客户等级'],'demand.details':['客户编号','区域编号','客户等级'],'demand.customers':['客户编号','区域编号','客户等级'],
  'inventory.summary':['仓库编号','质量状态'],'inventory.batches':['仓库编号','质量状态'],
  'capacity.daily':['资源编号','资源组编号','资源类别'],'capacity.equipment':['资源编号','资源组编号','资源类别'],
  'capacity.stops':['资源编号','停机类型'],'capacity.routes':['路线编号','设备组编号','班组编号'],
  'replenishment.purchase':['供应商编号','时序风险'],'replenishment.net':['供应商编号','时序风险'],
  'replenishment.manufacture':['时序风险'],'replenishment.incoming':['供应商编号']};
const allFields=new Set(Object.values(fields).flat());
const viewTables={bom:['物料主数据','物料清单'],demand:['每日需求','客户与交付'],inventory:['期初库存','既有采购在途','期初在制','每日缺料净算'],capacity:['设备与工装','停机安排','工艺路线','班组资源'],replenishment:['采购订单草案','每日缺料净算','生产补给建议','既有采购在途']};
const commonColumns=['materialId','unit','day','quantity','reserved','available','projectedBalance','snapshotDate','date','planStatus','readyDate','arrivalDate','lateDays','actualDelivered','undelivered','ownLeadDays','cumulativeLeadDays','directChildren','roots','selected','meaning','records','status','ordered',
  'leadMeaning','quantityMeaning','root','sequence','rootLeadDays','illustrativeStartDate','illustrativeEndDate','expiresInWindow','customerQualification','storageEnvironment','availableDate','supplyType','physicalStock','reference','allocationGrain','conditional','needDate','orderDate',
  'crewAvailable','crewStandardShifts','crewSundayShifts','start','end','startMinute','endMinute','startTime','endTime','startDate','endDate','knownAsOf','knownDate','standardDailyKg','calendarNumerator','calendarDenominator','calendarRatio','calendarCapacityKg','referenceAvailableKg','knownStopMinutes','occupiedNaturalMinutes','occupationPeak','startedBatchKg','crewPeaks','utilization','waitingLoss','dailyOutputAllocation','capacityMeaning'];
function schemaColumns(d,view,s){return [...commonColumns,...(viewTables[view.split('.')[0]]||[]).flatMap(t=>[
  ...(workbookSchema.tables[t]?.fields||[]).flatMap(f=>[f.name,...(/日$/.test(f.name)?[f.name+'日期']:[])]),...table(d,t).flatMap(r=>Object.keys(publicValues(r)))]),
  ...Object.values(s.run?.result||{}).filter(Array.isArray).flatMap(rs=>rs.flatMap(r=>r&&typeof r==='object'?Object.keys(r):[]))];}
const compare=(a,b)=>a===b?0:a===undefined||a===null?1:b===undefined||b===null?-1:typeof a==='number'&&typeof b==='number'?a-b:String(a)<String(b)?-1:1;
const allowed=new Set(['view','fromDate','toDateInclusive','asOfDate','knownAtDate','unit','includeBom','materialSelections','filters','q','sort','columns','pageSize','cursor','fingerprint']);
function normalize(s,q){
  if(!q||Object.keys(q).some(k=>!allowed.has(k))||!VIEWS[q.view])fail('INVALID_QUERY');
  const window=calendarWindow(s.identity.dayZero,q.fromDate,q.toDateInclusive),asOf=q.view.startsWith('bom.')&&q.asOfDate?calendarDay(s.identity.dayZero,q.asOfDate):window.start;
  const knownAt=q.knownAtDate?calendarDay(s.identity.dayZero,q.knownAtDate):s.run?.selection.currentDay;
  if(['capacity.daily','capacity.stops'].includes(q.view)&&number(knownAt)===null)fail('INFORMATION_AS_OF_REQUIRED');
  if(q.includeBom!==undefined&&typeof q.includeBom!=='boolean')fail('INVALID_BOM_SWITCH');
  if(q.unit!==undefined&&!['千克','箱'].includes(q.unit))fail('INVALID_DEMAND_UNIT');
  if(q.filters&&(!q.filters||typeof q.filters!=='object'||Array.isArray(q.filters)||Object.keys(q.filters).some(f=>!allFields.has(f))))fail('UNKNOWN_FILTER');
  return {view:q.view,window,asOf,knownAt:knownAt??null,unit:q.unit||'千克',includeBom:q.includeBom===true,q:searchText(q.q)};
}
function domain(s,n,field){return selectionFingerprint(s,{view:n.view,window:n.window,asOf:n.asOf,knownAt:n.knownAt,unit:n.unit,includeBom:n.includeBom,field});}
function materialOptions(d,category){return materialUniverse(d).filter(o=>o.category===category);}
export function materialSelectionFingerprint(s,category){assertSnapshot(s);return selectionFingerprint(s,{materialCategory:category});}
function selectedRoots(s,d,q){
  const universe=materialUniverse(d),categories=[...new Set(universe.map(o=>o.category))],input=q.materialSelections??{};
  if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(c=>!categories.includes(c)))fail('INVALID_MATERIAL_CATEGORY');
  const roots=[],selections={};for(const c of categories){const fp=materialSelectionFingerprint(s,c),state=selectionPredicate(input[c],materialOptions(d,c),fp);
    roots.push(...materialOptions(d,c).filter(state.matches).map(x=>x.id));selections[c]={selection:state.selection,selectedCount:state.selectedCount,total:materialOptions(d,c).length};}
  return {roots:[...new Set(roots)].sort(),selections};
}
function filterOptions(rows,field){
  const options=new Map();for(const r of rows)for(const id of Array.isArray(r.values[field])?r.values[field]:[r.values[field]]){if(id!==undefined&&id!==null&&id!==''){const name=field.endsWith('编号')?r.values[field.replace(/编号$/,'名称')]:id;options.set(String(id),{id:String(id),name:String(name??id)});}}
  return [...options.values()];
}
function prepare(s,q,access){
  permit(access);assertSnapshot(s);const n=normalize(s,q),d=resolvedInput(s,n.asOf),selected=selectedRoots(s,d,q),ctx=graphContext(d,n.asOf,selected.roots,n.includeBom);
  n.roots=selected.roots;const rows=projectRows(s,d,n,ctx);
  if(rows.length>LIMITS.records)fail('PROJECTION_TOO_LARGE',413);
  const ids=new Set();for(const r of rows){if(ids.has(r.id))fail('DUPLICATE_BUSINESS_KEY',409,{id:r.id});ids.add(r.id);}
  const filterStates={},active=fields[n.view]||[];
  for(const f of active){const opts=filterOptions(rows,f);filterStates[f]={options:opts,...selectionPredicate(q.filters?.[f],opts,domain(s,n,f))};}
  const mats=ctx.graph.materials;
  let matched=rows.filter(r=>{
    if(n.view==='demand.customers'&&!r.materialIds.some(id=>ctx.scope.ids.has(id)))return false;
    if(n.q&&!canonical(r.values).toLowerCase().includes(n.q))return false;
    return active.every(f=>{
      // Supplier does not apply to manufacturing NC rows. ALL is genuinely
      // unrestricted, including rows with no supplier or no risk classification.
      if(f==='供应商编号'&&n.view==='replenishment.net'&&mats.get(r.values.materialId)?.['物料来源']==='制造')return true;
      const state=filterStates[f];if(state.selection.mode==='ALL'&&!state.selection.exclude.length)return true;
      const value=r.values[f];return (Array.isArray(value)?value:[value]).some(v=>v!==null&&v!==undefined&&state.matches({id:String(v),name:state.options.find(x=>x.id===String(v))?.name||String(v)}));
    });
  });
  if(n.view==='demand.daily')matched=aggregateRows(matched,['materialId','day','需求日日期','unit'],['quantity']);
  if(n.view==='inventory.summary')matched=inventorySummaryRows(matched);
  const matrixColumns=n.view==='inventory.summary'?['materialId','质量状态','unit',...rows.map(r=>r.values.snapshotDate||'日期未提供')]:[];
  const columns=[...new Set([...matched.flatMap(r=>Object.keys(r.values)),...matrixColumns])].sort();
  // Empty results retain a useful schema from unfiltered projected rows.
  const availableColumns=[...new Set(['id',...columns,...rows.flatMap(r=>Object.keys(r.values)),...schemaColumns(d,n.view,s)])].filter(c=>c!=='refs').sort();
  const chosen=q.columns??['id',...columns];
  if(!Array.isArray(chosen)||chosen.length>(n.view==='inventory.summary'?LIMITS.windowDays+8:200)||chosen.some(c=>typeof c!=='string'||!availableColumns.includes(c)))fail('INVALID_COLUMNS');
  const displayColumns=[...new Set(['id',...chosen])];
  const sorts=q.sort??(n.view==='inventory.summary'?['materialId','质量状态','unit'].map(field=>({field,direction:'asc'})):[{field:'id',direction:'asc'}]);
  if(!Array.isArray(sorts)||!sorts.length||sorts.length>5||sorts.some(x=>!availableColumns.includes(x.field)||!['asc','desc'].includes(x.direction)))fail('INVALID_SORT');
  const stableSort=[...sorts.filter(x=>x.field!=='id'),{field:'id',direction:sorts.find(x=>x.field==='id')?.direction||'asc'}];
  matched.sort((a,b)=>{for(const x of stableSort){const v=compare(x.field==='id'?a.id:a.values[x.field],x.field==='id'?b.id:b.values[x.field]);if(v)return x.direction==='desc'?-v:v;}return 0;});
  const queryFingerprint=digest({snapshot:s.fingerprint,...n,materialSelections:selected.selections,filters:Object.fromEntries(active.map(f=>[f,filterStates[f].selection])),sort:stableSort,columns:displayColumns,bom:ctx.graph.fingerprint});
  if(q.fingerprint&&q.fingerprint!==queryFingerprint)fail('QUERY_CONTEXT_CHANGED',409);
  return {s,n,d,ctx,rows:matched,sourceRows:rows,queryFingerprint,stableSort,displayColumns,availableColumns,filterStates,materialSelections:selected.selections};
}
function summary(rows){
  const groups=new Map();for(const r of rows){const unit=r.values.unit;
    if(!unit)continue;const key=JSON.stringify([r.values.materialId??null,unit]),g=groups.get(key)||{materialId:r.values.materialId??null,unit,records:0,amounts:[],unknown:0};
    g.records++;if(number(r.values.quantity)===null)g.unknown++;g.amounts.push(r.values.quantity);groups.set(key,g);}
  return [...groups.values()].map(({amounts,...g})=>({...g,quantity:sumKnown(amounts)}));
}
const cursorEncode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
function offsetOf(q,p,size){
  if(!q.cursor)return 0;let c;try{c=JSON.parse(Buffer.from(q.cursor,'base64url').toString());}catch{fail('INVALID_CURSOR');}
  if(c.queryFingerprint!==p.queryFingerprint||c.pageSize!==size||!Number.isSafeInteger(c.offset)||c.offset<0||c.offset>p.rows.length)fail('CURSOR_CONTEXT_CHANGED',409);return c.offset;
}
function inline(p,r,k){const value=k==='id'?r.id:r.values[k],text=canonical(value),bytes=Buffer.byteLength(text);
  return bytes<=LIMITS.inlineBytes?value:{longValue:true,valueRef:{recordId:r.id,field:k,fingerprint:p.queryFingerprint},bytes,length:text.length,sha256:digest(value),encoding:'canonical-json'};
}
function info(p){return {identity:p.s.identity,snapshotFingerprint:p.s.fingerprint,fingerprint:p.queryFingerprint,view:p.n.view,
  total:p.rows.length,stableSort:p.stableSort,columns:p.displayColumns,availableColumns:p.availableColumns,fixedColumns:[{id:'id',reason:'同版本唯一业务键；固定用于来源与稳定排序'}],
  summaryByMaterialUnit:summary(p.rows),summaryScope:'完整筛选结果；不同物料/单位不合计',bom:{enabled:p.n.includeBom,asOf:p.n.asOf,fingerprint:p.ctx.graph.fingerprint,selectedRoots:p.n.roots,expandedMaterialIds:[...p.ctx.scope.ids],diagnostics:p.ctx.graph.diagnostics},
  materialSelections:p.materialSelections,filters:Object.fromEntries(Object.entries(p.filterStates).map(([k,v])=>[k,{fingerprint:v.selection.fingerprint,selection:v.selection,selected:v.selectedCount,total:v.options.length}])),
  notProvided:p.n.view==='inventory.projected'&&p.s.run?['完整可推预计余额依据']:[],dataMeaning:p.s.run?'冻结运行及其输入':'指定版本输入/参考演算'};}
export function readReport(s,q,access){
  const p=prepare(s,q,access),size=q.pageSize??100;if(![100,200,500].includes(size))fail('UNSUPPORTED_PAGE_SIZE');const offset=offsetOf(q,p,size);
  const result={...info(p),offset,pageSize:size,items:[],nextCursor:null,chunked:false};
  // A logical page may use several bounded chunks. A single overlarge metadata
  // response fails explicitly; long values are fetched losslessly on demand.
  bounded(result,LIMITS.responseBytes);let next=offset;
  for(const r of p.rows.slice(offset,offset+size)){
    const item={id:r.id,values:Object.fromEntries(p.displayColumns.filter(c=>c!=='id').map(k=>[k,inline(p,r,k)])),sourceCount:r.refs.length,runSourceCount:r.runRefs?.length||0,notProvided:r.notProvided||[]};
    result.items.push(item);if(Buffer.byteLength(JSON.stringify(result))>LIMITS.responseBytes-1024){result.items.pop();if(!result.items.length)fail('RESPONSE_TOO_LARGE',413);result.chunked=true;break;}next++;
  }
  result.nextCursor=next<p.rows.length?cursorEncode({queryFingerprint:p.queryFingerprint,pageSize:size,offset:next}):null;
  result.pageComplete=!result.chunked;return bounded(result,LIMITS.responseBytes);
}
export function reportOptions(s,q,{field,category,search='',offset=0,limit=100,action}={},access){
  const p=prepare(s,q,access);let options,selection,fingerprint;
  if(field==='material'){options=materialOptions(p.d,category);fingerprint=materialSelectionFingerprint(s,category);selection=q.materialSelections?.[category];}
  else {if(!p.filterStates[field])fail('FILTER_NOT_APPLICABLE');({options}=p.filterStates[field]);selection=q.filters?.[field];fingerprint=domain(s,p.n,field);}
  if(action)selection=changeSelection(options,selection,action,fingerprint);
  return bounded(candidatePage(options,selection,{search,offset,limit},fingerprint),LIMITS.responseBytes);
}
export function reportValue(s,q,{recordId,field,offset=0},access){
  const p=prepare(s,q,access);if(!q.fingerprint)fail('QUERY_FINGERPRINT_REQUIRED');const r=p.rows.find(x=>x.id===recordId);
  if(!r||!p.availableColumns.includes(field))fail('VALUE_NOT_FOUND',404);
  if(!Number.isSafeInteger(offset)||offset<0)fail('INVALID_VALUE_OFFSET');const value=field==='id'?r.id:r.values[field],text=canonical(value);
  if(offset>text.length)fail('INVALID_VALUE_OFFSET');const chunk=text.slice(offset,offset+LIMITS.valueChunk),next=offset+chunk.length;
  return {identity:s.identity,fingerprint:p.queryFingerprint,recordId,field,encoding:'canonical-json',offset,chunk,total:text.length,nextOffset:next<text.length?next:null,sha256:digest(value)};
}
/** Drilldowns use the original query fingerprint, so members inherit all filters.
 * Source and result rows remain separate. No guessed URL or latest-version lookup. */
export function reportDetail(s,q,{recordId,section='sources',offset=0,limit=100,objectId}={},access){
  const p=prepare(s,q,access);if(!q.fingerprint)fail('QUERY_FINGERPRINT_REQUIRED');const r=p.rows.find(x=>x.id===recordId);if(!r)fail('RECORD_NOT_FOUND',404);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('INVALID_DETAIL_PAGE');
  let items=[];
  if(section==='sources')items=[...new Map(r.refs.map(x=>[canonical(x),x])).values()].map(x=>{const raw=rawRecord(s,x);return {reference:x,source:raw?anchor(s,x.table,raw):null,missing:!raw};});
  else if(section==='members')items=(r.members||[]).map(id=>{const child=p.sourceRows.find(x=>x.id===id);return {id,values:child?.values??null,refs:child?.refs??[]};});
  else if(section==='run')items=(r.runRefs||[]).map(x=>{const values=s.run?.result?.[x.collection]||[],v=x.index!==undefined?values[x.index]:values.find(v=>v.id===x.id);return {reference:x,value:v??null,interval:x.collection==='tasks'&&v?taskInterval(s,v):null,identity:s.identity};});
  else if(section==='mapping')items=(r.mappingRefs||[]).map(x=>{const values=s.input.mapping?.[x.collection]||[],v=x.index!==undefined?values[x.index]:values.find(v=>v.id===x.id);return {reference:x,value:v??null,mappingHash:s.identity.mappingHash};});
  else if(section==='raw')items=r.refs.map(x=>({reference:x,values:rawRecord(s,x)?publicValues(rawRecord(s,x)):null}));
  else if(section==='parameters'){
    const objects=[...new Set([...(r.materialIds||[]),...r.refs.map(x=>x.key)])];if(!objectId||!objects.includes(objectId))fail('PARAMETER_OBJECT_REQUIRED');
    const result=parameterView(p.d,{scope:s.identity.scope,day:s.run?s.run.provenance?.effectiveAt??s.run.selection.startDay:p.n.asOf,object:objectId,offset,limit},s.actor);
    return bounded({identity:s.identity,fingerprint:p.queryFingerprint,section,total:result.total,offset,items:result.records,nextOffset:offset+result.records.length<result.total?offset+result.records.length:null},LIMITS.responseBytes);
  }else if(section==='material'){
    const ids=r.materialIds||[],targets=['物料主数据','单位换算','供应商与供货条件','物料清单'];
    for(const t of targets)for(const x of table(s.input,t))if(ids.includes(x['物料编号'])||t==='物料清单'&&(ids.includes(x['父项编号'])||ids.includes(x['子项编号'])))items.push({reference:ref(t,x),values:publicValues(x),source:anchor(s,t,x)});
  }else fail('UNKNOWN_DETAIL_SECTION');
  return bounded({identity:s.identity,fingerprint:p.queryFingerprint,recordId,section,total:items.length,offset,items:items.slice(offset,offset+limit),nextOffset:offset+limit<items.length?offset+limit:null},LIMITS.responseBytes);
}
export {prepare as prepareReport,info as reportInfo};
