import {useState} from 'react';
import {urgentFactTime} from './lib/urgent-run-eligibility.mjs';
import {workbookDate} from './lib/workbook-dates';
const statuses:Record<string,string>={not_started:'未开工（可调）',started:'已开工（可调）'};
export function UrgentQueue({rows,base,protectedCount}:{rows:any[];base:any;protectedCount:number}){
 const [q,setQ]=useState(''),[page,setPage]=useState(0),[size,setSize]=useState(100);
 const filtered=rows.filter(r=>[r.taskId,r.demandId,r.productId,r.label,r.machine,r.type].join(' ').toLocaleLowerCase().includes(q.toLocaleLowerCase()));
 const offset=Math.min(page*size,Math.max(0,Math.ceil(filtered.length/size)-1)*size);
 return <><p>插单排在前面，随后显示原计划可重排任务；已完成、已锁定的 {protectedCount} 个任务原位保留。</p><div className="urgent-toolbar"><label>查找任务<input value={q} placeholder="需求、任务、工序或设备" onChange={e=>{setQ(e.target.value);setPage(0);}}/></label><span>共 {filtered.length} 条</span><label>每页<select value={size} onChange={e=>{setSize(Number(e.target.value));setPage(0);}}>{[100,200,500].map(n=><option key={n}>{n}</option>)}</select></label><button disabled={!offset} onClick={()=>setPage(Math.max(0,offset/size-1))}>上一页</button><button disabled={offset+size>=filtered.length} onClick={()=>setPage(offset/size+1)}>下一页</button></div><div className="urgent-scroll urgent-queue-scroll"><table aria-label="插单与再排任务清单"><thead><tr>{['类型','需求','任务','产品 / 工序','设备','待排数量（千克）','状态','需求日 / 原计划开始'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filtered.slice(offset,offset+size).map(r=><tr key={r.id} className={r.type.startsWith('插单')?'urgent-insert-row':''}><td>{r.type}</td><td>{r.demandId}</td><td>{r.taskId}</td><td>{r.productId} / {r.label}</td><td>{r.machine}</td><td>{r.quantity}</td><td>{statuses[r.status]}</td><td>{(r.type==='插单'?workbookDate(r.date,base?.result?.dayZero):urgentFactTime(Number(r.date),base))||'-'}</td></tr>)}</tbody></table>{!rows.length&&<p>确认当前任务并导入插单后，这里会显示本次任务清单。</p>}</div></>;
}
