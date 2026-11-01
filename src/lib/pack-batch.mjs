import {quantityMath as Q} from './material-allocation.mjs';

export const packTimeFields=['包装工时','工时时间单位','包装速率','速率时间单位','包装数量单位','包装时长模式','包装作业边界','配置版本','数据性质'];
export const packNote='CR-PACK-BATCH：包装数量=工时×速率；按目标数量反推时长，或配置工时须恰好覆盖目标。分钟/小时及 kg/支/袋显式匹配，不叠乘效率。包装作业边界选逐生产批或同订单合并，仅顺序路线末工序；包材最小单位在BOM配置。设备不足批处理选允许实际量，仍核最大容量、程序、资源和等待；固定热程序不缩短。新增值须标明显式可替换mock或业务配置并递增配置版本。';
export const packRequested=data=>(data.times||[]).some(t=>t['计算方式']==='包装速率'||t['包装作业边界']);
export const timeFor=(data,product,op)=>(data.times||[]).find(t=>t['产品编号']===product&&t['工序编号']===op);
export const partialAllowed=m=>m?.['不足批处理']==='允许实际量';
const positive=(v,label)=>{const x=Q.q(v);if(Q.cmp(x,Q.zero)<=0n||!Number.isFinite(Q.num(x)))throw Error(label+'须为正有限十进制');return x;};
const minuteFactor=unit=>{if(!['分钟','小时'].includes(unit))throw Error('时间单位须显式为分钟或小时');return Q.q(unit==='小时'?'60':'1');};
export function packTarget(data,product,kg,unit){
 const p=data.products.find(p=>p['产品编号']===product);if(!p)throw Error('包装产品缺失');
 if(unit==='kg')return kg;
 if(!['支','袋'].includes(unit))throw Error('包装数量单位仅采用现有kg/支/袋换算；不推断新单位');
 const pieces=Q.div(kg,positive(p['单支净重kg'],'单支净重'));
 return unit==='支'?pieces:Q.div(pieces,positive(p['每袋支数'],'每袋支数'));
}
export function operationDuration(data,product,operation,kg){
 const t=timeFor(data,product,operation);if(!t)throw Error('缺少工时配置');
 if(t['计算方式']!=='包装速率')return Number(t['固定分钟']);
 const rate=positive(t['包装速率'],'包装速率'),configured=positive(t['包装工时'],'包装工时');
 const configuredMinutes=Q.mul(configured,minuteFactor(t['工时时间单位'])),perMinute=Q.div(rate,minuteFactor(t['速率时间单位']));
 const target=packTarget(data,product,Q.fromExact(kg),t['包装数量单位']);
 let duration;
 if(t['包装时长模式']==='按目标数量')duration=Q.div(target,perMinute);
 else if(t['包装时长模式']==='按配置工时'){
  if(Q.cmp(Q.mul(configuredMinutes,perMinute),target)!==0n)throw Error('配置工时×速率与实际目标不等；不超产或少产');duration=configuredMinutes;
 }else throw Error('包装时长模式须显式配置');
 // Current complete-route time grid is integer minutes. Never silently round.
 if(duration.n%duration.d!==0n||!Number.isSafeInteger(Q.num(duration))||Q.num(duration)<=0)throw Error('包装反推时长须精确落入现有正整数分钟；请显式调整mock工时或速率，不自动取整');
 return Q.num(duration);
}
export function validatePackBatch(data){
 const issues=[],add=(table,i,field,message)=>issues.push({table,row:i+2,field,code:'INPUT / PACK_BATCH',message});
 for(const [i,t]of (data.times||[]).entries()){
  if(!t['包装作业边界']&&t['计算方式']!=='包装速率')continue;
  try{
   if(!['逐生产批','同订单合并'].includes(t['包装作业边界']))throw Error('包装作业边界须显式为逐生产批或同订单合并');
   if(!/^[1-9]\d*$/.test(t['配置版本']||'')||!Number.isSafeInteger(Number(t['配置版本']))||!['显式可替换mock','业务配置'].includes(t['数据性质']))throw Error('包装配置须有安全正整数版本及明确数据性质');
   const route=data.routes.filter(r=>r['产品编号']===t['产品编号']);
   if(!route.some(r=>r['工序编号']===t['工序编号'])||route.some(r=>r['前序工序']===t['工序编号']))throw Error('当前包装作业只采用顺序路线末工序，不扩任意节点');
   if((data.bom||[]).some(b=>b['产品编号']===t['产品编号']&&b['投料工序编号']===t['工序编号']&&b['用量类型']==='包装物料'&&!b['最小包装单位']))throw Error('显式包装作业须配置各包材最小包装单位，不推定新默认');
   if(t['计算方式']==='包装速率'){
    positive(t['包装速率'],'包装速率');positive(t['包装工时'],'包装工时');minuteFactor(t['工时时间单位']);minuteFactor(t['速率时间单位']);
    if(!['kg','支','袋'].includes(t['包装数量单位'])||!['按目标数量','按配置工时'].includes(t['包装时长模式']))throw Error('包装单位或时长模式无效');
   }
  }catch(e){add('times',i,'包装作业边界',e.message);}
 }
 for(const [i,m]of (data.machines||[]).entries())if(m['不足批处理']&&!['允许实际量','报问题'].includes(m['不足批处理']))add('machines',i,'不足批处理','不足批处理仅接受允许实际量或报问题');
 for(const [i,b]of (data.bom||[]).entries())if(b['最小包装单位'])try{
  if(b['用量类型']!=='包装物料'||b['用量单位']!=='个')throw Error('最小包装单位仅用于现有包材个单位');positive(b['最小包装单位'],'最小包装单位');
  const t=timeFor(data,b['产品编号'],b['投料工序编号']);if(!t?.['包装作业边界'])throw Error('最小包装单位须关联显式包装作业边界');
 }catch(e){add('bom',i,'最小包装单位',e.message);}
 return issues;
}

export function packTransition(before,after,records=[]){
 const issues=[];
 for(const [i,t]of (after.times||[]).entries()){
  const old=(before.times||[]).find(r=>r['产品编号']===t['产品编号']&&r['工序编号']===t['工序编号']);
  if(!old||JSON.stringify(old)===JSON.stringify(t)||!old['包装作业边界']&&!t['包装作业边界'])continue;
  const versions=[old,...records.filter(r=>r.target==='times').flatMap(r=>[...(r.before||[]),...(r.after||[])])]
   .filter(r=>r['产品编号']===t['产品编号']&&r['工序编号']===t['工序编号']).map(r=>Number(r['配置版本']||0));
  if(!t['包装作业边界']||Number(t['配置版本'])<=Math.max(0,...versions))issues.push({table:'times',row:i+2,field:'配置版本',code:'INPUT / PACK_VERSION',message:'包装配置修改须递增版本，不能删除作业边界或复用旧版本；历史方案保持冻结'});
 }
 return issues;
}
