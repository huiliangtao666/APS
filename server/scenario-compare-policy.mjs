import {dayScenarioInput} from './scenario-compare-day.mjs';
import {hash,rows,refreshDerived,workbookSchema} from './workbook-model.mjs';
import {scopeOf} from './parameter-contract.mjs';
import {minuteMode,shiftWindows,overlap} from './workbook-minute.mjs';
export const SC_CONTRACT='CR-SCENARIO-COMPARE-20261105:R1';
export const KPI_DEFINITION='scenario-kpi:delivery-coverage-lineage:v1';
export function scError(code,message,field,status=422){return Object.assign(new Error(message),{code:'SC_'+code,status,field});}
const fail=(field,message)=>{throw scError('CONDITION',message,field);};
const text=(v,f)=>{if(typeof v!=='string'||!v.trim())fail(f,f+'须明确填写');return v.trim();};
const integer=(v,f)=>{if(!Number.isSafeInteger(v))fail(f,f+'须明确为整数');return v;};
export function validateCompareConfig(value){
 if(!value||typeof value!=='object')fail('配置','请提供明确情景容量和预算来源');
 const {maxScenarios,runSeconds,budgetSource}=value;
 if(integer(maxScenarios,'情景容量')<1||integer(runSeconds,'单项秒数')<1||runSeconds>Math.floor(2147483647/1000))fail('配置','容量/秒数须为正整数，秒数不得越过运行计时器可表示范围');
 return {maxScenarios,runSeconds,budgetSource:text(budgetSource,'预算来源'),kpiDefinition:KPI_DEFINITION};
}
// These are detached candidate overrides. They never update shared P, actual
// receipts, master records, execution facts or another scenario's mutable data.
export function scenarioInput(base,conditions,selection,observationMinute){
 if(!minuteMode(base))return dayScenarioInput(base,conditions,selection,observationMinute);
 if(!Array.isArray(conditions))fail('条件','条件须为明确列表；空列表为同条件对照');
 const d=structuredClone(base),overtime=structuredClone(base.scenarioConditions?.overtime||[]),personnel=structuredClone(base.scenarioConditions?.personnel||[]),changes=structuredClone(base.scenarioConditions?.changes||[]).map(c=>({...c,origin:'baseline'})),keys=new Set(changes.map(c=>c.id));
 for(const original of conditions){
  if(!original||typeof original!=='object')fail('条件','条件格式错误');
  const c=structuredClone(original),id=text(c.id,'条件编号');if(keys.has(id))fail('条件编号','条件编号重复');keys.add(id);
  text(c.source,'变更依据');text(c.object,'对象编号');
  if(c.withdrawn===true){changes.push({...c,status:'withdrawn'});continue;}
  const common={id,type:c.type,object:c.object,source:c.source,unit:c.unit,before:c.before,after:c.after};
  if(c.type==='arrival'){
   if(c.unit!=='日')fail(id+'.unit','预计到料延期按日历天维护');
   const r=rows(d,'既有采购在途').find(r=>r['在途记录编号']===c.object);
   if(!r||!['在途','已下单','已确认','未到货','运输中','预计'].includes(r['在途状态']))fail(id+'.object','请选择未实收的明确采购预计供给批次；未知/已收货状态不能伪改');
   integer(c.before,id+'.before');integer(c.after,id+'.after');
   if(c.before!==Number(r['约定到货日'])||c.after<c.before||c.before*1440<observationMinute||c.after>=44)fail(id+'.after','旧值须等于冻结到料日，延期不得回填历史或越支持日期');
   const delta=c.after-c.before,release=Number(r['预计放行日'])+delta;
   if(!Number.isSafeInteger(release)||release>=Number(r['预计到期日']))fail(id+'.after','延期后放行不能越过原批次到期；不自动延长效期');
   if(changes.some(x=>x.type==='arrival'&&x.object===c.object&&x.status!=='withdrawn'))fail(id,'同一供给批次不能重复覆盖');
   r['约定到货日']=String(c.after);r['预计放行日']=String(release);
   changes.push({...common,from:c.before,to:c.after,table:'既有采购在途',row:r._row,materialId:r['物料编号'],releaseBefore:release-delta,releaseAfter:release});
  }else if(['personnel','overtime'].includes(c.type)){
   integer(c.start,id+'.start');integer(c.end,id+'.end');
   if(c.start<Math.max(selection.startDay*1440,observationMinute)||c.end>selection.endDay*1440||c.end<=c.start||Math.floor(c.start/1440)!==Math.floor((c.end-1)/1440))fail(id+'.start','条件须在观察时点后的同一日非空整数分钟区间');
   const crewId=c.type==='personnel'?c.object:c.crew,crew=rows(d,'班组资源').find(r=>r['班组编号']===crewId);
   if(!crew)fail(id+'.crew','班组不存在，不能新增未确认技能资格');
   if(c.type==='personnel'){
    if(c.unit!=='人'||integer(c.before,id+'.before')!==Number(crew['每班可用人数'])||integer(c.after,id+'.after')<=c.before)fail(id+'.after','人员旧值须等于原班组人数，新值须显式增加');
    const routes=rows(d,'工艺路线').filter(r=>r['班组编号']===crewId);
    if(!Array.isArray(c.routeStepIds)||!c.routeStepIds.length||new Set(c.routeStepIds).size!==c.routeStepIds.length||c.routeStepIds.some(id=>!routes.some(r=>r['路线工序编号']===id)))fail(id+'.routeStepIds','须列明确认具备原班组技能的工序，不自动扩展技能');
    // A shared crew is physical capacity: its added members must be qualified
    // for every route using this crew, rather than double-counted per device.
    if(routes.some(r=>!c.routeStepIds.includes(r['路线工序编号'])))fail(id+'.routeStepIds','共享班组增人须确认该班组全部原工序资格；部分技能增人需另建显式班组');
    if(!shiftWindows(base,crew,Math.floor(c.start/1440)).some(w=>!w.overtime&&w.start<=c.start&&c.end<=w.end))fail(id+'.start','增人须落在原有效班次内；加班另列条件');
    if(personnel.some(x=>x.crew===crewId&&overlap(x,c)))fail(id,'同班组增人区间重叠，不隐式累加');
    personnel.push({...c,crew:crewId});
   }else{
    if(c.unit!=='分钟'||c.before!==0||c.after!==c.end-c.start)fail(id+'.after','加班须列原额外分钟0与显式新增分钟；17分钟不取整');
    const resource=rows(d,'设备与工装').find(r=>r['资源编号']===c.object&&r['资源类别']==='设备'&&Number(r['可用数量'])>0);
    if(!resource||!rows(d,'工艺路线').some(r=>r['设备组编号']===resource['资源组编号']&&r['班组编号']===crewId))fail(id+'.object','加班设备及班组须具有原路线资格');
    if(integer(c.people,id+'.people')<=0||c.people>Number(crew['每班可用人数'])||typeof c.capacityKg!=='number'||!Number.isFinite(c.capacityKg)||c.capacityKg<=0)fail(id+'.people','须明确原合格人数及额外日千克容量；不按时间猜产能');
    if(!Array.isArray(c.tools)||new Set(c.tools).size!==c.tools.length||c.tools.some(id=>!rows(d,'设备与工装').some(r=>r['资源编号']===id&&r['资源类别']==='工装'&&Number(r['可用数量'])>0)))fail(id+'.tools','加班须明确可用实体工装，无需工装填空列表');
    if(shiftWindows(base,crew,Math.floor(c.start/1440),c.object).some(w=>overlap(w,c))||overtime.some(x=>(x.resource===c.object||x.crew===crewId)&&overlap(x,c)))fail(id+'.start','加班不得重复覆盖原班次/同资源或班组额外时段');
    overtime.push({...c,resource:c.object});
   }
   changes.push({...common,start:c.start,end:c.end,crew:crewId,routeStepIds:c.routeStepIds||[],tools:c.tools||[],people:c.people,capacityKg:c.capacityKg});
  }else fail(id+'.type','条件仅支持显式加班、班组增人、预计到料延期');
 }
 d.scenarioConditions={contract:SC_CONTRACT,overtime,personnel,changes};
 refreshDerived(d,selection.startDay);return d;
}

