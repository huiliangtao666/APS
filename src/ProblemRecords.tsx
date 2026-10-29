import {useState,useRef,useEffect} from 'react';
import {defs} from './data-defs';
import {recordIdentity} from './lib/record-identity.mjs';
import {currentRecord,type RecordRef} from './lib/problem-records.mjs';
type Row=Record<string,string>;
export function ProblemRecords({finding,data,canWrite,onQuery,onEdit,onClose}:{finding:{code:string;message:string;relatedRecords?:RecordRef[];associationGap?:string};data:Record<string,Row[]>;canWrite:boolean;onQuery:(ref:RecordRef)=>void;onEdit:(ref:RecordRef,index:number)=>void;onClose:()=>void}){
 const [selected,setSelected]=useState(0);const panel=useRef<HTMLElement>(null);
 useEffect(()=>{panel.current?.focus();panel.current?.scrollIntoView({block:'start'});},[]);
 const refs=finding.relatedRecords||[],ref=refs[selected],current=ref?currentRecord(ref,data):null;
 return <section ref={panel} tabIndex={-1} style={{scrollMarginTop:90}} className="panel" aria-label="问题关联记录"><h2>问题关联记录</h2><p>{finding.code}：{finding.message}</p><p>关联记录来自该次检查输入，顺序为检查来源顺序；首条已高亮。修正后请重新检查。</p><button onClick={onClose}>关闭关联记录</button>
 {!refs.length?<p role="status">没有可定位的关联记录。{finding.associationGap||'该问题未包含逐条记录关联；请提供表名及稳定记录身份后重新检查。'}</p>:<><div className="table-wrap"><table><thead><tr><th>选择</th><th>类别</th><th>记录标识</th></tr></thead><tbody>{refs.map((r,i)=><tr key={i} className={selected===i?'selected-row':''} aria-selected={selected===i}><td><button onClick={()=>setSelected(i)} aria-label={`选择关联记录 ${i+1}`}>选择 {i+1}</button></td><td>{defs.find(d=>d.key===r.table)?.label||r.table}</td><td>{recordIdentity(r.table,r.row)}</td></tr>)}</tbody></table></div>
 <section aria-label="关联记录详情"><h3>第 {selected+1} 条关联记录</h3><dl className="query-detail">{Object.entries(ref.row).map(([field,value])=><div key={field}><dt>{field}</dt><dd>{value?.trim()?value:'待补充'}</dd></div>)}</dl><button onClick={()=>onQuery(ref)}>查询关联记录</button><button disabled={!canWrite||!current} onClick={()=>{if(current)onEdit(ref,current.index);}}>编辑当前关联记录</button>{!current&&<p role="status">当前数据中没有唯一稳定身份匹配（可能缺少编号、重复、已删除或已改号）；保留检查原值，不能直接编辑。</p>}{current&&JSON.stringify(current.row)!==JSON.stringify(ref.row)&&<p role="status">当前记录已变化；上方保留检查原值，编辑使用当前输入，请修正后重新检查。</p>}{!canWrite&&<p>当前角色仅可查询关联记录。</p>}</section></>}
 </section>;
}
