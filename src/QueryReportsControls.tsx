import {useEffect,useRef,useState,type ReactNode} from 'react';
import {DropdownDetails} from './DropdownDetails';
import {queryUrl,sameQueryIdentity,queryValue,type QueryApi,type QueryColumn,type QueryIdentity,type QueryOptions,type QueryRecord,type QuerySelection} from './QueryReportsTypes';

export function QueryColumns({columns,value,onChange,popover=false}:{columns:QueryColumn[];value:string[];onChange:(v:string[])=>void;popover?:boolean}) {
  const [position,setPosition]=useState({left:8,top:8}),[open,setOpen]=useState(false),picker=useRef<HTMLDetailsElement>();
  useEffect(()=>{if(!popover||!open)return;const close=(event:Event)=>{if(event.type==='scroll'&&event.target instanceof Node&&picker.current?.contains(event.target))return;if(picker.current)picker.current.open=false;};window.addEventListener('resize',close);window.addEventListener('scroll',close,true);return()=>{window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);};},[popover,open]);
  return <DropdownDetails className={'qr-columns'+(popover?' chart-columns-picker':'')} onToggle={e=>{if(!popover)return;const el=e.currentTarget;picker.current=el;setOpen(el.open);if(el.open){const r=el.querySelector('summary')!.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(r.left,window.innerWidth-336)),top:Math.max(8,Math.min(r.bottom+3,window.innerHeight-260))});}}}><summary>显示栏位（{value.length}/{columns.length}）</summary><div className="qr-columns-panel" style={popover?position:undefined}><p>{columns.some(c=>c.fixed)?'编号列固定；':''}勾选后立即显示，选择会自动记住。</p>{columns.map(c=><label key={c.key}><input type="checkbox" checked={c.fixed||value.includes(c.key)} disabled={c.fixed} onChange={e=>onChange(e.target.checked?[...value,c.key]:value.filter(k=>k!==c.key))}/>{c.label}{c.fixed?'（'+(c.fixedLabel||(popover?'编号固定':'业务键固定'))+'）':''}</label>)}</div></DropdownDetails>;
}

export function QueryMultiselect({api,identity,view,field,label,value,onChange,query}:{api:QueryApi;identity:QueryIdentity;view:string;field:string;label:string;value:QuerySelection;onChange:(v:QuerySelection)=>void;query?:object}) {
  const [search,setSearch]=useState(''),[offset,setOffset]=useState(0),[page,setPage]=useState<QueryOptions>(),[error,setError]=useState(''),[open,setOpen]=useState(false);
  const sequence=useRef(0),actionSequence=useRef(0),key=JSON.stringify([value,query]);
  const actionDomain=JSON.stringify([identity.fingerprint,view,field,{...query,filters:undefined}]);
  // Dismissing a menu cancels candidate loading, but must retain an in-flight selection.
  useEffect(()=>()=>{actionSequence.current++;},[actionDomain]);
  useEffect(()=>{const seq=++sequence.current;setPage(undefined);setError('');if(!open)return;const timer=window.setTimeout(()=>{
    api(queryUrl('options',{identity,view,field,search,offset,limit:100,query:query||{view,fromDate:identity.dayZero,toDateInclusive:identity.dayZero}})).then(r=>{
      if(seq!==sequence.current)return;
      if(!sameQueryIdentity(identity,r.identity))throw Error('筛选候选版本已变化，请重新进入查询');
      setPage(r);
    }).catch(e=>{if(seq===sequence.current)setError(e.message);});
  },150);return()=>{clearTimeout(timer);sequence.current++;};},[open,identity.fingerprint,view,field,search,offset,key]);
  function operation(action:object) {
    const seq=++actionSequence.current;setError('');
    api(queryUrl('options',{identity,view,field,search,offset,query,action})).then(r=>{
      if(seq!==actionSequence.current)return;if(!sameQueryIdentity(identity,r.identity))throw Error('筛选候选版本已变化');setPage(r);onChange(r.selection);
    }).catch(e=>{if(seq===actionSequence.current)setError(e.message);});
  }
  return <DropdownDetails className="qr-select" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary><span>{label}</span><b>{open&&page?`${page.selectedTotal}/${page.total}`:value.mode==='ALL'&&!value.exclude?.length?'全部':value.mode==='NONE'?'0 项':'已筛选'}</b><span aria-hidden="true">⌄</span></summary>
    {open&&<div className="qr-select-panel">
      <label className="qr-select-search"><span className="sr-only">搜索{label.replace(/编号$/,'')}编号或名称</span><input aria-label={'搜索'+label.replace(/编号$/,'')+'编号或名称'} placeholder="搜索编号或名称" value={search} maxLength={200} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/></label>
      <div className="qr-select-actions"><button type="button" onClick={()=>operation({kind:'searchAll',query:search})}>全选匹配</button><button type="button" onClick={()=>operation({kind:'none'})}>清空</button><button type="button" onClick={()=>operation({kind:'restore'})}>恢复不限</button></div>
      {error&&<p role="alert">{error}</p>}
      {!page&&!error&&<p role="status">正在读取候选…</p>}
      {page&&<><div className="qr-option-list">{page.items.map(o=><label key={o.id}><input type="checkbox" checked={o.selected} onChange={e=>operation({kind:'toggle',id:o.id,checked:e.target.checked})}/><span>{o.label}</span></label>)}</div><div className="qr-select-pager"><button type="button" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-100))}>上一页</button><span>{page.total?offset+1:0}–{offset+page.items.length} / {page.matched}</span><button type="button" disabled={page.nextOffset===null} onClick={()=>setOffset(page.nextOffset!)}>下一页</button></div></>}
    </div>}
  </DropdownDetails>;
}

