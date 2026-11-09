import {cloneForParameters} from './workbook-workbench.mjs';
import {refreshDerived,hash,PROFILE} from './workbook-model.mjs';
import {effectiveParameters} from './parameter-contract.mjs';
import {effectiveBom} from './query-reports/bom.mjs';
import {number as num,calendarDay,dayCalendar,table} from './query-reports/context.mjs';
import {evaluateCapacity} from './capacity-lp.mjs';
const bad=message=>{throw Object.assign(Error(message),{status:422});};
const list=(d,t)=>table(d,t),positive=(v,message)=>{const n=num(v);if(!(n>0))bad(message);return n;};
export const capacityDefaults={timePct:100,equipmentPct:100,crewPct:100,toolPct:100,speedPct:100,recoveryPct:0,overtimeHours:0,standardHours:null,batchKg:null,shifts:null,sundayShifts:null,crewAdds:{},toolAdds:{},equipmentAdds:{}};
const bounds={timePct:[0,200],equipmentPct:[0,100],crewPct:[0,100],toolPct:[0,100],speedPct:[25,200],recoveryPct:[0,100],overtimeHours:[0,12],standardHours:[1,24],batchKg:[.001,100000],shifts:[0,3],sundayShifts:[0,3]};
const parameterLabels={timePct:'有效工作时间',equipmentPct:'设备有效率',crewPct:'班组出勤率',toolPct:'工装可用率',speedPct:'可变加工速度',recoveryPct:'已知停机恢复',overtimeHours:'额外工作时长',standardHours:'标准日产能对应工时',batchKg:'模拟标准批量',shifts:'工厂生产班次',sundayShifts:'班组周日班次'};
export function capacityOptions(v){
 const d=v.input,resources=list(d,'设备与工装'),routes=[...list(d,'工艺路线'),...(d.mapping?.sfRoutes||[])];
 const groups=[...new Set(resources.filter(r=>r['资源类别']==='设备').map(r=>r['资源组编号']))].filter(Boolean).map(id=>({id,name:resources.find(r=>r['资源组编号']===id)?.['资源组名称']||id,count:resources.filter(r=>r['资源组编号']===id&&r['资源类别']==='设备'&&(num(r['可用数量'])??1)>0).length}));
 const pools=toolPools(d);
 return {identity:v.identity,defaults:capacityDefaults,materials:list(d,'物料主数据').filter(m=>m['物料来源']==='制造'&&m['基础单位']==='千克').map(m=>({id:m['物料编号'],name:m['物料名称'],boxKg:num(m['每箱净重千克']),pieceKg:num(m['每件净重千克']),hasRoute:routes.some(r=>r['成品编号']===m['物料编号'])})),crews:list(d,'班组资源').map(c=>({id:c['班组编号'],name:c['班组名称'],count:num(c['每班可用人数'])})),tools:Object.entries(pools).map(([id,ids])=>({id,name:id,count:ids.filter(id=>resources.some(r=>r['资源编号']===id&&(num(r['可用数量'])??1)>0)).length})),equipment:groups,days:list(d,'工厂日历').map(c=>({day:Number(c['日序']),date:dayCalendar(v.identity.dayZero,Number(c['日序']))}))};
}
function toolPools(d){
 const pools=Object.fromEntries(Object.entries(d.mapping?.tool_pools||{}).map(([key,ids])=>[key,[...new Set(ids)]]));
 for(const r of list(d,'设备与工装').filter(r=>r['资源类别']==='工装')){const name=r['资源组名称'];if(name&&!Object.hasOwn(pools,name))pools[name]=list(d,'设备与工装').filter(x=>x['资源类别']==='工装'&&x['资源组名称']===name).map(x=>x['资源编号']);}
 return pools;
}
export function capacityRequest(v,body){
 const allowed=['identity','products','mode','scenario','fromDate','toDateInclusive','knownAsOfDate','detailDay','thresholdPct','constraintId','offset','reason'];
 if(Object.keys(body).some(k=>!allowed.includes(k)))bad('产能分析请求包含未知字段');
 let from,to,known,day;try{from=calendarDay(v.identity.dayZero,body.fromDate);to=calendarDay(v.identity.dayZero,body.toDateInclusive);known=calendarDay(v.identity.dayZero,body.knownAsOfDate);day=calendarDay(v.identity.dayZero,body.detailDay);}catch{bad('请填写有效的开始、结束、信息截至及查看日期');}
 if(![from,to,known,day].every(Number.isInteger)||from<0||to<from||to-from>=31||day<from||day>to)bad('日期范围须为1至31个自然日，查看日期须在范围内');
 if(!Array.isArray(body.products)||!body.products.length||body.products.length>40||new Set(body.products.map(p=>p.id)).size!==body.products.length)bad('请选择1至40个不重复的制造物料');
 const opts=capacityOptions(v),ids=new Set(opts.materials.map(m=>m.id));
 const products=body.products.map(p=>{if(!ids.has(p.id)||!Number.isFinite(p.share)||p.share<0||p.share>100000)bad('物料或配比无效');return {id:p.id,share:p.share};});
 const mode=body.mode||'fixed';if(!['fixed','max'].includes(mode)||mode==='fixed'&&!products.some(p=>p.share>0))bad('固定配比至少一项大于0');
 const scenario={...capacityDefaults,...body.scenario};
 if(!body.scenario||Object.keys(body.scenario).some(k=>!Object.hasOwn(capacityDefaults,k)))bad('模拟参数包含未知项');
 for(const [key,[min,max]]of Object.entries(bounds)){const value=scenario[key];if(value===null&&['standardHours','batchKg','shifts','sundayShifts'].includes(key))continue;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||['shifts','sundayShifts'].includes(key)&&!Number.isInteger(value))bad(parameterLabels[key]+'须在'+min+'至'+max+'之间'+(['shifts','sundayShifts'].includes(key)?'，并填写整数':''));}
 if(scenario.overtimeHours>0&&!scenario.standardHours)bad('请先填写标准日产能对应的工作小时，再换算加班时长');
 if(scenario.standardHours&&scenario.standardHours+scenario.overtimeHours>24)bad('基准工时与加班合计不能超过24小时');
 for(const [key,options]of [['crewAdds',opts.crews],['toolAdds',opts.tools],['equipmentAdds',opts.equipment]]){
  const changes=scenario[key];if(!changes||typeof changes!=='object'||Array.isArray(changes))bad('资源增加量须按资源指定');
  for(const [id,value]of Object.entries(changes))if(!options.some(o=>o.id===id)||!Number.isInteger(value)||value<0||value>100)bad('新增资源无效：'+id);
 }
 const threshold=body.thresholdPct??20;if(!Number.isFinite(threshold)||threshold<5||threshold>100)bad('异常阈值须在5%至100%之间');
 const request={products,mode,scenario,fromDate:body.fromDate,toDateInclusive:body.toDateInclusive,knownAsOfDate:body.knownAsOfDate,detailDay:body.detailDay,thresholdPct:threshold};
 return {...request,from,to,known,day,fingerprint:hash({identity:v.identity,...request})};
}

