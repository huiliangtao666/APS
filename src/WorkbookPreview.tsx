import {useEffect,useRef,useState} from 'react';
import type {KeyboardEvent} from 'react';
import './WorkbookPreview.css';

export type PreviewMemory={q:string;table:string;operation:string;severity:string;cursor:string;back:string[];pageSize:number;tab:'records'|'issues';draft?:unknown;pendingCommit?:{key:string;payload:any}};
export type WorkbookPreviewProps={
  api:(path:string,body?:object)=>Promise<any>;
  download:(path:string,name:string)=>Promise<void>;
  previewId:string;canWrite:boolean;canExport:boolean;reason:string;
  memory?:{current:Record<string,PreviewMemory>};
  onCommitted?:(result:any,context:PreviewMemory)=>void;
  onReimport?:(context:PreviewMemory)=>void;
  onMaintenance?:(target:any,context:PreviewMemory)=>void;
};
const initial:PreviewMemory={q:'',table:'',operation:'',severity:'',cursor:'',back:[],pageSize:25,tab:'records'};
const show=(v:any)=>v?.truncated?'长值（按需读取全文）':!v?.present?'缺失':v.value===null?'null':v.value===''?'空字符串':JSON.stringify(v.value);
const position=(s:any)=>!s?'来源未提供':`${s.fileName||''} / ${s.sheet||''} / ${s.businessKey||''} / ${s.cell||s.absenceReason||'无物理坐标'}`;

/** Existing import card supplies one authoritative previewId per file card. Mount
 * with key=previewId. memory belongs to the workbench return-context, not a ledger.
 * api must use the existing auth/CSRF client; download streams server export only.
 */
