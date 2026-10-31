import {validSupplyTime,PLAN_TIME_ORIGIN} from './expected-supply.mjs';
// Original minute strings are retained. Only exactly representable millisecond
// offsets enter the existing ISO-time runtime; no rounding or date truncation.
export const minuteValidityFields=['时效模式','时间原点','到达分钟','可用分钟','到期分钟','到期边界'];
export const minuteMode=r=>r['时效模式']==='显式分钟';
export function minuteInstant(origin,raw){
 if(!validSupplyTime(origin)||typeof raw!=='string'||!/^\d+(?:\.\d{1,12})?$/.test(raw)||Number(raw)>525600)throw Error('须显式0–525600分钟及带时区原点');
 const [w,f='']=raw.split('.'),n=BigInt(w+f)*60000n,den=10n**BigInt(f.length);
 if(n%den!==0n)throw Error('分钟值超出当前毫秒时钟精度；保留原文，禁止舍入');
 return new Date(Date.parse(origin)+Number(n/den)).toISOString().replace('.000Z','Z');
}
export function validateMinuteValidity(r){
 const problems=[];
 if(!minuteMode(r)){if(minuteValidityFields.some(f=>r[f]?.trim()))problems.push('时效模式须显式分钟；日期模式不能隐藏分钟参数');return problems;}
 if(r['时间原点']!==PLAN_TIME_ORIGIN)problems.push('须显式采用既有固定分钟原点 '+PLAN_TIME_ORIGIN+'；不随运行下界重置');
 if(r['有效期']?.trim())problems.push('分钟时效的日期有效期须留空，不能同时声明两种边界');
 if(!['截止前','含截止'].includes(r['到期边界']))problems.push('到期边界须明确选择截止前或含截止；没有默认值');
 try{
  const times=['到达分钟','可用分钟','到期分钟'].map(f=>Date.parse(minuteInstant(r['时间原点'],r[f])));
  if(times[1]<times[0]||times[2]<times[1])problems.push('须到达≤可用≤到期');
  const arrival=r['预计到达时间'],ready=r['预计可用时间'];
  if(arrival&&Date.parse(arrival)!==times[0]||!ready||Date.parse(ready)!==times[1])problems.push('ISO到达/可用须逐值等于原点加显式分钟，不允许截日或舍入');
 }catch(e){problems.push(e.message);}
 return problems;
}
