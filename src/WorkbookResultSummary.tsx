import {useMemo,useState} from 'react';
import {buildResultSummary,filterResultGroups,resultCategories,type ResultGroup} from './WorkbookResultSummaryModel';
import {workbookDate} from './lib/workbook-dates';
import {workbookCheckLabel} from './lib/workbook-run-status.mjs';
import './WorkbookResultSummary.css';
import {WorkbookFindingExplanation} from './WorkbookFindingExplanation';

const number=(value:number)=>value.toLocaleString('zh-CN',{maximumFractionDigits:3});
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
export function WorkbookResultSummary({run,onLocate,actions,sourceLink}:{run:any;onLocate:(source:any)=>void;actions?:React.ReactNode;sourceLink?:React.ReactNode}){
 const model=useMemo(()=>buildResultSummary(run),[run]),p=run.result||{},conditions=p.conditions||run.selection||{},origin=p.dayZero||run.provenance?.dayZero;
 const [category,setCategory]=useState('all'),[kind,setKind]=useState('all'),[query,setQuery]=useState(''),[page,setPage]=useState(0);
 const matched=filterResultGroups(model.groups,category,kind,query);
 const size=10,pages=Math.max(1,Math.ceil(matched.length/size)),safePage=Math.min(page,pages-1);
 const range=[workbookDate(conditions.startDay,origin),typeof conditions.endDay==='number'?workbookDate(conditions.endDay-1,origin):''].filter(Boolean).join(' 至 ');
 return <section className="workbook-result-summary" aria-label="排程结果汇总">
  <header className="result-summary-heading"><h2>排程结果汇总 · {model.headline}</h2><span>{range||'排程日期未记录'}</span><div className="result-summary-actions">{actions}</div></header>
  <p className="result-conclusion">共 {model.demands.length} 条需求，已排 {model.scheduled} 条、未排 {model.unplanned} 条、已排中预计迟交 {model.late} 条{model.unknownStatus>0?`、状态待核对 ${model.unknownStatus} 条`:''}；独立检查{model.checkFailed?'存在问题':workbookCheckLabel(p.verification?.status)}。{(model.findingCount>0||model.shortageCount>0)&&'下方计算记录用于解释过程，不能直接当作最终未排数量。'}</p>
  <div className="result-metrics">
   <div><span>需求 / 已排 / 未排</span><b>{model.demands.length} / {model.scheduled} / {model.unplanned} 条</b></div>
   <div><span>数量：总量 / 已排 / 未排</span>{model.quantities.length?model.quantities.map(q=><b key={q.unit}>{q.known?`${q.unknown?'已知数量 ':''}${number(q.total)} / ${number(q.scheduled)} / ${number(q.unplanned)} ${q.unit}`:'数量未提供'}{q.unknown>0?`（${q.unknown} 条数量未提供）`:''}</b>):<b>未提供</b>}</div>
   <div><span>有限占用任务 / 预计迟交需求</span><b>{(p.tasks||[]).length} 个 / {model.late} 条</b></div>
   <div><span>计算问题记录 / 缺料记录</span><b>{model.findingCount} / {model.shortageCount} 条</b></div>
  </div>
  <details className="result-basis"><summary>计算口径、检查范围与冻结来源</summary>
   <dl><dt>结果与记录</dt><dd>已排、未排和迟交按最终需求结果统计；任务数为工序任务数。同一需求可有多条计算记录，各类记录与受影响需求存在重叠，不能相加作为错误批次数。未关联需求的在制等记录不计入受影响需求数。</dd>
    <dt>需求与供给</dt><dd>按冻结输入的BOM、供给质量、放行/到期和余额分配物料。采购在途、在制续作、采用的模拟草稿属于条件供给；采购参考建议不会自动成为供给。缺料按记录的需求、物料及需料日期核对，不同单位分别显示。</dd>
    <dt>资源与时间</dt><dd>按工艺顺序，在设备、班组、工装、批量、日产能、工厂日历及可知停机约束内安排候选；不满足时撤销相关候选。{p.timeUnit==='minute'?'本运行以整数分钟计算，页面日期/时刻来自冻结时间原点。':'本运行为历史日口径，按冻结日模型展示。'}窗口包含开始日期、不包含结束边界；上方结束日期为最后包含日。</dd>
    <dt>独立检查范围</dt><dd>{p.verification?.scope?.join('；')||'本运行未保存检查范围'}。{p.verification?.notChecked?.length?`明确未检查：${p.verification.notChecked.join('；')}。`:''}检查通过仅表示已记录范围的复核通过，不代表需求全部排入、准时交付或真实业务验收通过。</dd>
    <dt>问题数值依据</dt><dd>原记录未保存的候选实际等待时长、约束上限或可用容量，页面不推算。请定位来源核对冻结时适用配置；当前维护页可能已有新修改，不能直接当作本运行的冻结值。</dd>
    <dt>运行与来源</dt><dd>运行 {run.id} · {run.status} · 数据集 {run.datasetId} / v{run.version} · 所选需求 {conditions.demandIds?.join('、')||'窗口内全部需求'}。结果已持久化；修改输入后需创建新运行，历史结果保持不变。{run.failure&&`失败说明：${run.failure}`}</dd>
    <dt>冻结指纹</dt><dd>输入 {run.inputHash||'未记录'} · 文件 {p.source?.fileHash||run.provenance?.fileHash||'未记录'} · 参数 {p.source?.parameterHash||'未记录'} · 映射 {p.source?.mappingHash||'未记录'}。{sourceLink}</dd>
   </dl>
  </details>
  <div className="result-categories" aria-label="问题分类"><button className={category==='all'?'chosen':''} onClick={()=>{setCategory('all');setPage(0);}}>全部记录 <b>{model.groups.reduce((n,g)=>n+g.entries.length,0)}</b></button>{Object.entries(resultCategories).map(([id,label])=><button key={id} className={category===id?'chosen':''} onClick={()=>{setCategory(id);setPage(0);}}>{label} <b>{model.counts[id]}</b><span>条记录</span></button>)}</div>
  <div className="result-summary-filters"><label>类型 <select value={kind} onChange={e=>{setKind(e.target.value);setPage(0);}}><option value="all">全部类型</option>{['结果异常','计算记录','检查问题'].map(k=><option key={k}>{k}</option>)}</select></label><label>查找 <input value={query} placeholder="需求、物料或问题" onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><span>同类合并 {matched.length} 项 · 展开查看全部来源</span>{pages>1&&<div className="result-pager"><button disabled={!safePage} onClick={()=>setPage(safePage-1)}>上一页</button><span>{safePage+1} / {pages}</span><button disabled={safePage+1>=pages} onClick={()=>setPage(safePage+1)}>下一页</button></div>}</div>
  {matched.length?<div className="result-groups"><table><thead><tr><th>问题 / 影响范围</th><th>业务说明与计算依据</th><th>完善位置与处理建议</th></tr></thead><tbody>{matched.slice(safePage*size,(safePage+1)*size).map(g=><IssueGroup key={g.id+run.id} group={g} origin={origin} onLocate={onLocate}/>)}</tbody></table></div>:<p className="result-empty">{model.groups.length?'当前筛选没有匹配记录。':'本运行未记录结果异常或计算问题；检查结论以已保存的独立检查状态与范围为准。'}</p>}
 </section>;
}
