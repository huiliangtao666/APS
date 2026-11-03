export type QueryApi = (path:string, body?:object)=>Promise<any>;
export type QueryContext = {datasetId:string; version:number; runId?:string};
export type QueryIdentity = QueryContext & {
  fingerprint:string; inputHash?:string; parameterHash?:string; mappingHash?:string;
  resultHash?:string; fileHash?:string; dayZero:string; timeUnit?:string; minuteOrigin?:string;
};
export type QuerySelection = {mode:'ALL'|'NONE'|'VALUES'|'MATCH';fingerprint?:string;values?:string[];queries?:string[];include?:string[];exclude?:string[]};
export type QueryColumn = {key:string; label:string; fixed?:boolean;fixedLabel?:string;sticky?:'material'|'quality'|'unit';sortable?:boolean; format?:'date'|'instant'|'duration'|'value'|'inventory';timeUnit?:'day'|'minute'};
export type QueryFilter = {key:string; label:string; kind?:'material'|'business'};
export type QueryView = {id:string; label:string; report:string; key:string; columns:QueryColumn[]; filters:QueryFilter[]; note?:string};
export type QueryCatalog = {identity:QueryIdentity; preferenceScope:string; views:QueryView[]; fromDate:string; toDateInclusive:string; note?:string};
export type QueryDraft = {q:string; filters:Record<string,QuerySelection>; includeBom:boolean; fromDate:string; toDateInclusive:string; bomAsOfDate:string; knownAsOfDate:string; sort:string; direction:'asc'|'desc'; pageSize:number; offset:number;unit?:string};
export type QueryRecord = {id:string; values:Record<string,unknown>; rootMaterial?:{id:string;name:string;category:string}|null; [key:string]:unknown};
export type QueryPage = {identity:QueryIdentity; queryFingerprint:string; view:string; records:QueryRecord[]; total:number; offset:number; nextOffset:number|null; columns:QueryColumn[]; summaryByUnit?:unknown; diagnostics?:{code:string;message:string}[]; notProvided?:string[]; note?:string};
export type QueryOptions = {identity:QueryIdentity; items:{id:string;label:string;selected:boolean}[]; total:number; selectedTotal:number; nextOffset:number|null; selection:QuerySelection;matched:number};
export const queryReports = [['bom','物料BOM'],['demand','需求'],['inventory','库存'],['capacity','产能'],['replenishment','补料']] as const;

export function queryUrl(kind:string, value:object) {
  const payload=JSON.stringify(value);
  if(payload.length>12000)throw Error('筛选条件过长，请恢复不限后重新选择');
  return '/workbooks/query-reports/'+kind+'?request='+encodeURIComponent(payload);
}
export function sameQueryIdentity(a:QueryIdentity,b:QueryIdentity) {
  return ['datasetId','version','runId','fingerprint','inputHash','parameterHash','mappingHash','resultHash','dayZero','minuteOrigin'].every(k=>a[k as keyof QueryIdentity]===b[k as keyof QueryIdentity]);
}
export function queryInitial(c:QueryCatalog):QueryDraft {
  return {q:'',filters:{},includeBom:false,fromDate:c.fromDate,toDateInclusive:c.toDateInclusive,bomAsOfDate:c.fromDate,knownAsOfDate:c.fromDate,sort:'',direction:'asc',pageSize:100,offset:0};
}
/** Removed filters must not survive in cached drafts or inherited navigation. */
export function queryDraftForView(view:QueryView,draft:QueryDraft):QueryDraft{
  if(view.id==='capacity.equipment')return {...draft,q:'',includeBom:false,filters:Object.fromEntries(Object.entries(draft.filters).filter(([key])=>['资源编号','资源组编号','资源类别'].includes(key)))};
  if(view.id==='capacity.stops')return {...draft,q:'',includeBom:false,filters:Object.fromEntries(Object.entries(draft.filters).filter(([key])=>key==='资源编号'))};
  if(view.id==='inventory.summary'&&!['materialId','质量状态','unit'].includes(draft.sort))return {...draft,sort:'',direction:'asc'};
  if(!['demand.daily','demand.details','capacity.routes'].includes(view.id))return draft;
  const allowed=new Set(view.filters.map(f=>f.key));
  return {...draft,filters:Object.fromEntries(Object.entries(draft.filters).filter(([key])=>allowed.has(key)))};
}
export function queryValue(value:unknown,column:QueryColumn,identity?:QueryIdentity) {
  if(value===null||value===undefined||value==='')return '— 未提供';
  if(column.format==='inventory'&&typeof value==='object'){const cell=value as Record<string,unknown>;return ['quantity','reserved','available'].map(key=>cell[key]===null||cell[key]===undefined?'—':String(cell[key])).join(' / ');}
  if((column.format==='date'||column.format==='instant')&&typeof value==='string'&&/^-?\d+(\.\d+)?$/.test(value))value=Number(value);
  if(typeof value==='number'&&Number.isFinite(value)&&identity&&(column.format==='date'||column.format==='instant')){
    if(column.timeUnit==='minute'){
      if(!identity.minuteOrigin)return String(value)+'（分钟原点未提供）';
      const zone=identity.minuteOrigin.match(/([+-])(\d\d):(\d\d)$/),shift=zone?(zone[1]==='+'?1:-1)*(Number(zone[2])*60+Number(zone[3])):0;
      const point=Date.parse(identity.minuteOrigin)+(value+shift)*60000;
      if(!Number.isFinite(point)||!Number.isFinite(new Date(point).getTime()))return String(value)+'（时间原点无效）';
      return displayTime(new Date(point).toISOString(),column.format);
    }
    const point=Date.parse(identity.dayZero+'T00:00:00Z')+value*86400000;
    if(!Number.isFinite(point)||!Number.isFinite(new Date(point).getTime()))return String(value)+'（日零点无效）';
    return displayTime(new Date(point).toISOString(),column.format);
  }
  if(column.format==='date'&&typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value.replace(/-/g,'.');
  if(typeof value==='object')return JSON.stringify(value);
  return String(value);
}
function displayTime(iso:string,format:string){
  const date=iso.slice(0,10).replace(/-/g,'.');if(format==='date')return date;
  const fractional=iso.slice(20,23)!=='000',seconds=iso.slice(17,19)!=='00';
  return date+' '+iso.slice(11,fractional?23:seconds?19:16);
}
