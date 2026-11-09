import type {ReactNode,RefObject} from 'react';
import {urgentFactTime,urgentFactMinute} from './lib/urgent-run-eligibility.mjs';
const number=(v:number)=>Number.isFinite(v)?String(Number(v.toFixed(6))):'-';

export function UrgentConsumedMaterials({rows,run,detailsRef,ready}:{rows:any[];run:any;detailsRef:RefObject<HTMLDetailsElement>;ready:boolean}){
 return <details ref={detailsRef}><summary>实际已消耗物料</summary>
  <p>按关联任务的任务量和完成比例折算原计划投料量，确认当前任务后用于排程。按“个”计量的物料向上取整；已保存的实际耗用及锁定记录予以保留，锁定量不计入已消耗量。</p>
  {!ready?<p role="status">正在读取所选计划的物料单位和投料关联…</p>:<div className="urgent-scroll"><table aria-label="实际已消耗物料清单"><thead><tr>{['需求 / 任务','物料','来源批次','计划分配量','完成比例','比例计算耗量','实际已耗量','保留锁定量','单位','记录日期'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.index} tabIndex={-1} data-fact-allocation={String(r.index)}><td>{r.demandId}<br/>{r.taskIds.join('、')||'原有交付记录'}</td><td>{r.materialId}<br/>{r.name}</td><td>{r.supplyId}</td><td>{number(r.planned)}</td><td>{number(r.percent)}%</td><td>{number(r.calculated)}</td><td>{number(r.quantity)}</td><td>{number(r.locked)}</td><td>{r.unit}</td><td>{r.quantity>0||r.locked>0?urgentFactTime(r.date,run)||'-':'-'}</td></tr>)}</tbody></table>{!rows.length&&<p>当前计划没有关联耗料记录。</p>}</div>}
 </details>;
}

export function UrgentCompletedMaterials({rows,tasks,detailsRef,children,ready}:{rows:any[];tasks:any[];detailsRef:RefObject<HTMLDetailsElement>;children:ReactNode;ready:boolean}){
 return <details ref={detailsRef}><summary>实际已完成物料</summary>
  <p>按生产批次汇总末工序的完成量；前道工序不重复累计为成品。生产完成量不等于客户已交付量，原交付记录单独保留。</p>
  {!ready?<p role="status">正在读取所选计划的末工序…</p>:<div className="urgent-scroll"><table aria-label="实际已完成物料清单"><thead><tr>{['需求','生产批次','物料','末工序任务','计划产出量','完成比例','实际已完成量','单位'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.productionId}><td>{r.demandId}</td><td>{r.productionId}</td><td>{r.materialId}<br/>{r.name}</td><td>{r.taskIds.join('、')}</td><td>{number(r.quantity)}</td><td>{number(r.percent)}%</td><td>{number(r.done)}</td><td>{r.unit}</td></tr>)}</tbody></table>{!rows.length&&<p>当前计划没有末工序产出记录。</p>}</div>}
  <details><summary>逐任务工序完成明细</summary><div className="urgent-scroll"><table aria-label="逐任务工序完成明细"><thead><tr><th>任务</th><th>需求 / 物料</th><th>工序</th><th>任务量（千克）</th><th>完成比例</th><th>工序完成量（千克）</th></tr></thead><tbody>{tasks.map(t=><tr key={t.id}><td>{t.id}</td><td>{t.demandId} / {t.materialId}</td><td>{t.operation}</td><td>{number(t.quantity)}</td><td>{t.percent}%</td><td>{t.done===null?'-':number(t.done)}</td></tr>)}</tbody></table></div></details>
  <details><summary>客户已交付记录（单独维护）</summary>{children}</details>
 </details>;
}

export function UrgentDeliveryFacts({run,values,disabled,onChange}:{run:any;values:Record<number,any>;disabled:boolean;onChange:(index:number,value:any)=>void}){
 const rows=run.result.allocations.map((a:any,index:number)=>({...a,index})).filter((a:any)=>run.result.demandResults.some((r:any)=>a.consumer===r.id&&a.need===r.id&&a.materialId===r.productId));
 return <details><summary>交付批次实际量（与客户已交付量对应）</summary><p>交付数量与对应成品批次的实际量须一致；工序完成比例不会自动修改这些记录。</p><div className="urgent-scroll"><table aria-label="客户交付批次事实"><thead><tr><th>需求 / 成品</th><th>来源批次</th><th>计划分配量</th><th>事实类型</th><th>实际量（千克）</th><th>记录日期</th></tr></thead><tbody>{rows.map((a:any)=>{const f=values[a.index]||{};return <tr key={a.index}><td>{a.need} / {a.materialId}</td><td>{a.supplyId}</td><td>{a.quantity}</td><td><select disabled={disabled} value={f.kind||'none'} aria-label={'交付事实类型 '+a.index} onChange={e=>onChange(a.index,{...f,kind:e.target.value})}><option value="none">未发生</option><option value="consumed">实际已交付</option><option value="locked">已锁定不可挪用</option></select></td><td><input disabled={disabled} type="number" min={0} max={a.quantity} step="any" aria-label={'交付批次实际量 '+a.index} value={f.quantity??''} onChange={e=>onChange(a.index,{...f,quantity:e.target.value})}/></td><td><input disabled={disabled} type="date" aria-label={'交付记录日期 '+a.index} value={urgentFactTime(f.feedMinute??a.feedDay,run)} onChange={e=>onChange(a.index,{...f,feedMinute:urgentFactMinute(e.target.value,run)})}/></td></tr>;})}</tbody></table>{!rows.length&&<p>当前计划没有成品交付分配记录。</p>}</div></details>;
}
