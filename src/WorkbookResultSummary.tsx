import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {buildResultSummary,filterResultGroups,resultCategories,resultGroupsForScope,type ResultRecordScope,type ResultGroup} from './WorkbookResultSummaryModel';
import {workbookDate} from './lib/workbook-dates';
import {workbookCheckLabel} from './lib/workbook-run-status.mjs';
import './WorkbookResultSummary.css';
import {WorkbookFindingExplanation} from './WorkbookFindingExplanation';

const number=(value:number)=>value.toLocaleString('zh-CN',{maximumFractionDigits:3});
export function WorkbookResultSummary({run,onLocate,actions,sourceLink}:{run:any;onLocate:(source:any)=>void;actions?:React.ReactNode;sourceLink?:React.ReactNode}){
 const model=useMemo(()=>buildResultSummary(run),[run]),p=run.result||{},conditions=p.conditions||run.selection||{},origin=p.dayZero||run.provenance?.dayZero;
 const identity=JSON.stringify([run.id,run.inputHash,run.resultHash]),[analysis,setAnalysis]=useState<{identity:string;scope:ResultRecordScope}>();
 const range=[workbookDate(conditions.startDay,origin),typeof conditions.endDay==='number'?workbookDate(conditions.endDay-1,origin):''].filter(Boolean).join(' 至 ');
 return <section className="workbook-result-summary" aria-label="排程结果汇总">
  <header className="result-summary-heading"><h2>排程结果汇总 · {model.headline}</h2><span>{range||'排程日期未记录'}</span><span className="result-check-status">独立检查{model.checkFailed?'存在问题':workbookCheckLabel(p.verification?.status)}</span><div className="result-summary-actions">{actions}</div></header>
  <div className="result-metrics">
   <div><span>需求 / 已排 / 未排</span><b>{model.demands.length} / {model.scheduled} / {model.unplanned} 条</b></div>
   <div><span>数量：总量 / 已排 / 未排</span>{model.quantities.length?model.quantities.map(q=><b key={q.unit}>{q.known?`${q.unknown?'已知数量 ':''}${number(q.total)} / ${number(q.scheduled)} / ${number(q.unplanned)} ${q.unit}`:'数量未提供'}{q.unknown>0?`（${q.unknown} 条数量未提供）`:''}</b>):<b>未提供</b>}</div>
   <div><span>有限占用任务 / 预计迟交需求</span><b>{(p.tasks||[]).length} 个 / {model.late} 条</b></div>
   <div><span>计算问题记录 / 缺料记录</span><b><button className="result-metric-link" aria-label={`计算问题记录 ${model.findingCount} 条，查看明细`} aria-haspopup="dialog" onClick={()=>setAnalysis({identity,scope:'findings'})}>{model.findingCount}</button> / <button className="result-metric-link" aria-label={`缺料记录 ${model.shortageCount} 条，查看明细`} aria-haspopup="dialog" onClick={()=>setAnalysis({identity,scope:'shortages'})}>{model.shortageCount}</button> 条</b></div>
  </div>
  {analysis?.identity===identity&&<ResultAnalysisDialog key={identity} run={run} model={model} initialScope={analysis.scope} onClose={()=>setAnalysis(undefined)} onLocate={onLocate} sourceLink={sourceLink}/>}
 </section>;
}
function IssueGroup({group,origin,onLocate}:{group:ResultGroup;origin:string;onLocate:(source:any)=>void}){
 const [page,setPage]=useState(0),size=20,count=group.entries.length,pages=Math.ceil(count/size),safePage=Math.min(page,Math.max(0,pages-1));
 return <tr><td><span className={'result-kind '+(group.kind==='计算记录'?'result-process':'result-problem')}>{group.kind}</span><b>{group.title}</b><span>{resultCategories[group.category]} · {count} 条记录 / {group.affected} 条需求</span></td>
  <td><p>{group.logic}</p><details><summary>查看记录与来源（{count}）</summary>
   <div className="result-occurrences"><table><thead><tr><th>需求 / 物料</th><th>最终状态 / 预计到货</th><th>原记录 / 来源</th></tr></thead><tbody>{group.entries.slice(safePage*size,(safePage+1)*size).map((e,i)=><tr key={safePage*size+i}>
    <td>{e.need||'未关联需求'}{(e.productId||e.demand?.productId)&&<span>{e.productId||e.demand?.productId}</span>}</td>
    <td>{e.demand?(e.demand.status==='scheduled'?'已排':e.demand.status==='unplanned'?'未排':'状态未识别'):'无对应需求结果'}<span>{workbookDate(e.demand?.arrivalDay,origin)||'到货未记录'}</span></td>
    <td><p>{e.detail}</p>{e.explanation&&<WorkbookFindingExplanation explanation={e.explanation}/ >}{e.source?.sheet&&<button onClick={()=>onLocate(e.source.message?e.source:{...e.source,message:e.detail})} title="打开来源维护入口；冻结结果保持不变">定位来源：{e.source.sheet}{e.source.row?` · 第${e.source.row}行`:''}{e.source.field?` · ${e.source.field}`:''}</button>}</td>
   </tr>)}</tbody></table></div>
   {pages>1&&<div className="result-pager"><span>{safePage*size+1}–{Math.min((safePage+1)*size,count)} / {count} 条</span><button disabled={safePage===0} onClick={()=>setPage(safePage-1)}>上一页</button><button disabled={safePage+1>=pages} onClick={()=>setPage(safePage+1)}>下一页</button></div>}
  </details></td><td>{group.action}</td></tr>;
}
export function ResultAnalysisDialog({run,model,initialScope,onClose,onLocate,sourceLink}:{run:any;model:ReturnType<typeof buildResultSummary>;initialScope:ResultRecordScope;onClose:()=>void;onLocate:(source:any)=>void;sourceLink?:React.ReactNode}){
 const p=run.result||{},conditions=p.conditions||run.selection||{},origin=p.dayZero||run.provenance?.dayZero;
 const [category,setCategory]=useState('all'),[kind,setKind]=useState('all'),[query,setQuery]=useState(''),[page,setPage]=useState(0);
 const [scope,setScope]=useState(initialScope);
 const base=resultGroupsForScope(model.groups,scope),total=base.reduce((n,g)=>n+g.entries.length,0),matched=filterResultGroups(base,category,kind,query),matchedTotal=matched.reduce((n,g)=>n+g.entries.length,0);
 const scopes:[ResultRecordScope,string][]=[['findings','计算问题记录'],['shortages','缺料记录'],['outcomes','需求结果异常'],['verification','独立检查问题'],['all','全部分析记录']];
 function chooseScope(value:ResultRecordScope){setScope(value);setCategory('all');setKind('all');setQuery('');setPage(0);}
 const close=useRef<HTMLButtonElement>(null),title=useId();
 useEffect(()=>{const previous=document.activeElement as HTMLElement;close.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 function locate(source:any){onClose();onLocate(source);}
 const size=10,pages=Math.max(1,Math.ceil(matched.length/size)),safePage=Math.min(page,pages-1);
 const range=[workbookDate(conditions.startDay,origin),typeof conditions.endDay==='number'?workbookDate(conditions.endDay-1,origin):''].filter(Boolean).join(' 至 ');
 return <div className="result-dialog-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section className="workbook-result-summary result-analysis-dialog" role="dialog" aria-modal="true" aria-labelledby={title} data-record-scope={scope} data-record-total={total} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Tab'){const elements=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,summary,a[href]')).filter(el=>el.tabIndex>=0&&el.getClientRects().length>0);const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
  <header className="result-summary-heading"><h2 id={title}>{scopes.find(s=>s[0]===scope)?.[1]} · {total} 条</h2><span>{range}</span><button ref={close} onClick={onClose} aria-label="关闭结果指标明细">关闭</button></header>
  <div className="result-analysis-body">
  <nav className="result-record-scopes" aria-label="分析记录范围">{scopes.map(([key,label])=><button key={key} aria-pressed={scope===key} onClick={()=>chooseScope(key)}>{label} <b>{resultGroupsForScope(model.groups,key).reduce((n,g)=>n+g.entries.length,0)}</b></button>)}</nav>
  <p className="result-scope-meaning">{scope==='findings'?'逐条展示计算过程记录；同一需求可能有多条记录，含在制等未关联需求的记录。':scope==='shortages'?'逐条展示缺料记录；不同需求、物料和需料时点分别统计，数量按原单位保留。':scope==='outcomes'?'展示最终未排需求与已排但预计迟交需求；与计算问题、缺料记录分开统计。':scope==='verification'?'展示独立检查的问题记录；具体检查范围见计算说明。':'合并展示需求结果异常、计算问题、缺料及检查问题；总条数不是未排需求数量。'}</p>
  <details className="result-basis"><summary>计算口径、检查范围与来源</summary>
   <dl><dt>结果与记录</dt><dd>已排、未排和迟交按最终需求结果统计；任务数为工序任务数。同一需求可有多条计算记录，各类记录与受影响需求存在重叠，不能相加作为错误批次数。未关联需求的在制等记录不计入受影响需求数。</dd>
    <dt>需求与供给</dt><dd>按冻结输入的BOM、供给质量、放行/到期和余额分配物料。采购在途、在制续作、采用的模拟草稿属于条件供给；采购参考建议不会自动成为供给。缺料按记录的需求、物料及需料日期核对，不同单位分别显示。</dd>
    <dt>资源与时间</dt><dd>按工艺顺序，在设备、班组、工装、批量、日产能、工厂日历及可知停机约束内安排候选；不满足时撤销相关候选。{p.timeUnit==='minute'?'本运行以整数分钟计算，页面日期/时刻来自冻结时间原点。':'本运行为历史日口径，按冻结日模型展示。'}窗口包含开始日期、不包含结束边界；上方结束日期为最后包含日。</dd>
    <dt>独立检查范围</dt><dd>{p.verification?.scope?.join('；')||'本运行未保存检查范围'}。{p.verification?.notChecked?.length?`明确未检查：${p.verification.notChecked.join('；')}。`:''}检查通过仅表示已记录范围的复核通过，不代表需求全部排入、准时交付或真实业务验收通过。</dd>
    <dt>问题数值依据</dt><dd>原记录未保存的候选实际等待时长、约束上限或可用容量，页面不推算。请定位来源核对冻结时适用配置；当前维护页可能已有新修改，不能直接当作本运行的冻结值。</dd>
    <dt>运行与来源</dt><dd>运行 {run.id} · {run.status} · 数据集 {run.datasetId} / v{run.version} · 所选需求 {conditions.demandIds?.join('、')||'窗口内全部需求'}。结果已持久化；修改输入后需创建新运行，历史结果保持不变。{run.failure&&`失败说明：${run.failure}`}</dd>
    <dt>冻结指纹</dt><dd>输入 {run.inputHash||'未记录'} · 文件 {p.source?.fileHash||run.provenance?.fileHash||'未记录'} · 参数 {p.source?.parameterHash||'未记录'} · 映射 {p.source?.mappingHash||'未记录'}。{sourceLink}</dd>
   </dl>
  </details>
  <div className="result-categories" aria-label="问题分类"><button className={category==='all'?'chosen':''} onClick={()=>{setCategory('all');setPage(0);}}>全部记录 <b>{total}</b></button>{Object.entries(resultCategories).map(([id,label])=><button key={id} className={category===id?'chosen':''} onClick={()=>{setCategory(id);setPage(0);}}>{label} <b>{base.filter(g=>g.category===id).reduce((n,g)=>n+g.entries.length,0)}</b><span>条记录</span></button>)}</div>
  <div className="result-summary-filters"><label>类型 <select value={kind} onChange={e=>{setKind(e.target.value);setPage(0);}}><option value="all">全部类型</option>{['结果异常','计算记录','检查问题'].map(k=><option key={k}>{k}</option>)}</select></label><label>查找 <input value={query} placeholder="需求、物料或问题" onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><span>筛选后 {matchedTotal} / {total} 条 · 同类合并 {matched.length} 项</span>{pages>1&&<div className="result-pager"><button disabled={!safePage} onClick={()=>setPage(safePage-1)}>上一页</button><span>{safePage+1} / {pages}</span><button disabled={safePage+1>=pages} onClick={()=>setPage(safePage+1)}>下一页</button></div>}</div>
  {matched.length?<div className="result-groups"><table><thead><tr><th>问题 / 影响范围</th><th>业务说明与计算依据</th><th>完善位置与处理建议</th></tr></thead><tbody>{matched.slice(safePage*size,(safePage+1)*size).map(g=><IssueGroup key={g.id+run.id} group={g} origin={origin} onLocate={locate}/>)}</tbody></table></div>:<p className="result-empty">{base.length?'当前筛选没有匹配记录。':'当前指标没有对应记录。'}</p>}
 </div><footer><span>{total} 条分析记录 · 当前筛选 {matchedTotal} 条</span><button onClick={onClose}>关闭</button></footer></section></div>;
}
