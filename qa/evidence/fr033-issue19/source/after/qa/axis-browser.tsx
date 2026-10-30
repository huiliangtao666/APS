// Static browser harness: exact production component/CSS, synthetic saved data, no API/auth.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TimelinePanel} from '../src/TimelinePanel';
import '../src/index.css';
const sourceSHA='AXIS-LABEL-03-R1-WORKING-SOURCE';
const plan:any={id:'BROWSER-SAVED',name:'合成冻结方案 / 非业务验收',runId:'BROWSER-RUN',snapshotHash:'FIXTURE-HASH',inputVersionId:'v7',conditions:{executionFactsVersion:'saved-facts-v1'},
 tasks:[{id:'SHORT',orderId:'A',operation:'MIX',machine:'M',start:0,end:30,source:'保存来源'}, {id:'NEXT',orderId:'A',operation:'FILL',machine:'N',start:60,end:90,predecessor:'SHORT',source:'保存的停机顺延'}, {id:'TINY',orderId:'B',operation:'MIX',machine:'M',start:90,end:90.5,source:'极短任务'}],
 inputSnapshot:{machines:Array.from({length:10},(_,i)=>({'设备编号':i===0?'M':i===1?'N':`M${i}`,'设备名称':'合成设备'})),downtime:[{'设备编号':'N','起始分钟':'30','结束分钟':'60','原因':'冻结停机'}],tools:[{'工装编码':'G40','可用数量':'1'}],personnelGroups:[{'人员组编号':'G','人员数量':'2','技能':'mix','班次':'D','可用起始分钟':'60','可用结束分钟':'120'}],batchResources:[{'资源编号':'SPACE','容量':'10','单位':'m2'}]},
 execution:{facts:[{'事实编号':'SAVED-F','订单编号':'A','工序编号':'MIX','当前设备':'M','开始分钟':'0','观测分钟':'10','工序完成数量':'4','状态':'部分完成','数量单位':'kg'}]},
 resourceReservations:[{type:'工装',resourceId:'G40',quantity:1,unit:'套',start:55,end:100,taskIds:['NEXT']},{type:'人员',resourceId:'G',quantity:2,unit:'人',start:60,end:65,taskIds:['NEXT']},{type:'空间',resourceId:'SPACE',quantity:3,unit:'m2',start:60,end:110,taskIds:['NEXT']}],
 resultAssessment:{tasks:['SHORT','NEXT','TINY'].map(id=>({id,quantity:10,unit:'kg',inputRefs:[{table:'orders',row:{'订单编号':id==='TINY'?'B':'A','合格需求':'10'}}],reasons:id==='NEXT'?[{code:'CALENDAR',message:'冻结停机 [30,60) 后连续运行'}]:[]}))}};
