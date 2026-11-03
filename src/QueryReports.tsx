import { appPath } from './app-path';
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

  return <section className="qr-workspace qr-business" aria-label="五类业务查询">
    <header className="qr-heading"><div><h2>五类业务查询</h2><p>物料、需求、库存、产能与补料 · 同一数据版本</p></div><button onClick={onClose}>返回排程流程</button></header>
    <div className="qr-context"><b>数据集 v{activeContext.version}</b><label>数据来源<select aria-label="业务查询来源" value={pendingRun} onChange={e=>setPendingRun(e.target.value)}><option value="">已导入数据 v{context.version}</option>{runs.map(r=><option key={r.id} value={r.id}>已保存运行 · v{r.version} · {r.id}</option>)}</select></label><button onClick={()=>setRunId(pendingRun)}>切换来源</button><span>{runId?'查看该次运行冻结的输入与结果':'查看已导入的输入数据与参考计算'}</span></div>
    {error&&<p role="alert">{error}</p>}{!catalog&&!error&&<p role="status">正在核对数据版本…</p>}
    {catalog&&<><nav className="qr-reports" aria-label="五类报表">{queryReports.map(([id,label])=><button key={id} aria-pressed={report===id} onClick={()=>chooseReport(id)}>{label}</button>)}</nav><nav className="qr-views" aria-label="业务查询子视图">{views.map(v=><button key={v.id} aria-pressed={view===v.id} onClick={()=>setView(v.id)}>{v.label}</button>)}</nav><details className="qr-scope-note"><summary>查询口径与来源说明</summary><p>{catalog.note}</p><p>数据集 {activeContext.datasetId} · v{activeContext.version}。{runId?'冻结输入与运行结果一起读取；不使用当前参数补填历史。':'指定版本输入及参考演算；不代表实际计算结果或交付实绩。'}</p></details>
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
    try{const url=queryUrl('export',{...request,queryFingerprint:page.queryFingerprint,columns:visible,scope,...(scope==='SELECTED'?{ids:selected}:{})});const a=document.createElement('a');a.href=appPath('/api'+url);a.download=view.label+'.ndjson';document.body.appendChild(a);a.click();a.remove();}catch(e){setError((e as Error).message);}
  }
  return <div className="qr-body"><form className="qr-filters" onSubmit={e=>{e.preventDefault();apply();}}>
    <div className="qr-filter-line"><label className="qr-keyword"><span className="sr-only">编号、名称或关键词</span><input aria-label="编号、名称或关键词" placeholder="搜索编号、名称或关键词" value={draft.q} maxLength={200} onChange={e=>change({q:e.target.value})}/></label>
      <div className="qr-dates"><label>开始 <input type="date" value={draft.fromDate} onChange={e=>change({fromDate:e.target.value,...(view.report!=='bom'?{bomAsOfDate:e.target.value}:{})})}/></label><label>结束 <input type="date" value={draft.toDateInclusive} onChange={e=>change({toDateInclusive:e.target.value})}/></label>{view.report==='demand'&&<label>单位 <select value={draft.unit||'千克'} onChange={e=>change({unit:e.target.value})}><option>千克</option><option>箱</option></select></label>}{view.report==='bom'&&<label>BOM有效日 <input type="date" value={draft.bomAsOfDate} onChange={e=>change({bomAsOfDate:e.target.value})}/></label>}{view.report==='capacity'&&<label>信息截至 <input type="date" value={draft.knownAsOfDate} onChange={e=>change({knownAsOfDate:e.target.value})}/></label>}</div>
      {view.filters.length>0&&<div className="qr-filter-groups">{view.filters.map(f=><QueryMultiselect key={f.key} api={api} identity={catalog.identity} view={view.id} field={f.key} label={f.label} query={{view:view.id,...draft}} value={draft.filters[f.key]||{mode:'ALL'}} onChange={value=>change({filters:{...draft.filters,[f.key]:value}})}/>)}</div>}
      <div className="qr-actions"><button className="primary" type="submit">查询</button><button type="button" onClick={reset}>重置</button>{dirty&&<span className="qr-dirty">条件待应用</span>}</div>
    </div>
    {view.filters.some(f=>f.kind==='material')&&<label className="qr-bom-toggle"><input type="checkbox" checked={draft.includeBom} onChange={e=>change({includeBom:e.target.checked})}/>根据BOM包含有效下属 <span>（不增加业务记录）</span></label>}
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

