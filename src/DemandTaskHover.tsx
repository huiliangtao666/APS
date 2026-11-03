import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {queryValue,type QueryIdentity} from './QueryReportsTypes';
export type HoverAnchor={left:number;right:number;top:number;bottom:number};
export function EquipmentLayerHoverContent({layer,identity}:{layer:any;identity:QueryIdentity}){
 const time=(n:number)=>queryValue(n,{key:'start',label:'时刻',format:'instant',timeUnit:'minute'},identity),wip=layer.kind==='WIP物理保留';
 return <><strong>{layer.id} · {wip?'WIP保留':'已知停机'}</strong>{wip&&<p>{layer.productId||'物料未提供'} {layer.productName||''}{layer.label?' · '+layer.label:''}</p>}{wip&&<p>预计合格产出：{typeof layer.quantity==='number'?layer.quantity+' 千克':'未提供'}</p>}<p>{time(layer.start)} — {time(layer.end)}（结束不含）</p><p>设备 {layer.machine} {layer.machineName||''}</p><p>{wip?'冻结在制物理保留；不代表已完工或已入库':'冻结观察时刻已知的设备不可用区间'}</p><small>点击查看{wip?'保留、续作、资源、物料与来源':'停机明细、处理依据与来源'}</small></>;
}
export function DemandTaskHoverContent({task,identity}:{task:any;identity:QueryIdentity}){
 const time=(n:number)=>queryValue(n,{key:'start',label:'时刻',format:'instant',timeUnit:'minute'},identity);
 return <><strong>{task.id} · {task.label||'工序未提供'}</strong><p>{task.productId} {task.productName||'物料名称未提供'}</p><p>需求 {task.orderId} · {typeof task.quantity==='number'?task.quantity+' '+(task.unit||'千克'):'数量未提供'}</p><p>{time(task.start)} — {time(task.end)}（结束不含）</p><p>设备 {task.machine} {task.machineName||''}</p><p>已排计划 · 现场进度：{task.physicalStatus||'未提供'}</p><small>点击查看任务、前后工序、资源、风险与来源</small></>;
}
export function DemandTaskHover({task,identity,anchor,id}:{task:any;identity:QueryIdentity;anchor:HoverAnchor;id:string}){
 const ref=useRef<HTMLDivElement>(null),[position,setPosition]=useState({left:anchor.left,top:anchor.bottom+8});
 useLayoutEffect(()=>{const box=ref.current;if(!box)return;const width=box.offsetWidth,height=box.offsetHeight;setPosition({left:Math.max(8,Math.min(anchor.left,window.innerWidth-width-8)),top:anchor.bottom+height+16<window.innerHeight?anchor.bottom+8:Math.max(8,anchor.top-height-8)});},[anchor,task.id]);
 return createPortal(<div id={id} ref={ref} role="tooltip" className="demand-task-hover" style={position}>{task.kind?<EquipmentLayerHoverContent layer={task} identity={identity}/>:<DemandTaskHoverContent task={task} identity={identity}/>}</div>,document.body);
}
