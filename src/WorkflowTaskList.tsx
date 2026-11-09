import {useEffect,useState} from 'react';
import {workflowSourceKey,workflowTaskSelection} from './lib/workflow-task-selection.mjs';
import {workbookDate} from './lib/workbook-dates';

type Props={api:(path:string,body?:object)=>Promise<any>;datasetId:string;version:number;parameterRevision:number;scope:string;selection:any;disabled:boolean;confirmed:boolean;onSelection:(ids:string[])=>void;onSource:(source:{key:string;fingerprint:string}|undefined)=>void;onConfirm:(ids:string[],fingerprint:string)=>void;onRefresh:()=>void;onImport:()=>void;onMaintain:()=>void};
const show=(value:any)=>value===undefined||value===null||value===''?'-':String(value);
const number=(value:number|null)=>value===null?'-':value.toLocaleString('zh-CN',{maximumFractionDigits:6});
export function WorkflowTaskList({api,datasetId,version,parameterRevision,scope,selection,disabled,confirmed,onSelection,onSource,onConfirm,onRefresh,onImport,onMaintain}:Props){
 const [data,setData]=useState<any>(),[error,setError]=useState(''),[q,setQ]=useState(''),[page,setPage]=useState(0),[reload,setReload]=useState(0);
 const sourceKey=workflowSourceKey({datasetId,version,parameterRevision,parameterScope:scope,startDay:selection.startDay});
 useEffect(()=>{
  let live=true;setError('');setData(undefined);onSource(undefined);
  const params=new URLSearchParams({version:String(version),parameterRevision:String(parameterRevision),scope,startDay:String(selection.startDay)});
  api('/workbooks/datasets/'+encodeURIComponent(datasetId)+'/scheduling-tasks?'+params).then(result=>{
   if(!live)return;
   if(result.datasetId!==datasetId||result.version!==version||result.parameterRevision!==parameterRevision||result.scope!==scope||result.startDay!==selection.startDay||!result.fingerprint||!Array.isArray(result.rows)||result.rows.length!==result.total)throw Error('需求清单来源已变化或不完整，请刷新后重新确认。');
   setData({...result,key:sourceKey});onSource({key:sourceKey,fingerprint:result.fingerprint});setPage(0);
  }).catch(e=>{if(live){setError(e.message);onSource(undefined);}});
  return()=>{live=false;};
 },[sourceKey,reload]);
 const fresh=data?.key===sourceKey,rows=fresh?data.rows:[],chosen=workflowTaskSelection(rows,selection),ids=new Set(chosen.selectedIds),eligible=new Set(chosen.eligible.map(r=>r['需求编号']));
 const filtered=rows.filter((r:any)=>!q||['需求编号','客户编号','客户名称','成品编号','成品名称','区域名称'].some(f=>String(r[f]||'').toLowerCase().includes(q.toLowerCase())));
 const offset=page*100<filtered.length?page*100:0,visible=filtered.slice(offset,offset+100);
 function toggle(id:string,checked:boolean){const next=new Set(chosen.selectedIds);if(checked)next.add(id);else next.delete(id);onSelection([...next]);}
 return <div className="workflow-task-list">
  <p>来自当前导入数据 v{version} 的需求清单。默认选择本次日期范围内的全部需求；勾选只决定本次排程范围。</p>
  <div className="workflow-task-toolbar"><label>查找需求<input aria-label="本次任务查询" value={q} placeholder="需求、客户或产品" onChange={e=>{setQ(e.target.value);setPage(0);}}/></label>
   <button disabled={disabled} onClick={()=>{setReload(n=>n+1);onRefresh();}}>刷新清单</button><button disabled={disabled} onClick={onImport}>导入数据</button><button disabled={disabled} onClick={onMaintain}>维护需求</button>
   <button disabled={disabled||!fresh} onClick={()=>onSelection(chosen.eligible.map(r=>r['需求编号']))}>全选本次范围</button><button disabled={disabled||!fresh} onClick={()=>onSelection([])}>清空选择</button>
  </div>
  {error?<p role="alert">{error} 请点击“刷新清单”。</p>:!fresh?<p role="status">正在读取当前需求清单…</p>:<>
   <div className="workflow-task-summary"><span>导入需求 <b>{rows.length}</b> 笔</span><span>日期范围内 <b>{chosen.eligible.length}</b> 笔</span><span>本次已选 <b>{chosen.selected.length}</b> 笔</span><span>需求数量 <b>{number(chosen.quantityKg)}</b> 千克 / <b>{number(chosen.boxes)}</b> 箱</span></div>
   <div className="input-scroll"><table aria-label="本次需求任务清单"><thead><tr>{['选择','需求编号','客户','产品','需求日期','箱数','需求数量（千克）','最早到货日期','最晚到货日期','范围'].map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>{visible.map((r:any)=><tr key={r['需求编号']} className={!eligible.has(r['需求编号'])?'workflow-outside':''}>
    <td><input type="checkbox" aria-label={'选择需求 '+r['需求编号']} checked={ids.has(r['需求编号'])} disabled={disabled||!eligible.has(r['需求编号'])} onChange={e=>toggle(r['需求编号'],e.target.checked)}/></td>
    <th scope="row">{r['需求编号']}</th><td>{show(r['客户编号'])}<small>{r['客户名称']}</small></td><td>{show(r['成品编号'])}<small>{r['成品名称']}</small></td><td>{workbookDate(r['需求日'])||'-'}</td><td>{show(r['需求箱数'])}</td><td>{show(r['需求千克'])}</td><td>{workbookDate(r['最早到货日'])||'-'}</td><td>{workbookDate(r['最晚到货日'])||'-'}</td><td>{eligible.has(r['需求编号'])?'本次范围':'范围外'}</td>
   </tr>)}</tbody></table>{!rows.length&&<p>尚无导入需求，请前往“数据导入”页签。</p>}{rows.length>0&&!filtered.length&&<p>没有匹配的需求；查询不会改变已勾选任务。</p>}</div>
   <div className="workflow-task-toolbar"><span>显示 {filtered.length?offset+1:0}–{Math.min(offset+100,filtered.length)} / {filtered.length} 笔</span><button disabled={!offset} onClick={()=>setPage(Math.max(0,page-1))}>上一页需求</button><button disabled={offset+100>=filtered.length} onClick={()=>setPage(page+1)}>下一页需求</button></div>
   {chosen.problems.map(p=><p key={p} role="status">{p}</p>)}
   <button className="primary" disabled={disabled||chosen.problems.length>0||confirmed} onClick={()=>onConfirm(chosen.selectedIds,data.fingerprint)}>{confirmed?'已确认本次任务清单':'确认本次任务清单'}</button>
   <span className="workflow-confirm-state" role="status">{confirmed?'已确认；可进入第二步执行排程。':'请核对需求后确认；调整日期、选择或数据后需重新确认。'}</span>
  </>}
 </div>;
}