export function QueryTable({id,columns,records,selected,onSelected,onOpen,sort,direction,onSort,onVisible,identity,onLong,header,rowActions}:{id:string;rowActions?:(record:QueryRecord)=>ReactNode;identity?:QueryIdentity;header?:ReactNode;onLong?:(id:string,field:string)=>void;columns:QueryColumn[];records:QueryRecord[];selected?:string[];onSelected?:(v:string[])=>void;onOpen?:(r:QueryRecord)=>void;sort?:string;direction?:string;onSort?:(key:string)=>void;onVisible?:(keys:string[])=>void}) {
  const prefKey='aps-query-columns:r1:'+id;
  const [visible,setVisible]=useState<string[]>(()=>{
    try{const a=JSON.parse(localStorage.getItem(prefKey)||'null');if(Array.isArray(a))return columns.filter(c=>c.fixed||a.includes(c.key)).map(c=>c.key);}catch{}
    return columns.map(c=>c.key);
  });
  const signature=columns.map(c=>c.key).join('|');
  useEffect(()=>{setVisible(v=>{const legal=columns.filter(c=>c.fixed||v.includes(c.key)).map(c=>c.key);return legal.length?legal:columns.map(c=>c.key);});},[signature]);
  function save(v:string[]){setVisible(v);try{localStorage.setItem(prefKey,JSON.stringify(v));}catch{}}
  const shown=columns.filter(c=>c.fixed||visible.includes(c.key));
  const visibleKey=shown.map(c=>c.key).join('|');
  useEffect(()=>onVisible?.(shown.map(c=>c.key)),[visibleKey]);
  return <><div className="qr-table-toolbar">{header}<QueryColumns columns={columns} value={shown.map(c=>c.key)} onChange={save}/></div><div className="qr-scroll"><table><thead><tr>{rowActions&&<th>维护</th>}{onSelected&&<th>选择</th>}{shown.map(c=><th key={c.key} className={c.sticky?'qr-sticky-'+c.sticky:undefined}>{onSort&&c.sortable!==false?<button onClick={()=>onSort(c.key)} aria-label={'按'+c.label+'排序'}>{c.label}{sort===c.key?(direction==='desc'?' ↓':' ↑'):''}</button>:c.label}</th>)}</tr></thead><tbody>{records.map(r=><tr key={r.id}>{rowActions&&<td>{rowActions(r)}</td>}{onSelected&&<td><input type="checkbox" aria-label={'选择 '+r.id} checked={selected?.includes(r.id)||false} onChange={e=>onSelected(e.target.checked?[...(selected||[]),r.id]:(selected||[]).filter(k=>k!==r.id))}/></td>}{shown.map((c,i)=><td key={c.key} className={c.sticky?'qr-sticky-'+c.sticky:undefined} title={c.format==='inventory'?'库存 / 预留 / 可用 · '+queryValue(r.values[c.key],c,identity):undefined}>{(r.values[c.key] as any)?.longValue&&onLong?<button onClick={()=>onLong(r.id,c.key)}>查看完整长值（{String((r.values[c.key] as any).bytes)}字节）</button>:onOpen&&(i===0||c.fixed)?<button className="qr-link" onClick={()=>onOpen(r)}>{queryValue(r.values[c.key],c,identity)}</button>:queryValue(r.values[c.key],c,identity)}</td>)}</tr>)}</tbody></table></div></>;
}

