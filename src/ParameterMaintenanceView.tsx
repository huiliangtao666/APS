import {workbookDate} from './lib/workbook-dates';
import {ParameterHelp} from './ParameterHelp';
export function parameterDisplayValue(field:string,value:unknown):string{
 if(value===undefined||value===null||value==='')return '—';
 if(field==='计划起始日')return workbookDate(value)||String(value);
 if(typeof value==='object')return Object.entries(value).map(([k,v])=>k+'='+String(v)).join('；');
 return String(value);
}
function ParameterCell({p,canWrite,onEdit}:{p:any;canWrite:boolean;onEdit:(p:any)=>void}){
 if(!p)return <span className="parameter-unset">未维护</span>;
 return <div className="parameter-value-cell"><span title={'导入基线：'+parameterDisplayValue(p['参数名称'],p.baselineValue)}>{parameterDisplayValue(p['参数名称'],p.effectiveValue)} <small>{p['单位']}</small></span><span className={'parameter-state '+(['未维护','待补充'].includes(p.status)?'parameter-unset':'')}>{p.status}</span>{p.editable&&<button disabled={!canWrite} onClick={()=>onEdit(p)}>{p.effectiveValue===undefined?'填写':'维护'}</button>}</div>;
}
export function ParameterMaintenanceView({view,canWrite,onEdit,onRelation}:{view:any;canWrite:boolean;onEdit:(p:any)=>void;onRelation:(table:string)=>void}){
 const groups=view.objectRows||[],definition=view.definitions?.find((c:any)=>c['参数编号']===view.cp);
 const cells=groups.flatMap((r:any)=>r.cells),fields:string[]=view.fields||[];
 const helpFor=(field:string)=>view.helpByField?.[(cells.find((p:any)=>p['参数名称']===field)?.cp||view.cp)+'|'+field];
 const firstHelpRows=new Map<string,string>();
 for(const r of groups){const p=r.cells[0],key=p.cp+'|'+p['参数名称'];if(!firstHelpRows.has(key))firstHelpRows.set(key,r.id);}
 return <section className="parameter-current-values" aria-label="当前配置值">
 <header className="parameter-section-title"><b>{definition?definition['参数编号']+' · '+definition['中文配置项']:'全局配置项'}{view.layout==='calendar'&&fields.length===1&&<ParameterHelp help={helpFor(fields[0])}/>}</b>{view.layout==='calendar'&&fields.length>1&&<div className="parameter-calendar-help">{fields.map(f=><div key={f}>{f}<ParameterHelp help={helpFor(f)}/></div>)}</div>}<small>{view.layout==='calendar'?'按日期维护':view.layout==='objects'?'每个对象一行':'按配置序号升序'} · 悬停名称旁 ! 查看说明；悬停数值查看基线</small>{definition?.sourceTables?.map((t:string)=><button key={t} disabled={!canWrite} onClick={()=>onRelation(t)}>维护{t}</button>)}</header>
 {view.layout==='calendar'?<ParameterCalendar view={view} canWrite={canWrite} onEdit={onEdit}/>:<div className="input-scroll qr-scroll"><table className={view.layout==='objects'?'parameter-object-matrix':undefined}><thead><tr>{view.layout==='list'?<><th>序号 / 配置项</th><th>对象</th><th>当前有效值 / 状态</th></>:<><th>对象编号 / 名称</th>{view.fields?.map((f:string)=><th key={f}>{f}<ParameterHelp help={helpFor(f)}/></th>)}</>}</tr></thead><tbody>{groups.map((r:any)=><tr key={r.id}>{view.layout==='list'?<><td><b>{r.cells[0].cp}</b> {r.cells[0].definition?.['中文配置项']}{firstHelpRows.get(r.cells[0].cp+'|'+r.cells[0]['参数名称'])===r.id&&<ParameterHelp help={view.helpByField?.[r.cells[0].cp+'|'+r.cells[0]['参数名称']]}/>}<small>{r.cells[0]['参数名称']!==r.cells[0].definition?.['中文配置项']?r.cells[0]['参数名称']:''}{!r.cells[0].editable?' · 只读':''}</small></td><td>{r.object==='GLOBAL'?'全局':r.object==='CAL'?'工厂':r.object}</td><td><ParameterCell p={r.cells[0]} canWrite={canWrite} onEdit={onEdit}/></td></>:<><th title={r.object+' · '+r.name}>{r.object} <small>{r.name!==r.object?r.name:''}</small></th>{view.fields?.map((f:string)=><td key={f}><ParameterCell p={r.cells.find((p:any)=>p['参数名称']===f)} canWrite={canWrite} onEdit={onEdit}/></td>)}</>}</tr>)}</tbody></table></div>}
 {view.records?.some((p:any)=>p.missingObject)&&<p>缺少业务对象，请先到“排程流程 → 数据准备”导入业务 Excel，再维护对象参数。</p>}
 {!groups.length&&<p>当前范围没有匹配的配置对象。</p>}
 </section>;
}
export function ParameterCalendar({view,canWrite,onEdit}:{view:any;canWrite:boolean;onEdit:(p:any)=>void}){
 const month=view.month,first=new Date(month+'-01T00:00:00Z'),padding=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 const rows=new Map<string,any>((view.objectRows||[]).filter((r:any)=>r.date).map((r:any)=>[r.date,r]));
 return <div className="parameter-calendar" role="region" aria-label="按日期配置"><div className="parameter-calendar-grid">{['一','二','三','四','五','六','日'].map(d=><b key={d} className="parameter-weekday">星期{d}</b>)}{Array.from({length:padding},(_,i)=><div key={'blank'+i} className="parameter-calendar-blank"/>)}{Array.from({length:days},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0'),row=rows.get(date);return <div key={date} className="parameter-calendar-day"><b>{date}</b>{row?row.cells.map((p:any)=><div key={p.recordKey}>{row.cells.length>1&&<small>{p['参数名称']}</small>}<ParameterCell p={p} canWrite={canWrite} onEdit={onEdit}/></div>):<span className="parameter-unset">无匹配日历记录</span>}</div>;})}</div></div>;
}
export function ParameterHistoryTable({records}:{records:any[]}){
 return <div className="input-scroll qr-scroll"><table><thead><tr><th>时间 / 操作人</th><th>配置项 / 对象</th><th>修改前</th><th>修改后</th><th>有效期 / 操作</th></tr></thead><tbody>{records.map(r=><tr key={r.id}><td>{r.at?new Date(r.at).toLocaleString('zh-CN',{hour12:false}):'旧版时间未记录'}<small>{r.actor||'旧版操作人未记录'}</small></td><td>{r.cp||r.table||'试算'} · {((r.table==='工厂日历'||['生产班次数','日产能分母'].includes(r.field))&&/^-?\d+$/.test(String(r.object))?workbookDate(r.object):r.object)||r.trial||'—'}<small>{r.field}</small></td><td>{r.legacy?'旧版未记录':parameterDisplayValue(r.field,r.before?.['参数值']??r.before)}</td><td>{parameterDisplayValue(r.field,r.after?.['参数值']??r.after)}</td><td>{r.after?.['生效日']!==undefined?workbookDate(r.after['生效日'])+' 至 '+workbookDate(Number(r.after['失效日'])-1):''}<small>{r.operation}{r.scope?.startsWith('trial:')?' · 仅试算':''}</small></td></tr>)}</tbody></table></div>;
}
/** Keep the user's value/period, but bind a retried draft to the latest logical source. */
export function rebaseParameterDraft(draft:any,view:any,scope:string){
 const current=view.records.find((p:any)=>p.cp===draft.cp&&p['对象编号']===draft.objectId&&p['参数名称']===draft.field);
 return {...draft,expectedVersion:view.version,expectedParameterRevision:view.parameterRevision||0,...(current?{id:current['参数编号']&&(current.adoptable||current._candidate)&&(scope==='dataset'||current.scope===scope)?current['参数编号']:undefined,sourceRole:current.sourceRole,sourceFrom:current['生效日']}: {})};
}
