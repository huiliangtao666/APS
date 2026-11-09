import {workbookQueryBoundContext} from './workbook-query-report-context.mjs';
import {scheduleCapacityAnalysis} from './schedule-capacity-analysis.mjs';
export function registerScheduleCapacity(router,ctx){
 router.post('/schedule-capacity',ctx.permission('read'),(req,res)=>{try{
  if(Object.keys(req.body).some(k=>!['identity','day','reason'].includes(k)))throw Error('瓶颈分析请求包含未知字段');
  const v=workbookQueryBoundContext(ctx,req.body.identity,ctx.actorKey(req));if(!v.run)throw Error('请指定冻结运行');
  const result=scheduleCapacityAnalysis(v,req.body),state=ctx.read(),plan=(state.urgentPlans||[]).find(p=>p.headRunId===v.run.id);
  result.execution={hasPlan:!!plan,planRevision:plan?.revision,observationDate:plan?new Date(Date.parse(v.identity.dayZero+'T00:00:00Z')+plan.facts.observationDay*86400000).toISOString().slice(0,10):null,statuses:plan?Object.fromEntries(['not_started','started','completed','locked'].map(s=>[s,plan.facts.tasks.filter(t=>t.status===s).length])):null};
  result.canSimulate=v.run.result.verification?.status==='pass'&&!v.run.result.verification?.notChecked?.length&&(!v.run.solver?.actual||v.run.solver.actual==='basic')&&(!v.run.solver?.requested||v.run.solver.requested==='basic');
  result.simulationBlock=result.canSimulate?'':'需使用独立检查通过的按天基础求解器运行；CP-SAT结果不会被静默改用其他求解器。';
  const body=JSON.stringify(result);if(Buffer.byteLength(body)>2*1024*1024)return res.status(413).json({error:'CAPACITY_RESPONSE_LIMIT',message:'瓶颈明细较多，超过本次响应容量；请缩小原排程范围后分析。'});
  res.type('application/json').send(body);
 }catch(e){res.status(e.status||422).json({error:e.code||'SCHEDULE_CAPACITY_INVALID',message:e.status===409?'冻结来源已变化，请重新选择运行后分析。':e.message});}});
}
