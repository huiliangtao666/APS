import {applyScheduleCapacity} from './schedule-capacity-input.mjs';
import {rows,refreshDerived} from './workbook-model.mjs';
import {parameterDayRatio} from './parameter-contract.mjs';
const fail=(field,message)=>{throw Object.assign(Error(message),{code:'SC_DAY_CONDITION',field,status:422});};
const integer=(n,f)=>{if(!Number.isSafeInteger(n))fail(f,'请填写有效的整数日期或数量');return n;};
const overlap=(a,b)=>a.start<b.end&&b.start<a.end;
export const DAY_SCENARIO_LIMIT_SECONDS=90; // Same finite bound as day insertion Workers.
export function dayScenarioInput(base,conditions,selection,observationDay){
 if(!Array.isArray(conditions))fail('conditions','情景条件须为列表；空列表表示同条件对照');
 let d=structuredClone(base);const prior=base.scenarioConditions;
 if(prior&&prior.timeUnit!=='day')fail('base','按天情景不能继承分钟条件');
 const personnel=structuredClone(prior?.personnel||[]),overtime=structuredClone(prior?.overtime||[]),changes=(prior?.changes||[]).map(c=>({...structuredClone(c),origin:'baseline'})),ids=new Set(changes.map(c=>c.id));
 for(const raw of conditions){
  const c=structuredClone(raw);if(!c||!['personnel','overtime','arrival','capacity'].includes(c.type))fail('type','请选择增人、额外日产能、采购预计到料延期或产能参数调整');
  for(const k of ['id','object','source'])if(typeof c[k]!=='string'||!c[k].trim())fail(k,({id:'条件编号',object:'业务对象',source:'变化依据'})[k]+'不能为空');
  if(ids.has(c.id))fail('id','条件编号重复');ids.add(c.id);
  if(c.withdrawn===true){changes.push({...c,status:'withdrawn'});continue;}
  if(c.type==='capacity'){const applied=applyScheduleCapacity(d,c,selection);d=applied.input;changes.push({...c,parameterChanges:applied.changes});continue;}
  if(c.type==='arrival'){
   const r=rows(d,'既有采购在途').find(r=>r['在途记录编号']===c.object);
   if(!r||!['在途','已下单','已确认','未到货','运输中','预计'].includes(r['在途状态']))fail('object','只能修改尚未实收的采购在途批次');
   integer(c.before,'before');integer(c.after,'after');
   if(c.unit!=='日'||c.before!==Number(r['约定到货日'])||c.before<observationDay||c.after<c.before||c.after>=44)fail('after','原到料日期须与冻结批次一致，延期不得回填历史或超出支持日期');
   const releaseAfter=Number(r['预计放行日'])+c.after-c.before;
   if(!Number.isSafeInteger(releaseAfter)||releaseAfter>=Number(r['预计到期日']))fail('after','延期后放行已达到批次到期日，请另行确认有效供给，不能自动延长效期');
   if(changes.some(x=>x.type==='arrival'&&x.object===c.object&&x.status!=='withdrawn'))fail('object','同一采购批次不能重复覆盖');
   changes.push({...c,table:'既有采购在途',row:r._row,materialId:r['物料编号'],releaseBefore:Number(r['预计放行日']),releaseAfter});
  }else{
   integer(c.start,'start');integer(c.end,'end');
   if(c.start<Math.max(selection.startDay,observationDay)||c.end>selection.endDay||c.end<=c.start)fail('start','适用日期须在观察日及排程窗口内，结束日期不得早于开始日期');
   const crewId=c.type==='personnel'?c.object:c.crew,crew=rows(d,'班组资源').find(r=>r['班组编号']===crewId);
   if(!crew)fail('crew','请选择基线已有班组');
   if(c.type==='personnel'){
    if(c.unit!=='人'||integer(c.before,'before')!==Number(crew['每班可用人数'])||integer(c.after,'after')<=c.before)fail('after','原人数须与基线班组一致，试算人数须大于原人数');
    const routes=[...rows(d,'工艺路线'),...(d.mapping?.sfRoutes||[])].filter(r=>r['班组编号']===crewId);
    if(!Array.isArray(c.routeStepIds)||!routes.length||routes.some(r=>!c.routeStepIds.includes(r['路线工序编号']))||c.routeStepIds.some(id=>!routes.some(r=>r['路线工序编号']===id)))fail('routeStepIds','请确认新增人员具有该班组全部原工序资格；不自动新增技能');
    if(personnel.some(x=>x.crew===crewId&&overlap(x,c)))fail('start','同班组增人日期重叠，请合并维护，避免重复增加人数');
    personnel.push({...c,crew:crewId});
   }else{
    const resource=rows(d,'设备与工装').find(r=>r['资源编号']===c.object&&r['资源类别']==='设备');
    if(!resource||!(Number(resource['可用数量']??1)>0)||![...rows(d,'工艺路线'),...(d.mapping?.sfRoutes||[])].some(r=>r['设备组编号']===resource['资源组编号']&&r['班组编号']===crewId))fail('object','设备与班组须具备原工艺资格');
    if(c.unit!=='千克/日'||c.before!==0||!Number.isFinite(c.capacityKg)||c.capacityKg<=0||c.after!==c.capacityKg)fail('capacityKg','请明确增加的每日千克产能，不能用加班天数猜算产能');
    if(integer(c.people,'people')<=0||c.people>Number(crew['每班可用人数']))fail('people','配套人数须为已有合格班组可提供的正整数人数');
    if(!Array.isArray(c.tools)||new Set(c.tools).size!==c.tools.length||c.tools.some(id=>!rows(d,'设备与工装').some(r=>r['资源编号']===id&&r['资源类别']==='工装'&&Number(r['可用数量']??1)>0)))fail('tools','请选择可用实体工装；无需工装时明确留空');
    if(overtime.some(x=>(x.resource===c.object||x.crew===crewId||x.tools.some(id=>c.tools.includes(id)))&&overlap(x,c)))fail('start','同设备、班组或实体工装的额外日产能日期重叠，不能重复计入');
    overtime.push({...c,resource:c.object});
   }
   changes.push({...c,crew:crewId});
  }
 }
 d.scenarioConditions={contract:'scenario-day-v1',timeUnit:'day',personnel,overtime,changes};
 return refreshDerived(d,selection.startDay);
}
export function dayCrewCapacity(d,crew,point){
 const extra=d.scenarioConditions?.timeUnit==='day'?(d.scenarioConditions.personnel||[]).filter(c=>c.crew===crew?.['班组编号']&&c.start<=point&&point<c.end).reduce((n,c)=>n+c.after-c.before,0):0;
 return Number(crew?.['每班可用人数'])+extra;
}
export function dayCrewPoints(d,crew,start,end){return d.scenarioConditions?.timeUnit==='day'?(d.scenarioConditions.personnel||[]).filter(c=>c.crew===crew?.['班组编号']).flatMap(c=>[c.start,c.end]).filter(n=>start<n&&n<end):[];}
export function dayResourceCapacity(d,resource,crew,calendar,day){
 const regular=Number(resource?.['标准日产能千克'])*parameterDayRatio(d,calendar,crew,day),extras=d.scenarioConditions?.timeUnit==='day'?(d.scenarioConditions.overtime||[]).filter(c=>c.resource===resource?.['资源编号']&&c.crew===crew?.['班组编号']&&c.start<=day&&day<c.end):[];
 return {regular,extra:extras.reduce((n,c)=>n+c.capacityKg,0),extras,total:regular+extras.reduce((n,c)=>n+c.capacityKg,0)};
}
export function dayConditionOptions(d){
 return {crews:rows(d,'班组资源').map(c=>({id:c['班组编号'],name:c['班组名称']||c['班组编号'],people:Number(c['每班可用人数']),routeStepIds:[...rows(d,'工艺路线'),...(d.mapping?.sfRoutes||[])].filter(r=>r['班组编号']===c['班组编号']).map(r=>r['路线工序编号'])})),resources:rows(d,'设备与工装').filter(r=>r['资源类别']==='设备').map(r=>({id:r['资源编号'],name:r['资源名称']||r['资源编号'],crewIds:[...new Set([...rows(d,'工艺路线'),...(d.mapping?.sfRoutes||[])].filter(rt=>rt['设备组编号']===r['资源组编号']).map(rt=>rt['班组编号']))]})),tools:rows(d,'设备与工装').filter(r=>r['资源类别']==='工装'&&Number(r['可用数量']??1)>0).map(r=>({id:r['资源编号'],name:r['资源名称']||r['资源编号']})),arrivals:rows(d,'既有采购在途').filter(r=>['在途','已下单','已确认','未到货','运输中','预计'].includes(r['在途状态'])).map(r=>({id:r['在途记录编号'],materialId:r['物料编号'],day:Number(r['约定到货日']),releaseDay:Number(r['预计放行日']),expiryDay:Number(r['预计到期日'])}))};
}
