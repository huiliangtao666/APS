import {executionInventory} from './lib/material-allocation.mjs';
import {executionSummary} from './lib/execution-facts.mjs';
type Row=Record<string,string>;
export function ExecutionPanel({data,operations,historical}:{data:Record<string,Row[]>;operations:any[];historical?:any}){
 const summary=executionSummary(data),history=operations.filter(r=>!r.trialId&&['executionFacts','executionMaterials'].includes(r.target));
 return <section aria-label="模拟执行事实与历史"><h2>模拟执行事实 / R5</h2><p>所有记录均为离线模拟输入。工序产出不代表质量合格或真实车间执行，不跨工序累加。已耗材料从扣耗前账面中一次扣除；重算只分配余料，不写库存、不入完成量。</p>
 <p>事实 {summary.facts.length} 条 · 累计耗料 {summary.consumption.length} 条。查询页可按订单、状态、分钟查询两表；数据页可导入模板/示例及编辑。开始/完成原记录、历次修改及操作原因保留。</p>
 {summary.risks.map((risk:any)=><p role="alert" key={risk.factId}>{risk.message}</p>)}
 <table><thead><tr><th>模拟事实</th><th>订单 / 工序</th><th>状态</th><th>工序余量</th><th>剩余分钟</th><th>当前设备</th><th>暂停原因</th></tr></thead><tbody>{summary.remaining.map((x:any)=>{const f=summary.facts.find((f:Row)=>f['事实编号']===x.factId);return <tr key={x.factId}><td>{x.factId}</td><td>{x.orderId} / {x.operation}</td><td>{f['状态']}</td><td>{x.remainingQuantity??'未知'} {x.unit}</td><td>{x.remainingMinutes}</td><td>{f['当前设备']}</td><td>{f['暂停原因']||'—'}</td></tr>;})}</tbody></table>
 <details><summary>模拟耗料与账面守恒（扣耗前账面、独立占用）</summary><table><thead><tr><th>批次</th><th>扣耗前账面</th><th>扣耗后余额</th><th>独立占用</th></tr></thead><tbody>{executionInventory(data).map(lot=><tr key={lot['批次编号']}><td>{lot['批次编号']}</td><td>{data.inventory.find(b=>b['批次编号']===lot['批次编号'])?.['账面数量']}</td><td>{lot['账面数量']}</td><td>{lot['已占用数量']}</td></tr>)}</tbody></table><p>可用数量还受质量、有效期及可用时点约束；扣耗后余额不等于当前可用。</p></details>
 <details><summary>原记录与修改历史（{history.length}）</summary>{history.map(e=><article key={e.id}><p>{e.at} · {e.actor} · {e.reason} · {e.action} · {e.fromVersion} → {e.toVersion}</p><pre>{JSON.stringify({before:e.before,after:e.after},null,2)}</pre></article>)}</details>
 {historical?.executionFactsVersion&&<details><summary>所选方案运行时执行事实（历史，不代表当前）</summary><p>版本 {historical.executionFactsVersion}</p><pre>{JSON.stringify(historical.executionSummary,null,2)}</pre></details>}
 <p>状态倒退/超量、退料/转机、暂停恢复、事件时点重排、拆合批与执行/质量协调由后续 FR031 确定；未定口径阻断。旧方案恢复仍受保护；试算保留/放弃不修改当前事实。</p>
 </section>;
}
