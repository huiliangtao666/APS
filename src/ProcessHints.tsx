import {createContext,useContext,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

type Hint={id:string;label:string;content:ReactNode;anchor:DOMRect};
type Controls={active?:string;show:(hint:Hint)=>void;leave:(id:string)=>void;keep:()=>void;hide:()=>void};
const Hints=createContext<Controls|null>(null);
/** One portal for the diagram: no nested title tooltip, no overlapping hints,
 * and details remain readable outside the scaled / clipped diagram canvas. */
export function ProcessHintProvider({children,resetKey}:{children:ReactNode;resetKey:string}){
 const [active,setActive]=useState<Hint>(),[position,setPosition]=useState({left:8,top:8}),panel=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>>();
 const keep=()=>clearTimeout(timer.current),hide=()=>{keep();setActive(undefined);};
 const show=(hint:Hint)=>{keep();setActive(hint);};
 const leave=(id:string)=>{keep();timer.current=setTimeout(()=>setActive(current=>current?.id===id?undefined:current),100);};
 useEffect(()=>{hide();return keep;},[resetKey]);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')hide();},outside=(e:Event)=>{if(!(e.target instanceof Element)||!e.target.closest('.process-hint-trigger,.process-hint-panel'))hide();};
  window.addEventListener('resize',hide);window.addEventListener('scroll',outside,true);document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape);
  return()=>{window.removeEventListener('resize',hide);window.removeEventListener('scroll',outside,true);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape);};
 },[]);
 useLayoutEffect(()=>{if(!active||!panel.current)return;const box=panel.current.getBoundingClientRect(),a=active.anchor;setPosition({left:Math.max(8,Math.min(a.left,window.innerWidth-box.width-8)),top:Math.max(8,a.bottom+8+box.height<=window.innerHeight-8?a.bottom+8:Math.min(a.top-box.height-8,window.innerHeight-box.height-8))});},[active]);
 return <Hints.Provider value={{active:active?.id,show,leave,keep,hide}}>{children}{active&&createPortal(<div className="process-hint-panel" ref={panel} role="tooltip" id={active.id} style={position} onMouseEnter={keep} onMouseLeave={()=>leave(active.id)}><strong>{active.label}</strong>{active.content}</div>,document.body)}</Hints.Provider>;
}

export function ProcessHint({label,children}:{label:string;children:ReactNode}){
 const controls=useContext(Hints),id='process-hint-'+useId().replace(/:/g,'');
 return <button type="button" className="process-hint-trigger" aria-label={label+'详情'} aria-describedby={controls?.active===id?id:undefined} onMouseEnter={e=>controls?.show({id,label,content:children,anchor:e.currentTarget.getBoundingClientRect()})} onMouseLeave={()=>controls?.leave(id)} onFocus={e=>controls?.show({id,label,content:children,anchor:e.currentTarget.getBoundingClientRect()})} onBlur={()=>controls?.leave(id)} onClick={e=>controls?.show({id,label,content:children,anchor:e.currentTarget.getBoundingClientRect()})}>!</button>;
}
