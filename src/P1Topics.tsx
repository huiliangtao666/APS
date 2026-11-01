import {p1Capabilities,checkP1Strategies} from './lib/p1-topics-contract.mjs';
type Row=Record<string,string>;
export function P1StrategyEditor({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled:boolean}){
 let parsed:Record<string,string>={};try{const p=JSON.parse(value);if(p&&typeof p==='object'&&!Array.isArray(p))parsed=p;}catch{/* Preserve invalid raw input for explicit repair. */}
 const errors=checkP1Strategies(value);
 return <div aria-label="专题策略配置">{p1Capabilities.map(c=><label key={c.id}>{c.label}<select aria-label={c.label} disabled={disabled} value={parsed[c.id]||''} onChange={e=>onChange(JSON.stringify({...parsed,[c.id]:e.target.value}))}><option value="">请选择</option><option value="ENABLED">启用</option><option value="NOT_ENABLED">不启用</option></select><small>{c.detail}</small></label>)}
 {errors.length>0&&<p role="alert">{errors.join('；')}</p>}<details><summary>高级：策略原文</summary><input aria-label="策略原文" disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}/></details></div>;
}
export function P1Topics({profiles,profileId,onSelect}:{profiles:Row[];profileId:string;onSelect:(id:string)=>void}){
 const profile=profiles.find(p=>p['配置编号']===profileId);
 const errors=profile?checkP1Strategies(profile['策略JSON']):[];
 return <fieldset aria-label="P1 专题能力"><legend>独立模拟与专题能力 · FR041–043</legend>
 <label>需求场景<select aria-label="需求场景" value={profileId} onChange={e=>onSelect(e.target.value)}><option value="">正式订单（不自动纳入预测）</option>{profiles.map(p=><option key={p['配置编号']} value={p['配置编号']}>独立模拟 · {p['配置编号']} / {p['配置版本']}</option>)}</select></label>
 {profile&&<p>本次只计算所选场景的有效预测，不与正式订单自动叠加。配置版本 {profile['配置版本']} · 来源 {profile['来源说明']}。结果保留原需求类型与来源，仅可保存、查询、导出，不进入正式提交确认。在“数据与 CSV”维护专题配置、独立需求来源及对应预测订单。</p>}
 <details><summary>实际支持与未启用的专题</summary><ul>{p1Capabilities.map(c=><li key={c.id}><b>{c.label} · {c.status==='SUPPORTED'?'复用已有能力':c.status==='NOT_ENABLED'?'未启用':'未支持'}</b>：{c.detail}</li>)}</ul></details>
 {errors.length>0&&<p role="alert">{errors.join('；')}</p>}
 </fieldset>;
}
