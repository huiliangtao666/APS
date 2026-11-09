import {createReportSnapshot,readReport,reportOptions,reportDetail,reportValue,openReportExport,VIEWS,dayCalendar} from './query-reports/index.mjs';
import {processDiagram} from './query-reports/process-diagram.mjs';
import {bomProducts} from './query-reports/bom-products.mjs';
import {parameterMaintenanceView} from './parameter-maintenance.mjs';

const access={read:true,export:true}; // Only reached AFTER existing permission middleware.
const fail=(code,status=422)=>{throw Object.assign(Error(code),{code,status});};
function snapshot(v){return createReportSnapshot({...(v.run?{frozenInput:v.input,run:v.run}:{dataset:v.input}),datasetId:v.identity.datasetId,version:v.identity.version,dayZero:v.identity.dayZero,scope:v.identity.scope,actor:v.actor},access);}
const filterFields={demand:['客户编号','区域编号','客户等级'],'inventory.summary':['仓库编号','质量状态'],'inventory.batches':['仓库编号','质量状态'],'capacity.daily':['资源编号','资源组编号','资源类别'],'capacity.equipment':['资源编号','资源组编号','资源类别'],'capacity.stops':['资源编号'],'capacity.routes':['路线编号','设备组编号','班组编号'],'replenishment.purchase':['供应商编号','时序风险'],'replenishment.net':['供应商编号','时序风险'],'replenishment.manufacture':['时序风险'],'replenishment.incoming':['供应商编号']};
const labels={crewAvailable:'每班可用人数',crewStandardShifts:'标准日班次数',crewSundayShifts:'周日班次数',id:'业务键',materialId:'物料编号',unit:'单位',day:'业务日期',quantity:'数量',reserved:'预留数量',available:'可用数量',projectedBalance:'预计余额',snapshotDate:'快照日期',planStatus:'计划状态',readyDate:'就绪日期',arrivalDate:'到货日期',lateDays:'迟到天数',actualDelivered:'实际交付',undelivered:'未交付量',ownLeadDays:'本层提前期（天）',cumulativeLeadDays:'累计提前期（天）',roots:'根物料',selected:'已选',meaning:'业务含义',records:'记录数',status:'状态',ordered:'已有下单',reference:'参考演算',supplyType:'供给类型',physicalStock:'实物库存',quantityMeaning:'数量口径',leadMeaning:'提前期口径',conditional:'条件未验证',start:'开始',end:'结束',startMinute:'开始分钟',endMinute:'结束分钟',startTime:'开始时间',endTime:'结束时间',startDate:'开始日期',endDate:'结束日期',knownAsOf:'信息截至日期',standardDailyKg:'标准日产能（kg）',utilization:'利用率',waitingLoss:'待料损失',occupationPeak:'占用峰值',occupiedNaturalMinutes:'占用自然分钟',dailyOutputAllocation:'日内产出分配',capacityMeaning:'产能口径',crewPeaks:'班组峰值',calendarRatio:'日历比例',calendarCapacityKg:'日历产能（kg）',referenceAvailableKg:'参考可用能力（kg）',knownStopMinutes:'已知停机分钟',startedBatchKg:'开始批重量（kg）'};
function column(key,identity,view){if(view==='inventory.summary'){const dimensions={materialId:['物料编码','material'],'质量状态':['质量状态','quality'],unit:['单位','unit']};if(dimensions[key])return {key,label:dimensions[key][0],fixed:true,fixedLabel:'固定维度',sticky:dimensions[key][1]};if(/^\d{4}-\d{2}-\d{2}$/.test(key)||key==='日期未提供')return {key,label:key,format:'inventory',sortable:false};}const minute=['startMinute','endMinute'].includes(key)||identity.timeUnit==='minute'&&['start','end'].includes(key);return {key,label:labels[key]||key,fixed:key==='id',...(minute?{format:'instant',timeUnit:'minute'}:/日期$/.test(key)||/(Date|Time)$/.test(key)?{format:'date'}:key==='day'||/^(start|end|knownAsOf)$/.test(key)||/日$/.test(key)&&!/(工时|等待|提前|运输|周期|间隔)/.test(key)?{format:'date',timeUnit:'day'}:{})};}
const compactDemand=id=>['demand.daily','demand.details'].includes(id);
const productOnly=id=>compactDemand(id)||id==='capacity.routes';
const reportDates=v=>({fromDate:dayCalendar(v.identity.dayZero,v.run?.selection.startDay??1),toDateInclusive:dayCalendar(v.identity.dayZero,(v.run?.selection.endDay??15)-1)});
function filters(v,id){const categories=[...new Set((v.input.tables['物料主数据']||[]).map(r=>r['物料类别']||'未提供类别'))];return [...categories.filter(c=>!['capacity.stops','capacity.equipment'].includes(id)&&(!productOnly(id)||c==='成品')).map(c=>({key:'material:'+c,label:c,kind:'material'})),...(filterFields[id]||filterFields[id.split('.')[0]]||[]).filter(key=>!compactDemand(id)||key!=='客户等级').map(key=>({key,label:key==='路线编号'?key:key.replace(/编号$/,''),kind:'business'}))];}
function query(q,v){
  const f=q.filters||{},materialSelections={},business={};
  for(const [k,s]of Object.entries(f)){if(q.view==='capacity.stops'&&k!=='资源编号')continue;if(q.view==='capacity.equipment'&&!filterFields[q.view].includes(k))continue;if(productOnly(q.view)&&k.startsWith('material:')&&k!=='material:成品'||compactDemand(q.view)&&k==='客户等级')continue;if(k.startsWith('material:'))materialSelections[k.slice(9)]=s;else business[k]=s;}
  // Routes and equipment describe master data. Discard dates retained by earlier UI versions.
  if(['capacity.routes','capacity.equipment'].includes(q.view)){const dates=reportDates(v);q={...q,...dates,bomAsOfDate:dates.fromDate,knownAsOfDate:dates.fromDate};}
  // Resource queries discard legacy keyword/BOM controls; stops retain the selected interval.
  if(['capacity.stops','capacity.equipment'].includes(q.view)){const dates=reportDates(v);q={...q,q:'',includeBom:false,bomAsOfDate:dates.fromDate,knownAsOfDate:dates.fromDate};}
  return {view:q.view,fromDate:q.fromDate,toDateInclusive:q.toDateInclusive,asOfDate:q.bomAsOfDate,knownAtDate:q.knownAsOfDate,includeBom:q.includeBom===true,q:q.q||'',materialSelections,filters:business,pageSize:q.pageSize||100,...(q.unit?{unit:q.unit}:{}),...(q.sort?{sort:[{field:q.sort,direction:q.direction||'asc'}]}:{})};
}
function detailQuery(q,v){return {...query(q.query||q,v),fingerprint:q.queryFingerprint};}
export const workbookReportDomain={
  parameters(v,q){
    const scope=v.identity.scope,at=v.run?.provenance?.effectiveAt??v.run?.selection.startDay;
    // Bound context has already verified the frozen actor and scope. The run's
    // computation input omits the mutable trial catalogue; supply only its own
    // scope metadata locally so the shared reader can resolve frozen values.
    const d=v.run&&scope!=='dataset'?{...v.input,parameterTrials:[{id:scope.slice(6),actor:v.actor,name:'冻结运行试算'}]}:v.input;
    const view=parameterMaintenanceView(d,{...q.parameters,collection:'capacity',scope,...(v.run?{day:at,limit:5}:{})},v.actor);
    if(v.run){
      // Definitions already travel once in view.definitions. Avoid repeating
      // their complete field catalogue in every frozen matrix cell.
      view.objectRows=view.objectRows.map(row=>({...row,cells:row.cells.map(p=>({...p,definition:{'参数编号':p.cp,'中文配置项':p.definition['中文配置项']}}))}));
      view.records=view.objectRows.flatMap(row=>row.cells);
    }
    return {...view,readOnly:!!v.run};
  },
  products(v,q){return bomProducts(snapshot(v),q);},
  process(v,q){return processDiagram(snapshot(v),q);},
  catalog(v){snapshot(v);const start=v.run?.selection.startDay??1,end=v.run?.selection.endDay??15;
    return {views:Object.entries(VIEWS).map(([id,label])=>({id,label,report:id.split('.')[0],key:'id',columns:[],filters:filters(v,id)})),fromDate:dayCalendar(v.identity.dayZero,start),toDateInclusive:dayCalendar(v.identity.dayZero,end-1),note:v.run?'冻结运行及其输入；实际交付与缺失分钟条件不补造。':'指定版本输入与原参考演算；不代表真实计算结果。'};},
  options(v,q){const s=snapshot(v),input=query(q.query||q,v),field=q.field?.startsWith('material:')?'material':q.field,category=field==='material'?q.field.slice(9):undefined;
    const r=reportOptions(s,input,{field,category,search:q.search||'',offset:q.offset||0,limit:100,action:q.action},access);
    return {...r,selectedTotal:r.selected,items:r.items.map(o=>({id:o.id,label:o.id+(o.name&&o.name!==o.id?' · '+o.name:''),selected:o.checked}))};},
  query(v,q){const s=snapshot(v),input=query(q,v),first=readReport(s,input,access),offset=q.chunkOffset??q.offset??0;
    if(!Number.isSafeInteger(offset)||offset<0)fail('INVALID_OFFSET');
    const r=offset?readReport(s,{...input,fingerprint:q.queryFingerprint||first.fingerprint,cursor:Buffer.from(JSON.stringify({queryFingerprint:first.fingerprint,pageSize:input.pageSize,offset})).toString('base64url')},access):first;
    const materials=q.view==='bom.paths'?new Map((v.input.tables['物料主数据']||[]).map(m=>[m['物料编号'],m])):null;
    return {queryFingerprint:r.fingerprint,view:q.view,...(q.view==='bom.materials'?{materialSelections:r.materialSelections}:{}),records:r.items.map(i=>{const root=materials?.get(i.values.root);return {...i,...(materials?{rootMaterial:root?{id:root['物料编号'],name:root['物料名称']||'',category:root['物料类别']||''}:null}:{}),values:{id:i.id,...i.values}};}),total:r.total,offset:r.offset,nextOffset:r.nextCursor? r.offset+r.items.length:null,columns:(q.view==='inventory.summary'?['materialId','质量状态','unit',...r.columns.filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)||k==='日期未提供').sort()]:r.columns.filter(k=>q.view!=='demand.daily'||k!=='id')).map(k=>column(k,v.identity,q.view)),summaryByUnit:r.summaryByMaterialUnit,diagnostics:r.bom.diagnostics.map(d=>typeof d==='string'?{code:d,message:d}:{code:d.code||'BOM',message:JSON.stringify(d)}),notProvided:r.notProvided,note:q.view==='inventory.summary'?r.dataMeaning+' · 按导入库存快照日期 · 日期格：库存 / 预留 / 可用':r.dataMeaning,chunked:r.chunked};},
  detail(v,q){const s=snapshot(v),input=detailQuery(q,v),section=q.table==='record'?'raw':q.table||'sources';
    const r=reportDetail(s,input,{recordId:q.id,section,offset:q.offset||0,limit:100,objectId:q.objectId},access);
    const records=r.items.map((item,i)=>({id:String(item.id||item.reference?.key||i+(q.offset||0)),values:{id:item.id||item.reference?.key||i+(q.offset||0),...Object.fromEntries(Object.entries(item).map(([k,val])=>[k,val]))}}));
    const keys=[...new Set(records.flatMap(r=>Object.keys(r.values)))];
    const materials=[...new Set(r.items.flatMap(i=>['物料编号','成品编号','所需物料编号'].map(k=>i.values?.[k])).filter(x=>typeof x==='string'&&x))];
    const links=materials.flatMap(key=>[['bom.materials','物料与BOM'],['demand.details','需求明细'],['inventory.batches','库存批次'],['replenishment.net','缺料净算']].filter(([view])=>view!==input.view).map(([view,label])=>({view,key,label:key+' · '+label})));
    const maintenanceTargets=r.items.filter(i=>i.reference?.table&&i.reference?.key).map(i=>({table:i.reference.table,key:i.reference.key}));
    return {links,maintenanceTargets,queryFingerprint:r.fingerprint,total:r.total,nextOffset:r.nextOffset,records,columns:keys.map(k=>column(k,v.identity)),tables:[['record','原始记录'],['sources','文件与源行'],['members','组成明细'],['material','关联物料'],['run','冻结结果'],['mapping','运行映射'],['parameters','有效参数']].map(([id,label])=>({id,label})),sources:r.items.filter(i=>i.source).map(i=>({...i.source,sheet:i.source.table,row:i.source.physicalRow,key:i.source.businessKey})),note:'保留原始文件/行/业务键与冻结身份；参数页须指定当前记录的物料或来源业务键。'};},
  value(v,q){return reportValue(snapshot(v),detailQuery(q,v),{recordId:q.id,field:q.field,offset:q.offset||0},access);},
  export(v,q){const s=snapshot(v),original={...query(q,v),fingerprint:q.queryFingerprint};
    readReport(s,original,access);
    const input={...query(q,v),...(q.columns?.length?{columns:q.columns}:{})};
    input.fingerprint=readReport(s,input,access).fingerprint;
    // Keep the same query columns/fingerprint; visible columns are a presentation
    // preference, not a new result identity. Export retains all queried fields.
    return openReportExport(s,input,{scope:q.scope==='SELECTED'?'SELECTED':'ALL_MATCHED',...(q.scope==='SELECTED'?{selectedIds:q.ids}:{})},access).chunks;}
};
