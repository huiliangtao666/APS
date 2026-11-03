import {useEffect,useState} from 'react';
import {QueryColumns} from './QueryReportsControls';
import {useChartColumns,chartDate,ChartTableFields,chartFieldLayout,type ChartField} from './EquipmentChartControls';
import {sameQueryIdentity,type QueryRecord,type QueryIdentity,type QueryApi,type QueryColumn} from './QueryReportsTypes';
import './EquipmentLoadMatrix.css';
const known=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const metrics:QueryColumn[]=[{key:'occupiedMinutes',label:'日槽位占用'},{key:'taskMinutes',label:'任务占用'},{key:'wipMinutes',label:'WIP保留占用'},{key:'cleaningMinutes',label:'清洗占用'},{key:'startedBatchKg',label:'开工日投产量（kg）'},{key:'dailyCapacityKg',label:'冻结日投产能力（kg）'},{key:'availableWorkMinutes',label:'可用工作（分钟）'},{key:'workingOccupiedMinutes',label:'工作占用（分钟）'},{key:'utilization',label:'工时利用率'}];
const columns:ChartField[]=[{key:'machine',label:'设备编号',fixed:true,width:80},{key:'name',label:'设备名称',width:150},{key:'group',label:'设备组',width:76},{key:'windowOccupancy',label:'窗口占用率',width:86},{key:'taskCount',label:'任务数',width:66}];
const percent=(n:number)=>Number((n*100).toFixed(2))+'%';
export function equipmentLoadValue(values:Record<string,any>,metric:string){
 const value=values[metric],mass=['startedBatchKg','dailyCapacityKg'].includes(metric),denominator=metric==='utilization'?1:mass?values.dailyCapacityKg:1440;
 const ratio=known(value)&&known(denominator)&&denominator>0?value/denominator:null;
 return {text:known(value)?mass||metric==='availableWorkMinutes'||metric==='workingOccupiedMinutes'?Number(value.toFixed(2)).toString():ratio===null?'未提供':percent(ratio):'未提供',ratio,raw:known(value)?value:null};
}
export async function loadEquipmentMatrix(api:QueryApi,identity:QueryIdentity,query:object,fingerprint:string,live=()=>true){
 const result:QueryRecord[]=[],seen=new Set<string>();let offset=0,total:number|undefined;
 do{const r=await api('/workbooks/equipment/detail?request='+encodeURIComponent(JSON.stringify({identity,query,queryFingerprint:fingerprint,table:'equipment-load-matrix',offset})));if(!live())return undefined;
  if(!sameQueryIdentity(identity,r.identity)||r.queryFingerprint!==fingerprint)throw Error('设备负荷冻结身份变化，请重新查询');
  if(!Array.isArray(r.resources)||!Number.isSafeInteger(r.total)||r.total<0||total!==undefined&&r.total!==total)throw Error('设备负荷设备总数变化');total=r.total;
  for(const resource of r.resources){if(typeof resource.id!=='string'||seen.has(resource.id)||!Array.isArray(resource.records)||!resource.records.length||!Number.isSafeInteger(resource.taskCount)||resource.taskCount<0||resource.windowOccupancy!==null&&(!known(resource.windowOccupancy)||resource.windowOccupancy<0))throw Error('设备负荷设备记录异常');seen.add(resource.id);const days=new Set();for(const cell of resource.records){if(cell.values?.machine!==resource.id||!Number.isSafeInteger(cell.values.day)||days.has(cell.values.day)||!known(cell.downtimeMinutes)||cell.downtimeMinutes<0||cell.downtimeMinutes>1440)throw Error('设备负荷日期归属异常');days.add(cell.values.day);result.push({...cell,resourceSummary:{taskCount:resource.taskCount,windowOccupancy:resource.windowOccupancy}});}}
  if(r.nextOffset===null){if(seen.size!==total)throw Error('设备负荷设备未完整加载');break;}
  if(!r.resources.length||r.nextOffset!==offset+r.resources.length||r.nextOffset>total!)throw Error('设备负荷分页未前进');offset=r.nextOffset;
 }while(true);return result;
}
type Props={from:number;to:number;onOpen:(r:QueryRecord)=>void;identity:QueryIdentity;preferenceScope:string;observationDay?:number;onWindow?:(step:number)=>void;windowDisabled?:boolean};
export function EquipmentLoadChart(props:Props&{api:QueryApi;query:object;fingerprint:string}){
 const [rows,setRows]=useState<QueryRecord[]>(),[error,setError]=useState('');
 useEffect(()=>{let live=true;loadEquipmentMatrix(props.api,props.identity,props.query,props.fingerprint,()=>live).then(r=>{if(live&&r)setRows(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[props.identity.fingerprint,props.fingerprint]);
 if(error)return <p role="alert">{error}</p>;if(!rows)return <p role="status">正在加载全部匹配设备的完整负荷矩阵…</p>;return <EquipmentLoadMatrix {...props} rows={rows}/>;
}
export function EquipmentLoadMatrix({rows,from,to,onOpen,identity,preferenceScope,observationDay,onWindow,windowDisabled}:Props&{rows:QueryRecord[]}){
 const {visible,save}=useChartColumns(preferenceScope,'E3-matrix-r2',columns),[chosen,setChosen]=useState('occupiedMinutes'),[density,setDensity]=useState('fit'),[activeDay,setActiveDay]=useState(Math.max(from,Math.min(to-1,observationDay??from))),[selected,setSelected]=useState<string>(),[height,setHeight]=useState(900);
 useEffect(()=>{const resize=()=>setHeight(window.innerHeight);resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 const candidates=metrics,metric=candidates.find(c=>c.key===chosen)||candidates[0];
 const resources=[...new Map(rows.map(r=>[r.values.machine,r])).values()].sort((a,b)=>String(a.values.machine).localeCompare(String(b.values.machine),'zh-CN',{numeric:true})),cells=new Map(rows.map(r=>[r.values.machine+'|'+r.values.day,r]));
 const days=Array.from({length:to-from},(_,i)=>from+i),rowHeight=density==='fit'?Math.max(16,Math.min(30,Math.floor((height-415)/Math.max(1,resources.length))-1)):density==='compact'?24:34;
 const fieldLayout=chartFieldLayout(columns,visible);
 const totalTasks=resources.reduce((sum,r)=>sum+Number((r.resourceSummary as any)?.taskCount||0),0),over=rows.filter(r=>r.values.overlap===true).length;
 const span=`${chartDate(from,identity.dayZero)} — ${chartDate(to-1,identity.dayZero)}`;
 return <section className="equipment-load-chart" aria-label="设备逐日负荷矩阵">
 <div className="load-summary"><span>设备 <b>{resources.length}</b> 台</span><span>窗口关联任务 <b>{totalTasks}</b> 个</span><span>观察 <b>{known(observationDay)?chartDate(observationDay,identity.dayZero):'未提供'}</b></span><span>超占提示 <b>{over}</b> 个设备日</span></div>
 <div className="equipment-view-toolbar"><strong>设备负荷 <small>{span}</small></strong>{onWindow&&<><button type="button" aria-label="上一个负荷日期窗口" disabled={windowDisabled||from<to-from} onClick={()=>onWindow(-1)}>‹</button><button type="button" aria-label="下一个负荷日期窗口" disabled={windowDisabled||to+(to-from)>44} onClick={()=>onWindow(1)}>›</button></>}<label>口径<select aria-label="设备负荷口径" disabled={!metric} value={metric?.key||''} onChange={e=>setChosen(e.target.value)}>{candidates.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></label><label>行高<select value={density} onChange={e=>setDensity(e.target.value)}><option value="fit">一屏总览</option><option value="compact">紧凑</option><option value="standard">标准</option></select></label><QueryColumns popover columns={columns} value={visible} onChange={save}/><span>点击日期高亮 · 点击日期格查看任务、停机与来源</span></div>
 {!metric?<p>请在显示栏位中选择一个负荷指标。</p>:<div className="equipment-heatmap load-matrix chart-field-matrix"><table style={{minWidth:fieldLayout.width+days.length*44}}><colgroup>{fieldLayout.fields.map(c=><col key={c.key} style={{width:c.width}}/>)}{days.map(d=><col key={d}/>)}</colgroup><thead><tr><ChartTableFields columns={columns} visible={visible} header/>{days.map(d=>{const date=chartDate(d,identity.dayZero),week=new Date(date+'T00:00:00Z').getUTCDay();return <th key={d} className={(activeDay===d?'load-active-day ':'')+(week===0||week===6?'load-weekend':'')}><button type="button" aria-pressed={activeDay===d} title={date+'；点击高亮此日期'} onClick={()=>setActiveDay(d)}>{date.slice(5).replace('-','.')}<small>{['日','一','二','三','四','五','六'][week]}</small></button></th>;})}</tr></thead><tbody>{resources.map(r=>{
 const machine=String(r.values.machine),summary=r.resourceSummary as any;
 return <tr key={machine}><ChartTableFields columns={columns} visible={visible} values={{...r.values,machine,windowOccupancy:known(summary?.windowOccupancy)?percent(summary.windowOccupancy):null,taskCount:known(summary?.taskCount)?summary.taskCount:null}}/>{days.map(d=>{
 const cell=cells.get(machine+'|'+d),values=cell?.values||{},value=equipmentLoadValue(values,metric.key),stop=known(cell?.downtimeMinutes)?cell.downtimeMinutes:0,fullStop=stop>=1440,stopOnly=fullStop&&values.occupiedMinutes===0&&['occupiedMinutes','taskMinutes','wipMinutes','cleaningMinutes'].includes(metric.key),conflict=values.overlap===true;
 const load=conflict||value.ratio!==null&&value.ratio>1?'over':value.ratio===null?'unknown':value.ratio>=.8?'high':value.ratio>=.4?'medium':'low';
 const text=!cell?'—':stopOnly?'停机':value.text;
 const label=`${machine} / ${chartDate(d,identity.dayZero)} / ${metric.label}：${cell?value.text:'当前筛选无记录'}；自然占用 ${known(values.occupiedMinutes)?values.occupiedMinutes:'未提供'} 分钟 / 1440分钟；已知停机 ${stop} 分钟${conflict?'；超占提示':''}`;
 return <td key={d} className={activeDay===d?'load-active-day':''}><button type="button" disabled={!cell} aria-label={label} title={label} className={'load-cell load-'+load+(stop?' load-stopped':'')+(selected===cell?.id?' load-cell-selected':'')} style={{height:rowHeight}} onClick={()=>{if(cell){setSelected(cell.id);setActiveDay(d);onOpen(cell);}}}><span>{text}{stop>0&&!stopOnly&&<small> 停</small>}{conflict&&<b aria-label="超占提示"> !</b>}</span>{value.ratio!==null&&!stopOnly&&<i aria-hidden="true" style={{width:Math.max(0,Math.min(1,value.ratio))*84+'%'}}/>}</button></td>;
 })}</tr>;
 })}</tbody></table></div>}
 <div className="equipment-legend load-legend"><span><i className="load-low-key"/>＜40%</span><span><i className="load-medium-key"/>40%–＜80%</span><span><i className="load-high-key"/>80%–100%</span><span><i className="load-over-key"/>超占提示</span><span><i className="load-stop-key"/>已知停机</span><small>图示全部匹配设备 · 日槽位占用＝任务/WIP/清洗的自然占用并集÷1440；不等于产能利用率</small><details><summary>口径说明</summary><p>日槽位、任务、WIP、清洗按自然日分钟折算百分比；重叠区间只计一次。窗口占用以整个所选窗口为分母，日期记录不完整时显示“—”。工时利用率沿用冻结工作分母，缺失时显示“未提供”。投产量/能力以千克显示、以冻结日能力着色；工作分钟以分钟显示、以1440分钟着色。颜色只表示当前指标，不代表全部业务约束通过；“停”来自冻结观察时刻已知的停机安排，部分停机或占用与停机并存时同时保留数值，详情可查看准确区间。当前筛选没有对应日期记录时显示“—”。</p></details></div>
 </section>;
}
