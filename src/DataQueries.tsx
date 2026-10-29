import {useEffect,useMemo,useRef,useState} from 'react';
import {recordIdentity} from './lib/record-identity.mjs';
import {fieldLabel} from './StructuredValue';
import {defs} from './data-defs';
import {queryData,taskDef,filterOptions,filterRows,related,displayValue,type Filters,type Row} from './lib/data-query.mjs';
type Query={table:string;planId:string;filters:Filters;revision:number;sourcePlanId?:string};
type Props={data:Record<string,Row[]>;plans:any[];revision:number;canExport:boolean;reason:string;onExport:(q:Query)=>void;onTask:(plan:string,task:string)=>void;initialHistorical?:boolean;initialRow?:Row;initialTable?:string;initialPlan?:string;initialTask?:string;onRestore?:(tables:Record<string,Row[]>)=>void};
export function DataQueries({data,plans,revision,canExport,reason,onExport,onTask,initialPlan,initialTask,initialHistorical,onRestore,initialTable,initialRow}:Props){
 const detailHeading=useRef<HTMLHeadingElement>(null);
 const initialSourceHistorical=initialHistorical??!!initialTable;
 const categories=[...defs,taskDef];
 const [table,setTable]=useState(initialTable|| (initialTask?'tasks':'orders'));
 const [planId,setPlan]=useState(initialPlan||plans[0]?.id||'');
 const [historical,setHistorical]=useState(initialSourceHistorical);
 const [filters,setFilters]=useState<Filters>({});
 const [focus,setFocus]=useState<number|null>(()=>initialRow&&initialTable?(()=>{const i=((initialSourceHistorical?plans.find(p=>p.id===initialPlan)?.inputSnapshot:data)?.[initialTable]||[]).findIndex((row:Row)=>Object.entries(initialRow).every(([key,value])=>row[key]===value));return i<0?null:i;})():initialTask?Math.max(0,(plans.find(p=>p.id===initialPlan)?.tasks||[]).findIndex((t:any)=>t.id===initialTask)):null);
 const [page,setPage]=useState(0);
 const selectedPlan=plans.find(p=>p.id===planId);
 const inputData:Record<string,Row[]>=historical?(selectedPlan?.inputSnapshot||{}):data;
 const all=useMemo(()=>queryData(inputData,plans,planId),[inputData,plans,planId]);
 const def=categories.find(d=>d.key===table)!;
 const options=filterOptions(def.fields);
 const rows=filterRows(all,table,filters);
 const row=focus===null?undefined:all[table]?.[focus];
 const links=focus===null?[]:related(all,table,focus);
 useEffect(()=>{if(focus!==null)detailHeading.current?.focus();},[table,focus,historical,planId]);

 const applicableProduct=def.fields.includes('产品编号')||def.fields.includes('订单编号')||def.fields.includes('事实编号');
 const applicableOrder=applicableProduct;
 const change=(patch:Filters)=>{setFilters({...filters,...patch});setFocus(null);setPage(0);};
 function navigate(target:string,index?:number){setTable(target);setFilters({});setFocus(index??null);setPage(index===undefined?0:Math.floor(index/50));}
 return <section className="panel query-panel" aria-label="模拟数据查询">
  <h2>模拟数据查询 · FR-014</h2><p>导入 → 查询 → 计算 → 核对。共 {defs.length} 类当前输入及方案任务；所有数据均为模拟数据。分钟 0 = 2026-11-02 08:00（Asia/Shanghai），时间区间 [开始,结束)。</p>
  <div className="query-controls"><label>数据类别<select aria-label="查询数据类别" value={table} onChange={e=>navigate(e.target.value)}>{categories.map(d=><option key={d.key} value={d.key}>{d.label}（{all[d.key]?.length||0}）</option>)}</select></label>
  <label>关联方案<select aria-label="查询方案" value={planId} onChange={e=>{setPlan(e.target.value);setHistorical(false);setFocus(null);setPage(0);}}><option value="">未选择方案</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name||p.id} · {p.status==='draft'?'草稿':p.status==='legacy'?'历史快照':p.status} · {p.id}</option>)}</select></label></div>
  <p>当前输入版本：{revision}。{selectedPlan?`所选方案输入版本：${selectedPlan.revision??selectedPlan.inputVersion??'旧版未记录'}。`:'尚无所选方案任务。'}{historical?'关联输入来自方案原始快照。':'关联输入显示当前数据，不代表方案计算时的历史输入。'}</p>
  {selectedPlan&&selectedPlan.revision!==revision&&<p role="status">方案为历史快照或输入已变化；任务保留方案原值。请核对版本差异，不能据此宣称当前数据已重新计算。</p>}
  <label><input type="checkbox" checked={historical} disabled={!selectedPlan?.inputSnapshot} onChange={e=>{setHistorical(e.target.checked);setFocus(null);setFilters({});setPage(0);}}/>查看所选方案计算时的输入</label>
  {selectedPlan&&!selectedPlan.inputSnapshot&&<p role="status">该历史方案未记录原始输入，无法恢复；不会用当前数据代替。</p>}
  {selectedPlan?.inputSnapshot&&onRestore&&<button disabled={!reason.trim()} onClick={()=>onRestore(selectedPlan.inputSnapshot)}>恢复该方案输入为新版本</button>}
  {historical&&<p>原始输入版本：{selectedPlan?.inputVersionId}。本视图只读，重算须使用当前输入。</p>}
  <div className="query-controls"><label>关键词<input aria-label="查询关键词" value={filters.text||''} onChange={e=>change({text:e.target.value})}/></label>
  {applicableProduct&&<label>产品<select aria-label="查询产品" value={filters.product||''} onChange={e=>change({product:e.target.value})}><option value="">全部产品</option>{[...new Set([...(inputData.products||[]).map(r=>r['产品编号']),...(all[table]||[]).map(r=>r['产品编号'])].filter(Boolean))].map(id=><option key={id}>{id}</option>)}</select></label>}
  {applicableOrder&&<label>订单<select aria-label="查询订单" value={filters.order||''} onChange={e=>change({order:e.target.value})}><option value="">全部订单</option>{[...new Set([...(inputData.orders||[]).map(r=>r['订单编号']),...(all[table]||[]).map(r=>r['订单编号'])].filter(Boolean))].map(id=><option key={id}>{id}</option>)}</select></label>}
  {options.statusFields.length>0&&<><label>状态字段<select aria-label="查询状态字段" value={filters.statusField||''} onChange={e=>change({statusField:e.target.value,status:''})}><option value="">请选择</option>{options.statusFields.map(f=><option key={f}>{f}</option>)}</select></label><label>状态<select aria-label="查询状态" value={filters.status||''} disabled={!filters.statusField} onChange={e=>change({status:e.target.value})}><option value="">全部状态</option>{[...new Set((all[table]||[]).map(r=>r[filters.statusField||'']).filter(Boolean))].map(v=><option key={v}>{v}</option>)}</select></label></>}
  {options.dateFields.length>0&&<><label>日期 / 分钟字段<select aria-label="查询日期字段" value={filters.dateField||''} onChange={e=>change({dateField:e.target.value,from:'',to:''})}><option value="">请选择</option>{options.dateFields.map(f=><option key={f}>{f}</option>)}</select></label><label>起值（含）<input aria-label="查询起值" disabled={!filters.dateField} placeholder="分钟数或含时区 ISO 日期时间" value={filters.from||''} onChange={e=>change({from:e.target.value})}/></label><label>止值（含）<input aria-label="查询止值" disabled={!filters.dateField} value={filters.to||''} onChange={e=>change({to:e.target.value})}/></label></>}
  <button onClick={()=>{setFilters({});setFocus(null);setPage(0);}}>清除筛选</button><button disabled={!canExport||!reason.trim()||(historical&&!selectedPlan?.inputSnapshot)} onClick={()=>onExport({table,planId,filters,revision,...(historical?{sourcePlanId:planId}:{})})}>导出筛选结果（{rows.length}）</button></div>
  <p>条件同时满足才显示；产品/订单按明确引用匹配。日期字段用 YYYY-MM-DD，时间字段用含时区 ISO 时间，分钟字段用数值；无效范围或缺失日期不匹配。详情保留全部字段。</p>
  <p role="status">{rows.length} / {all[table]?.length||0} 条 · 第 {page+1} 页</p>
  <div className="table-wrap"><table><thead><tr><th>详情</th>{def.fields.filter(f=>f!=='参数JSON').map(f=><th key={f}>{fieldLabel(f)}</th>)}</tr></thead><tbody>{rows.slice(page*50,(page+1)*50).map(({row:r,index})=><tr key={index} className={focus===index?'selected-row':''}><td><button aria-label={`查看第${index+1}条详情`} onClick={()=>setFocus(index)}>查看</button></td>{def.fields.filter(f=>f!=='参数JSON').map(f=><td key={f}>{displayValue(f,r[f])||'—'}</td>)}</tr>)}</tbody></table></div>
  {!rows.length&&<p className="empty">没有匹配记录。可清除筛选或检查是否已导入 / 选择方案；不代表下游能力已经完成。</p>}
  <button disabled={page===0} onClick={()=>setPage(page-1)}>上一页</button><button disabled={(page+1)*50>=rows.length} onClick={()=>setPage(page+1)}>下一页</button>
  {row&&<section aria-label="记录详情"><h3 tabIndex={-1} ref={detailHeading}>{def.label} · {recordIdentity(table,row)} · 第 {focus!+1} 条详情</h3><dl className="query-detail">{def.fields.map(f=><div key={f}><dt>{fieldLabel(f)}</dt><dd>{displayValue(f,row[f])||'未填写'}</dd></div>)}</dl>
  <h3>关联查询（{links.length}）</h3><p>设备是工序候选资源，资源依赖是模拟需求，均不等于实际分配或占用。规则关联表示方案记录了启用该规则，不表示逐任务已检查通过。</p><div className="query-links">{links.map(l=><button key={l.table+':'+l.index} onClick={()=>navigate(l.table,l.index)}>{l.label&&`${l.label} · `}{categories.find(d=>d.key===l.table)?.label} · {Object.values(all[l.table][l.index]).slice(0,3).join(' / ')}</button>)}</div>
  {['skillSubstitutions','personnelGroups'].includes(table)&&<p>技能关联仅定位人员组已声明的对应技能，保留可提供 → 所需方向；不表示反向可替代、人员已匹配或已分配。禁用关系仍可查询声明。</p>}
  {!links.length&&<p>当前记录没有可解析的显式关联。请核对已录入的引用；缺失引用不会推断为已分配或已检查。</p>}
  {['materials','inventory','bom','dependencies'].includes(table)&&<p>物料占用：库存“已占用数量”是模拟汇总；资源依赖和供给引用只表示已录入需求 / 条件。所选方案的模拟分配见下方；它不修改真实库存，不等于实际领料或QA放行。</p>}
  {['materials','inventory','supplies','tasks','executionMaterials'].includes(table)&&<section aria-label="所选方案模拟分配"><h3>所选方案模拟物料分配</h3><p>来源：{selectedPlan?.id||'未选择方案'} · 原始输入 {selectedPlan?.inputVersionId||'未记录'}。分配保留计算时原值，与上方当前输入分开；未提交分配不代表已经占用。</p>{!selectedPlan?.materialChecked?<p>所选方案未进行支持口径的物料检查；不能推断分配结果。</p>:<table><thead><tr><th>任务 / 物料</th><th>需求 / 单位</th><th>批次 / 供给</th><th>分配数量 / 状态</th><th>来源查询</th></tr></thead><tbody>{(selectedPlan.materialDemands||[]).filter((d:any)=>table==='tasks'?d.taskId===row['任务编号']:table==='supplies'?d.allocations?.some((a:any)=>a.supplyId===row['供给编号']):table==='inventory'?d.allocations?.some((a:any)=>a.lotId===row['批次编号']):d.materialId===row['物料编号']).flatMap((d:any)=>(d.allocations?.length?d.allocations:[null]).map((a:any,i:number)=><tr key={d.taskId+':'+d.materialId+':'+i}><td>{d.taskId} / {d.materialId}</td><td>{d.quantity} {d.unit}</td><td>{a?.lotId||'未分配'} / {a?.supplyId||'库存'}</td><td>{a?.quantity??0} · {a?.conditional?'条件性预计供给':d.committed?'方案模拟占用':'候选未占用'} · 缺口 {d.shortage}</td><td><button onClick={()=>navigate('tasks',(all.tasks||[]).findIndex(t=>t['任务编号']===d.taskId))}>查询分配任务 {d.taskId}</button>{a&&selectedPlan.inputSnapshot&&<button onClick={()=>{const target=a.supplyId?'supplies':'inventory',field=a.supplyId?'供给编号':'批次编号',id=a.supplyId||a.lotId,index=(selectedPlan.inputSnapshot[target]||[]).findIndex((r:Row)=>r[field]===id);setHistorical(true);navigate(target,index<0?undefined:index);}}>查询原始批次 / 供给 {a.lotId}</button>}</td></tr>))}</tbody></table>}</section>}
  {table==='tasks'&&<><button onClick={()=>onTask(planId,row['任务编号'])}>定位方案甘特与问题</button><h3>同任务问题</h3>{(selectedPlan?.findings||[]).filter((f:any)=>f.taskIds.includes(row['任务编号'])).map((f:any,i:number)=><p key={i}>{f.code}：{f.message}</p>)}<p>未排任务可能只有问题记录，不存在任务明细；请在工作台核对完整问题列表。</p></>}
  </section>}
 </section>;
}
