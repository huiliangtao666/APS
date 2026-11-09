import {adoptedUrgentBatchIds} from './lib/urgent-import-revisions.mjs';
import {useState} from 'react';
import {workbookDate} from './lib/workbook-dates';
export function UrgentConfirmedImports({plan,headResult,onOpen}:{plan:any;headResult?:any;onOpen:(r:any)=>void}){
 const [q,setQ]=useState(''),[page,setPage]=useState(0);
 const batches=(plan?.batches||[]).filter((b:any)=>b.status!=='withdrawn');
 const adopted=adoptedUrgentBatchIds(plan,headResult);
 const all=batches.slice().reverse().flatMap((b:any)=>b.demands.map((r:any)=>({...r,_batchId:b.id,_adopted:adopted.has(b.id)||!!b.adoptedRunId,_fileName:b.fileName||'插单需求',_effective:b.effectiveDay})));
 if(!all.length)return null;
 const rows=all.filter((r:any)=>[r['需求编号'],r['客户编号'],r['成品编号'],r._fileName].join(' ').toLocaleLowerCase().includes(q.toLocaleLowerCase())),offset=Math.min(page*100,Math.max(0,Math.ceil(rows.length/100)-1)*100);
 return <section className="urgent-confirmed-imports" aria-label="已确认插单清单"><h4>已确认导入：{batches.length} 批 / {all.length} 笔需求</h4><p>下表为当前插单清单，修改导入后按需求编号更新；尚未采用的插单可反复导入修改，原需求和已采用插单不可覆盖。</p><div className="urgent-toolbar"><label>查找已确认插单<input value={q} placeholder="需求、客户、产品或来源文件" onChange={e=>{setQ(e.target.value);setPage(0);}}/></label><span>{rows.length} 笔</span>{rows.length>100&&<><button type="button" disabled={!offset} onClick={()=>setPage(offset/100-1)}>上一页</button><button type="button" disabled={offset+100>=rows.length} onClick={()=>setPage(offset/100+1)}>下一页</button></>}</div><div className="urgent-scroll"><table aria-label="已确认导入需求明细"><thead><tr>{['需求','客户','产品','需求日期','箱数','数量（千克）','来源文件','状态'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{rows.slice(offset,offset+100).map((r:any)=><tr key={r._batchId+':'+r['需求编号']}><td><button type="button" className="urgent-record-link" onClick={()=>onOpen(r)}>{r['需求编号']}</button></td><td>{r['客户编号']}</td><td>{r['成品编号']}</td><td>{workbookDate(r['需求日'])||'-'}</td><td>{r['需求箱数']}</td><td>{r['需求千克']}</td><td>{r._fileName}</td><td>{r._adopted?'已采用生效':'已确认 · 可重新导入更新'}</td></tr>)}</tbody></table>{!rows.length&&<p>没有匹配的已确认插单。</p>}</div></section>;
}
