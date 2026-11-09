import {factStatusNames,type UrgentFactProblem} from './lib/urgent-fact-problems.mjs';
export function UrgentFactProblems({problems,onLocate}:{problems:UrgentFactProblem[];onLocate:(problem:UrgentFactProblem)=>void}){
 if(!problems.length)return null;
 return <section className="urgent-fact-problems" role="alert" aria-label="执行事实校验说明"><b>有 {problems.length} 项信息需要修改，尚未保存</b><p>{problems[0].title}：{problems[0].reason}</p><p>处理办法：{problems[0].action}</p>
  <details open={problems.length<=5}><summary>查看全部问题及处理办法（{problems.length}）</summary><div className="urgent-scroll"><table><thead><tr><th>相关任务 / 信息</th><th>具体原因</th><th>如何处理</th><th>操作</th></tr></thead><tbody>{problems.map((p,index)=><tr key={index}><td>{p.taskId||p.demandId||p.title}{p.taskId&&p.demandId&&<><br/>需求 {p.demandId}</>}{p.status&&<><br/>{factStatusNames[p.status]||p.status}</>}{p.observedDate&&<><br/>观察日 {p.observedDate}<br/>开始日 {p.startDate}<br/>结束所在日 {p.endDate}</>}{p.supplyId&&<><br/>供给 {p.supplyId}</>}</td><td>{p.reason}</td><td>{p.action}</td><td>{p.section&&<button type="button" onClick={()=>onLocate(p)}>定位修改</button>}</td></tr>)}</tbody></table></div></details>
 </section>;
}
