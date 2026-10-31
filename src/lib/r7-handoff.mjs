import {inputHash} from '../../server/run-input.mjs';
import {reviewPlan,contentHash} from '../../server/confirmation.mjs';
import {scopedReport,reportCsv} from '../../server/scoped-report.mjs';
const clone=x=>structuredClone(x);
const known=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const equalIds=(a,b)=>Array.isArray(a)&&new Set(a).size===a.length&&a.length===b.length&&a.every(id=>b.includes(id));
// A completeness inspection of SAVED records. It never generates missing tasks,
// recalculates delivery from current data, or treats absent reports as a pass.
export function savedResultCoverage(plan){
 const issues=[],add=(code,message,taskIds=[])=>issues.push({code,message,taskIds});
 const tasks=plan?.tasks,report=plan?.resultAssessment;
 if(!Array.isArray(tasks))add('TASKS_MISSING','保存的任务清单缺失。');
 if(!report||!Array.isArray(report.tasks)||!Array.isArray(report.orders))add('ASSESSMENT_MISSING','保存的逐任务/订单结果报告缺失。');
 const actual=Array.isArray(tasks)?tasks:[],assessed=Array.isArray(report?.tasks)?report.tasks:[];
 if(new Set(actual.map(t=>t.id)).size!==actual.length||new Set(assessed.map(t=>t.id)).size!==assessed.length)add('DUPLICATE_TASK','保存任务或结果报告存在重复任务编号。');
 for(const t of actual){
  if(['id','orderId','productId','operation','machine'].some(k=>!known(t[k]))||![t.start,t.end,t.duration].every(finite)||t.end<=t.start||t.duration!==t.end-t.start)add('TASK_DATA_MISSING','已排任务缺少执行关键编号或有效时间。',[t.id]);
  if(!assessed.some(r=>r.id===t.id&&r.status==='scheduled'))add('TASK_ASSESSMENT_MISSING','已排任务未被保存结果报告覆盖。',[t.id]);
 }
 for(const t of assessed){
  if(!known(t.id)||!known(t.orderId)||!known(t.operation)||!known(t.unit)||!finite(t.quantity)||t.quantity<0)add('DEMAND_DATA_MISSING','需求缺少编号、工序、数量或单位。',[t.id]);
  if(!['scheduled','unplanned'].includes(t.status))add('TASK_STATUS_UNKNOWN','任务状态未知。',[t.id]);
  if(t.status==='scheduled'&&!actual.some(a=>a.id===t.id))add('TASK_MISSING','报告宣称已排的任务不在保存方案中。',[t.id]);
  if(t.status==='unplanned'&&(!Array.isArray(t.reasons)||!t.reasons.length||t.reasons.some(r=>!known(r.code)||!known(r.message)||!known(r.classification)||['unknown','unresolved'].includes(r.classification))))add('UNPLANNED_CAUSE_UNKNOWN','未排原因缺失或业务语义未决。',[t.id]);
  if(t.status==='unplanned'&&actual.some(a=>a.id===t.id))add('TASK_STATUS_CONFLICT','同一任务同时被记录为已排和未排。',[t.id]);
 }
 for(const o of report?.orders||[])if(!known(o.orderId)||!known(o.unit)||!finite(o.remainingQuantity)||o.remainingQuantity<0||String(o.status).startsWith('unknown'))add('ORDER_DATA_UNKNOWN','订单余量、单位或路线/批次覆盖未知。');
 const unplanned=assessed.filter(t=>t.status==='unplanned');
 if(report&&(report.scheduledCount!==actual.length||report.unplannedCount!==unplanned.length))add('RESULT_COUNTS_MISMATCH','已排/未排报告数量与保存记录不一致。');
 if(!actual.length)add('NO_SCHEDULED_TASKS','没有可确认的已排任务；空结果不等于通过。');
 return {status:issues.length?'incomplete':'complete',issues,scheduledCount:actual.length,unplannedCount:unplanned.length,unplanned:clone(unplanned),quantityMeaning:'未排数量按任务/工序列示，不跨工序合计订单需求。'};
}
// Reuse the six existing report views, their half-open window/order/text filter,
// source validation, exact values, resource load and comparePlans implementation.
export function querySavedReport(state,query){
 const report=scopedReport(state,query),plan=state.plans.find(p=>p.id===query.planId);
 const result={...report,version:'R7-query-v1',coverage:savedResultCoverage(plan)};
 result.viewId=inputHash(Object.fromEntries(Object.entries(result).filter(([k])=>k!=='viewId')));
 return clone(result);
}
export function savedReportCsv(report){
 if(report.version!=='R7-query-v1'||inputHash(Object.fromEntries(Object.entries(report).filter(([k])=>k!=='viewId')))!==report.viewId)throw Error('report_changed');
 // Keep the existing native report format and full record literals; coverage is
 // explicit export metadata, including for a filtered empty result.
 return reportCsv({...report,limits:[...report.limits,{savedResultCoverage:report.coverage}]});
}
// Additional DATA gate for existing internal workflow. Actual roles, audit,
// submit/return/confirm transactions and final fresh independent review remain
// the application's responsibility. Calling this function performs no writes.
export function assessHandoff(state,planId,decision={},now=new Date().toISOString()){
 const plan=state.plans?.find(p=>p.id===planId);if(!plan)throw Error('plan_not_found');
 let review;try{review=reviewPlan(state,plan,now);}catch{review={blockers:[{code:'history_or_data_missing',message:'冻结历史或关键数据不完整，不能确认。'}],independentChecks:null};}
 const coverage=savedResultCoverage(plan),blockers=clone(review.blockers),add=(code,message)=>blockers.push({code,message});
 for(const i of coverage.issues)add(i.code,i.message);
 const original=state.inputVersions?.[plan.inputVersionId]?.data;
 const selected=plan.conditions?.orderIds;
 if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length)add('ORDER_SCOPE_UNKNOWN','运行订单范围缺失或重复。');
 for(const id of selected||[]){
  const order=original?.orders?.find(o=>o['订单编号']===id);
  if(!order||['产品编号','产线编号','数量单位','合格需求'].some(k=>!known(order[k])))add('EXECUTION_INPUT_MISSING','所选订单执行关键数据缺失，不能用默认值确认。');
  const assessed=plan.resultAssessment?.orders?.find(o=>o.orderId===id);
  if(!assessed)add('ORDER_ASSESSMENT_MISSING','所选订单缺少保存的需求覆盖记录。');
  if(!plan.deliveryAssessment?.orders?.some(o=>o.orderId===id))add('DELIVERY_ASSESSMENT_MISSING','所选订单缺少保存的交付判断；未知不能假报可交付。');
 }
 if(!plan.ruleSnapshot?.checkScope&&!plan.conditions?.checkScope)add('CHECK_SCOPE_MISSING','保存的检查范围缺失。');
 const checks=review.independentChecks;
 if(!checks)add('FRESH_INDEPENDENT_REVIEW_REQUIRED','必须由现有应用重新执行冻结输入独立复核。');
 const requirements=['lineScope','machineOverlap','calendar',...(plan.conditions?.jointConditionsContract?['jointConditions']:[])];
 for(const key of requirements)if(checks?.checks?.[key]?.status!=='pass')add('UNCHECKED_'+key,'独立复核尚未通过：'+key);
 // Do not make missing checker mappings look like passes. Preserve every actual
 // ruleStatus for the reviewer; existing reviewPlan enforces supported rules.
 const notices=[];
 for(const r of checks?.ruleStatuses||[])if(r.status!=='pass')notices.push({code:'RULE_NOT_PASSED',ruleId:r.id,status:r.status,reason:r.reason});
 const unplanned=coverage.unplanned,conditionalSupply=clone(plan.supplyConditions||[]);
 if(unplanned.length&&(decision.allowPartial!==true||!equalIds(decision.unplannedIds,unplanned.map(t=>t.id))))add('PARTIAL_LIST_REQUIRED','确认已排部分须明确允许并完整列出未排任务。');
 if(conditionalSupply.length&&decision.acceptConditionalSupply!==true)add('CONDITIONAL_SUPPLY_ACK_REQUIRED','须明确告知并确认预计供给仍为条件。');
 if(decision.acknowledgeScope!==true)add('SCOPE_ACK_REQUIRED','须确认本方案检查范围和尚未检查项。');
 const hash=contentHash(plan),submission=state.workflows?.[planId]?.submission;
 const requiresResubmission=!!submission&&(submission.contentHash!==hash||submission.inputVersionId!==plan.inputVersionId||blockers.some(b=>['stale_input','changed_conditions','rule_effectivity_changed'].includes(b.code)));
 if(requiresResubmission)add('RESUBMISSION_REQUIRED','方案或输入变化后须重新提交。');
 const result={version:'R7-handoff-data-v1',planId,contentHash:hash,inputVersionId:plan.inputVersionId,snapshotHash:plan.snapshotHash,coverage,blockers,notices,unplanned,conditionalSupply,delivery:clone(plan.deliveryAssessment??null),ruleChecks:clone(plan.ruleSnapshot??null),independentChecks:clone(checks??null),changeReasons:clone(review.changeReasons||[]),requiresResubmission,dataGatePassed:blockers.length===0,finalIndependentReviewRequired:true,workflowActionPerformed:false,limits:['仅本系统模拟数据；不写入外部系统，不推断质量放行。','数据判定不能替代最终独立资源复核、实际角色校验和审计事务。','未排需求、预计供给、未知交付与未检查范围须完整告知。']};
 return {...result,reviewHash:inputHash(result)};
}
// Read actual status/evidence records; archived/Done is never a QA verdict.
export function recordedPackageStatus(record){
 return {issue:record?.issue??null,status:record?.status??'unknown',taskResult:clone(record?.taskResult??null),qa:clone(record?.qa??null),qaVerdict:record?.qa?.verdict??'NOT_EXECUTED',sourceSha:record?.sourceSha??null,evidence:clone(record?.evidence??[])};
}
// Existing FR036 matrix and real defs/keys are the authority. Return their literal
// schema plus parity gaps, without inventing an importer or external connector.
export function inspectExchangeContract(matrix,defs,recordKeys){
 const gaps=[];
 for(const def of defs){const m=matrix.inbound?.find(x=>x.key===def.key);
  if(!m||JSON.stringify(m.fields)!==JSON.stringify(def.fields)||JSON.stringify(m.uniqueKey)!==JSON.stringify(recordKeys[def.key]))gaps.push({table:def.key,code:'CONTRACT_DRIFT'});
  if(m&&(!m.sourceOwner||!m.direction||!m.systems?.length))gaps.push({table:def.key,code:'SOURCE_DIRECTION_MISSING'});
 }
 return {version:'R7-csv-simulation-v1',status:gaps.length?'gaps':'consistent',gaps,chapter9:clone(matrix.chapter9||[]),inbound:clone(matrix.inbound||[]),outbound:clone(matrix.outbound||[]),realConnection:false,externalWrite:false};
}
// Supplemental current runtime contract: do not overwrite historical chapter
// mapping or claim old static templates match newly added schema fields.
export function currentExchangeContract(matrix,defs,recordKeys){
 const audit=inspectExchangeContract(matrix,defs,recordKeys);
 const inbound=defs.map(def=>{
  const prior=matrix.inbound?.find(x=>x.key===def.key),same=prior&&JSON.stringify(prior.fields)===JSON.stringify(def.fields);
  return {...clone(prior||{}),...clone(def),uniqueKey:clone(recordKeys[def.key]||[]),systems:clone(prior?.systems||['APS']),sourceOwner:prior?.sourceOwner||'APS模拟输入文件；现场数据所有者未指定',direction:'inbound-simulation',template:same?prior.template:null,templateStatus:same?'existing-header-matches':'generate-from-current-fields',mappingStatus:prior?'existing-category':'current-simulation-extension',schemaSource:'server/planner.ts#defs',identitySource:'server/input-validation.mjs#recordKeys'};
 });
 return {...audit,inbound,currentSchemaStatus:inbound.every(r=>r.uniqueKey.length&&r.fields.length)?'complete':'gaps',staticDocumentationStatus:audit.status,limits:['原第9章类别与原字面映射保留；扩展表不替换原编号。','新增字段的当前CSV头由实际defs生成；旧静态模板和页面说明须Dev接入更新。','systems仅为可能对应系统；没有连接、真实账号或实际现场来源认定。']};
}
export function exchangeCsvTemplate(contract,key){
 const row=contract.inbound.find(x=>x.key===key);if(!row)throw Error('unknown_table');
 return '\ufeff'+row.fields.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')+'\r\n';
}
