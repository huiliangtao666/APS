import {sourceRefs} from './problem-records.mjs';
import {savedInterval, savedMinute} from './verification-endpoints.mjs';
// Fixed result inspection. No planner, search, allocator, or current input access.
export function verifyCalendar(plan, data, conditions, enabledRules=plan.rules||[]) {
 const findings=[], details=[], inspections=[];
 const refs=(table, rows, field)=>sourceRefs(table,rows,data?.[table]||[]).map(r=>({...r,field}));
 const ruleRows=(data?.rules||[]).filter(r=>r['规则编号']==='CALENDAR');
 const ruleRefs=refs('rules',ruleRows,'是否启用');
 const add=(code,message,task=null,relatedRecords=ruleRefs,evidence={},interval)=>{
  details.push(message);findings.push({code:'VERIFY / CALENDAR_'+code,message,taskIds:task?[task.id]:[],relatedRecords,sourceRead:'frozen-calendar-v1',evidence,...(interval?{interval}:{}),...(!relatedRecords.length?{associationGap:'冻结输入没有可定位的来源记录；不猜测当前数据。'}:{})});
 };
 const finish=status=>({status,details,findings,inspections,ruleId:'CALENDAR',ruleEvaluationAt:conditions?.ruleEvaluationAt??plan.ruleSnapshot?.at??null});
 if(!data||!['orders','machines','calendars','downtime','rules'].every(k=>Array.isArray(data[k]))){details.push('历史缺少冻结日历/订单/设备/停机/规则快照；未检查。');return finish('not_checked');}
 const minimal=(conditions?.mode??plan.ruleSnapshot?.checkScope?.mode)==='minimal-r1';
 const at=conditions?.ruleEvaluationAt??plan.ruleSnapshot?.at;
 if(!at||!Number.isFinite(Date.parse(at))){details.push('缺少冻结规则判定时间；未检查。');return finish('not_checked');}
 if(ruleRows.length!==1)add('RULE','CALENDAR 必须有唯一冻结规则记录。');
 const rule=ruleRows[0];let params;
 try{params=JSON.parse(rule?.['参数JSON']||'{}');if(!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).length)throw Error();}catch{add('RULE','CALENDAR 参数须为受支持的空对象。',null,refs('rules',ruleRows,'参数JSON'));}
 if(rule&&!['是','否'].includes(rule['是否启用']))add('RULE','CALENDAR 启用值无效。');
 const effective=rule?.['生效时间'];
 const validDate=s=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===s.slice(0,10)&&Number(s.slice(11,13))<24&&Number(s.slice(14,16))<60&&Number(s.slice(17,19))<60;
 if(effective&&!validDate(effective))add('RULE','CALENDAR 生效时间未知或无效。',null,refs('rules',ruleRows,'生效时间'));
 if(rule?.['适用对象']&&rule['适用对象']!=='*')add('RULE','CALENDAR 当前仅支持全部对象 *。',null,refs('rules',ruleRows,'适用对象'));
 const active=ruleRows.length===1&&rule['是否启用']==='是'&&(!effective||validDate(effective)&&Date.parse(effective)<=Date.parse(at))&&(!conditions?.enabledRuleIds||conditions.enabledRuleIds.includes('CALENDAR'));
 if(minimal){details.push('minimal-r1 显式未采用 CALENDAR；不是日历通过。');return finish(findings.length?'problem':'not_checked');}
 if(!active)add('RULE','supported 模式 CALENDAR 是必要约束，关闭、未选或延后生效不能视为通过。');
 if(active!==enabledRules.includes('CALENDAR'))add('RULE','结果采用标志与冻结 CALENDAR 配置/选择/生效时刻不一致。');
 if(findings.length)return finish('problem');
 for(const task of plan.tasks||[]){
  const orders=data.orders.filter(r=>r['订单编号']===task.orderId), machines=data.machines.filter(r=>r['设备编号']===task.machine);
  let related=[...ruleRefs,...refs('orders',orders,'产线编号'),...refs('machines',machines,'日历编号')];
  const interval=savedInterval(task);
  const ev={checkedAt:at,taskInterval:interval,requiredContinuousMinutes:interval?interval.end-interval.start:null,halfOpen:true};
  if(!interval){add('TIME',`${task.id} 开始/结束未知或无效；不能核为通过。`,task,related,ev);continue;}
  if(orders.length!==1||machines.length!==1){add('REFERENCE',`${task.id} 缺少唯一订单或设备引用。`,task,related,ev);continue;}
  const machine=machines[0],order=orders[0];
  if(!machine['产线编号']||machine['产线编号']!==order['产线编号']){add('REFERENCE',`${task.id} 订单与设备产线不一致或缺失。`,task,related,ev);continue;}
  const lines=(data.factoryLines||[]).filter(r=>r['产线编号']===machine['产线编号']);
  related.push(...refs('factoryLines',lines,'工厂编号'));
  const factories=[...new Set(lines.map(r=>r['工厂编号']).filter(Boolean))];
  if(lines.length&&factories.length!==1){add('REFERENCE',`${task.id} 工厂继承歧义。`,task,related,ev);continue;}
  let id=machine['日历编号']?.trim();
  if(!id){const ids=[...new Set(data.calendars.filter(r=>factories.length===1&&r['工厂编号']===factories[0]).map(r=>r['日历编号']).filter(Boolean))];if(ids.length===1)id=ids[0];}
  const calendars=data.calendars.filter(r=>id&&r['日历编号']===id);
  const stops=data.downtime.filter(r=>r['设备编号']===task.machine);
  related.push(...refs('calendars',calendars,'起始分钟'),...refs('downtime',stops,'起始分钟'));
  if(!id||!calendars.length||new Set(calendars.map(r=>r['工厂编号'])).size!==1||factories.length===1&&calendars.some(r=>r['工厂编号']!==factories[0])){add('REFERENCE',`${task.id} 日历引用缺失、工厂不一致或无法唯一继承。`,task,related,ev);continue;}
  const bad=[...calendars,...stops].filter(r=>!savedInterval({start:r['起始分钟'],end:r['结束分钟']})||calendars.includes(r)&&!['是','否'].includes(r['是否工作']));
  if(bad.length){add('TIME',`${task.id} 冻结日历/停机存在未知时间或工作状态。`,task,related,ev);continue;}
  const windows=calendars.filter(r=>r['是否工作']==='是').map(r=>({start:savedMinute(r['起始分钟']),end:savedMinute(r['结束分钟'])}));
  const blocks=[...calendars.filter(r=>r['是否工作']==='否'),...stops].map(r=>({start:savedMinute(r['起始分钟']),end:savedMinute(r['结束分钟']),kind:stops.includes(r)?'downtime':'factory-off'}));
  // A continuous task must fit ONE declared work window; never sum fragmented availability.
  const overlaps=blocks.filter(b=>interval.start<b.end&&interval.end>b.start).map(b=>({...b,overlapStart:Math.max(b.start,interval.start),overlapEnd:Math.min(b.end,interval.end)}));
  const covered=windows.some(w=>w.start<=interval.start&&w.end>=interval.end);
  const evidence={...ev,calendarId:id,inherited:!machine['日历编号']?.trim(),windows,blocks,overlaps,covered};
  const fact=(data.executionFacts||[]).find(f=>f['订单编号']===task.orderId&&f['工序编号']===task.operation);
  evidence.protectedExecution=fact?{factId:fact['事实编号'],start:fact['开始分钟'],observed:fact['观测分钟'],note:'原始执行事实独立保留；本项只复核保存的计划任务，不重写执行事实。'}:null;
  inspections.push({taskId:task.id,...evidence,relatedRecords:related});
  if(!covered||overlaps.length){const first=overlaps[0];add('INTERVAL',`${task.id} 实际 [${interval.start},${interval.end}) 需连续 ${interval.end-interval.start} 分钟；${!covered?'未落入一个完整工厂工作窗口；':''}${overlaps.length?'与工厂停工或设备停机相交；':''}不允许拆开执行。`,task,related,evidence,{kind:'calendar',machine:task.machine,start:first?first.overlapStart:interval.start,end:first?first.overlapEnd:interval.end,taskStart:interval.start,taskEnd:interval.end});}
 }
 if(!plan.tasks?.length){details.push('没有已排任务；未排原因保留，不制造任务区间。');return finish('not_checked');}
 if(!findings.length)details.push(`已按冻结输入核对 ${inspections.length} 个连续任务；[开始,结束) 端点不相交。`);
 return finish(findings.length?'problem':'pass');
}
