import type {CSSProperties} from 'react';
import type {ProcessGraph,ProcessNode,ProcessVariant} from './ProcessDiagram';
import {processDemands,processFacets} from './ProcessDiagramModel';
import {ProcessHint} from './ProcessHints';
const colors=['#087e83','#3755a5','#a15c17','#8d459a','#267540','#b14859'];
const n=(v:number|null)=>v===null?'-':v.toLocaleString('zh-CN',{maximumFractionDigits:3});
export function MaterialTag({id,graph,full=false}:{id:string;graph:ProcessGraph;full?:boolean}){
 const product=graph.products.find(p=>p.id===id),color=colors[Math.max(0,graph.products.findIndex(p=>p.id===id))%colors.length];
 return <span className="process-material" style={{'--process-color':color} as CSSProperties} title={id+' · '+(product?.name||'')}>{id}{full?' · '+product?.name:''}</span>;
}
function Tags({ids,node,graph}:{ids:string[];node:ProcessNode;graph:ProcessGraph}){return ids.length<node.materialIds.length?<div className="process-facet-tags">{ids.map(id=><MaterialTag key={id} id={id} graph={graph}/>)}</div>:null;}
function Sources({variants}:{variants:ProcessVariant[]}){const sources=[...new Map(variants.flatMap(v=>v.sources).map(s=>[JSON.stringify(s),s])).values()];return <div className="process-hint-sources"><b>数据来源</b>{sources.map((s,i)=><p key={i}>{s.table} · {s.key||'-'}{s.row===null?'':' · 源行 '+s.row}</p>)}</div>;}
function Demands({variants,kind,graph}:{variants:ProcessVariant[];kind:'crew'|'tools';graph:ProcessGraph}){
 const demands=processDemands(variants,kind);return <div className="process-demand-lines">{demands.map((d,i)=><div key={i}>{demands.length>1&&d.materialIds.map(id=><MaterialTag key={id} id={id} graph={graph}/>)}<span>{kind==='crew'?'工序需 ':'每批需 '}{n(d.required)}{kind==='crew'?' 人':' 套'}</span></div>)}</div>;
}

export function ProcessOperationInfo({node,graph}:{node:ProcessNode;graph:ProcessGraph}){
 const facets=processFacets(node);return <><p>此工序的加工、等待与配套要求来自所选物料的工艺路线。</p>{facets.parameters.map((g,i)=>{const p=g.variants[0].parameters;return <section key={i}>{facets.parameters.length>1&&<div>{g.materialIds.map(id=><MaterialTag key={id} id={id} graph={graph}/>)}</div>}<dl><dt>跨日历时</dt><dd>{n(p.spanDays)} 天</dd><dt>最大等待</dt><dd>{n(p.waitDays)} 天</dd><dt>允许中断</dt><dd>{p.allowInterrupt||'-'}</dd><dt>源文件加工参数</dt><dd>{n(p.processMinutes)} 分 / {n(p.batchKg)} kg</dd><dt>准备 / 等待上限</dt><dd>{n(p.setupMinutes)} 分 / {n(p.waitMinutes)} 分</dd><dt>工艺路线</dt><dd>{[...new Set(g.variants.flatMap(v=>v.routeIds))].map(id=>id||'-').join(' / ')}</dd></dl><Sources variants={g.variants}/></section>;})}<p>分钟参数是否参与排程，以当前时间粒度与生效配置为准。</p></>;
}

