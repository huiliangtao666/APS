import {useEffect,useRef,useState} from 'react';
const kinds=[['orders','订单计划'],['tasks','任务计划'],['occupation','资源占用'],['materials','物料需求'],['unplanned','未排原因'],['differences','方案差异']];
const show=(value:any)=>value==null?'未知':String(value);
// Summaries only label saved values; no aggregation, rounding or date conversion.
function summary(raw:string){
 const r=JSON.parse(raw),v=r.record||{},a=r.assessment||{};
 if(r.inputRecord){const o=r.inputRecord;return `订单 ${o['订单编号']} · 需求 ${show(o['合格需求'])} ${o['数量单位']||'单位未知'} · 要求可交付分钟 ${show(o['要求可交付分钟'])} · ${o['订单状态']||'状态未知'}；交付评估 ${a.expectedDeliverableMinute==null?'未知':a.expectedDeliverableMinute+' 分钟'}`;}
 if(v['任务编号'])return `任务 ${v['任务编号']} · 订单 ${v['订单编号']} · ${show(a.quantity)} ${a.unit||'单位未知'} · ${r.startAt} — ${r.endAt} · 设备 ${v['设备编号']||'未知'}`;
 if(r.category==='设备')return `设备 ${v.id} · 计划忙时 ${show(v.busyMinutes)} 分钟 · 未分配 ${show(v.unallocatedMinutes)} 分钟 · 实时可用未知`;
 if(r.category==='资源')return `${v.type} ${v.id} · 计划峰值 ${show(v.peak?.value)} ${v.unit} · 数量×分钟 ${show(v.quantityMinutes?.value)} · 动态剩余未知`;
 if(r.category==='物料需求')return `物料 ${v.materialId} · 需求 ${show(v.quantity)} ${v.unit||'单位未知'} · 分配 ${show(v.allocated?.value)} · 缺口 ${show(v.shortage)} · 投料分钟 ${show(v.feedMinute)} · ${v.committed?'计划分配已提交（非真实耗料）':'候选 / 未提交'} · ${v.blockedReason||v.suggestion||'条件以保存记录为准'}`;
 if(r.category==='未排原因')return `任务 ${v.id} · 订单 ${v.orderId} · ${show(v.quantity)} ${v.unit||'单位未知'} · ${(v.reasons||[]).map((x:any)=>x.message).join('；')||'未保存具体原因 / 未知'}`;
 if(r.category==='交期影响')return `订单 ${v.orderId} · 可交付变化 ${show(v.deliverableDeltaMinutes)} 分钟 · 延后变化 ${show(v.delayDeltaMinutes)} 分钟；仅条件模拟，不承诺真实交付`;
 return `${r.category==='输入条件'?'输入条件变化':'保存方案差异'} · ${v.id||v.recordKey||v.status||'请查看记录'} · 数量、单位、前后时间与可比性见保存依据`;
}
export function ReportPanel({plans,api,onExport}:{plans:any[];api:(path:string)=>Promise<any>;onExport?: (target:object,name:string)=>void}){
 const [planId,setPlan]=useState(''),[kind,setKind]=useState('orders'),[otherPlanId,setOther]=useState(''),[text,setText]=useState(''),[order,setOrder]=useState(''),[start,setStart]=useState('0'),[end,setEnd]=useState('120');
 const [report,setReport]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);const generation=useRef(0);
 const query={planId,kind,...(kind==='differences'?{otherPlanId}:{}),text,order,start:Number(start),end:Number(end)};
 const signature=JSON.stringify(query),valid=!!planId&&start.trim()!==''&&end.trim()!==''&&Number.isFinite(Number(start))&&Number.isFinite(Number(end))&&Number(end)>Number(start)&&(kind!=='differences'||!!otherPlanId);
 useEffect(()=>{generation.current++;setReport(null);setError('');setLoading(false);},[signature]);
 async function read(){const g=++generation.current;setLoading(true);setError('');setReport(null);try{const r=await api('/reports?query='+encodeURIComponent(signature));if(g===generation.current)setReport(r);}catch(e){if(g===generation.current)setError(e instanceof Error?e.message:'查询失败');}finally{if(g===generation.current)setLoading(false);}}
 return <section className="panel" aria-label="查询报表与文件导出"><h2>查询报表与文件导出 · FR035</h2><p>选择保存方案和当前筛选后查询。导出只包含当前显示的记录和同一视图标识；需具备权限并填写上方操作原因。当前执行事实请到执行事实页核对。物料、订单、未排和差异为整份方案，任务和资源按窗口。</p>
 <label>报表方案<select aria-label="报表方案" value={planId} onChange={e=>setPlan(e.target.value)}><option value="">请选择</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select></label>
 <label>报表类别<select aria-label="报表类别" value={kind} onChange={e=>setKind(e.target.value)}>{kinds.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 {kind==='differences'&&<label>对比方案<select aria-label="对比方案" value={otherPlanId} onChange={e=>setOther(e.target.value)}><option value="">请选择</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select></label>}
 <label>报表订单<input aria-label="报表订单" value={order} onChange={e=>setOrder(e.target.value)}/></label><label>报表搜索<input aria-label="报表搜索" value={text} onChange={e=>setText(e.target.value)}/></label>
 <label>报表开始分钟<input aria-label="报表开始分钟" type="number" value={start} onChange={e=>setStart(e.target.value)}/></label><label>报表结束分钟<input aria-label="报表结束分钟" type="number" value={end} onChange={e=>setEnd(e.target.value)}/></label>
 <button disabled={!valid||loading} onClick={read}>查询当前报表</button><button disabled={!report||report.query&&JSON.stringify(report.query)!==signature||!onExport||loading} onClick={()=>report&&onExport?.({report:report.query,viewId:report.viewId},'FR035-'+kind+'.csv')}>导出当前报表 CSV</button>
 {!valid&&<p role="status">请选择方案；窗口需为有效分钟且结束大于开始；差异查询需选择对比方案。</p>}{error&&<p role="alert">查询失败：{({historical_inputs_unavailable:'历史输入缺失或损坏，无法生成报表',protected_history_unavailable:'已确认快照校验失败',plan_not_found:'方案不存在',invalid_report_query:'查询条件无效'} as Record<string,string>)[error]||error}</p>}
 {report&&<><p role="status">当前报表 {report.rows.length} 行 · 视图 {report.viewId}</p><p style={{overflowWrap:'anywhere'}}>产线 {report.provenance.lines?.join('、')||'未知'} · 方案 {report.provenance.planId} · 保存日期 {report.provenance.createdAt||'未知'} · UTC+08:00 · 模拟数据，非当前执行事实。</p><details><summary>产线、方案、输入版本、日期和模拟说明</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(report.provenance,null,2)}</pre></details><p>{report.limits.join('；')}</p>{report.comparison&&<details><summary>方案差异的条件与可比性</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(report.comparison,null,2)}</pre></details>}
 <div className="table-wrap" tabIndex={0} aria-label="报表结果，可横向滚动"><table data-fr035-view={report.viewId}><thead><tr>{report.columns.map((c:string)=><th key={c}>{c}</th>)}</tr></thead><tbody>{report.rows.map((row:string[],i:number)=><tr key={i}>{row.map((c,j)=><td key={j} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxWidth:900}}>{j===1?<><p>{summary(c)}</p><details><summary>查看保存记录、精确数量与溯源</summary><pre data-fr035-cell style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{c}</pre></details></>:c}</td>)}</tr>)}</tbody></table></div>{!report.rows.length&&<p>当前筛选没有记录；不代表资源充足或完整业务检查通过。</p>}</>}
 </section>;
}
