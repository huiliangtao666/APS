import {VERSION, requireThat as need, id, minute, date, nextDate, atoms, amount, copy, fingerprint} from './contract.mjs';

export const EVENT_TYPES = ['PURCHASE_ORDER','PURCHASE_CANCEL','RECEIVE','QUALITY','SCRAP_LOT','CONSUME_CUMULATIVE',
  'DEMAND','DEMAND_CHANGE','DEMAND_CANCEL','SHIP','SIGN','TASK_START','TASK_PROGRESS','TASK_PAUSE',
  'RESOURCE_READY','TASK_RESUME','TASK_RESULT','OUTPUT_RECEIVE','RESOURCE_RELEASE','LOT_EXPIRE','LOT_FREEZE'];
const productionTypes = new Set(['CONSUME_CUMULATIVE','TASK_START','TASK_PROGRESS','TASK_PAUSE','TASK_RESUME','TASK_RESULT','OUTPUT_RECEIVE']);
const priority = {LOT_EXPIRE:0, LOT_FREEZE:1, RESOURCE_RELEASE:2, RESOURCE_READY:3, PURCHASE_ORDER:4,
  DEMAND:4, RECEIVE:5, QUALITY:6, TASK_START:7, CONSUME_CUMULATIVE:8, TASK_PROGRESS:9, TASK_PAUSE:10,
  TASK_RESUME:11, TASK_RESULT:12, OUTPUT_RECEIVE:13, SHIP:14, SIGN:15, SCRAP_LOT:16};