export function ProcessResourceTree({node,graph}:{node:ProcessNode;graph:ProcessGraph}){
 const facets=processFacets(node);
 return <div className="process-resource-groups">
  {node.equipmentGroups.map((g,i)=><section className="process-equipment" key={g.id||i}><div className="process-resource-title"><b>{g.id||'-'} · {g.name||'设备组 -'}</b><span>可用 {n(g.available)} 台</span></div><Tags ids={g.materialIds} node={node} graph={graph}/>
   <div className="process-machines process-resource-tree">{g.machines.map(m=><div className={'process-machine'+(m.quantity===0?' is-unavailable':'')} key={m.id}><div className="process-box-title"><b>{m.id} · {m.name||'-'}</b><ProcessHint label={m.id+' 设备'}><p>该设备属于本工序可选设备组，数量为主数据可用数。</p><dl><dt>设备组</dt><dd>{g.id} · {g.name}</dd><dt>可用数量</dt><dd>{n(m.quantity)} 台</dd><dt>单次批量上限</dt><dd>{n(m.batchKg)} kg</dd><dt>标准日产能</dt><dd>{n(m.dailyKg)} kg</dd></dl><p>设备与工装 · {m.source?.key||m.id}{m.source?.row==null?'':' · 源行 '+m.source.row}</p><p>未扣减停机和排程占用。</p></ProcessHint></div><span>可用 {n(m.quantity)} 台 · 批量 ≤{n(m.batchKg)} kg</span></div>)}{!g.machines.length&&<div className="process-machine process-missing">- 未匹配设备</div>}</div>
  </section>)}
  {facets.tools.map((g,i)=>{const tool=g.variants[0].tools;return <section className="process-equipment process-tool-group" key={i}><div className="process-resource-title"><b>配套工装 · {tool.type||'-'}</b><span>工装池可用 {n(tool.available)} 套 <ProcessHint label={(tool.type||'工装')+' 工装池'}><p>同一工装池由相关工序与物料共享，图中只展示一次实体清单。</p><dl><dt>工装类型</dt><dd>{tool.type||'-'}</dd><dt>池内可用数量</dt><dd>{n(tool.available)} 套</dd><dt>匹配依据</dt><dd>{tool.matchedBy||'-'}</dd><dt>未匹配编号</dt><dd>{tool.missingIds.join('、')||'-'}</dd></dl><Demands variants={g.variants} kind="tools" graph={graph}/><Sources variants={g.variants}/></ProcessHint></span></div><Tags ids={g.materialIds} node={node} graph={graph}/><Demands variants={g.variants} kind="tools" graph={graph}/>
   <div className="process-machines process-resource-tree">{tool.pool.map(t=><div className={'process-machine process-tool-box'+(t.quantity===0?' is-unavailable':'')} key={t.id}><div className="process-box-title"><b>{t.id} · {t.name||'-'}</b><ProcessHint label={t.id+' 工装'}><p>该实体工装可参与本工序配套，跨物料显示不增加实际数量。</p><dl><dt>工装名称</dt><dd>{t.name||'-'}</dd><dt>可用数量</dt><dd>{n(t.quantity)} 套</dd><dt>单次承载上限</dt><dd>{n(t.batchKg)} kg</dd><dt>所属类型</dt><dd>{tool.type||'-'}</dd></dl><p>设备与工装 · {t.source?.key||t.id}{t.source?.row==null?'':' · 源行 '+t.source.row}</p></ProcessHint></div><span>可用 {n(t.quantity)} 套</span></div>)}{!tool.pool.length&&<div className="process-machine process-tool-box">{g.variants.every(v=>v.tools.required===0)?'无需占用工装':'- 未匹配实体工装'}</div>}</div>
  </section>;})}
  <section className="process-equipment process-crew-group"><div className="process-resource-title"><b>配套班组</b></div><div className="process-machines process-resource-tree">{facets.crews.map((g,i)=>{const crew=g.variants[0].crew;return <div className="process-machine process-crew-box" key={i}><Tags ids={g.materialIds} node={node} graph={graph}/><div className="process-box-title"><b>{crew.id||'-'} · {crew.name||'-'}</b><ProcessHint label={(crew.id||'班组')+' 班组'}><p>班组提供共享人员；工序需求按物料分别读取，每班人数不乘班次数。</p><dl><dt>班组名称</dt><dd>{crew.name||'-'}</dd><dt>每班可用人数</dt><dd>{n(crew.available)} 人</dd><dt>标准日排班</dt><dd>{n(crew.shifts)} 班</dd><dt>周日排班</dt><dd>{n(crew.sundayShifts)} 班</dd></dl><Demands variants={g.variants} kind="crew" graph={graph}/><p>班组资源 · {crew.source?.key||crew.id||'-'}{crew.source?.row==null?'':' · 源行 '+crew.source.row}</p><Sources variants={g.variants}/></ProcessHint></div><strong>每班可用 {n(crew.available)} 人</strong><span>标准日 {n(crew.shifts)} 班 · 周日 {n(crew.sundayShifts)} 班</span><Demands variants={g.variants} kind="crew" graph={graph}/></div>;})}</div></section>
 </div>;
}
