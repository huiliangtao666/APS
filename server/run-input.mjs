import {migratePolicies} from '../src/lib/resource-policies.mjs';
import {eventSummary} from '../src/lib/simulation-events.mjs';
import {executionState,executionSummary} from '../src/lib/execution-facts.mjs';
import {deliveryActive} from '../src/lib/delivery-policy.mjs';
import {jointFlags} from '../src/lib/joint-resources.mjs';
import {activeBatchRule} from '../src/lib/production-batches.mjs';
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
  const executionData=migratePolicies(data);
  executionData.orders=selected.map(o=>({...o}));
  if((data.executionFacts||[]).length)executionData.executionContext=structuredClone(data);
  executionData.dependencies=executionData.dependencies.filter(r=>orderIds.includes(r['订单编号']));
  executionData.deliveryConditions=(executionData.deliveryConditions||[]).filter(r=>orderIds.includes(r['订单编号']));
  executionData.resourceClaims=(executionData.resourceClaims||[]).filter(r=>orderIds.includes(r['订单编号']));
  executionData.supplyUses=executionData.supplyUses.filter(r=>orderIds.includes(r['订单编号']));
  executionData.rules=executionData.rules.map(r=>({...r,'是否启用':enabledRuleIds.includes(r['规则编号'])?'是':'否'}));
  if(executionData.executionContext)executionData.executionContext.rules=structuredClone(executionData.rules);
  checkScope=schedulingScope(checkScope.mode,executionData.rules.some(r=>r['规则编号']==='MATERIAL'&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(calculatedAt))),activeBatchRule(executionData,calculatedAt),jointFlags(executionData,calculatedAt),deliveryActive(executionData,calculatedAt));
  if((data.executionFacts||[]).length){checkScope.checked.push('模拟累计执行事实、原始保护区间与剩余工时/耗料（支持口径）');checkScope.unchecked=checkScope.unchecked.map(x=>x==='执行事实与主管确认'?'真实执行/质量确认、FR031事件恢复/转机/冲销':x);}
  if((data.simulationEvents||[]).length)checkScope.checked.push('FR029事件时点累计事实、不可改写事件历史、禁止未开始任务开工保护窗口与需处理阻断；不含恢复/转机/撤销');
  if((data.originalTools||[]).length||(data.originalPersonnel||[]).length)checkScope.unchecked.push('原05/06资料的任务占用、共享池及人员班次映射；这些资料尚未作为运行资源采用');
  const conditions={resourcePolicyContract:'CR-DEC02-03-v1',resourcePolicyVersion:inputHash({tools:executionData.tools,resourceClaims:executionData.resourceClaims,dependencies:executionData.dependencies,personnelGroups:executionData.personnelGroups,skillSubstitutions:executionData.skillSubstitutions}),eventSummary:eventSummary(data),executionFactsVersion:inputHash(executionState(data)),executionSummary:executionSummary(executionData.executionContext||executionData,calculatedAt),mode:checkScope.mode,checkScope,ruleEvaluationAt:calculatedAt,orderIds:selected.map(o=>o['订单编号']),lineId:selected[0]['产线编号'],startMinute,endMinute,priority,enabledRuleIds:[...enabledRuleIds],timeOrigin:'2026-11-02T08:00:00+08:00',interval:'[start,end)',horizonPolicy:'完整工序须在结束范围内；未排不代表全局无解'};
  return {conditions,executionData,snapshotHash:inputHash({conditions,executionData})};
}
