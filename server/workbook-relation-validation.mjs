// Pure validation; the approved day profile uses [effective, expiry).
// Locations retain the source row/cells, including every edge in a cycle.
export function validateBomRelations(values,problem) {
 const issues=[],graph=new Map(),pairs=new Map();
 const location=r=>({record:r['用量关系编号'],version:r['清单版本编号'],row:r._row??0,cells:r._cells||{},parent:r['父项编号'],child:r['子项编号'],effective:r['生效日'],expiry:r['失效日']});
 for(const r of values){
  const parent=r['父项编号'],child=r['子项编号'];
  if(!graph.has(parent))graph.set(parent,[]);graph.get(parent).push({id:child,row:r});
  const key=JSON.stringify([parent,child]),previous=pairs.get(key)||[];
  for(const old of previous)if(Number(r['生效日'])<Number(old['失效日'])&&Number(old['生效日'])<Number(r['失效日'])){
   const overlap=[Math.max(Number(r['生效日']),Number(old['生效日'])),Math.min(Number(r['失效日']),Number(old['失效日']))];
   issues.push({...problem('物料清单',r,'生效日',`同一父子关系版本有效期重叠：${old['用量关系编号']} / ${r['用量关系编号']}，区间[${overlap[0]},${overlap[1]})`,'BOM_VERSION_OVERLAP'),relations:[location(old),location(r)],overlap});
  }
  previous.push(r);pairs.set(key,previous);
 }
 // Iterative DFS visits all depths without truncating a third level or using
 // the JavaScript call stack as a BOM depth limit.
 const done=new Set(),active=new Map();
 for(const root of graph.keys()){
  if(done.has(root))continue;
  const stack=[{id:root,next:0,via:null}];active.set(root,0);
  while(stack.length){
   const frame=stack.at(-1),edge=(graph.get(frame.id)||[])[frame.next++];
   if(!edge){done.add(frame.id);active.delete(frame.id);stack.pop();continue;}
   if(active.has(edge.id)){
    const cycle=stack.slice(active.get(edge.id)),chain=[...cycle.map(f=>f.id),edge.id];
    issues.push({...problem('物料清单',edge.row,'子项编号','BOM循环：'+chain.join(' → '),'BOM_CYCLE'),chain,relations:[...cycle.slice(1).map(f=>location(f.via)),location(edge.row)]});
   }else if(!done.has(edge.id)){active.set(edge.id,stack.length);stack.push({id:edge.id,next:0,via:edge.row});}
  }
 }
 return issues;
}
