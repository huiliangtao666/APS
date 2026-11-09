// A presentation subset of the existing CP catalogue, never another parameter store.
export const capacityParameterTabs=[
 ['route','工艺与工序'],['resource','设备与工装'],['crew','班组人员'],['calendar','工厂日历与停机'],
 ['global','批量与时间'],['material','物料与单位换算'],['bom','制造BOM'],['rules','其他产能规则']
].map(([id,label])=>({id,label}));
export function isCapacityParameter(cp){
 const n=Number(String(cp).slice(2));
 return n>=85&&n<=136||n>=169&&n<=179||n>=1&&n<=10||n>=14&&n<=18||n>=23&&n<=39||n===80||n===140;
}
