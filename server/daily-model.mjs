import {requireThat as need, fingerprint, date, nextDate, atoms, amount, id} from './simulator/contract.mjs';

export const DOMAINS=['demand','inventory','production','replenishment'];
export const sourceToken=d=>fingerprint({id:d.id,version:d.version,parameterRevision:d.parameterRevision||0,tables:d.tables,mapping:d.mapping??null});
export function newDaily(input,opening,source){
 need(input.isolated===true,'DAILY_ISOLATED_TARGET','isolated','请选择隔离仿真目标');
 date(input.startDate);date(input.endDate);date(input.dayZero);
 need(input.startDate<=input.endDate&&input.dayZero<input.startDate,'DAILY_DATE_RANGE','date','期初须早于首业务日');
 need(input.granularity==='day'||input.granularity==='minute','DAILY_GRANULARITY','granularity','须明确原排程粒度');
 need(Number.isInteger(input.windowDays)&&input.windowDays>0,'DAILY_WINDOW','windowDays','须明确滚动窗口');
 const b={id:id(input.id,'branch'),scenario:id(input.scenario,'scenario'),datasetId:source.id,date:input.startDate,startDate:input.startDate,endDate:input.endDate,dayZero:input.dayZero,granularity:input.granularity,windowDays:input.windowDays,revision:0,sourceToken:sourceToken(source),opening:structuredClone(opening),state:structuredClone(opening),confirmations:{},domainRevisions:Object.fromEntries(DOMAINS.map(k=>[k,0])),facts:{},events:[],history:[],adopted:null,candidate:null,ended:false,parent:null};
 need(opening.materials&&opening.lots&&opening.demands&&opening.purchases&&opening.tasks,'DAILY_OPENING','opening','须明确期初各账及物料精度，不推断现场值');
 for(const [key,m]of Object.entries(opening.materials)){id(key,'material');need(m.unit&&[1,10,100,1000,10000,100000,1000000].includes(m.scale),'DAILY_UNIT','materials.'+key,'须明确基础单位与精度');}
 b.state.movements=[];b.opening.movements=[];const wips=b.state.tasks.filter(t=>t.openingWip);if(wips.length)b.adopted={kind:'EXPLICIT_OPENING_WIP',taskIds:wips.map(t=>t.id)};b.state.resources??=[];b.opening.resources??=[];reconcile(b);return b;
}
const material=(b,key)=>{const m=b.state.materials[key];need(m,'DAILY_REFERENCE',key,'未知物料');return m;};
const find=(rows,key)=>{const r=rows.find(r=>r.id===key);need(r,'DAILY_REFERENCE',key,'找不到业务对象');return r;};
const quant=(b,value,key)=>atoms(value,material(b,key),key);
function change(b,row,key,delta){row[key]=amount(quant(b,row[key],row.materialId)+delta,material(b,row.materialId));}
function move(b,l,delta,kind,fact){change(b,l,'quantity',delta);b.state.movements.push({id:fact.id,source:fact.source,date:b.date,lotId:l.id,materialId:l.materialId,quantity:delta/material(b,l.materialId).scale,unit:material(b,l.materialId).unit,kind});}
export function invalidate(b,domains){for(const domain of domains){delete b.confirmations[domain];b.domainRevisions[domain]++;}if(b.candidate)b.candidate.stale=true;}
export function synchronize(b,d){const token=sourceToken(d);if(token!==b.sourceToken){invalidate(b,DOMAINS);b.sourceToken=token;}}
export function confirm(b,domain,source,unchanged){need(DOMAINS.includes(domain),'DAILY_DOMAIN',domain,'未知领域');need(source&&typeof unchanged==='boolean','DAILY_CONFIRM_SOURCE',domain,'须明确确认来源及是否无变化');b.confirmations[domain]={revision:b.domainRevisions[domain],source,unchanged,date:b.date,sourceToken:b.sourceToken};}
export function ready(b){return !b.ended&&DOMAINS.every(k=>b.confirmations[k]?.revision===b.domainRevisions[k]);}
export function feedback(b,f){
 need(!b.ended,'DAILY_ENDED','date','本期已结束');id(f.id,'fact.id');need(f.source&&f.occurredDate&&f.knownDate&&f.effectiveDate,'DAILY_FACT_SOURCE','fact','须有来源、发生/可知/生效日');
 for(const k of ['occurredDate','knownDate','effectiveDate'])date(f[k]);
 need(f.occurredDate<=f.knownDate&&f.knownDate<=b.date&&f.effectiveDate<=b.date,'DAILY_FUTURE_FACT',f.id,'未来未知或未生效事实不得提前入账');
 const content=fingerprint({type:f.type,data:f.data,occurredDate:f.occurredDate,effectiveDate:f.effectiveDate}),old=b.facts[f.id];
 if(old){need(old.hash===content,'DAILY_IDENTITY_CONFLICT',f.id,'同业务身份异内容，须明确更正',409);return {duplicate:true,delta:0};}
 const d=f.data;need(d&&typeof d==='object','DAILY_FACT_DATA',f.id,'须有业务载荷');let delta=0,domains=['inventory','production','replenishment'];
 if(['consume','output','ship','stocktake','quality','scrap','expire'].includes(f.type)){
  if(f.type==='output'){
   const t=find(b.state.tasks,d.taskId);need(b.adopted&&b.adopted.taskIds.includes(t.id),'DAILY_PLAN_REQUIRED',t.id,'实际生产须引用当前采用的稳定作业');
   const n=quant(b,d.cumulative,t.materialId),before=quant(b,t.output||0,t.materialId);delta=n-before;need(delta>=0,'DAILY_CUMULATIVE_REGRESSION',t.id,'累计更正须另列更正依据');
   need(n<=quant(b,t.limit,t.materialId),'DAILY_OUTPUT_LIMIT',t.id,'产出超过采用作业数量');
   need(Array.isArray(t.recipe)&&t.recipe.length>0,'DAILY_BOM_REQUIRED',t.id,'须冻结真实作业投料来源');
   for(const r of t.recipe){const used=quant(b,t.historicalConsumed?.[r.materialId]||0,r.materialId)+b.state.lots.filter(l=>l.materialId===r.materialId).reduce((v,l)=>v+quant(b,t.consumed?.[l.id]||0,r.materialId),0);need(used>=quant(b,d.cumulative*r.perOutput,r.materialId),'DAILY_INPUT_REQUIRED',r.materialId,'实际投料不足，不从计划猜耗料');}
   const l=b.state.lots.find(l=>l.id===d.lotId);need(!l||l.taskId===t.id,'DAILY_LOT_CONFLICT',d.lotId,'成品批次来源冲突');
   need(d.location&&d.expiresDate&&['pending','qualified'].includes(d.quality),'DAILY_LOT_SOURCE',f.id,'须明确库位、效期、质量依据');date(d.expiresDate);
   const target=l||{id:id(d.lotId,'lot'),materialId:t.materialId,quantity:0,pending:0,qualified:0,frozen:0,reserved:0,expiresDate:d.expiresDate,location:d.location,taskId:t.id};if(!l)b.state.lots.push(target);
   need(target.expiresDate===d.expiresDate&&target.location===d.location,'DAILY_LOT_CONFLICT',d.lotId,'同批次属性不得静默变更');change(b,target,d.quality,delta);move(b,target,delta,'OUTPUT',f);t.output=d.cumulative;
  }else{
   const l=find(b.state.lots,d.lotId),m=material(b,l.materialId);
   if(f.type==='consume'){
    const t=find(b.state.tasks,d.taskId);need(b.adopted&&b.adopted.taskIds.includes(t.id),'DAILY_PLAN_REQUIRED',t.id,'耗料须引用已采用作业');
    const n=quant(b,d.cumulative,l.materialId),before=quant(b,t.consumed?.[l.id]||0,l.materialId);delta=n-before;need(delta>=0,'DAILY_CUMULATIVE_REGRESSION',f.id,'累计不得倒退，使用有依据的更正');
    need(l.expiresDate>b.date&&delta<=quant(b,l.qualified-l.reserved,l.materialId),'DAILY_STOCK_UNAVAILABLE',l.id,'可用批次不足或已过期');change(b,l,'qualified',-delta);move(b,l,-delta,'CONSUME',f);(t.consumed??={})[l.id]=d.cumulative;
   }else if(f.type==='ship'){
    const demand=find(b.state.demands,d.demandId);need(demand.materialId===l.materialId,'DAILY_UNIT',f.id,'发运物料须相同');delta=quant(b,d.cumulative,l.materialId)-quant(b,demand.shipped,l.materialId);need(delta>=0&&delta<=quant(b,demand.required-demand.cancelled-demand.shipped,l.materialId),'DAILY_OVER_SHIP',f.id,'累计发运越界');need(l.expiresDate>b.date&&delta<=quant(b,l.qualified-l.reserved,l.materialId),'DAILY_STOCK_UNAVAILABLE',l.id,'发货可用库存不足');change(b,l,'qualified',-delta);move(b,l,-delta,'SHIP',f);demand.shipped=d.cumulative;domains.push('demand');
   }else if(f.type==='quality'){
    delta=quant(b,d.quantity,l.materialId);need(['pending','frozen'].includes(d.from)&&d.disposition&&delta<=quant(b,l[d.from],l.materialId),'DAILY_QUALITY',f.id,'须明确放行依据及数量');change(b,l,d.from,-delta);change(b,l,'qualified',delta);
   }else if(f.type==='expire'){need(l.expiresDate<=b.date,'DAILY_EXPIRY',l.id,'尚未到期');}
   else if(f.type==='stocktake'){
    need(d.disposition&&['pending','qualified','frozen'].includes(d.category),'DAILY_STOCKTAKE',f.id,'须有盘点依据和调整质量类别');delta=atoms(d.quantity,m,f.id)-atoms(l.quantity,m,f.id);change(b,l,d.category,delta);move(b,l,delta,'STOCKTAKE',f);
   }else{need(d.disposition&&['pending','qualified','frozen'].includes(d.category),'DAILY_SCRAP',f.id,'须有报废处置及类别');delta=quant(b,d.quantity,l.materialId);change(b,l,d.category,-delta);move(b,l,-delta,'SCRAP',f);}
  }
 }else applyOther(b,f);
 b.facts[f.id]={hash:content,source:f.source,channel:f.channel??'online',date:b.date,fact:structuredClone(f)};invalidate(b,domains);reconcile(b);const mid=d.lotId?b.state.lots.find(l=>l.id===d.lotId)?.materialId:null;return {duplicate:false,delta:mid?delta/material(b,mid).scale:delta};
}

