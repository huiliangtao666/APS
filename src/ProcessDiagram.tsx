import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {DropdownDetails} from './DropdownDetails';
import {ProcessHint,ProcessHintProvider} from './ProcessHints';
import {processSectionGraph} from './ProcessDiagramModel';
import {MaterialTag,ProcessResourceTree,ProcessOperationInfo} from './ProcessResourceTree';
import {ProcessOperationIcon} from './ProcessOperationIcon';
import {queryUrl,sameQueryIdentity,type QueryApi,type QueryIdentity} from './QueryReportsTypes';
import './ProcessDiagram.css';

type Source={table:string;key:string|null;row:number|null};
type Resource={id:string;name:string|null;quantity:number|null;batchKg:number|null;dailyKg:number|null;source?:Source};
export type ProcessVariant={key:string;groupId:string|null;materialIds:string[];routeIds:(string|null)[];sources:Source[];bindings:{materialId:string;routeId:string|null;source:Source}[];crew:{id:string|null;name:string|null;required:number|null;available:number|null;shifts:number|null;sundayShifts:number|null;source?:Source};tools:{type:string|null;required:number|null;available:number|null;pool:Resource[];missingIds:string[];matchedBy?:string};parameters:{spanDays:number|null;waitDays:number|null;batchKg:number|null;processMinutes:number|null;setupMinutes:number|null;waitMinutes:number|null;allowInterrupt:string|null}};
export type ProcessNode={id:string;level:number;name:string;operationId:string|null;materialIds:string[];equipmentGroups:{id:string|null;name:string|null;materialIds:string[];available:number|null;machines:Resource[]}[];variants:ProcessVariant[]};
export type ProcessSection={id:string;nodeIds:string[];edges:{from:string;to:string}[];materialIds:string[];routes:{materialId:string;routeId:string|null}[]};
export type ProcessGraph={identity:QueryIdentity;diagramFingerprint:string;products:{id:string;name:string;category:string|null}[];selectedIds:string[];nodes:ProcessNode[];edges:{from:string;to:string;materialIds:string[]}[];sections:ProcessSection[];warnings:string[];asOfDate:string;routeCount:number;meaning:string;note:string};

