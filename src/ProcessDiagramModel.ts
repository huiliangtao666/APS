import type {ProcessGraph,ProcessNode,ProcessSection,ProcessVariant} from './ProcessDiagram';

const unique=(values:string[])=>[...new Set(values)];
/** Route bindings prevent another alternative route of the same material from
 * leaking resources into this region. Fields stay sourced from the same graph. */
export function processSectionGraph(graph:ProcessGraph,section:ProcessSection):ProcessGraph{
 const routes=new Set(section.routes.map(r=>JSON.stringify([r.materialId,r.routeId])));
 const nodes=section.nodeIds.map(id=>graph.nodes.find(n=>n.id===id)!).map(node=>{
  const variants=node.variants.flatMap(v=>{const bindings=v.bindings.filter(b=>routes.has(JSON.stringify([b.materialId,b.routeId])));return bindings.length?[{...v,bindings,materialIds:unique(bindings.map(b=>b.materialId)),routeIds:[...new Set(bindings.map(b=>b.routeId))],sources:bindings.map(b=>b.source)}]:[];});
  const materialIds=unique(variants.flatMap(v=>v.materialIds));
  const equipmentGroups=node.equipmentGroups.flatMap(g=>{const members=unique(variants.filter(v=>v.groupId===g.id).flatMap(v=>v.materialIds));return members.length?[{...g,materialIds:members}]:[];});
  return {...node,variants,materialIds,equipmentGroups};
 });
 return {...graph,nodes,selectedIds:section.materialIds,edges:section.edges.map(e=>({...e,materialIds:section.materialIds})),diagramFingerprint:graph.diagramFingerprint+':'+section.id};
}

type Facet={variants:ProcessVariant[];materialIds:string[]};
export function processFacets(node:ProcessNode){
 function group(key:(v:ProcessVariant)=>unknown){const map=new Map<string,Facet>();for(const v of node.variants){const id=JSON.stringify(key(v));const g:Facet=map.get(id)||{variants:[],materialIds:[]};g.variants.push(v);g.materialIds=unique([...g.materialIds,...v.materialIds]);map.set(id,g);}return [...map.values()];}
 const tools=group(v=>({type:v.tools.type,available:v.tools.available,pool:v.tools.pool.map(r=>[r.id,r.name,r.quantity,r.batchKg,r.dailyKg]),missing:v.tools.missingIds}));
 const crews=group(v=>({id:v.crew.id,name:v.crew.name,available:v.crew.available,shifts:v.crew.shifts,sundayShifts:v.crew.sundayShifts}));
 const parameters=group(v=>v.parameters);
 return {tools,crews,parameters};
}

export function processDemands(variants:ProcessVariant[],kind:'crew'|'tools'){
 const map=new Map<number|null,string[]>();for(const v of variants){const key=v[kind].required;map.set(key,unique([...(map.get(key)||[]),...v.materialIds]));}return [...map].map(([required,materialIds])=>({required,materialIds}));
}
