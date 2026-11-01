type Props={drafts:any[];draftEdit:any;canWrite:boolean;datasetId:string;version:number;currentDay:number;api:(path:string,body:object)=>Promise<any>;perform:(action:()=>Promise<void>)=>any;onEdit:(draft:any)=>void;onSaved:()=>Promise<void>};
export function WorkbookDrafts({drafts,draftEdit,canWrite,datasetId,version,currentDay,api,perform,onEdit,onSaved}:Props){
 const endpoint='/workbooks/datasets/'+datasetId+'/draft';
 const fields=[['quantity','数量'],['relationId','供货关系编号'],['orderDay','拟下单日'],['expiryDay','预计到期日']];
 return <div className="panel"><h2>模拟补单草稿</h2><p>仅显式“纳入试算”生成唯一条件供给身份；作废只影响未来版本。没有向供应商外发。</p>
  {drafts.map(d=><article key={d.id}><b>{d.materialId} · {d.quantity}{d.unit} · {d.status==='adopted'?'已纳入本次试算':d.status==='void'?'作废':'模拟草稿（未采用）'}</b><span> 原缺口 {d.netGap} · 拟下单 {d.orderDay} · 可用 {d.availableDay} · 晚 {d.lateDays||0} 天</span>
   <button disabled={!canWrite} onClick={()=>onEdit({...d})}>维护草稿</button>
   <button disabled={!canWrite||d.status==='adopted'} onClick={()=>perform(async()=>{await api(endpoint,{expectedVersion:version,id:d.id,action:'adopt',currentDay});await onSaved();})}>纳入试算</button>
   <button disabled={!canWrite||d.status==='void'} onClick={()=>perform(async()=>{await api(endpoint,{expectedVersion:version,id:d.id,action:'void'});await onSaved();})}>作废</button>
  </article>)}
  {draftEdit&&<div className="input-actions"><p>编辑内容尚未保存；保存后为模拟草稿，需再次显式纳入才影响新运行。旧运行保持原供给。</p>
   {fields.map(([key,label])=><label key={key}>{label}<input aria-label={'草稿-'+label} value={draftEdit[key]} onChange={e=>onEdit({...draftEdit,[key]:e.target.value})}/></label>)}
   <button disabled={!canWrite} onClick={()=>perform(async()=>{await api(endpoint,{expectedVersion:version,id:draftEdit.id,changes:Object.fromEntries(fields.map(([key])=>[key,draftEdit[key]])),currentDay});onEdit(undefined);await onSaved();})}>保存草稿</button>
   <button onClick={()=>onEdit(undefined)}>取消</button>
  </div>}
 </div>;
}