export function ProcessDiagram({api,identity}:{api:QueryApi;identity:QueryIdentity}){
 const [graph,setGraph]=useState<ProcessGraph>(),[ids,setIds]=useState<string[]>(),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[search,setSearch]=useState(''),[fullscreen,setFullscreen]=useState(false),[zoomHost,setZoomHost]=useState<HTMLDivElement|null>(null),panel=useRef<HTMLElement>(null);
 useEffect(()=>{if(!fullscreen)return;const previous=document.activeElement as HTMLElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.current?.focus();
  const keyboard=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();setFullscreen(false);}if(e.key==='Tab'){const buttons=[...panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||!panel.current?.contains(document.activeElement))){e.preventDefault();first?.focus();}}};
  document.addEventListener('keydown',keyboard);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',keyboard);if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[fullscreen]);
 const signature=JSON.stringify(ids);
 useEffect(()=>{let live=true;setError('');setLoading(true);
  api(queryUrl('process',{identity,...(ids===undefined?{}:{materialIds:ids})})).then(r=>{if(!live)return;if(!sameQueryIdentity(identity,r.identity)||ids&&JSON.stringify(ids)!==JSON.stringify(r.selectedIds))throw Error('工艺图的数据来源或所选物料已变化，请重试。');setGraph(r);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
 },[signature,identity.fingerprint,reload]);
 const selected=ids??graph?.selectedIds??[],products=graph?.products||[],matches=products.filter(p=>(p.id+' '+p.name).toLowerCase().includes(search.trim().toLowerCase()));
 return <ProcessHintProvider resetKey={signature+identity.fingerprint+fullscreen}><section ref={panel} tabIndex={-1} className={'process-figure'+(fullscreen?' process-fullscreen':'')} role={fullscreen?'dialog':undefined} aria-modal={fullscreen||undefined} aria-label="工艺与配套资源示意图">
  <header className="process-heading"><div className="process-heading-title"><strong>工艺与配套资源示意图</strong><span>选择产品物料合并查看完整工艺</span></div><div className="process-heading-actions">
   <DropdownDetails className="qr-select process-picker"><summary>图示物料 <b>{selected.length}/{products.length}</b><span aria-hidden="true">⌄</span></summary><div className="qr-select-panel">
    <input aria-label="搜索图示物料" placeholder="搜索物料编号或名称" value={search} maxLength={200} onChange={e=>setSearch(e.target.value)}/>
    <div className="qr-select-actions"><button type="button" disabled={products.length>40} onClick={()=>setIds(products.map(p=>p.id))}>全选</button><span>已选 {selected.length} 项</span><button type="button" onClick={()=>setIds([])}>清空</button></div>
    {/* Button-backed checkboxes avoid Chromium crashing while focusing a native checkbox in this compact details popup. */}
    <div className="qr-option-list" role="group" aria-label="图示物料选择">{matches.map(p=><button type="button" role="checkbox" key={p.id} className="process-material-option" aria-checked={selected.includes(p.id)} disabled={!selected.includes(p.id)&&selected.length>=40} onClick={()=>setIds(selected.includes(p.id)?selected.filter(id=>id!==p.id):[...selected,p.id])}><span className="process-option-check" aria-hidden="true">{selected.includes(p.id)?'✓':''}</span><span>{p.id} · {p.name}</span></button>)}</div>{!matches.length&&<p>没有匹配的工艺物料。</p>}
   </div></DropdownDetails>
   <div ref={setZoomHost} className="process-zoom-host"/>
   <button type="button" className="process-fullscreen-button" aria-label={fullscreen?'退出工艺图全屏':'工艺图全屏'} disabled={!fullscreen&&(loading||!graph?.nodes.length||!!error)} onClick={()=>setFullscreen(!fullscreen)}>{fullscreen?'退出全屏':'全屏'}</button>
   </div>
  </header>
  {error&&<p role="alert">{error} <button type="button" onClick={()=>setReload(v=>v+1)}>重试</button></p>}{loading&&<p role="status">正在读取所选物料的完整工艺…</p>}
   {graph&&!loading&&!error&&<><p className="process-overview">{selected.length} 种物料 · {graph.routeCount} 条工艺路线 · {graph.sections.length} 个工艺区域。相同路径合并，设备、工装和班组分别去重展示。</p>
    <div className="process-legend">{graph.selectedIds.map(id=><MaterialTag key={id} id={id} graph={graph} full/>)}</div>
    {graph.nodes.length?graph.sections.map((section,index)=><section className="process-region" key={section.id} aria-label={'工艺区域'+(index+1)}>{graph.sections.length>1&&<header><strong>工艺区域 {index+1}</strong>{section.materialIds.map(id=><MaterialTag key={id} id={id} graph={graph}/>)}</header>}<ProcessCanvas key={graph.diagramFingerprint+section.id} graph={processSectionGraph(graph,section)} toolbar={index===0?zoomHost:null}/></section>):<p className="process-empty">请选择至少一种产品物料查看工艺。</p>}
    {graph.warnings.length>0&&<details className="process-warnings"><summary>来源提示 {graph.warnings.length} 项</summary>{graph.warnings.map(w=><p key={w}>{w}</p>)}</details>}
    <p className="process-foot">来源：工艺路线、设备与工装、班组资源及运行映射 · 数据版本 v{identity.version}{identity.runId?' · 冻结运行 '+identity.runId:''} · 参数口径 {graph.asOfDate}。{graph.note}</p>
   </>}
 </section></ProcessHintProvider>;
}

export type CanvasSize={width:number;height:number;viewport:number;paths:{key:string;d:string;label:string}[]};
export function sameCanvasSize(a:CanvasSize,b:CanvasSize){
 return a.width===b.width&&a.height===b.height&&a.viewport===b.viewport&&a.paths.length===b.paths.length&&a.paths.every((p,i)=>p.key===b.paths[i].key&&p.d===b.paths[i].d&&p.label===b.paths[i].label);
}

export function ProcessCanvas({graph,toolbar}:{graph:ProcessGraph;toolbar:HTMLDivElement|null}){
 const viewport=useRef<HTMLDivElement>(null),canvas=useRef<HTMLDivElement>(null),marker=useId().replace(/:/g,''),[zoom,setZoom]=useState<number|null>(null),[size,setSize]=useState<CanvasSize>({width:1,height:1,viewport:1,paths:[]});
 const levels=[...new Set(graph.nodes.map(x=>x.level))].sort((a,b)=>a-b),scale=zoom??Math.min(1,size.viewport/size.width);
 useLayoutEffect(()=>{
  const outer=viewport.current,inner=canvas.current;if(!outer||!inner)return;
  let frame=0;
  const cards=[...inner.querySelectorAll<HTMLElement>('[data-process-node]')];
  const measure=()=>{
   if(!inner.offsetWidth||!outer.clientWidth)return;
   // Offsets stay in unscaled canvas coordinates, so zoom cannot feed back
   // into edge geometry through transformed, subpixel bounding rectangles.
   const boxes=new Map(cards.map(el=>{let x=0,y=0,node:HTMLElement|null=el;while(node&&node!==inner){x+=node.offsetLeft;y+=node.offsetTop;node=node.offsetParent as HTMLElement|null;}return [el.dataset.processNode!,{x,y,w:el.offsetWidth}];}));
   const paths=graph.edges.flatMap(e=>{const a=boxes.get(e.from),b=boxes.get(e.to);if(!a||!b)return [];const x=a.x+a.w,y=a.y+28,end=b.x,ey=b.y+28,mid=(x+end)/2;return [{key:e.from+e.to,d:`M ${x} ${y} C ${mid} ${y}, ${mid} ${ey}, ${end-5} ${ey}`,label:e.materialIds.join(' / ')}];});
   const next={width:inner.offsetWidth,height:inner.offsetHeight,viewport:Math.max(1,outer.clientWidth-2),paths};
   setSize(previous=>sameCanvasSize(previous,next)?previous:next);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure();});};
  measure();const observer=new ResizeObserver(schedule);observer.observe(inner);observer.observe(outer);cards.forEach(card=>observer.observe(card));
  return()=>{observer.disconnect();if(frame)cancelAnimationFrame(frame);};
 },[graph.diagramFingerprint]);
 const tools=<div className="process-canvas-tools"><button type="button" aria-label="缩小工艺图" disabled={scale<=.15} onClick={()=>setZoom(Math.max(.15,scale-.1))}>−</button><output aria-label="工艺图缩放比例">{Math.round(scale*100)}%</output><button type="button" aria-label="放大工艺图" disabled={scale>=1.5} onClick={()=>setZoom(Math.min(1.5,scale+.1))}>＋</button><button type="button" aria-pressed={zoom===null} onClick={()=>setZoom(null)}>适应宽度</button><button type="button" aria-pressed={zoom===1} onClick={()=>setZoom(1)}>原始大小</button></div>;
 return <>{toolbar?createPortal(tools,toolbar):tools}
  <div className="process-viewport" ref={viewport} tabIndex={0} aria-label="工艺图，可横向滚动"><div className="process-scaled" style={{width:size.width*scale,height:size.height*scale}}><div className="process-canvas" ref={canvas} style={{transform:`scale(${scale})`}}>
   <svg className="process-edges" width={size.width} height={size.height} aria-label="工序前后关系"><defs><marker id={marker} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="#7e9da8"/></marker></defs>{size.paths.map(p=><path key={p.key} d={p.d} markerEnd={'url(#'+marker+')'}><title>{p.label}</title></path>)}</svg>
   {levels.map(level=><div className="process-column" key={level}>{graph.nodes.filter(x=>x.level===level).map(node=><ProcessCard key={node.id} node={node} graph={graph}/>)}</div>)}
  </div></div></div>
 </>;
}


export function ProcessCard({node,graph}:{node:ProcessNode;graph:ProcessGraph}){
 return <article className="process-card" data-process-node={node.id} aria-label={node.name+'工序'}>
  <header><span className="process-step">{node.level+1}</span><div className="process-card-title"><strong>{node.name}</strong><small>{node.operationId||'工序编号 -'}</small></div><ProcessOperationIcon name={node.name}/><ProcessHint label={node.name+' 工艺'}><ProcessOperationInfo node={node} graph={graph}/></ProcessHint></header>
  <div className="process-card-materials">{node.materialIds.map(id=><MaterialTag key={id} id={id} graph={graph}/>)}</div>
  <ProcessResourceTree node={node} graph={graph}/>
 </article>;
}
