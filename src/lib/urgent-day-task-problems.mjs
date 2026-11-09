import {factDate,factProblem,factStatusNames} from './urgent-fact-problems.mjs';

// Shared by the server and the open form. These checks explain invalid facts;
// choosing a status never silently changes dates, progress or observation day.
export function dayTaskProblems(task,fact,observationDay,{origin='2026-10-31',window,previous}={}){
 const status=fact.status,start=fact.startDay??task.start,end=fact.endDay??task.end,quantity=fact.quantity??task.quantity,changed=!!previous&&previous.status!==status;
 if(!factStatusNames[status])return [];
 const context={taskId:task.id,demandId:task.orderId,section:'task',key:task.id,status,observedDate:factDate(observationDay,origin),startDate:factDate(start,origin),endDate:factDate(Math.ceil(end)-1,origin)};
 const issue=(code,title,reason,action,location='task')=>factProblem(code,title,reason,action,{...context,section:location});
 if(![start,end,quantity].every(n=>typeof n==='number'&&Number.isFinite(n))||end<=start||(quantity<0||quantity===0&&!task.executionPrefix)||quantity>task.quantity||window&&(start<window.startDay||end>window.endDay))return [issue('URGENT_FACT_VALUE','任务日期或数量无效',`任务数量须为不超过 ${task.quantity} 千克的正数（仅已有零产出执行段可为 0），开始、结束须构成窗口内的有效区间。`,'核对任务数量，在任务表的开始、截止日期列检查区间；不要填空值或超出计划窗口。','start')];
 if(Math.abs((end-start)-(task.end-task.start))>1e-8)return [issue('URGENT_FACT_DURATION','任务占用长度被改变','修改后的开始和结束间隔与原任务不同，会改变日产能占用。','在开始或截止日期列调整日期，让系统整体平移区间，保持原占用长度。','start')];
 if(previous&&['started','completed','locked'].includes(previous.status)&&(quantity!==previous.quantity||!changed&&(start!==previous.startDay||end!==previous.endDay)))return [issue('URGENT_FACT_REGRESSION','已保存任务的数量或日期被覆盖','任务数量被修改，或状态不变时改写了已保存的执行/锁定日期。','保留原数量；若为状态误标，明确更正状态并核对日期后保存。','start')];
 const problems=[];
 if(Number.isFinite(observationDay)){
  if(status==='started'&&Math.floor(start)>observationDay)problems.push(issue('URGENT_FACT_INTERVAL','已开工任务的开始日晚于观察日',`选择了“已开工”，但开始日 ${context.startDate} 晚于模拟观察日 ${context.observedDate}；在该观察日任务尚未开始。`,'若确已开工，核对并填写真实开始日期，或核对观察日期是否设早；若尚未开工，改为“未开工”。“可调”仅表示剩余工作可重排。','start'));
  if(status==='completed'&&end>observationDay)problems.push(issue('URGENT_FACT_INTERVAL','已完成任务尚未在观察日前结束',`选择了“已完成”，但结束所在日为 ${context.endDate}，区间结束晚于观察日 ${context.observedDate} 的零点。`,'按天观察按当日零点计算。若确已完成，核对真实开始/结束区间或使用完成后的观察日；否则按实际改为已开工或未开工。','start'));
  if(status==='locked'&&Math.floor(start)<observationDay)problems.push(issue('URGENT_FACT_INTERVAL','未开工锁定任务的开始日已过去',`选择了“已锁定”，但开始日 ${context.startDate} 早于观察日 ${context.observedDate}；锁定表示未开工、未完成。`,'若尚未开工，核对并将其安排到观察日或之后；若实际已经开工或完成，改为对应状态。','start'));
 }
 if(fact.completionPercent!==undefined){
  const percent=fact.completionPercent;
  if(typeof percent!=='number'||!Number.isFinite(percent)||percent<0||percent>100)problems.push(issue('URGENT_COMPLETION_PERCENT','完成比例无效','完成比例须为 0% 至 100% 的数值。','在任务表填写有效完成比例。','progress'));
  else if(status==='completed'&&percent!==100||['not_started','locked'].includes(status)&&percent!==0||status==='started'&&percent>=100)problems.push(issue('URGENT_COMPLETION_PERCENT','完成比例与任务状态不一致',`当前完成比例为 ${percent}%，已完成须为 100%，未开工/已锁定须为 0%，已开工须小于 100%。`,'核对并修改任务状态或完成比例；修改比例不会自动改变状态。','progress'));
  else if(status==='started'&&Math.abs(Number(fact.executedQuantity)-quantity*percent/100)>1e-6)problems.push(issue('URGENT_COMPLETION_PERCENT','完成比例与工序量不一致','按任务数量乘完成比例计算的已完成量，与提交的工序完成量不一致。','重新修改完成比例，让系统同步计算工序完成量。','progress'));
 }
 const progress=status==='completed'?quantity:status==='started'?fact.executedQuantity:0;
 if(status==='started'){
  if(progress===null||progress===undefined||progress==='')problems.push(issue('URGENT_STARTED_PROGRESS','已开工任务缺少工序完成量','尚未填写观察日开始前已完成的工序量，系统不能从状态或计划日期推测。','填写观察日开始前的实际合格工序量；已开工但尚未产出填 0。','progress'));
  else if(typeof progress!=='number'||!Number.isFinite(progress)||progress<0||progress>=quantity)problems.push(issue('URGENT_STARTED_PROGRESS','工序完成量超出已开工状态的范围',`本任务共 ${quantity} 千克，已填完成量 ${typeof progress==='number'&&Number.isFinite(progress)?progress:'无效数值'}；已开工的完成量须大于等于 0 且小于任务总量。`,'填写真实的部分完成量；若全部完成，选择“已完成”并核对完成日期。','progress'));
  else if(progress>0&&start>=observationDay)problems.push(issue('URGENT_STARTED_PROGRESS','观察日前产出与开始日期矛盾',`已填 ${progress} 千克的观察日前完成量，但开始日为 ${context.startDate}，不早于观察日 ${context.observedDate}。`,'若观察日前尚无产出，填 0；若确有产出，核对实际开始日和观察日期。','progress'));
 }
 if(!changed&&previous?.executedQuantity>progress)problems.push(issue('URGENT_FACT_REGRESSION','状态未变但工序完成量减少',`原已完成 ${previous.executedQuantity} 千克，本次填写 ${progress} 千克。`,'保留真实累计完成量；若原状态填错，请明确更正任务状态后再核对相应完成量。','progress'));
 return problems;
}
