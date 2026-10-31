import {type MaterialDemandRow} from './lib/material-allocation.mjs';
const exact=(value?:{numerator:string;denominator:string})=>value?`${value.numerator}/${value.denominator}`:'旧快照未记录';
export function MaterialPanel({plan,onTask}:{plan:{materialChecked?:boolean;materialDemands?:MaterialDemandRow[]};onTask:(id:string)=>void}){
 return <section className="panel" aria-label="物料需求与批次分配"><h2>物料需求与批次分配</h2>{!plan.materialChecked?
  <p>物料未检查；须在支持模式中启用 MATERIAL 并声明完整参数和支持的 BOM 口径。</p>:
  <><p>本方案快照 · 模拟库存 · 已占用已扣除；预计供给仍是条件。未排工序的候选分配不占用库存。MATERIAL 分配状态规则与 INVENTORY 查询规则分别保存。点击任务查看本运行的冻结来源；显示精度不改变齐套判定。</p>
   {!plan.materialDemands?.length&&<p>本结果未记录物料需求行；不据此确认物料齐套，请核对订单、投料工序与BOM。</p>}
   <div className="table-wrap"><table><thead><tr><th>任务 / BOM版本 / 已排投料或未排候选分钟</th><th>物料 / 需求 / 单位</th><th>批次分配及条件</th><th>缺口 / 建议</th></tr></thead><tbody>{plan.materialDemands?.map((r,i)=><tr key={i}>
    <td><button onClick={()=>onTask(r.taskId)}>{r.taskId}</button> / {r.version} / {r.feedMinute}<br/>{r.formula}<br/>生效日期 {r.effective} · 投料时点 {r.feedAt}</td>
    <td>{r.materialId} / {r.quantity} {r.unit}</td>
    <td>{r.committed?'已排分配':'未排候选（未占用）'}：{r.allocations.map(a=><p key={a.lotId+'-'+a.supplyId}>{a.lotId} {a.quantity} {r.unit} · {a.source} · 状态 {a.quality} · 有效期 {a.expiry} · 可用 {a.readyAt||'无等待'} · 已占用 {a.occupiedQuantity??'旧快照未记录'} · 分配后余额 {a.remaining} {r.unit}</p>)}{!r.allocations.length&&'无'}
     {!!r.excludedLots?.length&&<details><summary>未参与分配的库存批次（{r.excludedLots.length}）</summary>{r.excludedLots.map(l=><p key={l.lotId}>{l.lotId} · 账面 {l.bookQuantity} · 已占用 {l.occupiedQuantity} {r.unit} · 状态 {l.quality} · 有效期 {l.expiry} · 可用 {l.readyAt||'无等待'} · {l.reasons.join('；')}</p>)}</details>}
    </td><td>{r.shortage} {r.unit} {r.suggestion} {r.blockedReason}<details><summary>精确数量核对</summary><p>需求 {exact(r.exactQuantity)} {r.unit}；缺口 {exact(r.exactShortage)} {r.unit}。分数用于核对，不按显示精度放宽齐套条件。</p>{r.allocations.map(a=><p key={a.lotId+'-'+a.supplyId}>{a.lotId} 分配 {exact(a.exactQuantity)}；余额 {a.exactRemaining?exact(a.exactRemaining):'旧快照未记录'} {r.unit}</p>)}</details></td>
   </tr>)}</tbody></table></div>
   <p>仅支持无加料总收率配方和每袋包材；任意换算、全局库存预占和真实库存扣减仍须明确业务契约。支、袋中间值须为整数。采购和备料仅形成建议。</p></>}
 </section>;
}
