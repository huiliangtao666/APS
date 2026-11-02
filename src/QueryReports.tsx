import {useEffect,useRef,useState} from 'react';
import {QueryLongValue,QueryMultiselect,QuerySourceDrawer,QueryTable} from './QueryReportsControls';
import {queryInitial,queryReports,queryUrl,sameQueryIdentity,type QueryApi,type QueryCatalog,type QueryContext,type QueryDraft,type QueryPage,type QueryRecord,type QueryView} from './QueryReportsTypes';
import './QueryReports.css';

type Memory={draft:QueryDraft;applied:QueryDraft};
export function QueryReports({api,context,canExport,onClose,onMaintenance}:{api:QueryApi;context:QueryContext;canExport:boolean;onClose:()=>void;onMaintenance?:(target:{table:string;key:string})=>void}) {
  const [catalog,setCatalog]=useState<QueryCatalog>(),[error,setError]=useState(''),[report,setReport]=useState('bom'),[view,setView]=useState(''),[runId,setRunId]=useState(context.runId||''),[runs,setRuns]=useState<any[]>([]),[pendingRun,setPendingRun]=useState(context.runId||''),[navRev,setNavRev]=useState(0);
  const memory=useRef(new Map<string,Memory>());
  const activeContext={...context,version:runId?(runs.find(r=>r.id===runId)?.version??context.version):context.version,runId:runId||undefined};
  const key=JSON.stringify(activeContext);
  useEffect(()=>{let live=true;setCatalog(undefined);setError('');
    api(queryUrl('context',activeContext)).then(c=>{if(!live)return;if(c.identity.datasetId!==activeContext.datasetId||c.identity.version!==activeContext.version||(c.identity.runId||undefined)!==activeContext.runId)throw Error('查询上下文不一致，请返回工作台重选版本');setCatalog(c);setView(v=>c.views.some((x:QueryView)=>x.id===v)?v:c.views[0]?.id||'');}).catch(e=>{if(live)setError(e.message);});
    return()=>{live=false;};
  },[key]);
  useEffect(()=>{let live=true;api('/workbooks/runs').then(list=>{if(live)setRuns(list.filter((r:any)=>r.datasetId===context.datasetId));}).catch(e=>{if(live)setError('运行列表读取失败：'+e.message);});return()=>{live=false;};},[context.datasetId,context.version]);
  const current=catalog?.views.find(v=>v.id===view),views=catalog?.views.filter(v=>v.report===report)||[];
  function chooseReport(id:string){setReport(id);setView(catalog?.views.find(v=>v.report===id)?.id||'');}
  async function navigate(next:string,q:string,inherit:QueryDraft){
    const v=catalog?.views.find(v=>v.id===next);if(!v||!catalog)return;
    const draft={...inherit,filters:Object.fromEntries(Object.entries(inherit.filters).filter(([key])=>key.startsWith('material:'))),q,offset:0};
    try{
      for(const [field,selection]of Object.entries(inherit.filters).filter(([key])=>!key.startsWith('material:')&&v.filters.some(f=>f.key===key))){
        const options=await api(queryUrl('options',{identity:catalog.identity,view:v.id,field,query:{view:v.id,...draft}}));
        if(!sameQueryIdentity(catalog.identity,options.identity))throw Error('跨页来源身份变化');
        draft.filters[field]={...selection,fingerprint:options.selection.fingerprint};
      }
      const k=catalog.identity.fingerprint+':'+v.id;memory.current.set(k,{draft,applied:draft});setReport(v.report);setView(v.id);setNavRev(n=>n+1);
    }catch(e){setError((e as Error).message);}
  }

  return <section className="qr-workspace" aria-label="五类业务查询">
    <header className="qr-heading"><div><h2>业务查询</h2><p>同一版本的物料、需求、库存、产能与补料</p></div><button onClick={onClose}>返回排程工作台</button></header>
    <div className="qr-context"><b>{activeContext.datasetId} · v{activeContext.version}</b><label>查询来源<select aria-label="业务查询来源" value={pendingRun} onChange={e=>setPendingRun(e.target.value)}><option value="">指定版本输入快照 v{context.version}</option>{runs.map(r=><option key={r.id} value={r.id}>冻结运行 {r.id} · v{r.version} · {r.status}</option>)}</select></label><button onClick={()=>setRunId(pendingRun)}>采用查询来源</button><p>{runId?'冻结输入与运行结果一起读取；不使用当前参数补填历史。':'指定版本输入及参考演算；不代表实际计算结果或交付实绩。'}</p></div>
    {error&&<p role="alert">{error}</p>}{!catalog&&!error&&<p role="status">正在核对数据版本…</p>}
    {catalog&&<><nav className="qr-reports" aria-label="五类报表">{queryReports.map(([id,label])=><button key={id} aria-pressed={report===id} onClick={()=>chooseReport(id)}>{label}</button>)}</nav><nav className="qr-views" aria-label="业务查询子视图">{views.map(v=><button key={v.id} aria-pressed={view===v.id} onClick={()=>setView(v.id)}>{v.label}</button>)}</nav><p className="qr-note">{catalog.note}</p>
      {current&&<QueryReportView key={catalog.identity.fingerprint+':'+current.id+':'+navRev} api={api} catalog={catalog} view={current} memory={memory.current} canExport={canExport} onNavigate={navigate} onMaintenance={!catalog.identity.runId?onMaintenance:undefined}/>}
    </>}
  </section>;
}

