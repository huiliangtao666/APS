import {useId} from 'react';
import {ParameterHint} from './ParameterHelp';
import './CapacityParameters.css';
export const capacityScenarioDefaults={timePct:100,equipmentPct:100,crewPct:100,toolPct:100,speedPct:100,recoveryPct:0,overtimeHours:0,standardHours:null,batchKg:null,shifts:null,sundayShifts:null,crewAdds:{},toolAdds:{},equipmentAdds:{}};
const specs=[
 ['timePct','有效工作时间（%）',0,200,'100%沿用已保存日历；仅增加可变加工工作量，固定跨日历时不缩短。'],
 ['standardHours','标准日产能对应工时（小时）',1,24,'选填；来自分析者填写的工时换算基准，不从未启用的分钟字段猜测。'],
 ['overtimeHours','额外工作时长（小时/日）',0,12,'须先填写标准工时；与工作时间百分比相乘换算。基准加加班不得超过24小时。'],
 ['shifts','工厂生产班次（班/日）',0,3,'留空沿用每日工厂日历；填写后对本次区间使用统一班次。0表示停产。'],
 ['sundayShifts','班组周日班次（班/日）',0,3,'留空沿用各班组周日班次；与工厂日历取交集，不将班次数乘为人数。'],
 ['equipmentPct','设备有效率（%）',0,100,'可用机位预算及日产能按此比例折减，不改变已知停机记录。'],
 ['crewPct','班组出勤率（%）',0,100,'各班组原人数加新增人数后，按出勤率向下取整；不跨技能调配。'],
 ['toolPct','工装可用率（%）',0,100,'实体套数按可用率折算；共享池按实体去重，不能重复累加。'],
 ['speedPct','可变加工速度（%）',25,200,'仅调整按量工序速度与日产能；不压缩固定自然历时。'],
 ['recoveryPct','已知停机恢复（%）',0,100,'分析恢复已知停机时段的上限收益，实施前需要确认停机可调整。'],
 ['batchKg','模拟标准批量（千克）',.001,100000,'留空使用已保存标准批量；仍受设备和工装单批上限约束。增批可摊薄固定占用。'],
] as const;
export function CapacityParameters({value,options,onChange,compact=false}:{value:any;options:any;onChange:(v:any)=>void;compact?:boolean}){
 const prefix=useId(),[primary,...rest]=specs;
 const resourceHelp:any={crewAdds:'在来源人数上累计增加该班组的同技能人员，再按出勤率向下取整。不自动跨技能调配；新增总数填4表示来源人数加4。',toolAdds:'在来源实体工装上累计增加同类型兼容套数，仍受承载量、共享关系及其他资源约束。新增数量为相对来源的累计新增总数。',equipmentAdds:'在来源设备组上累计增加兼容机位，按组内最快兼容设备估算能力；仍受工装、班组及批量约束。新增数量为相对来源的累计新增总数。'};
 const shortLabels:any={timePct:'工时%',standardHours:'基准工时h',overtimeHours:'加班h'};
 function field(spec:typeof specs[number]){const [key,label,min,max,meaning]=spec,id=prefix+'-'+key;return <div className="capacity-parameter-field" key={key}><span className="capacity-parameter-caption"><label htmlFor={id}>{compact?(shortLabels[key]||label):label}</label><ParameterHint label={label} description={meaning+' 取值范围：'+min+'～'+max+(['shifts','sundayShifts'].includes(key)?'，填写整数。':'。')}/></span><input id={id} aria-label={label} type="number" min={min} max={max} step={['shifts','sundayShifts'].includes(key)?1:'any'} placeholder={key==='standardHours'?'自行填写':'沿用来源'} value={value[key]??''} onChange={e=>onChange({...value,[key]:e.target.value===''?null:Number(e.target.value)})}/></div>;}

 return <section className={'capacity-parameters'+(compact?' capacity-parameters-compact':'')}><div className="capacity-primary-parameters">{field(primary)}{field(specs[1])}{field(specs[2])}{!compact&&<span>对本次区间统一生效；仅分析，不修改来源数据或排程。</span>}</div>
 <details className="capacity-more-parameters"><summary><span>{compact?'更多参数':'更多模拟参数与资源增配'}</span><ParameterHint label="方案模拟与资源增配" description="班次、效率、人员、工装和机位等参数对本次区间统一生效；模拟不回写来源或排程。新增设备按组内最快兼容机位估算，同技能人员、同类型工装才可共享；固定自然历时不随加班缩短。新增数量填写相对来源的累计新增总数。"/></summary><div className="capacity-parameter-grid">{rest.filter(s=>!['standardHours','overtimeHours'].includes(s[0])).map(field)}</div>

 <div className="capacity-resource-editors">{([['crewAdds','crews','班组增员（人）'],['toolAdds','tools','工装增配（套）'],['equipmentAdds','equipment','兼容机位增配（个）']] as const).map(([key,list,label])=><details key={key}><summary><span>{label}</span><ParameterHint label={label} description={resourceHelp[key]}/></summary><div className="capacity-resource-scroll"><table><thead><tr><th>资源</th><th>来源数量</th><th>新增数量</th></tr></thead><tbody>{options[list].map((r:any)=><tr key={r.id}><td><span className="capacity-resource-name"><span>{r.name||r.id}</span>{r.name&&r.name!==r.id&&<small>{r.id}</small>}</span></td><td>{r.count??'-'}</td><td><input aria-label={label+' '+r.id} type="number" min={0} max={100} step={1} value={value[key][r.id]||0} onChange={e=>onChange({...value,[key]:{...value[key],[r.id]:Number(e.target.value)}})}/></td></tr>)}</tbody></table></div></details>)}</div>
 </details></section>;
}
