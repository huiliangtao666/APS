import {createMpsReport,MPS_METRICS,MPS_TABLES,mpsFail,mpsSelected,mpsDisplay,mpsPublicRow,mpsSource} from './mps-report.mjs';
import {sourceHash} from './query-reports/source-copy.mjs';

export const MPS_COLUMNS=[['id','物料编号'],['name','物料名称'],['category','类别'],['source','来源'],['unit','基础单位'],['snapshotDate','库存快照日期'],['snapshotPhysical','快照实物（非查询起点库存）'],['snapshotFree','快照自由量'],['sourceDemand','区间原始独立需求（非执行净余）'],['sourceOrdered','区间到货单订购量（非净在途）'],['sourceWIP','快照在制预计产出（非入库净余）'],['queryOpening','查询起点库存'],...MPS_METRICS.map(([k,l])=>[k,l]),['ownLead','本级提前期（天）'],['cumulativeLead','BOM累计提前期（天）'],['risk','风险'],['coverage','覆盖说明'],['bomRoots','BOM展示来源根']].map(([key,label])=>({key,label}));
const fields={kind:'类型',quantity:'数量',original:'原数量',ordered:'订购数量',received:'已收数量',occupied:'占用总量',free:'快照自由量',unit:'单位',needDate:'工厂需料日',customerDate:'客户要求到货日',customer:'客户',earliestArrival:'最早到货日',latestArrival:'最晚到货日',plannedArrival:'计划到货日',status:'状态',condition:'条件与未覆盖',overdue:'期前未清状态待核对',feedTime:'投料分钟',parent:'父批次',need:'关联需求',task:'任务',production:'制造批次',snapshotDate:'快照日期',releaseDate:'放行日期',expiryDate:'到期日期',quality:'质量',warehouse:'仓库',location:'库位',po:'采购单',line:'行号',supplier:'供应商',arrivalDate:'预计到货日',availableDate:'预计可用日',inspectionDays:'检验天数',completionDate:'预计完工日',completionTime:'完工分钟',releaseTime:'放行分钟',startTime:'开工分钟',productionId:'制造批次',taskIds:'关联任务',orderDate:'建议下单/开工日',lateDays:'迟到天数',MOQ:'最小订货量',multiple:'订货倍数',parameterId:'参数编号',object:'对象',name:'名称',value:'参数值',effectiveDate:'生效日期',scope:'范围',sourceRole:'来源层',message:'说明',ownLead:'本级导期（天）',cumulativeLead:'累计导期（天）'};
const columns=records=>[...new Set(records.flatMap(r=>Object.keys(r.values)))].map(key=>({key,label:fields[key]||({id:'来源记录',materialId:'物料编号'}[key])||key}));
function page(records,q){
 const offset=q.offset??0,size=q.pageSize??100;
 if(!Number.isSafeInteger(offset)||offset<0||![100,200,500].includes(size))mpsFail('MPS_PAGE_INVALID');
 const items=[];let bytes=0;
 for(const row of records.slice(offset,offset+size)){const out=mpsPublicRow(row),n=Buffer.byteLength(JSON.stringify(out));if(n>180000)mpsFail('MPS_RECORD_LIMIT',413);if(items.length&&bytes+n>180000)break;items.push(out);bytes+=n;}
 return {records:items,total:records.length,offset,nextOffset:offset+items.length<records.length?offset+items.length:null};
}
function bound(c,q){if(q.queryFingerprint&&q.queryFingerprint!==c.queryFingerprint)mpsFail('MPS_QUERY_CHANGED',409);}
function matrixRows(c,q){
 const material=c.graph.materials.get(q.materialId);
 if(!material||!c.scope.ids.has(q.materialId))mpsFail('MPS_MATERIAL_NOT_SELECTED',404);
 const dateOffset=q.dateOffset??0;if(!Number.isSafeInteger(dateOffset)||dateOffset<0)mpsFail('MPS_DATE_OFFSET_INVALID');
 const days=c.days.slice(dateOffset,dateOffset+31);
 return {materialId:q.materialId,unit:material['基础单位']??null,dates:days,dateOffset,nextDateOffset:dateOffset+days.length<c.days.length?dateOffset+days.length:null,
  records:MPS_METRICS.map(([key,label,kind])=>({id:key,values:{id:label,kind,unit:material['基础单位']??null,...Object.fromEntries(days.map(date=>[date,c.metric(material,key,date)]))}}))};
}
function detailRows(c,q){
 if(!Object.hasOwn(MPS_TABLES,q.table))mpsFail('MPS_TABLE_INVALID');
 if(!c.scope.ids.has(q.materialId))mpsFail('MPS_MATERIAL_NOT_SELECTED',404);
 let rows=c.details[q.table].filter(r=>r.materialId===q.materialId||q.table==='parameters'&&r.id.startsWith('parameter:')&&['CAL','GLOBAL',q.materialId].includes(r.materialId));
 if(q.date&&q.metric){const ids=new Set(c.events.filter(e=>e.materialId===q.materialId&&e.metric===q.metric&&(e.date===q.date||e.date===null)).map(e=>e.record));rows=rows.filter(r=>ids.has(r.id));}
 return rows;
}
function csv(value){const s=mpsDisplay(value);return '"'+(/^[=+\-@\t\r]/.test(s)&&typeof value!=='number'?"'":'')+s.replaceAll('"','""')+'"';}
const xml=v=>mpsDisplay(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
const xmlRow=values=>'<Row>'+values.map(v=>'<Cell><Data ss:Type="'+(typeof v==='number'?'Number':'String')+'">'+xml(v)+'</Data></Cell>').join('')+'</Row>\n';
/** SpreadsheetML 2003 worksheets cannot exceed 65,536 rows. Keep source
 * records intact across bounded sheets while retaining one complete export. */
export function* mpsExcelChunks(rows){
 yield '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
 let sheet=0,count=0;
 for(const row of rows){
  if(count===0){sheet++;yield '<Worksheet ss:Name="生产主计划'+sheet+'"><Table>\n';}
  yield xmlRow(row);count++;
  if(count===60000){yield '</Table></Worksheet>\n';count=0;}
 }
 if(count)yield '</Table></Worksheet>\n';
 yield '</Workbook>';
}
function* outputRows(c,q){
 yield ['报表','生产主计划只读报表'];yield ['同源身份',JSON.stringify(c.meta.identity)];yield ['上下文',JSON.stringify(c.meta)];yield ['查询指纹',c.queryFingerprint];
 const visible=Array.isArray(q.columns)?q.columns:MPS_COLUMNS.map(c=>c.key);
 if(visible.some(k=>!MPS_COLUMNS.some(c=>c.key===k)))mpsFail('MPS_COLUMNS_INVALID');
 yield ['物料总览',...visible.map(k=>MPS_COLUMNS.find(c=>c.key===k).label),'完整来源'];
 for(const r of c.records)yield ['物料',...visible.map(k=>r.values[k]),JSON.stringify(r.refs.map(ref=>mpsSource(c,ref)))];
 yield ['日期矩阵','物料','单位','指标','性质',...c.days];
 for(const r of c.records){const m=c.graph.materials.get(r.id);for(const [key,label,kind]of MPS_METRICS)yield ['日期',r.id,r.values.unit,label,kind,...c.days.map(date=>c.metric(m,key,date))];}
 for(const [kind,label]of Object.entries(MPS_TABLES)){
  yield ['来源明细',label,'物料','记录','字段','值','完整来源'];
  for(const row of c.details[kind])if(c.records.length&&(c.scope.ids.has(row.materialId)||kind==='parameters'&&['CAL','GLOBAL'].includes(row.materialId))){
   const refs=JSON.stringify(row.refs.map(ref=>mpsSource(c,ref)));
   for(const [field,value]of Object.entries(row.raw||row.values)){
    const full=mpsDisplay(value);
    if(full.length<=8192)yield ['来源',label,row.materialId,row.id,field,value,refs];
    else for(let offset=0;offset<full.length;offset+=8192)yield ['来源',label,row.materialId,row.id,field+' [字符 '+offset+'—'+Math.min(full.length,offset+8192)+']',full.slice(offset,offset+8192),refs];
   }
  }
 }
}
export const mpsReportDomain={
 catalog(v){const c=createMpsReport(v);return {meta:c.meta,fromDate:c.from,toDateInclusive:c.to,preferenceScope:sourceHash(v.actor||''),metrics:MPS_METRICS,tables:MPS_TABLES,columns:MPS_COLUMNS};},
 options(v,q){
  if(!['materialId','category','source','risk'].includes(q.field))mpsFail('MPS_FILTER_INVALID');
  const c=createMpsReport(v,q),search=String(q.search||'').toLowerCase();if(search.length>200)mpsFail('MPS_SEARCH_LIMIT');
  const options=new Map();for(const r of c.all){const id=String(q.field==='materialId'?r.id:r.values[q.field]??'未提供');options.set(id,{id,label:q.field==='materialId'?id+' · '+(r.values.name??'未维护'):id,selected:mpsSelected(q.filters?.[q.field],id)});}
  const items=[...options.values()].filter(r=>r.label.toLowerCase().includes(search)),offset=q.optionOffset??0;
  if(!Number.isSafeInteger(offset)||offset<0)mpsFail('MPS_OFFSET_INVALID');
  return {items:items.slice(offset,offset+100),total:items.length,selectedTotal:[...options.values()].filter(i=>i.selected).length,nextOffset:offset+100<items.length?offset+100:null};
 },
 query(v,q){const c=createMpsReport(v,q);bound(c,q);return {...page(c.records,q),columns:MPS_COLUMNS,meta:c.meta,queryFingerprint:c.queryFingerprint,diagnostics:c.diagnostics};},
 matrix(v,q){const c=createMpsReport(v,q);bound(c,q);return {...matrixRows(c,q),queryFingerprint:c.queryFingerprint,meta:c.meta};},
 detail(v,q){const c=createMpsReport(v,q);bound(c,q);const rows=detailRows(c,q),out=page(rows,q);return {...out,columns:columns(out.records),queryFingerprint:c.queryFingerprint,meta:c.meta};},
 source(v,q){const c=createMpsReport(v,q);bound(c,q);const row=detailRows(c,q).find(r=>r.id===q.id);if(!row)mpsFail('MPS_RECORD_NOT_FOUND',404);
  const value=JSON.stringify({identity:v.identity,refs:row.refs.map(ref=>mpsSource(c,ref)),record:row.raw||row.values}),offset=q.valueOffset??0;
  if(!Number.isSafeInteger(offset)||offset<0)mpsFail('MPS_OFFSET_INVALID');
  return {text:value.slice(offset,offset+8192),nextOffset:offset+8192<value.length?offset+8192:null,queryFingerprint:c.queryFingerprint};
 },
 export(v,q){const c=createMpsReport(v,q);bound(c,q);if(!['csv','excel'].includes(q.format))mpsFail('MPS_EXPORT_FORMAT');
  // Validate selected columns before headers are committed by the transport.
  if(q.columns!==undefined&&(!Array.isArray(q.columns)||q.columns.some(k=>!MPS_COLUMNS.some(c=>c.key===k))))mpsFail('MPS_COLUMNS_INVALID');
  function* chunks(){
   if(q.format==='csv'){yield '\ufeff';for(const row of outputRows(c,q))yield row.map(csv).join(',')+'\r\n';}
   else yield* mpsExcelChunks(outputRows(c,q));
  }
  return {chunks:chunks(),filename:q.format==='csv'?'mps-report.csv':'mps-report.xml',type:q.format==='csv'?'text/csv; charset=utf-8':'application/vnd.ms-excel; charset=utf-8',fingerprint:sourceHash({query:c.queryFingerprint,columns:q.columns??null})};
 }
};
