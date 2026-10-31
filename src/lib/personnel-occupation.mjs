// H-P04 is explicit per dependency (order, operation, post/phase). Old rows keep
// their saved participation-only contract; extensions never get inferred values.
export const occupationOrders=['先扩展占用再检查可用性','先检查可用性再扩展占用'];
export const occupationScopes=['参与窗口','完整工序'];
export const occupationFields=['人员占用基准','人员检查顺序','人员配置来源','人员配置版本'];
const minute=v=>typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)<=525600;
export const hasOccupation=r=>occupationFields.some(k=>String(r[k]??'').trim())||['提前占用分钟','后延占用分钟'].some(k=>r[k]!==undefined&&r[k]!==''&&r[k]!=='0');
export function occupationErrors(r){
 if(!hasOccupation(r))return [];
 const errors=[];
 for(const k of ['提前占用分钟','后延占用分钟'])if(!minute(r[k]))errors.push([k,'人员窗外占用须显式填写0–525600整数分钟；不补默认值']);
 if(!occupationScopes.includes(r['人员占用基准']))errors.push(['人员占用基准','显式选择参与窗口或完整工序；不推定适用范围']);
 if(!occupationOrders.includes(r['人员检查顺序']))errors.push(['人员检查顺序','须显式选择两种受支持顺序；最终均检查完整占用']);
 for(const k of ['人员配置来源','人员配置版本'])if(typeof r[k]!=='string'||!r[k].trim()||r[k]!==r[k].trim())errors.push([k,'须填写可追溯的配置来源及版本']);
 return errors;
}
export function occupationInterval(r,start,end){
 const errors=occupationErrors(r);if(errors.length)throw Error(errors.map(([k,m])=>k+' '+m).join('；'));
 const configured=hasOccupation(r),whole=r['窗口外释放']==='否'||r['人员占用基准']==='完整工序';
 const baseStart=whole?start:start+Number(r['人员开始偏移']||0),baseEnd=whole?end:end-Number(r['人员结束偏移']||0);
 return {baseStart,baseEnd,start:baseStart-(configured?Number(r['提前占用分钟']):0),end:baseEnd+(configured?Number(r['后延占用分钟']):0),configured};
}
