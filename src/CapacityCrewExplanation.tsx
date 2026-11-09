import {capacityNumber as num} from './CapacityDialog';
import './CapacityEquipmentExplanation.css';
import './CapacityToolExplanation.css';
const precise=(value:any)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumSignificantDigits:8}):'-';
const limit=(value:any)=>typeof value==='number'&&Number.isFinite(value)?num(Math.floor((value+1e-9)*1000)/1000):'-';

export function CapacityCrewExplanation({result,onConstraint}:{result:any;onConstraint:(id:string)=>void}){
 const selected=result.selected,trace=selected?.calculation,groups=trace?.crewGroups,scenario=result.request.scenario;
 if(!groups)return <p role="status">请重新计算产能，读取班组与日历说明。</p>;
 return <section className="capacity-equipment-explanation" aria-label="班组上限分层说明">
  <p className="capacity-intro">本次 <strong>{trace.operationCount} 个工序分配给 {groups.length} 类班组</strong>，包含制造BOM子件；班组共同上限为 <strong>{num(selected.byKind.crew)} 千克/日</strong>，与设备、工装共同形成最终上限 {num(selected.total)} 千克/日。</p>
  <p className="capacity-equipment-note">{selected.date} · 数据版本 v{result.identity.version}。班组人数预算按出勤取整；工厂与班组班次取交集，影响同日工序占用。各班组产能不能相加。“已用”是本次方案的理论人工占用。</p>
  <div className="capacity-equipment-heading capacity-tool-heading" aria-hidden="true"><span>班组 / 对应工序</span><span>可用预算</span><span>已用 / 余量</span><span>组合上限</span></div>
  {groups.map((group:any)=><details className="capacity-equipment-group capacity-tool-group capacity-crew-group" key={group.id}>
   <summary aria-label={'展开 '+group.name+' 计算说明'}><span><b>{group.name}</b><small>{group.id} · {group.operations.length} 个工序{group.binding?' · 瓶颈':''} ▾</small></span><span><b>{num(group.budget)}</b><small>人·自然日</small></span><span>{num(group.used)} / {num(group.headroom)}<small>人·自然日</small></span><span className="capacity-equipment-limit"><b>{limit(group.mixLimitKg)}</b><small>千克成品/日</small></span></summary>
   <div className="capacity-equipment-body">
    <p>{group.name}供以下 {group.operations.length} 个工序共享。每班来源人数 {num(group.basePeople)} 人，模拟增员 {group.extra} 人，出勤率 {num(group.factor*100)}%；折算预算为 <strong>{num(group.budget)} 人·自然日</strong>。</p>
    <h4>这些数字如何得到</h4>
    <p>① 可用预算 = floor［（原人数 ＋ 增员）× 出勤率］= floor［（{num(group.basePeople)} ＋ {group.extra}）× {precise(group.factor)}］= <b>{num(group.budget)}</b> 人·自然日。班次数不再乘为人数。</p>
    <p>② 每千克成品占用 = Σ（按配比折算制造用量 × 工序自然日/千克 × 工序需求人数）= <b>{precise(group.costPerKg)}</b> 人·自然日/千克成品。已用 = {group.costPerKg===null?'各工序占用合计':precise(group.costPerKg)+' × 组合产量 '+precise(trace.solutionKg)} = <b>{precise(group.used)}</b> 人·自然日。</p>
    <p>③ 余量 = {precise(group.budget)} − {precise(group.used)} = <b>{precise(group.headroom)}</b> 人·自然日；占用约束折算上限 = {precise(group.budget)} ÷ {precise(group.costPerKg)} = <b>{limit(group.checks[0]?.mixLimitKg)}</b> 千克成品/日。</p>
    {group.mixLimitKg===null&&<p className="capacity-equipment-note">当前组合未占用该班组，或自动配比为零时没有可折算组合，上限显示“-”；需求人数为0的工序保留关系、占用为0。</p>}
    {group.checks.filter((c:any)=>c.minimum).map((c:any)=><p className="capacity-tool-shortage" key={c.id}>单批人数不足：{c.name}。折算可用人数 {num(group.availablePeople)}，低于对应工序要求，因此相关物料另受零产量约束。请核对工序需求人数、班组人数、出勤率或同技能增员。<button type="button" onClick={()=>onConstraint(c.id)}>查看人数不足明细</button></p>)}
    <details className="capacity-equipment-parameters" open><summary>工厂日历与班组排班如何影响计算</summary>
     <p>当日工厂生产 {num(group.factoryActualShifts)} 班 / 标准 {num(group.factoryStandardShifts)} 班；班组 {num(group.actualShifts)} 班 / 标准 {num(group.sourceStandardShifts)} 班{selected.calendar.sunday?'（本日周日，使用周日班次）':'（非周日，使用标准日班次）'}。</p>
     <p>班次交集比例 = min（{num(group.factoryActualShifts)} ÷ {num(group.factoryStandardShifts)}，{num(group.actualShifts)} ÷ {num(group.sourceStandardShifts)}）= <b>{precise(group.calendarRatio)}</b>；同日工序有效速率 = 设备参考最快速率 × {precise(group.calendarRatio)} × 工时系数 {precise(group.timeFactor)} × 速度系数 {precise(group.speedFactor)}。自然日/千克 = 1 ÷ 有效速率，再乘需求人数计入人工占用。</p>
     <p>工时系数 = {num(scenario.timePct)}%{scenario.standardHours?' ×（1 ＋ 加班 '+num(scenario.overtimeHours)+' 小时 ÷ 基准 '+num(scenario.standardHours)+' 小时）':'（未模拟加班）'}。固定跨日工序按“跨日历时 ÷ 可行批量”计占用，历时不因班次、加班或提速缩短。</p>
     <p className="capacity-equipment-note">工厂或班组停产时，人数预算仍按上述人数公式展示；设备日投产或日历交集约束会阻止相关产品产出。因此单独的班组上限不能当作当日可生产量。</p>
    </details>
    <details className="capacity-equipment-parameters"><summary>工序与班组对应关系、逐项人工占用贡献</summary>
     <p className="capacity-equipment-note">工序按制造物料＋路线工序合并。制造BOM用量与成品质量配比累计到同一班组，不重复增加人数预算。计算使用未舍入值，显示值取近似。</p>
     <div className="capacity-scroll"><table aria-label={group.name+'工序人工关系'}><thead><tr><th>工序 / 制造物料</th><th>人数 / 批量 / 历时</th><th>单位占用计算</th><th>本次已用贡献</th></tr></thead><tbody>{group.operations.map((op:any)=><tr key={op.materialId+'|'+op.routeId}><td>{op.operation}<small>{op.materialId} · {op.routeId}</small><small>设备组 {op.group} · 工艺路线{op.sourceRow!==null?'原行 '+op.sourceRow:' / 运行映射'}</small></td><td>需求 {num(op.requirePeople)} 人<small>{num(op.batchKg)} 千克 / {num(op.spanDays)} 天</small><small>{op.spanDays>0||op.effectiveDailyKg>0?(op.spanDays>0?precise(op.spanDays)+' ÷ '+precise(op.batchKg):'1 ÷ 有效速率 '+precise(op.effectiveDailyKg))+' = '+precise(op.daysPerKg)+' 自然日/千克':'本日无有效生产时段；联合约束禁止产出'}</small></td><td>{precise(op.mixQuantityPerKg)} × {precise(op.daysPerKg)} × {num(op.requirePeople)}<small>= {precise(op.costPerKg)} 人·自然日/千克成品</small><small>设备参考速率 {num(op.referenceDailyKg)} 千克/标准日</small></td><td>{precise(op.used)}<small>人·自然日</small></td></tr>)}</tbody><tfoot><tr><th>合计</th><td/><td>{precise(group.costPerKg)}</td><td>{precise(group.used)}</td></tr></tfoot></table></div>
     <button type="button" onClick={()=>onConstraint(group.constraintId)}>查看逐产品制造用量与来源明细</button>
    </details>
    <details className="capacity-equipment-parameters"><summary>参数原值、覆盖情况与维护来源</summary>
     <div className="capacity-scroll"><table aria-label={group.name+'班组日历来源'}><thead><tr><th>参数 / 来源</th><th>来源值</th><th>本次采用</th></tr></thead><tbody>
      <tr><td>每班可用人数<small>班组资源 · {group.id}{group.sourceRow!==null?' · 原行 '+group.sourceRow:''}</small></td><td>{num(group.basePeople)} 人</td><td>增员 {group.extra}、出勤 {num(scenario.crewPct)}% → {num(group.availablePeople)} 人</td></tr>
      <tr><td>标准日 / 周日班次数<small>班组资源 · {group.id}</small></td><td>{num(group.sourceStandardShifts)} / {num(group.sourceSundayShifts)} 班</td><td>{num(group.actualShifts)} 班<small>{selected.calendar.sunday&&scenario.sundayShifts!==null?'本页周日班次覆盖':selected.calendar.sunday?'沿用来源周日班次':'采用标准日班次；周日覆盖本日不生效'}</small></td></tr>
      <tr><td>{group.factoryField} / 日产能分母<small>工厂日历 · 日序 {selected.calendar.day}{group.factorySourceRow!==null?' · 原行 '+group.factorySourceRow:''}</small></td><td>{num(group.sourceFactoryShifts)} / {num(group.factoryStandardShifts)} 班</td><td>{num(group.factoryActualShifts)} / {num(group.factoryStandardShifts)} 班<small>{scenario.shifts!==null?'本页工厂班次覆盖':'沿用来源日历'}</small></td></tr>
     </tbody></table></div>
     <p className="capacity-equipment-note">其余来源：工艺路线的需求人数、跨日历时、设备组；设备与工装的速率和批量；有效制造BOM及标准批量配置。本页工时、速度、出勤和增员只用于模拟；主数据与配置均按所选日期有效值读取。</p>
    </details>
   </div>
  </details>)}
 </section>;
}