/** Render only the relationships and durations returned by this query page. */
export function QueryBomPreview({view,page,identity,onOpen}:{view:string;page:QueryPage;identity:QueryCatalog['identity'];onOpen:(r:QueryRecord)=>void}){
  const [chosenRoot,setChosenRoot]=useState('');
  if(!['bom.relations','bom.paths'].includes(view)||!page.records.length)return null;
  const paths=view==='bom.paths';
  const finite=(v:unknown)=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v));
  const textValue=(v:unknown)=>v===null||v===undefined||v===''?'':String(v);
  const edges=paths?[]:page.records.flatMap(r=>{
    const parent=textValue(r.values['父项编号']),child=textValue(r.values['子项编号']);
    return parent&&child?[{parent,child,record:r}]:[];
  });
  const parents=[...new Set(edges.map(e=>e.parent))],children=new Set(edges.map(e=>e.child));
  const roots=parents.filter(id=>!children.has(id));
  const graphRoots=roots.length?roots:parents;
  const root=graphRoots.includes(chosenRoot)?chosenRoot:graphRoots[0];
  const levels=new Map<string,number>();
  if(root){levels.set(root,0);for(let depth=0;depth<=edges.length;depth++){
    let changed=false;for(const edge of edges){if(levels.get(edge.parent)===depth&&!levels.has(edge.child)){levels.set(edge.child,depth+1);changed=true;}}
    if(!changed)break;
  }}
  const columns=new Map<number,string[]>();for(const [id,depth] of levels){const list=columns.get(depth)||[];list.push(id);columns.set(depth,list);}
  const maxDepth=Math.max(0,...columns.keys()),rowCount=Math.max(1,...[...columns.values()].map(list=>list.length));
  const nodeWidth=174,columnGap=72,rowHeight=76,pad=26;
  const graphWidth=pad*2+(maxDepth+1)*nodeWidth+maxDepth*columnGap;
  const graphHeight=Math.max(210,pad*2+rowCount*rowHeight);
  const position=new Map<string,{x:number;y:number}>();for(const [depth,list] of columns){
    const top=pad+(rowCount-list.length)*rowHeight/2;
    list.forEach((id,index)=>position.set(id,{x:pad+depth*(nodeWidth+columnGap),y:top+index*rowHeight}));
  }
  const outgoing=new Set(edges.filter(e=>levels.has(e.parent)&&levels.has(e.child)).map(e=>e.parent));
  const pathGroups=new Map<string,QueryRecord[]>();if(paths)for(const record of page.records){
    const key=textValue(record.values.root)||'根物料未提供';const group=pathGroups.get(key)||[];group.push(record);pathGroups.set(key,group);
  }
  return <figure className="qr-bom-figure">
    <figcaption><strong>{paths?'累计提前期关键路径时序图（非实际开工）':'有效BOM有向关系图'}</strong><span>当前页 {page.records.length} / 完整匹配 {page.total} 条</span></figcaption>
    {page.total>page.records.length&&<p className="qr-bom-scope">图中只包含当前页记录。切换页码或缩小查询范围，可查看其他关系；此图不代表完整 BOM。</p>}
    {!paths&&<>
      <div className="qr-bom-toolbar"><label>查看根项 <select value={root||''} onChange={e=>setChosenRoot(e.target.value)}>{graphRoots.map(id=><option key={id} value={id}>{id}</option>)}</select></label><span>蓝色：根项　浅蓝：有子件　浅绿：当前页末级　·　点击连线或物料查看来源</span></div>
      <div className="qr-bom-canvas"><svg width={graphWidth} height={graphHeight} role="img" aria-label={`${root} 的当前页有效 BOM 层级图`}>
        {edges.filter(e=>position.has(e.parent)&&position.has(e.child)).map(e=>{const a=position.get(e.parent)!,b=position.get(e.child)!;const x1=a.x+nodeWidth,x2=b.x,y1=a.y+27,y2=b.y+27;return <g key={e.record.id} className="qr-bom-edge" onClick={()=>onOpen(e.record)} role="button" tabIndex={0} aria-label={`${e.parent} 指向 ${e.child}，查看用量关系`} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen(e.record);}}}><path d={`M${x1} ${y1} C${x1+columnGap/2} ${y1},${x2-columnGap/2} ${y2},${x2} ${y2}`} fill="none"/><path className="qr-bom-edge-hit" d={`M${x1} ${y1} C${x1+columnGap/2} ${y1},${x2-columnGap/2} ${y2},${x2} ${y2}`} fill="none"/></g>;})}
        {[...position].map(([id,p])=>{const source=edges.find(e=>e.parent===id||e.child===id)?.record;const kind=id===root?'root':outgoing.has(id)?'parent':'leaf';return <g key={id} className={`qr-bom-node qr-bom-node-${kind}`} role="button" tabIndex={0} aria-label={`${id}，查看关联记录`} onClick={()=>source&&onOpen(source)} onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&source){event.preventDefault();onOpen(source);}}}><rect x={p.x} y={p.y} width={nodeWidth} height="54" rx="8"/><text x={p.x+12} y={p.y+23} className="qr-bom-node-id">{id}</text><text x={p.x+12} y={p.y+43} className="qr-bom-node-meta">{id===root?'根项':outgoing.has(id)?'含子件':'当前页末级'}</text></g>;})}
      </svg></div><p className="qr-bom-scope">物料名称、类别和关键路径未包含在用量关系结果中；可在“物料与BOM”和“提前期路径”查看对应信息。</p>
    </>}
    {paths&&<div className="qr-bom-paths">{[...pathGroups].map(([key,records])=>{
      const sorted=[...records].sort((a,b)=>Number(a.values.cumulativeLeadDays)-Number(b.values.cumulativeLeadDays));
      const totals=sorted.flatMap(r=>finite(r.values.cumulativeLeadDays)?[Number(r.values.cumulativeLeadDays)]:[]);
      const rootTotal=sorted.find(r=>r.values.materialId===key)?.values.rootLeadDays;
      const max=Math.max(1,...totals,...(finite(rootTotal)?[Number(rootTotal)]:[]));
      return <section className="qr-bom-path-group" key={key}><header><strong>{key} · 代表关键路径</strong><span>累计提前期 {finite(rootTotal)?String(rootTotal):max} 天</span></header>
        <div className="qr-bom-timeline"><div className="qr-bom-axis"><span></span><div>{Array.from({length:5},(_,i)=><span key={i} style={{left:`${i*25}%`}}>{Number((max*i/4).toFixed(2))}天</span>)}</div><span></span></div>
          {sorted.map(r=>{const v=r.values,valid=finite(v.cumulativeLeadDays)&&finite(v.ownLeadDays),own=Number(v.ownLeadDays),end=Number(v.cumulativeLeadDays),start=end-own;return <button className="qr-bom-path-row" key={r.id} onClick={()=>onOpen(r)}><span className="qr-bom-path-label"><b>{textValue(v.materialId)||'物料未提供'}</b><small>路径第 {textValue(v.sequence)||'—'} 项</small></span><span className="qr-bom-track" role="img" aria-label={valid?`参考路径开始偏移${start}天，结束偏移${end}天`:'有效路径历时未提供'}>{valid&&<span className="qr-bom-bar" style={{left:`${Math.max(0,start/max*100)}%`,width:`${Math.max(0,own/max*100)}%`}}/>}</span><span className="qr-bom-path-days">{valid?<><b>{own}天</b><small>累计{end}天</small></>:'历时未提供'}</span></button>;})}
        </div><p className="qr-bom-path-order">物料顺序：{sorted.map(r=>textValue(r.values.materialId)||'未提供').join(' → ')}</p>
      </section>;
    })}</div>}
    <small className="qr-bom-foot">数据集 {identity.datasetId} v{identity.version} · 图中仅使用当前查询记录；点击图形查看原始字段和来源。</small>
  </figure>;
}
