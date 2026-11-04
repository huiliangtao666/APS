import {spawn} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SolverProblem,RAW_STATUSES} from './contract.mjs';
import {validateMinuteModel} from './model.mjs';

export const ORTOOLS_VERSION='9.15.6755';
const runnerFile=fileURLToPath(new URL(import.meta.url.endsWith('/solver-choice/runner.mjs')?'./cp_sat.py':'./solver-choice/cp_sat.py',import.meta.url));
// Call from the application slot owner, not inside a disposable Node Worker:
// killing a worker thread cannot reliably reap a native subprocess it spawned.
export async function runCpSat(input,{python,budget,signal,maxInputBytes,maxOutputBytes,stopGraceSeconds,onOwned=()=>{},onReleased=()=>{}}){
 const model=validateMinuteModel(input);
 if(!python||!isAbsolute(python))throw new SolverProblem('CP_ENVIRONMENT_UNAVAILABLE','尚未核实应用容器内的CP-SAT解释器绝对路径');
 if(!budget||![budget.solveSeconds,budget.totalSeconds,budget.deliverySeconds,budget.checkSeconds,stopGraceSeconds].every(x=>Number.isFinite(x)&&x>0)||budget.solveSeconds+budget.deliverySeconds+budget.checkSeconds>budget.totalSeconds||stopGraceSeconds>budget.deliverySeconds)throw new SolverProblem('CP_RUNTIME_BUDGET_INVALID','执行与停止预算须来自已核运行合同');
 if(![maxInputBytes,maxOutputBytes].every(x=>Number.isSafeInteger(x)&&x>0))throw new SolverProblem('CP_RUNTIME_LIMITS_MISSING','缺少受控模型及结果字节上限');
 if(signal?.aborted)throw new SolverProblem('CP_CANCELLED','计算已取消');
 const body=JSON.stringify({model,solveSeconds:budget.solveSeconds});
 if(Buffer.byteLength(body)>maxInputBytes)throw new SolverProblem('CP_MODEL_LIMIT','冻结模型超过批准字节上限');
 return await new Promise((resolve,reject)=>{
  let child,closed=false,reason=null,output='',bytes=0,timer,killTimer,spawnError=null;
  const stop=why=>{
   reason??=why;if(closed||!child?.pid)return;
   // Only this child handle is owned. No global PID/CID/name matching or
   // signals to parent workers, other containers, services, or process groups.
   child.kill('SIGTERM');
   killTimer??=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},stopGraceSeconds*1000);
  };
  const abort=()=>stop('CP_CANCELLED');
  try{child=spawn(python,['-I','-B',runnerFile],{stdio:['pipe','pipe','pipe'],shell:false,env:{PATH:process.env.PATH,LANG:'C.UTF-8',PYTHONDONTWRITEBYTECODE:'1'}});}catch{reject(new SolverProblem('CP_ENVIRONMENT_UNAVAILABLE','CP-SAT进程无法创建'));return;}
  child.on('spawn',()=>{try{onOwned({pid:child.pid,engine:'cp-sat'});}catch{stop('CP_OWNERSHIP_RECORD_FAILED');}if(reason)stop(reason);});
  child.on('error',error=>{spawnError=error;});
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxOutputBytes){stop('CP_OUTPUT_LIMIT');return;}output+=chunk.toString('utf8');});
  // Native diagnostics may contain paths/input. Drain with no retention and
  // bound their total bytes just as stdout to avoid a blocked pipe or flooding.
  child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxOutputBytes)stop('CP_OUTPUT_LIMIT');});
  child.stdin.on('error',()=>{stop('CP_INPUT_DELIVERY_FAILED');});
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  timer=setTimeout(()=>stop('CP_TOTAL_PROTECTION_TIMEOUT'),(budget.totalSeconds-budget.checkSeconds-stopGraceSeconds)*1000);
  child.on('close',(code,exitSignal)=>{
   closed=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);
   try{onReleased({pid:child.pid??null,owned:0,pending:0});}catch{return reject(new SolverProblem('CP_RELEASE_RECORD_FAILED','原生进程已关闭，释放记录失败'));}
   if(reason)return reject(new SolverProblem(reason,reason==='CP_CANCELLED'?'计算已取消；候选未采用':'执行停止且未可靠交付候选；不代表模型不可行'));
   if(spawnError||code!==0||exitSignal)return reject(new SolverProblem('CP_ENVIRONMENT_ERROR','CP-SAT依赖/进程异常；没有自动回退'));
   let response;try{response=JSON.parse(output);}catch{return reject(new SolverProblem('CP_RESULT_DELIVERY_INVALID','未可靠取得完整求解结果'));}
   if(response.kind==='cancelled')return reject(new SolverProblem('CP_CANCELLED','原生计算已取消；未采用候选'));
   if(response.engine!=='cp-sat'||response.version!==ORTOOLS_VERSION||response.modelHash!==model.modelHash||!RAW_STATUSES.includes(response.rawStatus)||response.workers!==1||response.solveSeconds!==budget.solveSeconds||JSON.stringify(response.objective)!==JSON.stringify(model.objective)||!Number.isFinite(response.wallSeconds)||response.wallSeconds<0)return reject(new SolverProblem('CP_RESULT_IDENTITY_MISMATCH','请求模型/引擎/版本/预算与实际结果不一致'));
   const feasible=['OPTIMAL','FEASIBLE'].includes(response.rawStatus);
   if(feasible!==Boolean(response.candidate))return reject(new SolverProblem('CP_CANDIDATE_MISMATCH','原始状态与候选交付不符'));
   resolve(response);
  });
  child.stdin.end(body);
 });
}
