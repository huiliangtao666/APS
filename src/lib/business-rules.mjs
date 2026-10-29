import {sourceRefs} from './problem-records.mjs';
import {validatePolicies} from './resource-policies.mjs';
import {deliveryParameters,deliveryActive,validateDelivery} from './delivery-policy.mjs';
import {jointParameters,legacyJointParameters,jointFlags,validateJointResources} from './joint-policy.mjs';
import {batchParameters,activeBatchRule,validateBatchResources} from './batch-policy.mjs';
import { schedulingScope } from './scheduling-scope.mjs';
// Versioned capability contract. Configuration storage is not execution support.
export const ruleCatalog = [
 ['MACHINE','BR-03','机器不重叠',true,'全部设备；独占、单台；FR021显式资源批仅占用一次，不支持并行加工','{}','无','固定'],
 ['PRECEDENCE','BR-02','工序顺序与固定工时',true,'全部工序；不支持最大等待','{}','分钟','正数固定工时来自工序工时表'],
 ['CALENDAR','BR-05','日历与停机',true,'全部设备；连续窗口，不支持中断','{}','分钟','窗口及停机来自日历表'],
 ['LABOR','BR-07','人员技能与数量',false,'全部人员依赖；关闭开关仍保留既有依赖保护','{}','人/分钟','正整数人数及有效参与窗口'],
 ['INVENTORY','BR-08','库存质量可用性查询',false,'* 或物料编号逗号列表；仅查询，不代表物料平衡','{"可用质量状态":["合格"]}','物料单位','非空、无重复状态列表'],
 ['SORT','BR-15','任务排序',false,'全部订单；稳定排序，不改变硬约束','{"排序方式":"优先顺序"}','无','优先顺序 或 要求日期'],
 ...[['LINE','BR-01','单线范围（始终检查）'],['SPEED','BR-04','速度与效率'],['MOLD','BR-06','模具/工装'],['BOM','BR-10','BOM数量计算'],['CAPACITY','BR-11','拆合批与容量'],['PROGRAM','BR-11','程序兼容'],['MAX_LAG','BR-12','最大等待'],['STORAGE','BR-12','空间容量'],['CLEANING','BR-13','换型清洗'],['DELIVERY','BR-14','预计可交付与余保'],['PROGRESS','BR-16','执行保护'],['CONFIRM','BR-17','主管确认条件'],['ROUNDING','BR-18','时间单位与取整']].map(([id,category,name])=>[id,category,name,false,'不支持可配置启用；字段保存不等于检查通过','{}','见v0.3第7章','后续完整验收'])
].map(([id,category,name,required,scope,parameters,unit,range],i)=>({id,category,name,required,supported:i<6,scope,parameters,unit,range}));
ruleCatalog.push({id:'MATERIAL',category:'BR-09',name:'BOM需求与批次分配',required:false,supported:true,scope:'全部订单；仅损失配方及每袋包材，库存FEFO；预计供给须显式引用',parameters:'{"允许预计供给":false,"可用状态":["合格"],"预计状态":["预计可用"],"不可用状态":["待检","冻结","不合格"]}',unit:'BOM物料单位',range:'v0.3每1000kg投入/每袋，其他口径拒绝推断'});
for(const c of ruleCatalog.filter(c=>['CAPACITY','PROGRAM'].includes(c.id))){c.supported=true;c.scope='全部订单；同产品/BOM/整条路线/程序/给定设备的保守资源批';c.parameters=JSON.stringify(c.id==='CAPACITY'?batchParameters:{兼容条件:batchParameters.合批条件});c.range='显式配置必填；非kg订单及其他装载节点阻断';}
for(const c of ruleCatalog.filter(c=>['MOLD','STORAGE'].includes(c.id))){c.supported=true;c.parameters=JSON.stringify(jointParameters);c.scope='显式逐生产批整工序或明确分钟窗口；工装套数/空间kg或位置；单一参数来源';c.range='须填表23及明确的数量、单位、起止偏移；未声明语义阻断';}
Object.assign(ruleCatalog.find(c=>c.id==='DELIVERY'),{supported:true,parameters:JSON.stringify(deliveryParameters),scope:'显式模拟交付等待/质量/余保；附条件，不作承诺',range:'须采用物料和批次检查；缺条件保留未知'});
Object.assign(ruleCatalog.find(c=>c.id==='PROGRESS'),{supported:true,parameters:'{}',scope:'模拟累计事实原始时段、显式剩余分钟与耗料；即使关闭也不解除事实保护',range:'支持累计报废、显式本工序BOM补做及来源汇总映射；暂停/冲销/转机与批次/质量协调未定时阻断；不确认真实执行或质量'});
export function validRuleTime(value) {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return false;
 const parts=value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/);
 const date=new Date(parts[1]+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===parts[1]&&Number(parts[2])<24&&Number(parts[3])<60&&Number(parts[4])<60&&Number.isFinite(Date.parse(value));
}
export function assessRules(data, at=new Date().toISOString(), checkCoverage=false, mode='supported', checkPolicyExecution=true) {
 const material=(data.rules||[]).some(r=>r['规则编号']==='MATERIAL'&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(at)));
 const checkScope=schedulingScope(mode,material,activeBatchRule(data,at),jointFlags(data,at),deliveryActive(data,at)), minimal=mode==='minimal-r1';
 const issues=validateBatchResources(data).map(f=>({...f,table:'batchResources',file:'15_空间与组批规则配置.csv',row:f.row||0,field:'关联配置'})),settings=[];const rows=data.rules||[];
 issues.push(...validateJointResources(data,at).map(f=>({...f,table:f.table||'resourceClaims',file:f.table==='tools'?'18_工装配置.csv':f.table==='dependencies'?'12_工序资源与物料依赖.csv':f.table==='rules'?'16_排程规则配置.csv':'23_资源占用声明.csv',row:f.row||0,field:'关联配置'})));
 issues.push(...validateDelivery(data),...validatePolicies(data,at,mode,checkPolicyExecution));
 const refs=(table,rows)=>sourceRefs(table,rows,data[table]||[]);
 const add=(index,field,message,relatedRecords=refs('rules',index<0?[]:[rows[index]]),missingTarget)=>issues.push({table:'rules',file:'16_排程规则配置.csv',row:index<0?0:index+2,field,message,relatedRecords,...(missingTarget?{missingTarget}:{}),...(index<0&&!relatedRecords.length?{associationState:'known-absent',associationGap:'必要规则记录不存在；本次检查没有现存触发记录，不生成虚构记录。'}:{})});
 for(const c of ruleCatalog.filter(c=>c.required))if(!rows.some(r=>r['规则编号']===c.id))add(-1,'规则编号',`必要规则 ${c.id} 不得删除`,[],{table:'rules',key:c.id});
 rows.forEach((r,i)=>{
  const c=ruleCatalog.find(c=>c.id===r['规则编号']);const enabled=r['是否启用']==='是';
  const effectiveFrom=r['生效时间']||'';const scope=r['适用对象']||'*';
  let parameters;try{parameters=JSON.parse(r['参数JSON']||'{}');if(!parameters||typeof parameters!=='object'||Array.isArray(parameters))throw Error();}catch{add(i,'参数JSON','须为 JSON 对象');parameters={};}
  if(effectiveFrom&&!validRuleTime(effectiveFrom))add(i,'生效时间','须为真实日历日期且带时区的 ISO 时间（精确至秒）');
  if(!['是','否'].includes(r['是否启用']))add(i,'是否启用','仅接受是或否');
  if(!r['规则编号']?.trim()||rows.filter(x=>x['规则编号']===r['规则编号']).length!==1)add(i,'规则编号','规则编号须非空且唯一',refs('rules',rows.filter(x=>x['规则编号']===r['规则编号'])));
  if(enabled&&!c?.supported)add(i,'是否启用',`${r['规则编号']} 尚未实现，不得启用；保存字段不代表检查通过`);
  if(c?.required&&(!enabled||(effectiveFrom&&Date.parse(effectiveFrom)>Date.parse(at))))add(i,'是否启用',`${c.id} 是始终有效的必要约束，不得关闭或延后生效`);
  if(enabled&&c?.supported){
   const allowed=c.id==='DELIVERY'?Object.keys(deliveryParameters):c.id==='INVENTORY'?['可用质量状态']:c.id==='SORT'?['排序方式']:c.id==='MATERIAL'?['允许预计供给','可用状态','预计状态','不可用状态']:c.id==='CAPACITY'?Object.keys(batchParameters):c.id==='PROGRAM'?['兼容条件']:['MOLD','STORAGE'].includes(c.id)?Object.keys(jointParameters):[];
   if(Object.keys(parameters).some(k=>!allowed.includes(k)))add(i,'参数JSON','包含当前执行器不支持的参数');
   if(c.id==='INVENTORY'){
    const p=parameters['可用质量状态'];if(!Array.isArray(p)||!p.length||p.some(x=>typeof x!=='string'||!x.trim()||x!==x.trim())||new Set(p).size!==p.length)add(i,'参数JSON','可用质量状态须为非空、无重复的状态列表');
    const objects=scope.split(',');if(scope!=='*'&&(new Set(objects).size!==objects.length||objects.some(id=>!data.materials?.some(m=>m['物料编号']===id))))add(i,'适用对象','须为 * 或已配置物料编号的无重复逗号列表');
   }else if(scope!=='*')add(i,'适用对象','此规则当前只支持 *（全部对象），不允许遗漏必要约束');
   if(['MOLD','STORAGE'].includes(c.id)){
    const same=expected=>Object.keys(parameters).length===Object.keys(expected).length&&Object.entries(expected).every(([k,v])=>parameters[k]===v);
    if(!same(jointParameters)&&!same(legacyJointParameters))add(i,'参数JSON','须采用资源参数契约 CR-DEC02-03-v1；旧FR022-v1参数仅兼容迁移，实际占用按表23逐项配置');
   }
   if(c.id==='DELIVERY')for(const [key,value]of Object.entries(deliveryParameters))if(parameters[key]!==value)add(i,'参数JSON',`${key}须显式配置为 ${value}`);
   if(c.id==='SORT'&&!['优先顺序','要求日期'].includes(parameters['排序方式']))add(i,'参数JSON','排序方式须为优先顺序或要求日期');
   if(c.id==='CAPACITY'||c.id==='PROGRAM'){
    const expected=c.id==='CAPACITY'?batchParameters:{兼容条件:batchParameters.合批条件};
    for(const [key,value]of Object.entries(expected))if(parameters[key]!==value)add(i,'参数JSON',`${key}须显式配置为 ${value}；其他语义未决定`);
    if(!effectiveFrom||Date.parse(effectiveFrom)<=Date.parse(at))for(const id of ['MATERIAL','CAPACITY','PROGRAM'])if(!rows.some(x=>x['规则编号']===id&&x['是否启用']==='是'&&(!x['生效时间']||Date.parse(x['生效时间'])<=Date.parse(at))))add(i,'是否启用',`拆合批须同时采用 MATERIAL/CAPACITY/PROGRAM；缺少 ${id}`,undefined,{table:'rules',key:id,requirement:'已启用且生效'});
   }
   if(c.id==='MATERIAL'){
    if(typeof parameters['允许预计供给']!=='boolean')add(i,'参数JSON','须显式声明允许预计供给 true/false');
    for(const k of ['可用状态','预计状态','不可用状态']){const p=parameters[k];if(!Array.isArray(p)||!p.length||p.some(x=>typeof x!=='string'||!x.trim()||x!==x.trim())||new Set(p).size!==p.length)add(i,'参数JSON',`${k}须为非空、无重复状态列表`);}
    const groups=['可用状态','预计状态','不可用状态'].map(k=>Array.isArray(parameters[k])?parameters[k]:[]);const combined=groups.flat();if(new Set(combined).size!==combined.length)add(i,'参数JSON','可用/预计/不可用状态不能重叠');
    if(!data.bom?.length)add(i,'是否启用','启用物料规则须先配置 BOM',undefined,{table:'bom'});
   }
   if(c.id==='LABOR'&&(!data.dependencies?.some(d=>d['资源类型']==='人员技能')||!data.personnelGroups?.length))add(i,'是否启用','启用人员规则须先配置人员需求及人员组',undefined,{table:!data.dependencies?.some(d=>d['资源类型']==='人员技能')?'dependencies':'personnelGroups'});
   const needed={MACHINE:['machines','dependencies'],PRECEDENCE:['routes','times'],CALENDAR:['calendars']}[c.id]||[];
   for(const key of needed)if(!data[key]?.length)add(i,'是否启用',`${c.id} 缺少必要数据 ${key}`,undefined,{table:key});
  }
  const inScope=!minimal||['MACHINE','PRECEDENCE','SORT'].includes(c?.id);
  const active=inScope&&enabled&&!!c?.supported&&(!effectiveFrom||Date.parse(effectiveFrom)<=Date.parse(at));
  settings.push({id:r['规则编号'],category:c?.category||'未知类别',name:r['中文名称'],enabled,active,supported:!!c?.supported,required:!!c?.required,effectiveFrom,scope,parameters:['MOLD','STORAGE'].includes(c?.id)?jointParameters:parameters,status:!inScope?'本次最小模式未检查':!c?.supported?'未实现/未检查':!enabled?'未启用':active?'采用':'待生效'});
 });
 if(checkCoverage){
  for(const order of (data.orders||[]).filter(o=>o['需求类型']!=='预测'&&!['取消','已取消','完成','已完成'].includes(o['订单状态']))){
   const routes=(data.routes||[]).filter(r=>r['产品编号']===order['产品编号']);
   if(!routes.length)add(-1,'是否启用',`订单 ${order['订单编号']} 缺少路线，不能执行必要规则`,refs('orders',[order]),{table:'routes',key:order['产品编号']});
   for(const r of routes){
    const duration=(data.times||[]).find(t=>t['产品编号']===order['产品编号']&&t['工序编号']===r['工序编号']);
    if(!duration||duration['计算方式']!=='固定'||!(Number(duration['固定分钟'])>0))add(-1,'是否启用',`订单 ${order['订单编号']} / ${r['工序编号']} 缺少有效固定工时`,[...refs('orders',[order]),...refs('routes',[r]),...(duration?refs('times',[duration]):[])],{table:'times',key:order['产品编号']+'/'+r['工序编号'],requirement:'有效固定工时'});
    const dep=(data.dependencies||[]).filter(d=>d['订单编号']===order['订单编号']&&d['工序编号']===r['工序编号']&&d['资源类型']==='设备');
    const machine=dep.length===1&&(data.machines||[]).find(m=>m['设备编号']===dep[0]['资源编号']&&m['工序编号']===r['工序编号']);
    if(!machine)add(-1,'是否启用',`订单 ${order['订单编号']} / ${r['工序编号']} 须配置唯一、有效的设备依赖`,[...refs('orders',[order]),...refs('routes',[r]),...refs('dependencies',dep)],{table:'dependencies',requirement:'唯一有效设备依赖'});
    else if(!minimal&&(!machine['日历编号']||(data.calendars||[]).filter(c=>c['日历编号']===machine['日历编号']).length===0))add(-1,'是否启用',`设备 ${machine['设备编号']} 缺少明确引用的日历`,[...refs('orders',[order]),...refs('routes',[r]),...refs('dependencies',dep),...refs('machines',[machine])],{table:'calendars',key:machine['日历编号']});
   }
  }
 }
 if((data.executionFacts||[]).length){checkScope.checked.push('模拟累计执行事实、原始保护区间与剩余工时/耗料（支持口径）');checkScope.unchecked=checkScope.unchecked.map(x=>x==='执行事实与主管确认'?'真实执行/质量确认、FR031事件恢复/转机/冲销':x);}
 return {checkScope,capabilityVersion:(data.simulationEvents||[]).length?'FR029-v1':(data.executionSources||[]).length||(data.executionFacts||[]).some(f=>Number(f['累计报废数量']||0)>0)?'FR031-v1':(data.executionFacts||[]).length?'FR012-v1':minimal?'FR019-minimal-v1':deliveryActive(data,at)?'FR023-v1':Object.values(jointFlags(data,at)).some(Boolean)?'FR022-v1':activeBatchRule(data,at)?'FR021-v1':'FR020-v1',at,settings,issues,intrinsicChecks:minimal?checkScope.checked:['单产线','机器不重叠','工序先后与固定工时','日历与停机','已配置人员依赖（即使 LABOR 开关关闭也保留）','显式预计供给引用可用时点',...(material?['已声明口径的BOM需求、库存及条件供给分配']:[]),...(jointFlags(data,at).MOLD?['显式逐生产批工装完整占用与释放容量']:[]),...(jointFlags(data,at).STORAGE?['显式逐生产批空间kg/位置完整占用与释放容量']:[]),...(activeBatchRule(data,at)?['BOM总投入装载、均分、同产品同版本同路线同程序资源批']:[])],independentChecks:['单产线','机器不重叠','工序先后'],note:checkScope.note+' 规则采用不等于独立复核通过；INVENTORY 用于可用量查询；MATERIAL 启用时使用其独立显式状态规则分配，仅覆盖声明的BOM口径。生效时间按服务端计算发起时刻判断，不是任务分钟轴。'};
}
