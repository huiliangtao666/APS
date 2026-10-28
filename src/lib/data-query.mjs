// Read-only view model. Links represent explicit input references, never allocation.
export const taskDef={key:'tasks',label:'方案任务',file:'方案任务.csv',fields:['任务编号','订单编号','产品编号','工序编号','工序名称','设备编号','开始分钟','结束分钟','工时分钟','前序任务','来源说明','方案编号','方案状态','输入版本','方案记录规则']};
export function queryData(data,plans,planId){
 const plan=plans.find(p=>p.id===planId);
 return {...data,tasks:(plan?.tasks||[]).map(t=>({'任务编号':t.id,'订单编号':t.orderId,'产品编号':t.productId,'工序编号':t.operation,'工序名称':t.label,'设备编号':t.machine,'开始分钟':String(t.start),'结束分钟':String(t.end),'工时分钟':String(t.duration),'前序任务':t.predecessor||'','来源说明':t.source||'','方案编号':plan.id,'方案状态':plan.status||'legacy','方案记录规则':(plan.rules||[]).join('、'),'输入版本':String(plan.revision??plan.inputVersion??'旧版未记录')}))};
}
const equal=(a,b,k)=>!!a[k]&&a[k]===b[k];
const pair=(a,b,keys)=>keys.every(k=>equal(a,b,k));
export function related(data,table,index){
 const row=data[table]?.[index];if(!row)return [];
 const results=[];
 if(table==='rules'&&row['规则编号'])(data.tasks||[]).forEach((r,i)=>{if((r['方案记录规则']||'').split('、').includes(row['规则编号']))results.push({table:'tasks',index:i});});
 if(table==='tasks')(data.rules||[]).forEach((r,i)=>{if(r['规则编号']&&(row['方案记录规则']||'').split('、').includes(r['规则编号']))results.push({table:'rules',index:i});});
 const edges=[
 ['products','orders',['产品编号']],['products','routes',['产品编号']],['products','times',['产品编号']],['products','bom',['产品编号']],['products','tasks',['产品编号']],
 ['materials','inventory',['物料编号']],['materials','supplies',['物料编号']],['materials','bom',['物料编号']],
 ['orders','dependencies',['订单编号']],['orders','supplyUses',['订单编号']],['orders','tasks',['订单编号']],
 ['orders','routes',['产品编号']],['orders','times',['产品编号']],['orders','bom',['产品编号']],
 ['routes','times',['产品编号','工序编号']],['routes','machines',['工序编号']],['routes','tasks',['产品编号','工序编号']],
 ['times','machines',['工序编号']],['times','tasks',['产品编号','工序编号']],
 ['machines','downtime',['设备编号']],['machines','calendars',['日历编号']],['machines','tasks',['设备编号']],
 ['supplies','supplyDelays',['供给编号']],['supplies','supplyUses',['供给编号']],
 ['dependencies','supplyUses',['订单编号','工序编号']],['dependencies','tasks',['订单编号','工序编号']],['supplyUses','tasks',['订单编号','工序编号']]
 ];
 for(const [a,b,keys] of edges){const target=table===a?b:table===b?a:null;if(!target)continue;
  (data[target]||[]).forEach((other,i)=>{if(pair(row,other,keys))results.push({table:target,index:i});});
 }
 // Resource IDs have a type namespace; operation IDs have a product namespace.
 for(const [target,field,type] of [['machines','设备编号','设备'],['personnelGroups','人员组编号','人员技能'],['materials','物料编号','物料']]){
  if(table==='dependencies'&&row['资源类型']===type)(data[target]||[]).forEach((r,i)=>{if(row['资源编号']&&row['资源编号']===r[field])results.push({table:target,index:i});});
  if(table===target)(data.dependencies||[]).forEach((r,i)=>{if(r['资源类型']===type&&r['资源编号']&&r['资源编号']===row[field])results.push({table:'dependencies',index:i});});
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
 if(/有效期|日期/.test(field))return value===date?Date.parse(date+'T00:00:00Z'):NaN;
 const match=value.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/);
 if(!match||Number(match[1])>23||Number(match[2])>59||Number(match[3]||0)>59)return NaN;
 return Date.parse(value);
}
export function filterRows(data,table,filters={}){
 const {text='',product='',order='',status='',statusField='',dateField='',from='',to=''}=filters;
 const linked=(row,kind,value)=>{
  if(!value)return true;if(row[kind])return row[kind]===value;
  // Only explicit order/product references; machines/materials have no implicit product ownership.
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
 if(field==='方案状态')return ({draft:'草稿',legacy:'历史快照'})[value]||String(value??'未记录');
 if(field!=='参数JSON')return String(value??'');
 try{const parsed=JSON.parse(value||'{}');const human=v=>Array.isArray(v)?v.map(human).join('、'):v&&typeof v==='object'?Object.entries(v).map(([k,x])=>`${k}：${human(x)}`).join('；'):String(v);return human(parsed)||'无附加参数';}catch{return '参数格式无效，请维护人员检查';}
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
