import {validSupplyTime} from './expected-supply.mjs';
export const deliveryParameters={等待口径:'产品模拟交付等待分钟',质量口径:'显式订单模拟条件',有效期口径:'交付时剩余分钟'};
export const deliveryActive=(data,at)=>!!(data.rules||[]).find(r=>r['规则编号']==='DELIVERY'&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at)));
export function validateDelivery(data){
 const issues=[];const add=(row,message)=>issues.push({table:'deliveryConditions',file:'24_订单模拟交付条件.csv',row:row+2,field:'交付条件',message});
 for(const [i,r]of (data.deliveryConditions||[]).entries()){
  if(!(data.orders||[]).some(o=>o['订单编号']===r['订单编号']))add(i,'模拟交付条件须引用已存在订单');
  if(data.deliveryConditions.filter(x=>x['订单编号']===r['订单编号']).length!==1)add(i,'每订单只能有一条模拟交付条件');
  if(!['模拟合格','模拟预计可用','待检','模拟不合格'].includes(r['模拟质量状态']))add(i,'须显式声明模拟质量状态；待检或不合格不能交付');
  if(r['模拟质量状态']==='模拟预计可用'&&!r['模拟质量可用时间'])add(i,'模拟预计可用须声明可用时间');
  if(r['模拟质量可用时间']&&!validSupplyTime(r['模拟质量可用时间']))add(i,'质量可用时间须为带时区的有效 ISO 时间');
  if(r['模拟有效期截止时间']!=='不适用'&&!validSupplyTime(r['模拟有效期截止时间']))add(i,'模拟有效期须声明带时区 ISO 截止时间或不适用');
  const n=r['要求剩余有效分钟'];
  if(!/^\d+$/.test(n||'')||!Number.isSafeInteger(Number(n))||r['模拟有效期截止时间']==='不适用'&&Number(n)!==0)add(i,'要求剩余有效分钟须为非负安全整数；不适用时须为0');
 }
 return issues;
}
