import {useEffect, useId, useState} from 'react';
import {calculateBomLoss, displayBomLossExact as display, LOSS_KINDS, normalizeBomLossConfig, resolveBomLosses} from './lib/bom-loss-policy.mjs';
import type {BomLossConfigValue, BomLossRecipe, BomLossResult, LossKind} from './lib/bom-loss-policy.mjs';
import './BomLossConfig.css';

export type BomLossConfigProps = {
 value: BomLossConfigValue;
 recipe: BomLossRecipe;
 onSave: (next: BomLossConfigValue) => void | Promise<void>;
 disabled?: boolean;
 initialTargetKg?: string;
};
const names:Record<LossKind,string>={raw:'原料损耗',production:'生产损耗',transport:'运输损耗'};
const message=(e:unknown)=>e instanceof Error?e.message:String(e);

export function BomLossConfig({value,recipe,onSave,disabled=false,initialTargetKg=''}:BomLossConfigProps) {
 const [draft,setDraft]=useState(()=>structuredClone(value));
 const [target,setTarget]=useState(initialTargetKg);
 const [status,setStatus]=useState('');
 const [saving,setSaving]=useState(false);
 const id=useId();
 useEffect(()=>{setDraft(structuredClone(value));setStatus('');},[value]);
 let preview:BomLossResult|undefined,base:BomLossResult|undefined,error='',targetError='';
 try{base=calculateBomLoss(recipe,draft);preview=base;}catch(e){error=message(e);}
 if(base&&target!=='')try{preview=calculateBomLoss(recipe,draft,target);}catch(e){targetError=message(e);}
 const busy=disabled||saving;
 const changeUnified=(kind:LossKind,v:string)=>{setStatus('');setDraft(c=>({...c,unified:{...c.unified,[kind]:v}}));};
 const changeOverride=(materialId:string,kind:LossKind,v:string|undefined)=>{
  setStatus('');setDraft(c=>{const next=structuredClone(c);let row=next.overrides.find(r=>r.materialId===materialId);
   if(v===undefined){if(row)delete row.losses[kind];next.overrides=next.overrides.filter(r=>Object.keys(r.losses).length);}
   else {if(!row){row={materialId,losses:{}};next.overrides.push(row);}row.losses[kind]=v;}return next;});
 };
 const save=async()=>{
  if(busy||error||targetError)return;
  setSaving(true);setStatus('');
  try{const next=normalizeBomLossConfig(draft);calculateBomLoss(recipe,next);await onSave(next);setStatus('保存请求已完成');}
  catch(e){setStatus('保存未完成：'+message(e));}finally{setSaving(false);}
 };
 const yieldPercent=base?display({numerator:(BigInt(base.yield.numerator)*100n).toString(),denominator:base.yield.denominator}):'';
 return <section className="bom-loss-config" aria-label="物料损耗配置">
  <h2>物料损耗配置</h2>
  <p>配方 {recipe.recipeId} · 版本 {recipe.version} · 基准投入 {recipe.basisKg} kg · 来源 {recipe.source}</p>
  <p>损耗配置版本 {value.version} · 来源 {value.source}。标准投入定额保持原值；生产收率由逐物料生产损耗汇总。原料和运输损耗独立保存。</p>
  <fieldset disabled={busy}><legend>统一损耗（初始均为 0%，可修改）</legend>
   {LOSS_KINDS.map(k=><label key={k}>{names[k]}（%）<input aria-label={`统一${names[k]}（%）`} inputMode="decimal" value={draft.unified[k]} onChange={e=>changeUnified(k,e.target.value)} /></label>)}
  </fieldset>
  <div className="bom-loss-scroll"><table><caption>逐物料覆盖与生效来源；取消覆盖即恢复继承</caption>
   <thead><tr><th scope="col">物料 / 标准投入 kg</th>{LOSS_KINDS.map(k=><th key={k} scope="col">{names[k]}（%）</th>)}<th scope="col">基准保留产出 kg</th><th scope="col">目标投入 / 产出 kg</th></tr></thead>
   <tbody>{recipe.materials.map((m,i)=>{
    const row=draft.overrides.find(o=>o.materialId===m.materialId),result=preview?.rows.find(r=>r.materialId===m.materialId);
    let effective:ReturnType<typeof resolveBomLosses>|undefined;try{effective=resolveBomLosses(draft,m.materialId);}catch{/* Invalid drafts remain visible. */}
    return <tr key={`${m.materialId}-${i}`}><th scope="row">{m.materialId}<br/>{m.quotaKg} kg</th>
     {LOSS_KINDS.map(k=>{const own=Object.prototype.hasOwnProperty.call(row?.losses||{},k),inputId=`${id}-${i}-${k}`;return <td key={k}>
      <label><input type="checkbox" aria-label={`${m.materialId}${names[k]}覆盖`} checked={own} disabled={busy} onChange={e=>changeOverride(m.materialId,k,e.target.checked?draft.unified[k]:undefined)}/>按物料覆盖</label>
      <label htmlFor={inputId}>{m.materialId}{names[k]}（%）</label>
      <input id={inputId} aria-label={`${m.materialId}${names[k]}（%）`} inputMode="decimal" disabled={busy||!own} value={own?row?.losses[k]??'':draft.unified[k]} onChange={e=>changeOverride(m.materialId,k,e.target.value)}/>
      <small>生效：{effective?effective[k].percent+'%':'待修正'} · {own?'物料覆盖':'继承统一参数'}</small>
     </td>;})}
     <td>{result?display(result.output):'待修正'}</td><td>{result?.targetInput&&result.targetOutput?`${display(result.targetInput)} / ${display(result.targetOutput)}`:'—'}</td>
    </tr>;
   })}</tbody>
  </table></div>
  <label>目标合格产出（kg，可留空）<input aria-label="目标合格产出（kg）" inputMode="decimal" value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}/></label>
  {base&&<p data-testid="yield">基准总投入 {display(base.totalInput)} kg，保留产出 {display(base.totalOutput)} kg，派生生产收率 {yieldPercent}%。</p>}
  {base&&!base.producible&&<p role="alert">无可生产产出；请调整生产损耗。不能反算目标投入。</p>}
  {preview?.targetTotalInput&&<p>目标总投入 {display(preview.targetTotalInput)} kg，目标总产出 {display(preview.targetTotalOutput!)} kg。</p>}
  <p><small>预览小数最多显示6位，…表示未显示完；计算、保存和冻结使用精确值。</small></p>
  {(error||targetError)&&<p role="alert">{error||targetError}</p>}
  <div className="bom-loss-actions"><button type="button" disabled={busy||!!error||!!targetError} onClick={save}>{saving?'保存中…':'保存损耗配置'}</button>
   <button type="button" disabled={busy} onClick={()=>{setDraft(structuredClone(value));setStatus('已撤销未保存修改');}}>撤销修改</button></div>
  <p role="status">{status}</p>
 </section>;
}
export default BomLossConfig;
