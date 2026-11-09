import type {ReactNode} from 'react';
import {capacityNumber as num} from './CapacityDialog';
import './CapacityCalculation.css';

const precise=(n:any)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('zh-CN',{maximumSignificantDigits:8}):'-';
const limit=(n:any)=>typeof n==='number'&&Number.isFinite(n)?num(Math.floor((n+1e-9)*1000)/1000):'-';
function Step({n,title,children}:{n:number;title:string;children:ReactNode}){return <section className="capacity-calc-step"><h4><b>{n}</b>{title}</h4>{children}</section>;}
export function CapacityCalculation({result,onConstraint}:{result:any;onConstraint:(id:string)=>void}){
 const s=result.selected,r=result.request,day=result.days.find((d:any)=>d.date===r.detailDay);
 if(!s)return <p>{day?.error||'本日资料不完整，请先补充来源后重新计算。'}</p>;
 const trace=s.calculation,scenario=r.scenario,c=s.calendar,best=s.suggestions.find((x:any)=>x.gain>0);
 const costs=new Map((trace?.resources||[]).map((row:any)=>[row.id,row]));
 const rows=[...s.constraints].sort((a:any,b:any)=>Number(b.binding)-Number(a.binding));
 const first=s.bottlenecks.find((row:any)=>(costs.get(row.id) as any)?.costPerKg>0),firstCost=first?costs.get(first.id) as any:null;
 return <div className="capacity-calculation">
  <p className="capacity-intro">{r.detailDay} 的联合上限为 <strong>{num(s.total)} 千克/日</strong>。{first?`当前首先受 ${first.name} 限制。`:'需要同时满足所有设备、工装和班组约束。'}以下数值对应本次已计算条件。</p>
  <nav className="capacity-calc-flow" aria-label="产能计算步骤">{['确定输入','展开工序','计算可用资源','折算单位占用','联合求上限','比较与改善'].map((x,i)=><span key={x}>{i+1} {x}</span>)}</nav>
  <Step n={1} title="确定本次使用哪些数据">
   <p>从选定的数据版本或冻结运行读取物料、BOM、工艺和资源，叠加该日期已生效的配置，再应用本页模拟参数。</p>
   <dl className="capacity-calc-facts"><dt>数据来源</dt><dd>v{result.identity.version} · {result.identity.runId?'冻结运行 '+result.identity.runId:'已导入数据'}<small>数据集 {result.identity.datasetId}</small></dd><dt>分析区间</dt><dd>{r.fromDate} 至 {r.toDateInclusive}（含）</dd><dt>查看日 / 信息截至</dt><dd>{r.detailDay} / {r.knownAsOfDate}</dd><dt>配比方式</dt><dd>{r.mode==='fixed'?'固定质量配比，输入权重归一化为100%':'自动配比，使成品总千克数最大，允许部分产品产量为0'}</dd></dl>
   <div className="capacity-scroll"><table><thead><tr><th>选中物料</th><th>{r.mode==='fixed'?'采用的质量配比':'求解后的质量配比'}</th><th>本日产量</th></tr></thead><tbody>{s.products.map((p:any)=><tr key={p.id}><td>{p.id}<small>{p.name}</small></td><td>{num(trace?.mix.find((m:any)=>m.id===p.id)?.sharePct)}%</td><td>{num(p.quantityKg)} 千克</td></tr>)}</tbody></table></div>
   <p>“信息截至”决定哪些停机安排在当时已知。冻结运行始终读取当时保存的输入和配置，不以当前主数据补填历史。修改模拟条件后，须重新计算才能查看对应结果。</p>
  </Step>
  <Step n={2} title="展开制造BOM，找到全部需占用资源的工序">
   <p>不仅计算所选成品，也将其自行制造的子件逐层纳入，防止漏算半成品占用。</p>
   <p className="capacity-calc-example">本次覆盖 {num(trace?.materialCount)} 种制造物料、{num(s.stageCount)} 个工序计算项；涉及 {num(trace?.equipmentGroupCount)} 个设备组、{num(trace?.toolPoolCount)} 个工装池、{num(trace?.crewCount)} 个班组。相同工序为不同产品服务时，会分别形成占用计算项。</p>
   <p>制造子件折算系数 = 子项基准用量 ÷ 父项基准产出千克 × 单位换算；多级BOM逐层连乘。例如每千克成品需要2千克制造子件，该子件的设备、工装、人员占用均乘2，再与成品工序合计。</p>
   <p>当前假设原料充足，采购原料不增加制造工序。BOM循环、版本冲突、缺路线或关键单位换算时，相关日期显示“-”及具体原因，不补造产能。</p>
  </Step>
  <Step n={3} title="计算当天真正提供了多少资源">
   <p>先确定工厂及班组当天开几班，再计入模拟增配、有效率和截至当时已知的停机，形成共享资源预算。</p>
   <dl className="capacity-calc-facts"><dt>工厂班次比例</dt><dd>{num(c.actualShifts)} ÷ {num(c.standardShifts)} = {precise(c.actualShifts/c.standardShifts)}<small>当日生产班次 ÷ 标准班次数{c.sunday?'；本日为周日':''}</small></dd><dt>有效工作时间系数</dt><dd>{scenario.overtimeHours>0?<>{num(scenario.timePct)}% ×（1 + {num(scenario.overtimeHours)} 小时 ÷ {num(scenario.standardHours)} 小时）</>:<>{num(scenario.timePct)}%（未模拟加班）</>}<small>实际采用系数 {precise(c.timeFactor)}；加班时需填写标准日产能对应工时，用于折算加班增量。</small></dd><dt>设备 / 人员 / 工装</dt><dd>设备有效率 {num(scenario.equipmentPct)}% · 出勤率 {num(scenario.crewPct)}% · 工装可用率 {num(scenario.toolPct)}%</dd><dt>加工速度</dt><dd>{num(scenario.speedPct)}%<small>影响可变加工速率，不缩短固定跨日自然历时。</small></dd></dl>
   <div className="capacity-scroll"><table><thead><tr><th>相关班组</th><th>当日 / 标准班次</th><th>与工厂取交集后的班次比例</th></tr></thead><tbody>{c.crews.map((crew:any)=><tr key={crew.id}><td>{crew.id}<small>{crew.name}</small></td><td>{num(crew.actualShifts)} / {num(crew.standardShifts)}</td><td>{precise(Math.min(c.actualShifts/c.standardShifts,crew.actualShifts/crew.standardShifts))}</td></tr>)}</tbody></table></div>
   <p>班组可用人数 = 向下取整［（每班可用人数 + 模拟增员）× 出勤率］；班次数不再重复乘成人数。设备按可用编号汇总，工装按实体编号汇总，同一工装被多个类型引用时另加合并池约束，避免重复提供能力。</p>
   <p>设备组日投产预算 = 各有效设备的“标准日产能 × 停机后可用份额”之和 × 工厂班次比例 × 有效工作时间系数 × 速度比例 × 设备有效率；模拟新增机位按组内最快设备估算。另以停机后可用的台·自然日限制设备占位。</p>
   <p>工装先算可用整套数，再算停机后的套·自然日份额，两者取小作为预算；工序按每批所需套数消耗该预算。增加非瓶颈设备或工装不一定增加最终产量。</p>
   <p>{day.events.length?`本日关联已知停机 ${day.events.length} 条：`:'本日没有关联的已知停机安排。'}{day.events.map((e:any)=>`${e.resource} / ${e.id}${e.recoveredPct?'（模拟恢复'+e.recoveredPct+'%）':''}`).join('；')}</p>
   <p>停机只采用截至日期已知、且与本日相交的时段。同一资源的重叠停机先取并集，再扣减自然日可用份额；模拟恢复比例为 {num(scenario.recoveryPct)}%。停机是否降低最终产能，取决于受影响资源是否成为瓶颈。</p>
  </Step>
  <Step n={4} title="把每千克产品折算成设备、工装和人员占用">
   <p>把不同产品统一成“生产1千克需占多少资源”，才能放到同一套共享资源中比较。</p>
   <p className="capacity-calc-example">标准生产批量 {num(trace?.globalBatchKg)} 千克（{trace?.batchSource==='simulation'?'本次模拟':'来源有效配置，未维护时不另加全局上限'}）；工序实际采用的可行批量范围 {num(trace?.batchRangeKg?.[0])}～{num(trace?.batchRangeKg?.[1])} 千克。</p>
   <ul><li>可行批量：同时受标准批量、设备单批上限、同时占位上限，以及工装承载量 × 每批套数约束。设备组内部按最大可行批量作上限估算。</li><li>普通按量加工：每千克占用 = 1 ÷（组内最快设备标准日产能 × 工厂/班组班次交集比例 × 有效工作时间系数 × 速度比例）。</li><li>固定跨日工序：每千克占用 = 跨日历时天数 ÷ 可行批量；加班或提速不会缩短其固定自然历时。</li><li>设备占用再乘制造BOM系数；班组再乘工序需求人数；工装再乘每批所需套数。同一共享资源在多工序的占用累加。</li></ul>
   <p>“人·自然日”“套·自然日”表示模型中一个人、一个工装的一天份额，不代表新增人数或额外工时。单批人数或工装套数不足时，即使有其他空闲资源，也不能形成可行产量。</p>
  </Step>
  <Step n={5} title="让所有资源同时满足，得到联合最大产能">
   <p>每项约束都要求：各产品产量 × 对应单位占用，合计不得超过该资源预算。设备组同时检查日投产重量、设备自然日占用以及与班组的日历交集。</p>
   <p>{r.mode==='fixed'?'固定配比：先按质量占比加权得到“每千克组合占用”，再算每项资源的预算 ÷ 每千克组合占用，所有有限上限中的最小值就是联合上限。':'自动配比：同时调整各产品产量，在全部资源约束下使总千克数最大；下表按最终求得的产品组合折算，只用于解释该组合，不能当作其他配比的通用上限。'}</p>
   {first&&<p className="capacity-calc-example"><strong>{first.name}</strong>：预算 {precise(first.budget)} {first.unit} ÷ 每千克组合占用 {precise(firstCost.costPerKg)} {first.unit}/千克 ≈ <strong>{limit(firstCost.mixLimitKg)} 千克/日</strong>。{s.bottlenecks.length>1?'还有其他约束同时触顶，单改其中一项可能没有增量。':'继续增产会超过这项预算，因此成为瓶颈。'}</p>}
   <details className="capacity-calc-details"><summary>查看全部 {rows.length} 项约束、计算数值及工序来源</summary><div className="capacity-scroll"><table><thead><tr><th>共享资源</th><th>可用预算</th><th>每千克组合占用</th><th>按此组合折算上限</th><th>已用 / 余量</th></tr></thead><tbody>{rows.map((row:any)=>{const cost=costs.get(row.id) as any;return <tr key={row.id}><td><button type="button" onClick={()=>onConstraint(row.id)}>{row.name}</button><small>{row.unit}{row.binding?' · 当前瓶颈':''}</small></td><td>{precise(row.budget)}</td><td>{precise(cost?.costPerKg)}</td><td>{cost?.costPerKg===0?'不限制当前组合':limit(cost?.mixLimitKg)}{cost?.costPerKg>0?' 千克/日':''}</td><td>{precise(row.used)} / {precise(row.headroom)}</td></tr>;})}</tbody></table></div><p>点击资源名称，可查看哪些产品、制造子件和工序贡献了占用，以及对应源行。自动配比总产量为0时没有可解释的产量组合，加权占用显示“-”。</p></details>
   <p>瓶颈指产量增加时先触及预算的约束，可能同时有多项。单品独占资源的上限不能相加；多选物料的配比计算也不代表允许把不同物料混入同一生产批。</p>
  </Step>
  <Step n={6} title="解释来源对比、改善指标与每日波动">
   <dl className="capacity-calc-facts"><dt>所选日最大产能</dt><dd>{num(s.total)} 千克/日<small>所有约束共同满足后的本日连续上限。</small></dd><dt>与来源方案相比</dt><dd>{num(s.total)} − {num(s.baseline)} = {num(s.gain)} 千克/日<small>来源方案使用相同日期、物料和配比方式，仅将本页模拟参数恢复默认。自动配比时，两种条件会分别求取最优组合。</small></dd><dt>当前主要瓶颈</dt><dd>{s.bottlenecks.map((x:any)=>x.name).join('、')||'-'}<small>{s.bottlenecks.length} 项约束触顶；名称相同的预算可能代表不同约束口径。</small></dd><dt>优先改善后的上限</dt><dd>{best?`${best.label}：${num(best.before)} → ${num(best.after)} 千克/日，增加 ${num(best.gain)} 千克/日`:'当前候选措施没有计算出正增量。'}<small>增加人员、设备、工装或调整时间等候选措施均重算，再按增量排序；这不是所有投资方案中的全局最优解。</small></dd></dl>
   <p>“来源方案”当前仍包含当日班次、已知停机和日历减班，并不是排除事件后的标准最大日产能。标准能力与事件影响尚未拆成独立指标。</p>
   <p className="capacity-calc-example">区间已计算 {result.completeDays}/{result.days.length} 日，均值 {num(result.average)} 千克/日。本日偏离 =（{num(day.total)} − {num(result.average)}）÷ {num(result.average)} × 100% = {result.average>0?num(day.deviationPct)+'%':'-（均值为0，无比例）'}；达到或超过当前 ±{num(r.thresholdPct)}% 阈值时突出显示。</p>
   <p>真实0产能参加均值，资料缺失日不参加。高于均值代表本日限制相对较少，也可能是其他低产能日期拉低均值，不代表设备超负荷。每天分别采用当日班次、有效配置和已知停机，所以结果可能不同。</p>
   <details className="capacity-calc-details"><summary>本日差异原因与数据支撑</summary>{day.causes.map((cause:string)=><p key={cause}>{cause}</p>)}</details>
   <p>改善只能作用于真正的瓶颈；多个约束同时触顶时，可能需要联合改善。应用措施仅更新本页模拟，须执行排程才能确认交付、物料与逐批时序。区间每日上限相加也不等于已求解的区间可执行产量。</p>
  </Step>
  <details className="capacity-calc-details"><summary>参数来源、维护入口与当前计算覆盖范围</summary>
   <div className="capacity-scroll"><table><thead><tr><th>来源 / 维护位置</th><th>采用的内容</th><th>当前覆盖情况</th></tr></thead><tbody>
    <tr><td>物料主数据、BOM、单位换算</td><td>物料名称、制造来源、子件用量及件/箱净重</td><td>制造用量参与资源计算；件/箱仅折算显示，未整箱取整。</td></tr>
    <tr><td>配置参数 → 设备与工装</td><td>设备标准日产能、单批上限、同时占位；工装承载与实体映射</td><td>已采用。按可用实体编号计数；单行“可用数量”大于1目前尚未展开成多个实体。</td></tr>
    <tr><td>配置参数 → 工艺与工序、全局与排程</td><td>跨日历时、工序人数、每批工装套数、标准生产批量</td><td>已采用；批量改变的影响受工序占用模型和其他上限约束。</td></tr>
    <tr><td>配置参数 → 班组人员、工厂日历</td><td>每班人数、标准/周日班次、当日生产班次</td><td>已采用；未按具体班次起止、休息、技能或人员替代关系计算。</td></tr>
    <tr><td>业务数据 → 停机安排</td><td>资源、起止日、可知日</td><td>已知相交时段扣减；节假日通过工厂日历班次体现，当前会影响本日及来源上限。</td></tr>
    <tr><td>本页方案模拟</td><td>有效率、出勤、加班、提速、增配、班次及批量</td><td>仅本次分析，未回写主数据、配置或排程。</td></tr>
    <tr><td>已有但尚未接入本页的规则</td><td>准备/加工分钟、清洗换型、工装后延释放、真实合批兼容、整数批次</td><td>保存这些参数不会自动改变本页的按天上限模型。</td></tr>
   </tbody></table></div>
   <p>同一日期、作用范围内采用有效配置；在线维护、导入配置和基础值按系统优先级解析。要验证新配置，需刷新当前来源或创建新运行；历史冻结结果保留原配置。</p>
  </details>
  <p className="capacity-calc-boundary">本页按组内最快速率和最大可行批量估算资源占用，因此是偏乐观的连续上限。尚未验证慢设备分配、准备清洗、逐批先后、在制、已有任务、物料供给及交期。计算使用未截断数值；产量向下保留3位小数，显示的分项与公式可能存在尾差。</p>
 </div>;
}
