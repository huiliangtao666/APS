import {urgentRunEligibility} from './lib/urgent-run-eligibility.mjs';

export function UrgentBaselineNotice({run,onWorkflow}:{run:any;onWorkflow?:()=>void}){
 const check=urgentRunEligibility(run);
 return <div className="urgent-baseline-notice" role="status">
  <p>{check.message}</p>
  {!check.eligible&&onWorkflow&&<button onClick={onWorkflow}>返回排程流程</button>}
 </div>;
}
