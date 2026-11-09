import {ChineseDateInput} from './ChineseDateInput';
import {useCallback,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import './ParameterHelp.css';
import {workbookDate,workbookDay} from './lib/workbook-dates';
export type ParameterHelpData={title:string;concise?:boolean;meaning:string;impact:string;usage:string;maintain:string;bounds:string;zero:string;one:string;blank:string;period?:string;options?:{value:string;meaning:string}[];inputSpec?:{type?:string;values?:string[];min?:number;max?:number;inclusive?:boolean;integer?:boolean;unit?:string}};
let closeActive:(()=>void)|undefined;
function ParameterTooltip({label,children,brief=false}:{label:string;children:ReactNode;brief?:boolean}){
 const id=useId(),button=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>>();
 const [position,setPosition]=useState<React.CSSProperties>();
 const cancel=useCallback(()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const hide=useCallback(()=>{cancel();setPosition(undefined);if(closeActive===hide)closeActive=undefined;},[cancel]);
 function show(){
  if(!button.current)return;cancel();if(closeActive!==hide)closeActive?.();closeActive=hide;
  const r=button.current.getBoundingClientRect(),width=Math.min(brief?330:440,window.innerWidth-16),below=window.innerHeight-r.bottom;
  setPosition({position:'fixed',width,left:Math.max(8,Math.min(r.left,window.innerWidth-width-8)),...(below>=Math.min(300,window.innerHeight/2)?{top:r.bottom+5,maxHeight:Math.max(100,below-13)}:{bottom:Math.max(8,window.innerHeight-r.top+5),maxHeight:Math.max(100,r.top-13)})});
 }
 function delayHide(){cancel();timer.current=setTimeout(hide,150);}
 useEffect(()=>()=>{cancel();if(closeActive===hide)closeActive=undefined;},[hide,cancel]);
 useEffect(()=>{
  if(!position)return;
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();hide();}};
  const outside=(e:Event)=>{if(!button.current?.contains(e.target as Node)&&!popup.current?.contains(e.target as Node))hide();};
  const scroll=(e:Event)=>{if(!popup.current?.contains(e.target as Node))hide();};
  document.addEventListener('keydown',key,true);document.addEventListener('pointerdown',outside,true);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',hide);
  return()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',hide);};
 },[position,hide]);
 return <><button ref={button} type="button" className={'parameter-help-trigger'+(brief?' parameter-hint-brief':'')} aria-label={'参数说明：'+label} aria-describedby={position?id:undefined} aria-expanded={!!position} onMouseEnter={show} onMouseLeave={delayHide} onFocus={show} onBlur={delayHide} onClick={e=>{e.preventDefault();e.stopPropagation();show();}}>!</button>{position&&createPortal(<div ref={popup} id={id} role="tooltip" className={'parameter-help-popup'+(brief?' parameter-hint-popup':'')} style={position} onMouseEnter={cancel} onMouseLeave={delayHide}><b>{label}</b>{children}</div>,document.body)}</>;
}
export function ParameterHelp({help,status}:{help?:ParameterHelpData;status?:string}){
 if(!help)return null;
 return <ParameterTooltip label={help.title}>{help.concise?<><p className="parameter-concise-meaning">{help.meaning}</p><dl><dt>影响</dt><dd>{help.impact}</dd><dt>维护</dt><dd>{help.maintain}</dd></dl></>:<dl><dt>含义</dt><dd>{help.meaning}</dd><dt>影响</dt><dd>{help.impact}</dd><dt>如何维护</dt><dd>{help.maintain}</dd><dt>取值要求</dt><dd>{help.bounds}</dd>{help.options?.map(o=><div className="parameter-help-option" key={o.value}><dt>{o.value}</dt><dd>{o.meaning}</dd></div>)}<dt>0 表示</dt><dd>{help.zero}</dd><dt>1 表示</dt><dd>{help.one}</dd><dt>空值</dt><dd>{help.blank}</dd><dt>当前采用</dt><dd>{status?status+'。':''}{help.usage}</dd>{help.period&&<><dt>生效范围</dt><dd>{help.period}</dd></>}</dl>}</ParameterTooltip>;
}
export function ParameterHint({label,description}:{label:string;description:string}){
 return <ParameterTooltip label={label} brief><p>{description}</p></ParameterTooltip>;
}

export function ParameterValueInput({help,field,value,onChange,ariaLabel='参数值',readOnly=false}:{help?:ParameterHelpData;field:string;value:string;onChange:(value:string)=>void;ariaLabel?:string;readOnly?:boolean}){
 const spec=help?.inputSpec;
 if(['生效日','失效日'].includes(field))return <ChineseDateInput label={ariaLabel} readOnly={readOnly} value={workbookDate(value)} onChange={date=>{const day=workbookDay(date);if(day!==null)onChange(String(day));}}/>;
 if(spec?.type==='enum')return <select aria-label={ariaLabel} disabled={readOnly} value={value} onChange={e=>onChange(e.target.value)}><option value="">请选择{field}</option>{value&&!spec.values?.includes(value)&&<option value={value} disabled>{value}（原值不受支持，请重选）</option>}{spec.values?.map(v=><option key={v} value={v}>{v}</option>)}</select>;
 return <input aria-label={ariaLabel} readOnly={readOnly} value={value} inputMode={spec?.type==='number'?'decimal':undefined} placeholder={spec?.type==='number'?(spec.integer?'填写整数':'填写数值，可含小数'):undefined} onChange={e=>onChange(e.target.value)}/>;
}
