import {createHash} from 'node:crypto';

export const SOLVER_CONTRACT='CR-SOLVER-CHOICE-20261103:r1';
export const MODEL_CONTRACT='aps-cpsat-minute-model:v1';
export const ENGINE_IDS=Object.freeze(['basic','cp-sat']);
export const RAW_STATUSES=Object.freeze(['OPTIMAL','FEASIBLE','INFEASIBLE','UNKNOWN','MODEL_INVALID']);
export const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class SolverProblem extends Error {
 constructor(code,message,details={}){super(message);this.name='SolverProblem';this.code=code;this.details=details;}
}
export function solverRequest(body={}){
 const requested=Object.hasOwn(body,'solver')?body.solver:'basic';
 if(!ENGINE_IDS.includes(requested))throw new SolverProblem('SOLVER_INVALID','求解器须为基础求解器或CP-SAT；显式空白不采用默认');
 if(Object.hasOwn(body,'solverMaxSeconds')&&(!Number.isFinite(body.solverMaxSeconds)||body.solverMaxSeconds<=0))throw new SolverProblem('SOLVER_BUDGET_INVALID','最大求解秒数须为正数');
 return {requested,...(Object.hasOwn(body,'solverMaxSeconds')?{maxSeconds:body.solverMaxSeconds}:{})};
}
// All reserves are supplied by the effective server execution contract. No
// business weights, runtime default, or hidden fraction is invented here.
export function solverBudget(request,effective){
 if(!effective||!['totalSeconds','deliverySeconds','checkSeconds'].every(k=>Number.isFinite(effective[k])&&effective[k]>0)||!effective.source||!effective.version)throw new SolverProblem('SOLVER_BUDGET_MISSING','须核实有效总预算及交付、独立检查预留');
 const available=effective.totalSeconds-effective.deliverySeconds-effective.checkSeconds;
 const solveSeconds=request.maxSeconds??available;
 if(!(available>0)||!(solveSeconds>0)||solveSeconds>available)throw new SolverProblem('SOLVER_BUDGET_EXCEEDED','求解预算超过扣除交付与检查预留后的有效上限');
 return {...effective,solveSeconds};
}
// Preserve exact decimal input. Scaling is a lossless engineering conversion,
// not permission to round a business quantity or change its approved precision.
export function scaleDecimals(values,{unit,precision,field}){
 if(typeof unit!=='string'||!unit||!Number.isSafeInteger(precision)||precision<0||precision>15)throw new SolverProblem('QUANTITY_PRECISION_MISSING','缺少量纲或批准精度',{field});
 const factor=10n**BigInt(precision),integers=values.map(v=>{
  const text=String(v),m=/^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(text);
  if(!m)throw new SolverProblem('QUANTITY_NOT_EXACT','数量须为非负十进制原值，不能截断或猜测',{field,value:text});
  const fraction=(m[2]||'').replace(/0+$/,'');
  if(fraction.length>precision)throw new SolverProblem('QUANTITY_PRECISION_EXCEEDED','数量不能按批准精度等价表达',{field,value:text,precision});
  const result=BigInt(m[1])*factor+BigInt(fraction.padEnd(precision,'0')||'0');
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new SolverProblem('QUANTITY_OVERFLOW','数量转换超过安全整数范围',{field,value:text});
  return Number(result);
 });
 return {unit,precision,scale:String(factor),original:values.map(String),integers};
}
export function constraintCoverage(rules){
 if(!Array.isArray(rules)||!rules.length)throw new SolverProblem('CONSTRAINT_COVERAGE_MISSING','缺少冻结的逐规则覆盖');
 const ids=new Set();
 return rules.map(r=>{
  if(!r?.id||ids.has(r.id)||typeof r.enabled!=='boolean'||!r.version||!Array.isArray(r.objects))throw new SolverProblem('CONSTRAINT_DECLARATION_INVALID','规则身份、版本或对象不完整',{rule:r?.id});
  ids.add(r.id);return {...r,state:!r.enabled?'disabled':r.supported===true&&r.dataComplete===true?'supported_enabled':'blocked'};
 });
}
export function requireCoverage(rules){const result=constraintCoverage(rules),blocked=result.filter(r=>r.state==='blocked');if(blocked.length)throw new SolverProblem('CONSTRAINT_UNSUPPORTED','必要约束未支持或输入不完整',{rules:blocked});return result;}

export function interpretSolver(raw,{hasCandidate=false,objective={kind:'feasibility'},coverage=null,check=null}={}){
 if(!RAW_STATUSES.includes(raw))throw new SolverProblem('SOLVER_STATUS_INVALID','未知原始求解状态');
 const feasible=['OPTIMAL','FEASIBLE'].includes(raw);
 if(feasible!==hasCandidate)throw new SolverProblem('SOLVER_CANDIDATE_MISMATCH','原始状态与可靠候选不一致');
 const labels={OPTIMAL:objective.kind==='feasibility'?'找到可行解':'当前声明模型目标已证最优',FEASIBLE:'找到可行解，未证明最优',INFEASIBLE:'当前声明模型/范围/窗口不可行',UNKNOWN:'规定条件内未找到解，未证明不可行',MODEL_INVALID:'模型校验失败'};
 return {rawStatus:raw,label:labels[raw],objective,coverage,independentCheck:check,executable:feasible&&coverage?.complete===true&&coverage?.zeroScheduled!==true&&check?.status==='pass'&&Array.isArray(check.notChecked)&&check.notChecked.length===0};
}
export function solverHistory(run){
 // Missing historical metadata stays missing; never fill with today's version.
 return run?.solver??{requested:null,actual:null,version:null,label:'历史原流程，未记录求解器版本'};
}
export function comparisonConditions(a,b){
 const keys=['inputHash','selectionHash','rulesHash','objectiveHash','budgetHash'];
 const differences=keys.filter(k=>!a?.[k]||!b?.[k]||a[k]!==b[k]);
 return {comparable:differences.length===0,differences,note:differences.length?'条件不同，不能直接比较优劣':'同条件允许不同合法排序，不承诺CP-SAT更快或更优'};
}
