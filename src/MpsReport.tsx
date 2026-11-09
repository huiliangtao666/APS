import {useEffect,useState} from 'react';
import {appPath} from './app-path';
import {sameQueryIdentity} from './QueryReportsTypes';
import {MpsMultiselect,MpsTable} from './MpsReportControls';
import {mpsUrl,readMpsPage,type QueryApi,type QueryContext,type QueryIdentity,type MpsQuery} from './MpsReportTypes';
import {workbookRunLabel} from './lib/workbook-run-status.mjs';
import './MpsReport.css';

import {MpsDrawer,type MpsTarget as Target} from './MpsReportDrawer';
const initial=(c:any):MpsQuery=>({fromDate:c.fromDate,toDateInclusive:c.toDateInclusive,q:'',filters:{},includeBom:false,pageSize:100,offset:0});
const metricTable=(key:string)=>['independent','dependent','demand'].includes(key)?'demands':['opening','expiry'].includes(key)?'inventory':['arrival','purchase'].includes(key)?'incoming':['firm','completion','mps'].includes(key)?'manufacturing':key.startsWith('suggest')?'suggestions':key==='safety'?'parameters':'risks';
export function MpsReport({api,context,canExport,onClose}:{api:QueryApi;context:QueryContext;canExport:boolean;onClose:()=>void}){
 const [runs,setRuns]=useState<any[]>([]),[runsReady,setRunsReady]=useState(false),[choice,setChoice]=useState(context.runId||''),[active,setActive]=useState(context.runId||''),[catalog,setCatalog]=useState<any>(),[error,setError]=useState('');
 const selectedRun=runs.find(r=>r.id===active),ref={datasetId:context.datasetId,version:selectedRun?.version??context.version,...(active?{runId:active}:{})};
 useEffect(()=>{let live=true;setRunsReady(false);api('/workbooks/runs').then(rs=>{if(live){setRuns(rs.filter((r:any)=>r.datasetId===context.datasetId));setRunsReady(true);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[context.datasetId]);
 useEffect(()=>{let live=true;setCatalog(undefined);if(active&&!runsReady)return;setError('');api(mpsUrl('context',ref)).then(c=>{if(c.identity.datasetId!==ref.datasetId||c.identity.version!==ref.version||(c.identity.runId||'')!==(ref.runId||''))throw Error('报表来源版本不一致');if(live)setCatalog(c);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[JSON.stringify(ref),runsReady]);
 return <section className="mps-report" aria-label="生产主计划">
  <header className="mps-heading"><h2>生产主计划</h2><span className="mps-heading-note">需求 · 库存 · 在途 · 制造 · 补货</span><div className="mps-context"><label>数据口径<select aria-label="主计划数据来源" value={choice} onChange={e=>setChoice(e.target.value)}><option value="">输入参考 · v{context.version}</option>{runs.map(r=><option key={r.id} value={r.id} title={r.id}>冻结计划 {r.id.slice(0,8)} · v{r.version} · {workbookRunLabel(r.status)}</option>)}</select></label><button disabled={choice===active} onClick={()=>setActive(choice)}>采用来源</button><button onClick={onClose}>返回工作台</button></div></header>
  {error&&<p role="alert">{error}</p>}{!catalog&&!error&&<p className="mps-loading" role="status">读取选定版本…</p>}{catalog&&<MpsView key={catalog.identity.fingerprint} api={api} catalog={catalog} canExport={canExport}/>}</section>;
}

function MpsView({api,catalog,canExport}:{api:QueryApi;catalog:any;canExport:boolean}){
 const [draft,setDraft]=useState<MpsQuery>(()=>initial(catalog)),[applied,setApplied]=useState<MpsQuery>(()=>initial(catalog)),[page,setPage]=useState<any>(),[matrix,setMatrix]=useState<any>(),[selected,setSelected]=useState(''),[dateOffset,setDateOffset]=useState(0),[target,setTarget]=useState<Target>(),[error,setError]=useState(''),[columns,setColumns]=useState<string[]>(catalog.columns.map((c:any)=>c.key)),[reload,setReload]=useState(0);
 const identity:QueryIdentity=catalog.identity,signature=JSON.stringify(applied),dirty=signature!==JSON.stringify(draft),pref=catalog.preferenceScope;
 const request={...applied,identity};
 async function read(kind:string,q:object){const r=await api(mpsUrl(kind,{...q,identity}));if(!sameQueryIdentity(identity,r.identity))throw Error('报表身份变化，请重新采用来源');return r;}
 useEffect(()=>{let live=true;setPage(undefined);setTarget(undefined);setError('');readMpsPage(api,'query',{...applied,identity}).then(r=>{if(live){setPage(r);setSelected(s=>s||r.records[0]?.id||'');}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[signature,identity.fingerprint,reload]);
 useEffect(()=>{let live=true;setMatrix(undefined);if(!selected||!page)return;read('matrix',{...applied,queryFingerprint:page.queryFingerprint,materialId:selected,dateOffset}).then(r=>{if(live)setMatrix(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[selected,signature,page?.queryFingerprint,dateOffset]);
 function change(patch:Partial<MpsQuery>){setDraft(d=>({...d,...patch,offset:0}));}
 function apply(q=draft){setSelected('');setMatrix(undefined);setDateOffset(0);setDraft({...q,offset:0});setApplied({...q,offset:0});setReload(n=>n+1);}
 function move(offset:number){const q={...applied,offset};setDraft(q);setApplied(q);}
 function download(format:string){if(!page||dirty)return;try{const a=document.createElement('a');a.href=appPath('/api'+mpsUrl('export',{...request,queryFingerprint:page.queryFingerprint,columns,format}));a.download='mps-report.'+(format==='csv'?'csv':'xml');document.body.appendChild(a);a.click();a.remove();}catch(e){setError((e as Error).message);}}
 return <>
  <div className="mps-source-note"><span className="mps-source-badge">{identity.runId?'冻结计划':'输入参考'} · v{identity.version}</span><span>{catalog.meta.dataMeaning}</span><details className="mps-source-info"><summary>数据口径与来源</summary><div><p>按所选版本展示数值；有执行记录时优先取净余或扣除执行量，无执行记录时取来源原数量。未下达建议不计入供给。</p><p>预计期末余额＝期初＋采购可用＋既有制造＋主计划可用－需求－失效。批次按先到期先使用推演；ATP / 预测冲减本期不提供。</p><pre>{JSON.stringify(catalog.meta,null,2)}</pre></div></details></div>
  {catalog.daily&&<details className="mps-source-note"><summary>每日实际收发存 · {catalog.daily.date} · 冻结来源</summary><table><thead><tr><th>物料</th><th>单位</th><th>实际入</th><th>实际出</th><th>实物</th><th>可用</th><th>生效在途</th><th>条件建议</th></tr></thead><tbody>{catalog.daily.balances.map((r:any)=><tr key={r.materialId}>{[r.materialId,r.unit,r.actualIn,r.actualOut,r.physical,r.available,r.transit,r.conditional].map((v:any,i:number)=><td key={i}>{v??'未知'}</td>)}</tr>)}</tbody></table><pre>{JSON.stringify(catalog.daily,null,2)}</pre></details>}
  <form className="mps-filters" onSubmit={e=>{e.preventDefault();apply();}}><div className="mps-filter-line">
   <input className="mps-keyword" aria-label="物料编号或名称" placeholder="搜索物料编号或名称" value={draft.q} maxLength={200} onChange={e=>change({q:e.target.value})}/>
   <div className="mps-dates"><label>开始<input aria-label="开始日期" type="date" value={draft.fromDate} onChange={e=>change({fromDate:e.target.value})}/></label><label>结束<input aria-label="结束日期（含）" type="date" value={draft.toDateInclusive} onChange={e=>change({toDateInclusive:e.target.value})}/></label></div>
   <div className="mps-filter-row">{[['materialId','物料'],['category','类别'],['source','来源'],['risk','风险']].map(([field,label])=><MpsMultiselect key={field} api={api} identity={identity} field={field} label={label} query={draft} value={draft.filters[field]||{mode:'ALL'}} onChange={s=>change({filters:{...draft.filters,[field]:s}})}/>)}</div>
   <label className="mps-bom-toggle" title="按有效BOM显示子件；仅扩大显示范围，不增加需求"><input type="checkbox" checked={draft.includeBom} onChange={e=>change({includeBom:e.target.checked})}/>含 BOM 子件</label>
   <div className="mps-filter-submit"><button className="primary" type="submit">查询</button><button type="button" title="恢复默认日期及全部候选全选" onClick={()=>apply(initial(catalog))}>重置</button>{dirty&&<span className="mps-dirty">条件待应用</span>}</div>
  </div></form>
  {error&&<p role="alert">{error}</p>}{!page&&!error&&<p className="mps-loading" role="status">正在加载报表…</p>}
  {page&&<section className="mps-card" aria-label="物料总览">
   <MpsTable id={pref+':overview'} columns={page.columns} records={page.records} selectedId={selected} onOpen={r=>{setSelected(r.id);setDateOffset(0);}} onVisible={setColumns}
    heading={<><h3>物料总览</h3><span className="mps-count">{page.total} 项</span><span className="mps-toolbar-note">点物料看日期矩阵 · 悬浮字段看释义</span></>}
    actions={<><button disabled={!canExport||dirty} onClick={()=>download('csv')}>导出 CSV</button><button disabled={!canExport||dirty} title="导出完整筛选结果，Excel 2003 XML 格式" onClick={()=>download('excel')}>导出 Excel XML</button></>}/>
   <div className="mps-pagination"><details className="mps-result-note"><summary>结果说明{page.diagnostics.length?' · '+page.diagnostics.length+' 项提示':''}</summary><p>{page.meta.note} 快照实物与查询起点库存分开。</p>{page.diagnostics.map((d:any,i:number)=><p role="status" key={i}>{d.message||d.code||JSON.stringify(d)}</p>)}</details><span>{page.total?page.offset+1:0}—{page.offset+page.records.length} / {page.total} 项</span><label>每页<select aria-label="物料总览每页条数" value={applied.pageSize} onChange={e=>apply({...applied,pageSize:Number(e.target.value)})}>{[100,200,500].map(n=><option key={n}>{n}</option>)}</select></label><button disabled={!applied.offset||dirty} onClick={()=>move(Math.max(0,applied.offset-applied.pageSize))}>上一页</button><button disabled={page.nextOffset===null||dirty} onClick={()=>move(page.nextOffset)}>下一页</button></div>
   {!page.total&&<p className="mps-empty">当前筛选无物料；清空不会回退为全选。</p>}
  </section>}
  {matrix&&<section className="mps-card" aria-label="物料日期矩阵">
   <MpsTable key={selected+':'+dateOffset} variant="matrix" id={pref+':matrix:'+dateOffset} columns={[{key:'id',label:'指标'},{key:'kind',label:'性质'},{key:'unit',label:'单位'},...matrix.dates.map((date:string)=>({key:date,label:date}))]} records={matrix.records} onCell={(r,date)=>setTarget({materialId:selected,table:metricTable(r.id),date,metric:r.id,label:r.values.id})}
    heading={<><h3>日期矩阵</h3><strong className="mps-material-label">{selected}</strong><span>{matrix.unit||'单位未提供'}</span><span className="mps-toolbar-note">悬浮指标看释义 · 点日期格看来源</span></>}
    actions={<><button disabled={!dateOffset} onClick={()=>setDateOffset(Math.max(0,dateOffset-31))}>前31天</button><button disabled={matrix.nextDateOffset===null} onClick={()=>setDateOffset(matrix.nextDateOffset)}>后31天</button></>}/>
   <div className="mps-matrix-footer"><span className="mps-matrix-note">按来源数量逐日推演 · “-”表示不适用或当前来源无对应排程结果</span><nav aria-label="物料来源明细">{Object.entries<string>(catalog.tables).map(([table,label])=><button key={table} onClick={()=>setTarget({materialId:selected,table})}>{label}</button>)}</nav></div>
  </section>}
 {target&&page&&<MpsDrawer key={[target.materialId,target.table,target.metric,target.date].join(':')} api={api} identity={identity} query={{...applied,queryFingerprint:page.queryFingerprint}} target={target} tables={catalog.tables} preference={pref} onClose={()=>setTarget(undefined)}/>}
 </>;
}
