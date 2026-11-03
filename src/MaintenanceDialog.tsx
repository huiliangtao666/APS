import {useEffect,useRef,type ReactNode} from 'react';
export function MaintenanceDialog({title,onClose,children,busy=false}:{title:string;onClose:()=>void;children:ReactNode;busy?:boolean}){
 const panel=useRef<HTMLElement>(null),close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement;close.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 return <div className="maintenance-overlay"><section ref={panel} className="qr-drawer maintenance-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e=>{
  if(e.key==='Escape'){e.stopPropagation();if(!busy)onClose();}
  if(e.key==='Tab'){const elements=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,summary,a[href]')||[]).filter(el=>el.getClientRects().length);const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><header><h3>{title}</h3><button ref={close} disabled={busy} onClick={onClose}>关闭维护</button></header>{children}</section></div>;
}
