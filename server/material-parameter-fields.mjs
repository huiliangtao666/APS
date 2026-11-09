// Literal material facts and reference-only configuration share import, edit,
// effective-period and audit plumbing. Reference fields never enable a solver rule.
const field=(name,cp,type,extra={})=>({name,cp,type,table:'物料主数据',key:'物料编号',...extra});
const reference=(name,cp,type,extra={})=>field(name,cp,type,{candidate:true,...extra});
export const materialAtomicFields=[
 field('物料类别','CP011','enum',{unit:'枚举',values:['成品','半成品','原辅料','原料','包装材料','包材'],sharedOnly:true}),
 field('物料来源','CP012','enum',{unit:'枚举',values:['采购','制造','包装'],sharedOnly:true}),
 field('补给方式','CP013','text',{unit:'文字',sharedOnly:true}),
 field('基础单位','CP014','enum',{unit:'枚举',values:['千克','个'],sharedOnly:true}),
 reference('每袋支数','CP019','number',{unit:'支/袋',integer:true,min:0,inclusive:false}),
 reference('每箱袋数','CP019','number',{unit:'袋/箱',integer:true,min:0,inclusive:false}),
 reference('最小数量单位','CP020','number',{unit:'本行数量单位',min:0,inclusive:false}),
 reference('显示小数位','CP022','number',{unit:'位',integer:true,min:0,inclusive:true,max:12}),
 reference('显示舍入方式','CP022','text',{unit:'文字'}),
 reference('安全库存目标方式','CP055','text',{unit:'文字'}),
 reference('安全库存固定量','CP056','number',{unit:'本行数量单位',min:0,inclusive:true}),
 reference('安全库存参考需求口径','CP057','text',{unit:'文字'}),
];
