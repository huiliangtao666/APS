import {useEffect,useRef,useState} from 'react';
import {sameQueryIdentity,type QueryIdentity,type QueryApi} from './QueryReportsTypes';
import './EquipmentNodeAnalysis.css';

export type GanttNode={id:string;kind:'task'|'wip'|'stop';resource:string;recordId?:string};
export function EquipmentNodeAnalysis({api,identity,query,fingerprint,node,onClose,onDetails}:{api:QueryApi;identity:QueryIdentity;query:object;fingerprint:string;node:GanttNode;onClose:()=>void;onDetails:()=>void}){
 const [data,setData]=useState<any>(),[error,setError]=useState(''),[position,setPosition]=useState(()=>({x:Math.max(12,(typeof window==='undefined'?1000:window.innerWidth)-660),y:110}));
 const drag=useRef<{x:number;y:number;left:number;top:number}>(),panel=useRef<HTMLElement>(null),close=useRef<HTMLButtonElement>(null),body=useRef<HTMLDivElement>(null);
 const signature=JSON.stringify([identity,fingerprint,node,query]);
 useEffect(()=>{const previous=document.activeElement as HTMLElement;close.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.defaultPrevented)onClose();};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[onClose]);
 useEffect(()=>{let live=true;setData(undefined);setError('');body.current?.scrollTo?.(0,0);
  api('/workbooks/equipment/detail?request='+encodeURIComponent(JSON.stringify({identity,query,queryFingerprint:fingerprint,id:node.recordId??node.resource,table:'analysis',node}))).then(r=>{
   if(!live)return;
   if(!sameQueryIdentity(identity,r.identity)||r.queryFingerprint!==fingerprint||r.analysis?.node?.id!==node.id||r.analysis?.node?.kind!==node.kind||r.analysis?.node?.resource!==node.resource)throw Error('节点或冻结运行身份不一致，已停止展示');
   setData({signature,value:r.analysis});
  }).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};
 },[signature]);
 const current=data?.signature===signature?data.value:undefined;
 const clamp=(x:number,y:number)=>({x:Math.max(0,Math.min(x,window.innerWidth-(panel.current?.offsetWidth||320))),y:Math.max(0,Math.min(y,window.innerHeight-(panel.current?.offsetHeight||80)))});
 useEffect(()=>{const resize=()=>setPosition(p=>clamp(p.x,p.y));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 return <aside ref={panel} className="equipment-node-analysis" role="dialog" aria-modal="false" aria-label={'节点计算分析 '+node.id} style={{left:position.x,top:position.y}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <header onPointerDown={e=>{if(e.button!==0||(e.target as HTMLElement).closest('button'))return;drag.current={x:e.clientX,y:e.clientY,left:position.x,top:position.y};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current)setPosition(clamp(drag.current.left+e.clientX-drag.current.x,drag.current.top+e.clientY-drag.current.y));}} onPointerUp={e=>{drag.current=undefined;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=undefined;}}>
   <strong>{node.id} · 节点计算分析</strong><span>拖动标题移动</span><button ref={close} onClick={onClose} aria-label="关闭节点计算分析">关闭</button>
  </header>
  <div className="node-analysis-body" ref={body}>
   {error&&<p role="alert">{error}</p>}{!current&&!error&&<p role="status">正在读取本节点的冻结计算依据…</p>}
   {current&&<><div className="node-analysis-title"><b>{current.headline}</b><span>{current.model} · 运行 {current.identity.runId} / v{current.identity.version}</span></div>
    <dl className="node-analysis-facts">{current.facts.map((f:any,i:number)=><div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
    <section className="node-analysis-problems"><h4>问题与风险 · {current.problemTotal} 条</h4>{current.problems.length?current.problems.map((p:any,i:number)=><p key={i}><b>{p.scope}</b> {p.message}</p>):<p>未保存本节点或关联需求的问题记录；仍需核对下方依据缺失项。</p>}{current.problemTotal>current.problems.length&&<p>当前预览前20条；完整问题见排程结果汇总及物料风险。</p>}</section>
    <section><h4>如何计算</h4>{current.basis.map((b:any,i:number)=><div className="node-analysis-step" key={i}><b>{b.label}</b><div>{b.value}<small>{b.logic}</small></div></div>)}</section>
    <details><summary>关联投料 / 供给记录（{current.materialTotal}）</summary>{current.materialTotal?<div className="node-analysis-table"><table><thead><tr><th>物料 / 数量</th><th>来源 / 需料时点与计算口径</th></tr></thead><tbody>{current.materials.map((m:any,i:number)=><tr key={i}><td>{m.material} · {m.quantity} {m.unit}</td><td>{m.supply} · {m.meaning}<small>{m.feed}{m.bom?' · '+m.bom:''}{m.bomSource?.row?' · 物料清单第'+m.bomSource.row+'行':''}</small><small>{m.calculation}</small></td></tr>)}</tbody></table></div>:<p>没有保存与本节点直接关联的分配记录；不据此判断无需投料。</p>}{current.materialTotal>20&&<p>当前预览前20条，完整记录见物料风险。</p>}</details>
    <details open className="node-analysis-missing"><summary>依据缺失与解释边界（{current.missing.length}）</summary><ul>{current.missing.map((m:string,i:number)=><li key={i}>{m}</li>)}</ul></details>
    <details><summary>冻结来源与检查范围</summary><p>独立检查：{current.verification.status==='pass'?'已记录范围通过':current.verification.status==='problem'?'存在问题':'未检查'}；{current.verification.scope.join('；')||'范围未保存'}</p>{current.verification.notChecked.length>0&&<p>未检查：{current.verification.notChecked.join('；')}</p>}{current.verification.issues.slice(0,20).map((s:string,i:number)=><p key={i}>本运行检查问题（未定位到节点）：{s}</p>)}
     {current.sources.map((s:any,i:number)=><div className="node-analysis-source" key={i}><b>{s.sheet} · {s.key} · {s.row?`第${s.row}行`:'原行未提供'}</b>{s.fields.filter((f:any)=>f.value!==null).map((f:any,j:number)=><p key={j}>{f.field}：{String(f.value)}{f.cell?' · '+f.cell:''}{f.formula?' · Excel来源 '+f.formula:''}</p>)}</div>)}
     <p className="node-analysis-hash">输入 {current.identity.inputHash} · 结果 {current.identity.resultHash}</p>
    </details>
   </>}
  </div>
  <footer><span>只读冻结依据 · 点击其他节点可切换</span><button onClick={onDetails}>{node.kind==='task'?'查看任务明细与来源':'查看设备关联明细'}</button></footer>
 </aside>;
}