function QueryReportView({api,catalog,view,memory,canExport,onNavigate,onMaintenance}:{api:QueryApi;catalog:QueryCatalog;view:QueryView;memory:Map<string,Memory>;canExport:boolean;onNavigate:(v:string,q:string,inherit:QueryDraft)=>void;onMaintenance?:(target:{table:string;key:string})=>void}) {
  const memoryKey=catalog.identity.fingerprint+':'+view.id,saved=memory.get(memoryKey),initial=saved?.draft||queryInitial(catalog);
  const [draft,setDraft]=useState<QueryDraft>(initial),[applied,setApplied]=useState<QueryDraft>(saved?.applied||initial),[page,setPage]=useState<QueryPage>(),[error,setError]=useState(''),[selected,setSelected]=useState<string[]>([]),[record,setRecord]=useState<QueryRecord>(),[visible,setVisible]=useState<string[]>(view.columns.map(c=>c.key)),[long,setLong]=useState<{id:string;field:string}>();
  const [refresh,setRefresh]=useState(0);
  const signature=JSON.stringify(applied),dirty=JSON.stringify(draft)!==signature;
  const request={identity:catalog.identity,view:view.id,...applied};
  useEffect(()=>{memory.set(memoryKey,{draft,applied});},[draft,applied,memoryKey]);
  useEffect(()=>{let live=true;setPage(undefined);setRecord(undefined);setSelected([]);setError('');
    readQueryPage(api,request).then(r=>{if(!live)return;if(!sameQueryIdentity(catalog.identity,r.identity)||r.view!==view.id)throw Error('结果版本不符，请返回并重新选择来源');setPage(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};
  },[signature,catalog.identity.fingerprint,view.id,refresh]);
  function change(p:Partial<QueryDraft>){setDraft(v=>({...v,...p,...(['fromDate','toDateInclusive','bomAsOfDate','knownAsOfDate','includeBom','unit'].some(k=>k in p)?{filters:Object.fromEntries(Object.entries(v.filters).filter(([k])=>k.startsWith('material:')))}:{}),offset:0}));}
  function apply(){setApplied({...draft,offset:0});setDraft(v=>({...v,offset:0}));setRefresh(v=>v+1);}
  function reset(){const next=queryInitial(catalog);setDraft(next);setApplied(next);setRefresh(v=>v+1);}
  function move(offset:number){const next={...applied,offset};setApplied(next);setDraft(next);}
  function download(scope:'ALL'|'SELECTED') {
    if(!page||dirty)return;
    try{const url=queryUrl('export',{...request,queryFingerprint:page.queryFingerprint,columns:visible,scope,...(scope==='SELECTED'?{ids:selected}:{})});const a=document.createElement('a');a.href='/api'+url;a.download=view.label+'.ndjson';document.body.appendChild(a);a.click();a.remove();}catch(e){setError((e as Error).message);}
  }
  return <div className="qr-body"><form className="qr-filters" onSubmit={e=>{e.preventDefault();apply();}}>
    <label>编号 / 名称 / 关键词<input value={draft.q} maxLength={200} onChange={e=>change({q:e.target.value})}/></label>
    <div className="qr-dates"><label>开始日期<input type="date" value={draft.fromDate} onChange={e=>change({fromDate:e.target.value,...(view.report!=='bom'?{bomAsOfDate:e.target.value}:{})})}/></label><label>结束日期（含）<input type="date" value={draft.toDateInclusive} onChange={e=>change({toDateInclusive:e.target.value})}/></label>{view.report==='demand'&&<label>需求单位<select value={draft.unit||'千克'} onChange={e=>change({unit:e.target.value})}><option>千克</option><option>箱</option></select></label>}{view.report==='bom'&&<label>BOM有效日期<input type="date" value={draft.bomAsOfDate} onChange={e=>change({bomAsOfDate:e.target.value})}/></label>}{view.report==='capacity'&&<label>信息截至日期<input type="date" value={draft.knownAsOfDate} onChange={e=>change({knownAsOfDate:e.target.value})}/></label>}</div>
    {view.filters.some(f=>f.kind==='material')&&<label><input type="checkbox" checked={draft.includeBom} onChange={e=>change({includeBom:e.target.checked})}/>根据BOM显示（有效下属，不增加业务记录）</label>}
    <div className="qr-filter-groups">{view.filters.map(f=><QueryMultiselect key={f.key} api={api} identity={catalog.identity} view={view.id} field={f.key} label={f.label} query={{view:view.id,...draft}} value={draft.filters[f.key]||{mode:'ALL'}} onChange={value=>change({filters:{...draft.filters,[f.key]:value}})}/>)}</div>
    <div className="qr-actions"><button className="primary" type="submit">查询</button><button type="button" onClick={reset}>重置（完整全选）</button><span>{dirty?'条件尚未应用':'已应用当前条件'}</span></div>
  </form><p className="qr-note">{view.note}</p>{error&&<p role="alert">{error}</p>}{!page&&!error&&<p role="status">正在读取完整结果的当前页…</p>}
    {page&&<><div className="qr-result-bar"><b>共 {page.total} 条 · {page.total?`${page.offset+1}–${page.offset+page.records.length}`:'无匹配'}</b><label>每页<select value={applied.pageSize} onChange={e=>{const next={...draft,pageSize:Number(e.target.value),offset:0};setDraft(next);setApplied(next);}}>{[100,200,500].map(n=><option key={n} value={n}>{n}</option>)}</select></label><button disabled={!canExport||dirty} onClick={()=>download('ALL')}>导出完整匹配结果</button><button disabled={!canExport||dirty||!selected.length} onClick={()=>download('SELECTED')}>导出所选 {selected.length} 条</button></div>
      <p>{page.note}</p>{page.diagnostics?.map(d=><p role="status" key={d.code}>{d.code} · {d.message}</p>)}{page.notProvided?.map(n=><p className="qr-note" key={n}>未提供：{n}</p>)}
      {page.summaryByUnit&&<details><summary>完整结果汇总（分单位）</summary><pre>{JSON.stringify(page.summaryByUnit,null,2)}</pre></details>}
      {view.report==='bom'&&<QueryBomPreview view={view.id} page={page} identity={catalog.identity} onOpen={setRecord}/>}
      <QueryTable identity={catalog.identity} id={catalog.preferenceScope+':'+view.id+':main'} columns={page.columns} records={page.records} selected={selected} onSelected={setSelected} onOpen={setRecord} onLong={(id,field)=>setLong({id,field})} sort={applied.sort} direction={applied.direction} onVisible={setVisible} onSort={sort=>{const next={...draft,sort,direction:applied.sort===sort&&applied.direction==='asc'?'desc' as const:'asc' as const,offset:0};setDraft(next);setApplied(next);}}/>
      {!page.total&&<p>当前条件没有业务记录；没有补造数量或来源。</p>}
      <div className="qr-actions"><button disabled={!applied.offset||dirty} onClick={()=>move(Math.max(0,applied.offset-applied.pageSize))}>上一页</button><button disabled={page.nextOffset===null||dirty} onClick={()=>move(page.nextOffset!)}>下一页</button></div>
      {long&&<QueryLongValue api={api} identity={catalog.identity} query={request} fingerprint={page.queryFingerprint} id={long.id} field={long.field} onClose={()=>setLong(undefined)}/>}
      {record&&<QuerySourceDrawer preferenceScope={catalog.preferenceScope} api={api} identity={catalog.identity} query={request} pageFingerprint={page.queryFingerprint} view={view.id} record={record} onClose={()=>setRecord(undefined)} onNavigate={(v,q)=>onNavigate(v,q,applied)} onMaintenance={onMaintenance}/>}
    </>}
  </div>;
}

/** Assemble one logical 100/200/500 page from same-identity bounded chunks. */
export async function readQueryPage(api:QueryApi,request:any):Promise<QueryPage>{
  let first:any,records:QueryRecord[]=[],offset=request.offset;
  do{
    const r=await api(queryUrl('query',{...request,chunkOffset:offset,...(first?{queryFingerprint:first.queryFingerprint}:{})}));
    if(!sameQueryIdentity(request.identity,r.identity)||first&&r.queryFingerprint!==first.queryFingerprint)throw Error('分块查询身份变化，请重新查询');
    first=first||r;const take=r.records.slice(0,request.pageSize-records.length);records.push(...take);
    if(r.nextOffset===null||records.length>=request.pageSize)break;
    if(!take.length||r.nextOffset<=offset)throw Error('分块查询未前进');offset=r.nextOffset;
  }while(records.length<request.pageSize);
  return {...first,records,offset:request.offset,nextOffset:request.offset+records.length<first.total?request.offset+records.length:null};
}

/** Presentation of real queried edges/lead values; no alternative BOM traversal. */
export function QueryBomPreview({view,page,identity,onOpen}:{view:string;page:QueryPage;identity:QueryCatalog['identity'];onOpen:(r:QueryRecord)=>void}){
  if(!['bom.relations','bom.paths'].includes(view)||!page.records.length)return null;
  const paths=view==='bom.paths';
  const finite=(v:unknown)=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v));
  const leads=page.records.flatMap(r=>finite(r.values.cumulativeLeadDays)?[Number(r.values.cumulativeLeadDays)]:[]);
  const max=Math.max(1,...leads);
  return <figure className="qr-bom-figure"><figcaption>{paths?'代表关键路径 · 提前期时序示意（非实际开工）':'有效BOM有向关系图'} · 当前页 {page.records.length} / 完整匹配 {page.total} 条；翻页沿同一查询身份。</figcaption>
    <div className="qr-scroll">{page.records.map(r=>{const v=r.values;
      if(!paths)return <div key={r.id}><button onClick={()=>onOpen(r)}>{String(v['父项编号']??'父项未提供')}</button><svg width="150" height="32" role="img" aria-label="有效父项指向子项"><path d="M4 16 H138 L128 10 M138 16 L128 22" stroke="currentColor" fill="none"/><text x="8" y="10" fontSize="10">{String(v['用量关系编号']||r.id)}</text></svg><button onClick={()=>onOpen(r)}>{String(v['子项编号']??'子项未提供')}</button></div>;
      const total=v.cumulativeLeadDays,own=v.ownLeadDays,valid=finite(total)&&finite(own),start=Number(total)-Number(own),end=Number(total);
      return <div key={r.id}><button onClick={()=>onOpen(r)}>{String(v.root)} · {String(v.sequence)} · {String(v.materialId)}</button>{valid?<svg width="500" height="38" role="img" aria-label={'参考路径开始偏移'+start+'天，结束偏移'+end+'天'}><line x1="10" y1="24" x2="490" y2="24" stroke="#94a3b8"/><rect x={10+start/max*480} y="12" width={Math.max(1,Number(own)/max*480)} height="12" fill="#2563eb"/><text x="10" y="36" fontSize="10">{String(own)}天；累计{String(total)}天</text></svg>:<span>有效路径历时未提供</span>}<span>{String(v.illustrativeStartDate||'日期未提供')} → {String(v.illustrativeEndDate||'日期未提供')}</span></div>;
    })}</div><small>数据集 {identity.datasetId} v{identity.version}；图形只展示当前已查询原值，完整来源与精确时长见对应记录。</small>
  </figure>;
}
