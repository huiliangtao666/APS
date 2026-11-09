import {rows,hash,refreshDerived} from './workbook-model.mjs';
import {atomicFields,parameterSpec,objectKey,effectiveParameters,scopeOf,sourceRole,changeParameter} from './parameter-contract.mjs';
import {resolveFactoryCalendar} from './factory-calendar.mjs';
import {parameterMaintenanceUnit} from './parameter-maintenance.mjs';
const allowed=new Set(['标准日产能千克','单次批量上限千克','同时占位上限千克','每班可用人数','标准日班次数','周日班次数','生产班次数','日产能分母','跨日历时天数','每批工装套数','需求人数','标准生产批量千克']);
const fail=message=>{throw Object.assign(Error(message),{code:'CAPACITY_PARAMETER_INVALID',status:422});};
export function scheduleCapacityOptions(d){
 const result=[];
 for(const spec of atomicFields.filter(s=>allowed.has(s.name)&&!s.candidate)){
  const source=spec.global?[{id:'GLOBAL'}]:rows(d,spec.table);
  for(const r of source){
   if(spec.table==='设备与工装'&&r['资源类别']!=='设备'&&spec.name==='标准日产能千克')continue;
   const object=spec.global?'GLOBAL':objectKey(r,spec),value=spec.global?effectiveParameters(d,d.parameterContext?.effectiveDay??1,d.parameterContext?.scope).find(p=>p['参数名称']===spec.name&&p['对象编号']==='GLOBAL')?.['参数值']:r[spec.name];
   if(value===undefined||value===''||!Number.isFinite(Number(value)))continue;
   result.push({id:[spec.cp,object,spec.name].join('|'),kind:'parameter',cp:spec.cp,table:spec.table||'全局',object,field:spec.name,name:r['资源名称']||r['班组名称']||r['工序名称']||object,value:Number(value),unit:parameterMaintenanceUnit(spec,r),integer:!!spec.integer,min:spec.min,inclusive:spec.inclusive});
  }
 }
 for(const row of rows(d,'工厂日历')){const day=Number(row['日序']),r=resolveFactoryCalendar(d,row,effectiveParameters(d,day,d.parameterContext?.scope));if(r.open!==null)result.push({id:'CP129|'+day+'|是否开工',kind:'parameter',cp:'CP129',table:'工厂日历',object:String(day),field:'是否开工',name:r.date,value:r.open?1:0,unit:'0=不开工，1=开工',integer:true,min:0,max:1,inclusive:true});}
 for(const r of rows(d,'设备与工装').filter(r=>['设备','工装'].includes(r['资源类别'])&&Number(r['可用数量']??1)>0))result.push({id:'add|'+r['资源编号'],kind:'add',table:'设备与工装',object:r['资源编号'],field:r['资源类别']==='工装'?'新增同型实体工装':'新增兼容设备',name:r['资源名称']||r['资源编号'],value:0,unit:r['资源类别']==='工装'?'套':'台',integer:true,min:0,inclusive:true});
 return result;
}
export function applyScheduleCapacity(base,condition,selection){
 if(base.productionContract==='workbook-minute-v2')fail('本次产能参数生效接缝支持按天排程，请选择按天运行；不会切换或替换求解模型。');
 if(!Array.isArray(condition.patches)||!condition.patches.length||condition.patches.length>60)fail('请填写1至60项明确的参数调整');
 const d=structuredClone(base),options=new Map(scheduleCapacityOptions(d).map(o=>[o.id,o])),seen=new Set(),changes=[];
 for(const patch of condition.patches){
  const option=options.get(patch.id);if(!option||seen.has(patch.id))fail('调整项不存在或重复，请重新读取本次运行');seen.add(patch.id);
  if(patch.before!==option.value||typeof patch.after!=='number'||!Number.isFinite(patch.after)||patch.after===patch.before)fail(option.name+' / '+option.field+'：原值与冻结输入不一致，或新值未有效修改');
  if(option.field==='是否开工'&&![0,1].includes(patch.after))fail('开工状态只能选择0（不开工）或1（开工）');
  if(option.table==='工厂日历'&&(Number(option.object)<selection.startDay||Number(option.object)>=selection.endDay))fail('日历调整日期须在本次排程窗口内');
  if(option.kind==='add'){
   if(!Number.isSafeInteger(patch.after)||patch.after<1||patch.after>20)fail('新增实体数量须为1至20的整数');
   const source=rows(base,'设备与工装').find(r=>r['资源编号']===option.object),ids=[];
   for(let i=0;i<patch.after;i++){
    const id='SIM-'+hash({condition:condition.id,source:option.object,index:i}).slice(0,16);if(rows(d,'设备与工装').some(r=>r['资源编号']===id))fail('新增实体编号冲突，请重新建立模拟');
    const copy={...source,'资源编号':id,'资源名称':(source['资源名称']||option.object)+'（模拟新增'+(i+1)+'）','可用数量':'1',_simulationSource:option.object};delete copy._row;delete copy._cells;delete copy._formulas;
    d.tables['设备与工装'].push(copy);ids.push(id);
    if(source['资源类别']==='工装')for(const pool of Object.values(d.mapping?.tool_pools||{}))if(pool.includes(option.object))pool.push(id);
   }
   changes.push({...option,before:0,after:patch.after,entityIds:ids});
  }else{
   const spec=atomicFields.find(s=>s.cp===option.cp&&s.name===option.field),scope=spec.global||spec.sharedOnly?'dataset':d.parameterContext?.scope||'dataset';
   // Only this detached candidate is edited. Preserve disjoint historical periods.
   const target=rows(d,'配置参数'),kept=[];
   for(const p of target){const s=parameterSpec(p),same=scopeOf(p)===scope&&sourceRole(p)==='EDIT'&&s?.cp===spec.cp&&p['对象编号']===option.object&&p['参数名称']===option.field,a=Number(p['生效日']),b=Number(p['失效日']);
    if(!same||b<=selection.startDay||a>=selection.endDay){kept.push(p);continue;}
    if(a<selection.startDay)kept.push({...p,'失效日':String(selection.startDay)});
    if(b>selection.endDay)kept.push({...p,'参数编号':p['参数编号']+'-TAIL-'+hash(condition.id).slice(0,8),'生效日':String(selection.endDay)});
   }
   d.tables['配置参数']=kept;
   changeParameter(d,{configuration:true,cp:option.cp,objectId:option.object,field:option.field,value:option.field==='是否开工'?(patch.after===1?'开工':'不开工'):String(patch.after),unit:spec.unit||option.unit,from:selection.startDay,to:selection.endDay,scope,newId:'CAP-'+hash({id:condition.id,patch:patch.id}).slice(0,20),reason:condition.source},'capacity-simulation');
   changes.push({...option,before:patch.before,after:patch.after});
  }
 }
 return {input:refreshDerived(d,selection.startDay),changes};
}
