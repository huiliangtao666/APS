import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {QueryTable} from './QueryReportsControls';
import {sameQueryIdentity,type QueryApi,type QueryIdentity} from './QueryReportsTypes';
import {TaskAnalysis,TaskFields} from './DemandTaskDetails';
import type {GanttNode} from './EquipmentNodeAnalysis';
import './DemandTaskDetails.css';

export async function loadRiskCard(api:QueryApi,identity:QueryIdentity,query:object,fingerprint:string,node:GanttNode,section:string,offset:number){
 const r=await api('/workbooks/equipment/detail?request='+encodeURIComponent(JSON.stringify({identity,query,queryFingerprint:fingerprint,id:node.recordId??node.id,table:'risk-card',node,section,offset})));
 if(!sameQueryIdentity(identity,r.identity)||r.queryFingerprint!==fingerprint||r.node?.id!==node.id||r.node?.resource!==node.resource||r.node?.kind!=='risk'||r.section!==section)throw Error('物料风险或冻结运行身份不一致，已停止展示');
 return r;
}
export function RiskCardContent({data,tab,identity,preferenceScope}:{data:any;tab:string;identity:QueryIdentity;preferenceScope:string}){
 return <>{tab==='overview'&&<><TaskFields fields={data.fields}/><TaskAnalysis analysis={data.analysis}/></>}
 {tab==='demands'&&<p className="risk-relation-note">{data.relationNote}</p>}
 {data.groups.map((g:any)=>{const content=<>{g.note&&<p>{g.note}</p>}{g.records.length?<QueryTable id={preferenceScope+':risk-card:'+tab+':'+g.id} identity={identity} columns={g.columns} records={g.records}/>:<p className="task-detail-empty">{g.total?'本页未包含该组记录，请翻页查看。':g.id==='demands'?'未保存明确关联的需求结果。':g.id==='allocations'?'未保存关联需求对该物料的供给分配。':'本次冻结输入没有保存此类原始参考记录。'}</p>}</>;
 return g.id==='demands'?<section className="task-detail-group" key={g.id}><h4>{g.title} <small>共 {g.total} 条</small></h4>{content}</section>:<details className="task-detail-group risk-reference-group" key={g.id} open={g.id==='allocations'}><summary>{g.title} · {g.total} 条</summary>{content}</details>;})}</>;
}
export function MaterialRiskDetails({api,identity,tableIdentity,query,fingerprint,node,onClose,onDetails,onTask,preferenceScope}:{api:QueryApi;identity:QueryIdentity;tableIdentity:QueryIdentity;query:object;fingerprint:string;node:GanttNode;onClose:()=>void;onDetails:()=>void;onTask:(id:string)=>void;preferenceScope:string}){
 const [tab,setTab]=useState('overview'),[offset,setOffset]=useState(0),[data,setData]=useState<any>(),[error,setError]=useState(''),[position,setPosition]=useState(()=>({left:Math.max(12,((typeof window==='undefined'?1200:window.innerWidth)-1040)/2),top:72}));
 const panel=useRef<HTMLElement>(null),close=useRef<HTMLButtonElement>(null),body=useRef<HTMLDivElement>(null),nav=useRef<HTMLElement>(null),drag=useRef<{x:number;y:number;left:number;top:number}>(),pages=useRef<number[]>([]),id=useId();
 const signature=JSON.stringify([identity,query,fingerprint,node,tab,offset]);
 const current=data?.signature===signature?data.value:undefined;
 const tabs=[['overview','基本信息'],['demands','受影响需求']];
 function choose(value:string){pages.current=[];setOffset(0);setTab(value);}
 useEffect(()=>{const previous=document.activeElement as HTMLElement;close.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 useEffect(()=>{let live=true;setError('');setData(undefined);body.current?.scrollTo?.(0,0);loadRiskCard(api,identity,query,fingerprint,node,tab,offset).then(value=>{if(live)setData({signature,value});}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[signature]);
 useEffect(()=>{const escape=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape'&&!e.defaultPrevented)onClose();};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[onClose]);
 const clamp=(left:number,top:number)=>({left:Math.max(0,Math.min(left,window.innerWidth-(panel.current?.offsetWidth||320))),top:Math.max(0,Math.min(top,window.innerHeight-(panel.current?.offsetHeight||80)))});
 useEffect(()=>{if(current)setPosition(p=>clamp(p.left,p.top));},[data]);
 useEffect(()=>{const resize=()=>setPosition(p=>clamp(p.left,p.top));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 function keyTab(e:KeyboardEvent,index:number){const next=e.key==='ArrowRight'||e.key==='ArrowLeft'?(index+1)%2:e.key==='Home'?0:e.key==='End'?1:null;if(next===null)return;e.preventDefault();choose(tabs[next][0]);nav.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();}
 return <aside ref={panel} className="demand-task-details material-risk-details" role="dialog" aria-modal="false" aria-label={'物料风险明细 '+node.id} style={position} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
 <header onPointerDown={e=>{if(e.button!==0||(e.target as HTMLElement).closest('button'))return;drag.current={x:e.clientX,y:e.clientY,...position};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current)setPosition(clamp(drag.current.left+e.clientX-drag.current.x,drag.current.top+e.clientY-drag.current.y));}} onPointerUp={e=>{drag.current=undefined;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=undefined;}}><div><small>物料风险明细 · 拖动标题移动</small><h3>{current?.title||node.id}</h3></div><button ref={close} onClick={onClose} aria-label="关闭物料风险明细">关闭</button></header>
 <nav ref={nav} role="tablist" aria-label="物料风险明细页签">{tabs.map(([key,label],index)=><button key={key} role="tab" id={id+'-'+key} aria-controls={id+'-panel'} aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>choose(key)} onKeyDown={e=>keyTab(e,index)}>{label}{key==='demands'&&current?' · '+current.demandTotal:''}</button>)}</nav>
 <div ref={body} className="task-detail-body" role="tabpanel" id={id+'-panel'} aria-labelledby={id+'-'+tab}>
 {error&&<p role="alert">{error}</p>}{!current&&!error&&<p role="status">正在读取{tab==='overview'?'基本信息':'受影响需求'}…</p>}
 {current&&<><RiskCardContent data={current} tab={tab} identity={tableIdentity} preferenceScope={preferenceScope}/>{current.total>0&&<div className="task-detail-pagination"><span>本页 {current.groups.reduce((n:number,g:any)=>n+g.records.length,0)} / 共 {current.total} 条</span><button disabled={!offset} onClick={()=>setOffset(pages.current.pop()??0)}>上一页</button><button disabled={current.nextOffset===null} onClick={()=>{pages.current.push(offset);setOffset(current.nextOffset);}}>下一页</button></div>}</>}
 </div><footer>{current?.taskIds.map((task:string)=><button key={task} onClick={()=>{onClose();onTask(task);}}>定位受影响任务 {task}</button>)}{tab==='overview'&&<button onClick={()=>choose('demands')}>查看受影响需求</button>}<button onClick={onDetails}>完整明细与来源</button><button onClick={onClose}>收起弹窗</button></footer>
 </aside>;
}