function applyOther(b,f){
 const d=f.data;
 switch(f.type){
  case 'demand':{need(!b.state.demands.some(r=>r.id===d.id),'DAILY_OBJECT_EXISTS',d.id,'需求已存在');material(b,d.materialId);quant(b,d.required,d.materialId);date(d.dueDate);need(d.customer,'DAILY_DEMAND_SOURCE',d.id,'须有客户');b.state.demands.push({...structuredClone(d),shipped:0,cancelled:0});invalidate(b,['demand']);break;}
  case 'demand-cancel':{const r=find(b.state.demands,d.id),n=quant(b,d.quantity,r.materialId);need(d.disposition&&n<=quant(b,r.required-r.shipped-r.cancelled,r.materialId),'DAILY_DEMAND_RANGE',r.id,'取消须有依据且不超过净未交');change(b,r,'cancelled',n);invalidate(b,['demand']);break;}
  case 'demand-revise':{const r=find(b.state.demands,d.id);need(d.disposition,'DAILY_REVISION_REASON',f.id,'须有修订依据');quant(b,d.required,r.materialId);need(d.required>=r.shipped+r.cancelled,'DAILY_DEMAND_RANGE',r.id,'有效需求不得小于已发/取消');r.required=d.required;invalidate(b,['demand']);break;}
  case 'purchase-draft':{need(!b.state.purchases.some(r=>r.id===d.id),'DAILY_OBJECT_EXISTS',d.id,'采购已存在');material(b,d.materialId);need(d.quantity>0&&d.quantity>=d.moq&&d.multiple>0&&Math.abs(d.quantity/d.multiple-Math.round(d.quantity/d.multiple))<1e-9,'DAILY_PURCHASE_MULTIPLE',d.id,'须遵守显式MOQ/倍数');quant(b,d.quantity,d.materialId);date(d.dueDate);need(d.receipt&&d.receipt.location&&d.receipt.expiresDate&&['pending','qualified'].includes(d.receipt.quality)&&d.receipt.disposition,'DAILY_RECEIPT_POLICY',d.id,'须明确仿真收货库位、效期和质量依据');date(d.receipt.expiresDate);b.state.purchases.push({...structuredClone(d),ordered:d.quantity,received:0,cancelled:0,status:'draft',issued:false});break;}
  case 'purchase-issue':{const p=find(b.state.purchases,d.id);need(!p.issued,'DAILY_PURCHASE_STATE',d.id,'仅草稿可生效');p.issued=true;p.status='effective';break;}
  case 'purchase-cancel':{const p=find(b.state.purchases,d.id);const n=quant(b,d.quantity,p.materialId);need(d.disposition&&n<=quant(b,p.ordered-p.received-p.cancelled,p.materialId),'DAILY_PURCHASE_RANGE',d.id,'取消只能作用未收余量');change(b,p,'cancelled',n);break;}
  case 'purchase-delay':{const p=find(b.state.purchases,d.id);need(d.disposition,'DAILY_REVISION_REASON',d.id,'须明确延期依据');date(d.dueDate);p.dueDate=d.dueDate;break;}
  case 'receive':{
   const p=find(b.state.purchases,d.id),n=quant(b,d.quantity,p.materialId);need(p.issued&&n>0&&n<=quant(b,p.ordered-p.received-p.cancelled,p.materialId),'DAILY_RECEIPT_RANGE',p.id,'未生效或超收');
   const lotId=id(d.receiptId,'receiptId');need(!b.state.lots.some(l=>l.id===lotId),'DAILY_RECEIPT_IDENTITY',lotId,'同实物必须用同业务回执查询，不双收');
   const policy=d.receipt||p.receipt;need(policy?.location&&policy.expiresDate&&policy.disposition&&['pending','qualified'].includes(policy.quality),'DAILY_RECEIPT_POLICY',p.id,'缺收货质量/库位/效期依据');date(policy.expiresDate);
   const l={id:lotId,materialId:p.materialId,purchaseId:p.id,quantity:0,pending:0,qualified:0,frozen:0,reserved:0,expiresDate:policy.expiresDate,location:policy.location};change(b,l,policy.quality,n);b.state.lots.push(l);move(b,l,n,'RECEIVE',f);change(b,p,'received',n);p.status=p.received+p.cancelled===p.ordered?'received':'partial';break;
  }
  case 'lot-location':{const l=find(b.state.lots,d.lotId);need(d.location&&d.disposition,'DAILY_LOCATION',l.id,'须明确库位和更正依据');l.location=d.location;break;}
  case 'resource':{need(typeof d.ready==='boolean'&&d.disposition,'DAILY_RESOURCE',d.id,'须明确资源事实/依据');const r=b.state.resources.find(r=>r.id===d.id);if(r)Object.assign(r,d);else b.state.resources.push(structuredClone(d));break;}
  default:need(false,'DAILY_FACT_TYPE',f.type,'未支持的反馈类型，未写入');
 }
}
export function balances(b){
 return Object.entries(b.state.materials).map(([materialId,m])=>{
  const lots=b.state.lots.filter(l=>l.materialId===materialId),opening=b.opening.lots.filter(l=>l.materialId===materialId).reduce((n,l)=>n+atoms(l.quantity,m,l.id),0),movements=b.state.movements.filter(r=>r.materialId===materialId),net=movements.reduce((n,r)=>n+Math.sign(r.quantity)*atoms(Math.abs(r.quantity),m,r.id),0),ending=lots.reduce((n,l)=>n+atoms(l.quantity,m,l.id),0);
  return {materialId,unit:m.unit,opening:opening/m.scale,actualIn:movements.filter(r=>r.quantity>0).reduce((n,r)=>n+r.quantity,0),actualOut:movements.filter(r=>r.quantity<0).reduce((n,r)=>n-r.quantity,0),physical:ending/m.scale,available:lots.filter(l=>l.expiresDate>b.date).reduce((n,l)=>n+atoms(l.qualified-l.reserved,m,l.id),0)/m.scale,transit:b.state.purchases.filter(p=>p.issued&&p.materialId===materialId).reduce((n,p)=>n+p.ordered-p.received-p.cancelled,0),conditional:b.state.purchases.filter(p=>!p.issued&&p.materialId===materialId).reduce((n,p)=>n+p.ordered,0),difference:(ending-opening-net)/m.scale};
 });
}
export function reconcile(b){
 for(const l of b.state.lots){const m=material(b,l.materialId);need(atoms(l.quantity,m,l.id)===atoms(l.pending,m,l.id)+atoms(l.qualified,m,l.id)+atoms(l.frozen,m,l.id)&&atoms(l.reserved,m,l.id)<=atoms(l.qualified,m,l.id),'DAILY_LOT_BALANCE',l.id,'实物/质量分类/占用不守恒');date(l.expiresDate);need(l.location,'DAILY_LOCATION',l.id,'缺库位');}
 for(const p of b.state.purchases)need(quant(b,p.received,p.materialId)+quant(b,p.cancelled,p.materialId)<=quant(b,p.ordered,p.materialId),'DAILY_PURCHASE_BALANCE',p.id,'采购不守恒');
 for(const d of b.state.demands)need(quant(b,d.shipped,d.materialId)+quant(b,d.cancelled,d.materialId)<=quant(b,d.required,d.materialId),'DAILY_DEMAND_BALANCE',d.id,'需求不守恒');
 need(balances(b).every(r=>r.difference===0),'DAILY_CONSERVATION','balances','收发存不守恒');return true;
}
export function closeDay(input,request){
 const b=structuredClone(input);need(!b.ended,'DAILY_ENDED','date','本期已结束');need(ready(b),'DAILY_CONFIRMATIONS','confirmations','四领域尚有待确认项');
 need(!b.candidate||['saved','adopted','discarded'].includes(b.candidate.status),'DAILY_UNSAVED_CANDIDATE','candidate','请先保存或放弃候选');
 need(request.noExecutionReason||Object.values(b.facts).some(f=>f.date===b.date&&['consume','output','ship'].includes(f.fact.type)),'DAILY_EXECUTION_REASON','reason','无实际执行须保留原因');reconcile(b);
 const frozen={date:b.date,state:structuredClone(b.state),confirmations:structuredClone(b.confirmations),sourceToken:b.sourceToken,sourceRef:b.sourceRef??null,adopted:structuredClone(b.adopted),facts:structuredClone(b.facts),noExecutionReason:request.noExecutionReason||null,parent:b.history.at(-1)?.hash??null};
 const checkpoint={...frozen,hash:fingerprint(frozen)};b.history.push(checkpoint);
 if(b.date===b.endDate){b.ended=true;return b;}
 b.date=nextDate(b.date);b.confirmations={};b.candidate=null;
 const due=b.events.filter(e=>!b.facts[e.id]&&e.knownDate<=b.date&&e.effectiveDate<=b.date);
 // All now-known revisions precede default receipts; future author scripts remain hidden.
 due.sort((a,c)=>a.effectiveDate.localeCompare(c.effectiveDate)||a.id.localeCompare(c.id));
 for(const e of due)feedback(b,e);
 for(const p of b.state.purchases)if(p.issued&&p.dueDate<=b.date&&p.ordered>p.received+p.cancelled){
  const key='auto-'+fingerprint({purchaseId:p.id,received:p.received,cancelled:p.cancelled}).slice(0,48);
  feedback(b,{id:key,type:'receive',source:{kind:'EXPLICIT_SIMULATION_POLICY',purchase:p.id},occurredDate:b.date,knownDate:b.date,effectiveDate:b.date,data:{id:p.id,quantity:p.ordered-p.received-p.cancelled,receiptId:key,receipt:p.receipt}});
 }
 b.confirmations={};reconcile(b);return b;
}
