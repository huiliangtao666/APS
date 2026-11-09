const names:Record<string,string>={not_started:'未开工（可调）',started:'已开工（可调）',completed:'已完成（不可调）',locked:'已锁定（不可调）'};
export function UrgentStatusEditSummary({savedTasks,statuses,footprints,note,onNote}:{savedTasks:any[];statuses:Record<string,string>;footprints:Record<string,any>;note:string;onNote:(note:string)=>void}){
 const changes=savedTasks.filter(task=>names[statuses[task.id]]&&statuses[task.id]!==task.status);
 if(!changes.length)return null;
 const quantity=(task:any)=>{const status=statuses[task.id],value=footprints[task.id];return status==='completed'?value?.quantity??task.quantity:status==='started'?(value?.executedQuantity===''||value?.executedQuantity===undefined?'请填写':value.executedQuantity):0;};
 return <section className="urgent-status-edit-summary" aria-label="本次任务状态更正"><p>本次将更正 {changes.length} 个任务状态，保存后按新状态重新排程；原状态和工序完成量会留档，已交付量、耗料记录保持原值。</p><label>状态更正备注（选填）<input placeholder="可填写误选、更正现场状态等说明" value={note} onChange={e=>onNote(e.target.value)}/></label>
  <details><summary>查看状态更正明细（{changes.length}）</summary><div className="urgent-scroll"><table><thead><tr><th>任务</th><th>原状态</th><th>更正状态</th><th>原工序完成量（千克）</th><th>更正工序完成量（千克）</th></tr></thead><tbody>{changes.map(task=><tr key={task.id}><td>{task.id}</td><td>{names[task.status]||task.status}</td><td>{names[statuses[task.id]]}</td><td>{task.executedQuantity??(task.status==='completed'?task.quantity:0)}</td><td>{quantity(task)}</td></tr>)}</tbody></table></div></details>
 </section>;
}
