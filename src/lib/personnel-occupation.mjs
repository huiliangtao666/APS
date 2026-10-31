// H-P04 is explicit per dependency (order, operation, post/phase). Old rows keep
// their saved participation-only contract; extensions never get inferred values.
export const occupationOrders=['先扩展占用再检查可用性','先检查可用性再扩展占用'];
export const occupationScopes=['参与窗口','完整工序'];
export const occupationFields=['人员占用基准','人员检查顺序','人员配置来源','人员配置版本'];
const minute=v=>typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)<=525600;
export const hasOccupation=r=>occupationFields.some(k=>String(r[k]??'').trim())||['提前占用分钟','后延占用分钟'].some(k=>r[k]!==undefined&&r[k]!==''&&r[k]!=='0');
export function occupationErrors(r){
 if(!hasOccupation(r))return [];
 const errors=[];
 for(const k of ['提前占用分钟','后延占用分钟'])if(!minute(r[k]))errors.push([k,'人员窗外占用须显式填写0–525600整数分钟；不补默认值']);
 if(!occupationScopes.includes(r['人员占用基准']))errors.push(['人员占用基准','显式选择参与窗口或完整工序；不推定适用范围']);
 if(!occupationOrders.includes(r['人员检查顺序']))errors.push(['人员检查顺序','须显式选择两种受支持顺序；最终均检查完整占用']);
 for(const k of ['人员配置来源','人员配置版本'])if(typeof r[k]!=='string'||!r[k].trim()||r[k]!==r[k].trim())errors.push([k,'须填写可追溯的配置来源及版本']);
 return errors;
}
export function occupationInterval(r,start,end){
 const errors=occupationErrors(r);if(errors.length)throw Error(errors.map(([k,m])=>k+' '+m).join('；'));
 const configured=hasOccupation(r),whole=r['窗口外释放']==='否'||r['人员占用基准']==='完整工序';
 const baseStart=whole?start:start+Number(r['人员开始偏移']||0),baseEnd=whole?end:end-Number(r['人员结束偏移']||0);
 return {baseStart,baseEnd,start:baseStart-(configured?Number(r['提前占用分钟']):0),end:baseEnd+(configured?Number(r['后延占用分钟']):0),configured};
}

// Saved-result diagnostics, independent of allocation and occupationInterval.
// Validate the actual full ledger window even for availability-before-extension.
// No candidate search and no reconstruction of an alternative schedule.
export function personnelWindowFindings(plan,data,conditions){
 const findings=[],tasks=plan.tasks||[];
 const refs=(table,rows)=>rows.map(row=>({table,row:{...row},occurrence:{index:(data[table]||[]).indexOf(row),logicalRow:(data[table]||[]).indexOf(row)+2}}));
 for(const r of (plan.resourceReservations||[]).filter(r=>r.type==='人员')){
  if(!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.end<=r.start)continue;
  const linked=tasks.filter(t=>(r.taskIds||[r.taskId]).includes(t.id));
  const g=(data.personnelGroups||[]).find(g=>g['人员组编号']===r.resourceId);if(!g||!linked.length)continue;
  for(const task of linked){
   const dependencies=(data.dependencies||[]).filter(d=>d['资源类型']==='人员技能'&&d['订单编号']===task.orderId&&d['工序编号']===task.operation&&(d['候选人员组']?.trim()?d['候选人员组'].split(/[,，]/).map(s=>s.trim()):[d['资源编号']]).includes(r.resourceId)&&d['所需技能']===r.requiredSkill);
   const machine=(data.machines||[]).find(m=>m['设备编号']===task.machine),calendarId=machine?.['日历编号']?.trim()||data.calendars?.[0]?.['日历编号'];
   const calendar=(data.calendars||[]).filter(c=>c['日历编号']===calendarId),stops=(data.resourceStops||[]).filter(s=>s['资源类型']==='人员'&&s['资源编号']===r.resourceId);
   const sources=[...refs('dependencies',dependencies),...refs('personnelGroups',[g]),...refs('machines',machine?[machine]:[])];
   const add=(reason,rows=[])=>findings.push({code:'VERIFY / PERSONNEL_WINDOW',message:`${task.id} 人员 ${r.resourceId} 完整实际占用 [${r.start},${r.end})：${reason}`,taskIds:[task.id],relatedRecords:[...sources,...rows],interval:{kind:'personnel-window',type:'人员',resourceId:r.resourceId,start:r.start,end:r.end,demand:Number(r.quantity),unit:'人',taskIds:[task.id]},evidence:{ledger:r,ruleEvaluationAt:conditions.ruleEvaluationAt,inputVersionId:plan.inputVersionId??null,snapshotHash:plan.snapshotHash??null,basis:'直接复核冻结配置与完整实际占用；两种H-P04处理顺序均不豁免最终可用性/班次检查'}});
   if(r.start<Number(g['可用起始分钟'])||r.end>Number(g['可用结束分钟']))add(`超出可用期 [${g['可用起始分钟']},${g['可用结束分钟']})`);
   if(dependencies.some(d=>d['所需班次']&&d['所需班次']!==g['班次']))add(`所需班次与组班次 ${g['班次']} 不符`);
   if(conditions.workingWindowsContract==='P06-windows-v1'){
    if(!calendar.some(c=>c['是否工作']==='是'&&Number(c['起始分钟'])<=r.start&&Number(c['结束分钟'])>=r.end))add('未落在单个工厂工作窗口，禁止机器自动运行时段推定人员跨班',refs('calendars',calendar));
    const blocked=[...calendar.filter(c=>c['是否工作']!=='是'),...stops].filter(s=>Number(s['起始分钟'])<r.end&&Number(s['结束分钟'])>r.start);
    if(blocked.length)add('与冻结非工作/人员停用例外重叠',[...refs('calendars',blocked.filter(s=>calendar.includes(s))),...refs('resourceStops',blocked.filter(s=>stops.includes(s)))]);
   }
  }
 }
 return findings;
}
