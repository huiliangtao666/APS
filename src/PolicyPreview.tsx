import {configurationPreview} from './lib/configuration-preview.mjs';
import {mappingOptions} from './lib/resource-mapping.mjs';
import {poolStrategyOptions} from './lib/physical-pools.mjs';
import {effectiveClaim} from './lib/resource-policies.mjs';
type Row=Record<string,string>;
const personnelOffset=(d:Row,k:string)=>d[k]?.trim()?d[k]:d['人员参与阶段']?.trim()?'待填写':'0（旧单窗口）';
export function PolicyPreview({table,data,revision}:{table:string;data:Record<string,Row[]>;revision:number}){
 if(!['rules','batchResources','tools','resourceClaims','dependencies','personnelGroups','personnelPools','skillSubstitutions'].includes(table))return null;
 const preview=configurationPreview(data);
 return <aside className="hint-box" aria-label="业务参数预览"><b>DEC02/03 · 已存版本 v{revision} · 下方含本页未保存草稿预览 · 仅影响新运行 / 新试算</b>
 <p>仿真初始值 / 待确认：历史完整区间和人员偏移保持原义；新增字段迁移为窗口外释放“是”、逐项声明、工装可用期 [0,525600) 分钟。以上均可修改，并非现场批准值。分钟0=2026-11-02 08:00；所有区间为 [开始,结束)，端点相邻可复用。范围为本订单、本工序、本资源；工装容量属于资源本身；不跨方案预占。已有执行事实的任务，实际采用对应资源约束且缺原始资源账时阻断；待生效或未选用的工装/空间规则不会因此阻断。人员依赖保护不随 LABOR 关闭而解除；不把偏移重置到剩余工时。</p>
 {table==='tools'&&<p>可用数量、每任务需求数量为正整数套；提前取得/后延归还为0–525600整数分钟。声明选择“工装配置”才继承这三个参数；选择“逐项声明”则使用声明值。可用起止为资源实际可用期，提前取得也必须落在其中；不自动继承机器班次。</p>}
 {table==='resourceClaims'&&<><p>占用口径：整工序，或“明确窗口”。窗口从工序开始+窗口开始偏移，到工序结束−窗口结束偏移；偏移为0–525600整数分钟，两者之和须小于固定工时。提前取得、后延归还在该窗口上扩展。同一订单/工序/资源仅一条连续占用声明；多个不连续工装窗口须先补设计，不能叠加整工序。继承工装时需求数量及提前/后延三个字段须留空；缺失声明不会自动生成。请在排程规则中启用 MOLD / STORAGE。</p>{(data.resourceClaims||[]).map((raw,i)=>{const c=effectiveClaim(raw,data);return <p key={i}>预览 {c['声明编号']||'未编号'}：{c['订单编号']}/{c['工序编号']}/{c['资源编号']}，{c['需求数量']} {c['单位']}；{c['占用口径']}；[开始+{c['窗口开始偏移分钟']||0}−{c['提前占用分钟']},结束−{c['窗口结束偏移分钟']||0}+{c['后延占用分钟']})；参数来源 {c['参数来源']||'逐项声明'}。</p>;})}</>}
 {table==='dependencies'&&<><p>人员技能：单组填写资源编号；多个可选组请清空资源编号，显式填写“候选人员组”（逗号分隔1–32个现有组，无默认候选，两字段互斥）。可跨候选组拆分整数人数；顺序不表示优先级。旧记录仍只绑定原组。有限回退搜索按实际窗口/班次/技能与已有占用联合扣算，达到搜索边界会明确报告，不证明全局不可行。人数为正整数。每个明确窗口使用不同“人员参与阶段”标识，可新增多行。阶段名仅为说明；实际窗口=工序开始+人员开始偏移，到工序结束−人员结束偏移（显式填写0–525600整数分钟，两偏移之和小于工时；空值须补齐，0须明确输入）。窗口外释放“是”仅占该窗口，“否”保留全工序人数。人员岗位编号用于区分独立岗位（1–64字符）：同订单同工序不同岗位并发人数相加；同一岗位的多阶段重叠按最大人数、不重叠按实际窗口占用，候选组/技能/班次须一致。旧配置留空沿用同组同技能窗口按最大人数；不同技能并发合计扣同池；无可用技能/班次/人数时顺延或未排。</p>{(data.dependencies||[]).filter(d=>d['资源类型']==='人员技能').map((d,i)=><p key={i}>预览 {d['订单编号']}/{d['工序编号']} · 岗位 {d['人员岗位编号']||'旧配置未编号'} · {d['人员参与阶段']||'单窗口'}：{d['候选人员组']?.trim()?`候选 ${d['候选人员组']}`:d['资源编号']}，{d['需求数量']} 人，所需 {d['所需技能']}；{d['窗口外释放']==='否'?'全工序保留':`[开始+${personnelOffset(d,'人员开始偏移')},结束−${personnelOffset(d,'人员结束偏移')})，窗口外释放`}。</p>)}</>}
 {['personnelGroups','personnelPools'].includes(table)&&<><p>P10核心：poolId 是稳定物理身份，名称可改，删除后编号不可复用。总人数为有限正整数人，容量来源须显式填写；适用范围填 *，每池全局只有一份容量。组人数保留为资格上限，多个组映射同池不会增加总人数。没有映射或容量时不能启用。草稿停用不代表有效；引用池未启用或未到生效时间时新运行被阻止。</p><p>P10-explicit-v2：共用是配无互斥；共用否选择人员组互斥（同池同一时段仅一个资格组）或工序互斥（同一资源批/工序可含多个岗位，跨工序互斥）。人数始终受组资格上限及池唯一容量双重限制。交接模式显式选择不设限制或窗口容量上限：固定分钟轴0–525600、[起始,结束)，窗口容量0至总人数的安全整数人；上限直接替代窗口内可用容量，不另加需求。占用选依赖声明或全工序保留，后者覆盖依赖的窗口外释放设置；释放只支持半开端点。策略版本与来源必填，保存操作者、可信角色、原因及前后版本见操作记录。新运行冻结整份配置；旧输入保持原义。旧P10核心配置须显式补齐策略才能新运行。</p><p>未启用模式：额外交接人数相加/取最大、自动交班锚点、个人资格交集、跨产线联合运行及跨试算生产预留；缺少身份/释放/事实契约，不接受自由文本公式，须保持未启用。候选跨池占用策略不一致也拒绝。下方人员条件预览不会写入或确认计划，完整联合资源影响以新试算为准。</p>{(data.personnelPools||[]).map((p,i)=><p key={i}>池 {p.poolId||'待编号'} · {p['池名称']}：唯一总量 {p['总人数']||'待填写'} 人；来源 {p['容量来源']||'待填写'}；{p['是否启用']==='是'?'已声明启用':'草稿/未启用'} · 范围 {p['适用范围']||'待填写'} · 生效 {p['生效时间']||'保存后新运行'}；成员 {(data.personnelGroups||[]).filter(g=>g.poolId===p.poolId).map(g=>`${g['人员组编号']}资格上限${g['人员数量']}人（池及本组同时约束，可提供不超过${Number.isSafeInteger(Number(p['总人数']))&&Number(p['总人数'])>0?Math.min(Number(g['人员数量']),Number(p['总人数'])):'待配置'}人）`).join('、')||'待映射'}。</p>)}</>}

 {table==='skillSubstitutions'&&<p>每行表示“可提供技能 → 所需技能”；技能须出现在人员组或需求中。“是”允许，“否”禁止；同技能匹配始终保留。适用工序填单个现有工序编号或 *；精确工序行优先于 *（含禁止行），同方向同范围禁止重复。仅单跳，不自动反向或传递。默认无替代关系。例：A→B 不能推出 B→A 或 A→C。</p>}
 <details open data-configuration-preview><summary>有效范围、参数来源与采用状态（服务端保存后刷新核对）</summary><p>{preview.note}</p>{preview.rows.filter(r=>r.table===table).map((r,i)=><section key={i}><b>第{r.row}行 · {r.state} · {r.scope}</b>{r.notes.map((n,j)=><p key={j}>{n}</p>)}<table><thead><tr><th>中文参数 / 单位见字段</th><th>有效值</th><th>来源</th></tr></thead><tbody>{r.fields.map(f=><tr key={f.field}><td>{f.field}</td><td>{f.value||'（空；必填缺项见校验提示）'}</td><td>{f.source}</td></tr>)}</tbody></table>{r.issues.map((e,j)=><p role="alert" key={j}>{e.field}：{e.message}</p>)}</section>)}</details>
 <fieldset disabled aria-label="尚未支持的组合"><legend>当前模型未支持（禁止启用；仍属待交付能力）</legend>{preview.unsupportedCombinations.map(c=><label key={c.id}><input type="checkbox" checked={false} readOnly/>{c.id}：{c.reason}</label>)}</fieldset>
 </aside>;
}
export function policyOptions(table:string,field:string):string[]|null{
 if(table==='resourceMappings'&&mappingOptions[field])return mappingOptions[field];
 if(table==='resourceClaims'&&field==='占用口径')return ['显式逐生产批完整区间','明确窗口'];
 if(table==='resourceClaims'&&field==='参数来源')return ['逐项声明','工装配置'];
 if(table==='dependencies'&&field==='窗口外释放')return ['是','否'];
 if(table==='personnelPools'&&Object.prototype.hasOwnProperty.call(poolStrategyOptions,field))return (poolStrategyOptions as Record<string,string[]>)[field];
 if(table==='personnelPools'&&['是否启用','允许共用'].includes(field))return ['是','否'];
 if(['tools','skillSubstitutions'].includes(table)&&field==='是否启用')return ['是','否'];
 return null;
}

export function policyInputSpec(table:string,field:string):{type:string;min?:number;max?:number;step?:number;unit?:string}{
 if(table==='personnelPools'&&['总人数','交接容量人数','交接起始分钟','交接结束分钟'].includes(field))return {type:'number',min:field==='总人数'?1:0,max:field.includes('分钟')?525600:Number.MAX_SAFE_INTEGER,step:1,unit:field.includes('分钟')?'分钟':'人'};
 return {type:'text'};
}
