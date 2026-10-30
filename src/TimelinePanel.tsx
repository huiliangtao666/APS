import {problemInterval} from './lib/task-linkage.mjs';
import {useEffect,useMemo,useRef,useState} from 'react';
import {clip,filterTasks,lanes,projection,timeLabel,timetable,validMinute,validInterval,axisTicks} from './lib/timetable.mjs';
type Props={focusedProblem?:any;problemTaskIds?:string[];plan:any;selected:string[];onSelect:(ids:string[])=>void;onInput:(table:string,row:Record<string,string>)=>void;currentFacts:Record<string,string>[]};
const show=(v:any)=>v==null?'未知':String(v);
export function TimelinePanel({plan,selected,onSelect,onInput,currentFacts,focusedProblem,problemTaskIds}:Props){
 const model=useMemo(()=>timetable(plan),[plan]);
 const [machine,setMachine]=useState(''),[order,setOrder]=useState(''),[state,setState]=useState(''),[query,setQuery]=useState('');
 const [zoom,setZoom]=useState(1),[from,setFrom]=useState(''),[to,setTo]=useState(''),[cursor,setCursor]=useState('');
 const [acceptedWindow,setAcceptedWindow]=useState<{start:number;end:number}|null>(null);
 const [resources,setResources]=useState(true),[links,setLinks]=useState(true);
 const host=useRef<HTMLDivElement>(null),detail=useRef<HTMLDivElement>(null);
 useEffect(()=>{setMachine('');setOrder('');setState('');setQuery('');setFrom('');setTo('');setCursor('');setAcceptedWindow(null);},[plan?.id]);
 const valid=(s:string)=>s.trim()!==''&&Number.isFinite(Number(s));
 const candidateStart=from.trim()===''?model.extent[0]:Number(from),candidateEnd=to.trim()===''?model.extent[1]:Number(to);
 const dateOK=(from.trim()===''||valid(from))&&(to.trim()===''||valid(to))&&validMinute(candidateStart)&&validMinute(candidateEnd);
 const windowOK=dateOK&&candidateEnd>candidateStart;
 const {start,end}=windowOK?{start:candidateStart,end:candidateEnd}:acceptedWindow||{start:model.extent[0],end:model.extent[1]};
 function changeWindow(value:string,isStart:boolean){
  const a=isStart?value:from,b=isStart?to:value;
  const x=a.trim()===''?model.extent[0]:Number(a),y=b.trim()===''?model.extent[1]:Number(b);
  if(validInterval(x,y))setAcceptedWindow({start:x,end:y});
  if(isStart)setFrom(value);else setTo(value);
 }
 const minute=valid(cursor)&&validMinute(Number(cursor))?Number(cursor):null;
 const width=Math.min(60000,(end-start)*zoom),actualZoom=width/(end-start);
 const interval=problemInterval(plan,focusedProblem);
 const filtered=filterTasks(model.tasks,{machine,order,state,query,start,end,minute}).filter(t=>!problemTaskIds||problemTaskIds.includes(t.id));
 useEffect(()=>{if(!focusedProblem)return;setMachine('');setOrder('');setState('');setQuery('');const ts=model.tasks.filter(t=>focusedProblem.taskIds?.includes(t.id)&&validInterval(t.start,t.end));const a=interval?.start??(ts.length?Math.min(...ts.map(t=>t.start)):null),b=interval?.end??(ts.length?Math.max(...ts.map(t=>t.end)):null);if(validInterval(a,b)){setFrom(String(a-10));setTo(String(b+10));setAcceptedWindow({start:a-10,end:b+10});}},[focusedProblem]);
 const hidden=selected.filter(id=>model.tasks.some(t=>t.id===id)&&!filtered.some(t=>t.id===id));
 function reset(){setMachine('');setOrder('');setState('');setQuery('');setFrom('');setTo('');setAcceptedWindow(null);}
 function reveal(){
  reset();
  requestAnimationFrame(()=>{
   // The reveal button disappears after reset. Move focus to the restored task
   // before that removed control leaves keyboard users at the document root.
   const target=host.current?.querySelector<HTMLElement>('[data-selected="true"]')||detail.current;
   target?.scrollIntoView?.({block:'nearest',inline:'center'});
   target?.focus({preventScroll:true});
  });
 }
 useEffect(()=>{
  const node=host.current?.querySelector<HTMLElement>('[data-selected="true"]');
  // Problem activation scrolls to the saved task. Carry keyboard focus with it,
  // rather than leaving the originating finding outside the viewport.
  const fromKeyboardProblem=typeof document!=='undefined'&&document.activeElement?.matches('.finding:focus-visible');
  node?.scrollIntoView?.({block:'nearest',inline:'center'});
  if(fromKeyboardProblem)node?.focus({preventScroll:true});
 },[selected.join('|'),plan?.id,zoom,query,machine,order,state,from,to]);
 const chosen=model.tasks.filter(t=>selected.includes(t.id));
 const rows:any[]=[];let height=48;const positions=new Map<string,{x:number;y:number;end:number}>();
 for(const id of model.machines.filter(id=>!machine||id===machine)){
  const layout=lanes(filtered.filter(t=>t.machine===id&&validInterval(t.start,t.end)));
  const facts=model.facts.filter(f=>f['当前设备']===id&&(!order||f['订单编号']===order));
  const rowHeight=Math.max(76,layout.count*48+28+facts.length*28);
  rows.push({id,top:height,height:rowHeight,layout,facts});
  for(const t of layout.items)positions.set(t.id,{x:(t.start-start)/(end-start)*width,end:(t.end-start)/(end-start)*width,y:height+28+t.lane*48+20});
  height+=rowHeight;
 }
 const ticks=axisTicks(start,end,width);
 const geometry=(a:number,b:number)=>clip(a,b,start,end,width);
 return <section className="panel fr033" aria-label="机器甘特图与任务时间表">
 <h2>机器甘特图与任务时间表 · FR033 / PG04 / BP05</h2>
 <p>流程：导入 → 计算 → 核对 → 提交。分钟 0 = 2026-11-02 08:00 Asia/Shanghai；所有区间为 [开始,结束)。完成不等于合格入库或可交付；全局可行性未知。</p>
 <p>方案 {plan?.name||plan?.id||'尚无方案'} · 运行 {plan?.runId||'未知'} · 输入版本 {plan?.inputVersionId||plan?.inputVersion||'未知'} · 快照 {plan?.snapshotHash||'未知'} · 执行事实版本 {plan?.conditions?.executionFactsVersion||'未知'}</p>
 {!model.input&&<p role="status">历史方案缺少原始输入；停机、原始配置未知，禁止用当前输入重建。</p>}
 <div className="timeline-controls">
 <label>机器筛选<select aria-label="机器筛选" value={machine} onChange={e=>setMachine(e.target.value)}><option value="">全部机器</option>{model.machines.map(id=><option key={id}>{id}</option>)}</select></label>
 <label>订单筛选<select aria-label="订单筛选" value={order} onChange={e=>setOrder(e.target.value)}><option value="">全部订单</option>{[...new Set(model.tasks.map(t=>t.orderId))].map(id=><option key={id}>{id}</option>)}</select></label>
 <label>计划状态<select aria-label="计划状态" value={state} onChange={e=>setState(e.target.value)}><option value="">全部状态</option><option value="scheduled">已排计划</option><option value="unplanned">未排</option></select></label>
 <label>搜索任务<input aria-label="搜索任务" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <label>缩放<select aria-label="缩放" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[0.25,1,3,8].map(v=><option value={v} key={v} disabled={(end-start)*v>60000}>{v} 像素/分钟</option>)}</select></label>
 <label>窗口开始分钟<input aria-label="窗口开始分钟" type="number" value={from} onChange={e=>changeWindow(e.target.value,true)} placeholder={String(model.extent[0])}/></label>
 <label>窗口结束分钟<input aria-label="窗口结束分钟" type="number" value={to} onChange={e=>changeWindow(e.target.value,false)} placeholder={String(model.extent[1])}/></label>
 <label>模拟时点分钟<input aria-label="模拟时点分钟" type="number" value={cursor} onChange={e=>setCursor(e.target.value)} placeholder="未启用"/></label>
 <label><input type="checkbox" checked={links} onChange={e=>setLinks(e.target.checked)}/>前后序连线</label><label><input type="checkbox" checked={resources} onChange={e=>setResources(e.target.checked)}/>资源占用</label>
 <button onClick={reset}>清除筛选与窗口</button><button onClick={()=>host.current?.scrollBy?.({left:-500,behavior:'smooth'})}>向前滚动</button><button onClick={()=>host.current?.scrollBy?.({left:500,behavior:'smooth'})}>向后滚动</button>
 </div>
 <p>图例：已排计划（按钮文字）；停机（斜线及原因）；模拟事实（原始状态）；箭头为保存的前序引用。极短任务不放大工时，完整文字见时间表。跨度较大时显示宽度最多 60000 像素，可缩小窗口核对。</p>
 <p role="status">实际比例 {actualZoom} 像素/分钟{actualZoom!==zoom?`（所选 ${zoom}；已达 60000 像素上限，请缩小窗口；超限缩放选项已禁用）`:''}；时间轴宽度 {width} 像素。</p>
 {hidden.length>0&&<p role="status">选中任务被筛选隐藏：{hidden.join('、')} <button onClick={reveal}>显示选中任务</button></p>}
 {!windowOK&&<p role="alert">{dateOK?'窗口结束须大于开始。':'窗口分钟须为有效数字，且在有效日期范围内。'}已保留上次有效窗口；任务仍可查看。</p>}
 <p className="fr033-window" aria-label="时间轴窗口，Asia/Shanghai"><span>窗口开始：{timeLabel(start)}</span><span>窗口结束（不含）：{timeLabel(end)}</span>{!ticks.length&&<span>轴宽不足以显示日期刻度；请参照窗口起止时间或放大。</span>}</p>
 <div className="fr033-scroll" ref={host} tabIndex={0} role="region" aria-label="可滚动机器时间轴，任务同下方时间表">
 <div className="fr033-canvas" style={{width:width+160,minHeight:height}}>
 <div className="fr033-axis" style={{width,left:160}}>{ticks.map(n=><time key={n} title={timeLabel(n)} aria-label={timeLabel(n)} style={{left:(n-start)/(end-start)*width}}>{timeLabel(n).split(" ")[0]}<br/>{timeLabel(n).split(" ")[1].split("（")[0]}</time>)}</div>
 {rows.map(row=><div className="fr033-machine" key={row.id} style={{top:row.top,height:row.height,width:width+160}}><div className="fr033-machine-label">{row.id}<small>{model.input?.machines?.find(m=>m['设备编号']===row.id)?.['设备名称']||'名称未知'}</small></div><div className="fr033-track" style={{left:160,width,height:row.height}}>
 {model.downtime.filter(d=>d.machine===row.id).map((d,i)=>{const g=geometry(d.start,d.end);return g&&<div className="fr033-downtime" style={{...g,height:'100%'}} key={i} title={`停机 ${timeLabel(d.start)}—${timeLabel(d.end)} ${d.reason}`}>停机：{d.reason}</div>;})}
 {interval&&(!interval.machine||interval.machine===row.id)&&row.layout.items.some((t:any)=>focusedProblem?.taskIds?.includes(t.id))&&(()=>{const g=geometry(interval.start,interval.end);return g&&<div className="fr034-interval" role="img" aria-label={`问题区间 ${interval.start} 至 ${interval.end}，${interval.end-interval.start} 分钟`} style={{...g,height:'100%'}}>问题 [{interval.start},{interval.end})</div>;})()}
 {row.layout.items.map((t:any)=>{const g=geometry(t.start,t.end);return g&&<button key={t.id} data-selected={selected.includes(t.id)} className="fr033-task" style={{...g,top:28+t.lane*48}} onClick={()=>onSelect([t.id])} aria-label={`${t.id} ${t.orderId} ${t.operation} ${timeLabel(t.start)} 至 ${timeLabel(t.end)} ${projection(t,minute)}`} aria-pressed={selected.includes(t.id)} title={`${t.id} ${projection(t,minute)}`}><b>{t.id} · {t.operation}</b><span>{projection(t,minute)}</span></button>;})}
 {row.facts.map((f:any,i:number)=>{const a=Number(f['开始分钟']),b=Number(f['完成分钟']||f['观测分钟']),g=geometry(a,b);return g&&<div className="fr033-fact" key={f['事实编号']} style={{...g,top:28+row.layout.count*48+i*28}} title={JSON.stringify(f)}>模拟事实 {f['事实编号']}：{f['状态']} · 观测 {f['观测分钟']}</div>;})}
 </div></div>)}
 {links&&<svg className="fr033-links" width={width} height={height} style={{left:160}} aria-hidden="true"><defs><marker id="fr033-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="currentColor"/></marker></defs>{filtered.map(t=>{const a=positions.get(t.predecessor),b=positions.get(t.id);return a&&b&&a.end>=0&&a.end<=width&&b.x>=0&&b.x<=width&&<path key={t.id} d={`M${a.end},${a.y} H${a.end+10} V${b.y} H${b.x}`} markerEnd="url(#fr033-arrow)"/>;})}</svg>}
 {minute!==null&&minute>=start&&minute<=end&&<div className="fr033-cursor" style={{left:160+(minute-start)/(end-start)*width,height}}>模拟推演分钟 {minute}</div>}
 </div></div>
 {!model.tasks.length&&<p>暂无保存的任务；请先计算或选择方案。</p>}
 {resources&&<details open><summary>保存的工装 / 人员 / 空间占用（计划模拟）</summary><p>只绘制保存的显式占用；工装 {plan?.jointResourceChecks?.MOLD?'已检查显式声明':'未检查 / 未知'}，空间 {plan?.jointResourceChecks?.STORAGE?'已检查显式声明':'未检查 / 未知'}。无记录不表示资源充足。动态释放、未批准占用口径未知；配置不自动生成占用。</p><div className="table-wrap"><table><caption>占用窗口含提前取得与后延释放；人员参与窗口独立于机器运行窗口</caption><thead><tr><th>资源 / 数量</th><th>占用与释放</th><th>保存配置</th><th>关联任务</th><th>窗口示意</th></tr></thead><tbody>{model.reservations.filter(r=>r.type!=='设备'&&r.taskIds?.some((id:string)=>filtered.some(t=>t.id===id))).map((r,i)=>{
 const group=model.input?.personnelGroups?.find(g=>g['人员组编号']===r.resourceId);
 const tool=model.input?.tools?.find(g=>g['工装编码']===r.resourceId);
 const space=model.input?.batchResources?.find(g=>g['资源编号']===r.resourceId);
 const g=clip(r.start,r.end,start,end,240);
 return <tr key={i}><td>{r.type} {r.resourceId} · {r.quantity} {r.unit}</td><td>{timeLabel(r.start)} — {timeLabel(r.end)}</td><td>{group?`可用 ${group['人员数量']} 人；技能 ${group['技能']}；班次 ${group['班次']}；窗口 ${group['可用起始分钟']}—${group['可用结束分钟']}`:tool?`可用 ${tool['可用数量']}`:space?`容量 ${space['容量']} ${space['单位']}`:'保存容量 / 技能未知'}</td><td>{r.taskIds.map((id:string)=><button key={id} onClick={()=>onSelect([id])}>{id}</button>)}</td><td><div className="fr033-mini" aria-label={`占用分钟 ${r.start} 至 ${r.end}`}>{g&&<span style={g}>占用</span>}</div></td></tr>;
 })}</tbody></table></div></details>}
 <div className="table-wrap"><table><caption>任务时间表：筛选结果 {filtered.length} / {model.tasks.length}；数量按原任务列出，不跨工序累加</caption><thead><tr><th>任务 / 状态</th><th>订单 / 工序</th><th>原任务数量</th><th>机器</th><th>开始 / 结束</th><th>时长 / 前序</th><th>解释</th></tr></thead><tbody>{filtered.map(t=><tr key={t.id} className={selected.includes(t.id)?'fr033-selected':''}><td><button onClick={()=>onSelect([t.id])} aria-pressed={selected.includes(t.id)}>{t.id}</button><p>{t.status==='unplanned'?'未排（没有甘特条）':projection(t,minute)}</p></td><td>{t.orderId} / {t.productId}<p>{t.label||t.operation} · {t.operation}</p></td><td>{show(t.quantity)} {t.unit}<p>{t.quantityMeaning||'数量口径未知'}</p></td><td>{t.machine||'未知'}</td><td>{timeLabel(t.start)} — {timeLabel(t.end)}</td><td>{validInterval(t.start,t.end)?t.end-t.start:'未知'} 分钟<p>前序 {t.predecessor||'未记录 / 无'}</p></td><td>{t.source}<p>{plan?.supplyConditions?.filter((c:any)=>c['订单编号']===t.orderId&&c['工序编号']===t.operation).map((c:any)=>c['条件说明']).join('；')||'未引用预计供给'}</p><p>{t.reasons.map((r:any)=>`${r.code}：${r.message}`).join('；')||'未报告逐任务问题；不代表完整业务可行'}</p></td></tr>)}</tbody></table></div>
 <div ref={detail} tabIndex={-1} aria-label="选中任务详情">{chosen.map(t=>{
 const pre=model.tasks.find(p=>p.id===t.predecessor),next=model.tasks.filter(p=>p.predecessor===t.id);
 const refs=t.assessment?.inputRefs||[];
 const ownFacts=model.facts.filter(f=>f['订单编号']===t.orderId&&f['工序编号']===t.operation);
 return <article className="fr033-detail" key={t.id}><h3>任务详情：{t.id}</h3><p>{t.orderId} / {t.operation} · {timeLabel(t.start)} — {timeLabel(t.end)} · {projection(t,minute)}</p>
 <p>前序 {pre?<button onClick={()=>onSelect([pre.id])}>{pre.id}</button>:t.predecessor||'未记录 / 无'} · 前序结束 {timeLabel(pre?.end)} · 后序开始 {timeLabel(t.start)} · 时差 {Number.isFinite(pre?.end)&&Number.isFinite(t.start)?`${t.start-pre.end} 分钟`:'未知'}</p>
 <p>后序 {next.length?next.map(n=><button key={n.id} onClick={()=>onSelect([n.id])}>{n.id}</button>):'未记录 / 无'}</p>
 <p>来源与顺延：{t.source}</p><pre>{JSON.stringify({timingReasons:t.timingReasons||t.assessment?.timingReasons||[],reasons:t.reasons,quantity:t.quantity,unit:t.unit,quantityMeaning:t.quantityMeaning,remainingExecutionQuantity:t.assessment?.remainingExecutionQuantity??null},null,2)}</pre>
 <h4>保存的原始输入</h4>{refs.length?refs.map((r:any,i:number)=><button key={i} onClick={()=>onInput(r.table,r.row)}>查看方案输入 {r.table} / {Object.values(r.row).slice(0,2).join(' · ')}</button>):<p>历史逐任务输入引用未知；未从当前输入补算。</p>}
 <h4>本方案运行时模拟事实</h4>{ownFacts.length?ownFacts.map(f=><p key={f['事实编号']}>{f['事实编号']} · {f['状态']} · 开始 {f['开始分钟']} · 观测 {f['观测分钟']} · 完成 {f['完成分钟']||'未完成'} · 工序累计可用产出 {f['工序完成数量']} {f['数量单位']} · 报废 {f['累计报废数量']||'0'} · 剩余工时 {f['剩余工时分钟']}；不跨工序相加、不推断合格入库。</p>):<p>没有保存的模拟执行事实；执行状态未知。</p>}
 <details><summary>当前模拟事实对照（独立于历史方案）</summary><p>下列为当前权威输入；不会改变历史时间条、数量、占用或确认快照。</p><pre>{JSON.stringify(currentFacts.filter(f=>f['订单编号']===t.orderId&&f['工序编号']===t.operation),null,2)}</pre></details>
 </article>;
 })}{selected.length>0&&!chosen.length&&<p role="status">所选任务没有保存在本方案中：{selected.join('、')}。未生成虚构任务。</p>}</div>
 <details><summary>本方案停机来源与范围</summary><p>最小模式 {plan?.conditions?.mode==='minimal-r1'?'未检查日历 / 停机；背景仅为保存配置，不代表已满足':'是否已校验以保存的检查范围为准'}。历史背景只使用原始输入快照。</p>{model.downtime.map((d,i)=><p key={i}>{d.machine} · 停机 {timeLabel(d.start)} — {timeLabel(d.end)} · {d.reason} <button onClick={()=>onInput('downtime',d.row)}>查看保存的停机输入</button></p>)}</details>
 </section>;
}
