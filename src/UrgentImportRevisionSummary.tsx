import {useState} from 'react';
import {workbookDate} from './lib/workbook-dates';
import type {UrgentImportChanges} from './lib/urgent-import-revisions.mjs';

const label=(field:string)=>field==='插单生效时间'?'插单生效时间':field==='需求千克'?'需求量（千克）':field;
const display=(field:string,value:any)=>value===undefined||value===null||value===''?'-':['需求日','最早到货日','最晚到货日','按要求日最晚发运日'].includes(field)?workbookDate(value)||String(value):String(value);
export function UrgentImportRevisionSummary({changes}:{changes?:UrgentImportChanges}){
 const [page,setPage]=useState(0);
 if(!changes)return null;
 const rows=changes.records.filter(r=>r.action==='update').flatMap(r=>r.changedFields.map(field=>({id:r.id,field,before:r.before?.[field],after:r.after[field]}))),offset=Math.min(page*100,Math.max(0,Math.ceil(rows.length/100)-1)*100);
 return <section className="urgent-import-revision" aria-label="本次导入变更">
  <p>本次导入：新增 {changes.added} 笔，更新 {changes.updated} 笔，未变化 {changes.unchanged} 笔{changes.blocked>0?'，不可覆盖 '+changes.blocked+' 笔':''}。确认导入后更新插单清单和待排任务；排程结果及影响需重新计算。</p>
  <p className="urgent-step-hint">按需求编号更新尚未采用的插单；文件未包含的插单继续保留。</p>
  {rows.length>0&&<details><summary>查看更新前后差异（{rows.length} 项）</summary><div className="urgent-scroll"><table><thead><tr><th>需求</th><th>信息项</th><th>更新前</th><th>更新后</th></tr></thead><tbody>{rows.slice(offset,offset+100).map(r=><tr key={r.id+':'+r.field}><td>{r.id}</td><td>{label(r.field)}</td><td>{display(r.field,r.before)}</td><td>{display(r.field,r.after)}</td></tr>)}</tbody></table></div>{rows.length>100&&<div className="urgent-toolbar"><button type="button" disabled={!offset} onClick={()=>setPage(offset/100-1)}>上一页</button><span>{offset+1}—{Math.min(offset+100,rows.length)} / {rows.length} 项</span><button type="button" disabled={offset+100>=rows.length} onClick={()=>setPage(offset/100+1)}>下一页</button></div>}</details>}
 </section>;
}
