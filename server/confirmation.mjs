import {freezePositions} from './trial-positions.mjs';
import {inputHash,freezeRunInput} from './run-input.mjs';
import {calculate,defs} from './planner.ts';
import {validateInputs} from './input-validation.mjs';
import {assessRules} from '../src/lib/business-rules.mjs';
import {independentlyVerifyPlan} from '../src/lib/independent-verification.mjs';

// All immutable confirmation reads share the same fail-closed digest check.
export function validConfirmation(c){
 return !!c && !!c.snapshot && typeof c.snapshot==='object' && !Array.isArray(c.snapshot)
  && typeof c.snapshotHash==='string' && inputHash(c.snapshot)===c.snapshotHash;
}
export const contentHash=p=>inputHash(Object.fromEntries(Object.entries(p).filter(([k])=>!['status','verification'].includes(k))));
const selection=c=>Object.fromEntries(['mode','orderIds','startMinute','endMinute','priority','enabledRuleIds'].map(k=>[k,c[k]]));
// A replay checks the supported scheduler contract, not an independent proof of
// all business rules. Independently recheck the three available R1 invariants.
export function reviewPlan(s,p,now=new Date().toISOString()){
 const blockers=[],add=(code,message)=>blockers.push({code,message});
 const run=s.runs?.find(r=>r.id===p.runId),trial=p.trialId?s.trials?.find(t=>t.id===p.trialId):null;
 const original=s.inputVersions?.[p.inputVersionId];
 if(!run||!['completed','partial'].includes(run.status)||run.planId!==p.id||p.copiedResult)add('invalid_run','只接受本方案已完成的服务端运行结果，复制后须重新计算');
 if(!original||inputHash(original.data)!==p.inputVersionId||!run||inputHash({conditions:run.conditions,executionData:run.executionData})!==p.snapshotHash||run.snapshotHash!==p.snapshotHash||run.inputVersionId!==p.inputVersionId||inputHash(p.conditions)!==inputHash(run.conditions))add('history_unavailable','原始输入或运行快照缺失、不一致');
 if(p.revision!==(trial||s).revision||run?.revision!==p.revision||p.inputVersionId!==inputHash((trial||s).data)||p.inputVersionId!==inputHash(s.data)||trial?.status==='discarded')add('stale_input','输入或试算已变化；须按当前事实重算、复核并重新提交');
 if(!p.resultAssessment||!p.ruleSnapshot||!Array.isArray(p.tasks)||!p.tasks.length)add('unchecked_result','缺少结果、规则检查或已排任务');
 const unplanned=structuredClone(p.resultAssessment?.tasks?.filter(t=>t.status==='unplanned')||[]);
 const scheduled=new Set((p.tasks||[]).map(t=>t.id));
 // Only explicitly understood absence reasons can be accepted as partial work.
 const partialCode=/^UNPLANNED \/ (HORIZON|CALENDAR|PREDECESSOR|MATERIAL|PERSONNEL|JOINT_RESOURCE)$/;
 for(const f of p.findings||[])if(!partialCode.test(f.code)||!f.taskIds?.length||f.taskIds.some(id=>scheduled.has(id)||!unplanned.some(t=>t.id===id)))add('rule_conflict',f.message||'存在规则冲突或未支持的未排语义');
 if(unplanned.some(t=>!t.reasons?.length||t.reasons.some(r=>['unknown','unresolved'].includes(r.classification))||t.quantity==null||!t.unit)||p.resultAssessment?.orders?.some(o=>o.status==='unknown-route'))add('unknown_demand','未排数量、原因或路线未知，不能确认');
 if(p.deliveryAssessment?.active)for(const order of p.deliveryAssessment.orders||[])if(order.reasons?.some(r=>!['INCOMPLETE','NO_REMAINING_WORK','POST_COMPLETION_WAIT','SIMULATED_QUALITY_READY'].includes(r.code)))add('delivery_condition_blocked','已启用交付规则存在质量、效期、关键数据或未支持条件，不能确认');
 if((p.conditions?.orderIds||[]).some(id=>{const o=s.data.orders.find(o=>o['订单编号']===id);return s.data.routes.some(r=>r['产品编号']===o?.['产品编号']&&r['最大等待分钟']?.trim());}))add('unsupported_semantics','路线最大等待目前仅支持草稿检查与缺口报告；主管确认链路未验收，不能确认');
 for(const [type,flag] of [['工装','MOLD'],['空间','STORAGE']])if(!p.jointResourceChecks?.[flag]&&[...(s.data.dependencies||[]),...(s.data.resourceClaims||[])].some(r=>p.conditions?.orderIds?.includes(r['订单编号'])&&r['资源类型']===type))add('unchecked_resource','已声明资源条件未检查，不能确认');
 let checks=null;
 if(!blockers.length){
  try{
   if(run.conditions.mode!=='supported')add('unchecked_rules','最小模式未检查已启用日历等条件，不能确认');
   const fresh=run.conditions.taskPositions?freezePositions(s.data,run.conditions,run.conditions.taskPositions,run.createdAt):freezeRunInput(s.data,selection(run.conditions),run.createdAt);
   if(fresh.snapshotHash!==run.snapshotHash)add('changed_conditions','运行条件不再匹配当前输入');
   if(s.data.orders.some(o=>o['需求类型']==='正式订单'&&o['订单状态']==='有效'&&Number(o['合格需求'])>Number(o['已完成合格数量']||0)&&!run.conditions.orderIds.includes(o['订单编号'])))add('unlisted_demand','当前有效需求未全部纳入计算范围；须纳入重算并明示未排清单');
   const current=assessRules(fresh.executionData,now,true,run.conditions.mode);
   if(validateInputs(defs,s.data).length||current.issues.length)add('invalid_configuration','当前关键输入或规则配置检查未通过');
   if(inputHash(current.settings)!==inputHash(p.ruleSnapshot.settings))add('rule_effectivity_changed','规则生效状态已变化，须另开运行并重新提交');
   const enabled=s.data.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']);
   if(enabled.some(id=>!run.conditions.enabledRuleIds.includes(id)))add('unchecked_rules','本次运行遗漏当前启用规则');
   const replay=calculate(run.executionData,run.revision,run.createdAt,run.conditions);
   for(const key of Object.keys(replay).filter(k=>!['id','name','createdAt'].includes(k)))if(inputHash(replay[key])!==inputHash(p[key])){add('result_mismatch','结果与原始输入、条件和规则重新检查不一致');break;}
   checks=independentlyVerifyPlan(p,run.executionData.orders,run.executionData.routes,p.rules,now,run.executionData,run.conditions);
   if(Object.values(checks.checks).some(c=>c.status==='problem')||checks.findings.length)add('independent_conflict','独立复核发现冲突');
   if(checks.checks.lineScope.status!=='pass'||checks.checks.machineOverlap.status!=='pass')add('unchecked_result','独立复核未完成');
   // A route without predecessors has no precedence edges; that is vacuous,
   // while a missing route is unsupported and must fail closed.
   if(checks.checks.precedence.status==='not_checked'&&p.tasks.some(t=>!run.executionData.routes.some(r=>r['产品编号']===t.productId&&r['工序编号']===t.operation)||run.executionData.routes.some(r=>r['产品编号']===t.productId&&r['工序编号']===t.operation&&r['前序工序'])))add('unchecked_result','工序先后关系未完成复核');
  }catch{add('unsupported_check','无法按保存语义重查；不推断检查通过');}
 }
 if(!p.verification||p.verification.contentHash!==contentHash(p))add('verification_required','请先执行服务端独立复核后再提交');
 const workflow=s.workflows?.[p.id]||{revision:0,state:p.status==='draft'?'draft':p.status,events:[]};
 const report={planId:p.id,contentHash:contentHash(p),inputVersionId:p.inputVersionId,snapshotHash:p.snapshotHash,revision:s.revision,workflowRevision:workflow.revision,workflowState:workflow.state,submissionId:workflow.submission?.id||null,blockers,unplanned,conditionalSupply:structuredClone(p.supplyConditions||[]),delivery:structuredClone(p.deliveryAssessment||null),ruleChecks:structuredClone(p.ruleSnapshot||null),independentChecks:checks,changeReasons:(s.records||[]).filter(r=>[p.id,p.runId].includes(r.target)||r.toVersion===p.inputVersionId),limits:p.conditions?.checkScope?.unchecked||[],scope:'仅本系统模拟计划；重放已有支持规则及独立单线/机器/顺序复核；不代表完整业务可执行或真实质量放行'};
 // checkedAt is evidence of this inspection, not part of the concurrency token.
 const hashable=structuredClone(report);if(hashable.independentChecks)delete hashable.independentChecks.checkedAt;
 return {...report,reviewHash:inputHash(hashable)};
}
