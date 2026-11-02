import {table,number,digest,fail,ref} from './context.mjs';

/** Effective downward graph only. Version ambiguity is retained as diagnostics;
 * affected lead totals remain unknown, rather than selecting a convenient edge. */
export function effectiveBom(d,day){
  if(number(day)===null)fail('BOM_DATE_REQUIRED');
  const materials=new Map(table(d,'物料主数据').map(r=>[r['物料编号'],r])),children=new Map(),diagnostics=[],edges=[];
  const ids=new Set(),versions=new Map(),pairs=new Map(),bad=new Set();
  for(const r of table(d,'物料清单')){
    const start=number(r['生效日']),end=number(r['失效日']);
    if(start===null||end===null||end<=start){diagnostics.push({code:'BOM_INVALID_INTERVAL',relation:r['用量关系编号'],source:ref('物料清单',r)});bad.add(r['父项编号']);continue;}
    if(!(start<=day&&day<end))continue;
    const parent=r['父项编号'],child=r['子项编号'],id=r['用量关系编号'];
    if(ids.has(id)){diagnostics.push({code:'BOM_DUPLICATE_RELATION',relation:id,parent,child});bad.add(parent);continue;}ids.add(id);
    if(!materials.has(parent)||!materials.has(child)){diagnostics.push({code:'BOM_MISSING_MATERIAL',relation:id,parent,child});bad.add(parent);}
    const pv=versions.get(parent)||new Set();pv.add(r['清单版本编号']??null);versions.set(parent,pv);
    const pair=JSON.stringify([parent,child]),previous=pairs.get(pair);
    if(previous){diagnostics.push({code:'BOM_EDGE_CONFLICT',parent,child,relations:[previous['用量关系编号'],id]});bad.add(parent);}pairs.set(pair,r);
    if(number(r['父项基准产出千克'])===null||number(r['父项基准产出千克'])<=0||number(r['子项基准用量'])===null||!r['数量单位'])diagnostics.push({code:'BOM_QUANTITY_OR_UNIT_MISSING',relation:id});
    const base=materials.get(child)?.['基础单位'];
    if(base&&r['数量单位']!==base&&!table(d,'单位换算').some(u=>u['物料编号']===child&&u['换算前单位']===r['数量单位']&&u['换算后单位']===base&&number(u['换算系数'])>0))diagnostics.push({code:'BOM_UNIT_CONVERSION_MISSING',relation:id,child,unit:r['数量单位'],baseUnit:base});
    edges.push(r);if(!children.has(parent))children.set(parent,[]);children.get(parent).push(r);
  }
  for(const [parent,v]of versions)if(v.size>1){diagnostics.push({code:'BOM_VERSION_CONFLICT',parent,versions:[...v]});bad.add(parent);}
  // Iterative DFS avoids recursion overflow for deep but valid imported BOMs.
  const state=new Map();
  for(const root of materials.keys()){
    if(state.get(root))continue;const stack=[{id:root,i:0}];state.set(root,1);
    while(stack.length){const top=stack.at(-1),cs=children.get(top.id)||[];
      if(top.i>=cs.length){state.set(top.id,2);stack.pop();continue;}
      const child=cs[top.i++]['子项编号'];
      if(state.get(child)===1){const path=[...stack.slice(stack.findIndex(x=>x.id===child)).map(x=>x.id),child];diagnostics.push({code:'BOM_CYCLE',path});path.forEach(x=>bad.add(x));}
      else if(!state.get(child)){state.set(child,1);stack.push({id:child,i:0});}
    }
  }
  return {materials,children,edges,diagnostics,bad,fingerprint:digest({day,edges})};
}
export function expandBom(graph,roots,include=false){
  const ids=new Set(roots),rootsById=new Map(),edges=new Map();
  for(const root of roots){const seen=new Set(),queue=[root];
    for(let i=0;i<queue.length;i++){const id=queue[i];if(seen.has(id))continue;seen.add(id);ids.add(id);
      if(!rootsById.has(id))rootsById.set(id,new Set());rootsById.get(id).add(root);
      if(include)for(const r of graph.children.get(id)||[]){edges.set(r['用量关系编号'],r);queue.push(r['子项编号']);}
    }
  }
  return {ids,rootsById,edges:[...edges.values()]};
}
export function bomLeads(d,graph){
  const own=new Map(),memo=new Map(),parents=new Map(),remaining=new Map(),sources=new Map();
  for(const [id,m]of graph.materials){
    let days=null,inputs=[ref('物料主数据',m)];
    if(m['物料来源']==='制造'){const p=number(m['生产提前期天数']),q=number(m['检验提前期天数']);if(p!==null&&q!==null)days=p+q;}
    else {const supply=table(d,'供应商与供货条件').find(r=>r['供货关系编号']===m['参考供货关系编号']&&r['物料编号']===id);
      if(supply){inputs.push(ref('供应商与供货条件',supply));const p=number(supply['采购导期天数']),q=number(supply['检验天数']);if(p!==null&&q!==null)days=p+q;}}
    own.set(id,days);sources.set(id,inputs);
    const cs=[...new Set((graph.children.get(id)||[]).map(r=>r['子项编号']))];remaining.set(id,cs.length);
    for(const c of cs){if(!parents.has(c))parents.set(c,[]);parents.get(c).push(id);}
  }
  const queue=[...remaining].filter(([,n])=>n===0).map(([id])=>id);
  for(let i=0;i<queue.length;i++){const id=queue[i],cs=[...new Set((graph.children.get(id)||[]).map(r=>r['子项编号']))];
    const unknown=graph.bad.has(id)||own.get(id)===null||cs.some(c=>memo.get(c)?.total===null||!memo.has(c));
    const max=unknown?null:Math.max(0,...cs.map(c=>memo.get(c).total)),critical=unknown?[]:cs.filter(c=>memo.get(c).total===max).sort();
    memo.set(id,{own:own.get(id),total:unknown?null:own.get(id)+max,child:max,critical,sources:sources.get(id)});
    for(const parent of parents.get(id)||[]){remaining.set(parent,remaining.get(parent)-1);if(remaining.get(parent)===0)queue.push(parent);}
  }
  for(const id of graph.materials.keys())if(!memo.has(id))memo.set(id,{own:own.get(id),total:null,child:null,critical:[],sources:sources.get(id)});
  return memo;
}
