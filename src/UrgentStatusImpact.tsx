import {workbookDate} from './lib/workbook-dates';

export function UrgentStatusImpact({value}:{value:any}){
 if(!value)return null;
 const range=(t:any)=>`${workbookDate(Math.floor(t.start))}—${workbookDate(Math.ceil(t.end)-1)} / ${t.machine} / ${t.quantity}千克`;
 return <section className="urgent-status-impact" aria-label="任务调整提醒与警告">
  <p role="status">调整提醒：{value.reminders.count} 个未开工任务的计划发生调整。</p>
  {value.warnings.count>0?<p role="alert" className="urgent-started-warning">调整警告：{value.warnings.count} 个已开工任务的剩余工作需要调整。已执行部分及实际耗料保留。</p>:<p>已开工任务保持原安排。</p>}
  {[['reminders','未开工调整明细'],['warnings','已开工调整明细']].map(([key,label])=>value[key].count>0&&<details key={key}><summary>{label}</summary><table><thead><tr><th>任务 / 需求</th><th>原安排</th><th>计算后的安排</th></tr></thead><tbody>{value[key].records.map((r:any)=><tr key={r.taskId}><td>{r.taskId} / {r.demandId}</td><td>{range(r.before)}</td><td>{r.after.length?r.after.map(range).join('；'):'本次未排入，见未排明细'}</td></tr>)}</tbody></table></details>)}
  <p>已完成、已锁定任务保持不动。</p>
  {value.lockSuggestions.length>0&&<div><b>锁定任务调整建议（仅试算）</b><p>以下建议已通过试算检查：插单可完整排入且不迟交，原需求未排量不增加。当前方案未解锁；如采纳，请在执行事实中将锁定状态改为未开工并保存，再重新计算。</p>{value.lockSuggestions.map((s:any,i:number)=><details key={s.resultHash}><summary>建议 {i+1}：调整 {s.taskCount} 个锁定任务（{s.taskIds.join('、')}）</summary><p>试算后原需求未排量：{s.originalUnplannedQuantity??0} 千克。涉及未开工任务 {s.unstartedTaskIds?.length||0} 个{(s.startedTaskIds?.length||0)>0?'；警告：还需调整 '+s.startedTaskIds.length+' 个已开工任务（'+s.startedTaskIds.join('、')+'）':''}。</p>{s.lateOriginalDemands?.length>0&&<p>试算中迟交的原需求：{s.lateOriginalDemands.map((r:any)=>r.demandId+'（'+r.lateDays+'天）').join('、')}，采纳前请核对。</p>}<table><thead><tr><th>任务 / 需求</th><th>原安排</th><th>试算安排</th></tr></thead><tbody>{s.tasks.map((t:any)=><tr key={t.taskId}><td>{t.taskId} / {t.demandId}</td><td>{range({start:t.beforeStart,end:t.beforeEnd,machine:t.machine,quantity:t.beforeQuantity})}</td><td>{t.after.map(range).join('；')}</td></tr>)}</tbody></table></details>)}</div>}
  {value.adviceStatus==='not_found'&&<p>本次有限试算未找到有效的锁定任务调整建议；可扩大排程范围或窗口后重算。这不表示业务必然无解。</p>}
 </section>;
}