function unique(rows, path) {
  need(Array.isArray(rows), 'ARRAY_REQUIRED', path, '须提供明确数组，允许空数组');
  const out = {};
  rows.forEach((row, i) => {need(row&&typeof row==='object'&&!Array.isArray(row),'RECORD_REQUIRED',path+'.'+i,'须提供业务对象'); id(row.id, path + '.' + i); need(!Object.hasOwn(out,row.id), 'DUPLICATE_ID', path, row.id); out[row.id] = row; });
  return out;
}
function reference(map, key, path) { need(Object.hasOwn(map, key), 'MISSING_REFERENCE', path, '找不到引用 ' + key); return map[key]; }
export function validateSpec(input) {
  need(input&&typeof input==='object'&&!Array.isArray(input),'SPEC_REQUIRED','spec','须提供独立场景对象');
  const s = copy(input);
  need(s.schema === VERSION && s.mode === 'INDEPENDENT', 'MODE_DISABLED', 'mode', '仅支持独立调试，联动未启用');
  date(s.startDate, 'startDate'); date(s.endDate, 'endDate');
  need(s.startDate <= s.endDate, 'DATE_RANGE', 'endDate', '终止日期须不早于开始日期');
  need(typeof s.offset === 'string' && /^(?:\+08:00)$/.test(s.offset) && s.timeZone === 'Asia/Shanghai',
    'TIMEZONE_UNSUPPORTED', 'timeZone', '本版显式支持Asia/Shanghai +08:00，其他时区待适配');
  for (const key of ['baseline','parameters','rules']) {
    need(s.source?.[key]?.version && /^[a-f0-9]{64}$/.test(s.source[key].hash), 'SOURCE_REQUIRED', 'source.' + key, '缺来源版本及SHA256');
  }
  need(s.source.parameters.precedence === 'SECOND_P', 'PARAMETER_PRECEDENCE', 'source.parameters', '须先解析并冻结第二份P优先配置');
  need(Number.isSafeInteger(s.planningWindowDays) && s.planningWindowDays > 0, 'WINDOW_REQUIRED', 'planningWindowDays', '排程窗口须来自显式有效配置');
  date(s.coverageEnd, 'coverageEnd'); need(s.endDate <= s.coverageEnd, 'COVERAGE_RANGE', 'endDate', '模拟日期超出声明的真实数据覆盖');
  if(s.importIssues!==undefined){unique(s.importIssues,'importIssues');for(const issue of s.importIssues)
    need(issue.reason&&issue.objectId&&issue.resolved===false,'IMPORT_ISSUE_REQUIRED','importIssues','未覆盖项须显式保留待处置状态');}
  if(s.reference){need(Array.isArray(s.reference.bom)&&s.reference.timeBases?.dayZero&&s.reference.parameters&&
    fingerprint(s.reference.parameters)===s.source.parameters.hash,'IMPORT_REFERENCE_MISMATCH','reference','原生P归档或BOM来源不符');
    date(s.reference.timeBases.dayZero,'reference.timeBases.dayZero');}
  need(s.random?.enabled === false || (s.random?.enabled === true && Number.isSafeInteger(s.random.seed) &&
    s.random.generatorVersion && s.random.rulesVersion && s.random.materialized === true && Array.isArray(s.random.distributions) &&
    s.random.distributions.length > 0), 'RANDOM_NOT_MATERIALIZED', 'random', '随机模式必须显式参数化并物化事件后导入');
  if(s.random.enabled) for(const d of s.random.distributions) {
    need(typeof d.probability === 'number' && d.probability >= 0 && d.probability <= 1 && d.object &&
      Number.isFinite(d.min) && Number.isFinite(d.max) && d.min <= d.max && d.from && d.until,
    'RANDOM_RULE_REQUIRED', 'random.distributions', '缺随机对象、概率、范围或启用时段');
    need(minute(d.from) < minute(d.until), 'RANDOM_RANGE', 'random.distributions', '随机启用区间无效');
  }
  const materials = unique(s.materials,'materials'), resources = unique(s.resources,'resources');
  for (const m of s.materials) need(typeof m.unit === 'string' && m.unit && [1,10,100,1000,10000,100000,1000000].includes(m.scale),
    'MATERIAL_UNIT_REQUIRED','materials.' + m.id,'须显式单位及十进制数量精度');
  for (const r of s.resources) need(Number.isSafeInteger(r.capacity) && r.capacity > 0, 'RESOURCE_CAPACITY',r.id,'资源容量须为显式正整数');
  const lots = unique(s.lots,'lots'), purchases = unique(s.purchases,'purchases'), demands = unique(s.demands,'demands'), tasks = unique(s.tasks,'tasks');
  for (const l of s.lots) {
    const m = reference(materials,l.materialId,l.id); for(const k of ['quantity','pending','qualified','frozen','externalReserved']) atoms(l[k],m,l.id + '.' + k);
    need(atoms(l.quantity,m,l.id) === atoms(l.pending,m,l.id)+atoms(l.qualified,m,l.id)+atoms(l.frozen,m,l.id), 'QUALITY_BALANCE',l.id,'实物必须等于质量分类量');
    need(l.externalReserved <= l.qualified, 'RESERVATION_RANGE',l.id,'外部占用超过合格量'); minute(l.expiresAt,l.id+'.expiresAt');
    need(l.location && l.environment && l.lineage, 'LOT_SOURCE_REQUIRED',l.id,'须显式库位、环境与批次谱系');
  }
  for(const p of s.purchases) {
    const m = reference(materials,p.materialId,p.id); for(const k of ['ordered','received','cancelled']) atoms(p[k],m,p.id+'.'+k);
    need(p.received+p.cancelled <= p.ordered && p.issued === true && p.lineage, 'PURCHASE_RANGE',p.id,'仅接受已下达且守恒的采购期初');
  }
  for(const d of s.demands) validateDemand(d,materials);
  for(const t of s.tasks) {
    reference(materials,t.outputMaterialId,t.id); need(Number.isSafeInteger(t.totalMinutes) && t.totalMinutes > 0 && t.lineage,
      'TASK_TIME_REQUIRED',t.id,'工序须显式加工分钟和谱系');
    need(atoms(t.outputLimit,materials[t.outputMaterialId],t.id+'.outputLimit')>0,'TASK_OUTPUT_LIMIT',t.id,'须显式采用作业的最大产出量');
    need(s.source.plan?.version && /^[a-f0-9]{64}$/.test(s.source.plan.hash), 'PLAN_REQUIRED',t.id,'生产须有冻结计划副本或显式作业脚本来源');
    need(Array.isArray(t.resources), 'TASK_RESOURCES_REQUIRED',t.id,'须显式资源需求，允许空数组');
    const seen = new Set(); for(const r of t.resources) { reference(resources,r.id,t.id); need(!seen.has(r.id) && Number.isSafeInteger(r.quantity) && r.quantity>0,
      'TASK_RESOURCE_RANGE',t.id,'重复资源或未知数量'); seen.add(r.id); }
    need(t.balanceUnit === materials[t.outputMaterialId].unit, 'TASK_BALANCE_UNIT',t.id,'须显式同量纲生产平衡口径');
    need(Array.isArray(t.startRequirements),'START_MATERIALS_REQUIRED',t.id,'须显式开工投料要求，允许确无投料时空数组');
    const requiredLots=new Set();for(const r of t.startRequirements) {const l=reference(lots,r.lotId,t.id);atoms(r.cumulative,materials[l.materialId],t.id);
      need(!requiredLots.has(r.lotId),'DUPLICATE_START_MATERIAL',t.id,'同批次须一条明确累计要求');requiredLots.add(r.lotId);}
  }
  unique(s.events,'events');
  need(s.events.length <= 50000, 'EVENT_LIMIT','events','单分支事件上限50000');
  const eventIds = new Set(s.events.map(e=>e.id));
  for(const e of s.events) {
    need(EVENT_TYPES.includes(e.type), 'EVENT_UNSUPPORTED',e.id,'未知事件类型');
    const effective = minute(e.effectiveAt,e.id+'.effectiveAt'), happened = minute(e.occurredAt,e.id+'.occurredAt'); minute(e.knownAt,e.id+'.knownAt');
    need(effective >= happened && effective>=minute(e.knownAt) && e.businessDate === e.effectiveAt.slice(0,10) && e.effectiveAt.endsWith(s.offset) &&
      e.occurredAt.endsWith(s.offset) && e.knownAt.endsWith(s.offset), 'EVENT_TIME_SCOPE',e.id,'发生/生效/归账日期及显式时区不一致');
    need(e.businessDate >= s.startDate && e.businessDate <= s.endDate && e.source && e.data && Array.isArray(e.causes),
      'EVENT_SCOPE',e.id,'须有归账范围、来源、载荷与前因数组');
    for(const c of e.causes) need(eventIds.has(c) && c!==e.id,'CAUSE_REQUIRED',e.id,'找不到前因或事件自引用');
    if(productionTypes.has(e.type)) reference(tasks,e.data.taskId,e.id+'.taskId');
  }
  // Causal cycles, reversed time dependencies and unknown fields are never repaired by an arbitrary sort.
  orderedEvents(s.events);
  return s;
}
function validateDemand(d,materials) {
  const m=reference(materials,d.materialId,d.id); id(d.id,'demand.id');
  for(const k of ['required','change','cancelled','shipped','signed']) {
    if(k==='change') need(typeof d[k]==='number' && Number.isFinite(d[k]),'DEMAND_CHANGE',d.id,'须显式净变更');
    else atoms(d[k],m,d.id+'.'+k);
  }
  atoms(d.required+d.change,m,d.id+'.netRequired');
  need(['SHIP','SIGN'].includes(d.fulfillment) && d.signed<=d.shipped && d.shipped+d.cancelled<=d.required+d.change &&
    d.cancelled + (d.fulfillment==='SHIP'?d.shipped:d.signed) <= d.required+d.change && d.customer && d.lineage,
    'DEMAND_RANGE',d.id,'须显式履约口径、客户和守恒累计');
}
export function orderedEvents(events) {
  const byId=Object.fromEntries(events.map(e=>[e.id,e])), visited=new Set(), stack=new Set(), result=[];
  const sorted=[...events].sort((a,b)=>admittedAt(a)-admittedAt(b)||(priority[a.type]??20)-(priority[b.type]??20)||a.id.localeCompare(b.id,'en'));
  function visit(e) {
    if(visited.has(e.id))return; need(!stack.has(e.id),'CAUSE_CYCLE',e.id,'事件因果循环'); stack.add(e.id);
    for(const c of e.causes) { const p=reference(byId,c,e.id); need(admittedAt(p)<=admittedAt(e),'CAUSE_TIME',e.id,'前因晚于结果'); visit(p); }
    stack.delete(e.id); visited.add(e.id); result.push(e);
  }
  sorted.forEach(visit); return result;
}
export const admittedAt = e => Math.max(minute(e.occurredAt),minute(e.knownAt),minute(e.effectiveAt));
export function initialState(s) {
  return {lots:copy(s.lots),purchases:copy(s.purchases),demands:copy(s.demands),
    tasks:s.tasks.map(t=>({...copy(t),status:'PLANNED',remainingMinutes:t.totalMinutes,processedMinutes:0,consumed:{},output:0,scrap:0,receivedOutput:0})),
    resources:s.resources.map(r=>({...copy(r),ready:true})),holds:[],processed:{},issues:copy(s.importIssues??[]),movements:[]};
}
export function precheck(s, state=initialState(s), currentDate=s.startDate) {
  validateSpec(s);
  const days=(Date.parse(s.coverageEnd+'T00:00:00Z')-Date.parse(currentDate+'T00:00:00Z'))/86400000+1;
  return {canAdvance:currentDate<=s.endDate,productionSource: s.source.plan?'EXPLICIT_COPY':'NO_PRODUCTION',
    planningWindow:{required:s.planningWindowDays,covered:Math.max(0,days),complete:days>=s.planningWindowDays},
    unresolved:state.issues.filter(i=>!i.resolved),importCoverage:copy(s.reference?.nativeCoverage??[]),
    mode:'INDEPENDENT',linked:false,mainProgramReady:false};
}
export function freeQuantity(lot,at) {
  return minute(lot.expiresAt)<=at?0:Math.max(0,lot.qualified-lot.externalReserved);
}
export function snapshot(spec,state,day, inclusive=false) {
  const cutoff=(inclusive?day:nextDate(day))+'T00:00:00'+spec.offset, at=minute(cutoff);
  const lots=state.lots.map(l=>({...copy(l),expired:minute(l.expiresAt)<=at,free:freeQuantity(l,at)}));
  // At an exclusive cutoff, a batch expiring exactly at cutoff was still eligible immediately before it.
  if(!inclusive) for(const l of lots) if(minute(l.expiresAt)===at) {l.expired=false;l.free=Math.max(0,l.qualified-l.externalReserved);}
  const business={date:day,cutoff,cutoffInclusive:inclusive,source:copy(spec.source),timeZone:spec.timeZone,materials:copy(spec.materials),
    rulesVersion:VERSION,random:copy(spec.random),lots,purchases:copy(state.purchases),demands:copy(state.demands),
    tasks:copy(state.tasks),resources:copy(state.resources),holds:copy(state.holds),issues:copy(state.issues),
    processed:copy(state.processed),movements:copy(state.movements),
    ...(spec.reference?{bom:copy(spec.reference.bom.filter(e=>{
      const dayIndex=(Date.parse(day+'T00:00:00Z')-Date.parse(spec.reference.timeBases.dayZero+'T00:00:00Z'))/86400000;
      return e.from<=dayIndex&&dayIndex<e.until;
    }))}:{}),mainProgramReady:false};
  return {...business,businessHash:fingerprint(business)};
}
export function advanceDay(spec,state,day) {
  date(day); need(day>=spec.startDate && day<=spec.endDate,'DATE_RANGE','date','日推进超出场景范围');
  const work=copy(state), cutoff=minute(nextDate(day)+'T00:00:00'+spec.offset);
  for(const e of orderedEvents(spec.events)) if(admittedAt(e)<cutoff && !Object.hasOwn(work.processed,e.id)) applyEvent(spec,work,e);
  validateBalances(spec,work);
  return {state:work,snapshot:snapshot(spec,work,day)};
}
export function openingSnapshot(spec,state,day) {
  const work=copy(state), at=minute(date(day)+'T00:00:00'+spec.offset);
  for(const e of orderedEvents(spec.events)) if(admittedAt(e)<=at && !Object.hasOwn(work.processed,e.id))applyEvent(spec,work,e);
  validateBalances(spec,work); return snapshot(spec,work,day,true);
}
export function visibleEvents(spec,at,inclusive=false) { const n=minute(at); return copy(spec.events.filter(e=>inclusive?minute(e.knownAt)<=n:minute(e.knownAt)<n)); }
export function applyEvent(spec,state,e) {
  const hash=fingerprint(e), old=Object.hasOwn(state.processed,e.id)?state.processed[e.id]:null;
  if(old) {need(old.hash===hash,'EVENT_CONFLICT',e.id,'同事件身份内容不同，须对账',409);return;}
  for(const c of e.causes) need(state.processed[c]?.status==='APPLIED','CAUSE_NOT_APPLIED',e.id,'前因未成功应用 '+c);
  const d=e.data, at=admittedAt(e), material=k=>reference(Object.fromEntries(spec.materials.map(m=>[m.id,m])),k,e.id),
    find=(rows,k)=>{const r=rows.find(x=>x.id===k);need(r,'MISSING_REFERENCE',e.id,'找不到业务引用 '+k);return r;},
    lot=()=>find(state.lots,d.lotId), task=()=>find(state.tasks,d.taskId),
    q=(v,m)=>atoms(v,material(m),e.id), value=(v,m)=>amount(v,material(m));
  const move=(l,field,delta)=>{l[field]=value(q(l[field],l.materialId)+delta,l.materialId);};
  const wait=(objectId,reason)=>{state.issues.push({id:e.id,objectId,reason,date:e.businessDate,resolved:false});
    state.processed[e.id]={hash,status:'WAITING',at:e.effectiveAt};};
  const movement=(l,delta,kind)=>state.movements.push({eventId:e.id,lotId:l.id,materialId:l.materialId,unit:material(l.materialId).unit,quantity:delta,kind});
  const acquire=t=>{
    for(const r of t.resources) {
      const resource=find(state.resources,r.id), held=state.holds.filter(h=>h.resourceId===r.id && h.endAt===null);
      const own=held.filter(h=>h.taskId===t.id).reduce((n,h)=>n+h.quantity,0);
      if(!resource.ready || held.reduce((n,h)=>n+h.quantity,0)+r.quantity-own>resource.capacity)return false;
    }
    for(const r of t.resources)if(!state.holds.some(h=>h.resourceId===r.id&&h.taskId===t.id&&h.endAt===null))
      state.holds.push({resourceId:r.id,taskId:t.id,quantity:r.quantity,startAt:e.effectiveAt,endAt:null});
    return true;
  };
  switch(e.type) {
    case 'PURCHASE_ORDER': {
      need(!state.purchases.some(p=>p.id===d.id),'PURCHASE_EXISTS',e.id,'采购编号已存在');
      const p=copy(d); id(p.id,e.id); material(p.materialId); for(const k of ['ordered','received','cancelled'])q(p[k],p.materialId);
      need(p.issued===true && p.received===0 && p.cancelled===0 && p.lineage,'PURCHASE_NOT_ISSUED',e.id,'新采购须明确下达，累计从零开始');state.purchases.push(p);break;
    }
    case 'PURCHASE_CANCEL': {const p=find(state.purchases,d.purchaseId);move(p,'cancelled',q(d.quantity,p.materialId));break;}
    case 'RECEIVE': {
      const p=find(state.purchases,d.purchaseId), m=material(p.materialId), n=atoms(d.quantity,m,e.id);
      need(p.issued && n>0 && n<=q(p.ordered,p.materialId)-q(p.received,p.materialId)-q(p.cancelled,p.materialId),'RECEIPT_RANGE',e.id,'未下达、超收或无数量');
      id(d.lotId,e.id);need(!state.lots.some(l=>l.id===d.lotId)&&d.location&&d.environment&&d.lineage,'LOT_EXISTS',e.id,'须独立收货批次及来源');minute(d.expiresAt);
      state.lots.push({id:d.lotId,materialId:p.materialId,quantity:d.quantity,pending:d.quantity,qualified:0,frozen:0,externalReserved:0,
        expiresAt:d.expiresAt,location:d.location,environment:d.environment,lineage:d.lineage,receiptEvent:e.id,purchaseId:p.id});
      move(p,'received',n);movement(state.lots.at(-1),d.quantity,'RECEIVE');break;
    }
    case 'QUALITY': {
      const l=lot();need(['pending','frozen'].includes(d.from) && d.to==='qualified' && d.disposition,'QUALITY_DISPOSITION',e.id,'须明确仿真放行依据');
      const n=q(d.quantity,l.materialId);need(n<=q(l[d.from],l.materialId),'QUALITY_RANGE',e.id,'放行超过对应质量分类量');move(l,d.from,-n);move(l,'qualified',n);break;
    }
    case 'LOT_FREEZE': {const l=lot(),n=q(d.quantity,l.materialId);need(n<=q(l.qualified-l.externalReserved,l.materialId),'FREEZE_RANGE',e.id,'冻结不得重复扣占用');move(l,'qualified',-n);move(l,'frozen',n);break;}
    case 'LOT_EXPIRE': {const l=lot();need(at>=minute(l.expiresAt),'EXPIRY_TIME',e.id,'未到失效边界');break;}
    case 'SCRAP_LOT': {
      const l=lot(),n=q(d.quantity,l.materialId);need(['pending','qualified','frozen'].includes(d.from)&&d.disposition,'SCRAP_DISPOSITION',e.id,'须明确报废类别及处置');
      need(n<=q(l[d.from],l.materialId)-(d.from==='qualified'?q(l.externalReserved,l.materialId):0),'SCRAP_RANGE',e.id,'报废越界或占用未解除');
      move(l,d.from,-n);move(l,'quantity',-n);movement(l,-d.quantity,'SCRAP');break;
    }
    case 'CONSUME_CUMULATIVE': {
      const l=lot(),t=task(),n=q(d.cumulative,l.materialId), previous=q(Object.hasOwn(t.consumed,l.id)?t.consumed[l.id]:0,l.materialId),delta=n-previous;
      need(delta>=0 && material(l.materialId).unit===t.balanceUnit,'CUMULATIVE_REGRESSION',e.id,'累计倒退或投料量纲不匹配');
      if(delta>q(freeQuantity(l,at),l.materialId)||(delta>0&&!['RUNNING','PLANNED'].includes(t.status))) {wait(t.id,'待料/待处置，未扣库存');return;}
      move(l,'qualified',-delta);move(l,'quantity',-delta);t.consumed[l.id]=d.cumulative;movement(l,-value(delta,l.materialId),'CONSUME');break;
    }
    case 'DEMAND': {need(!state.demands.some(x=>x.id===d.id),'DEMAND_EXISTS',e.id,'需求身份已存在');validateDemand(d,Object.fromEntries(spec.materials.map(m=>[m.id,m])));state.demands.push(copy(d));break;}
    case 'DEMAND_CHANGE': {const r=find(state.demands,d.demandId);need(Number.isFinite(d.netChange)&&d.reason,'DEMAND_CHANGE',e.id,'变更须显式净额及依据');q(r.required+r.change+d.netChange,r.materialId);r.change+=d.netChange;break;}
    case 'DEMAND_CANCEL': {const r=find(state.demands,d.demandId);move(r,'cancelled',q(d.quantity,r.materialId));break;}
    case 'SHIP': {
      const r=find(state.demands,d.demandId);need(Array.isArray(d.allocations)&&d.allocations.length>0,'SHIP_ALLOCATION',e.id,'发运须显式分批分配');
      const grouped=new Map();for(const a of d.allocations){const l=find(state.lots,a.lotId);need(l.materialId===r.materialId,'SHIP_MATERIAL',e.id,'发运物料不同');grouped.set(l.id,(grouped.get(l.id)??0)+q(a.quantity,l.materialId));}
      let total=0;for(const [key,n] of grouped){const l=find(state.lots,key);need(n<=q(freeQuantity(l,at),l.materialId),'SHIP_UNAVAILABLE',e.id,'发运批次不可用或超量');total+=n;}
      need(total>0 && q(r.shipped,r.materialId)+total<=q(r.required+r.change-r.cancelled,r.materialId),'DEMAND_OVER_SHIP',e.id,'发运超过需求余额');
      for(const [key,n] of grouped){const l=find(state.lots,key);move(l,'qualified',-n);move(l,'quantity',-n);movement(l,-value(n,l.materialId),'SHIP');}move(r,'shipped',total);break;
    }
    case 'SIGN': {const r=find(state.demands,d.demandId),n=q(d.quantity,r.materialId);need(n<=q(r.shipped-r.signed,r.materialId),'SIGN_RANGE',e.id,'签收不得超过配送在途');move(r,'signed',n);break;}
    case 'TASK_START': {
      const t=task();need(t.status==='PLANNED','TASK_STATE',e.id,'仅未开始任务可开工');
      for(const r of t.startRequirements) {
        const l=find(state.lots,r.lotId),previous=Object.hasOwn(t.consumed,l.id)?t.consumed[l.id]:0;
        if(q(r.cumulative,l.materialId)-q(previous,l.materialId)>q(freeQuantity(l,at),l.materialId)){wait(t.id,'待料；未强行开工');return;}
      }
      if(!acquire(t)){wait(t.id,'待资源；未取得冲突实体');return;}
      t.status='RUNNING';t.startedAt=e.effectiveAt;t.activeSince=e.effectiveAt;break;
    }
    case 'TASK_PROGRESS': {
      const t=task();if(t.status!=='RUNNING'){wait(t.id,'未运行工序不能加工');return;}
      need(Number.isSafeInteger(d.processedMinutes)&&Number.isSafeInteger(d.remainingMinutes)&&d.processedMinutes>=t.processedMinutes&&d.remainingMinutes>=0&&
        d.processedMinutes+d.remainingMinutes===t.totalMinutes && d.processedMinutes-t.processedMinutes<=at-minute(t.activeSince),
      'TASK_PROGRESS_RANGE',e.id,'剩余分钟须来自显式加工事实且不超过实际经过分钟');
      t.processedMinutes=d.processedMinutes;t.remainingMinutes=d.remainingMinutes;t.activeSince=e.effectiveAt;break;
    }
    case 'TASK_PAUSE': {const t=task();need(t.status==='RUNNING'&&d.disposition,'TASK_STATE',e.id,'暂停须明确处置，先保存加工事实');t.status='PAUSED';t.disposition=d.disposition;
      for(const key of d.unreadyResources??[])find(state.resources,key).ready=false;break;}
    case 'RESOURCE_READY': {const r=find(state.resources,d.resourceId);r.ready=true;break;}
    case 'TASK_RESUME': {const t=task();need(t.status==='PAUSED'&&d.disposition,'RESUME_DISPOSITION',e.id,'修复不等于允许续作；须显式处置');
      if(!acquire(t)){wait(t.id,'续作等待资源');return;}t.status='RUNNING';t.activeSince=e.effectiveAt;t.disposition=d.disposition;
      for(const issue of state.issues)if(issue.objectId===t.id)issue.resolved=true;break;}
    case 'TASK_RESULT': {
      const t=task(),m=material(t.outputMaterialId);need(t.status==='RUNNING'&&typeof d.final==='boolean'&&(!d.final||t.remainingMinutes===0),'TASK_INCOMPLETE',e.id,'须明确部分/最终累计结果，最终结果须完成显式加工分钟');
      const output=atoms(d.cumulativeOutput,m,e.id),scrap=atoms(d.cumulativeScrap,m,e.id);
      need(output>=q(t.output,t.outputMaterialId)&&scrap>=q(t.scrap,t.outputMaterialId)&&output<=q(t.outputLimit,t.outputMaterialId),'RESULT_REGRESSION',e.id,'累计产出/报废倒退或超过采用作业数量');
      t.output=d.cumulativeOutput;t.scrap=d.cumulativeScrap;if(d.final){t.status='COMPLETED';t.completedAt=e.effectiveAt;}break;
    }
    case 'OUTPUT_RECEIVE': {
      const t=task(),m=material(t.outputMaterialId),n=atoms(d.quantity,m,e.id);id(d.lotId,e.id);
      need(['RUNNING','COMPLETED'].includes(t.status)&&n>0&&n<=q(t.output-t.receivedOutput,t.outputMaterialId)&&!state.lots.some(l=>l.id===d.lotId)&&
        d.location&&d.environment&&d.lineage,'OUTPUT_RANGE',e.id,'制造入库须唯一身份、完成来源及剩余可入库量');minute(d.expiresAt);
      const l={id:d.lotId,materialId:t.outputMaterialId,quantity:d.quantity,pending:d.quantity,qualified:0,frozen:0,externalReserved:0,
        expiresAt:d.expiresAt,location:d.location,environment:d.environment,lineage:d.lineage,taskId:t.id,receiptEvent:e.id};
      state.lots.push(l);t.receivedOutput=value(q(t.receivedOutput,t.outputMaterialId)+n,t.outputMaterialId);movement(l,d.quantity,'MANUFACTURE');break;
    }
    case 'RESOURCE_RELEASE': {
      const hold=state.holds.find(h=>h.resourceId===d.resourceId&&h.taskId===d.taskId&&h.endAt===null);
      need(hold && at>=minute(hold.startAt) && d.disposition,'RESOURCE_RELEASE',e.id,'须引用现有占用与显式释放依据');hold.endAt=e.effectiveAt;break;
    }
    default: need(false,'EVENT_UNSUPPORTED',e.id,'未知事件类型');
  }
  state.processed[e.id]={hash,status:'APPLIED',at:e.effectiveAt,late:minute(e.knownAt)>minute(e.occurredAt)};
}
export function validateBalances(spec,state) {
  const mats=Object.fromEntries(spec.materials.map(m=>[m.id,m]));
  const a=(v,k)=>atoms(v,reference(mats,k,k),'balance.'+k);
  for(const l of state.lots) {
    need(a(l.quantity,l.materialId)===a(l.pending,l.materialId)+a(l.qualified,l.materialId)+a(l.frozen,l.materialId)&&
      a(l.externalReserved,l.materialId)<=a(l.qualified,l.materialId),'LOT_BALANCE',l.id,'库存质量分类或占用不守恒');
    const initial=spec.lots.find(x=>x.id===l.id)?.quantity??0;
    const movements=state.movements.filter(x=>x.lotId===l.id);
    let net=a(initial,l.materialId);for(const x of movements)net+=Math.sign(x.quantity)*a(Math.abs(x.quantity),l.materialId);
    need(net===a(l.quantity,l.materialId),'PHYSICAL_BALANCE',l.id,'批次收发存不守恒');
  }
  for(const p of state.purchases)need(a(p.received,p.materialId)+a(p.cancelled,p.materialId)<=a(p.ordered,p.materialId),'PURCHASE_BALANCE',p.id,'采购超收或取消越界');
  for(const d of state.demands)validateDemand(d,mats);
  for(const t of state.tasks) {
    // A declared mass balance is evaluated within one unit, with integer quanta converted to the output precision.
    const m=mats[t.outputMaterialId];let input=0;
    for(const [lotId,n] of Object.entries(t.consumed)){const l=state.lots.find(x=>x.id===lotId);need(l&&mats[l.materialId].unit===t.balanceUnit,'PRODUCTION_UNIT',t.id,'投入量纲不同');input+=n;}
    const used=a(input,t.outputMaterialId),out=a(t.output,t.outputMaterialId),scrap=a(t.scrap,t.outputMaterialId);
    need(out+scrap<=used && (t.status!=='COMPLETED'||out+scrap===used) && a(t.receivedOutput,t.outputMaterialId)<=out,
      'PRODUCTION_BALANCE',t.id,'投入=产出+报废+在制，完成工序不可丢失投入');
  }
  for(const r of state.resources) {
    const holds=state.holds.filter(h=>h.resourceId===r.id&&h.endAt===null);
    need(holds.reduce((n,h)=>n+h.quantity,0)<=r.capacity,'RESOURCE_OVERLAP',r.id,'实体重复占用');
  }
  return true;
}