export function QuerySourceDrawer({preferenceScope,api,identity,query,pageFingerprint,view,record,onClose,onNavigate,onMaintenance}:{api:QueryApi;identity:QueryIdentity;query:object;preferenceScope:string;pageFingerprint:string;view:string;record:QueryRecord;onClose:()=>void;onNavigate:(view:string,q:string)=>void;onMaintenance?:(target:{table:string;key:string})=>void}) {
  const [detail,setDetail]=useState<any>(),[error,setError]=useState(''),[offset,setOffset]=useState(0),[table,setTable]=useState('record'),[objectId,setObjectId]=useState(String(record.values.materialId||record.values['物料编号']||''));
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;close.current?.focus();return()=>previous?.focus?.();},[]);
  useEffect(()=>{let live=true;setDetail(undefined);setError('');
    api(queryUrl('detail',{query,identity,queryFingerprint:pageFingerprint,view,id:record.id,table,offset,pageSize:100,objectId})).then(r=>{if(!live)return;if(!sameQueryIdentity(identity,r.identity)||r.queryFingerprint!==pageFingerprint)throw Error('明细身份不一致，请重新查询');setDetail(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};
  },[identity.fingerprint,pageFingerprint,view,record.id,table,offset,objectId]);
  return <aside className="qr-drawer" role="dialog" aria-modal="true" aria-label={'组成与来源 '+record.id} onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const elements=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,summary,a[href]'));const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
    <header><h3>{record.id} · 组成与来源</h3><button ref={close} onClick={onClose}>关闭明细</button></header>
    <nav aria-label="明细表">{[['record','原始记录'],['sources','文件与源行'],['members','组成明细'],['material','关联物料'],['run','排程结果'],['mapping','运行映射'],['parameters','有效参数']].map(([id,label])=><button key={id} aria-pressed={table===id} onClick={()=>{setTable(id);setOffset(0);}}>{label}</button>)}</nav>{table==='parameters'&&<label>物料或来源业务键<input value={objectId} onChange={e=>{setObjectId(e.target.value);setOffset(0);}}/></label>}{error&&<p role="alert">{error}</p>}{!detail&&!error&&<p role="status">正在读取同版本明细…</p>}
    {detail&&<><QueryTable key={view+':'+table} id={preferenceScope+':'+view+':drawer:'+table} identity={identity} columns={detail.columns} records={detail.records}/>
      <div className="qr-actions"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-100))}>上一页明细</button><span>{detail.total} 条</span><button disabled={detail.nextOffset===null} onClick={()=>setOffset(detail.nextOffset)}>下一页明细</button></div>
      <h4>文件、源行与参数</h4>{detail.sources?.length?detail.sources.map((s:any,i:number)=><p key={i}>{s.fileName||'文件名未记录'} · {s.fileHash||'文件指纹未记录'} · {s.sheet||'工作表未记录'} · {s.row?'原行 '+s.row:'原行未记录'} · {s.key||'业务键未记录'}</p>):<p>未提供可定位的原始来源；没有生成推测链接。</p>}
      {detail.parameters&&<details><summary>有效参数及覆盖来源</summary><pre>{JSON.stringify(detail.parameters,null,2)}</pre></details>}
      {onMaintenance&&detail.maintenanceTargets?.map((t:any)=><button key={t.table+':'+t.key} onClick={()=>onMaintenance(t)}>维护来源 · {t.table} · {t.key}</button>)}
      {detail.links?.map((l:any)=><button key={l.view+':'+l.key} onClick={()=>onNavigate(l.view,l.key)}>{l.label}</button>)}
      <details><summary>完整快照身份</summary><pre>{JSON.stringify(identity,null,2)}</pre></details>
    </>}
  </aside>;
}

export function QueryLongValue({api,identity,query,fingerprint,id,field,onClose}:{api:QueryApi;identity:QueryIdentity;query:object;fingerprint:string;id:string;field:string;onClose:()=>void}){
  const [value,setValue]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let live=true;(async()=>{let text='',offset=0,expected='';do{
    const r=await api(queryUrl('value',{identity,query,queryFingerprint:fingerprint,id,field,offset}));
    if(!live)return;if(!sameQueryIdentity(identity,r.identity)||r.fingerprint!==fingerprint||expected&&r.sha256!==expected)throw Error('长值身份变化');
    expected=r.sha256;text+=r.chunk;if(r.nextOffset===null)break;if(r.nextOffset<=offset)throw Error('长值分块未前进');offset=r.nextOffset;
    if(text.length>32*1024*1024)throw Error('长值超过展示上限，请完整导出');
  }while(true);if(live)setValue(text);})().catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[identity.fingerprint,fingerprint,id,field]);
  return <aside className="qr-drawer" role="dialog" aria-label="完整长值"><button onClick={onClose}>关闭长值</button><h3>{field}</h3>{error?<p role="alert">{error}</p>:<pre>{value||'正在读取完整长值…'}</pre>}</aside>;
}
