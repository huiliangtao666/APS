import {minuteMode,minuteInstant} from './minute-validity.mjs';
import {inventoryBusinessDate,inventoryEligibility} from './inventory.mjs';
import { PLAN_TIME_ORIGIN, resolveExpectedSupply, validSupplyTime } from './expected-supply.mjs';
// Exact rational arithmetic: no tolerance, display rounding or repeated float deductions.
const q = value => {
 if (value && typeof value==='object') return value;
 const raw=String(value).trim(),s=raw.startsWith('.')?'0'+raw:raw,m=s.match(/^(\d+)(?:\.(\d*))?$/);
 if(!m)throw Error(`数量不是非负十进制：${s}`);
 return {n:BigInt(m[1]+(m[2]||'')),d:10n**BigInt((m[2]||'').length)};
};
const reduced=(n,d)=>{let a=n<0n?-n:n,b=d;while(b){const r=a%b;a=b;b=r;}return {n:n/a,d:d/a};};
const add=(a,b)=>reduced(a.n*b.d+b.n*a.d,a.d*b.d);
const sub=(a,b)=>reduced(a.n*b.d-b.n*a.d,a.d*b.d);
const mul=(a,b)=>reduced(a.n*b.n,a.d*b.d);
const div=(a,b)=>{if(b.n===0n)throw Error('除数为零');return reduced(a.n*b.d,a.d*b.n);};
const cmp=(a,b)=>a.n*b.d-b.n*a.d;
const min=(a,b)=>cmp(a,b)<0?a:b;
const num=a=>Number(a.n)/Number(a.d);
const ceil=a=>({n:(a.n+a.d-1n)/a.d,d:1n});
const zero=q('0'),one=q('1');
const exact=a=>({numerator:String(a.n),denominator:String(a.d)});
const fromExact=a=>({n:BigInt(a.numerator),d:BigInt(a.denominator)});
export const orderHasRemaining = order => cmp(q(order['合格需求']),q(order['已完成合格数量']||'0'))>0;
export const feedTime = minute => new Date(Date.parse(PLAN_TIME_ORIGIN)+minute*60000).toISOString();
const dateAt=minute=>inventoryBusinessDate(feedTime(minute)); // v0.3 factory date, including local midnight
export function materialPolicy(data,at) {
 const r=(data.rules||[]).find(r=>r['规则编号']==='MATERIAL'&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at)));
 if(!r)return null;try{return JSON.parse(r['参数JSON']||'{}');}catch{return null;}
}
export function calculateMaterialDemand(data,order,operation,minute,remainingKg,trace=()=>{}) {
 trace('orders',(data.orders||[]).includes(order)?[order]:[]);
 const product=(data.products||[]).find(p=>p['产品编号']===order['产品编号']);
 trace('products',product?[product]:[]);
 const fail=message=>{throw Error(`订单 ${order['订单编号']} / 工序 ${operation}：${message}`);};
 const all=(data.bom||[]).filter(b=>b['产品编号']===order['产品编号']&&b['生效日期']<=dateAt(minute));
 trace('bom',all);
 if(!all.length)fail('缺少已生效 BOM；物料未齐套');
 const latest=all.map(b=>b['生效日期']).sort().at(-1), versions=new Set(all.filter(b=>b['生效日期']===latest).map(b=>b['版本编号']));
 if(versions.size!==1)fail('同日存在多个 BOM 版本，不能推断采用版本');
 const bom=all.filter(b=>b['版本编号']===[...versions][0]);
 const required=(data.dependencies||[]).filter(d=>d['订单编号']===order['订单编号']&&d['工序编号']===operation&&d['资源类型']==='物料');
 trace('dependencies',required);
 for(const d of required)if(!bom.some(b=>b['投料工序编号']===operation&&b['物料编号']===d['资源编号']))fail(`物料依赖 ${d['资源编号']} 缺少 BOM 投料配置`);
 let kg=q(order['合格需求']),completed=q(order['已完成合格数量']||'0');
 if(cmp(completed,kg)>0)fail('已完成合格数量超过需求');
 kg=sub(kg,completed);
 const weight=q(product['单支净重kg']),bag=q(product['每袋支数']),yieldRate=q(product['总收率']);
 if(cmp(yieldRate,zero)<=0||cmp(yieldRate,one)>0)fail('总收率须大于零且不超过1');
 if(order['数量单位']==='支')kg=mul(kg,weight);
 else if(order['数量单位']==='袋')kg=mul(mul(kg,bag),weight);
 else if(order['数量单位']!=='kg')fail('数量单位缺少明确换算；箱不支持');
 if(remainingKg)kg=fromExact(remainingKg);
 const raw=bom.filter(b=>b['用量类型']==='BOM物料');
 if(raw.length){
  if(raw.some(b=>b['用量基准']!=='每1000kg投入'||b['用量单位']!=='kg'||b['收率/损耗口径备注']?.trim()||(String(b['损坏比例']||'').trim()&&cmp(q(b['损坏比例']),zero)!==0n)))fail('仅支持无加料的每1000kg投入；备注口径须先明确，不能推断');
  const total=raw.reduce((a,b)=>add(a,q(b['配置用量'])),zero);
  if(cmp(total,q('1000'))!==0n)fail('每1000kg投入的完整配方定额之和须为1000；不能自动归一化');
 }
 return bom.filter(b=>b['投料工序编号']===operation).map(b=>{
  let amount,formula;
  if(b['用量类型']==='BOM物料'){
   amount=mul(div(kg,yieldRate),div(q(b['配置用量']),q('1000')));formula='订单余量kg ÷ 总收率 × 定额 ÷ 1000（仅损失、无工序加料）';
  }else{
   if(b['用量基准']!=='每袋'||b['用量单位']!=='个'||b['收率/损耗口径备注']?.trim()||!String(b['损坏比例']??'').trim())fail('包材仅支持每袋/个及显式领用量中损坏比例；其他口径未定义');
   const loss=q(b['损坏比例']);if(cmp(loss,one)>=0)fail('包材损坏比例须小于1');
   const pieces=div(kg,weight),bags=div(pieces,bag);
   if(!b['最小包装单位']&&(pieces.n%pieces.d!==0n||bags.n%bags.d!==0n))fail('支/袋不是整数；基线未声明中间取整规则');
   const minimum=b['最小包装单位']?q(b['最小包装单位']):one;if(cmp(minimum,zero)<=0)fail('最小包装单位须为正数');
   amount=mul(ceil(div(div(mul(bags,q(b['配置用量'])),sub(one,loss)),minimum)),minimum);formula='向上取整（余量kg ÷ 单支净重 ÷ 每袋支数 × 定额 ÷ (1−损坏比例)）';
  }
  if(!Number.isFinite(num(amount)))fail('需求超出数值范围');
  return {orderId:order['订单编号'],productId:order['产品编号'],operation,taskId:`${order['订单编号']}-${operation}`,materialId:b['物料编号'],unit:b['用量单位'],version:b['版本编号'],effective:b['生效日期'],feedMinute:minute,feedAt:feedTime(minute),remainingKg:num(kg),quantity:num(amount),exactQuantity:exact(amount),formula};
 });
}
export function createMaterialAllocator(data,policy) {
 const used=new Map();
 for(const c of data.executionMaterials||[]){const key="inventory:"+c["批次编号"];used.set(key,add(used.get(key)||zero,q(c["累计已用数量"])));}
 const resolved=resolveExpectedSupply(data.supplies||[],data.supplyDelays||[]);
 const collisions=resolved.filter(s=>(data.inventory||[]).some(b=>b['批次编号']===s['批次编号']));
 const futureMinutes=[...(data.inventory||[]).map(b=>b['预计可用时间']),...resolved.map(s=>s['生效可用时间'])].filter(Boolean).map(t=>(Date.parse(t)-Date.parse(PLAN_TIME_ORIGIN))/60000).filter(Number.isFinite).sort((a,b)=>a-b);
 const ledger=used=>{let generation=0;return {
  futureMinutes,
  begin(){
   const base=generation,privateUsed=new Map(used),local=ledger(privateUsed),rows=[];let closed=false;
   const open=()=>{if(closed)throw Error('分配事务已结束');};
   return {stage(demands,minute,trace=()=>{}){open();const p=local.preview(demands,minute,trace);if(p.ok)p.commit();p.rows.forEach(r=>r.committed=false);rows.push(...p.rows);return {ok:p.ok,rows:p.rows};},
    commit(){open();if(base!==generation)throw Error('过期事务；须重新检查全部候选');if(rows.some(r=>r.exactShortage.numerator!=='0'))throw Error('缺料事务不能提交');for(const [k,v]of privateUsed)used.set(k,v);rows.forEach(r=>r.committed=true);generation++;closed=true;},
    rollback(){open();closed=true;},rows};
  },
  preview(demands,minute,trace=()=>{}){
   if(collisions.length){
    // Resolve preserves supply occurrence order; trace original inputs, never the derived rows.
    trace('inventory',(data.inventory||[]).filter(b=>collisions.some(s=>s['批次编号']===b['批次编号'])));
    trace('supplies',(data.supplies||[]).filter((_s,i)=>collisions.includes(resolved[i])));
    throw Error('库存与预计供给重复批次：'+collisions.map(s=>s['批次编号']).join('、'));
   }
   const baseGeneration=generation;let committed=false;const staged=new Map(used),rows=[];
   for(const demand of demands){
    let left=fromExact(demand.exactQuantity);const allocations=[];
    const lotChecks=(data.inventory||[]).filter(b=>b['物料编号']===demand.materialId).map(b=>({b,state:inventoryEligibility(b,feedTime(minute),policy['可用状态'])}));
    const excludedLots=lotChecks.filter(x=>!x.state.eligible).map(({b,state})=>({lotId:b['批次编号'],bookQuantity:b['账面数量'],occupiedQuantity:b['已占用数量'],quality:b['质量状态'],expiry:minuteMode(b)?minuteInstant(b['时间原点'],b['到期分钟']):b['有效期'],readyAt:b['预计可用时间']||'',reasons:state.reasons}));
    const inventory=lotChecks.filter(x=>x.state.eligible).map(x=>x.b).sort((a,b)=>(minuteMode(a)?minuteInstant(a['时间原点'],a['到期分钟']):a['有效期']).localeCompare(minuteMode(b)?minuteInstant(b['时间原点'],b['到期分钟']):b['有效期'])||a['批次编号'].localeCompare(b['批次编号']));
    const candidates=inventory.map(b=>({key:'inventory:'+b['批次编号'],lotId:b['批次编号'],capacity:sub(q(b['账面数量']),q(b['已占用数量'])),expiry:minuteMode(b)?minuteInstant(b['时间原点'],b['到期分钟']):b['有效期'],quality:b['质量状态'],readyAt:b['预计可用时间']||'',conditional:false}));
    if(policy['允许预计供给'])for(const use of data.supplyUses||[]){
     if(use['订单编号']!==demand.orderId||use['工序编号']!==demand.operation)continue;
     const s=resolved.find(s=>s['供给编号']===use['供给编号']);
     if(!s||s['物料编号']!==demand.materialId||!validSupplyTime(s['生效到达时间'])||!validSupplyTime(s['生效可用时间'])||Date.parse(s['生效可用时间'])<Date.parse(s['生效到达时间']))continue;
     const state=inventoryEligibility({...s,'账面数量':s['预计数量'],'已占用数量':s['已占用数量']||'0'},feedTime(minute),policy['预计状态'],{readyAt:s['生效可用时间']});
     if(!state.eligible)continue;
     candidates.push({key:'supply:'+s['供给编号'],useKey:'use:'+use['引用编号'],limit:q(use['使用数量']),supplyId:s['供给编号'],lotId:s['批次编号'],capacity:sub(q(s['预计数量']),q(s['已占用数量']||'0')),expiry:minuteMode(s)?minuteInstant(s['时间原点'],s['到期分钟']):s['有效期'],quality:s['质量状态'],readyAt:s['生效可用时间'],conditional:true});
    }
    // FEFO across eligible lots; expected supply remains explicitly earmarked and conditional.
    candidates.sort((a,b)=>a.expiry.localeCompare(b.expiry)||Number(a.conditional)-Number(b.conditional)||a.lotId.localeCompare(b.lotId));
    for(const c of candidates){
     if(cmp(left,zero)<=0)break;
     let available=sub(c.capacity,staged.get(c.key)||zero);
     if(c.useKey)available=min(available,sub(c.limit,staged.get(c.useKey)||zero));
     if(cmp(available,zero)<=0)continue;
     const amount=min(left,available);staged.set(c.key,add(staged.get(c.key)||zero,amount));if(c.useKey)staged.set(c.useKey,add(staged.get(c.useKey)||zero,amount));left=sub(left,amount);
     allocations.push({lotId:c.lotId,supplyId:c.supplyId||'',quantity:num(amount),exactQuantity:exact(amount),conditional:c.conditional,expiry:c.expiry,quality:c.quality,readyAt:c.readyAt,remaining:num(sub(c.capacity,staged.get(c.key))),exactRemaining:exact(sub(c.capacity,staged.get(c.key))),occupiedQuantity:c.conditional?'0':inventory.find(b=>b['批次编号']===c.lotId)['已占用数量'],source:c.conditional?'条件性预计供给；须按期到达且质量/效期成立，未确认到货':'模拟库存（扣除已有占用及本方案分配）'});
    }
    rows.push({...demand,allocations,excludedLots,shortage:num(left),exactShortage:exact(left),committed:false,suggestion:cmp(left,zero)>0?'建议采购/备料或推迟；不生成采购单、不确认到货':''});
   }
   const ok=rows.every(r=>r.exactShortage.numerator==='0');
   return {ok,rows,commit(){if(committed)return;if(!ok)throw Error('缺料候选不能提交');if(baseGeneration!==generation)throw Error('过期候选分配；须重新检查可用量');for(const [key,value]of staged)used.set(key,value);rows.forEach(r=>r.committed=true);committed=true;generation++;}};
  }
 };};return ledger(used);
}

