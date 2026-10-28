import {resourceLoad} from '../src/lib/resource-load.mjs';
import {queryData} from '../src/lib/data-query.mjs';
import {timetable,validInterval,timeLabel} from '../src/lib/timetable.mjs';
import {comparePlans} from '../src/lib/plan-comparison.mjs';
import {inputHash} from './run-input.mjs';
import {validConfirmation,contentHash} from './confirmation.mjs';
export const reportKinds={orders:'订单计划',tasks:'任务计划',occupation:'资源占用',materials:'物料需求',unplanned:'未排原因',differences:'方案差异'};
const fail=(error,status=400)=>{throw Object.assign(new Error(error),{status});};
const cell=v=>JSON.stringify(v??null);
export function scopedReport(s,q){
 if(!q||typeof q!=='object'||Array.isArray(q)||Object.keys(q).some(k=>!['kind','planId','otherPlanId','text','order','start','end'].includes(k))||!Object.hasOwn(reportKinds,q.kind)||typeof q.planId!=='string'||!q.planId||!validInterval(q.start,q.end)||['text','order','otherPlanId'].some(k=>q[k]!==undefined&&(typeof q[k]!=='string'||q[k].length>1000))||q.kind==='differences'&&!q.otherPlanId||q.kind!=='differences'&&q.otherPlanId)fail('invalid_report_query');
 // Canonical key order gives equivalent HTTP queries the same snapshot identity.
 q={planId:q.planId,kind:q.kind,...(q.kind==='differences'?{otherPlanId:q.otherPlanId}:{}),text:q.text||'',order:q.order||'',start:q.start,end:q.end};
 const saved=id=>{
  const p=s.plans.find(p=>p.id===id);if(!p)fail('plan_not_found',404);
  const original=s.inputVersions?.[p.inputVersionId]?.data,run=s.runs?.find(r=>r.id===p.runId);
  if(!p.conditions||!original||inputHash(original)!==p.inputVersionId||!run||run.inputVersionId!==p.inputVersionId||run.snapshotHash!==p.snapshotHash||inputHash(p.conditions)!==inputHash(run.conditions)||inputHash({conditions:run.conditions,executionData:run.executionData})!==p.snapshotHash)fail('historical_inputs_unavailable',409);
  const confirmation=s.confirmations?.find(c=>c.planId===id);
  if((p.status==='confirmed'||confirmation)&&(!validConfirmation(confirmation)||contentHash(confirmation.snapshot.plan)!==contentHash(p)))fail('protected_history_unavailable',409);
  return {...p,inputSnapshot:original,confirmationId:confirmation?.id??null};
 };
 const p=saved(q.planId),load=resourceLoad(p,{start:q.start,end:q.end}),model=timetable(p);
 let records=[];let comparison=null;
 if(q.kind==='orders')records=p.inputSnapshot.orders.filter(row=>p.conditions.orderIds.includes(row['订单编号'])).map(row=>({category:'订单计划',orderId:row['订单编号'],inputRecord:row,assessment:p.deliveryAssessment?.orders?.find(o=>o.orderId===row['订单编号'])??null}));
 if(q.kind==='tasks')records=queryData(p.inputSnapshot,[p],p.id).tasks.filter(row=>Number(row['开始分钟'])<q.end&&Number(row['结束分钟'])>q.start).map(row=>({category:'任务计划',orderId:row['订单编号'],record:row,assessment:model.tasks.find(t=>t.id===row['任务编号'])??null,inputRecords:{order:p.inputSnapshot.orders.find(o=>o['订单编号']===row['订单编号'])??null,route:p.inputSnapshot.routes.filter(r=>r['产品编号']===row['产品编号']&&r['工序编号']===row['工序编号'])},startAt:timeLabel(Number(row['开始分钟'])),endAt:timeLabel(Number(row['结束分钟']))}));
 if(q.kind==='occupation')records=[...load.machines.map(record=>({category:'设备',record})),...load.resources.map(record=>({category:'资源',record}))];
 if(q.kind==='materials')records=load.materials.map(record=>({category:'物料需求',orderId:record.orderId,record}));
 if(q.kind==='unplanned')records=model.tasks.filter(t=>t.status==='unplanned').map(record=>({category:'未排原因',orderId:record.orderId,record}));
 if(q.kind==='differences'){
  const other=saved(q.otherPlanId);comparison=comparePlans(p,p.inputSnapshot,other,other.inputSnapshot);
  records=['tasks','resources','materials','orders','unplanned'].flatMap(category=>comparison[category].known?comparison[category].changes.map(record=>({category,record})):[{category,record:{status:'未知 / 未检查'}}]);
  records.push(...comparison.impact.orders.map(record=>({category:'交期影响',orderId:record.orderId,record})));
  records.push(...comparison.impact.changedConditions.map(record=>({category:'输入条件',record})));
 }
 // Shared occupation cannot be assigned a fabricated per-order fraction. Keep the
 // complete physical row when ANY explicitly linked task belongs to that order.
 const recordsOf=v=>Array.isArray(v)?v:v&&typeof v==='object'?[v]:[];
 const orderMatches=r=>r.orderId===q.order||r.record?.orderId===q.order||[...(r.record?.taskIds||[]),...(r.record?.taskId?[r.record.taskId]:[])].some(id=>model.tasks.some(t=>t.id===id&&t.orderId===q.order))||[...recordsOf(r.record?.before),...recordsOf(r.record?.after)].some(x=>x.orderId===q.order||x['订单编号']===q.order);
 records=records.filter(r=>(!q.order||orderMatches(r))&&(!q.text||cell(r).toLocaleLowerCase().includes(q.text.toLocaleLowerCase())));
 const provenance={planId:p.id,runId:p.runId,inputVersionId:p.inputVersionId,snapshotHash:p.snapshotHash,confirmationId:p.confirmationId,status:p.status,createdAt:p.createdAt,lines:load.provenance.lines,executionFactsVersion:load.provenance.executionFactsVersion,checkScope:p.conditions.checkScope,materialChecked:p.materialChecked===true,query:q,timeOrigin:'2026-11-02T08:00:00+08:00',timezone:'UTC+08:00',interval:'[start,end)',source:'保存方案及其原始输入；不是当前执行事实',simulation:'模拟数据；不发送外部系统、不承诺真实交付'};
 const limits=['任务和资源使用半开窗口；订单、物料、未排及方案差异保留整份保存方案，窗口不截断其业务数量。','共享资源按关联订单保留整行总占用，不拆算订单份额；搜索逐行匹配。','数量、精确分数、单位和日期原样保留；null 表示未知，条件到料不是已到货。',...load.limits,...(comparison?.limits||[])];
 const rows=records.map(r=>[r.category,cell(r)]);
 const report={version:'FR035-v1',query:q,provenance,limits,comparison:comparison?{left:comparison.left,right:comparison.right,scope:comparison.scope,impact:{claim:comparison.impact.claim,noAutomaticImprovement:comparison.impact.noAutomaticImprovement,copiedResults:comparison.impact.copiedResults},conditions:{changed:comparison.conditions.changed},orderOutcome:comparison.orderOutcome}:null,columns:['类别','保存记录（数量、单位、日期、输入与判断依据）'],rows};
 return {...report,viewId:inputHash(report)};
}
export function reportCsv(r){
 const rows=[['FR035 查询、报表与文件导出'],['视图标识',r.viewId],['来源',cell(r.provenance)],['范围说明',cell(r.limits)],['比较依据',cell(r.comparison)],r.columns,...r.rows];
 return rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replace(/^[\t\r\n]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
}
