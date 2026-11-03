import {useEffect,useRef,useState} from 'react';
import {QueryColumns} from './QueryReportsControls';
import {useChartColumns,chartDate,ChartTableFields,chartFieldLayout,type ChartField} from './EquipmentChartControls';
import {sameQueryIdentity,type QueryRecord,type QueryIdentity,type QueryApi} from './QueryReportsTypes';
import './PersonnelToolHeatmap.css';
const columns:ChartField[]=[{key:'resource',label:'资源编号',fixed:true,width:80},{key:'name',label:'资源名称',width:150},{key:'kind',label:'资源类别',width:72},{key:'dimension',label:'单位',width:66},{key:'available',label:'可用数量',width:76},{key:'taskCount',label:'任务数',width:66}];
const metrics=[{key:'peak',label:'并发峰值'},{key:'available',label:'可用数量'},{key:'remaining',label:'余量'}];
const known=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export function personnelLoad(peak:unknown,available:unknown){if(!known(peak)||!known(available)||available<0)return 'unknown';if(peak>available)return 'over';if(peak===0)return 'idle';if(available===0)return 'idle';return peak/available>=.8?'high':peak/available>=.5?'medium':'low';}
export async function loadPersonnelMatrix(api:QueryApi,identity:QueryIdentity,query:object,fingerprint:string,live=()=>true){
 const rows:QueryRecord[]=[],seen=new Set<string>();let offset=0,total:number|undefined;
 do{const r=await api('/workbooks/equipment/detail?request='+encodeURIComponent(JSON.stringify({identity,query,queryFingerprint:fingerprint,table:'personnel-matrix',offset})));if(!live())return undefined;
  if(!sameQueryIdentity(identity,r.identity)||r.queryFingerprint!==fingerprint)throw Error('人员工装冻结身份变化，请重新查询');
  if(!Array.isArray(r.resources)||!Number.isSafeInteger(r.total)||r.total<0||total!==undefined&&total!==r.total)throw Error('人员工装资源总数变化');total=r.total;
  for(const resource of r.resources){if(seen.has(resource.id)||!Array.isArray(resource.records)||!Number.isSafeInteger(resource.taskCount)||resource.taskCount<0)throw Error('人员工装资源记录异常');seen.add(resource.id);for(const cell of resource.records){if(cell.values?.resource!==resource.id)throw Error('人员工装日期归属异常');rows.push({...cell,resourceSummary:{taskCount:resource.taskCount}});}}
  if(r.nextOffset===null){if(seen.size!==total)throw Error('人员工装资源未完整加载');break;}
  if(!r.resources.length||r.nextOffset!==offset+r.resources.length||r.nextOffset>r.total)throw Error('人员工装分页未前进');offset=r.nextOffset;
 }while(true);return rows;
}
type Props={rows:QueryRecord[];from:number;to:number;onOpen:(r:QueryRecord)=>void;identity:QueryIdentity;preferenceScope:string;observationDay?:number};
export function PersonnelToolChart(props:Omit<Props,'rows'>&{api:QueryApi;query:object;fingerprint:string}){
 const [rows,setRows]=useState<QueryRecord[]>(),[error,setError]=useState('');
 useEffect(()=>{let live=true;loadPersonnelMatrix(props.api,props.identity,props.query,props.fingerprint,()=>live).then(r=>{if(live&&r)setRows(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[props.identity.fingerprint,props.fingerprint]);
 if(error)return <p role="alert">{error}</p>;if(!rows)return <p role="status">正在加载全部匹配资源的完整日期矩阵…</p>;return <PersonnelToolHeatmap {...props} rows={rows}/>;
}
export function PersonnelToolHeatmap({rows,from,to,onOpen,identity,preferenceScope,observationDay}:Props){
 const {visible,save}=useChartColumns(preferenceScope,'E4-matrix-r2',columns),[chosen,setChosen]=useState('peak'),[density,setDensity]=useState('fit'),[activeDay,setActiveDay]=useState(Math.max(from,Math.min(to-1,observationDay??from))),[selected,setSelected]=useState<string>();
 const container=useRef<HTMLDivElement>(null),[height,setHeight]=useState(800);useEffect(()=>{const resize=()=>setHeight(window.innerHeight);resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 const metric=metrics.find(c=>c.key===chosen)||metrics[0];
 const resources=[...new Map(rows.map(r=>[r.values.resource,r])).values()].sort((a,b)=>(a.values.dimension==='人'?0:1)-(b.values.dimension==='人'?0:1)||String(a.values.resource).localeCompare(String(b.values.resource),'zh-CN',{numeric:true})),cells=new Map(rows.map(r=>[r.values.resource+'|'+r.values.day,r]));
 const fieldLayout=chartFieldLayout(columns,visible);
 const days=Array.from({length:to-from},(_,i)=>from+i),rowHeight=density==='fit'?Math.max(22,Math.min(32,Math.floor((height-390)/Math.max(1,resources.length)))):density==='compact'?28:38;
 return <section aria-label="人员工装逐日占用热力图" className="personnel-chart">
 <div className="equipment-view-toolbar"><strong>人员工装 <small>{chartDate(from,identity.dayZero)} — {chartDate(to-1,identity.dayZero)}</small></strong><label>显示<select value={metric?.key||''} disabled={!metric} onChange={e=>setChosen(e.target.value)}>{metrics.map(c=><option value={c.key} key={c.key}>{c.key==='peak'?'峰值 / 可用':c.label}</option>)}</select></label><label>行高<select value={density} onChange={e=>setDensity(e.target.value)}><option value="fit">一屏总览</option><option value="compact">紧凑</option><option value="standard">标准</option></select></label><QueryColumns popover columns={columns} value={visible} onChange={save}/><span>{resources.length} 个匹配资源 · 按日并发峰值，不乘班次 · 点击日期格查看明细</span></div>
 {!metric?<p>请在显示栏位中选择一个指标。</p>:<div ref={container} className="equipment-heatmap equipment-personnel-heatmap personnel-matrix chart-field-matrix"><table style={{minWidth:fieldLayout.width+days.length*44}}><colgroup>{fieldLayout.fields.map(c=><col key={c.key} style={{width:c.width}}/>)}{days.map(d=><col key={d}/>)}</colgroup><thead><tr><ChartTableFields columns={columns} visible={visible} header/>{days.map(d=>{const day=chartDate(d,identity.dayZero),week=new Date(day+'T00:00:00Z').getUTCDay();return <th key={d} className={(activeDay===d?'personnel-active-day ':'')+(week===0||week===6?'personnel-weekend':'')}><button type="button" aria-pressed={activeDay===d} title={day+'；点击高亮此日期'} onClick={()=>setActiveDay(d)}>{day.slice(5).replace('-','.')}<small>{['日','一','二','三','四','五','六'][week]}</small></button></th>;})}</tr></thead><tbody>{resources.map(r=>{
 const resource=String(r.values.resource),dimension=String(r.values.dimension||'量纲未提供'),available=r.values.available,summary=r.resourceSummary as {taskCount?:number}|undefined;
 return <tr key={resource}><ChartTableFields columns={columns} visible={visible} values={{...r.values,resource,kind:dimension==='人'?'班组':dimension==='实体套'?'工装':null,dimension:r.values.dimension,available:known(available)?available:null,taskCount:known(summary?.taskCount)?summary.taskCount:null}}/>{days.map(d=>{
 const cell=cells.get(resource+'|'+d),peak=cell?.values.peak,capacity=cell?.values.available,value=cell?.values[metric.key],remaining=cell?.values.remaining,load=personnelLoad(peak,capacity),over=load==='over';
 const raw=known(value)?String(value):cell?'未提供':'本页未加载',text=metric.key==='peak'&&known(peak)?`${peak}/${known(capacity)?capacity:'—'}`:raw;
 const basis=cell?`并发峰值：${known(peak)?peak:'未提供'} ${dimension}；可用数量：${known(capacity)?capacity:'未提供'} ${dimension}；余量：${known(remaining)?remaining:'未提供'} ${dimension}`:'本页未加载';
 const label=`${resource} / ${chartDate(d,identity.dayZero)} / ${metric.label}：${raw}${known(value)?' '+dimension:''}；${basis}${over?'；超占提示':''}`;
 return <td key={d} className={activeDay===d?'personnel-active-day':''}><button type="button" disabled={!cell} aria-label={label} title={label} className={'personnel-cell personnel-load-'+load+(!known(value)||load==='unknown'?' equipment-unknown':'')+(over?' equipment-over-capacity':'')+(selected===cell?.id?' personnel-cell-selected':'')} style={{height:rowHeight}} onClick={()=>{if(cell){setSelected(cell.id);setActiveDay(d);onOpen(cell);}}}>{text}{over&&<strong aria-label="超占提示"> !</strong>}</button></td>;
 })}</tr>;
 })}</tbody></table></div>}
 <div className="equipment-legend personnel-legend"><span><i className="personnel-low-key"/>低占用 ＜50%</span><span><i className="personnel-medium-key"/>50%–＜80%</span><span><i className="personnel-high-key"/>80%–100%</span><span><i className="personnel-over-key"/>超占 ＞100%</span><small>人员以人、工装以实体套计 · 斜纹为未提供 · 图示全资源，明细按日分页</small></div>
 </section>;
}