// Shared exact arithmetic for FR021; values remain rational until display.
export const quantityMath={q,add,sub,mul,div,cmp,min,num,exact,fromExact,ceil,zero,one};

// Decimal inputs subtract exactly; book stock remains the original pre-consumption basis.
export function executionInventory(data){
 const decimal=a=>{let n=a.n,d=a.d,s='';const whole=n/d;n%=d;if(n){s='.';while(n){n*=10n;s+=String(n/d);n%=d;}}return String(whole)+s;};
 return (data.inventory||[]).map(lot=>{const consumed=(data.executionMaterials||[]).filter(c=>c['批次编号']===lot['批次编号']).reduce((v,c)=>add(v,q(c['累计已用数量'])),zero);return {...lot,'账面数量':decimal(sub(q(lot['账面数量']),consumed))};});
}
export function remainingExecutionDemand(data,order,operation,minute){
 const fact=(data.executionFacts||[]).find(f=>f['订单编号']===order['订单编号']&&f['工序编号']===operation);
 const demands=executionMaterialDemand(data,order,operation,fact?Number(fact['开始分钟']):minute);
 return demands.map(d=>{const consumed=(data.executionMaterials||[]).filter(c=>c['事实编号']===fact?.['事实编号']&&c['物料编号']===d.materialId).reduce((v,c)=>add(v,q(c['累计已用数量'])),zero);const amount=sub(fromExact(d.exactQuantity),consumed);if(cmp(amount,zero)<0)throw Error('耗料超定额，须核对');return {...d,feedMinute:minute,feedAt:feedTime(minute),quantity:num(amount),exactQuantity:exact(amount),executionConsumed:num(consumed),exactExecutionConsumed:exact(consumed),formula:d.formula+'；减同任务已记录累计耗料（不再扣减工序产出，避免双计）'};});
}

