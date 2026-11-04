import {calculateWorkbook,verifyWorkbookPlan} from '../workbook-plan.mjs';
import {minuteMode,MINUTE_ENGINE} from '../workbook-minute.mjs';
import {cloneForParameters} from '../workbook-workbench.mjs';
import {refreshDerived,rows} from '../workbook-model.mjs';
import {solverRequest,solverBudget,requireCoverage,interpretSolver,fingerprint,SolverProblem,SOLVER_CONTRACT} from './contract.mjs';
import {validateMinuteModel} from './model.mjs';
import {checkMinuteCandidate} from './checker.mjs';
import {runCpSat} from './runner.mjs';

// Deliberately not registered on the public router during the static phase.
// Compiler/decoder are internal application-owned dependencies, never request
// fields or user-supplied model JSON. Readiness and start use the same function.
export function freezeSolverConditions({body,input,selection,effectiveBudget,coverage,availability}){
 const request=solverRequest(body),budget=request.requested==='cp-sat'?solverBudget(request,effectiveBudget):effectiveBudget??null;
 if(request.requested==='cp-sat'){
  if(!minuteMode(input))throw new SolverProblem('CP_TIME_CONTRACT_UNSUPPORTED','CP-SAT须采用现有整数分钟生产合同，不能粗化为日或半小时');
  requireCoverage(coverage);
  if(availability?.available!==true||!availability.version||!availability.checkedAt||!availability.environmentHash)throw new SolverProblem('CP_ENVIRONMENT_UNAVAILABLE','真实CP-SAT环境尚未就绪',{availability});
 }
 const frozen={contract:SOLVER_CONTRACT,request,budget,objective:{kind:'feasibility',source:'本CR不新增优化目标；复用现有业务规则，不将排序变成隐藏最短工期'},coverage:coverage?structuredClone(coverage):null,inputHash:fingerprint(input),selection:structuredClone(selection),selectionHash:fingerprint(selection),availability:request.requested==='cp-sat'?structuredClone(availability):null};
 return {...frozen,conditionsHash:fingerprint(frozen)};
}

export async function executeFrozenSolver({input,conditions,compiler,decoder,runtime,signal}){
 const {conditionsHash,...content}=conditions;
 if(fingerprint(content)!==conditionsHash||fingerprint(input)!==conditions.inputHash)throw new SolverProblem('SOLVER_FROZEN_CHANGED','冻结输入或求解条件已变化');
 const selection=structuredClone(conditions.selection),began=Date.now(),startedAt=new Date(began).toISOString();
 let plan,solver;
 if(conditions.request.requested==='basic'){
  plan=calculateWorkbook(input,selection);
  solver={requested:'basic',actual:'basic',version:minuteMode(input)?MINUTE_ENGINE:'workbook-day-v1',rawStatus:null,rawStatusMeaning:'基础引擎未使用CP-SAT原始状态',objective:conditions.objective};
 }else{
  if(typeof compiler!=='function'||typeof decoder!=='function')throw new SolverProblem('WORKBOOK_CP_COMPILER_NOT_READY','现有工作簿数量/批处理/物料/执行事实到CP模型及结果的同义适配尚未完成，不允许直接提交模型替代');
  const compiled=await compiler(structuredClone(input),selection,conditions),model=validateMinuteModel(compiled);
  if(model.source.inputHash!==conditions.inputHash||model.source.selectionHash!==conditions.selectionHash)throw new SolverProblem('CP_MODEL_SOURCE_CHANGED','编译模型与冻结输入/范围不符');
  requireCoverage(model.rules);
  const response=await runCpSat(model,{...runtime,budget:conditions.budget,signal});
  solver={requested:'cp-sat',actual:response.engine,version:response.version,rawStatus:response.rawStatus,stopReason:response.reason,modelHash:response.modelHash,objective:response.objective,wallSeconds:response.wallSeconds,workers:response.workers};
  if(!response.candidate)return {plan:null,solver:{...solver,...interpretSolver(response.rawStatus),startedAt,finishedAt:new Date().toISOString(),budget:conditions.budget},conditionsHash};
  const modelCheck=checkMinuteCandidate(model,response.candidate);
  if(modelCheck.status!=='pass')throw new SolverProblem('CP_INDEPENDENT_MODEL_CHECK_FAILED','原生候选未通过独立模型检查',{issues:modelCheck.issues});
  plan=await decoder(structuredClone(input),selection,response.candidate,model);
  solver.modelCheck=modelCheck;
 }
 if(signal?.aborted)throw new SolverProblem('CP_CANCELLED','计算取消后未采用候选');
 if(fingerprint(input)!==conditions.inputHash||fingerprint(plan.conditions)!==fingerprint({...selection,interval:'[start,end)'}))throw new SolverProblem('SOLVER_RESULT_SOURCE_CHANGED','候选输入或条件与冻结身份不一致');
 if(!['completed','partial'].includes(plan.status)||!Array.isArray(plan.demandResults)||!plan.demandResults.length)throw new SolverProblem('SOLVER_BUSINESS_COVERAGE_MISSING','结果未覆盖选中业务范围');
 if(plan.source?.datasetId!==input.id||plan.source?.version!==input.version||plan.source?.fileHash!==input.fileHash||plan.source?.mappingHash!==fingerprint(input.mapping)||plan.source?.parameterHash!==fingerprint(rows(input,'配置参数')))throw new SolverProblem('SOLVER_RESULT_SOURCE_CHANGED','结果数据集/版本/文件/映射/参数来源与冻结身份不一致');
 const verification=verifyWorkbookPlan(refreshDerived(cloneForParameters(input),selection.startDay),plan);
 if(verification.status!=='pass'||!Array.isArray(verification.notChecked)||verification.notChecked.length)throw new SolverProblem('SOLVER_BUSINESS_CHECK_FAILED','候选未通过相同的独立业务检查',{issues:verification.issues,notChecked:verification.notChecked});
 plan.verification=verification;
 solver={...solver,startedAt,finishedAt:new Date().toISOString(),durationMs:Date.now()-began,budget:conditions.budget,coverage:plan.demandSummary,independentCheck:verification,conditionsHash};
 // Save this immutable projection with the run and include it in the existing
 // native export. Never relabel the business minute-schema engineIdentity or
 // backfill missing metadata in historical runs.
 return {plan,solver,conditionsHash};
}
