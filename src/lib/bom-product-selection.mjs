const materialFields=fields=>fields.filter(f=>f.kind==='material');
export function unrestrictedMaterials(filters,fields){return materialFields(fields).every(f=>!filters[f.key]||filters[f.key].mode==='ALL'&&!filters[f.key].exclude?.length);}
export function productSelected(product,filters,fields){
 if(unrestrictedMaterials(filters,fields))return false;
 return selectionMatches(filters['material:'+(product.category||'未提供类别')],product);
}
export function selectionMatches(selection,product){
 const s=selection||{mode:'ALL'},q=String(product.id).toLowerCase(),name=String(product.name||'').toLowerCase();
 return Boolean(!s.exclude?.includes(product.id)&&(s.mode==='ALL'||s.values?.includes(product.id)||s.include?.includes(product.id)||s.mode==='MATCH'&&s.queries?.some(text=>q.includes(text.trim().toLowerCase())||name.includes(text.trim().toLowerCase()))));
}
function emptySelections(draft,fields,states){
 const filters={...draft.filters};
 for(const f of materialFields(fields)){
  const fingerprint=states?.[f.key.slice(9)]?.selection.fingerprint;
  if(!fingerprint)throw Error('正在读取物料筛选范围，请稍后重试。');
  filters[f.key]={mode:'NONE',fingerprint};
 }
 return filters;
}
export function changeMaterialFilter(draft,field,value,fields,states){
 // Categories form a union. The first explicit choice must clear the other
 // unrestricted categories, otherwise their ALL would keep every material.
 const filters=unrestrictedMaterials(draft.filters,fields)&&!(value.mode==='ALL'&&!value.exclude?.length)?emptySelections(draft,fields,states):{...draft.filters};
 return {...draft,filters:{...filters,[field]:value},offset:0};
}
export function toggleGalleryProduct(draft,product,fields,states){
 const field='material:'+(product.category||'未提供类别');
 const filters=unrestrictedMaterials(draft.filters,fields)?emptySelections(draft,fields,states):{...draft.filters};
 const s=filters[field]||states?.[field.slice(9)]?.selection;
 if(!s?.fingerprint)throw Error('正在读取物料筛选范围，请稍后重试。');
 const checked=!selectionMatches(s,product),next={...s,values:(s.values||[]).filter(id=>id!==product.id),include:(s.include||[]).filter(id=>id!==product.id),exclude:(s.exclude||[]).filter(id=>id!==product.id)};
 if(s.mode==='NONE'&&checked){next.mode='VALUES';next.values=[product.id];}
 else if(checked)next.include.push(product.id);else next.exclude.push(product.id);
 return {...draft,q:'',filters:{...filters,[field]:next},offset:0};
}
export function restoreGalleryProducts(draft){return {...draft,q:'',filters:Object.fromEntries(Object.entries(draft.filters).filter(([key])=>!key.startsWith('material:'))),offset:0};}