// Scrap is cumulative unusable operation output in the order unit, separate from usable output.
// This explicit simulation assumption applies only to this operation; never to other stages.
export function executionMaterialDemand(data,order,operation,minute,trace=()=>{}){
 trace('orders',order?[order]:[]);
 const fact=(data.executionFacts||[]).find(f=>f['订单编号']===order['订单编号']&&f['工序编号']===operation);
 trace('executionFacts',fact?[fact]:[]);
 const scrap=q(fact?.['累计报废数量']||'0');
 if(cmp(scrap,zero)===0n)return calculateMaterialDemand(data,order,operation,minute,undefined,trace);
 if(fact['报废补做口径']!=='按本工序BOM补做')throw Error('报废补做口径未核对，禁止推断补料');
 const demand=q(order['合格需求']);if(cmp(demand,zero)<=0)throw Error('报废订单需求无效');
 // Re-evaluate the original BOM with an exact expanded order-unit quantity so package rounding,
 // declared yield and kg/piece/bag conversion remain in the canonical demand calculator.
 const expanded=add(demand,scrap);let n=expanded.n%expanded.d;let text=String(expanded.n/expanded.d);
 if(n){text+='.';while(n){n*=10n;text+=String(n/expanded.d);n%=expanded.d;}}
 return calculateMaterialDemand(data,{...order,'合格需求':text},operation,minute,undefined,trace).map(row=>({...row,formula:row.formula+'；显式模拟仅本工序（需求+累计报废）重新按BOM计算；非质量确认'}));
}