export function WorkbookPreview(props:WorkbookPreviewProps){
  const {api,download,previewId,canWrite,canExport,reason,memory}=props;
  const [context,setContext]=useState<PreviewMemory>(()=>memory?.current[previewId]||{...initial});
  const [summary,setSummary]=useState<any>(),[page,setPage]=useState<any>(),[fields,setFields]=useState<any>();
  const [selected,setSelected]=useState<any>(),[locations,setLocations]=useState<any>(),[anchors,setAnchors]=useState<any>(),[error,setError]=useState('');
  const [loading,setLoading]=useState(false),[detailBusy,setDetailBusy]=useState(false),[refresh,setRefresh]=useState(0);
  const [confirm,setConfirm]=useState(false),[ack,setAck]=useState(false),[risk,setRisk]=useState(false),[warning,setWarning]=useState(false);
  const [commitState,setCommitState]=useState<'idle'|'sending'|'unknown'|'committed'>(()=>context.pendingCommit?'unknown':'idle');
  const [longValue,setLongValue]=useState<{text:string;next:number|null;fieldId:string;side:string}>();
  const generation=useRef(0),detailGeneration=useRef(0),returnFocus=useRef<HTMLElement|null>(null),dialog=useRef<HTMLDivElement>(null);
  const idKey=useRef(context.pendingCommit?.key||''),payload=useRef<any>(context.pendingCommit?.payload);
  const root='/workbooks/previews/'+encodeURIComponent(previewId);
  useEffect(()=>{if(memory)memory.current[previewId]=context;},[memory,previewId,context]);
  useEffect(()=>{
    let active=true;setSummary(undefined);setPage(undefined);setSelected(undefined);setFields(undefined);setError('');
    api(root+'/summary').then(s=>{if(active&&s.previewId===previewId){setSummary(s);if(s.status==='COMMITTED')setCommitState('committed');}}).catch(e=>{if(active)setError('暂时无法核验预览，请重试：'+e.message);});
    return()=>{active=false;generation.current++;detailGeneration.current++;};
  },[api,root,previewId,refresh]);
  const fingerprint=summary?.summaryFingerprint,revision=summary?.revision;
  function query(extra:Record<string,any>={}){
    return new URLSearchParams(Object.entries({revision,summaryFingerprint:fingerprint,...extra}).map(([k,v])=>[k,String(v??'')])).toString();
  }
  function filters(){return {q:context.q,table:context.table,operation:context.operation,severity:context.severity,cursor:context.cursor,pageSize:context.pageSize};}
  function matches(r:any){return r.previewId===previewId&&r.revision===revision&&r.summaryFingerprint===fingerprint;}
  useEffect(()=>{
    if(!summary)return;const g=++generation.current;setLoading(true);setPage(undefined);setError('');
    const params=new URLSearchParams(Object.entries({revision,summaryFingerprint:fingerprint,...filters(),pageSize:context.tab==='issues'?Math.min(50,context.pageSize):context.pageSize}).map(([k,v])=>[k,String(v)]));
    api(root+'/'+context.tab+'?'+params).then(r=>{if(g!==generation.current)return;if(!matches(r))throw Error('快照身份已变化，请重新查询');setPage(r);}).catch(e=>{if(g===generation.current)setError('当前页未取得，筛选已保留：'+e.message);}).finally(()=>{if(g===generation.current)setLoading(false);});
    return()=>{generation.current++;};
  },[api,root,summary,context,revision,fingerprint]);
  useEffect(()=>{if(selected)dialog.current?.focus();},[selected]);
  function change(patch:Partial<PreviewMemory>){setContext(c=>({...c,...patch,cursor:'',back:[]}));}
  function close(){detailGeneration.current++;setSelected(undefined);setFields(undefined);setLocations(undefined);setAnchors(undefined);setLongValue(undefined);setTimeout(()=>returnFocus.current?.focus(),0);}
  async function open(row:any,event:HTMLElement){
    const g=++detailGeneration.current;returnFocus.current=event;setSelected(row);setFields(undefined);setLocations(undefined);setAnchors(undefined);setLongValue(undefined);setDetailBusy(true);setError('');
    try{const r=await api(root+(row.groupId?'/locations?'+query({groupId:row.groupId}):'/fields?'+query({changeId:row.changeId})));if(g!==detailGeneration.current)return;if(!matches(r))throw Error('快照身份不符');row.groupId?setLocations(r):setFields(r);}catch(e){if(g===detailGeneration.current)setError((e as Error).message);}finally{if(g===detailGeneration.current)setDetailBusy(false);}
  }
  async function moreDetail(){
    const g=detailGeneration.current;setDetailBusy(true);
    try{const r=await api(root+(selected.groupId?'/locations?'+query({groupId:selected.groupId,cursor:locations.nextCursor}):'/fields?'+query({changeId:selected.changeId,cursor:fields.nextCursor})));if(g!==detailGeneration.current)return;if(!matches(r))throw Error('快照身份不符');selected.groupId?setLocations(r):setFields(r);setLongValue(undefined);}catch(e){setError((e as Error).message);}finally{setDetailBusy(false);}
  }
  async function readLong(fieldId:string,side:string,offset=0){
    const g=detailGeneration.current;setDetailBusy(true);
    try{const r=await api(root+'/value?'+query({changeId:selected.changeId,fieldId,side,offset}));if(g!==detailGeneration.current)return;if(!matches(r))throw Error('快照身份不符');setLongValue({text:r.chunk,next:r.nextOffset,fieldId,side});}catch(e){setError((e as Error).message);}finally{setDetailBusy(false);}
  }
  async function exportFile(scope:'ALL'|'FILTERED'){
    try{await download(root+'/export?'+query({...filters(),scope}),`预览-${scope}-${previewId}.ndjson`);}catch(e){setError('导出未完成：'+(e as Error).message);}
  }
  async function commit(){
    if(!summary||!ack||commitState!=='idle')return;
    if(!idKey.current)idKey.current=crypto.randomUUID();
    const b=summary.binding;
    payload.current=payload.current||{previewId,revision,summaryFingerprint:fingerprint,datasetId:b.datasetId,expectedVersion:b.expectedVersion,
      fileHash:b.fileHash,importKind:b.importKind,mode:b.mode,scope:b.scope,effectivePeriod:b.effectivePeriod,
      previewFingerprint:b.previewFingerprint,overlayResolution:b.overlayResolution,fullBatchScope:'ALL_CHANGES',
      confirmedAll:ack,acknowledgedWarnings:warning,acknowledgedReplaceDelete:risk,reason,idempotencyKey:idKey.current};
    setContext(c=>({...c,pendingCommit:{key:idKey.current,payload:payload.current}}));
    setCommitState('sending');setError('');
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{const r=await Promise.race([api(root+'/confirm',payload.current),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('响应超时')),10000);})]);setCommitState('committed');props.onCommitted?.(r,context);setRefresh(x=>x+1);}catch(e){setCommitState('unknown');setError('提交结果尚未核验，请查询提交结果：'+(e as Error).message);}finally{if(timer)clearTimeout(timer);}
  }
  async function sourcePage(section:string,cursor=''){
    const g=detailGeneration.current;setDetailBusy(true);
    try{const r=await api(root+'/anchors?'+query({groupId:selected.groupId,section,cursor}));if(g!==detailGeneration.current)return;if(!matches(r))throw Error('快照身份不符');setAnchors({...r,section});}catch(e){setError((e as Error).message);}finally{setDetailBusy(false);}
  }
  async function status(){
    try{const r=await api(root+'/commit-status?'+new URLSearchParams({idempotencyKey:idKey.current}));
      if(r.status==='COMMITTED'){setCommitState('committed');props.onCommitted?.(r.result,context);setRefresh(x=>x+1);}
      else if(r.status==='NOT_COMMITTED'&&r.stillValid){setCommitState('idle');setError('服务端确认尚未提交；可保留原键重试。');}
      else setError('结果未确认或预览已不可提交，请保留草稿重新核验。');
    }catch(e){setError('暂时无法查询，保持待核验：'+(e as Error).message);}
  }
  function trap(e:KeyboardEvent<HTMLDivElement>){
    if(e.key==='Escape'){e.preventDefault();close();return;}
    if(e.key==='Tab'){const els=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]');if(!els?.length){e.preventDefault();return;}const first=els[0],last=els[els.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  }
  if(!summary)return <section className="workbook-preview" aria-live="polite"><p>{error||'正在核验预览摘要…'}</p><button onClick={()=>setRefresh(x=>x+1)}>重试查询</button></section>;
    const counts=summary.counts,replaceDelete=summary.tables.some((t:any)=>t.replace+t.delete>0);
  const disabled=!canWrite||!canExport||!summary.canCommit||!ack||!reason.trim()||(replaceDelete&&!risk)||(counts.warnings>0&&!warning)||commitState!=='idle';
  return <section className="workbook-preview" aria-label="整批导入预览">
    <h3>整批预览 · {summary.status} {summary.simulation?'· SIMULATION 仿真':''}</h3>
    <p>目标 {summary.binding.datasetId} · 基底 v{summary.binding.expectedVersion} → 拟 v{summary.binding.expectedVersion+1} · {summary.binding.importKind} / {summary.binding.mode} / {summary.binding.scope}</p>
    <p className="wp-hash">原件 {summary.binding.fileHash} · 快照 {fingerprint} · 到期 {summary.expiresAt}</p>
    <p>{counts.records} 条变化记录 / {counts.changedFieldCount} 个变化字段；报告 {counts.rawReports} 次 / {counts.uniqueLocations} 个位置 / {counts.groups} 组；导入阻塞 {counts.blockingReports} 次 / 警告 {counts.warnings} 次。排程就绪问题单列，不代表导入失败。</p>
    <p>预览未生效；参数候选不代表已采用。修改请修正原Excel重新上传，或使用已注册的真实维护入口。</p>
    <div className="wp-actions"><button disabled={!canExport||!summary.exportAvailable} onClick={()=>exportFile('ALL')}>下载整批完整差异 ALL（确认范围）</button><button disabled={!canExport||!summary.exportAvailable} onClick={()=>exportFile('FILTERED')}>下载当前筛选 FILTERED（仅查询）</button><button onClick={()=>setRefresh(x=>x+1)}>重新查询状态</button><button disabled={!props.onReimport} onClick={()=>props.onReimport?.(context)}>修正原Excel后重新上传</button></div>
    {error&&<p role="alert">{error}</p>}
    <form className="wp-actions" onSubmit={e=>e.preventDefault()}>
      <label>查看<select value={context.tab} onChange={e=>change({tab:e.target.value as PreviewMemory['tab']})}><option value="records">记录差异</option><option value="issues">异常与就绪问题</option></select></label>
      <label>业务表<select value={context.table} onChange={e=>change({table:e.target.value})}><option value="">全部表</option>{summary.tables.map((t:any)=><option key={t.table} value={t.table}>{t.table} ({t.records})</option>)}</select></label>
      <label>操作<select value={context.operation} onChange={e=>change({operation:e.target.value})}><option value="">全部操作</option><option value="create">新增</option><option value="replace">替代</option><option value="delete">删除</option></select></label>
      <label>等级<select value={context.severity} onChange={e=>change({severity:e.target.value})}><option value="">全部等级</option><option value="error">错误</option><option value="warning">警告</option></select></label>
      <label>全快照搜索<input maxLength={200} value={context.q} onChange={e=>change({q:e.target.value})}/></label>
      <label>每页<select value={context.pageSize} onChange={e=>change({pageSize:Number(e.target.value)})}>{[25,50,100].map(n=><option key={n}>{n}</option>)}</select></label><button onClick={()=>change({...initial})}>清除筛选</button>
    </form>
    <p aria-live="polite">{loading?'正在取得当前页…':`当前筛选 ${page?.total??'—'} 项；确认范围始终是整批 ${counts.records} 条变化记录。`}</p>
    <div className="wp-scroll"><table><thead><tr><th>业务表 / 对象</th><th>操作或原因</th><th>数量 / 来源</th><th>详情</th></tr></thead><tbody>{page?.items.map((r:any)=><tr key={r.changeId||r.groupId}><td>{r.table} / {r.key||r.objectId||'数据集'}</td><td>{r.operation||`${r.kind} · ${r.code}: ${r.message}`}</td><td>{r.changedFieldCount??`${r.rawReports} 次报告 / ${r.uniqueLocations} 位置`}<br/>{position(r.sourceRef)}</td><td><button onClick={e=>open(r,e.currentTarget)}>查看{r.groupId?'问题来源':'完整字段'}</button></td></tr>)}</tbody></table></div>
    <div className="wp-actions"><button disabled={!context.back.length||loading} onClick={()=>setContext(c=>({...c,cursor:c.back[c.back.length-1]||'',back:c.back.slice(0,-1)}))}>上一页</button><button disabled={!page?.nextCursor||loading} onClick={()=>setContext(c=>({...c,cursor:page.nextCursor,back:[...c.back,c.cursor]}))}>下一页</button><button onClick={()=>setContext(c=>({...c}))}>重试本页</button></div>
    <button disabled={commitState==='sending'||commitState==='committed'} onClick={()=>setConfirm(v=>!v)}>查看整批确认范围</button>
    {confirm&&<div className="wp-confirm"><h4>确认整批 {counts.records} 条变化记录（当前筛选 {page?.total??'—'} 项）</h4>
      <ul>{summary.tables.map((t:any)=><li key={t.table}>{t.table}：新增 {t.create} / 替代 {t.replace} / 删除 {t.delete}；{t.changedFieldCount} 个变化字段</li>)}</ul>
      <label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>我确认指定目标、用途与全部增改删范围；已按需查看重点记录，可取得完整清单。未逐条核对不代表系统已代我核实。</label>
      {replaceDelete&&<label><input type="checkbox" checked={risk} onChange={e=>setRisk(e.target.checked)}/>我知悉整批替代与删除范围。</label>}
      {counts.warnings>0&&<label><input type="checkbox" checked={warning} onChange={e=>setWarning(e.target.checked)}/>我知悉 {counts.warnings} 次警告及其影响。</label>}
      <p>{summary.reasons.join(' / ')}{!canWrite?' / 当前角色只读':''}{!reason.trim()?' / 请填写操作原因':''}</p>
      <button disabled={disabled} onClick={commit}>{commitState==='sending'?'正在提交…':commitState==='committed'?'已提交':'确认整批'}</button>
    </div>}
    {commitState==='unknown'&&<button onClick={status}>查询提交结果（保留原幂等键）</button>}
    {selected&&<div className="wp-overlay"><div className="wp-dialog" role="dialog" aria-modal="true" aria-label="预览记录与来源" tabIndex={-1} ref={dialog} onKeyDown={trap}>
      <h4>{selected.table} / {selected.key||selected.objectId||selected.code}</h4><button onClick={close}>关闭并返回原记录</button>
      <p aria-live="polite">{detailBusy?'正在读取当前字段/来源页…':'仅读取当前记录；不代表人工复核通过。'}</p>
      {fields&&<><p>共 {fields.total} 个字段 / {fields.changedFieldCount} 个变化字段</p><div className="wp-scroll"><table><thead><tr><th>字段 / 类型 / 单位</th><th>原值</th><th>拟值</th><th>公式与来源</th></tr></thead><tbody>{fields.items.map((f:any)=><tr key={f.fieldId}><td>{f.changed?'变化 · ':''}{f.name} / {f.type} / {f.unit||'单位未提供'}</td><td>{show(f.before)}{f.before.truncated&&<button disabled={detailBusy} onClick={()=>readLong(f.fieldId,'before')}>读取原值</button>}</td><td>{show(f.after)}{f.after.truncated&&<button disabled={detailBusy} onClick={()=>readLong(f.fieldId,'after')}>读取拟值</button>}</td><td><pre>{show(f.formula)}</pre>{f.formula.truncated&&<button onClick={()=>readLong(f.fieldId,'formula')}>读取公式文本</button>}{f.sourceRefs.map((s:any,i:number)=><p key={i}>{position(s)}</p>)}</td></tr>)}</tbody></table></div></>}
      {longValue&&<div><p>无损JSON文本片段，按顺序读取；完整原文也包含在整批导出中。</p><pre>{longValue.text}</pre><button disabled={longValue.next===null||detailBusy} onClick={()=>readLong(longValue.fieldId,longValue.side,longValue.next!)}>下一片段</button></div>}
      {locations?.items.map((l:any)=><div key={l.locationId}><p>{position(l.sourceRef)} · {l.field} · 原值 {JSON.stringify(l.sourceValue)}</p><p>原始报告：{l.reportIds.join('、')}</p><p>修正位置：{l.remedy.businessLocation||l.remedy.table} {l.remedy.exactKeyFilter&&JSON.stringify(l.remedy.exactKeyFilter)}</p><p>{l.remedy.reason}；{l.remedy.fallback}</p><button disabled={l.remedy.capability!=='SUPPORTED'||!l.remedy.entryId||!props.onMaintenance} onClick={()=>props.onMaintenance?.(l.remedy,context)}>真实维护{l.remedy.capability==='SUPPORTED'?'':'待实现'}</button></div>)}
      {selected.groupId&&<div className="wp-actions">{[['feed','投料点来源'],['physical-pool','物理池来源'],['wip','WIP来源'],['route-source','SF物料来源']].map(([s,label])=><button disabled={detailBusy} key={s} onClick={()=>sourcePage(s)}>{label}</button>)}</div>}
      {anchors&&<><p>{anchors.section}：{anchors.total} 个关联来源锚点（不增加问题报告数）</p>{anchors.items.map((a:any)=><p key={a.anchorId}>{a.businessKey} / {a.field} / {JSON.stringify(a.currentValue)} / {position(a.sourceRef)}</p>)}<button disabled={!anchors.nextCursor||detailBusy} onClick={()=>sourcePage(anchors.section,anchors.nextCursor)}>下一来源锚点页</button></>}
      <button disabled={detailBusy||!(fields?.nextCursor||locations?.nextCursor)} onClick={moreDetail}>下一字段/来源页</button>
      {!fields&&!locations&&!detailBusy&&<button onClick={e=>open(selected,e.currentTarget)}>重试详情</button>}
    </div></div>}
  </section>;
}
