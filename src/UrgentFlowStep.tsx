import {forwardRef,useId,type ReactNode} from 'react';

type Props={number:number;title:string;label?:string;open:boolean;onToggle:()=>void;children:ReactNode;className?:string};

export const UrgentFlowStep=forwardRef<HTMLElement,Props>(function UrgentFlowStep({number,title,label,open,onToggle,children,className=''},ref){
 const contentId=useId();
 return <section ref={ref} className={'urgent-flow-step '+className} aria-label={label||title}>
  <header className="urgent-step-heading">
   <h3><span>{number}</span> {title}</h3>
   <button type="button" className="urgent-step-toggle" aria-expanded={open} aria-controls={contentId} aria-label={(open?'收起':'展开')+'第'+number+'步：'+title} onClick={onToggle}>
    <span aria-hidden="true">{open?'−':'＋'}</span> {open?'收起':'展开'}
   </button>
  </header>
  <div id={contentId} className="urgent-step-content" hidden={!open}>{children}</div>
 </section>;
});
