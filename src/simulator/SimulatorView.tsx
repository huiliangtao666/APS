import {useEffect,useState} from 'react';
import {SimulatorTable,type SimRow,type SimColumn} from './SimulatorTable';
import './simulator.css';

type Api=(path:string,body?:object)=>Promise<any>;
type Branch={scenario:string;branch:string;revision:number;nextDate:string;lastSuccessfulDate:string|null;source:Record<string,unknown>;
  lineage:unknown;current:Record<string,any>|null;checkpoints:{id:string;date:string;businessHash:string}[];precheck:Record<string,any>;diagnostics:unknown[]};
const labels:Record<string,string>={id:'编号',materialId:'物料编号',quantity:'实物数量',pending:'待检',qualified:'合格',frozen:'冻结',free:'自由可用',
  externalReserved:'外部占用',expiresAt:'失效时刻',expired:'已失效',ordered:'原订购量',received:'累计实收',cancelled:'累计取消',
  required:'原需求量',change:'明确净变更',shipped:'累计工厂发运',signed:'累计客户签收',fulfillment:'履约口径',
  customer:'客户',status:'状态',processedMinutes:'已加工分钟',remainingMinutes:'剩余加工分钟',output:'累计工序产出',scrap:'累计工艺报废',
  consumed:'累计耗料（分批次）',receivedOutput:'累计制造入库',reason:'待处置原因',date:'业务日期',resolved:'已处置',
  resourceId:'资源编号',taskId:'任务编号',startAt:'取得时刻',endAt:'释放时刻（不含）',businessDate:'归账日',type:'事件类型',unit:'单位',unreceived:'净未收',remaining:'未履约量',deliveryTransit:'客户配送在途',
  occurredAt:'物理发生时刻',knownAt:'可知时刻',effectiveAt:'生效时刻',data:'事件内容',lineage:'来源谱系',source:'来源'};
const tableColumns:Record<string,string[]>={lots:['id','materialId','unit','quantity','pending','qualified','frozen','externalReserved','free','expiresAt','expired'],
  purchases:['id','materialId','unit','ordered','received','cancelled','unreceived'],demands:['id','materialId','unit','required','change','cancelled','shipped','signed','remaining','deliveryTransit','fulfillment','customer'],
  tasks:['id','unit','status','processedMinutes','remainingMinutes','output','scrap','receivedOutput','consumed'],
  holds:['resourceId','taskId','quantity','startAt','endAt'],issues:['id','date','reason','resolved'],
  events:['id','businessDate','type','occurredAt','knownAt','effectiveAt','data','source']};
