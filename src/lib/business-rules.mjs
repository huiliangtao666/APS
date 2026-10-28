// Versioned capability contract. Configuration storage is not execution support.
export const ruleCatalog = [
 ['MACHINE','BR-03','机器不重叠',true,'全部设备；独占、单台，不支持批处理/并行','{}','无','固定'],
 ['PRECEDENCE','BR-02','工序顺序与固定工时',true,'全部工序；不支持最大等待','{}','分钟','正数固定工时来自工序工时表'],
 ['CALENDAR','BR-05','日历与停机',true,'全部设备；连续窗口，不支持中断','{}','分钟','窗口及停机来自日历表'],
 ['LABOR','BR-07','人员技能与数量',false,'全部人员依赖；关闭开关仍保留既有依赖保护','{}','人/分钟','正整数人数及有效参与窗口'],
 ['INVENTORY','BR-08','库存质量可用性查询',false,'* 或物料编号逗号列表；仅查询，不代表物料平衡','{"可用质量状态":["合格"]}','物料单位','非空、无重复状态列表'],
 ['SORT','BR-15','任务排序',false,'全部订单；稳定排序，不改变硬约束','{"排序方式":"优先顺序"}','无','优先顺序 或 要求日期'],
 ...[['LINE','BR-01','单线范围（始终检查）'],['SPEED','BR-04','速度与效率'],['MOLD','BR-06','模具/工装'],['MATERIAL','BR-09','库存分配与物料平衡'],['BOM','BR-10','BOM数量计算'],['CAPACITY','BR-11','拆合批与容量'],['PROGRAM','BR-11','程序兼容'],['MAX_LAG','BR-12','最大等待'],['STORAGE','BR-12','空间容量'],['CLEANING','BR-13','换型清洗'],['DELIVERY','BR-14','预计可交付与余保'],['PROGRESS','BR-16','执行保护'],['CONFIRM','BR-17','主管确认条件'],['ROUNDING','BR-18','时间单位与取整']].map(([id,category,name])=>[id,category,name,false,'不支持可配置启用；字段保存不等于检查通过','{}','见v0.3第7章','后续完整验收'])
].map(([id,category,name,required,scope,parameters,unit,range],i)=>({id,category,name,required,supported:i<6,scope,parameters,unit,range}));
export function validRuleTime(value) {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return false;
 const parts=value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/);
 const date=new Date(parts[1]+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===parts[1]&&Number(parts[2])<24&&Number(parts[3])<60&&Number(parts[4])<60&&Number.isFinite(Date.parse(value));
}
export function assessRules(data, at=new Date().toISOString(), checkCoverage=false) {
 const issues=[],settings=[];const rows=data.rules||[];
 const add=(index,field,message)=>issues.push({table:'rules',file:'16_排程规则配置.csv',row:index<0?0:index+2,field,message});
 for(const c of ruleCatalog.filter(c=>c.required))if(!rows.some(r=>r['规则编号']===c.id))add(-1,'规则编号',`必要规则 ${c.id} 不得删除`);
 rows.forEach((r,i)=>{
  const c=ruleCatalog.find(c=>c.id===r['规则编号']);const enabled=r['是否启用']==='是';
  const effectiveFrom=r['生效时间']||'';const scope=r['适用对象']||'*';
  let parameters;try{parameters=JSON.parse(r['参数JSON']||'{}');if(!parameters||typeof parameters!=='object'||Array.isArray(parameters))throw Error();}catch{add(i,'参数JSON','须为 JSON 对象');parameters={};}
  if(effectiveFrom&&!validRuleTime(effectiveFrom))add(i,'生效时间','须为真实日历日期且带时区的 ISO 时间（精确至秒）');
  if(!['是','否'].includes(r['是否启用']))add(i,'是否启用','仅接受是或否');
  if(!r['规则编号']?.trim()||rows.filter(x=>x['规则编号']===r['规则编号']).length!==1)add(i,'规则编号','规则编号须非空且唯一');
  if(enabled&&!c?.supported)add(i,'是否启用',`${r['规则编号']} 尚未实现，不得启用；保存字段不代表检查通过`);
  if(c?.required&&(!enabled||(effectiveFrom&&Date.parse(effectiveFrom)>Date.parse(at))))add(i,'是否启用',`${c.id} 是始终有效的必要约束，不得关闭或延后生效`);
  if(enabled&&c?.supported){
   const allowed=c.id==='INVENTORY'?['可用质量状态']:c.id==='SORT'?['排序方式']:[];
   if(Object.keys(parameters).some(k=>!allowed.includes(k)))add(i,'参数JSON','包含当前执行器不支持的参数');
   if(c.id==='INVENTORY'){
    const p=parameters['可用质量状态'];if(!Array.isArray(p)||!p.length||p.some(x=>typeof x!=='string'||!x.trim()||x!==x.trim())||new Set(p).size!==p.length)add(i,'参数JSON','可用质量状态须为非空、无重复的状态列表');
    const objects=scope.split(',');if(scope!=='*'&&(new Set(objects).size!==objects.length||objects.some(id=>!data.materials?.some(m=>m['物料编号']===id))))add(i,'适用对象','须为 * 或已配置物料编号的无重复逗号列表');
   }else if(scope!=='*')add(i,'适用对象','此规则当前只支持 *（全部对象），不允许遗漏必要约束');
   if(c.id==='SORT'&&!['优先顺序','要求日期'].includes(parameters['排序方式']))add(i,'参数JSON','排序方式须为优先顺序或要求日期');
   if(c.id==='LABOR'&&(!data.dependencies?.some(d=>d['资源类型']==='人员技能')||!data.personnelGroups?.length))add(i,'是否启用','启用人员规则须先配置人员需求及人员组');
   const needed={MACHINE:['machines','dependencies'],PRECEDENCE:['routes','times'],CALENDAR:['calendars']}[c.id]||[];
   for(const key of needed)if(!data[key]?.length)add(i,'是否启用',`${c.id} 缺少必要数据 ${key}`);
  }
  const active=enabled&&!!c?.supported&&(!effectiveFrom||Date.parse(effectiveFrom)<=Date.parse(at));
  settings.push({id:r['规则编号'],category:c?.category||'未知类别',name:r['中文名称'],enabled,active,supported:!!c?.supported,required:!!c?.required,effectiveFrom,scope,parameters,status:!c?.supported?'未实现/未检查':!enabled?'未启用':active?'采用':'待生效'});
 });
 if(checkCoverage){
  for(const order of (data.orders||[]).filter(o=>o['需求类型']!=='预测'&&!['取消','已取消','完成','已完成'].includes(o['订单状态']))){
   const routes=(data.routes||[]).filter(r=>r['产品编号']===order['产品编号']);
   if(!routes.length)add(-1,'是否启用',`订单 ${order['订单编号']} 缺少路线，不能执行必要规则`);
   for(const r of routes){
    const duration=(data.times||[]).find(t=>t['产品编号']===order['产品编号']&&t['工序编号']===r['工序编号']);
    if(!duration||duration['计算方式']!=='固定'||!(Number(duration['固定分钟'])>0))add(-1,'是否启用',`订单 ${order['订单编号']} / ${r['工序编号']} 缺少有效固定工时`);
    const dep=(data.dependencies||[]).filter(d=>d['订单编号']===order['订单编号']&&d['工序编号']===r['工序编号']&&d['资源类型']==='设备');
    const machine=dep.length===1&&(data.machines||[]).find(m=>m['设备编号']===dep[0]['资源编号']&&m['工序编号']===r['工序编号']);
    if(!machine)add(-1,'是否启用',`订单 ${order['订单编号']} / ${r['工序编号']} 须配置唯一、有效的设备依赖`);
    else if(!machine['日历编号']||(data.calendars||[]).filter(c=>c['日历编号']===machine['日历编号']).length===0)add(-1,'是否启用',`设备 ${machine['设备编号']} 缺少明确引用的日历`);
   }
  }
 }
 return {capabilityVersion:'FR017-v1',at,settings,issues,intrinsicChecks:['单产线','机器不重叠','工序先后与固定工时','日历与停机','已配置人员依赖（即使 LABOR 开关关闭也保留）','显式预计供给引用可用时点'],independentChecks:['单产线','机器不重叠','工序先后'],note:'规则采用不等于独立复核通过；INVENTORY 仅用于可用量查询，不检查完整物料平衡。生效时间按服务端计算发起时刻判断，不是任务分钟轴。'};
}
