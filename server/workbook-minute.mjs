// Production-minute strategy for the existing workbook planner. Business dates
// stay days; every production interval is an integer-minute half-open interval.
export const MINUTE_DATASET='APS-MEAT-202611-V2.0';
export const MINUTE_ORIGIN='2026-10-31T00:00:00+08:00';
export const MINUTE_ENGINE='workbook-minute-v2';
export const weightSharedResource=r=>['重量共享','重量容量共享'].includes(r?.['资源占用方式']);
export const minuteMode=d=>d.productionContract===MINUTE_ENGINE;
const rows=(d,t)=>d.tables?.[t]||[];
export const integer=(v,label)=>{if(v===undefined||v===null||String(v).trim()===''||!Number.isSafeInteger(Number(v)))throw Error(label+'须为显式整数分钟');return Number(v);};
export function instantMinute(text,origin=MINUTE_ORIGIN){
 const s=String(text||'').replace(/^(\d{4})\.(\d{2})\.(\d{2}) /,'$1-$2-$3T');
 const iso=/[zZ]|[+-]\d\d:\d\d$/.test(s)?s:s+':00+08:00',n=(Date.parse(iso)-Date.parse(origin))/60000;
 if(!Number.isSafeInteger(n))throw Error('日期时刻须明确到整数分钟与时区');return n;
}
export const minuteTime=(n,origin=MINUTE_ORIGIN)=>{if(!Number.isSafeInteger(n))return null;const offset=/([+-])(\d\d):(\d\d)$/.exec(origin);if(!offset)throw Error('分钟原点缺时区');const shift=(offset[1]==='-'?-1:1)*(Number(offset[2])*60+Number(offset[3]));return new Date(Date.parse(origin)+(n+shift)*60000).toISOString().slice(0,16).replaceAll('-','.').replace('T',' ');};
export const overlap=(a,b)=>a.start<b.end&&b.start<a.end;
export function unionMinutes(intervals,start=-Infinity,end=Infinity){const a=intervals.map(x=>({start:Math.max(start,x.start),end:Math.min(end,x.end)})).filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start||a.end-b.end);let total=0,last=-Infinity;for(const x of a){total+=Math.max(0,x.end-Math.max(x.start,last));last=Math.max(last,x.end);}return total;}
export function eventPeak(intervals,start=-Infinity,end=Infinity){const events=[];for(const x of intervals){const a=Math.max(start,x.start),b=Math.min(end,x.end);if(a<b){events.push([a,Number(x.amount??1)],[b,-Number(x.amount??1)]);}}events.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let used=0,peak=0;for(const [,n]of events){used+=n;peak=Math.max(peak,used);}return peak;}
const list=s=>String(s||'').split(/[,，、]/).map(x=>x.trim()).filter(Boolean);
export function projectMinuteInputs(d){
 if(!minuteMode(d))return d;
 const resources=rows(d,'设备与工装'),wips=rows(d,'在制剩余映射'),facts=new Map(rows(d,'期初在制').map(x=>[x['在制批次编号'],x]));
 const pools={};for(const r of rows(d,'工装资源池'))(pools[r['工装类型']]??=[]).push(r['实体工装编号']);
 d.timeUnit='minute';d.dayZero='2026-10-31';d.minuteOrigin=MINUTE_ORIGIN;d.timezone='Asia/Shanghai';d.datasetVersion=MINUTE_DATASET;
 d.mapping={version:MINUTE_ENGINE,mock:true,source:'V2显式配套表；可在业务维护入口编辑',line:{id:'LN01',factoryId:'FC01'},sfRoutes:[],resources:resources.map(r=>({id:r['资源编号'],line_id:r['产线编号'],group:r['资源组编号'],kind:r['资源类别'],units:Number(r['可用数量']),batch_kg:Number(r['单次批量上限千克']),daily_kg:Number(r['标准日产能千克']),occupancy_kg:Number(r['同时占位上限千克'])})),tool_pools:pools,feed_mappings:rows(d,'工序投料').map(r=>({bom_id:r['用量关系编号'],route_step_id:r['路线工序编号'],source:{sheet:'工序投料',row:r._row,key:r['投料映射编号']}})),wip_remaining:wips.map(r=>{const f=facts.get(r['在制批次编号']);return {id:r['在制批次编号'],product:f?.['成品编号'],resource:r['当前占用设备编号'],quantity:Number(r['当前占用数量千克']),current_route_step:r['当前路线工序编号'],current_occupancy_minute_interval:[integer(r['保留开始分钟偏移'],'WIP保留开始'),integer(r['保留结束分钟偏移'],'WIP保留结束')],current_occupancy_day_interval:[Number(r['保留开始分钟偏移'])/1440,Number(r['保留结束分钟偏移'])/1440],current_tools:list(r['当前实体工装编号']),tool_release:instantMinute(r['工装保留至']),remaining_route_steps:list(r['剩余路线工序编号']),remaining_material_bom_ids:list(r['尚需投料BOM编号']),remaining_labor_pool:r['剩余人员班组编号'],remaining_labor_count:Number(r['结束参与人数']),labor_end_minutes:integer(r['结束参与分钟'],'WIP尾段人员'),remaining_tool_type:rows(d,'工装资源池').find(t=>list(r['当前实体工装编号']).includes(t['实体工装编号']))?.['工装类型'],remaining_tool_count:list(r['当前实体工装编号']).length,completeMinute:instantMinute(r['预计完工时刻']),releaseMinute:instantMinute(r['预计放行时刻']),source:{sheet:'在制剩余映射',row:r._row,key:r['在制批次编号']}};})};
 return d;
}
export function minuteParameter(d,object,field,day=0){
 // applyParameters resolves P / online overlays first; this view is the same
 // frozen effective list used by both parameter entry points.
 const p=d.effectiveParameters?.values?.find(p=>p.object===object&&p.field===field&&Number(p.from)<=day&&day<Number(p.to));
 if(!p||p.blocked||p.value===undefined||p.value===null)throw Error('分钟边界参数待补：'+object+'/'+field);return p.value;
}
export function boundary(d,field,day,object='GLOBAL'){return integer(minuteParameter(d,object,field,d.parameterContext?.effectiveDay??0),field);}
export function minuteIssues(d){
 if(!minuteMode(d))return [];
 const out=[],add=(sheet,record,field,message)=>out.push({code:'MINUTE_INPUT',severity:'error',sheet,row:record?._row??0,record:record?.['路线工序编号']||record?.['规则编号']||'',field,message});
 for(const t of ['生产班次','换型清洗','工序投料','工装资源池','在制剩余映射','日业务时点规则'])if(!rows(d,t).length)add(t,null,'','V2完整分钟输入表缺失');
 for(const r of rows(d,'工艺路线'))try{
  for(const f of ['基准加工分钟','固定准备分钟','最短工艺分钟','最大等待分钟','开始参与分钟','结束参与分钟','工装后延释放分钟'])if(integer(r[f],f)<0)throw Error(f+'不得负');
  if(!(Number(r['基准加工量千克'])>0)||!['按量加工','固定连续历时'].includes(r['工时模型'])||!['全程参与','首尾参与'].includes(r['人员参与方式'])||!['是','否'].includes(r['允许跨班连续']))throw Error('工时模型/基准量/参与方式/跨班规则待补');
  if(!(Number(r['基准加工分钟'])>0))throw Error('0天不能回退0分钟/1天');
 }catch(e){add('工艺路线',r,'工时模型',e.message);}
 for(const t of ['生产班次','停机安排'])for(const r of rows(d,t))try{const a=integer(r['开始分钟偏移'],'开始'),b=integer(r['结束分钟偏移'],'结束');if(b<=a)throw Error('分钟区间须非空');if(t==='停机安排')instantMinute(r['信息可知时刻']);}catch(e){add(t,r,'开始分钟偏移',e.message);}
 for(const [object,field]of [['GLOBAL','生产计算精度分钟'],['GLOBAL','甘特显示刻度分钟'],['CAL','第一班开始分钟'],['CAL','第一班结束分钟'],['CAL','第二班开始分钟'],['CAL','第二班结束分钟'],['CAL','日粒度放行时点分钟'],['CAL','日粒度到货时点分钟'],['GLOBAL','最早交付日内时点分钟'],['GLOBAL','最晚交付日内时点分钟'],['GLOBAL','批次到期日内失效分钟']])try{boundary(d,field,0,object);}catch(e){add('配置参数',null,field,e.message);}
 return out;
}
export function shiftWindows(d,crew,day,resource){
 const cal=rows(d,'工厂日历').find(r=>Number(r['日序'])===day);if(!cal)return [];
 const sunday=new Date(Date.UTC(2026,9,31)+day*86400000).getUTCDay()===0,count=Math.min(Number(cal['生产班次数']),Number(crew[sunday?'周日班次数':'标准日班次数']));
 const definitions=rows(d,'生产班次').filter(r=>Math.floor(Number(r['开始分钟偏移'])/1440)===day).sort((a,b)=>Number(a['开始分钟偏移'])-Number(b['开始分钟偏移']));
 const regular=definitions.slice(0,count).map((r,i)=>({start:day*1440+boundary(d,(i?'第二':'第一')+'班开始分钟',day,'CAL'),end:day*1440+boundary(d,(i?'第二':'第一')+'班结束分钟',day,'CAL'),source:{sheet:'生产班次',row:r._row,key:r['班次日历编号']}}));
 const extra=d.urgentWorkspace?.strategy==='overtime'?d.urgentWorkspace.overtime.filter(o=>o.crew===crew['班组编号']&&(!resource||o.resource===resource)&&Math.floor(o.start/1440)===day).map(o=>({...o,overtime:true})):[];
 const scenario=(d.scenarioConditions?.overtime||[]).filter(o=>o.crew===crew['班组编号']&&(!resource||o.resource===resource)&&Math.floor(o.start/1440)===day).map(o=>({...o,overtime:true}));
 return [...regular,...extra,...scenario];
}
export function crewLoadFits(d,crew,usage,start,end){
 const extra=(d.scenarioConditions?.personnel||[]).filter(x=>x.crew===crew['班组编号']);
 const points=[start,...usage.flatMap(x=>[x.start,x.end]),...extra.flatMap(x=>[x.start,x.end])].filter(n=>start<=n&&n<end);
 return points.every(at=>usage.filter(x=>x.start<=at&&at<x.end).reduce((n,x)=>n+x.amount,0)<=Number(crew['每班可用人数'])+extra.filter(x=>x.start<=at&&at<x.end).reduce((n,x)=>n+x.after-x.before,0));
}
export function laborSegments(route,start,end){
 if(route['人员参与方式']!=='首尾参与')return [{start,end}];
 const head={start,end:Math.min(end,start+Number(route['开始参与分钟']))},tail={start:Math.max(start,end-Number(route['结束参与分钟'])),end};
 // A short operation can have intersecting participation windows. These are
 // the same crew members, so their intersection must not double the demand.
 if(head.end>=tail.start)return [{start,end}];
 return [head,tail].filter(x=>x.start<x.end);
}
export function routeMinutes(route,quantity){const base=integer(route['基准加工分钟'],'基准加工'),prepare=integer(route['固定准备分钟'],'准备'),minimum=integer(route['最短工艺分钟'],'最短工艺');const process=route['工时模型']==='固定连续历时'?base:Math.ceil(quantity/Number(route['基准加工量千克'])*base);const duration=Math.max(minimum,prepare+process);if(!(duration>0))throw Error('生产历时须>0');return duration;}
export function knownMinuteStops(d,currentMinute){return rows(d,'停机安排').filter(r=>instantMinute(r['信息可知时刻'])<=currentMinute).map(r=>({id:r['停机编号'],resource:r['资源编号'],start:integer(r['开始分钟偏移'],'停机开始'),end:integer(r['结束分钟偏移'],'停机结束'),source:{sheet:'停机安排',row:r._row}}));}
export function wipOccupations(d,start,end){return (d.mapping?.wip_remaining||[]).filter(w=>w.current_occupancy_minute_interval?.[0]<end&&Math.max(w.current_occupancy_minute_interval?.[1],w.tool_release??-Infinity)>start).map(w=>{const [a,b]=w.current_occupancy_minute_interval;return {start:Math.max(a,start),end:Math.max(b,start),resource:w.resource,quantity:w.quantity,crew:w.remaining_labor_pool,people:w.remaining_labor_count,labor:[{start:Math.max(a,b-w.labor_end_minutes,start),end:b}],tools:w.current_tools,toolEnd:w.tool_release,taskId:w.id,kind:'WIP物理保留',source:w.source};});}
export function minuteResourceCandidate({d,route,quantity,earliest,end,occupancy,daily,resources,crew,pool,standardBatch,currentMinute,predecessor,orderId}){
 const lower=Math.ceil(earliest*1440-1e-7),limit=end*1440,people=Number(route['需求人数']),count=Number(route['每批工装套数']),stops=knownMinuteStops(d,currentMinute),busy=occupancy.map(o=>({...o,start:Math.round(o.start*1440),end:Math.round(o.end*1440)}));
 const candidates=resources.filter(r=>r['资源类别']==='设备'&&r['资源组编号']===route['设备组编号']&&Number(r['可用数量'])>0),crewId=crew['班组编号'];
 for(let day=Math.floor(lower/1440);day<end;day++)for(const resource of candidates){
  const allShifts=[];for(let n=Math.floor(lower/1440);n<end;n++)allShifts.push(...shiftWindows(d,crew,n,resource['资源编号']));
  const inShifts=(a,b)=>a===b||unionMinutes(allShifts,a,b)>=b-a;
  const id=resource['资源编号'],key=id+'|'+day,calendar=rows(d,'工厂日历').find(r=>Number(r['日序'])===day);if(!calendar)continue;
  const regular=shiftWindows(d,crew,day,id).filter(s=>!s.overtime),extra=shiftWindows(d,crew,day,id).filter(s=>s.overtime);
  const ratio=Math.min(Number(calendar['生产班次数'])/Number(calendar['日产能分母']),regular.length/Number(crew['标准日班次数'])),capacity=Number(resource['标准日产能千克'])*ratio+extra.reduce((n,o)=>n+o.capacityKg,0),available=capacity-(daily.get(key)||0);
  const toolCap=count?Math.max(0,...pool.map(id=>Number(resources.find(r=>r['资源编号']===id)?.['单次批量上限千克'])))*count:Infinity;
  const batch=Math.min(quantity,Number(resource['单次批量上限千克']),weightSharedResource(resource)?Number(resource['同时占位上限千克']):Infinity,available,toolCap,standardBatch);
  if(!(batch>0))continue;const duration=routeMinutes(route,batch),tail=Number(route['结束参与分钟']),head=Number(route['开始参与分钟']);
  const points=new Set([Math.max(lower,day*1440)]);
  for(const c of d.scenarioConditions?.personnel||[])if(c.crew===crewId)for(const n of [c.start,c.end])if(n>=day*1440&&n<(day+1)*1440)points.add(Math.max(lower,n));
  for(const s of allShifts){for(const n of [s.start,s.end-duration,s.start-duration+tail,s.end-head])if(n>=day*1440&&n<(day+1)*1440)points.add(Math.max(lower,n));}
  for(const o of busy)for(const n of [o.end,o.toolEnd,o.end-duration+tail,...(o.labor||[]).flatMap(l=>[l.end,l.end-duration+tail])])if(Number.isFinite(n)&&n>=day*1440&&n<(day+1)*1440)points.add(Math.max(lower,n));
  for(const s of stops)if(s.resource===id&&s.end>=day*1440&&s.end<(day+1)*1440)points.add(Math.max(lower,s.end));
  for(const x of [...points].sort((a,b)=>a-b)){
   if(x<lower||x>=Math.min(limit,(day+1)*1440))continue;
   const previous=busy.filter(o=>o.resource===id&&o.end<=x&&o.productId).sort((a,b)=>b.end-a.end||String(a.taskId).localeCompare(String(b.taskId)))[0];
   let clean=null,cleaning=0;if(previous){clean=rows(d,'换型清洗').find(c=>c['设备组编号']===route['设备组编号']&&c['前产品编号']===previous.productId&&c['后产品编号']===route['成品编号']);if(!clean)throw Error('缺少有向清洗规则：'+route['设备组编号']+'/'+previous.productId+'/'+route['成品编号']);cleaning=integer(clean['清洗分钟'],'清洗');}
   const at=x+cleaning,until=at+duration;if(until>limit||Math.floor(at/1440)!==day)continue;
   const semi=d.urgentWorkspace?.semiTasks.filter(t=>t.orderId===orderId&&t.routeStepId===route['路线工序编号'])||[];
   if(semi.length&&!semi.some(t=>t.machine===id&&t.crew===crewId&&t.quantity===batch&&t.end-t.start===duration&&at>=t.start))continue;
   // WIP and material-delayed operations use the actual previous task finish,
   // rather than resetting the waiting clock to the new material-ready time.
   if(predecessor&&predecessor.routeStepId!==route['路线工序编号']&&at-predecessor.endMinute>integer(route['最大等待分钟'],'最大等待'))continue;
   // A gap insertion must preserve an already reserved successor's directed
   // cleaning. Do not silently change its predecessor without rescheduling it.
   const successor=busy.filter(o=>o.resource===id&&o.productId&&o.start>=until).sort((a,b)=>a.start-b.start||String(a.taskId).localeCompare(String(b.taskId)))[0];
   if(successor){
    const boundary=successor.cleaning?.start??successor.start,prior=busy.filter(o=>o.resource===id&&o.productId&&o.end<=boundary).sort((a,b)=>b.end-a.end||String(a.taskId).localeCompare(String(b.taskId)))[0];
    if(until<=boundary&&(!prior||until>=prior.end)){
     const nextRule=rows(d,'换型清洗').find(c=>c['设备组编号']===route['设备组编号']&&c['前产品编号']===route['成品编号']&&c['后产品编号']===successor.productId);
     if(!nextRule||(successor.cleaning?(successor.cleaning.rule!==nextRule['清洗规则编号']||successor.cleaning.crew!==crewId||successor.cleaning.end-successor.cleaning.start!==Number(nextRule['清洗分钟'])):Number(nextRule['清洗分钟'])!==0))continue;
    }
   }
   const job={start:at,end:until},physical={start:x,end:until};
   if(stops.some(s=>s.resource===id&&overlap(s,physical)))continue;
   if(resource['生产日历方式']==='工厂班次'&&!inShifts(x,until))continue;
   if(route['允许跨班连续']==='否'&&!allShifts.some(s=>s.start<=x&&until<=s.end))continue;
   const labor=laborSegments(route,at,until),cleanCrew=previous?.crew,cleanPeople=Number(clean?.['清洗人数']||0);
   if(labor.some(l=>!inShifts(l.start,l.end))||cleaning&&!inShifts(x,at))continue;
   const same=busy.filter(o=>o.resource===id&&overlap(o,physical));
   if(weightSharedResource(resource)){if(eventPeak([...same.map(o=>({...o,amount:o.quantity})),{...physical,amount:batch}],x,until)>Number(resource['同时占位上限千克']))continue;}
   else if(same.length)continue;
   const peopleAt=busy.filter(o=>o.crew===crewId).flatMap(o=>(o.labor||[{start:o.start,end:o.end}]).map(l=>({...l,amount:o.people})));
   if(!crewLoadFits(d,crew,[...peopleAt,...labor.map(l=>({...l,amount:people})),...(cleaning&&cleanCrew===crewId?[{start:x,end:at,amount:cleanPeople}]:[])],x,until))continue;
   if(cleaning&&cleanCrew!==crewId){const pc=rows(d,'班组资源').find(c=>c['班组编号']===cleanCrew);if(!pc||!crewLoadFits(d,pc,[...busy.filter(o=>o.crew===cleanCrew).flatMap(o=>(o.labor||[{start:o.start,end:o.end}]).map(l=>({...l,amount:o.people}))),{start:x,end:at,amount:cleanPeople}],x,at))continue;}
   const toolEnd=until+integer(route['工装后延释放分钟'],'工装释放'),tools=pool.filter(t=>Number(resources.find(r=>r['资源编号']===t)?.['单次批量上限千克'])*count>=batch&&!busy.some(o=>o.tools?.includes(t)&&overlap({start:at,end:toolEnd},{start:o.start,end:o.toolEnd??o.end}))).slice(0,count);
   if(tools.length<count)continue;
   const regularMinutes=unionMinutes(allShifts.filter(s=>!s.overtime),x,until);
   if((d.urgentWorkspace?.strategy==='overtime'||d.scenarioConditions?.overtime.length)&&regularMinutes<until-x&&!extra.some(o=>o.start<=x&&until<=o.end&&o.people>=people&&(!cleaning||cleanCrew===crewId&&o.people>=cleanPeople)&&tools.every(t=>o.tools.includes(t))))continue;
   if(semi.length&&!semi.some(t=>t.machine===id&&t.quantity===batch&&JSON.stringify(t.tools)===JSON.stringify(tools)))continue;
   return {start:at/1440,end:until/1440,resource:id,crew:crewId,people,tools,quantity:batch,key,route,labor,toolEnd,productId:route['成品编号'],cleaning:cleaning?{start:x,end:at,resource:id,crew:cleanCrew,people:cleanPeople,quantity:0,rule:clean['清洗规则编号'],source:{sheet:'换型清洗',row:clean._row}}:null};
  }
 }
 return null;
}