const tabs=['场景与规则','每日总览','事件与生产','需求与交付','库存与在途','快照与接口检查'];
function download(name:string,value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

/** The caller supplies the existing authenticated API helper; this module does not replace it. */
export function SimulatorView({api,base='/workbooks/simulator',canWrite,canExport}:{api:Api;base?:string;canWrite:boolean;canExport:boolean}) {
  const [branches,setBranches]=useState<Branch[]>([]),[current,setCurrent]=useState<Branch|null>(null),[tab,setTab]=useState(tabs[0]);
  const [scenario,setScenario]=useState(''),[branch,setBranch]=useState(''),[draft,setDraft]=useState('');
  const [newBranch,setNewBranch]=useState(''),[checkpoint,setCheckpoint]=useState(''),[compareFrom,setCompareFrom]=useState(''),[compareTo,setCompareTo]=useState('');
  const [days,setDays]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[detail,setDetail]=useState<unknown>(null);
  const [request,setRequest]=useState<{id:string;path:string}|null>(null),[knownEvents,setKnownEvents]=useState<SimRow[]>([]);
  const [fields,setFields]=useState<{model:string;table:string;fields:string[]}[]>([]);
  const prefix=(b:Pick<Branch,'scenario'|'branch'>)=>base+'/branches/'+encodeURIComponent(b.scenario)+'/'+encodeURIComponent(b.branch);
  async function refresh(){setBranches(await api(base+'/branches'));}
  useEffect(()=>{let live=true;api(base+'/branches').then(v=>{if(live)setBranches(v);}).catch(e=>{if(live)setError(e.message);});
    api(base+'/catalog').then(v=>{if(live)setFields(v.tables);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[api,base]);
  async function run(action:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function open(b:Branch){const view=await api(prefix(b));setCurrent(view);setScenario(b.scenario);setBranch(b.branch);setKnownEvents([]);setCheckpoint('');
    if(view.current)setKnownEvents(await api(prefix(b)+'/events'));setNotice('已重新读取持久检查点');}
  async function advance(n:number){if(!current)return;const req={id:crypto.randomUUID(),path:prefix(current)};setRequest(req);
    // On a transport error this identity is retained for explicit reconciliation. There is no automatic retry.
    const out=await api(req.path+'/advance',{requestId:req.id,expectedRevision:current.revision,days:n});
    setCurrent(out.view);setNotice('推进结果：'+out.operation.status+'，完整成功 '+out.operation.completedDays+' 日');setRequest(null);
    if(out.view.current)setKnownEvents(await api(req.path+'/events'));await refresh();}
  function table(key:string,heading:string,rows:SimRow[]){const columns:SimColumn[]=(tableColumns[key]??Object.keys(rows[0]??{})).map(k=>({key:k,label:labels[k]??k}));
    const materials=current?.current?.materials??[],projected=rows.map(r=>({...r,businessDate:r.businessDate??current?.current?.date,
      unit:materials.find((m:any)=>m.id===(r.materialId??r.outputMaterialId))?.unit??r.unit??'不适用',
      ...(key==='purchases'?{unreceived:Number(r.ordered)-Number(r.received)-Number(r.cancelled)}:{}),
      ...(key==='demands'?{remaining:Number(r.required)+Number(r.change)-Number(r.cancelled)-Number(r.fulfillment==='SHIP'?r.shipped:r.signed),deliveryTransit:Number(r.shipped)-Number(r.signed)}:{})}));
    return <div key={key}><h3>{heading}</h3><SimulatorTable key={(current?.scenario??'')+':'+(current?.branch??'')+':'+key} table={key} columns={columns} rows={projected} onOpen={setDetail}
      context={{scenario:current?.scenario,branch:current?.branch,revision:current?.revision,source:current?.source,observation:current?.current?.cutoff,materials}} canExport={canExport}/></div>;}
  const snap=current?.current;
  return <main className="simulator"><header><div><h1>每日数据模拟器</h1><span className="sim-badge">独立调试 · 联动未启用</span></div>
    <p>场景 {current?.scenario??'未选择'} / 分支 {current?.branch??'未选择'} · 下一模拟日 {current?.nextDate??'未设置'} · 版本 {current?.revision??'未创建'}</p>
    {current&&<details><summary>来源、版本与指纹</summary><pre>{JSON.stringify({source:current.source,lineage:current.lineage},null,2)}</pre></details>}
    {snap&&<p>观测边界：截至 {snap.cutoff}，不含该时点；业务指纹 {snap.businessHash}</p>}</header>
    {error&&<p role="alert" className="sim-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {request&&<div className="sim-error"><p>推进身份 {request.id}。若回执未知，请先查询此身份再决定下一次操作。</p>
      <button disabled={busy} onClick={()=>run(async()=>{const op=await api(request.path+'/operations/'+request.id);setDetail(op);
        if(op.status==='COMPLETED'||op.status==='FAILED'||op.status==='PAUSED'){if(current)await open(current);setRequest(null);}})}>查询推进回执</button></div>}
    <nav aria-label="模拟器页签">{tabs.map(t=><button key={t} aria-current={tab===t?'page':undefined} onClick={()=>setTab(t)}>{t}</button>)}</nav>
    <div className="sim-toolbar"><label>已保存场景<select value={current?current.scenario+'/'+current.branch:''} onChange={e=>{const b=branches.find(x=>x.scenario+'/'+x.branch===e.target.value);if(b)void run(()=>open(b));}}>
      <option value="">选择场景/分支</option>{branches.map(b=><option key={b.scenario+'/'+b.branch} value={b.scenario+'/'+b.branch}>{b.scenario} / {b.branch} · {b.lastSuccessfulDate??'尚未推进'}</option>)}</select></label>
      <button disabled={busy} onClick={()=>run(refresh)}>刷新</button>
      <button disabled={!canWrite||busy||!current||!!request} onClick={()=>run(()=>advance(1))}>推进一天</button>
      <label>连续天数<input type="number" min={1} max={366} value={days} onChange={e=>setDays(Number(e.target.value))}/></label>
      <button disabled={!canWrite||busy||!current||!!request||!Number.isInteger(days)||days<1||days>366} onClick={()=>run(()=>advance(days))}>串行推进 {days} 天</button>
      <button disabled={!canWrite||!current} onClick={()=>{if(current)void api(prefix(current)+'/pause',{}).then(()=>setNotice('已请求在完整日结边界暂停')).catch(e=>setError(e.message));}}>暂停后续推进</button>
      <button disabled={!canWrite||busy||!current||!!request} onClick={()=>run(async()=>{if(current)setCurrent(await api(prefix(current)+'/resume',{expectedRevision:current.revision}));})}>解除暂停</button>
    </div>
    {tab==='场景与规则'&&<section><p>选择已冻结的主数据、业务期初、第二份P及显式作业副本，导入独立场景JSON。脚本修改通过复制到新分支保存。</p>
      <div className="sim-toolbar"><label>场景编号<input value={scenario} onChange={e=>setScenario(e.target.value)}/></label><label>分支编号<input value={branch} onChange={e=>setBranch(e.target.value)}/></label>
        <label>读取场景文件<input type="file" accept="application/json,.json" onChange={e=>{const file=e.target.files?.[0];if(file){if(file.size>2*1024*1024){setError('场景文件上限2MiB');return;}void file.text().then(setDraft);}}}/></label>
        <button disabled={busy||!current} onClick={()=>run(async()=>{if(current){const out=await api(prefix(current)+'/script');setDraft(JSON.stringify(out.spec,null,2));setNotice('作者脚本含未来事件，与可见观测包分开');}})}>读取作者脚本</button>
        <button disabled={busy} onClick={()=>run(async()=>{const out=await api(base+'/example');setDraft(JSON.stringify(out.spec,null,2));setNotice(out.description);})}>载入显式三日样例</button></div>
      <label>独立场景与事件脚本<textarea rows={16} value={draft} onChange={e=>setDraft(e.target.value)} spellCheck={false}/></label>
      <div className="sim-toolbar"><button disabled={busy||!draft} onClick={()=>run(async()=>{setDetail(await api(base+'/precheck',{spec:JSON.parse(draft)}));})}>预检查</button>
        <button disabled={!canWrite||busy||!draft||!scenario||!branch} onClick={()=>run(async()=>{setCurrent(await api(base+'/branches',{scenario,branch,spec:JSON.parse(draft)}));setKnownEvents([]);await refresh();setNotice('已创建独立副本');})}>创建场景</button>
        <button disabled={!canExport||!draft} onClick={()=>{try{download('simulator-author-script.json',JSON.parse(draft));}catch(e){setError(String(e));}}}>保存作者脚本</button></div>
    </section>}
    {tab==='每日总览'&&<section>{!snap?<p>尚无成功日结。请先预检查并推进。</p>:<><p>本日 {snap.date} · 生产、质量、工厂发运和客户签收分别记账。数量按物料及原单位查看。</p>
      {table('issues','待处置项',snap.issues??[])}{table('tasks','工序进度',snap.tasks??[])}</>}
      {current&&<pre>{JSON.stringify(current.precheck,null,2)}</pre>}</section>}
    {tab==='事件与生产'&&<>{table('events','截至当前已知的事件',knownEvents)}{table('tasks','生产与剩余分钟',snap?.tasks??[])}{table('holds','资源取得与释放',snap?.holds??[])}</>}
    {tab==='需求与交付'&&table('demands','需求与发运 / 签收',snap?.demands??[])}
    {tab==='库存与在途'&&<>{table('lots','批次库存',snap?.lots??[])}{table('purchases','采购在途',snap?.purchases??[])}</>}
    {tab==='快照与接口检查'&&<section><div className="sim-toolbar"><label>恢复检查点<select value={checkpoint} onChange={e=>setCheckpoint(e.target.value)}><option value="">初始基线</option>{current?.checkpoints.map(c=><option key={c.id} value={c.id}>{c.date}</option>)}</select></label>
      <label>新分支编号<input value={newBranch} onChange={e=>setNewBranch(e.target.value)}/></label>
      <button disabled={!canWrite||busy||!current||!newBranch||!!request} onClick={()=>run(async()=>{if(!current)return;const out=await api(prefix(current)+'/fork',{newBranch,checkpointId:checkpoint||null,expectedRevision:current.revision,...(draft?{replacementSpec:JSON.parse(draft)}:{})});await refresh();await open(out);setNotice('原历史保留，已创建恢复分支');})}>恢复 / 修改脚本为新分支</button>
      <button disabled={busy||!current} onClick={()=>run(async()=>{if(current)setDetail(await api(prefix(current)+'/opening'));})}>查看下一日零点开工快照</button>
      <button disabled={!canExport||busy||!current||!snap} onClick={()=>run(async()=>{if(current)download('simulator-check-'+current.branch+'.json',await api(prefix(current)+'/export'));})}>导出独立检查包</button></div>
      <div className="sim-toolbar"><label>对比起日<select value={compareFrom} onChange={e=>setCompareFrom(e.target.value)}><option value="">选择</option>{current?.checkpoints.map(c=><option key={c.id} value={c.id}>{c.date}</option>)}</select></label>
        <label>对比止日<select value={compareTo} onChange={e=>setCompareTo(e.target.value)}><option value="">选择</option>{current?.checkpoints.map(c=><option key={c.id} value={c.id}>{c.date}</option>)}</select></label>
        <button disabled={busy||!current||!compareFrom||!compareTo} onClick={()=>run(async()=>{if(current)setDetail(await api(prefix(current)+'/compare?from='+encodeURIComponent(compareFrom)+'&to='+encodeURIComponent(compareTo)));})}>比较两日</button></div>
      <p>兼容检查输出保持当前接口字段。扩展模拟账单独保存；真实导入、完整日批接纳与联动均未启用。</p>
      <details><summary>当前接口字段</summary>{fields.map(t=><p key={t.model+':'+t.table}>{t.model} / {t.table}：{t.fields.join('、')}</p>)}</details>
      {current&&<details><summary>日结指纹与诊断</summary><pre>{JSON.stringify({checkpoints:current.checkpoints,diagnostics:current.diagnostics},null,2)}</pre></details>}
    </section>}
    {detail!==null&&<aside className="sim-drawer" aria-label="模拟明细"><button onClick={()=>setDetail(null)}>关闭明细</button><pre>{JSON.stringify(detail,null,2)}</pre></aside>}
  </main>;
}
