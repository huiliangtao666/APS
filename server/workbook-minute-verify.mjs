import {verifyUrgent} from './urgent-order-engine.mjs';
import {createHash} from 'node:crypto';
import {MINUTE_ORIGIN,MINUTE_ENGINE,weightSharedResource,minuteMode,integer,routeMinutes,laborSegments,shiftWindows,wipOccupations,knownMinuteStops,eventPeak,unionMinutes,overlap,boundary,instantMinute} from './workbook-minute.mjs';
const rows=(d,t)=>d.tables?.[t]||[];
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Rebuild physical usage from source tasks and frozen WIP. Do not accept the
// planner's cached occupation list, peaks or verification as an oracle.
export function verifyMinutePlan(d,p){
 const issues=verifyUrgent(d,p),add=s=>issues.push(s),tasks=p.tasks||[],byId=new Map(tasks.map(t=>[t.id,t])),resources=new Map(rows(d,'设备与工装').map(r=>[r['资源编号'],r])),routes=new Map(rows(d,'工艺路线').map(r=>[r['路线工序编号'],r])),crews=new Map(rows(d,'班组资源').map(r=>[r['班组编号'],r]));
 if(!minuteMode(d)||p.engineIdentity!==MINUTE_ENGINE||p.minuteOrigin!==MINUTE_ORIGIN||p.timeUnit!=='minute'||p.timezone!=='Asia/Shanghai')add('分钟身份/时区不一致');
 if(byId.size!==tasks.length)add('任务唯一键重复');
 const start=p.conditions.startDay*1440,end=p.conditions.endDay*1440,current=p.conditions.currentMinute??p.conditions.currentDay*1440,stops=knownMinuteStops(d,current);
 const occ=wipOccupations(d,start,end),daily=new Map();
 if(d.urgentOrder)for(const w of d.mapping.wip_remaining){const day=Math.floor(w.current_occupancy_minute_interval[0]/1440);if(day>=p.conditions.startDay&&day<p.conditions.endDay){const key=w.resource+'|'+day;daily.set(key,(daily.get(key)||0)+w.quantity);}}
 for(const t of tasks){const rt=routes.get(t.routeStepId),r=resources.get(t.machine),c=crews.get(t.crew);if(!rt||!r||!c){add('任务路线/设备/班组未知 '+t.id);continue;}
  if(![t.start,t.end,t.startMinute,t.endMinute,t.toolEndMinute].every(Number.isSafeInteger)||t.start!==t.startMinute||t.end!==t.endMinute||t.start<start||t.end>end||t.end<=t.start){add('整数分钟或窗口不符 '+t.id);continue;}
  if(t.productId!==rt['成品编号']||rt['设备组编号']!==r['资源组编号']||t.crew!==rt['班组编号']||t.people!==Number(rt['需求人数'])||t.tools.length!==Number(rt['每批工装套数']))add('真实资源映射不符 '+t.id);
  const executed=d.urgentOrder?.seedTasks.some(x=>x.id===t.id&&['started','completed'].includes(x.executionStatus));
  if((!executed&&t.end-t.start!==routeMinutes(rt,t.quantity))||t.duration!==t.end-t.start||(!executed&&t.toolEndMinute!==t.end+Number(rt['工装后延释放分钟'])))add('工时/释放分钟不符 '+t.id);
  if(!(t.quantity>0)||t.quantity>Number(r['单次批量上限千克'])||Number(r['可用数量'])<=0)add('批量/资源可用数错误 '+t.id);
  const pool=d.mapping.tool_pools[rt['所需工装类型']]||[];if(new Set(t.tools).size!==t.tools.length||t.tools.some(id=>!pool.includes(id)||Number(resources.get(id)?.['可用数量'])<=0||t.quantity>Number(resources.get(id)?.['单次批量上限千克'])*t.tools.length))add('实体工具/批容量错误 '+t.id);
  const labor=executed?t.laborIntervals:laborSegments(rt,t.start,t.end);if(!equal(labor,t.laborIntervals))add('人员参与分钟失配 '+t.id);
  const windows=[];for(let day=Math.floor(t.start/1440);day<=Math.floor(t.end/1440);day++)windows.push(...shiftWindows(d,c,day,t.machine));
  if(labor.some(l=>unionMinutes(windows,l.start,l.end)<l.end-l.start))add('人员班次外占用 '+t.id);
  const segments=t.interruption?t.executionSegments:[t];
  if(!Array.isArray(segments)||segments.some(s=>!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||s.end<=s.start))add('生产分段不合法 '+t.id);
  else for(const segment of segments){
   if(r['生产日历方式']==='工厂班次'&&unionMinutes(windows,segment.start,segment.end)<segment.end-segment.start)add('设备班次外占用 '+t.id);
   if(rt['允许跨班连续']==='否'&&!windows.some(w=>w.start<=segment.start&&segment.end<=w.end))add('不允许跨班 '+t.id);
   if(stops.some(s=>s.resource===t.machine&&overlap(s,segment)))add('可知停机冲突 '+t.id);
  }
  if(d.urgentWorkspace?.strategy==='overtime'&&unionMinutes(windows.filter(w=>!w.overtime),t.start,t.end)<t.end-t.start&&!t.interruption&&!windows.filter(w=>w.overtime).some(w=>w.start<=t.start&&t.end<=w.end&&w.people>=t.people&&t.tools.every(id=>w.tools.includes(id))))add('加班配套容量/工装不完整 '+t.id);
  const prev=byId.get(t.predecessor);if(t.predecessor&&!prev)add('前序不存在 '+t.id);
  if(prev&&(prev.productionId!==t.productionId||prev.end>t.start||prev.routeStepId!==t.routeStepId&&t.start-prev.end>Number(rt['最大等待分钟'])))add('工序链/最大等待错误 '+t.id);
  occ.push({start:t.start,end:t.end,toolEnd:t.toolEndMinute,resource:t.machine,quantity:t.quantity,tools:t.tools,crew:t.crew,people:t.people,labor,taskId:t.id,productId:t.productId});
  const key=t.machine+'|'+Math.floor(t.start/1440);daily.set(key,(daily.get(key)||0)+t.quantity);
  if(t.cleaning){const x=t.cleaning,rule=rows(d,'换型清洗').find(r=>r['清洗规则编号']===x.rule),before=tasks.filter(o=>o.machine===t.machine&&o.end<=x.start).sort((a,b)=>b.end-a.end)[0];
   if(!rule||!before||rule['前产品编号']!==before.productId||rule['后产品编号']!==t.productId||rule['设备组编号']!==rt['设备组编号']||x.end!==t.start||x.end-x.start!==Number(rule['清洗分钟'])||x.crew!==before.crew||x.people!==Number(rule['清洗人数']))add('有向清洗来源/一次计时错误 '+t.id);
   if(stops.some(s=>s.resource===t.machine&&overlap(s,x)))add('清洗停机冲突 '+t.id);
   occ.push({...x,taskId:t.id+'-CLEAN',tools:[],labor:[{start:x.start,end:x.end}]});
  }else{const before=tasks.filter(o=>o.machine===t.machine&&o.end<=t.start).sort((a,b)=>b.end-a.end)[0];if(before){const rule=rows(d,'换型清洗').find(x=>x['设备组编号']===rt['设备组编号']&&x['前产品编号']===before.productId&&x['后产品编号']===t.productId);if(!rule||Number(rule['清洗分钟'])>0)add('应清洗未清洗 '+t.id);}}
 }
 for(const [id,r]of resources){const own=occ.filter(o=>o.resource===id);if(weightSharedResource(r)){if(eventPeak(own.map(o=>({...o,amount:o.quantity})),start,end)>Number(r['同时占位上限千克']))add('共享重量超占 '+id);}else if(eventPeak(own,start,end)>1)add('独占设备超占 '+id);
  if(r['资源类别']==='工装'&&eventPeak(occ.filter(o=>o.tools.includes(id)).map(o=>({...o,end:o.toolEnd??o.end})),start,end)>1)add('实体工具重用 '+id);
 }
 for(const [id,c]of crews)if(eventPeak(occ.filter(o=>o.crew===id).flatMap(o=>o.labor.map(l=>({...l,amount:o.people}))),start,end)>Number(c['每班可用人数']))add('人员并发超占 '+id);
 for(const [key,qty]of daily){const [id,dayText]=key.split('|'),day=Number(dayText),r=resources.get(id),cal=rows(d,'工厂日历').find(x=>Number(x['日序'])===day),extra=d.urgentWorkspace?.strategy==='overtime'?d.urgentWorkspace.overtime.filter(o=>o.resource===id&&Math.floor(o.start/1440)===day).reduce((n,o)=>n+o.capacityKg,0):0;if(!cal||qty>Number(r['标准日产能千克'])*Number(cal['生产班次数'])/Number(cal['日产能分母'])+extra+1e-6)add('日投产量超限 '+key);}
 const selected=rows(d,'每日需求').filter(r=>Number(r['需求日'])>=p.conditions.startDay&&Number(r['需求日'])<p.conditions.endDay&&(!p.conditions.demandIds||p.conditions.demandIds.includes(r['需求编号']))),demands=new Map((p.demandResults||[]).map(r=>[r.id,r]));
 if(demands.size!==selected.length||p.demandResults.length!==selected.length)add('需求覆盖不完整');
 for(const r of selected){const x=demands.get(r['需求编号']);if(!x||x.quantity!==Number(r['需求千克'])||x.productId!==r['成品编号']||!['scheduled','unplanned'].includes(x.status))add('需求身份/数量错误 '+r['需求编号']);}
 if(d.urgentOrder)for(const r of p.demandResults||[]){const used=(p.allocations||[]).filter(a=>a.need===r.id&&a.consumer===r.id&&a.materialId===r.productId).reduce((n,a)=>n+a.quantity,0);if(Math.abs(used-r.completedQuantity-r.scheduledQuantity)>1e-5)add('需求交付分配不守恒 '+r.id);}
 // Supply qualification and cumulative mass are recomputed from the original
 // inventory/transit/WIP and final operation groups, never cached balances.
 const used=new Map(),productionValid=new Map();
 if(d.urgentOrder){
  const groups=new Map();for(const a of p.allocations||[])if(a.supplyId?.startsWith('production:'))(groups.get(a.supplyId)||groups.set(a.supplyId,[]).get(a.supplyId)).push(a);
  for(const [id,claims]of groups){const source=byId.get(claims[0].source?.taskId),shelf=Number(rows(d,'物料主数据').find(r=>r['物料编号']===source?.productId)?.['保质天数'])*1440;
   const lots=source?tasks.filter(t=>t.productionId===source.productionId&&t.routeStepId===source.routeStepId).map(t=>({id:t.id,ready:t.end,expiry:t.end+shelf,quantity:t.quantity,used:0})):[];
   for(const a of [...claims].sort((a,b)=>a.feedMinute-b.feedMinute)){let left=a.quantity;for(const lot of lots.filter(l=>l.ready<=a.feedMinute&&a.feedMinute<l.expiry).sort((a,b)=>a.expiry-b.expiry||a.ready-b.ready)){const take=Math.min(left,lot.quantity-lot.used);lot.used+=take;left-=take;}productionValid.set(a,left<1e-6&&id==='production:'+source?.productionId);}
  }
 }
 if(d.urgentOrder){
  const groups=new Map();for(const a of p.allocations||[])if(a.supplyId?.startsWith('wip:'))(groups.get(a.supplyId)||groups.set(a.supplyId,[]).get(a.supplyId)).push(a);
  for(const [id,claims]of groups){const wid=id.slice(4),w=d.mapping.wip_remaining.find(w=>w.id===wid),record=rows(d,'期初在制').find(r=>r['在制批次编号']===wid),shelf=Number(rows(d,'物料主数据').find(r=>r['物料编号']===w?.product)?.['保质天数'])*1440,remaining=w?.remaining_route_steps.filter(x=>x!==w.current_route_step)||[],last=remaining.at(-1),finals=tasks.filter(t=>t.productionId===wid&&t.routeStepId===last);
   const lots=remaining.length?finals.map(t=>({ready:Math.max(t.end,w.releaseMinute),expiry:t.end+shelf,quantity:t.quantity,used:0})):w&&record?[{ready:w.releaseMinute,expiry:w.completeMinute+shelf,quantity:Number(record['预计合格产出']),used:0}]:[];
   for(const a of [...claims].sort((a,b)=>a.feedMinute-b.feedMinute)){let left=a.quantity;for(const lot of lots.filter(l=>l.ready<=a.feedMinute&&a.feedMinute<l.expiry).sort((a,b)=>a.expiry-b.expiry)){const take=Math.min(left,lot.quantity-lot.used);lot.used+=take;left-=take;}productionValid.set(a,left<1e-6);}
  }
 }
 for(const a of p.allocations||[]){const [kind,...rest]=a.supplyId.split(':'),id=rest.join(':'),feed=a.feedMinute;let qty,ready,expiry,material,quality=true;
  if(d.urgentOrder&&rows(d,'物料主数据').find(r=>r['物料编号']===a.materialId)?.['基础单位']==='个'&&!Number.isInteger(a.quantity))add('实物个数非整数 '+a.materialId);
  if(!(a.quantity>0)||!Number.isSafeInteger(feed)||Math.floor(feed/1440)!==a.feedDay){add('分配数量/分钟不符 '+a.supplyId);continue;}
  if(kind==='inventory'){const r=rows(d,'期初库存').find(r=>r['库存批次编号']===id);if(!r){add('库存来源未知');continue;}qty=Number(r['当前数量'])-Number(r['期初已占用量']);material=r['物料编号'];ready=Number(r['放行日'])<=Number(r['快照日'])&&Number(r['快照日'])===0?1440:Number(r['放行日'])*1440+boundary(d,'日粒度放行时点分钟',0,'CAL');expiry=Number(r['到期日'])*1440+boundary(d,'批次到期日内失效分钟',0);quality=['合格','已放行'].includes(r['质量状态']);}
  else if(kind==='transit'){const r=rows(d,'既有采购在途').find(r=>r['在途记录编号']===id),s=rows(d,'供应商与供货条件').find(s=>s['供货关系编号']===r?.['供货关系编号']);if(!r||!s){add('在途来源未知');continue;}qty=Number(r['订购数量']);material=r['物料编号'];ready=Math.max(Number(r['预计放行日'])*1440+boundary(d,'日粒度放行时点分钟',0,'CAL'),Number(r['约定到货日'])*1440+boundary(d,'日粒度到货时点分钟',0,'CAL')+Number(s['检验天数'])*1440);expiry=Number(r['预计到期日'])*1440+boundary(d,'批次到期日内失效分钟',0);quality=!['作废','取消','冻结','待检'].includes(r['在途状态']);if(!a.conditional)add('在途冒充实物');}
  else if(kind==='production'){const final=byId.get(a.source?.taskId);if(!final){add('制造来源未知');continue;}const finalGroup=tasks.filter(t=>t.productionId===final.productionId&&t.routeStepId===final.routeStepId);qty=finalGroup.reduce((n,t)=>n+t.quantity,0);ready=d.urgentOrder?final.end:Math.max(...finalGroup.map(t=>t.end));material=final.productId;expiry=ready+Number(rows(d,'物料主数据').find(r=>r['物料编号']===material)?.['保质天数'])*1440;}
  else if(kind==='wip'){const w=d.mapping.wip_remaining.find(w=>w.id===id),r=rows(d,'期初在制').find(r=>r['在制批次编号']===id),finals=tasks.filter(t=>t.productionId===id);if(!w||!r||!w.remaining_route_steps.filter(x=>x!==w.current_route_step).every(rid=>finals.some(t=>t.routeStepId===rid))){add('在制续作未完成');continue;}qty=Number(r['预计合格产出']);ready=d.urgentOrder?w.releaseMinute:Math.max(w.releaseMinute,...finals.map(t=>t.end));material=w.product;expiry=Math.max(w.completeMinute,...finals.map(t=>t.end))+Number(rows(d,'物料主数据').find(r=>r['物料编号']===material)?.['保质天数'])*1440;}
  else if(kind==='draft'){const r=d.drafts?.find(r=>r.id===id&&r.status==='adopted');if(!r){add('未采用草稿');continue;}qty=r.quantity;material=r.materialId;ready=r.availableDay*1440+boundary(d,'日粒度放行时点分钟',0,'CAL');expiry=r.expiryDay*1440+boundary(d,'批次到期日内失效分钟',0);}
  else {add('未知供给类别');continue;}
  const preservedConsumption=d.urgentWorkspace&&a.executionConsumed&&d.urgentOrder.seedAllocations.some(x=>JSON.stringify(x)===JSON.stringify(a));
  const total=(used.get(a.supplyId)||0)+a.quantity;used.set(a.supplyId,total);if(material!==a.materialId||!quality&&!preservedConsumption||feed<ready||feed>=expiry||total>qty+1e-6||['production','wip'].includes(kind)&&d.urgentOrder&&!productionValid.get(a))add('供给资格/余额不符 '+a.supplyId);
  if(a.taskId){const t=byId.get(a.taskId);if(!t||t.start!==feed)add('实际投料时刻失配 '+a.supplyId);}
 }
 const groups=new Map();for(const t of tasks){const k=t.productionId+'|'+t.routeStepId;(groups.get(k)||groups.set(k,[]).get(k)).push(t);}
 for(const [key,group]of groups){const t=group[0],w=d.mapping.wip_remaining.find(w=>w.id===t.productionId),quantity=group.reduce((n,t)=>n+t.quantity,0),day=Math.floor(group[0].start/1440);
  for(const f of d.mapping.feed_mappings.filter(f=>f.route_step_id===t.routeStepId&&(!w||w.remaining_material_bom_ids.includes(f.bom_id)))){const b=rows(d,'物料清单').find(b=>b['用量关系编号']===f.bom_id);if(!b||Number(b['生效日'])>day||day>=Number(b['失效日']))continue;const exact=Number(b['子项基准用量'])*quantity/Number(b['父项基准产出千克']),expected=b['数量单位']==='个'?Math.ceil(exact):exact,actual=(p.allocations||[]).filter(a=>a.consumer===(w?w.id:key)&&a.materialId===b['子项编号']).reduce((n,a)=>n+a.quantity,0);if(Math.abs(expected-actual)>1e-5)add('BOM投料不守恒 '+key+'/'+f.bom_id);}
 }
 return {status:issues.length?'problem':'pass',issues:[...new Set(issues)],scope:['整数分钟/半开/显式原点','工时/等待/清洗有向矩阵','分钟班次/可知停机','人员事件峰值/实体工具/重量共享/WIP','日量/有效批量','供给资格/累计余额/投料守恒','需求完整身份'],notChecked:[],inputHash:createHash('sha256').update(JSON.stringify(d)).digest('hex')};
}
