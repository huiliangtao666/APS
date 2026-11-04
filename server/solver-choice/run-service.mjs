import {checkSelection,cloneForParameters} from '../workbook-workbench.mjs';
import {scopeOf,scopeFor} from '../parameter-contract.mjs';
import {rows,refreshDerived,hash} from '../workbook-model.mjs';
import {solverRequest,solverBudget,fingerprint,SolverProblem,comparisonConditions,solverHistory} from './contract.mjs';
import {freezeSolverConditions,executeFrozenSolver} from './workbook-service.mjs';
import {compileWorkbookModel} from './workbook-compiler.mjs';
import {decodeWorkbookCandidate} from './workbook-decoder.mjs';
import {ORTOOLS_VERSION} from './runner.mjs';
import {isAbsolute} from 'node:path';
// Environment comes only from application-owned, verified provisioning. Never
// accept an interpreter, availability claim, coverage or model from an HTTP body.
export function createSolverRunService(ctx){
 const environment=()=>{
  const e=typeof ctx.solverEnvironment==='function'?ctx.solverEnvironment():null;
  if(!e)return {availability:{available:false,reason:'官方应用侧CP-SAT依赖环境未供给'},budget:null,runtime:null};
  if(e.availability?.available!==true)return {...e,availability:{...e.availability,available:false}};
  if(e.availability.version!==ORTOOLS_VERSION||!e.availability.environmentHash||!e.availability.checkedAt||e.runtime?.environmentHash!==e.availability.environmentHash)throw new SolverProblem('CP_ENVIRONMENT_IDENTITY','解释器与已核依赖环境身份不一致');
  if(!isAbsolute(e.runtime?.python||'')||![e.runtime.maxInputBytes,e.runtime.maxOutputBytes].every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isFinite(e.runtime.stopGraceSeconds)||e.runtime.stopGraceSeconds<=0||!(e.runtime.stopGraceSeconds<=e.budget?.deliverySeconds))throw new SolverProblem('CP_RUNTIME_LIMITS_MISSING','依赖回执缺少有效解释器、IO上限或有据停止预留');
  return e;
 };
 const frozenInput=(d,body,actor,selection)=>{
  const next=cloneForParameters(d),scope=scopeFor(next,body.parameterScope,actor);
  if(d.parameterContract){next.tables['配置参数']=rows(next,'配置参数').filter(p=>scopeOf(p)==='dataset'||scopeOf(p)===scope);next.parameterContext={scope,effectiveDay:selection.startDay};delete next.parameterCandidates;delete next.parameterTrials;refreshDerived(next,selection.startDay);}
  return next;
 };
 const freeze=(d,selection,body)=>{
  const request=solverRequest(body);let e;try{e=environment();}catch(error){if(request.requested==='cp-sat')throw error;e={budget:null};}
  if(request.requested==='basic')return freezeSolverConditions({body,input:d,selection,effectiveBudget:e.budget?solverBudget(request,e.budget):null,coverage:null,availability:null});
  const preliminary={inputHash:fingerprint(d),selectionHash:fingerprint(selection),objective:{kind:'feasibility',source:'本CR不新增优化目标；复用现有业务规则，不将排序变成隐藏最短工期'}};
  const model=compileWorkbookModel(d,selection,preliminary);
  return freezeSolverConditions({body,input:d,selection,effectiveBudget:e.budget,coverage:model.rules,availability:e.availability});
 };
 function readiness(d,body,actor){
  const check=checkSelection(d,body,actor);let conditions,request,availability=null,budget=null,modelHash=null;
  try{request=solverRequest(body);let e;try{e=environment();}catch(error){if(request.requested==='cp-sat')throw error;e={budget:null,availability:{available:false,reason:error.message}};}availability=e.availability;if(e.budget)budget=solverBudget({...request,maxSeconds:request.maxSeconds},e.budget);const input=frozenInput(d,body,actor,check.selection);
   if(check.ready){conditions=freeze(input,check.selection,body);if(request.requested==='cp-sat')modelHash=compileWorkbookModel(input,check.selection,conditions).modelHash;}
  }catch(error){check.issues.push({code:error.code||'SOLVER_NOT_READY',severity:'error',sheet:'本次配置',field:'求解器',message:error.message,details:error.details});}
  const token=hash({baseToken:check.token,request:request??null,conditionsHash:conditions?.conditionsHash??null,environment:request?.requested==='cp-sat'?availability:null,modelHash});
  return {...check,ready:check.issues.length===0,token,checkedRef:{...check.checkedRef,solver:request??null,solverConditionsHash:conditions?.conditionsHash??null,modelHash},solver:{request,availability,budget,coverage:conditions?.coverage??null}};
 }
 const saveSolver=(id,solver)=>{const state=ctx.read(),r=state.runs.find(r=>r.id===id);if(r){r.solver=solver;ctx.write(state);}};
 function startCp(run,input,req,finish){
  const controller=new AbortController();let resolveClosed;
  const closed=new Promise(resolve=>resolveClosed=resolve),slot={solver:'cp-sat',cancelRequested:false,terminate:()=>{controller.abort();return closed;}};
  ctx.workers.set(run.id,slot);
  // The slot lives in the application process and holds the exact native child
  // until close. Killing a disposable JS worker cannot orphan the solver.
  Promise.resolve().then(async()=>{
   const e=environment(),fresh=freeze(input,run.selection,{solver:'cp-sat',...(run.solverConditions.request.maxSeconds!==undefined?{solverMaxSeconds:run.solverConditions.request.maxSeconds}:{})});
   if(fresh.conditionsHash!==run.solverConditions.conditionsHash)throw new SolverProblem('SOLVER_READINESS_CHANGED','创建后依赖或预算身份已变化，未执行旧条件');
   const state=ctx.read(),saved=state.runs.find(r=>r.id===run.id);if(!saved||saved.status==='cancelling')throw new SolverProblem('CP_CANCELLED','运行已取消');saved.status='running';saved.startedAt=new Date().toISOString();saved.solver={...saved.solver,actual:null};ctx.write(state);
   const result=await executeFrozenSolver({input,conditions:run.solverConditions,compiler:compileWorkbookModel,decoder:decodeWorkbookCandidate,signal:controller.signal,runtime:{...e.runtime,onSolverResult:solver=>saveSolver(run.id,solver),onOwned:owned=>saveSolver(run.id,{...run.solver,attempted:'cp-sat',expectedVersion:ORTOOLS_VERSION,nativePid:owned.pid,startedAt:new Date().toISOString()}),onReleased:()=>{const s=ctx.read(),r=s.runs.find(r=>r.id===run.id);if(r?.solver){r.solver.nativePid=null;r.solver.nativeClosed=true;ctx.write(s);}}}});
   saveSolver(run.id,result.solver);
   if(controller.signal.aborted)throw new SolverProblem('CP_CANCELLED','已取消，候选不采用');
   if(result.plan){result.plan.solver=result.solver;finish(result.plan.status,result.plan,null);}else finish(result.solver.rawStatus==='MODEL_INVALID'?'failed':'no_solution',null,result.solver.label);
  }).catch(error=>{const solver={...run.solver,actual:null,rawStatus:null,stopReason:error.code||'CP_ENVIRONMENT_ERROR',label:error.message};const state=ctx.read(),saved=state.runs.find(r=>r.id===run.id);if(saved?.solver?.actual==='cp-sat'){solver.actual='cp-sat';solver.version=saved.solver.version;solver.rawStatus=saved.solver.rawStatus;}solver.executable=false;saveSolver(run.id,{...saved?.solver,...solver});finish(error.code==='CP_CANCELLED'?'cancelled':error.code==='CP_TOTAL_PROTECTION_TIMEOUT'?'timed_out':'failed',null,error.message);}).finally(()=>{if(ctx.workers.get(run.id)===slot)ctx.workers.delete(run.id);resolveClosed();});
 }
 function register(router){
  router.get('/runs/:id/solver-export',ctx.permission('export'),ctx.handle((req,res)=>{
   const run=ctx.read().runs.find(r=>r.id===req.params.id);if(!run)return res.status(404).json({error:'run_not_found'});
   if(hash(ctx.snapshot(run.inputRef))!==run.inputHash||run.result&&hash(run.result)!==run.resultHash)return res.status(409).json({error:'frozen_source_corrupt'});
   res.type('application/json').attachment('求解冻结来源-'+run.id+'.json').send(JSON.stringify({contract:'aps-solver-native-source:v1',runId:run.id,inputHash:run.inputHash,resultHash:run.resultHash??null,status:run.status,selection:run.selection,provenance:run.provenance,conditions:run.solverConditions??null,solver:solverHistory(run),failure:run.failure??null},null,2));
  }));
  router.post('/runs/:id/cancel',ctx.permission('calculate'),ctx.handle(async(req,res)=>{
   const state=ctx.read(),run=state.runs.find(r=>r.id===req.params.id);if(!run)return res.status(404).json({error:'run_not_found'});if(!['queued','running','cancelling'].includes(run.status))return res.json({id:run.id,status:run.status,alreadyTerminal:true});
   const slot=ctx.workers.get(run.id);if(!slot)return res.status(409).json({error:'run_owner_unavailable',message:'运行槽不可核实，未伪造释放'});
   if(run.status!=='cancelling'){run.status='cancelling';run.cancelRequestedAt=new Date().toISOString();ctx.audit(state,req,'workbook_cancel_requested',{runId:run.id});ctx.write(state);}
   await (slot.cancelSolverRun?slot.cancelSolverRun():slot.terminate());
   const final=ctx.read(),r=final.runs.find(r=>r.id===run.id);if(r?.status==='cancelling'){r.status='cancelled';r.result=null;r.resultHash=null;r.finishedAt=new Date().toISOString();r.failure='用户取消；未采用候选';if(r.urgentPlanId){const p=final.urgentPlans?.find(p=>p.id===r.urgentPlanId);for(const b of p?.batches||[])if(b.activeRunId===r.id)b.status='cancelled';}if(ctx.workers.get(r.id)===slot)ctx.workers.delete(r.id);ctx.audit(final,req,'workbook_cancelled',{runId:r.id});ctx.write(final);}res.json({id:run.id,status:r?.status});
  }));
  router.get('/runs/:id/solver-comparison',ctx.permission('read'),ctx.handle((req,res)=>{
   const state=ctx.read(),a=state.runs.find(r=>r.id===req.params.id),b=state.runs.find(r=>r.id===String(req.query.other));if(!a||!b)return res.status(404).json({error:'run_not_found'});
   for(const r of [a,b])if(hash(ctx.snapshot(r.inputRef))!==r.inputHash||r.result&&hash(r.result)!==r.resultHash)return res.status(409).json({error:'frozen_source_corrupt'});
   const conditions=comparisonConditions(a.solverConditions,b.solverConditions),summary=r=>({runId:r.id,inputHash:r.inputHash,resultHash:r.resultHash,solver:solverHistory(r),coverage:r.result?.demandSummary??null,demands:r.result?.demandResults??[],tasks:r.result?.tasks??[],allocations:r.result?.allocations??[],findings:r.result?.findings??[]});
   res.json({...conditions,runs:[summary(a),summary(b)],meaning:'按各自基础单位比较；合法排序可不同；不承诺CP-SAT更快或更优'});
  }));
 }
 return {readiness,freeze,startCp,register};
}
