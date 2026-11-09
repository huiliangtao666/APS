import {capacityNumber as num} from './CapacityDialog';
import './CapacityEquipmentExplanation.css';

const precise=(value:any)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumSignificantDigits:8}):'-';
const limit=(value:any)=>typeof value==='number'&&Number.isFinite(value)?num(Math.floor((value+1e-9)*1000)/1000):'-';
const checkLabels:any={occupancy:'① 设备占用时间',daily:'② 日投产重量',calendar:'③ 设备与班组日历交集'};

/** A projection of this response's effective model, including its unrounded costs. */
export function CapacityEquipmentExplanation({result,onConstraint}:{result:any;onConstraint:(id:string)=>void}){
 const selected=result.selected,trace=selected?.calculation,groups=trace?.equipmentGroups,scenario=result.request.scenario;
 if(!groups)return <p role="status">请重新计算产能，读取分层设备说明。</p>;
 const tightest=groups.filter((g:any)=>g.mixLimitKg!==null).reduce((min:number,g:any)=>Math.min(min,g.mixLimitKg),Infinity);
 return <section className="capacity-equipment-explanation" aria-label="设备上限分层说明">
  <p className="capacity-intro">本次涉及 <strong>{trace.operationCount} 个工序、{groups.length} 类设备（按设备组）</strong>，含制造BOM子件；设备共同上限为 <strong>{num(selected.byKind.equipment)} 千克/日</strong>。各类设备折算为同一成品组合后取最小值；再与工装、班组共同约束，得到最终上限 {num(selected.total)} 千克/日。</p>
  <p className="capacity-equipment-note">{selected.date} · 数据版本 v{result.identity.version} · 成品质量配比：{trace.mix.map((p:any)=>p.id+' '+num(p.sharePct)+'%').join(' / ')}。</p>
  <p className="capacity-equipment-note">工序按“制造物料＋路线工序”去重。展开设备行，可逐层查看约束、参数和来源；各设备组产能不能相加。</p>
  <div className="capacity-equipment-heading" aria-hidden="true"><span>设备类别 / 涉及工序</span><span>组合产能上限</span><span>说明</span></div>
  {groups.map((group:any)=>{
   const limiting=group.mixLimitKg!==null&&Math.abs(group.mixLimitKg-tightest)<1e-7;
   return <details className="capacity-equipment-group" key={group.id}>
    <summary aria-label={'展开 '+group.name+' 计算说明'}><span><b>{group.name}</b><small>{group.id} · {group.operations.length} 个工序</small></span><span className="capacity-equipment-limit"><b>{limit(group.mixLimitKg)}</b><small>千克成品/日</small></span><span>{limiting?'设备组中最紧约束':'查看计算说明'}<small>{group.checks.length} 项约束 · 3 组参数 ▾</small></span></summary>
    <div className="capacity-equipment-body">
     <p>{group.name}以 {group.machines.filter((m:any)=>m.enabled).length} 个有效设备编号{group.extra>0?' ＋ 模拟新增 '+group.extra+' 个机位':''}提供资源；折算当前物料组合上限为 <strong>{limit(group.mixLimitKg)} 千克/日</strong>。{group.mixLimitKg===null?'当前产量组合未占用该组，或自动配比为零时没有可折算组合。':'以下各项“资源预算 ÷ 每千克成品占用”同时成立，取最小上限。'}</p>
     <div className="capacity-scroll"><table aria-label={group.name+'约束计算'}><thead><tr><th>计算逻辑</th><th>预算 ÷ 单位占用</th><th>成品上限</th></tr></thead><tbody>{group.checks.map((check:any)=>{
      const crew=selected.calendar.crews.find((c:any)=>c.id===check.crewId);
      return <tr key={check.id}><td><button type="button" onClick={()=>onConstraint(check.id)}>{checkLabels[check.kind]}</button>{crew&&<small>{crew.name} · {crew.id}</small>}<small>{check.kind==='occupancy'?'Σ制造用量 × 工序自然日/千克': 'Σ制造用量（同组多工序累计）'}</small></td><td>{precise(check.budget)} ÷ {precise(check.costPerKg)}<small>{check.unit} ÷（{check.unit}/千克成品）</small></td><td>{limit(check.mixLimitKg)}<small>千克/日</small></td></tr>;
     })}</tbody></table></div>
     <details className="capacity-equipment-parameters" open><summary>参数 1 · 设备与停机（{group.machines.length} 个设备编号）</summary>
      <p>设备可用日预算 =（Σ各设备当日剩余可用比例 ＋ 新增机位）× 设备有效率 = {precise(group.availableDays)} 台·自然日。</p>
      <p>可用标准速率合计 = Σ（标准日产能 × 剩余可用比例）＋ 新增机位 × 最快速率 = {precise(group.sumRates)} 千克/标准日；组内参考最快速率 {precise(group.fastest)} 千克/标准日。</p>
      <div className="capacity-scroll"><table aria-label={group.name+'设备参数'}><thead><tr><th>设备 / 来源</th><th>标准日产能</th><th>单批 / 占位上限</th><th>剩余可用比例</th></tr></thead><tbody>{group.machines.map((m:any)=><tr key={m.id}><td>{m.name}<small>{m.id} · {m.sourceTable}{m.sourceRow!==null?' · 原行 '+m.sourceRow:''}</small></td><td>{num(m.dailyKg)}<small>千克/标准日</small></td><td>{num(m.batchKg)} / {m.spaceKg>0?num(m.spaceKg):'-'}<small>千克</small></td><td>{precise(m.availableDay*100)}%<small>{m.enabled?'来源启用':'来源停用'}{m.stopIds.length?'；停机 '+m.stopIds.join('、'):''}</small></td></tr>)}</tbody></table></div>
      <p className="capacity-equipment-note">来源字段：标准日产能千克、单次批量上限千克、同时占位上限千克、可用数量；停机安排按信息截至日筛选、重叠时段去重，再应用停机恢复 {num(scenario.recoveryPct)}%。当前模型每个有效设备编号计一个机位，可用数量大于1尚不展开。</p>
     </details>
     <details className="capacity-equipment-parameters"><summary>参数 2 · 工序与制造用量（{group.operations.length} 个工序）</summary>
      <p>跨日工序：自然日/千克 = 跨日历时 ÷ 可行批量；同日工序：自然日/千克 = 1 ÷（组内最快速率 × 日历交集 × 工时系数 × 速度系数）。再按制造BOM用量和当前成品配比累计。</p>
      <p>可行批量取全局标准批量、工装允许批量、设备最大可行批量的最小值；设备批量同时受单批与占位上限限制。点击上方约束名称，可查看逐产品的制造用量、批量、历时和占用系数。</p>
      <div className="capacity-scroll"><table aria-label={group.name+'工序来源'}><thead><tr><th>制造物料 / 路线工序</th><th>工序 / 来源</th><th>批量 / 历时</th><th>自然日/千克</th></tr></thead><tbody>{group.operations.map((op:any)=><tr key={op.materialId+'|'+op.routeId}><td>{op.materialId}<small>{op.routeId}</small></td><td>{op.operation}<small>{op.sourceRow!==null?'工艺路线 · 原行 '+op.sourceRow:'运行工艺映射 / 工艺路线'}</small></td><td>{num(op.batchKg)} 千克<small>{num(op.spanDays)} 天</small></td><td>{precise(op.daysPerKg)}</td></tr>)}</tbody></table></div>
      <p className="capacity-equipment-note">来源：工艺路线及运行工艺映射、当日有效物料清单、标准生产批量配置、设备与工装；质量配比来自本页选择。共享工序按占用累加，不重复增加设备预算。</p>
     </details>
     <details className="capacity-equipment-parameters"><summary>参数 3 · 日历与本页模拟</summary>
      <p>工厂日投产预算 = 可用标准速率合计 × 工厂班次比例 × 工时系数 × 速度系数 × 设备有效率 = {precise(group.sumRates)} × {precise(group.factoryRatio)} × {precise(group.timeFactor)} × {precise(group.speedFactor)} × {precise(group.equipmentFactor)} = {precise(group.checks.find((c:any)=>c.kind==='daily')?.budget)} 千克/日。</p>
      {group.checks.filter((c:any)=>c.kind==='calendar').map((check:any)=>{const crew=selected.calendar.crews.find((c:any)=>c.id===check.crewId);return <p key={check.id}>{crew?.name||check.crewId}日历交集预算 = {precise(group.sumRates)} × min（工厂 {num(selected.calendar.actualShifts)}/{num(selected.calendar.standardShifts)}，班组 {num(crew?.actualShifts)}/{num(crew?.standardShifts)}）× {precise(group.timeFactor)} × {precise(group.speedFactor)} × {precise(group.equipmentFactor)} = {precise(check.budget)} 千克/日。</p>;})}
      <p>工时系数 = 有效工作时间 {num(scenario.timePct)}%{scenario.standardHours?' ×（1 ＋ 加班 '+num(scenario.overtimeHours)+' 小时 ÷ 基准 '+num(scenario.standardHours)+' 小时）':'（未模拟加班）'}；新增兼容机位 {group.extra}，设备有效率 {num(scenario.equipmentPct)}%，加工速度 {num(scenario.speedPct)}%。固定跨日历时保持不变。</p>
      <p className="capacity-equipment-note">来源：当日有效工厂日历、班组资源与配置参数；本页模拟优先覆盖班次、工时、速度、有效率和新增机位。班组周日班次仅在周日使用，所有模拟不回写来源。</p>
     </details>
    </div>
   </details>;
  })}
 </section>;
}
