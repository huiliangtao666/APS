import {capacityNumber as num} from './CapacityDialog';
import './CapacityEquipmentExplanation.css';
import './CapacityToolExplanation.css';
const precise=(value:any)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumSignificantDigits:8}):'-';
const limit=(value:any)=>typeof value==='number'&&Number.isFinite(value)?num(Math.floor((value+1e-9)*1000)/1000):'-';

export function CapacityToolExplanation({result,onConstraint}:{result:any;onConstraint:(id:string)=>void}){
 const selected=result.selected,trace=selected?.calculation,groups=trace?.toolGroups,scenario=result.request.scenario;
 if(!groups)return <p role="status">请重新计算产能，读取工序与工装说明。</p>;
 const types=groups.filter((g:any)=>!g.shared),shared=groups.filter((g:any)=>g.shared);
 function groupRow(group:any){return <details className="capacity-equipment-group capacity-tool-group" key={group.id}>
  <summary aria-label={'展开 '+group.name+' 计算说明'}><span><b>{group.shared?'共享实体联合约束':group.types.join(' / ')}</b><small>{group.operations.length} 个工序{group.shared?' · '+group.types.join(' / '):''} ▾</small></span><span><b>{num(group.budget)}</b><small>套·自然日</small></span><span>{num(group.used)} / {num(group.headroom)}<small>套·自然日</small></span><span className="capacity-equipment-limit"><b>{limit(group.mixLimitKg)}</b><small>千克成品/日</small></span></summary>
  <div className="capacity-equipment-body">
   <p>{group.types.join(' / ')}供以下 {group.operations.length} 个工序共享，实体编号去重后共 {group.members.length} 套，其中来源启用 {group.enabledCount} 套{group.extra?'，本页模拟新增 '+group.extra+' 套':''}。在当前组合产量下，已用 <strong>{num(group.used)}</strong>、余量 <strong>{num(group.headroom)}</strong> 套·自然日。</p>
   <h4>这些数字如何得到</h4>
   {group.shared?<p>① 可用预算 = Σ去重实体的剩余可用比例 × 工装可用率 = {precise(group.availableDays)} × {precise(group.factor)} = <b>{precise(group.budget)}</b> 套·自然日。跨类别复用同一实体时，额外合并校验；各类别原有约束仍同时成立。</p>:<p>① 可用预算 = min（取整可用套数，剩余可用日）= min（floor［（{group.enabledCount} ＋ 新增 {group.extra}）× {precise(group.factor)}］，{precise(group.availableDays)} × {precise(group.factor)}）= min（{precise(group.availableCount)}，{precise(group.availableDays*group.factor)}）= <b>{precise(group.budget)}</b> 套·自然日。</p>}
   <p>② 每千克成品占用 = Σ（制造用量 × 自然日/千克 × 每批工装套数 × 成品质量占比）= <b>{precise(group.costPerKg)}</b> 套·自然日/千克成品。已用 = {group.costPerKg===null?'各工序占用合计':precise(group.costPerKg)+' × 组合产量 '+precise(trace.toolSolutionKg)} = <b>{precise(group.used)}</b> 套·自然日，明细见下表。</p>
   <p>③ 余量 = 预算 − 已用 = {precise(group.budget)} − {precise(group.used)} = <b>{precise(group.headroom)}</b> 套·自然日；占用约束折算上限 = {precise(group.budget)} ÷ {precise(group.costPerKg)} = <b>{limit(group.checks[0]?.mixLimitKg)}</b> 千克成品/日。</p>
   {group.mixLimitKg===null&&<p className="capacity-equipment-note">当前产量组合未占用该工装，或自动配比为零时没有可折算组合，上限显示“-”。</p>}
   {group.sharedConstraintIds.length>0&&<p className="capacity-equipment-note">该类别与其他类别共用部分实体，还须满足下方“共享实体联合约束”，预算不能重复提供。</p>}
   {group.checks.filter((c:any)=>c.minimum).map((check:any)=><p className="capacity-tool-shortage" key={check.id}>单批工装套数不足：{check.name}。来源启用及模拟折算后仅 {group.availableCount} 套，低于对应工序所需套数，因此相关物料受零产量约束。可查看工序明细后维护实体映射、可用数量或模拟增配。<button type="button" onClick={()=>onConstraint(check.id)}>查看单批不足明细</button></p>)}
   <details className="capacity-equipment-parameters" open><summary>工序与工装的对应关系及占用贡献</summary>
    <p className="capacity-equipment-note">每行表示一个制造物料的路线工序；同一工序供多个成品使用时，按质量配比和制造BOM用量合并。计算使用未舍入数值，展示值取近似。</p>
    <div className="capacity-scroll"><table aria-label={group.name+'工序工装关系'}><thead><tr><th>工序 / 制造物料</th><th>批量 / 历时 / 工装</th><th>单位占用的计算</th><th>本次已用贡献</th></tr></thead><tbody>{group.operations.map((op:any)=><tr key={op.materialId+'|'+op.routeId+'|'+op.toolType}><td>{op.operation}<small>{op.materialId} · {op.routeId}</small><small>{op.toolType} · 工艺路线{op.sourceRow!==null?'原行 '+op.sourceRow:' / 运行映射'}</small></td><td>{num(op.batchKg)} 千克 / {num(op.spanDays)} 天<small>每批 {num(op.requireTools)} 套</small><small>{op.spanDays>0||op.effectiveDailyKg>0?(op.spanDays>0?precise(op.spanDays)+' ÷ '+precise(op.batchKg):'1 ÷ 当日有效速率 '+precise(op.effectiveDailyKg))+' = '+precise(op.daysPerKg)+' 自然日/千克':'本日无有效生产时段；联合约束禁止产出'}</small></td><td>{precise(op.mixQuantityPerKg)} × {precise(op.daysPerKg)} × {precise(op.requireTools)}<small>= {precise(op.costPerKg)} 套·自然日/千克成品</small><small>首项为按配比折算的制造用量</small></td><td>{precise(op.used)}<small>套·自然日</small></td></tr>)}</tbody><tfoot><tr><th>合计</th><td/><td>{precise(group.costPerKg)}</td><td>{precise(group.used)}</td></tr></tfoot></table></div>
    <button type="button" onClick={()=>onConstraint(group.id)}>查看逐产品制造用量与来源明细</button>
   </details>
   <details className="capacity-equipment-parameters"><summary>实体套数、批量与停机来源（{group.members.length} 个编号）</summary>
    <div className="capacity-scroll"><table aria-label={group.name+'实体来源'}><thead><tr><th>工装 / 来源</th><th>来源可用数量</th><th>单套批量上限</th><th>剩余可用比例</th></tr></thead><tbody>{group.members.map((m:any)=><tr key={m.id}><td>{m.name}<small>{m.id} · {m.sourceTable}{m.sourceRow!==null?' · 原行 '+m.sourceRow:''}</small></td><td>{num(m.sourceQuantity)}<small>{m.enabled?'启用':'停用'}</small></td><td>{num(m.batchKg)} 千克</td><td>{precise(m.availableDay*100)}%<small>{m.stopIds.length?'停机 '+m.stopIds.join('、'):'本日无已知停机扣减'}</small></td></tr>)}</tbody></table></div>
    <p className="capacity-equipment-note">实体映射来自运行工装池，或设备与工装中同名工装组；相同编号去重，每个来源可用数量大于0的编号按一套计算，可用数量大于1尚不展开。停机安排按信息截至日筛选、重叠去重，应用恢复 {num(scenario.recoveryPct)}% 后得到剩余可用比例。</p>
   </details>
   <details className="capacity-equipment-parameters"><summary>计算参数与维护来源</summary>
    <p>设备与工装：资源编号、资源组、可用数量、单次批量上限千克；工艺路线：所需工装类型、每批工装套数、跨日历时天数；制造用量：当日有效物料清单。可行批量还受全局标准批量、设备和工装批量上限共同限制。</p>
    <p>同日工序占用随设备参考速率、工厂与班组日历交集、工时及速度参数折算；固定跨日占用按历时÷批量，不因加班或提速缩短。工装单套批量限制批量，不另把工装“标准日产能”当作独立预算。</p>
    <p>本页模拟：工装可用率 {num(scenario.toolPct)}%，新增 {group.extra} 套，停机恢复 {num(scenario.recoveryPct)}%；仅用于本次分析。主数据和配置按所选日期有效值读取。</p>
   </details>
  </div>
 </details>;}
 return <section className="capacity-equipment-explanation capacity-tool-explanation" aria-label="工装上限分层说明">
  <p className="capacity-intro">本次有 <strong>{trace.toolOperationCount} 个工序使用 {types.length} 类工装</strong>，对应 {trace.toolEntityCount} 个去重实体编号（含停用）；工装共同上限为 <strong>{num(selected.byKind.tools)} 千克/日</strong>。再结合设备、班组约束，最终联合上限为 {num(selected.total)} 千克/日。</p>
  <p className="capacity-equipment-note">{selected.date} · 数据版本 v{result.identity.version}。下方“已用”表示最大产能方案下的理论资源占用，不是实际领用记录；每类展开后可对照工序核算。各类产能不能相加。</p>
  <div className="capacity-equipment-heading capacity-tool-heading" aria-hidden="true"><span>工装类别 / 工序</span><span>可用预算</span><span>已用 / 余量</span><span>组合上限</span></div>
  {types.map(groupRow)}
  {shared.length>0&&<><h4 className="capacity-tool-shared-title">跨类别共享实体的联合约束</h4>{shared.map(groupRow)}</>}
  {!types.length&&<p>本次工序未要求工装套数，无工装占用约束。</p>}
 </section>;
}