const frozen=JSON.stringify(plan);
function freeze(o:any){Object.values(o).forEach(v=>{if(v&&typeof v==='object')freeze(v)});return Object.freeze(o)}freeze(plan);
const errors:any[]=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
function measure(){
 const host=document.querySelector('.fr033-scroll') as HTMLElement;
 const rect=(e:Element)=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
 return {at:new Date().toISOString(),sourceSHA,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},zoom:(document.querySelector('[aria-label="缩放"]') as HTMLSelectElement).value,
  dateLabels:(()=>{const axis=document.querySelector('.fr033-axis')!.getBoundingClientRect();const all=[...document.querySelectorAll('.fr033-axis>time,.fr033-axis>span')].map(e=>{const range=document.createRange();range.selectNodeContents(e);return {text:e.textContent,rect:rect(e),ink:rect(range as any),full:e.getAttribute('aria-label')}});return {count:all.length,sample:all.filter((_,i)=>i<3||i===all.length-1),minimumGap:all.length>1?Math.min(...all.slice(1).map((e,i)=>e.rect.x-all[i].rect.x-all[i].rect.width)):null,inkOverflow:all.some(e=>e.ink.x<e.rect.x||e.ink.x+e.ink.width>e.rect.x+e.rect.width||e.ink.y+e.ink.height>e.rect.y+e.rect.height),axisOverflow:all.some(e=>e.rect.x<axis.x||e.rect.x+e.rect.width>axis.right+0.01)};})(),
  windowSummary:(document.querySelector('.fr033-window') as HTMLElement)?.innerText,
  axis:rect(document.querySelector('.fr033-axis')!),canvas:rect(document.querySelector('.fr033-canvas')!),scroll:{left:host.scrollLeft,top:host.scrollTop,width:host.clientWidth,height:host.clientHeight,scrollWidth:host.scrollWidth,scrollHeight:host.scrollHeight},
  labels:[...document.querySelectorAll('.fr033-machine-label')].slice(0,3).map(e=>({text:e.textContent,rect:rect(e),position:getComputedStyle(e).position})),
  bars:[...document.querySelectorAll('.fr033-task')].map(e=>({label:e.getAttribute('aria-label'),rect:rect(e),pressed:e.getAttribute('aria-pressed')})),
  alert:document.querySelector('[role="alert"]')?.textContent||null,table:document.querySelector('.fr033 table:last-child')?.textContent,
  details:document.querySelector('[aria-label="选中任务详情"]')?.textContent,
  active:{tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label'),text:document.activeElement?.textContent?.slice(0,80)},
  focusTrace:trace.slice(-15),immutable:JSON.stringify(plan)===frozen,errors};
}
const trace:any[]=[];document.addEventListener('focusin',e=>{const n=e.target as HTMLElement;trace.push({tag:n.tagName,label:n.getAttribute('aria-label'),text:n.textContent?.slice(0,70),outline:getComputedStyle(n).outline})});
function Harness(){
 const [selected,select]=useState<string[]>([]),[current,setCurrent]=useState('9'),[ref,setRef]=useState<any>(null),[logs,setLogs]=useState<any[]>([]);
 return <main style={{maxWidth:1100,padding:16}}><h1>FR033 本地浏览器验收夹具</h1><p>组件与 CSS 源码 SHA {sourceSHA}；合成数据；沿用既有预览，无接口请求、身份模拟或业务确认。</p>
 <div><button id="matrix" onClick={async()=>{
 const change=async(name:string,value:string)=>{const e=document.querySelector(`[aria-label="${name}"]`) as HTMLInputElement;const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(e,value);e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
 const records=[];
 for(const [a,b] of [['0','120'],['-1500','3000'],['0','240000']]){
  await change('窗口开始分钟',a);await change('窗口结束分钟',b);
  for(const z of ['0.25','1','3','8']){await change('缩放',z);records.push(measure());}
 }
 await change('窗口开始分钟','0');await change('窗口结束分钟','120');await change('缩放','0.25');
 setLogs(records);for(const r of records)console.log('AXIS-RECORD',JSON.stringify(r));
 }}>运行四档与边界测量</button><button id="measure" onClick={()=>{const x=measure();setLogs(a=>[...a,x]);console.log('FR033-MEASUREMENT',JSON.stringify(x));}}>记录实际 DOM 几何</button> <button id="change-facts" onClick={()=>setCurrent(current==='9'?'999':'9')}>更改当前对照事实</button> <button id="problem" onClick={()=>select(['NEXT'])}>合成问题定位 NEXT</button></div>
 <TimelinePanel plan={plan} selected={selected} onSelect={select} onInput={(table,row)=>setRef({table,row})} currentFacts={[{'事实编号':'CURRENT-F','订单编号':'A','工序编号':'MIX','工序完成数量':current}]}/>
 <p id="callback">原始输入回调 {JSON.stringify(ref)}</p><p id="integrity">冻结方案未变 {String(JSON.stringify(plan)===frozen)}；当前对照数量 {current}</p>
 <details open><summary>真实浏览器测量日志</summary><pre id="measurements" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(logs,null,2)}</pre></details></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
