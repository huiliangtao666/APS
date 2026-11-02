import {digest,fail,LIMITS,canonical} from './context.mjs';
const lower=v=>String(v??'').toLowerCase();
export function searchText(q=''){if(typeof q!=='string'||q.length>LIMITS.searchChars)fail('INVALID_SEARCH');return q.trim().toLowerCase();}
export const optionMatch=(o,q)=>!q||lower(o.id).includes(q)||lower(o.name).includes(q);
export function normalizeSelection(selection,fingerprint){
  const s=selection??{mode:'ALL',fingerprint};
  if(!s||typeof s!=='object'||Array.isArray(s)||!['ALL','NONE','VALUES','MATCH'].includes(s.mode))fail('INVALID_SELECTION');
  if(s.fingerprint!==fingerprint)fail('SELECTION_CONTEXT_CHANGED',409);
  if(Object.keys(s).some(k=>!['mode','fingerprint','values','queries','include','exclude'].includes(k)))fail('INVALID_SELECTION');
  const ids=k=>{if(s[k]===undefined)return [];if(!Array.isArray(s[k])||s[k].length>LIMITS.records||s[k].some(x=>typeof x!=='string'||x.length>1024))fail('INVALID_SELECTION');return [...new Set(s[k])].sort();};
  const queries=s.queries??[];if(!Array.isArray(queries)||queries.length>50)fail('INVALID_SELECTION');
  const out={mode:s.mode,fingerprint,values:ids('values'),queries:queries.map(searchText),include:ids('include'),exclude:ids('exclude')};
  if(s.mode==='NONE'&&(out.values.length||out.queries.length||out.include.length||out.exclude.length)||s.mode==='VALUES'&&(!Array.isArray(s.values)||out.queries.length)||s.mode==='MATCH'&&!out.queries.length||s.mode==='ALL'&&(out.values.length||out.queries.length))fail('INVALID_SELECTION');
  return out;
}
export function selectionPredicate(selection,options,fingerprint){
  const s=normalizeSelection(selection,fingerprint),map=new Map(options.map(o=>[o.id,o])),included=new Set([...s.values,...s.include]),excluded=new Set(s.exclude);
  for(const id of [...included,...excluded])if(!map.has(id))fail('OPTION_NOT_IN_SNAPSHOT',409,{id});
  const matches=o=>!excluded.has(o.id)&&(s.mode==='ALL'||included.has(o.id)||s.mode==='MATCH'&&s.queries.some(q=>optionMatch(o,q)));
  return {selection:s,matches,selectedCount:options.filter(matches).length};
}
/** Search edits only the candidate page. Selection changes are explicit; searchAll
 * covers the complete candidate universe, preserving selections hidden by search. */
export function changeSelection(options,selection,action,fingerprint){
  const {selection:s}=selectionPredicate(selection,options,fingerprint);
  if(['all','reset','restore'].includes(action.kind))return {mode:'ALL',fingerprint};
  if(action.kind==='none')return {mode:'NONE',fingerprint};
  const out=structuredClone(s);
  if(action.kind==='toggle'){
    if(!options.some(o=>o.id===action.id)||typeof action.checked!=='boolean')fail('INVALID_SELECTION_ACTION');
    out.include=out.include.filter(id=>id!==action.id);out.exclude=out.exclude.filter(id=>id!==action.id);out.values=out.values.filter(id=>id!==action.id);
    if(action.checked)out.include.push(action.id);else out.exclude.push(action.id);
    if(out.mode==='NONE'&&action.checked){out.mode='VALUES';out.values=[action.id];out.include=[];}
  }else if(action.kind==='searchAll'){
    const q=searchText(action.query);if(!q)return {mode:'ALL',fingerprint};
    if(out.mode==='ALL'){out.exclude=out.exclude.filter(id=>!optionMatch(options.find(o=>o.id===id),q));}
    else {out.mode='MATCH';out.queries=[...new Set([...out.queries,q])];out.include=[...new Set([...out.include,...out.values])];out.values=[];out.exclude=out.exclude.filter(id=>!optionMatch(options.find(o=>o.id===id),q));}
  }else fail('INVALID_SELECTION_ACTION');
  return normalizeSelection(out,fingerprint);
}
export function candidatePage(options,selection,request,fingerprint){
  const q=searchText(request.search),limit=request.limit??LIMITS.candidates,offset=request.offset??0;
  if(!Number.isSafeInteger(limit)||limit<1||limit>LIMITS.candidates||!Number.isSafeInteger(offset)||offset<0)fail('INVALID_CANDIDATE_PAGE');
  const state=selectionPredicate(selection,options,fingerprint),matched=options.filter(o=>optionMatch(o,q)).sort((a,b)=>canonical(a.id)<canonical(b.id)?-1:canonical(a.id)>canonical(b.id)?1:0);
  return {fingerprint,total:options.length,matched:matched.length,selected:state.selectedCount,selection:state.selection,
    items:matched.slice(offset,offset+limit).map(o=>({...o,checked:state.matches(o)})),nextOffset:offset+limit<matched.length?offset+limit:null};
}
export const selectionFingerprint=(s,domain)=>digest({snapshot:s.fingerprint,domain});
