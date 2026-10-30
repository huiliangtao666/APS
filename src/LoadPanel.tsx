import {useMemo,useState} from 'react';
import {resourceLoad} from './lib/resource-load.mjs';
import {timeLabel,validInterval} from './lib/timetable.mjs';
const show=(v:any)=>v==null?'未知':String(v);
export function LoadPanel({plan,onTask,onInput,onExport}:{plan:any;onExport?:(options:{start:number;end:number;kind:string})=>void;onTask:(ids:string[])=>void;onInput:(table:string,row:Record<string,string>)=>void}){
 const [from,setFrom]=useState('0'),[to,setTo]=useState('120'),[kind,setKind]=useState('all');
 const valid=from.trim()!==''&&to.trim()!==''&&validInterval(Number(from),Number(to));
 const report=useMemo(()=>resourceLoad(plan,{start:valid?Number(from):0,end:valid?Number(to):120}),[plan,from,to,valid]);
 const links=(r:any)=><><div>{r.taskIds?.map((id:string)=><button key={id} onClick={()=>onTask([id])}>定位任务 {id}</button>)}</div><details><summary>保存的原始数据与判断依据</summary>{r.inputRefs?.map((ref:any,i:number)=><button key={i} onClick={()=>onInput(ref.table,ref.row)}>查看保存输入 {ref.table} / {Object.values(ref.row).slice(0,2).join(' · ')}</button>)}<pre>{JSON.stringify(r,null,2)}</pre></details></>;
 return <section className="panel fr032" aria-label="资源负荷、物料缺口与提醒"><h2>资源负荷、物料缺口与提醒 · FR032</h2>
 <p>方案 {show(report.provenance.planId)} · 运行 {show(report.provenance.runId)} · 输入 {show(report.provenance.inputVersion)} · 哈希 {show(report.provenance.snapshotHash)} · 状态 {show(report.provenance.status)}</p>
 <p>本页仅展示所选保存方案；保存执行事实不叠加计划占用，当前事实对照沿用下方 FR033。订单延后直接取保存交付评估，不累加工序数量。</p>
 <p>{report.limits.join('；')}</p>{!report.hasInput&&<p role="status">历史原始输入缺失；不使用当前配置填补。</p>}
 <label>负荷窗口开始分钟<input aria-label="负荷窗口开始分钟" type="number" value={from} onChange={e=>setFrom(e.target.value)}/></label>
 <label>负荷窗口结束分钟<input aria-label="负荷窗口结束分钟" type="number" value={to} onChange={e=>setTo(e.target.value)}/></label>
 <label>负荷类别<select aria-label="负荷类别" value={kind} onChange={e=>setKind(e.target.value)}>{[['all','全部'],['machines','设备'],['resources','工装 / 人员 / 空间'],['materials','物料'],['alerts','提醒']].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
 {!valid&&<p role="alert">负荷窗口须为有效数字且结束大于开始。请修正后核对或导出。</p>}
 <button disabled={!valid||!plan||!onExport} onClick={()=>onExport?.({...report.window,kind})}>导出当前负荷视图 CSV</button>
 <p>负荷统计窗口：{timeLabel(report.window.start)} — {timeLabel(report.window.end)}。物料与提醒保留整份方案，不受负荷窗口截断。</p>
 {valid&&<>
 {(kind==='all'||kind==='machines')&&<div className="table-wrap"><table><caption>设备计划忙闲；未分配时间不等于动态可用</caption><thead><tr><th>设备</th><th>计划忙时 / 未分配分钟</th><th>溯源</th></tr></thead><tbody>{report.machines.map((r:any)=><tr key={r.id}><td>{r.id}</td><td>{show(r.busyMinutes)} / {show(r.unallocatedMinutes)} 分钟；实时空闲未知</td><td>{links(r)}</td></tr>)}</tbody></table></div>}
 {(kind==='all'||kind==='resources')&&<div className="table-wrap"><table><caption>保存工装占用、人员需求、空间使用；峰值按完整占用窗口计算</caption><thead><tr><th>资源 / 单位</th><th>配置总量 / 计划峰值 / 数量×分钟</th><th>溯源</th></tr></thead><tbody>{report.resources.map((r:any)=><tr key={r.type+r.id}><td>{r.type} / {r.id} / {r.unit}</td><td>{r.demands.map((d:any,i:number)=><p key={i}>{d.candidateGroupIds?`候选集合 ${d.candidateGroupIds.join(' / ')} 合计需求（本组可选）`:'声明需求'} {show(d.quantity)} {d.unit} · {d.orderId} / {d.operation}</p>)}配置总量 {show(r.capacity)} · 峰值 {show(r.peak?.value)} · 数量×分钟 {show(r.quantityMinutes?.value)}<p>{r.status==='unknown'?'占用未知 / 未检查；不视为零需求':'保存的显式计划占用'}；动态剩余未知</p></td><td>{links(r)}</td></tr>)}</tbody></table>{!report.resources.length&&<p>无保存资源占用；未知，不代表资源充足。</p>}</div>}
 {(kind==='all'||kind==='materials')&&<div className="table-wrap"><table><caption>逐投料物料缺口；候选分配与已提交分配分开，不重复消费库存</caption><thead><tr><th>物料 / 需求 / 单位</th><th>分配 / 缺口 / 已提交分配</th><th>投料时点 / 依据</th></tr></thead><tbody>{report.materials.map((r:any)=><tr key={r.index}><td>{r.materialId} · 需求 {show(r.quantity)} {r.unit}</td><td>分配 {show(r.allocated?.value)} · 缺口 {show(r.shortage)} {r.unit} · 已提交分配 {show(r.committedConsumption?.value)}<p>{r.committed?'计划分配已提交（非真实耗料）':'候选 / 未提交'}</p></td><td>{timeLabel(r.feedMinute)}<p>{r.formula} · {r.blockedReason||r.suggestion}</p>{links(r)}</td></tr>)}</tbody></table>{!report.materials.length&&<p>无保存物料评估；缺口未知，不视为零。</p>}</div>}
 {(kind==='all'||kind==='alerts')&&<div className="table-wrap"><table><caption>订单延后、条件到料、缺口与缺失输入提醒</caption><thead><tr><th>提醒 / 原因</th><th>数量 / 时间</th><th>溯源</th></tr></thead><tbody>{report.alerts.map((r:any,i:number)=><tr key={i}><td>{r.code} · {r.orderId||r.resourceId}<p>{r.message}</p></td><td>{show(r.quantity)} {r.unit}<p>{r.candidate?'未排候选时点：':''}{timeLabel(r.minute)}</p>{r.delayMinutes!=null&&<p>延后 {r.delayMinutes} 分钟；要求 {timeLabel(r.dueMinute)}</p>}</td><td>{links(r)}</td></tr>)}</tbody></table>{!report.alerts.length&&<p>没有保存的提醒；不代表完整业务可行。</p>}</div>}
 </>}
 </section>;
}
