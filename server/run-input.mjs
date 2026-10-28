import { createHash } from 'node:crypto';
import { schedulingScope } from '../src/lib/scheduling-scope.mjs';
import { ruleCatalog } from '../src/lib/business-rules.mjs';
export const inputHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// The minute axis is fixed at 2026-11-02 08:00 +08:00, including calendars,
// supply and personnel. Selecting a start never rebases those inputs.
export function freezeRunInput(data, selection = {}, calculatedAt = new Date().toISOString()) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection) || Object.keys(selection).some(k=>!['orderIds','startMinute','endMinute','priority','enabledRuleIds','mode'].includes(k))) throw Error('invalid_selection');
  let checkScope=schedulingScope(selection.mode);
  const eligible=data.orders.filter(o=>o['需求类型']==='正式订单'&&o['订单状态']==='有效');
  const orderIds=selection.orderIds??eligible.map(o=>o['订单编号']);
  if(!Array.isArray(orderIds)||!orderIds.length||orderIds.some(id=>typeof id!=='string'||!eligible.some(o=>o['订单编号']===id))||new Set(orderIds).size!==orderIds.length)throw Error('invalid_orders');
  const selected=eligible.filter(o=>orderIds.includes(o['订单编号']));
  const lines=new Set(selected.map(o=>o['产线编号']));
  if(lines.size!==1||!selected[0]['产线编号']||data.machines.some(m=>m['产线编号']!==selected[0]['产线编号']))throw Error('invalid_line_scope');
  const startMinute=selection.startMinute??0, endMinute=selection.endMinute??null;
  if(typeof startMinute!=='number'||!Number.isFinite(startMinute)||startMinute<0||startMinute>525600|| (endMinute!==null&&(typeof endMinute!=='number'||!Number.isFinite(endMinute)||endMinute<=startMinute||endMinute>525600)))throw Error('invalid_horizon');
  const priority=selection.priority??'规则设置';
  if(!['规则设置','优先顺序','要求日期'].includes(priority))throw Error('invalid_priority');
  const enabledRuleIds=selection.enabledRuleIds??data.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']);
  if(!Array.isArray(enabledRuleIds)||enabledRuleIds.some(id=>typeof id!=='string'||!data.rules.some(r=>r['规则编号']===id))||new Set(enabledRuleIds).size!==enabledRuleIds.length||ruleCatalog.some(c=>c.required&&!enabledRuleIds.includes(c.id)))throw Error('invalid_rule_selection');
  const executionData=structuredClone(data);
  executionData.orders=selected.map(o=>({...o}));
  executionData.dependencies=executionData.dependencies.filter(r=>orderIds.includes(r['订单编号']));
  executionData.supplyUses=executionData.supplyUses.filter(r=>orderIds.includes(r['订单编号']));
  executionData.rules=executionData.rules.map(r=>({...r,'是否启用':enabledRuleIds.includes(r['规则编号'])?'是':'否'}));
  checkScope=schedulingScope(checkScope.mode,executionData.rules.some(r=>r['规则编号']==='MATERIAL'&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(calculatedAt))));
  const conditions={mode:checkScope.mode,checkScope,ruleEvaluationAt:calculatedAt,orderIds:selected.map(o=>o['订单编号']),lineId:selected[0]['产线编号'],startMinute,endMinute,priority,enabledRuleIds:[...enabledRuleIds],timeOrigin:'2026-11-02T08:00:00+08:00',interval:'[start,end)',horizonPolicy:'完整工序须在结束范围内；未排不代表全局无解'};
  return {conditions,executionData,snapshotHash:inputHash({conditions,executionData})};
}
