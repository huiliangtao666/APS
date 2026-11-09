const bom=(name,relation=false)=>({name,table:'物料清单',key:'用量关系编号',readonly:true,relation});
// Directory titles can describe several columns. Resolve the real source names.
export function sourceFields(cp,d){
 return {
  CP023:[{...bom('BOM计算基准类型'),value:d.profile==='excel-qualified-output-202611-r1'?'合格产出基准':undefined}],
  CP026:[bom('生效日',true),bom('失效日',true)],
  CP027:[bom('父项编号',true),bom('子项编号',true)],
  CP028:[bom('投料位置',true)],
  CP029:[{...bom('损耗来源口径'),value:d.profile}],
  CP038:[bom('取整方式')],
  CP039:[bom('清单版本编号',true)],
 }[cp];
}
