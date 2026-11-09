import {useState} from 'react';
import {ParameterHint} from './ParameterHelp';
import {workbookDate} from './lib/workbook-dates';
export type CapacityPatch={id:string;before:number;after:number};
export function ScheduleCapacityParameters({options,patches,onChange,disabled,dayZero}:{options:any[];patches:CapacityPatch[];onChange:(p:CapacityPatch[])=>void;disabled:boolean;dayZero?:string}){
 const groups=[...new Set(options.map(o=>o.table))],[group,setGroup]=useState('设备与工装'),[selected,setSelected]=useState('');
 const available=options.filter(o=>o.table===group),option=available.find(o=>o.id===selected)||available[0];
 const label=(o:any)=>o.table==='工厂日历'?workbookDate(o.object,dayZero)+' · '+o.field:o.object+' · '+o.name+' · '+o.field;
 function add(){if(!option||patches.some(p=>p.id===option.id))return;onChange([...patches,{id:option.id,before:option.value,after:option.kind==='add'?1:option.value}]);}
 return <fieldset className="schedule-capacity-parameters" disabled={disabled}><legend>模拟排产输入参数<ParameterHint label="模拟参数如何采用" description="所有修改累计保存在本次方案草稿；试算调用真实按天排程。新增设备或工装会生成独立实体编号，沿用模板在冻结输入中的参数；对原编号的调整不自动复制给新增编号。日历与班组共同约束能力，固定跨日历时不会因设备日产能增加而缩短。生效后仅更新当前计划版本，原运行和全局主数据保留。"/></legend>
 <div className="schedule-capacity-toolbar"><label>配置类别<select aria-label="瓶颈参数类别" value={group} onChange={e=>{setGroup(e.target.value);setSelected('');}}>{groups.map(g=><option key={g}>{g}</option>)}</select></label><label className="schedule-capacity-field">对象与参数<select aria-label="瓶颈参数选择" value={option?.id||''} onChange={e=>setSelected(e.target.value)}>{available.map(o=><option key={o.id} value={o.id}>{label(o)}</option>)}</select></label><button type="button" disabled={!option||patches.some(p=>p.id===option.id)||patches.length>=60} onClick={add}>添加调整</button><button type="button" disabled={!patches.length} onClick={()=>onChange([])}>清空本次调整</button></div>
 {patches.length?<div className="capacity-scroll"><table><thead><tr><th>对象 / 参数</th><th>原值</th><th>模拟值</th><th>操作</th></tr></thead><tbody>{patches.map(p=>{const o=options.find(o=>o.id===p.id);return <tr key={p.id}><td>{o?label(o):p.id}</td><td>{p.before} {o?.unit}</td><td><input aria-label={'模拟值 '+p.id} type="number" min={o?.min??0} max={o?.max} step={o?.integer?1:'any'} value={Number.isFinite(p.after)?p.after:''} onChange={e=>onChange(patches.map(x=>x.id===p.id?{...x,after:e.target.value===''?NaN:Number(e.target.value)}:x))}/> {o?.unit}</td><td><button type="button" aria-label={'移除调整 '+p.id} onClick={()=>onChange(patches.filter(x=>x.id!==p.id))}>移除</button></td></tr>;})}</tbody></table></div>:<p>选择参数后添加调整，也可点击下方瓶颈措施。所有调整会合并到同一次重排中。</p>}
 </fieldset>;
}
