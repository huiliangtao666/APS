import {useEffect,useRef,useState} from 'react';
import {QueryColumns} from './QueryReportsControls';
import {EquipmentGanttAxis,useChartColumns,ChartFieldCells,chartFieldLayout,type ChartField} from './EquipmentChartControls';
import {type GanttNode} from './EquipmentNodeAnalysis';
import {MaterialRiskDetails} from './MaterialRiskDetails';
import {queryValue,type QueryApi,type QueryIdentity,type QueryRecord} from './QueryReportsTypes';
import './MaterialRiskGantt.css';
type RiskEvent={quantity?:number|null;key:string;label:string;at:number;end:number|null;precision:'day'|'minute';tone:string};
type Timeline={materialId:string|null;materialName:string|null;category:string;quantity:number|null;unit:string|null;events:RiskEvent[];missing:string[]};
const amount=(t:Timeline)=>t.quantity===null?'未提供':`${t.quantity}${t.unit?' '+t.unit:'（单位未提供）'}`;
const eventSpan=(e:RiskEvent)=>({start:e.precision==='day'&&e.end===null?Math.floor(e.at/1440)*1440:e.at,end:e.end??(e.precision==='day'?(Math.floor(e.at/1440)+1)*1440:e.at)});
export function riskEventVisible(e:RiskEvent,start:number,end:number){const span=eventSpan(e);return span.end===span.start?span.start>=start&&span.start<end:span.start<end&&span.end>start;}
const columns:ChartField[]=[{key:'id',label:'记录编号',fixed:true,width:116},{key:'materialId',label:'物料编号',width:84},{key:'materialName',label:'物料名称',width:170},{key:'kind',label:'记录类型',width:92},{key:'quantity',label:'本记录数量',width:92},{key:'unit',label:'单位',width:58},{key:'need',label:'需求 / 在制',width:94}];
const kindName=(kind:string)=>({shortage:'净缺口',finding:'运行问题',allocation:'供给分配',suggestion:'采购参考'}[kind]||kind);
export function MaterialRiskGantt({rows,from,to,focusDay,onDay,density,onTask,onOpen,identity,analysisIdentity,preferenceScope,api,query,fingerprint}:{rows:QueryRecord[];from:number;to:number;focusDay:number|null;onDay:(day:number)=>void;density:string;onTask:(id:string)=>void;onOpen:(r:QueryRecord)=>void;identity:QueryIdentity;analysisIdentity:QueryIdentity;preferenceScope:string;api:QueryApi;query:object;fingerprint:string}){
 const {visible,save}=useChartColumns(preferenceScope,'E5',columns,{material:['materialId','materialName'],quantity:['quantity','unit']}),[active,setActive]=useState<string>(),[node,setNode]=useState<GanttNode>();
 const container=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:1000,height:800});
 useEffect(()=>{const resize=()=>setSize({width:container.current?.clientWidth||1000,height:window.innerHeight});resize();const observer=new ResizeObserver(resize);if(container.current)observer.observe(container.current);window.addEventListener('resize',resize);return()=>{observer.disconnect();window.removeEventListener('resize',resize);};},[]);
 const fieldLayout=chartFieldLayout(columns,visible);
 const start=(focusDay??from)*1440,end=(focusDay===null?to:focusDay+1)*1440,span=end-start,count=focusDay===null?to-from:48;
 const chartWidth=Math.max(count*(focusDay===null?44:27),size.width-fieldLayout.width),baseHeight=density==='fit'?Math.max(22,Math.min(30,Math.floor((size.height-345)/Math.max(1,rows.length)))):density==='compact'?28:42;
 const selected=rows.find(r=>r.id===active);
 const nodeFor=(r:QueryRecord):GanttNode=>({id:r.id,kind:'risk',resource:String(r.values.materialId||r.need||r.id),recordId:r.id});
 const pointTime=(n:number,precision:string)=>precision==='day'?new Date(Date.parse(identity.dayZero+'T00:00:00Z')+Math.floor(n/1440)*86400000).toISOString().slice(0,10):queryValue(n,{key:'start',label:'时刻',format:'instant',timeUnit:'minute'},identity);
 return <><QueryColumns popover columns={columns} value={visible} onChange={save}/>
 {selected&&<div className="equipment-selected-task" role="status"><strong>{selected.id}</strong><span>{String(selected.values.sourceKind)} · {String(selected.values.materialId||'未指定物料')} · 需求/在制 {String(selected.need||'未提供')}</span><button onClick={()=>setNode(nodeFor(selected))}>基本信息与受影响需求</button><button onClick={()=>onOpen(selected)}>明细与来源</button>{typeof selected.values.taskId==='string'&&<button onClick={()=>onTask(selected.values.taskId as string)}>定位关联任务</button>}<button onClick={()=>{setActive(undefined);setNode(undefined);}}>取消高亮</button></div>}
 <div ref={container} className={'equipment-gantt chart-field-gantt risk-gantt '+density} style={{'--chart-field-template':fieldLayout.template+' '+chartWidth+'px'} as React.CSSProperties} role="region" aria-label={(focusDay===null?'日期':'半小时')+'物料风险甘特'}>
 <EquipmentGanttAxis fields={columns} visible={visible} from={from} to={to} focusDay={focusDay} onDay={onDay} width={chartWidth} dayZero={identity.dayZero}/>
 {rows.map(r=>{const t=r.timeline as Timeline|undefined,events=(t?.events||[]).filter(e=>riskEventVisible(e,start,end)),height=Math.max(baseHeight,events.length*13+2),laneHeight=(height-2)/Math.max(1,events.length),kind=r.id.split(':')[0],category=r.values.sourceKind==='条件供给分配'?'条件供给':kindName(kind);
 const related=selected&&selected.need&&selected.need===r.need;
 return <div className={'equipment-resource '+(related?'risk-related':'')} key={r.id}>
 <ChartFieldCells columns={columns} visible={visible} height={height} values={{id:r.id,materialId:t?.materialId??r.values.materialId,materialName:t?.materialName,kind:category,quantity:t?.quantity,unit:t?.unit,need:r.need}} onOpen={()=>{setActive(r.id);setNode(nodeFor(r));}} label={`${r.id} ${r.values.sourceKind}，查看物料风险明细`}/>

 <div className="equipment-track" style={{width:chartWidth,height,backgroundSize:`${chartWidth/count}px 100%`}}>
 {events.map((event,i)=>{const eventData=t?{...t,quantity:event.quantity===undefined?t.quantity:event.quantity}:undefined;const interval=eventSpan(event),point=interval.start===interval.end,left=(Math.max(start,interval.start)-start)/span*100,width=point?8:(Math.min(end,interval.end)-Math.max(start,interval.start))/span*chartWidth;
 const label=`${r.id} · ${event.label} · ${pointTime(event.at,event.precision)}${event.end===null?'':' — '+pointTime(event.end,event.precision)+'（结束不含）'} · ${eventData?amount(eventData):'未提供'}${event.precision==='day'?'；仅按日期定位，不代表全天缺料':''}`;
 return <button key={event.key} className={'risk-node risk-'+event.tone+(point?' risk-point':'')+(active===r.id?' equipment-node-selected':'')} aria-label={label} title={label} style={{left:left+'%',width,top:1+i*laneHeight,height:Math.max(11,laneHeight-1),...(point?{transform:'translateX(-50%)'}:{})}} onClick={()=>{setActive(r.id);setNode(nodeFor(r));}}>{point?'◆':eventData&&eventData.quantity!==null?(width>=180?`${amount(eventData)} · ${event.label}`:width>=35?amount(eventData):''):width>65?event.label:''}</button>;
 })}
 {!events.length&&<button className="risk-undated" title={t?.missing.join('；')} onClick={()=>{setActive(r.id);setNode(nodeFor(r));}}>{t?.events.length?'本窗口外有事件 · 查看记录':'时点未保存 · 查看原因与依据'}</button>}
 </div></div>;
 })}
 </div>
 {node&&<MaterialRiskDetails key={node.id} api={api} identity={analysisIdentity} tableIdentity={identity} query={query} fingerprint={fingerprint} node={node} onTask={onTask} preferenceScope={preferenceScope} onClose={()=>setNode(undefined)} onDetails={()=>{setNode(undefined);const record=rows.find(r=>r.id===node.recordId);if(record)onOpen(record);}}/>}
 </>;
}
