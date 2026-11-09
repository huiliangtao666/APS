export function scenarioCreateProblems({run,plan,name,observed,assertUnstarted,maximum,seconds,budgetSource}){
 const daily=run?.result?.timeUnit==='day',issues=[];
 if(!run?.result||!['completed','partial'].includes(run.status)||run.result.verification?.status!=='pass')issues.push('请选择独立检查通过的已保存基线运行');
 if(!String(name||'').trim())issues.push('填写对比组名称');
 if(!Number.isSafeInteger(Number(maximum))||Number(maximum)<1)issues.push('情景容量须为正整数');
 if(!Number.isSafeInteger(Number(seconds))||Number(seconds)<1||daily&&Number(seconds)>90)issues.push(daily?'单情景试算秒数须为1—90的整数':'单情景试算秒数须为正整数');
 if(!String(budgetSource||'').trim())issues.push('填写试算额度依据');
 if(!plan){if(!observed)issues.push(daily?'选择观察日期':'选择观察时刻');if(!assertUnstarted)issues.push('确认基线全部任务未开工、无实际交付耗料和锁定供给；已有执行事实时请先选择已保存事实的计划');}
 return issues;
}
export function scenarioCreatePayload(values){
 const issues=scenarioCreateProblems(values);if(issues.length)throw Error('无法创建：'+issues.join('；')+'。');
 const {run,plan,name,observed,maximum,seconds,budgetSource}=values,daily=run.result.timeUnit==='day';
 return {runId:run.id,expectedResultHash:run.resultHash,name:name.trim(),config:{maxScenarios:Number(maximum),runSeconds:Number(seconds),budgetSource:budgetSource.trim()},...(plan?{planRevision:plan.revision}:{facts:{...(daily?{observationDate:observed}:{observationTime:observed+':00+08:00'}),tasks:run.result.tasks.map(t=>({id:t.id,status:'not_started',...(daily?{completionPercent:0}:{})})),completed:Object.fromEntries(run.result.demandResults.map(r=>[r.id,0]))}})};
}
