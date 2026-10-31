import {sourceRefs} from './problem-records.mjs';
// v0.3 original09 source records; deliberately separate from versioned calculation BOM.
export const originalBomDef={key:'originalBom',label:'原09 物料BOM资料（未映射计算）',file:'09_物料BOM配置.csv',fields:['产品编号','物料编号','投料工序','计量基准','定额','损坏比例']};
export const originalBomNote='原09按六列原值保存，不生成现行BOM版本、生效日期、用量类型或单位。计量基准为显式来源文本；定额为正十进制数，损坏比例为0到1之间（不含1）的十进制比例。产品、物料和产品所属投料工序须已存在。来源保存不表示基准/单位/收率/损失组合已获计算批准；不参与排程用量计算。库存仍为09_库存批次.csv（v0.3原13）。';
export function validateOriginalBom(data){
 const issues=[];
 (data.originalBom||[]).forEach((r,index)=>{
  const add=(field,message)=>issues.push({relatedRecords:sourceRefs('originalBom',[r],data.originalBom),table:'originalBom',file:originalBomDef.file,row:index+2,field,message});
  for(const field of originalBomDef.fields)if(!r[field]?.trim())add(field,'必填；不补默认值');
  for(const field of ['定额','损坏比例']){
   const v=r[field]?.trim();
   if(v&&(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)||!Number.isFinite(Number(v))||(field==='定额'?Number(v)<=0:Number(v)>=1)))add(field,field==='定额'?'须为大于零的有限十进制数；不接受单位、指数或取整':'须为0到1之间（不含1）的十进制比例；不接受百分号或指数');
  }
  if(r['产品编号']&&!(data.products||[]).some(p=>p['产品编号']===r['产品编号']))add('产品编号','引用不存在的产品编号');
  if(r['物料编号']&&!(data.materials||[]).some(p=>p['物料编号']===r['物料编号']))add('物料编号','引用不存在的物料编号');
  if(r['投料工序']&&!(data.routes||[]).some(p=>p['产品编号']===r['产品编号']&&p['工序编号']===r['投料工序']))add('投料工序','该产品没有此投料工序；不能仅按同名工序匹配');
 });
 return issues;
}