// A continuous steady-state upper bound in the current day-engine contract.
// Calendar-day holding spans are never shortened by overtime or work-speed changes.
export function capacityDayInput(v,day){
 const d=cloneForParameters(v.input);d.parameterContext={scope:v.identity.scope,effectiveDay:day};refreshDerived(d,day);return d;
}
export function buildCapacityConstraints(d,v,req,day,scenario=req.scenario){
 if(d.profile!==PROFILE)bad('当前产能上限模型需要合格产出BOM口径');
 if(d.productionContract==='workbook-minute-v2')bad('当前综合产能支持按天模型；分钟模型的工时、跨班和参与方式需要独立口径，不能套用按天结果');
 const calendar=list(d,'工厂日历').find(c=>Number(c['日序'])===day);if(!calendar)bad('工厂日历缺少日期：'+dayCalendar(v.identity.dayZero,day));
 const sunday=new Date(dayCalendar(v.identity.dayZero,day)+'T00:00:00Z').getUTCDay()===0;
 const denominator=positive(calendar['日产能分母'],'工厂日历缺少标准班次数');
 const actual=scenario.shifts??num(calendar[d.parameterContract?'生产班次数':'日产能分子']);if(actual===null||actual<0)bad('工厂日历班次数无效');
 const time=scenario.timePct/100*(1+(scenario.standardHours?scenario.overtimeHours/scenario.standardHours:0));
 const factory=actual/denominator*time,resources=list(d,'设备与工装').map(r=>({...r}));
 if(scenario.standardHours&&factory*scenario.standardHours>24+1e-8)bad('模拟班次、工时系数和加班折算后超过24小时，请减少其中一项');
 for(const r of d.mapping?.resources||[])if(!resources.some(x=>x['资源编号']===r.id))resources.push({'资源编号':r.id,'资源名称':r.id,'资源类别':r.kind,'资源组编号':r.group,'可用数量':r.units,'单次批量上限千克':r.batch_kg,'标准日产能千克':r.daily_kg});
 const sourceResources=new Map(resources.map(r=>[r['资源编号'],r])),pools=toolPools(d),graph=effectiveBom(d,day),routes=[...list(d,'工艺路线'),...(d.mapping?.sfRoutes||[])],constraints=new Map(),stages=[],events=[],equipmentFacts=new Map(),toolFacts=new Map(),crewFacts=new Map();
 const n=req.products.length,globalBatch=scenario.batchKg??num(effectiveParameters(d,day,v.identity.scope).find(p=>p['对象编号']==='GLOBAL'&&p['参数名称']==='标准生产批量千克')?.['参数值'])??Infinity;
 const add=(id,kind,name,unit,budget,index,cost,term,source)=>{
  if(!Number.isFinite(budget)||budget<0||!Number.isFinite(cost)||cost<0)bad('资源预算或占用系数无效：'+name);
  let row=constraints.get(id);if(!row){row={id,kind,name,unit,budget,cost:Array(n).fill(0),terms:[],source};constraints.set(id,row);}
  if(Math.abs(row.budget-budget)>1e-8)bad('同一共享资源出现不一致预算：'+name);
  row.cost[index]+=cost;if(cost>0)row.terms.push({...term,productId:req.products[index].id,coefficient:cost});
 };
 const activeStops=list(d,'停机安排').filter(s=>num(s['可知日'])!==null&&Number(s['可知日'])<=req.known&&num(s['开始日'])!==null&&num(s['结束日'])!==null&&Number(s['开始日'])<day+1&&day<Number(s['结束日']));
 const stopFraction=id=>{const spans=activeStops.filter(s=>s['资源编号']===id).map(s=>[Math.max(day,Number(s['开始日'])),Math.min(day+1,Number(s['结束日']))]).sort((a,b)=>a[0]-b[0]);let sum=0,end=day;for(const [a,b]of spans){sum+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return Math.max(0,1-sum*(1-scenario.recoveryPct/100));};
 const usedPools=new Map();
 for(let index=0;index<n;index++){
  let visits=0;
  function visit(id,factor,path=[]){
   if(++visits>2000||path.includes(id)||graph.bad.has(id))bad('物料 '+id+' 的BOM存在循环、版本冲突或无效关系，请先维护');
   const material=graph.materials.get(id);if(!material)bad('BOM缺少物料 '+id);
   if(material['物料来源']!=='制造')return;
   if(material['基础单位']!=='千克')bad('制造物料 '+id+' 缺少千克基础单位口径');
   const steps=routes.filter(r=>r['成品编号']===id);
   if(!steps.length)bad('制造物料 '+id+' 缺少工艺路线，请维护工艺路线');
   if(new Set(steps.map(r=>r['路线编号']||'default')).size>1)bad('物料 '+id+' 有多条路线，请先明确采用路线');
   for(const route of steps){
    const routeId=route['路线工序编号'],group=route['设备组编号'],crewId=route['班组编号'],crew=list(d,'班组资源').find(c=>c['班组编号']===crewId);
    if(!crew)bad('工序 '+routeId+' 缺少班组 '+crewId);
    const people=num(route['需求人数']),toolCount=num(route['每批工装套数']),span=num(route['跨日历时天数']);
    if([people,toolCount,span].some(x=>x===null||x<0)||!Number.isInteger(people)||!Number.isInteger(toolCount))bad('工序 '+routeId+' 的人数、工装或跨日历时无效');
    const basePeople=num(crew['每班可用人数']);if(basePeople===null||basePeople<0)bad('班组 '+crewId+' 缺少可用人数');
    const availablePeople=Math.floor((basePeople+(scenario.crewAdds[crewId]||0))*scenario.crewPct/100),standard=positive(crew['标准日班次数'],'班组 '+crewId+' 标准班次缺失');
    const crewShifts=sunday?(scenario.sundayShifts??num(crew['周日班次数'])):standard;if(crewShifts===null||crewShifts<0)bad('班组 '+crewId+' 周日班次缺失');
    const ratio=Math.min(actual/denominator,crewShifts/standard)*time,speed=scenario.speedPct/100;
    if(!crewFacts.has(crewId))crewFacts.set(crewId,{
     id:crewId,name:crew['班组名称']||crewId,sourceRow:crew._row??null,
     basePeople,extra:scenario.crewAdds[crewId]||0,factor:scenario.crewPct/100,availablePeople,
     sourceStandardShifts:standard,sourceSundayShifts:num(crew['周日班次数']),
     actualShifts:crewShifts,factoryActualShifts:actual,factoryStandardShifts:denominator,
     factorySourceRow:calendar._row??null,factoryField:d.parameterContract?'生产班次数':'日产能分子',
     sourceFactoryShifts:num(calendar[d.parameterContract?'生产班次数':'日产能分子']),
     calendarRatio:Math.min(actual/denominator,crewShifts/standard),timeFactor:time,speedFactor:speed
    });
    const referenceMachines=resources.filter(r=>r['资源类别']==='设备'&&r['资源组编号']===group),activeMachines=referenceMachines.filter(r=>(num(r['可用数量'])??1)>0),candidates=activeMachines.length?activeMachines:referenceMachines;
    if(!candidates.length)bad('工序 '+routeId+' 缺少可用设备组 '+group);
    const baseRates=candidates.map(r=>positive(r['标准日产能千克'],'设备 '+r['资源编号']+' 缺少标准日产能'));
    const fastest=Math.max(...baseRates),extra=scenario.equipmentAdds[group]||0;
    const toolType=route['所需工装类型'],pool=pools[toolType];
    if(toolCount>0&&(!pool||!pool.length))bad('工序 '+routeId+' 缺少工装类型 '+toolType+' 的实体映射');
    const activeTools=(pool||[]).map(x=>sourceResources.get(x));
    if(activeTools.some(x=>!x))bad('工装池 '+toolType+' 含不存在的实体工装');
    const physicalTools=activeTools.filter(x=>(num(x['可用数量'])??1)>0),toolAvailable=Math.floor((physicalTools.length+(scenario.toolAdds[toolType]||0))*scenario.toolPct/100);
    const caps=activeTools.map(x=>num(x['单次批量上限千克']));
    if(toolCount>0&&caps.some(x=>!(x>0)))bad('工装池 '+toolType+' 缺少单次批量上限');
    const toolCapacity=toolCount>0?Math.max(...caps)*toolCount:Infinity;
    const batch=Math.min(globalBatch,toolCapacity,Math.max(...candidates.map(r=>Math.min(positive(r['单次批量上限千克'],'设备 '+r['资源编号']+' 缺少批量上限'),num(r['同时占位上限千克'])>0?Number(r['同时占位上限千克']):Infinity))));
    if(!(batch>0)||!Number.isFinite(batch))bad('工序 '+routeId+' 缺少有限批量依据');
    const duration=span>0?span/batch:1/(fastest*Math.max(ratio,1e-12)*speed);
    const term={materialId:id,routeId,operation:route['工序名称']||routeId,quantityPerKg:factor,batchKg:batch,spanDays:span,daysPerKg:duration,referenceDailyKg:fastest,effectiveDailyKg:fastest*ratio*speed,calendarRatio:Math.min(actual/denominator,crewShifts/standard),timeFactor:time,speedFactor:speed,crewId,toolType,requirePeople:people,requireTools:toolCount,sourceRow:route._row??null};
    const eqSource={table:'设备与工装',key:group,field:'标准日产能千克/单次批量上限千克'},crewSource={table:'班组资源',key:crewId,field:'每班可用人数/标准日班次数/周日班次数'};
    const availableDays=(candidates.reduce((s,r)=>s+((num(r['可用数量'])??1)>0?stopFraction(r['资源编号']):0),0)+extra)*scenario.equipmentPct/100;
    const sumRates=candidates.reduce((s,r,i)=>s+baseRates[i]*((num(r['可用数量'])??1)>0?stopFraction(r['资源编号']):0),0)+extra*fastest;
    // Explanation facts use the exact effective inputs above; they never enter the solver.
    if(!equipmentFacts.has(group))equipmentFacts.set(group,{
     id:group,name:candidates[0]['资源组名称']||group,extra,fastest,sumRates,availableDays,
     factoryRatio:actual/denominator,timeFactor:time,speedFactor:speed,equipmentFactor:scenario.equipmentPct/100,
     machines:candidates.map((r,i)=>({id:r['资源编号'],name:r['资源名称']||r['资源编号'],
      sourceTable:list(d,'设备与工装').some(x=>x['资源编号']===r['资源编号'])?'设备与工装':'运行映射.resources',
      sourceRow:r._row??null,sourceQuantity:num(r['可用数量'])??1,enabled:(num(r['可用数量'])??1)>0,
      availableDay:(num(r['可用数量'])??1)>0?stopFraction(r['资源编号']):0,
      dailyKg:baseRates[i],batchKg:num(r['单次批量上限千克']),spaceKg:num(r['同时占位上限千克']),
      stopIds:activeStops.filter(s=>s['资源编号']===r['资源编号']).map(s=>s['停机编号'])}))
    });
    add('equipment:'+group,'equipment',candidates[0]['资源组名称']||group,'台·自然日',availableDays,index,factor*duration,term,eqSource);
    add('daily:'+group,'equipment',(candidates[0]['资源组名称']||group)+' 日投产量','千克',sumRates*factory*speed*scenario.equipmentPct/100,index,factor,term,eqSource);
    add('calendar:'+group+':'+crewId,'equipment',(candidates[0]['资源组名称']||group)+' × '+(crew['班组名称']||crewId)+' 日历交集','千克',sumRates*ratio*speed*scenario.equipmentPct/100,index,factor,term,eqSource);
    add('crew:'+crewId,'crew',crew['班组名称']||crewId,'人·自然日',availablePeople,index,factor*duration*people,term,crewSource);
    if(people>availablePeople)add('minimum-crew:'+crewId+':'+routeId,'crew',(crew['班组名称']||crewId)+' 单批人数不足','可行标记',0,index,factor,term,crewSource);
    if(toolCount>0){
     const toolDays=physicalTools.reduce((s,r)=>s+stopFraction(r['资源编号']),0)+(scenario.toolAdds[toolType]||0),budget=Math.min(toolAvailable,toolDays*scenario.toolPct/100);
     if(!toolFacts.has(toolType))toolFacts.set(toolType,{
      id:toolType,extra:scenario.toolAdds[toolType]||0,enabledCount:physicalTools.length,
      availableCount:toolAvailable,availableDays:toolDays,factor:scenario.toolPct/100,
      members:activeTools.map(r=>({id:r['资源编号'],name:r['资源名称']||r['资源编号'],
       sourceTable:list(d,'设备与工装').some(x=>x['资源编号']===r['资源编号'])?'设备与工装':'运行映射.resources',
       sourceRow:r._row??null,sourceQuantity:num(r['可用数量'])??1,enabled:(num(r['可用数量'])??1)>0,
       availableDay:(num(r['可用数量'])??1)>0?stopFraction(r['资源编号']):0,
       batchKg:num(r['单次批量上限千克']),stopIds:activeStops.filter(s=>s['资源编号']===r['资源编号']).map(s=>s['停机编号'])}))
     });
     add('tools:'+toolType,'tools',toolType+' 共享工装池','套·自然日',budget,index,factor*duration*toolCount,term,{table:'设备与工装',key:toolType,field:'实体工装映射/可用数量'});
     if(toolAvailable<toolCount)add('minimum-tools:'+toolType+':'+routeId,'tools',toolType+' 单批套数不足','可行标记',0,index,factor,term,{table:'设备与工装',key:toolType,field:'可用数量'});
     if(!usedPools.has(toolType))usedPools.set(toolType,new Set(pool));
    }
    stages.push({productId:req.products[index].id,...term,group,people,toolCount,availablePeople,toolAvailable,ratio});
   }
   for(const relation of graph.children.get(id)||[]){const child=graph.materials.get(relation['子项编号']);if(child?.['物料来源']!=='制造')continue;
    const parentKg=positive(relation['父项基准产出千克'],'BOM '+relation['用量关系编号']+' 父项基准产出无效'),quantity=num(relation['子项基准用量']);if(quantity===null||quantity<0)bad('BOM '+relation['用量关系编号']+' 子项用量无效');
    let unit=relation['数量单位'];let conversion=unit==='千克'?1:unit==='吨'?1000:num(list(d,'单位换算').find(u=>u['物料编号']===child['物料编号']&&u['换算前单位']===unit&&u['换算后单位']==='千克')?.['换算系数']);
    if(!(conversion>0))bad('制造子件 '+child['物料编号']+' 缺少 '+unit+' 到千克的换算');if(quantity>0)visit(child['物料编号'],factor*quantity/parentKg*conversion,[...path,id]);
   }
  }
  visit(req.products[index].id,1);
 }
 // A tool listed under two aliases is one physical pool, not two budgets.
 const names=[...usedPools.keys()],done=new Set();
 for(const name of names){if(done.has(name))continue;const component=[name],ids=new Set(usedPools.get(name));done.add(name);
  for(let i=0;i<component.length;i++)for(const other of names)if(!done.has(other)&&[...usedPools.get(other)].some(id=>ids.has(id))){component.push(other);usedPools.get(other).forEach(id=>ids.add(id));done.add(other);}
  if(component.length>1){if(component.some(k=>scenario.toolAdds[k]>0))bad('共享工装别名重叠，请先统一映射后再模拟新增套数');
   const rows=component.map(k=>constraints.get('tools:'+k)),budget=[...ids].filter(id=>(num(sourceResources.get(id)?.['可用数量'])??1)>0).reduce((s,id)=>s+stopFraction(id),0)*scenario.toolPct/100;
   constraints.set('shared-tools:'+component.join('|'),{id:'shared-tools:'+component.join('|'),kind:'tools',name:'共享实体工装合并池：'+component.join(' / '),unit:'套·自然日',budget,cost:Array.from({length:n},(_,i)=>rows.reduce((s,r)=>s+r.cost[i],0)),terms:rows.flatMap(r=>r.terms),source:{table:'设备与工装',key:component[0],field:'实体工装去重'}});
  }
 }
 const relevantIds=new Set(stages.flatMap(s=>resources.filter(r=>r['资源组编号']===s.group).map(r=>r['资源编号'])));
 for(const pool of usedPools.values())pool.forEach(id=>relevantIds.add(id));
 for(const s of activeStops.filter(s=>relevantIds.has(s['资源编号'])))events.push({kind:'stop',id:s['停机编号'],resource:s['资源编号'],meaning:s['产品处置']||s['停机类型'],recoveredPct:scenario.recoveryPct});
 const crewCalendars=[...new Set(stages.map(s=>s.crewId))].map(id=>{const crew=list(d,'班组资源').find(c=>c['班组编号']===id);return {id,name:crew['班组名称']||id,actualShifts:sunday?(scenario.sundayShifts??Number(crew['周日班次数'])):Number(crew['标准日班次数']),standardShifts:Number(crew['标准日班次数'])};});
 return {constraints:[...constraints.values()],stages,events,equipmentFacts:[...equipmentFacts.values()],toolFacts:[...toolFacts.values()],crewFacts:[...crewFacts.values()],globalBatchKg:globalBatch,calendar:{day,date:dayCalendar(v.identity.dayZero,day),actualShifts:actual,standardShifts:denominator,sunday,timeFactor:time,crews:crewCalendars},scenario};
}
export function solveCapacityModel(model,req){
 const solved=evaluateCapacity(model.constraints,req.products.map(p=>p.share),req.mode);
 const constraints=model.constraints.map(r=>{const used=r.cost.reduce((s,c,i)=>s+c*solved.quantities[i],0),relevant=used>1e-8||solved.total<1e-8&&r.cost.some((c,i)=>c>0&&(req.mode==='max'||req.products[i].share>0));return {...r,used,binding:relevant&&Math.abs(used-r.budget)<=Math.max(1e-7,r.budget*1e-6),headroom:Math.max(0,r.budget-used)};});
 return {...solved,constraints,bottlenecks:constraints.filter(r=>r.binding)};
}
