type Choice='basic'|'cp-sat';
type Budget={solveSeconds:number;source:string;version:string};
export type SolverSelection={solver:Choice;solverMaxSeconds?:number};
type Availability={available:boolean;reason?:string};
// Controlled by the current trial's owner. No local/session storage or global
// preference: callers initialize a new blank trial to {solver:'basic'}.
export function SolverChoice({value,onChange,budget,availability,disabled=false}:{value:SolverSelection;onChange:(next:SolverSelection)=>void;budget?:Budget;availability?:Availability;disabled?:boolean}){
 return <fieldset disabled={disabled}><legend>本次生产计划求解器</legend>
  <label>求解器<select aria-label="生产计划求解器" value={value.solver} onChange={e=>onChange({solver:e.target.value as Choice})}><option value="basic">基础求解器（默认）</option><option value="cp-sat">CP-SAT</option></select></label>
  {value.solver==='cp-sat'&&<><p>可行性求解。按相同冻结输入和必要业务约束计算，结果仍须独立检查。</p>
   {budget?<label>最大求解时长（秒）<input aria-label="最大求解时长（秒）" type="number" min="0" max={budget.solveSeconds} step="any" value={value.solverMaxSeconds??budget.solveSeconds} onChange={e=>onChange({...value,solverMaxSeconds:e.target.value.trim()?Number(e.target.value):NaN})}/><small>有效预算来源：{budget.source} · {budget.version}；交付及检查另有预留</small></label>:<p role="status">尚未核实有效求解预算，请先检查本次范围。</p>}
   {availability?.available===false&&<p role="status">CP-SAT当前不可用：{availability.reason||'请检查本次范围以定位原因'}。可以主动切换基础求解器，创建新的试算。</p>}
  </>}
 </fieldset>;
}
export function SolverRunSource({solver}:{solver?:any}){
 if(!solver)return <p>历史原流程，未记录求解器版本</p>;
 return <details><summary>实际求解器：{solver.actual==='cp-sat'?'CP-SAT':solver.actual==='basic'?'基础求解器':'未执行'} · {solver.version||'未记录'}</summary><dl><dt>请求选择</dt><dd>{solver.requested}</dd><dt>原始求解状态</dt><dd>{solver.rawStatus||solver.rawStatusMeaning||'未取得'}</dd><dt>停止原因</dt><dd>{solver.stopReason||'原流程记录'}</dd><dt>独立检查</dt><dd>{solver.independentCheck?.status||'未执行'}</dd></dl></details>;
}