export function compareStamp(ctx,state,run){
 const live=ctx.dataset(state,run.datasetId),context=(state.urgentPlans||[]).find(p=>p.headRunId===run.id),base=ctx.snapshot(context?.scenarioBusinessBaseRef||context?.baseInputRef||run.inputRef),plans=(state.urgentPlans||[]).filter(p=>p.datasetId===run.datasetId).map(p=>({id:p.id,headRunId:p.headRunId,revision:p.revision,factsHash:hash(p.facts),inputHash:p.inputHash}));
 const comparable=value=>{if(!value)return null;const d=structuredClone(value);if(d.parameterContract){const scope=base.parameterContext?.scope||'dataset';d.tables['配置参数']=rows(d,'配置参数').filter(p=>scopeOf(p)==='dataset'||scopeOf(p)===scope);d.parameterContext={scope,effectiveDay:run.selection.startDay};delete d.parameterCandidates;delete d.parameterTrials;}refreshDerived(d,run.selection.startDay);return hash({id:d.id,version:d.version,fileHash:d.fileHash,parameterRevision:d.parameterRevision||0,contract:d.productionContract,minuteOrigin:d.minuteOrigin,mapping:d.mapping,tables:Object.fromEntries(Object.entries(d.tables).filter(([key])=>workbookSchema.tables[key]?.kind==='输入'))});};
 const liveComparableHash=comparable(live),baseComparableHash=comparable(base);
 return {datasetId:run.datasetId,liveInputHash:live?hash(live):null,liveVersion:live?.version??null,parameterRevision:live?.parameterRevision??null,liveComparableHash,baseComparableHash,baseAlreadyStale:liveComparableHash!==baseComparableHash,plans};
}
