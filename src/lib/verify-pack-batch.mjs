import {quantityMath as Q,feedTime} from './material-allocation.mjs';
import {inventoryBusinessDate} from './inventory.mjs';
// Frozen-source arithmetic only. No time calculator, grouping, planner or allocator.
export function verifyPackMinutes(data,time,qualifiedKg){
 if(time['计算方式']!=='包装速率')return Number(time['固定分钟']);
 const product=data.products.find(p=>p['产品编号']===time['产品编号']);
 let target=Q.fromExact(qualifiedKg);
 if(time['包装数量单位']==='支'||time['包装数量单位']==='袋')target=Q.div(target,Q.q(product['单支净重kg']));
 if(time['包装数量单位']==='袋')target=Q.div(target,Q.q(product['每袋支数']));
 if(!['kg','支','袋'].includes(time['包装数量单位']))throw Error('包装冻结数量单位无效');
 if(![time['工时时间单位'],time['速率时间单位']].every(u=>['分钟','小时'].includes(u)))throw Error('包装冻结时间单位无效');
 const speed=Q.div(Q.q(time['包装速率']),Q.q(time['速率时间单位']==='小时'?'60':'1'));
 if(Q.cmp(speed,Q.zero)<=0n)throw Error('包装冻结速率无效');
 const duration=Q.div(target,speed),configured=Q.mul(Q.q(time['包装工时']),Q.q(time['工时时间单位']==='小时'?'60':'1'));
 if(time['包装时长模式']==='按配置工时'&&Q.cmp(configured,duration)!==0n)throw Error('冻结工时×速率与目标不守恒');
 if(!['按配置工时','按目标数量'].includes(time['包装时长模式'])||duration.n%duration.d!==0n||!Number.isSafeInteger(Q.num(duration))||Q.num(duration)<=0)throw Error('包装冻结时长或分钟精度无效');
 return Q.num(duration);
}
export function verifyPackAmounts(data,order,operation,minute,batchKg,index=1){
 const time=data.times.find(t=>t['产品编号']===order['产品编号']&&t['工序编号']===operation);
 if(!time?.['包装作业边界'])return null;
 const product=data.products.find(p=>p['产品编号']===order['产品编号']);
 const eligible=data.bom.filter(b=>b['产品编号']===order['产品编号']&&b['生效日期']<=inventoryBusinessDate(feedTime(minute)));
 const date=eligible.map(b=>b['生效日期']).sort().at(-1),rows=eligible.filter(b=>b['生效日期']===date&&b['投料工序编号']===operation&&b['用量类型']==='包装物料');
 const kg=Q.fromExact(batchKg),merge=time['包装作业边界']==='同订单合并';
 return new Map(rows.map(b=>{
  const minimum=Q.q(b['最小包装单位']||'1');if(Q.cmp(minimum,Q.zero)<=0n)throw Error('冻结最小包装单位无效');
  const rounded=mass=>{
   const bags=Q.div(Q.div(mass,Q.q(product['单支净重kg'])),Q.q(product['每袋支数']));
   const required=Q.div(Q.mul(bags,Q.q(b['配置用量'])),Q.sub(Q.one,Q.q(b['损坏比例'])));
   return Q.mul(Q.ceil(Q.div(required,minimum)),minimum);
  };
  const quantity=merge?Q.sub(rounded(Q.mul(kg,Q.q(index))),index>1?rounded(Q.mul(kg,Q.q(index-1))):Q.zero):rounded(kg);
  return [b['物料编号'],quantity];
 }));
}
