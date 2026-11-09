export type UrgentSchedulingIssue={message:string;action?:'strategy'|'events'|'trace'|'upload'};
export function urgentSchedulingIssues({canWrite,busy,plan,dialog,dirtySections}:{canWrite:boolean;busy:boolean;plan:any;dialog:string|null;dirtySections:string[]}):UrgentSchedulingIssue[]{
 const issues:UrgentSchedulingIssue[]=[];
 if(!canWrite)issues.push({message:'当前账号没有编辑权限，不能启动插单排程。'});
 if(busy)issues.push({message:'正在处理当前操作，请等待完成。'});
 if(dialog)issues.push({message:'请先完成或放弃当前弹窗中的编辑。'});
 const labels:Record<string,string>={manual:'需求录入草稿',policy:'插单策略',trace:'批次追溯'};
 for(const key of dirtySections)issues.push({message:`${labels[key]||'当前页面'}有未保存的编辑，请先保存或放弃。`,action:key==='policy'?'strategy':key==='trace'?'trace':'events'});
 if(!plan)issues.push({message:'请先选择已保存的插单计划，或核对执行事实后建立计划上下文。'});
 else{
  if(!plan.workspace)issues.push({message:'当前计划尚未保存插单策略。请在“策略与影响”中核对冻结截止日期和修复范围，再点击保存策略。顶部“本次候选策略”仅覆盖本次计算的策略，不能代替这一步。',action:'strategy'});
  if(!plan.batches.some((batch:any)=>batch.status!=='withdrawn'))issues.push({message:'当前计划没有可用的插单批次，请先提交需求并确认生效。',action:'upload'});
 }
 return issues;
}
export function UrgentSchedulingNotice({issues,onAction}:{issues:UrgentSchedulingIssue[];onAction:(action:NonNullable<UrgentSchedulingIssue['action']>)=>void}){
 if(!issues.length)return null;
 const actions={strategy:'前往策略配置',events:'前往需求草稿',trace:'前往批次追溯',upload:'提交插单需求'};
 return <section className="urgent-scheduling-notice" aria-label="插单排程待完成事项"><b>插单排程暂不可用</b>{issues.map((issue,index)=><p key={index}>{issue.message}{issue.action&&<button type="button" onClick={()=>onAction(issue.action!)}>{actions[issue.action]}</button>}</p>)}</section>;
}
