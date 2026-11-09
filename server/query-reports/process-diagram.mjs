import {resolvedInput,table,number,dayCalendar,fail} from './context.mjs';
import {sourceHash} from './source-copy.mjs';

const value=v=>v===undefined||v===null||String(v).trim()===''?null:String(v).trim();
const source=(t,r)=>({table:t,key:value(r[t==='工艺路线'?'路线工序编号':t==='班组资源'?'班组编号':'资源编号']),row:r._row??null});
const resource=r=>({id:value(r['资源编号']),name:value(r['资源名称']),quantity:number(r['可用数量']),batchKg:number(r['单次批量上限千克']),dailyKg:number(r['标准日产能千克']),source:source('设备与工装',r)});
const reject=message=>fail(message,422);

/** Full selected routes, independent of report paging. Same resolved/frozen input
 * as the table; occurrences are layered before merging so no backward edge or
 * invented dependency can result from repeated operations / differing routes. */
export function processDiagram(snapshot,request={}){
 const at=snapshot.run?.provenance?.effectiveAt??snapshot.run?.selection.startDay??1,d=resolvedInput(snapshot,at);
 const rows=[...table(d,'工艺路线').map(r=>({...r,_diagramSource:source('工艺路线',r)})),...(d.mapping?.sfRoutes||[]).map((r,i)=>({...r,_diagramSource:{table:'运行映射.sfRoutes',key:value(r['路线工序编号'])||String(i),row:null}}))];
 const master=new Map(table(d,'物料主数据').map(r=>[r['物料编号'],r])),productMap=new Map();
 for(const r of rows){const id=value(r['成品编号']);if(id&&!productMap.has(id)){const m=master.get(id);productMap.set(id,{id,name:value(m?.['物料名称'])||value(r['成品名称'])||id,category:value(m?.['物料类别'])});}}
 const products=[...productMap.values()].sort((a,b)=>(a.category==='成品'?0:1)-(b.category==='成品'?0:1)||a.id.localeCompare(b.id,'zh-CN',{numeric:true}));
 const ids=request.materialIds===undefined?products.slice(0,1).map(p=>p.id):request.materialIds;
 if(!Array.isArray(ids)||ids.length>40||ids.some(id=>typeof id!=='string'||!productMap.has(id))||new Set(ids).size!==ids.length)reject('请选择有效的工艺物料，每次最多选择40种。');
 const selected=new Set(ids),nodes=new Map(),edges=new Map(),warnings=[],groups=new Map();
 for(const r of rows.filter(r=>selected.has(r['成品编号']))){const key=JSON.stringify([r['成品编号'],r['路线编号']||'']);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 if([...groups.values()].reduce((n,r)=>n+r.length,0)>500)reject('选中物料的工序超过500条，请减少图示物料后查看。');
 const families=new Map();
 for(const route of groups.values()){
  const path=addRoute(route,{d,nodes,edges,warnings}),id=sourceHash({nodes:[...path.nodeIds].sort(),edges:path.edges.map(e=>[e.from,e.to]).sort()}).slice(0,20);
  if(!families.has(id))families.set(id,{id,nodeIds:path.nodeIds,edges:path.edges,materialIds:[],routes:[]});
  const family=families.get(id),materialId=route[0]['成品编号'];if(!family.materialIds.includes(materialId))family.materialIds.push(materialId);
  family.routes.push({materialId,routeId:value(route[0]['路线编号'])});
 }
 const result={products,selectedIds:ids,nodes:[...nodes.values()],edges:[...edges.values()],sections:[...families.values()],warnings:[...new Set(warnings)],asOfDate:dayCalendar(snapshot.identity.dayZero,at),routeCount:groups.size,
  meaning:'按物料的工艺前后关系从左到右展示；同层同工序合并，设备框纵向列出可选设备，工装和班组按工序需求配套。',
  note:'同一设备、工装或班组跨物料共享；图中数量为主数据配置，未扣减停机及排程占用。班组人数为每班人数，不乘班次数。'};
 result.diagramFingerprint=sourceHash({identity:snapshot.identity,selectedIds:ids,nodes:result.nodes,edges:result.edges});return result;
}

function addRoute(route,{d,nodes,edges,warnings}){
 const materialId=route[0]['成品编号'],routeId=value(route[0]['路线编号']),label=materialId+' / '+(routeId||'未提供路线编号');
 const sorted=route.map((r,i)=>({r,i,parents:[],level:null})).sort((a,b)=>(number(a.r['工序顺序'])??a.i)-(number(b.r['工序顺序'])??b.i)||a.i-b.i);
 const explicit=route.some(r=>value(r['前序工序编号']));
 if(!explicit&&route.length>1)warnings.push(label+'：源数据未提供前序工序，连线按工序顺序展示。');
 for(let i=0;i<sorted.length;i++){
  const item=sorted[i],r=item.r,pred=value(r['前序工序编号']);
  if(explicit&&pred){for(const code of pred.split(/[,，;；|、\s]+/).filter(Boolean)){
   const matches=sorted.filter(s=>value(s.r['工序编号'])===code);
   if(matches.length===1)item.parents.push(matches[0]);else warnings.push(label+'：前序 '+code+(matches.length?' 重复，无法唯一连接。':' 未找到，保留该工序并标明连接缺口。'));
  }}else if(!explicit&&i)item.parents.push(sorted[i-1]);
  if(number(r['工序顺序'])===null)warnings.push(label+'：部分工序缺少顺序，按源行顺序展示。');
 }
 const visiting=new Set();function rank(item){if(item.level!==null)return item.level;if(visiting.has(item))reject(label+' 的前序工序存在循环，请维护工艺路线后重试。');visiting.add(item);item.level=item.parents.length?Math.max(...item.parents.map(rank))+1:0;visiting.delete(item);return item.level;}
 const ids=new Map();
 for(const item of sorted){const r=item.r,level=rank(item),op=value(r['工序编号'])||value(r['工序名称'])||value(r['路线工序编号'])||'源行'+item.i;
  // An occurrence suffix prevents repeated operations within a single route
  // from losing their own source rows when operation IDs are reused.
  const prior=sorted.slice(0,sorted.indexOf(item)).filter(x=>x.level===level&&(value(x.r['工序编号'])||value(x.r['工序名称']))===op).length;
  const id=sourceHash([op,value(r['工序名称']),level,prior]).slice(0,20);ids.set(item,id);
  if(!nodes.has(id))nodes.set(id,{id,level,operationId:value(r['工序编号']),name:value(r['工序名称'])||op,materialIds:[],equipmentGroups:[],variants:[]});
  const node=nodes.get(id);if(!node.materialIds.includes(materialId))node.materialIds.push(materialId);
  const groupId=value(r['设备组编号']),machines=table(d,'设备与工装').filter(e=>e['资源类别']==='设备'&&value(e['资源组编号'])===groupId&&groupId);
  let group=node.equipmentGroups.find(g=>g.id===groupId);if(!group){group={id:groupId,name:value(r['设备组名称'])||groupId,materialIds:[],machines:machines.map(resource),available:machines.length&&machines.every(m=>number(m['可用数量'])!==null)?machines.reduce((n,m)=>n+Number(m['可用数量']),0):null};node.equipmentGroups.push(group);}if(!group.materialIds.includes(materialId))group.materialIds.push(materialId);
  const crewId=value(r['班组编号']),crew=table(d,'班组资源').find(c=>value(c['班组编号'])===crewId&&crewId),type=value(r['所需工装类型']),count=number(r['每批工装套数']);
  const mapped=type&&Object.hasOwn(d.mapping?.tool_pools||{},type),pool=mapped?d.mapping.tool_pools[type]:null;
  const tools=table(d,'设备与工装').filter(e=>e['资源类别']==='工装'&&(mapped?Array.isArray(pool)&&pool.includes(e['资源编号']):type&&(e['资源组编号']===type||e['资源组名称']===type)));
  const missingTools=mapped&&Array.isArray(pool)?pool.filter(id=>!tools.some(t=>t['资源编号']===id)):[];
  const facts={groupId,crew:{id:crewId,name:value(crew?.['班组名称']),required:number(r['需求人数']),available:number(crew?.['每班可用人数']),shifts:number(crew?.['标准日班次数']),sundayShifts:number(crew?.['周日班次数']),source:crew?source('班组资源',crew):null},
   tools:{type,required:count,pool:tools.map(resource),missingIds:missingTools,matchedBy:mapped?'运行映射工装池':'工装资源组',available:missingTools.length||!tools.length?count===0?0:null:tools.every(t=>number(t['可用数量'])!==null)?tools.reduce((n,t)=>n+Number(t['可用数量']),0):null},
   parameters:{spanDays:number(r['跨日历时天数']),waitDays:number(r['最大等待天数']),batchKg:number(r['基准加工量千克']),processMinutes:number(r['基准加工分钟']),setupMinutes:number(r['固定准备分钟']),waitMinutes:number(r['最大等待分钟']),allowInterrupt:value(r['允许加工中断'])}};
  const key=sourceHash(facts);let variant=node.variants.find(v=>v.key===key);if(!variant){variant={key,...facts,materialIds:[],routeIds:[],sources:[],bindings:[]};node.variants.push(variant);}if(!variant.materialIds.includes(materialId))variant.materialIds.push(materialId);if(!variant.routeIds.includes(routeId))variant.routeIds.push(routeId);variant.sources.push(r._diagramSource);variant.bindings.push({materialId,routeId,source:r._diagramSource});
  if(!machines.length)warnings.push(label+'：'+node.name+' 缺少设备组 '+(groupId||'-')+' 对应设备。');
  if(!crew)warnings.push(label+'：'+node.name+' 缺少班组 '+(crewId||'-')+' 配置。');
  if(count!==0&&(!tools.length||missingTools.length))warnings.push(label+'：'+node.name+' 的工装 '+(type||'-')+' 未完整匹配实体资源。');
 }
 const localEdges=new Map();
 for(const item of sorted)for(const parent of item.parents){const from=ids.get(parent),to=ids.get(item),key=from+':'+to;if(!edges.has(key))edges.set(key,{from,to,materialIds:[]});const edge=edges.get(key);if(!edge.materialIds.includes(materialId))edge.materialIds.push(materialId);localEdges.set(key,{from,to});}
 return {nodeIds:[...new Set(ids.values())],edges:[...localEdges.values()]};
}
