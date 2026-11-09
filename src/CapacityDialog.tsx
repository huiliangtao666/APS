import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
export const capacityNumber=(n:any)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('zh-CN',{maximumFractionDigits:3}):'-';
export function CapacityDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const panel=useRef<HTMLElement>(null),close=useRef<HTMLButtonElement>(null),drag=useRef<any>(),[position,setPosition]=useState(()=>({x:Math.max(10,window.innerWidth-650),y:95}));
 const clamp=(x:number,y:number)=>({x:Math.max(8,Math.min(x,window.innerWidth-(panel.current?.offsetWidth||320)-8)),y:Math.max(8,Math.min(y,window.innerHeight-100))});
 useEffect(()=>{const previous=document.activeElement as HTMLElement;close.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[onClose]);
 useEffect(()=>{const resize=()=>setPosition(p=>clamp(p.x,p.y));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 return createPortal(<aside className="capacity-dialog" ref={panel} role="dialog" aria-modal="false" aria-label={title} style={{left:position.x,top:position.y,maxHeight:window.innerHeight-position.y-12}}><header onPointerDown={e=>{if(e.button!==0||(e.target as HTMLElement).closest('button'))return;drag.current={clientX:e.clientX,clientY:e.clientY,left:position.x,top:position.y};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current)setPosition(clamp(drag.current.left+e.clientX-drag.current.clientX,drag.current.top+e.clientY-drag.current.clientY));}} onPointerUp={()=>{drag.current=undefined;}} onPointerCancel={()=>{drag.current=undefined;}}><h3>{title}</h3><small>拖动标题悬浮</small><button ref={close} onClick={onClose}>关闭</button></header><div className="capacity-dialog-body">{children}</div></aside>,document.body);
}
