import {sourceRole,scopeOf,semanticIdentity,layerIdentity,tagParameterSources} from './parameter-contract.mjs';

const sourceSummary=p=>({'参数编号':p['参数编号'],'参数值':p['参数值'],'单位':p['单位'],'生效日':p['生效日'],'失效日':p['失效日'],sourceRole:sourceRole(p),source:p._source});
const intersects=(a,b)=>Number(a['生效日'])<Number(b['失效日'])&&Number(b['生效日'])<Number(a['失效日']);
// Preserve source PA, including the source interval, when a later revision only
// replaces part of the same semantic interval. This never merges source levels.
export function replaceIntervals(existing,incoming){
 let result=existing;
 for(const next of incoming){
  result=result.flatMap(old=>{
   if(layerIdentity(old)!==layerIdentity(next)||!intersects(old,next))return [old];
   const pieces=[],from=Number(old['生效日']),to=Number(old['失效日']);
   const slice=(a,b)=>({...old,'生效日':String(a),'失效日':String(b),_segment:a+':'+b,_sourceInterval:old._sourceInterval||[old['生效日'],old['失效日']]});
   if(from<Number(next['生效日']))pieces.push(slice(from,Number(next['生效日'])));
   if(Number(next['失效日'])<to)pieces.push(slice(Number(next['失效日']),to));
   return pieces;
  });
  result.push(next);
 }
 return result;
}
export function parameterThreeWay(d,incoming){
 tagParameterSources(d);
 return incoming.map(p=>({semantic:semanticIdentity(p),sourceId:p['参数编号'],from:p['生效日'],to:p['失效日'],nextP:p['参数值']??null,
  business:(d.tables['配置参数']||[]).filter(x=>sourceRole(x)==='B'&&semanticIdentity(x)===semanticIdentity(p)&&intersects(x,p)).map(sourceSummary),
  previousP:(d.tables['配置参数']||[]).filter(x=>sourceRole(x)==='P'&&scopeOf(x)===scopeOf(p)&&semanticIdentity(x)===semanticIdentity(p)&&intersects(x,p)).map(sourceSummary),
  online:(d.tables['配置参数']||[]).filter(x=>sourceRole(x)==='EDIT'&&scopeOf(x)===scopeOf(p)&&semanticIdentity(x)===semanticIdentity(p)&&intersects(x,p)).map(sourceSummary)}));
}
export function removeConfirmedOverlays(existing,incoming){
 // The preview has an explicit replace/keep decision. Only matching intervals
 // and the dataset scope are replaced; unrelated trial edits are untouched.
 const replacements=incoming.map(p=>({...p,_sourceRole:'EDIT'}));
 return replaceIntervals(existing.filter(p=>sourceRole(p)==='EDIT'),replacements).filter(p=>!replacements.includes(p));
}
