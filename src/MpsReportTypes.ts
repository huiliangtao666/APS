import type {QueryApi,QueryContext,QueryIdentity} from './QueryReportsTypes';
import {sameQueryIdentity} from './QueryReportsTypes';
export type {QueryApi,QueryContext,QueryIdentity};
export type MpsSelection={mode:'ALL'|'NONE'|'VALUES';values?:string[];exclude?:string[]};
export type MpsQuery={fromDate:string;toDateInclusive:string;q:string;filters:Record<string,MpsSelection>;includeBom:boolean;pageSize:number;offset:number};
export type MpsCell={value:number|null;state:string;reason:string};
export function mpsUrl(kind:string,value:object){const payload=JSON.stringify(value);if(payload.length>12000)throw Error('筛选条件过长，请恢复全选');return '/workbooks/mps-report/'+kind+'?request='+encodeURIComponent(payload);}
export function mpsValue(value:unknown):string{
 if(value===null||value===undefined||value==='')return '未提供';
 if(typeof value==='object'&&'state' in value){const c=value as MpsCell;const labels:Record<string,string>={NOT_APPLICABLE:'不适用',NOT_COVERED:'未覆盖',NOT_PROVIDED:'未提供',PENDING_REVIEW:'待核对'};return c.state==='KNOWN'?String(c.value):(labels[c.state]||c.state)+(c.reason?' · '+c.reason:'');}
 return typeof value==='object'?JSON.stringify(value):String(value);
}
export function mpsChecked(s:MpsSelection,id:string){return s.mode==='ALL'?!s.exclude?.includes(id):s.mode==='VALUES'?!!s.values?.includes(id):false;}
export function mpsToggle(s:MpsSelection,id:string,checked:boolean):MpsSelection{
 if(s.mode==='ALL')return {mode:'ALL',exclude:checked?(s.exclude||[]).filter(v=>v!==id):[...new Set([...(s.exclude||[]),id])]};
 const values=s.mode==='VALUES'?s.values||[]:[];return {mode:'VALUES',values:checked?[...new Set([...values,id])]:values.filter(v=>v!==id)};
}

/** One logical 100/200/500 page assembled from bounded same-source responses. */
export async function readMpsPage(api:QueryApi,kind:'query'|'detail',request:any){
 let first:any,offset=request.offset??0;const records:any[]=[],columns=new Map<string,any>();
 do{
  const r=await api(mpsUrl(kind,{...request,offset,...(first?{queryFingerprint:first.queryFingerprint}:{})}));
  if(!sameQueryIdentity(request.identity,r.identity)||first&&first.queryFingerprint!==r.queryFingerprint)throw Error('报表分块身份变化');
  first=first||r;for(const c of r.columns)columns.set(c.key,c);
  const take=r.records.slice(0,request.pageSize-records.length);records.push(...take);
  if(r.nextOffset===null||records.length>=request.pageSize)break;
  if(!take.length||r.nextOffset<=offset)throw Error('报表分块没有前进');offset=r.nextOffset;
 }while(records.length<request.pageSize);
 const start=request.offset??0;return {...first,records,columns:[...columns.values()],offset:start,nextOffset:start+records.length<first.total?start+records.length:null};
}
