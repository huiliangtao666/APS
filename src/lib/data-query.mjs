import {personnelCandidates,skillsOf} from './resource-policies.mjs';
// Read-only view model. Links represent explicit input references, never allocation.
export const taskDef={key:'tasks',label:'方案任务',file:'方案任务.csv',fields:['任务编号','订单编号','产品编号','工序编号','工序名称','设备编号','开始分钟','结束分钟','工时分钟','前序任务','来源说明','方案编号','方案状态','输入版本','方案记录规则','运行编号','计算模式','方案检查范围','尚未检查','物料检查','物料需求与批次分配','检查结论边界','生产批编号','资源批编号','合格数量kg','精确合格数量','投入装载kg','精确投入装载','拆合批检查','联合资源检查','联合资源占用','任务时间因果','订单完成与交期影响']};
export function queryData(data,plans,planId){
 const plan=plans.find(p=>p.id===planId);
 return {...data,tasks:(plan?.tasks||[]).map(t=>({'任务编号':t.id,'订单编号':t.orderId,'产品编号':t.productId,'工序编号':t.operation,'工序名称':t.label,'设备编号':t.machine,'开始分钟':String(t.start),'结束分钟':String(t.end),'工时分钟':String(t.duration),'前序任务':t.predecessor||'','来源说明':t.source||'','方案编号':plan.id,'方案状态':plan.status||'legacy','方案记录规则':(plan.rules||[]).join('、'),'输入版本':String(plan.revision??plan.inputVersion??'旧版未记录'),'运行编号':plan.runId||'旧方案未记录','计算模式':plan.conditions?.checkScope?.label||'旧方案未记录','方案检查范围':plan.conditions?.checkScope?.checked.join('；')||'旧方案未记录','尚未检查':plan.conditions?.checkScope?.unchecked.join('；')||'旧方案未记录','物料检查':plan.materialChecked?'已检查（支持口径）':'物料未检查','物料需求与批次分配':JSON.stringify((plan.materialDemands||[]).filter(r=>r.taskId===t.id)),'生产批编号':t.productionBatchId||'','资源批编号':t.resourceBatchId||'','合格数量kg':String(t.quantity??''),'精确合格数量':JSON.stringify(t.exactQuantity??null),'投入装载kg':String(t.loadKg??''),'精确投入装载':JSON.stringify(t.exactLoadKg??null),'拆合批检查':plan.batchChecked?'已检查（支持口径）':'拆合批/程序未检查','联合资源检查':JSON.stringify(plan.jointResourceChecks||{}),'联合资源占用':JSON.stringify((plan.resourceReservations||[]).filter(r=>r.taskIds.includes(t.id))),'任务时间因果':JSON.stringify(t.timingReasons||[]),'订单完成与交期影响':JSON.stringify(plan.deliveryAssessment?.orders.find(o=>o.orderId===t.orderId)||null),'检查结论边界':plan.conditions?.checkScope?.note||'不能据此认定完整业务可执行'}))};
}
const equal=(a,b,k)=>!!a[k]&&a[k]===b[k];
const pair=(a,b,keys)=>keys.every(k=>equal(a,b,k));
export function related(data,table,index){
 const row=data[table]?.[index];if(!row)return [];
 const results=[];
 for(const [i,m] of (data.resourceMappings||[]).entries()){
  const source=m['来源类别'],tool=source==='originalTools',target=tool?'tools':'personnelGroups';
  const pairs=[[source,tool?'资源编号':'人员组编号','来源编号','来源字面记录'],[target,tool?'工装编码':'人员组编号','运行编号','显式运行绑定']];
  for(const [key,id,field,label] of pairs){
   if(table==='resourceMappings'&&index===i)(data[key]||[]).forEach((r,n)=>{if(r[id]===m[field])results.push({table:key,index:n,label});});
   if(table===key&&row[id]===m[field])results.push({table:'resourceMappings',index:i,label:'显式来源/运行合同'});
  }
 }

 // These are declared-skill references, not eligibility or allocation. Keep
 // the provided/required direction visible even when both refer to one group.
 const skillRoles=[['可提供技能','声明可提供技能'],['所需技能','声明所需技能']];
 const skillReference=(relation,group)=>skillRoles.filter(([field])=>!!relation[field]?.trim()&&skillsOf(group['技能']).includes(relation[field])).map(([,label])=>label).join(' / ');
 if(table==='skillSubstitutions'){
  (data.personnelGroups||[]).forEach((group,i)=>{const label=skillReference(row,group);if(label)results.push({table:'personnelGroups',index:i,label});});
  if(row['适用工序']?.trim()&&row['适用工序']!=='*')(data.routes||[]).forEach((route,i)=>{if(row['适用工序']===route['工序编号'])results.push({table:'routes',index:i,label:'声明适用工序'});});
 }
 if(table==='personnelGroups')(data.skillSubstitutions||[]).forEach((relation,i)=>{const label=skillReference(relation,row);if(label)results.push({table:'skillSubstitutions',index:i,label});});
 if(table==='routes'&&row['工序编号']?.trim())(data.skillSubstitutions||[]).forEach((relation,i)=>{if(relation['适用工序']===row['工序编号'])results.push({table:'skillSubstitutions',index:i,label:'声明适用工序'});});
 if(table==='rules'&&row['规则编号'])(data.tasks||[]).forEach((r,i)=>{if((r['方案记录规则']||'').split('、').includes(row['规则编号']))results.push({table:'tasks',index:i});});
 if(table==='tasks')(data.rules||[]).forEach((r,i)=>{if(r['规则编号']&&(row['方案记录规则']||'').split('、').includes(r['规则编号']))results.push({table:'rules',index:i});});
 const originalLinks=[
  ['originalInventory','物料编号','materials','物料编号',()=>true],
  ['originalSupply','物料编号','materials','物料编号',()=>true],
  ['originalBom','产品编号','products','产品编号',()=>true],
  ['originalBom','物料编号','materials','物料编号',()=>true],
  ['originalBom','投料工序','routes','工序编号',(a,b)=>a['产品编号']===b['产品编号']],
  ['originalTools','资源编号','tools','工装编码',()=>true],
  ['originalPersonnel','人员组编号','personnelGroups','人员组编号',()=>true],
  ['originalTools','资源编号','dependencies','资源编号',(a,b)=>a['资源类型']===b['资源类型']],
  ['originalPersonnel','人员组编号','dependencies','资源编号',(_a,b)=>['人员','人员技能'].includes(b['资源类型'])]
 ];
 for(const [a,af,b,bf,accept] of originalLinks){
  if(table===a)(data[b]||[]).forEach((other,i)=>{if(row[af]&&row[af]===other[bf]&&accept(row,other))results.push({table:b,index:i,label:'原件同编号关联（待运行映射核对）'});});
  if(table===b)(data[a]||[]).forEach((other,i)=>{if(row[bf]&&row[bf]===other[af]&&accept(other,row))results.push({table:a,index:i,label:'原件同编号关联（待运行映射核对）'});});
 }
 const edges=[
 ['personnelPools','personnelGroups',['poolId']],
 ['factoryLines','machines',['产线编号']],['factoryLines','orders',['产线编号']],['factoryLines','calendars',['工厂编号']],['factoryLines','factoryLines',['工厂编号']],
 ['executionFacts','executionSources',['事实编号']],['executionSources','executionMaterials',['事实编号']],['orders','executionFacts',['订单编号']],['executionFacts','executionMaterials',['事实编号']],['materials','executionMaterials',['物料编号']],['inventory','executionMaterials',['批次编号']],
 ['products','orders',['产品编号']],['products','routes',['产品编号']],['products','times',['产品编号']],['products','bom',['产品编号']],['products','tasks',['产品编号']],
 ['materials','inventory',['物料编号']],['materials','supplies',['物料编号']],['materials','bom',['物料编号']],
 ['orders','deliveryConditions',['订单编号']],['orders','resourceClaims',['订单编号']],['orders','dependencies',['订单编号']],['orders','supplyUses',['订单编号']],['orders','tasks',['订单编号']],
 ['orders','routes',['产品编号']],['orders','times',['产品编号']],['orders','bom',['产品编号']],
 ['routes','times',['产品编号','工序编号']],['routes','machines',['工序编号']],['routes','tasks',['产品编号','工序编号']],
 ['times','machines',['工序编号']],['times','tasks',['产品编号','工序编号']],
 ['machines','downtime',['设备编号']],['machines','calendars',['日历编号']],['machines','tasks',['设备编号']],
 ['supplies','supplyDelays',['供给编号']],['supplies','supplyUses',['供给编号']],
 ['dependencies','supplyUses',['订单编号','工序编号']],['dependencies','tasks',['订单编号','工序编号']],['supplyUses','tasks',['订单编号','工序编号']],
 ['resourceClaims','tasks',['订单编号','工序编号']],['executionFacts','tasks',['订单编号','工序编号']],['executionFacts','dependencies',['订单编号','工序编号']]
 ];
 for(const [a,b,keys] of edges){const target=table===a?b:table===b?a:null;if(!target)continue;
  (data[target]||[]).forEach((other,i)=>{if(!(target===table&&i===index)&&pair(row,other,keys))results.push({table:target,index:i});});
 }
 // Explicit resource declarations have their own type namespace; never join a
 // similarly named tool, space and machine merely because their IDs coincide.
 const resources=[['tools','工装编码',['工装']],['batchResources','资源编号',['空间']]];
 for(const [target,field,types] of resources){
  const match=(claim,r)=>types.includes(claim['资源类型'])&&!!claim['资源编号']&&claim['资源编号']===r[field];
  if(table==='resourceClaims')(data[target]||[]).forEach((r,i)=>{if(match(row,r))results.push({table:target,index:i});});
  if(table===target)(data.resourceClaims||[]).forEach((r,i)=>{if(match(r,row))results.push({table:'resourceClaims',index:i});});
 }
 if(table==='executionFacts')(data.machines||[]).forEach((r,i)=>{if(row['当前设备']&&row['当前设备']===r['设备编号'])results.push({table:'machines',index:i});});
 if(table==='machines')(data.executionFacts||[]).forEach((r,i)=>{if(r['当前设备']===row['设备编号'])results.push({table:'executionFacts',index:i});});
 // Event payloads reference only named fields, never substring matches.
 for(const [target,field,reference] of [['machines','设备编号','machineId'],['inventory','批次编号','lotId'],['personnelGroups','人员组编号','groupId'],['supplies','供给编号','supplyId']]){
  const match=(event,r)=>{try{const p=JSON.parse(event['参数JSON']);return !!p[reference]&&p[reference]===r[field];}catch{return false;}};
  if(table==='simulationEvents')(data[target]||[]).forEach((r,i)=>{if(match(row,r))results.push({table:target,index:i});});
  if(table===target)(data.simulationEvents||[]).forEach((r,i)=>{if(match(r,row))results.push({table:'simulationEvents',index:i});});
 }
 // Resource IDs have a type namespace; operation IDs have a product namespace.
 for(const [target,field,type] of [['machines','设备编号','设备'],['personnelGroups','人员组编号','人员技能'],['materials','物料编号','物料']]){
  if(table==='dependencies'&&row['资源类型']===type)(data[target]||[]).forEach((r,i)=>{if(type==='人员技能'?personnelCandidates(row).includes(r[field]):row['资源编号']&&row['资源编号']===r[field])results.push({table:target,index:i});});
  if(table===target)(data.dependencies||[]).forEach((r,i)=>{if(r['资源类型']===type&&(type==='人员技能'?personnelCandidates(r).includes(row[field]):r['资源编号']&&r['资源编号']===row[field]))results.push({table:'dependencies',index:i});});
 }
 for(const [target,reference] of [['dependencies','工序编号'],['supplyUses','工序编号'],['bom','投料工序编号']]){
  const matches=(r,route)=>{
   const product=r['产品编号']||(data.orders||[]).find(o=>equal(o,r,'订单编号'))?.['产品编号'];
   return !!product&&product===route['产品编号']&&!!r[reference]&&r[reference]===route['工序编号'];
  };
  if(table==='routes')(data[target]||[]).forEach((r,i)=>{if(matches(r,row))results.push({table:target,index:i});});
  if(table===target)(data.routes||[]).forEach((r,i)=>{if(matches(row,r))results.push({table:'routes',index:i});});
 }
 return [...new Map(results.map(r=>[r.table+':'+r.index,r])).values()];
}
export function filterOptions(fields){return {dateFields:fields.filter(f=>/日期|时间|有效期|分钟$/.test(f)&&!/^固定|^最大等待|^提前|^后延|^工时|^模拟交付等待/.test(f)),statusFields:fields.filter(f=>/状态|是否启用|是否工作/.test(f))};}
// Date.parse normalizes impossible days. Validate the local calendar first,
// then use the supplied offset to compare instants without changing its date.
function queryTime(raw,field){
 const value=String(raw??'').trim();
 if(/分钟$/.test(field))return value===''?NaN:Number(value);
 const date=value.slice(0,10);
 const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
 if(!validDate)return NaN;
 if(field==='有效期'||/日期/.test(field))return value===date?Date.parse(date+'T00:00:00Z'):NaN;
 const match=value.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/);
 if(!match||Number(match[1])>23||Number(match[2])>59||Number(match[3]||0)>59)return NaN;
 return Date.parse(value);
}
export function filterRows(data,table,filters={}){
 const {text='',product='',order='',status='',statusField='',dateField='',from='',to=''}=filters;
 const linked=(row,kind,value)=>{
  if(!value)return true;if(row[kind])return row[kind]===value;
  // Only explicit order/product references; machines/materials have no implicit product ownership.
  if(row['事实编号']&&!row['订单编号']){const fact=(data.executionFacts||[]).find(f=>f['事实编号']===row['事实编号']);if(fact)return linked(fact,kind,value);}
  if(kind==='产品编号'&&row['订单编号'])return (data.orders||[]).some(o=>equal(o,row,'订单编号')&&o[kind]===value);
  if(kind==='订单编号'&&row['产品编号'])return (data.orders||[]).some(o=>o[kind]===value&&equal(o,row,'产品编号'));
  return false;
 };
 const time=v=>queryTime(v,dateField);
 return (data[table]||[]).map((row,index)=>({row,index})).filter(({row})=>{
  if(text&&!Object.values(row).some(v=>String(v).toLocaleLowerCase().includes(text.toLocaleLowerCase())))return false;
  if(!linked(row,'产品编号',product)||!linked(row,'订单编号',order))return false;
  if(status&&row[statusField]!==status)return false;
  if(from||to){const n=time(row[dateField]);if(!Number.isFinite(n))return false;if(from&&(!Number.isFinite(time(from))||n<time(from)))return false;if(to&&(!Number.isFinite(time(to))||n>time(to)))return false;}
  return true;
 });
}
export function displayValue(field,value){
 if(field==='方案状态')return ({draft:'草稿',legacy:'历史快照',confirmed:'已确认',submitted:'已提交',released:'已发布',archived:'已归档'})[value]||String(value??'未记录');
 if(!/JSON$/.test(field)&&!['物料需求与批次分配','精确合格数量','精确投入装载','联合资源检查','联合资源占用','任务时间因果','订单完成与交期影响'].includes(field))return String(value??'');
 const labels={machineId:'设备编号',endMinute:'结束分钟',lotId:'批次编号',status:'模拟状态',groupId:'人员组编号',supplyId:'供给编号',arrival:'预计到达时间',available:'预计可用时间',taskId:'任务编号',orderId:'订单编号',materialId:'物料编号',quantity:'数量',unit:'单位',source:'来源',kind:'类型',id:'编号',start:'开始分钟',end:'结束分钟',numerator:'分子',denominator:'分母',allocations:'批次分配',shortage:'缺口',conditional:'条件性供给',committed:'已模拟占用',readyAt:'可用分钟',expiry:'有效期',quality:'模拟质量状态',remaining:'剩余数量',exactQuantity:'精确数量',exactLoadKg:'精确投入量',resourceId:'资源编号',type:'类型',capacity:'容量',taskIds:'任务编号',productionBatchId:'生产批编号',before:'提前占用分钟',after:'后延占用分钟',note:'说明',message:'说明',code:'代码',checked:'已检查',unchecked:'尚未检查'};
 try{const parsed=JSON.parse(value||'{}');const human=v=>v===null?'未记录':Array.isArray(v)?v.map(human).join('、'):v&&typeof v==='object'?Object.entries(v).map(([k,x])=>`${labels[k]||(/^[A-Za-z]/.test(k)?'未识别字段（'+k+'）':k)}：${human(x)}`).join('；'):typeof v==='boolean'?(v?'是':'否'):String(v);return human(parsed)||'无附加参数';}catch{return '结构化内容格式无效，请维护人员检查';}
}
export function queryCsv(defs,data,plans,revision,query){
 const def=[...defs,taskDef].find(d=>d.key===query.table);if(!def)throw new Error('unknown_table');
 if(query.planId&&!plans.some(p=>p.id===query.planId))throw new Error('plan_not_found');
 const all=queryData(data,plans,query.planId);const rows=filterRows(all,def.key,query.filters);
 const fields=[...def.fields,'查询输入版本','关联方案编号','模拟说明','分钟基准',...(query.sourcePlanId?['原始输入版本SHA256']:[])];
 const csv=[fields,...rows.map(({row})=>[...def.fields.map(f=>displayValue(f,row[f])),revision,query.planId||'未选择',query.sourcePlanId?'模拟数据；所选方案计算时的原始输入快照':'模拟数据；关联输入为当前版本，非历史输入快照','0=2026-11-02T08:00:00+08:00；区间[开始,结束)',...(query.sourcePlanId?[plans.find(p=>p.id===query.sourcePlanId)?.inputVersionId]:[])])];
 // Spreadsheet formula injection must not turn imported text into executable cells.
 return csv.map(r=>r.map(v=>'"'+String(v??'').replace(/^[=+@\t\r]/,"'$&").replace(/^-([^0-9]|$)/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
