import {useEffect,useState} from 'react';
import './DailyWorkspace.css';
type Props={api:(path:string,body?:object)=>Promise<any>;datasetId:string;canWrite:boolean;run:any;onRun:(run:any)=>void;onRefresh:()=>Promise<void>;onModule:(page:any)=>void;onDate:(day:number)=>void};
const domains=[['demand','需求'],['inventory','库存'],['production','生产'],['replenishment','补货']];
const nonce=()=>crypto.randomUUID();
export function DailyWorkspace({api,datasetId,canWrite,run,onRun,onRefresh,onModule,onDate}:Props){
 const [branches,setBranches]=useState<any[]>([]),[selected,setSelected]=useState(''),[daily,setDaily]=useState<any>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState(true),[historical,setHistorical]=useState<any>(),[historyDay,setHistoryDay]=useState('');
 const [start,setStart]=useState('2026-11-01'),[end,setEnd]=useState('2026-11-30'),[precision,setPrecision]=useState(''),[operation,setOperation]=useState('consume'),[objectId,setObjectId]=useState(''),[lot,setLot]=useState(''),[quantity,setQuantity]=useState(''),[disposition,setDisposition]=useState(''),[preview,setPreview]=useState<any>(),[channel,setChannel]=useState('online'),[domain,setDomain]=useState('production'),[receiptQuery,setReceiptQuery]=useState(''),[receipt,setReceipt]=useState<any>(),[pending,setPending]=useState<{path:string;body:any}>();
 const [product,setProduct]=useState(''),[customer,setCustomer]=useState(''),[due,setDue]=useState('2026-11-02'),[relation,setRelation]=useState(''),[location,setLocation]=useState(''),[expiry,setExpiry]=useState(''),[quality,setQuality]=useState('pending');
 const [supplier,setSupplier]=useState(''),[moq,setMoq]=useState(''),[multiple,setMultiple]=useState('');
 const refresh=async(id=selected)=>{const list=(await api('/workbooks/daily/branches')).filter((b:any)=>b.datasetId===datasetId);setBranches(list);const target=list.find((b:any)=>b.id===id)?.id||list[0]?.id;if(target){setSelected(target);const value=await api('/workbooks/daily/'+target);setDaily(value);}else{setSelected('');setDaily(undefined);}};
 useEffect(()=>{refresh().catch((e:any)=>setError(e.message));},[api,datasetId]); // Existing app request cache is invalidated on every write.
 useEffect(()=>{setPreview(undefined);},[quantity,operation,domain,channel,objectId,lot,product,customer,due,relation,location,expiry,quality,disposition,supplier,moq,multiple,daily?.revision,selected]);
 useEffect(()=>{const id=daily?.candidate?.runId||daily?.adopted?.runId;if(!id||run?.id===id)return;let live=true;api('/workbooks/runs/'+id).then(r=>{if(live)onRun(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[api,daily?.candidate?.runId,daily?.adopted?.runId,run?.id,onRun]);
 const perform=async(fn:()=>Promise<any>)=>{setBusy(true);setError('');try{await fn();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const commit=async(action:string,extra:object={})=>{
  const body={requestId:nonce(),expectedRevision:daily.revision,...extra},path='/workbooks/daily/'+selected+'/'+action;setPending({path,body});
  let result;try{result=await api(path,body);}catch(e:any){if(e.status){setPending(undefined);await refresh();}throw e;}setReceipt(result);setPending(undefined);await refresh();await onRefresh();return result;
 };
 const create=async()=>{
  if(!precision)throw Error('请明确本隔离样例的数量精度');
  const info=await api('/workbooks/datasets/'+datasetId+'/rows?table='+encodeURIComponent('物料主数据')+'&limit=100');
  if(info.total>100)throw Error('超过100物料时请通过已核定的完整物料精度配置创建目标；不可只取第一页');
  const transit=await api('/workbooks/datasets/'+datasetId+'/rows?table='+encodeURIComponent('既有采购在途')+'&limit=1');
  if(transit.total)throw Error('已有在途须明确每条收货库位、质量和效期策略后创建每日目标');
  const b=await api('/workbooks/daily/branches',{id:'day-'+nonce(),scenario:'scenario-'+nonce(),datasetId,isolated:true,startDate:start,endDate:end,dayZero:'2026-10-31',granularity:'day',windowDays:14,policies:{scales:Object.fromEntries(info.rows.map((m:any)=>[m['物料编号'],Number(precision)])),purchaseReceipts:{},transitBasis:'NET_OPEN'}});setSelected(b.id);await refresh(b.id);await onRefresh();
 };
 const makeFact=()=>{
  if(!daily)throw Error('请选择每日目标');
  if(operation!=='purchase-issue'&&(!Number.isFinite(Number(quantity))||quantity===''))throw Error('请填写数量');
  const base={id:objectId,quantity:Number(quantity)},n=Number(quantity);let data:any=base;
  if(operation==='consume')data={taskId:objectId,lotId:lot,cumulative:n};
  if(operation==='output')data={taskId:objectId,lotId:lot,cumulative:n,location,expiresDate:expiry,quality};
  if(operation==='ship')data={demandId:objectId,lotId:lot,cumulative:n};
  if(operation==='stocktake'||operation==='scrap')data={lotId:lot,quantity:n,category:quality,disposition};
  if(operation==='quality')data={lotId:lot,quantity:n,from:quality,disposition};
  if(operation==='demand')data={id:objectId,materialId:product,required:n,customer,dueDate:due};
  if(operation==='purchase-draft'){
   if(!moq||!multiple||!supplier)throw Error('请明确供应商、最小订货量和订货倍数');
   data={id:objectId,materialId:product,quantity:n,moq:Number(moq),multiple:Number(multiple),dueDate:due,relationId:relation,supplierId:supplier,receipt:{location,expiresDate:expiry,quality,disposition}};
  }
  if(operation==='purchase-cancel')data={...base,disposition};
  if(operation==='purchase-delay')data={id:objectId,dueDate:due,disposition};
  if(operation==='receive')data={...base,receiptId:lot};
  return {id:nonce(),type:operation,data,source:{kind:channel==='local-mock'?'EXPLICIT_LOCAL_MOCK':'ONLINE_ENTRY',reference:disposition||objectId},occurredDate:daily.date,knownDate:daily.date,effectiveDate:daily.date};
 };
 const shown=historical||daily,disabled=!canWrite||busy||!!historical||daily?.ended;
 const pendingRun=run&&['queued','running','cancelling'].includes(run.status);
 const currentRun=run?.dailyContext?.branchId===selected&&run.dailyContext.date===daily?.date;
 const plan=async()=>{
  const day=Math.round((Date.parse(daily.date)-Date.parse(daily.dayZero))/86400000);
  const summary=await api('/workbooks/datasets/'+datasetId),selection={startDay:day,currentDay:day,endDay:day+Math.min(daily.windowDays,Math.round((Date.parse(daily.endDate)-Date.parse(daily.date))/86400000)+1)};
  const checked=await api('/workbooks/datasets/'+datasetId+'/readiness',{version:summary.version,parameterScope:'dataset',selection,solver:'basic'});
  if(!checked.ready)throw Error((checked.issues||[]).map((i:any)=>i.message).join('；')||'当前日排程资料未就绪');
  const next=await api('/workbooks/datasets/'+datasetId+'/run',{version:summary.version,currentVersion:true,readinessToken:checked.token,parameterScope:'dataset',selection,solver:'basic'});
  onRun(next);onDate(day);await refresh();await onRefresh();
 };
 return <section className="daily-workspace" aria-label="每日业务总览">
  <div className="daily-toolbar"><b>每日总览</b><select aria-label="场景与分支" value={selected} onChange={e=>perform(async()=>{setHistorical(undefined);setSelected(e.target.value);await refresh(e.target.value);})}><option value="">未选择每日目标</option>{branches.map(b=><option key={b.id} value={b.id}>{b.scenario} / {b.id} · {b.date}</option>)}</select>{daily&&<><span>{shown.date} · {daily.granularity==='minute'?'分钟':'日'} · {historical?'历史只读':daily.ended?'本期已结束':'当前日'}</span><button disabled={disabled} onClick={()=>perform(async()=>{await commit('close',{noExecutionReason:disposition});setHistorical(undefined);})}>日结并推进下一日</button><button onClick={()=>perform(async()=>{await refresh();setHistorical(undefined);onDate(Math.round((Date.parse(daily.date)-Date.parse('2026-10-31'))/86400000));})}>定位本日排程</button></>}<button aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'收起':'展开'}</button></div>
  {(error||pending)&&<p role="alert">{error}{pending&&<> · 操作回执尚待核对：{pending.body.requestId}<button onClick={()=>perform(async()=>{const r=await api('/workbooks/daily/'+selected+'/operations/'+pending.body.requestId);setReceipt(r);setPending(undefined);await refresh();})}>查询原请求回执</button></>}</p>}
  {daily&&<div className="daily-confirmations">{domains.map(([key,label])=><span key={key}>{label}：{shown.confirmations?.[key]?'已确认':'待确认'} <button disabled={disabled} onClick={()=>perform(()=>commit('confirm',{domain:key,source:{kind:'ONLINE_CONFIRMATION',reference:disposition||'本日无变化核对'},unchanged:true}))}>确认无变化</button></span>)}{daily.sourceChanged&&<strong>原输入已修订，须重确认</strong>}</div>}
  {daily&&<div className="daily-toolbar"><button disabled={disabled||pendingRun||!daily.ready||daily.sourceChanged} onClick={()=>perform(plan)}>生成本日基础计划</button><span>基础引擎 · CP不可用时不自动回退</span>{currentRun&&<><span>本日运行：{run.status} · {run.id}</span>{['save','adopt','discard'].map((action,i)=><button key={action} disabled={disabled||pendingRun||!run.result} onClick={()=>perform(()=>commit('plan',{runId:run.id,action}))}>{['保存本日候选','采用本日计划','放弃本日候选'][i]}</button>)}</>}{historical&&<button onClick={()=>perform(async()=>{setHistorical(undefined);await refresh();})}>返回当前日</button>}</div>}
  {expanded&&!daily&&<div className="daily-form"><span>建立显式隔离日量样例</span><label>开始<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>结束<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>数量精度<select value={precision} onChange={e=>setPrecision(e.target.value)}><option value="">请选择</option><option value="1">整数</option><option value="1000">三位小数（仅本隔离样例）</option></select></label><button disabled={!canWrite||busy} onClick={()=>perform(create)}>建立隔离目标</button></div>}
  {expanded&&daily&&<>
   <nav className="daily-toolbar">{[['business','需求 / 库存 / 生产 / 补货'],['workflow','排程'],['mps','报表'],['urgent','插单'],['scenario','比较'],['import','Excel原格式导入']].map(([page,label])=><button key={page} onClick={()=>onModule(page)}>{label}</button>)}</nav>
   <h3>每日实际日报 · {shown.date}</h3>
   <table aria-label="每日实际收发存"><thead><tr>{['物料','单位','固定期初','实际入','实际出','实物余额','可用','有效在途','条件建议','差额'].map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{(shown.balances||[]).map((r:any)=><tr key={r.materialId}>{['materialId','unit','opening','actualIn','actualOut','physical','available','transit','conditional','difference'].map(k=><td key={k}>{r[k]??'未知'}</td>)}</tr>)}</tbody></table>
   <div className="daily-domains" aria-label="每日六域上下文">{[['需求',shown.state.demands],['库存',shown.state.lots],['生产',shown.state.tasks],['补货',shown.state.purchases],['资源',shown.state.resources],['日结历史',daily.history]].map(([label,records]:any)=><details key={label}><summary>{label} · {records.length}项</summary><pre>{JSON.stringify(records,null,2)}</pre></details>)}</div>
   {!historical&&<details><summary>本日输入、实际反馈与补货</summary><div className="daily-form"><label>领域<select value={domain} onChange={e=>setDomain(e.target.value)}>{domains.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label><label>来源<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="online">在线仿真</option><option value="local-mock">明确接口 mock</option></select></label><label>操作<select value={operation} onChange={e=>{const op=e.target.value;setOperation(op);setDomain(['demand','ship'].includes(op)?'demand':['stocktake','quality','scrap'].includes(op)?'inventory':['consume','output'].includes(op)?'production':'replenishment');}}>{[['consume','累计耗料'],['output','累计合格产出'],['ship','累计发货'],['stocktake','盘点实物'],['quality','质量放行'],['scrap','实物报废'],['demand','新增需求'],['purchase-draft','采购草稿'],['purchase-issue','采购生效'],['receive','部分收货'],['purchase-cancel','取消未收'],['purchase-delay','延期']].map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
    {[[objectId,setObjectId,'作业 / 需求 / 采购编号'],[lot,setLot,'库存批次 / 实物回执编号'],[product,setProduct,'物料编号'],[customer,setCustomer,'客户编号'],[relation,setRelation,'供货关系编号'],[supplier,setSupplier,'供应商编号'],[location,setLocation,'库位编号'],[moq,setMoq,'最小订货量'],[multiple,setMultiple,'订货倍数']] .map(([v,set,label]:any)=><label key={label}>{label}<input value={v} onChange={e=>set(e.target.value)}/></label>)}<label>数量<input type="number" step="any" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label>交货日期<input type="date" value={due} onChange={e=>setDue(e.target.value)}/></label><label>到期日期<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label><label>质量类别<select value={quality} onChange={e=>setQuality(e.target.value)}><option value="pending">待检</option><option value="qualified">合格</option><option value="frozen">冻结</option></select></label><label>来源 / 处置 / 未执行原因<input value={disposition} onChange={e=>setDisposition(e.target.value)}/></label><button disabled={disabled} onClick={()=>perform(async()=>setPreview(await api('/workbooks/daily/'+selected+'/preview',{domain,channel,facts:[makeFact()]})))}>预览校验</button>{preview&&<><span>预览通过 · {preview.facts.length}项</span><button disabled={disabled} onClick={()=>perform(async()=>{await commit('accept',{previewId:preview.id});setPreview(undefined);})}>接纳本次输入</button></>}</div>
    <table><thead><tr><th>稳定作业</th><th>原任务</th><th>物料</th><th>累计产出</th></tr></thead><tbody>{daily.state.tasks.map((t:any)=><tr key={t.id}><td>{t.id}</td><td>{t.sourceTaskId}</td><td>{t.materialId}</td><td>{t.output}</td></tr>)}</tbody></table>
   </details>}
   <div className="daily-form"><label>已结日<select value={historyDay} onChange={e=>setHistoryDay(e.target.value)}><option value="">请选择</option>{daily.history.map((h:any)=><option key={h.date}>{h.date}</option>)}</select></label><button onClick={()=>perform(async()=>setHistorical(await api('/workbooks/daily/'+selected+'/history/'+historyDay)))}>查询历史</button><label>请求编号<input value={receiptQuery} onChange={e=>setReceiptQuery(e.target.value)}/></label><button onClick={()=>perform(async()=>setReceipt(await api('/workbooks/daily/'+selected+'/operations/'+receiptQuery)))}>查询持久回执</button></div>
   <details><summary>冻结来源与最近回执</summary><pre>{JSON.stringify({date:shown.date,sourceToken:shown.sourceToken,sourceRef:shown.sourceRef,parent:shown.parent,adopted:shown.adopted,receipt,history:historical?.state},null,2)}</pre></details>
  </>}
 </section>;
}
