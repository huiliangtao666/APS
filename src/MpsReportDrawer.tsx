import {useEffect,useRef,useState} from 'react';
import {MpsTable} from './MpsReportControls';
import {MpsDetailSummary} from './MpsDetailSummary';
import {mpsUrl,readMpsPage,type QueryApi,type QueryIdentity} from './MpsReportTypes';
import {sameQueryIdentity} from './QueryReportsTypes';

export type MpsTarget={materialId:string;table:string;date?:string;metric?:string;label?:string};
export function mpsDetailRequest<T extends object>(query:T,target:MpsTarget,table:string,offset:number,pageSize:number){
 return {...query,materialId:target.materialId,table,offset,pageSize,...(target.date&&target.metric?{date:target.date,metric:target.metric}:{})};
}
export function clampMpsPosition(left:number,top:number,viewportWidth:number,viewportHeight:number,panelWidth:number,panelHeight:number){
 return {left:Math.max(0,Math.min(left,viewportWidth-panelWidth)),top:Math.max(0,Math.min(top,viewportHeight-panelHeight))};
}
export function MpsDrawer({api,identity,query,target,tables,preference,onClose}:{api:QueryApi;identity:QueryIdentity;query:object;target:MpsTarget;tables:Record<string,string>;preference:string;onClose:()=>void}){
 const [page,setPage]=useState<any>(),[error,setError]=useState('');
 const [position,setPosition]=useState(()=>({left:Math.max(8,((typeof window==='undefined'?1200:window.innerWidth)-960)/2),top:72}));
 const panel=useRef<HTMLElement>(null),close=useRef<HTMLButtonElement>(null),drag=useRef<{x:number;y:number;left:number;top:number}>();
 const request=mpsDetailRequest(query,target,target.table,0,100);
 const clamp=(left:number,top:number)=>clampMpsPosition(left,top,window.innerWidth,window.innerHeight,panel.current?.offsetWidth||320,panel.current?.offsetHeight||80);
 useEffect(()=>{const old=document.activeElement as HTMLElement;close.current?.focus();return()=>{if(old?.isConnected)old.focus();};},[]);
 useEffect(()=>{let live=true;setPage(undefined);setError('');
  readMpsPage(api,'detail',{...request,identity}).then(r=>{if(live)setPage(r);}).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;};
 },[JSON.stringify(request),identity.fingerprint]);
 useEffect(()=>{const resize=()=>setPosition(p=>clamp(p.left,p.top));window.addEventListener('resize',resize);resize();return()=>window.removeEventListener('resize',resize);},[]);
 useEffect(()=>{if(!panel.current)return;const observer=new ResizeObserver(()=>setPosition(p=>{const next=clamp(p.left,p.top);return next.left===p.left&&next.top===p.top?p:next;}));observer.observe(panel.current);return()=>observer.disconnect();},[]);
 return <aside ref={panel} className="mps-drawer" role="dialog" aria-modal="false" aria-label={'主计划来源 '+target.materialId} style={position} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <header tabIndex={0} aria-label="移动数据弹窗" onKeyDown={e=>{
   if(e.target!==e.currentTarget||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
   e.preventDefault();const step=e.shiftKey?40:10;setPosition(p=>clamp(p.left+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),p.top+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)));
  }} onPointerDown={e=>{if(e.button!==0||(e.target as HTMLElement).closest('button'))return;drag.current={x:e.clientX,y:e.clientY,...position};e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerMove={e=>{if(drag.current)setPosition(clamp(drag.current.left+e.clientX-drag.current.x,drag.current.top+e.clientY-drag.current.y));}}
   onPointerUp={e=>{drag.current=undefined;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=undefined;}}>
   <div><small>拖动标题移动 · 聚焦标题后可用方向键移动</small><h3>{target.materialId} · {target.label||tables[target.table]} {target.date||''}</h3></div><button ref={close} onClick={onClose} aria-label="关闭主计划数据弹窗">关闭</button>
  </header>
  <div className="mps-detail-body">
   {!page&&!error&&<p className="mps-detail-loading" role="status">正在读取数值说明和支撑明细…</p>}
   {error&&<p role="alert">{error}</p>}
   {page&&<><MpsDetailSummary explanation={page.explanation}/>
    <MpsDetailRecords key="main" api={api} identity={identity} request={request} initial={page} preference={preference} target={target}/>
    {page.supportSections?.map((section:any)=><section className="mps-related-section" key={section.id}><p className="mps-detail-scope">{section.note}</p><MpsDetailRecords api={api} identity={identity} request={{...request,section:section.id}} preference={preference} target={target}/></section>)}
    <p className="mps-detail-footnote">数据来自所选版本；点击来源记录可查看原始字段。</p>
   </>}
  </div>
 </aside>;
}

function MpsDetailRecords({api,identity,request,initial,preference,target}:{api:QueryApi;identity:QueryIdentity;request:any;initial?:any;preference:string;target:MpsTarget}){
 const [offset,setOffset]=useState(0),[size,setSize]=useState(100),[page,setPage]=useState(initial),[error,setError]=useState('');
 const [raw,setRaw]=useState(''),[rawNext,setRawNext]=useState<number|null>(null),[rawId,setRawId]=useState(''),[rawLabel,setRawLabel]=useState('');
 const history=useRef<number[]>([]),sourceEpoch=useRef(0),q={...request,offset,pageSize:size},signature=JSON.stringify(q);
 useEffect(()=>{let live=true;sourceEpoch.current++;setRaw('');setError('');
  if(initial&&offset===0&&size===100){setPage(initial);return;}
  setPage(undefined);readMpsPage(api,'detail',{...q,identity}).then(r=>{if(live)setPage(r);}).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;sourceEpoch.current++;};
 },[signature,identity.fingerprint,initial]);
 async function source(id:string,at=0){const epoch=++sourceEpoch.current;try{
  const r=await api(mpsUrl('source',{...q,identity,id,valueOffset:at}));
  if(epoch!==sourceEpoch.current)return;
  if(!sameQueryIdentity(identity,r.identity)||r.queryFingerprint!==page.queryFingerprint)throw Error('来源身份变化');
  setRaw(s=>at?s+r.text:r.text);setRawNext(r.nextOffset);setRawId(id);
  if(!at)setRawLabel(page.records.find((r:any)=>r.id===id)?.values.id||id);
 }catch(e){if(epoch===sourceEpoch.current)setError((e as Error).message);}}
 return <>{error&&<p role="alert">{error}</p>}{!page&&!error&&<p role="status">正在读取相关明细…</p>}{page&&<>
  <MpsTable key={request.section||'main'} variant="detail" heading={<><h3>{page.sectionLabel} · 明细</h3><span className="mps-count">{page.total} 条</span></>}
   id={preference+':detail:v3:'+request.table+':'+(target.metric||'all')+':'+(request.section||'main')} columns={page.columns} records={page.records} emptyMessage={page.explanation?.emptyMessage} onOpen={r=>void source(r.id)}/>
  {page.total>100&&<div className="mps-pagination"><label>每页<select aria-label={page.sectionLabel+'每页条数'} value={size} onChange={e=>{setSize(Number(e.target.value));setOffset(0);history.current=[];}}>{[100,200,500].map(n=><option key={n}>{n}</option>)}</select></label>
   <button disabled={!offset} onClick={()=>setOffset(history.current.pop()??0)}>上一页</button><span>{offset+1}—{offset+page.records.length} / {page.total} 条</span><button disabled={page.nextOffset===null} onClick={()=>{history.current.push(offset);setOffset(page.nextOffset);}}>下一页</button>
  </div>}
  {raw&&<details open><summary>{rawLabel} · 完整原始来源</summary><pre>{raw}</pre>{rawNext!==null&&<button onClick={()=>void source(rawId,rawNext)}>续读来源</button>}</details>}
 </>}</>;
}
