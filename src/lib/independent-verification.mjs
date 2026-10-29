import {verifyOriginalResources} from './verify-original-resources.mjs';
import {verifyJointConditions} from './verify-joint-conditions.mjs';
import {verifyResourcePolicies} from './verify-resource-policies.mjs';
import {savedInterval} from './verification-endpoints.mjs';

function result(status, details) {
  return { status, details };
}

/**
 * Rechecks only the confirmed R1 result constraints. This intentionally does
 * not call the scheduler's own validation routine.
 */
export function independentlyVerifyPlan(plan, orders, routes = [], enabledRules = ['MACHINE', 'PRECEDENCE'], checkedAt = new Date().toISOString(), frozenData = null, frozenConditions = null) {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const orderRows = Array.isArray(orders) ? orders : [];
  const routeRows = Array.isArray(routes) ? routes : [];
  const orderLines = new Map(orderRows.map((order) => [String(order['订单编号'] ?? '').trim(), String(order['产线编号'] ?? '').trim()]));
  const details = {};
  const findings = [];

  const missingLineOrders = orderRows
    .filter((order) => !String(order['产线编号'] ?? '').trim())
    .map((order) => String(order['订单编号'] ?? '（未编号）').trim() || '（未编号）');
  const distinctLines = [...new Set(orderRows.map((order) => String(order['产线编号'] ?? '').trim()).filter(Boolean))];
  const unknownOrderTasks = tasks.filter((task) => !orderLines.has(String(task.orderId ?? '').trim()));
  const taskLines = [...new Set(tasks.map((task) => orderLines.get(String(task.orderId ?? '').trim())).filter(Boolean))];
  const lineProblems = [];
  if (missingLineOrders.length) lineProblems.push(`输入订单缺少产线编号：${missingLineOrders.join('、')}`);
  if (distinctLines.length > 1) lineProblems.push(`输入订单包含多条产线：${distinctLines.join('、')}`);
  if (unknownOrderTasks.length) lineProblems.push(`以下任务无法关联当前订单产线：${unknownOrderTasks.map((task) => task.id).join('、')}`);
  if (taskLines.length > 1) lineProblems.push(`结果任务跨越多条产线：${taskLines.join('、')}`);
  if (lineProblems.length) details.lineScope = result('problem', lineProblems);
  else if (!orderRows.length || !tasks.length) details.lineScope = result('not_checked', ['没有可核对的订单或已排任务。']);
  else details.lineScope = result('pass', [`已核对 ${orderRows.length} 个输入订单、${tasks.length} 个结果任务；产线为 ${taskLines[0] || distinctLines[0]}。`]);

  const machineProblems = [];
  for (const task of tasks) {
    if (!String(task.machine ?? '').trim()) machineProblems.push(`任务 ${task.id} 未指定设备。`);
    if (!savedInterval(task)) {
      machineProblems.push(`任务 ${task.id} 的时间区间无效。`);
    }
  }
  const byMachine = new Map();
  for (const task of tasks) {
    const machine = String(task.machine ?? '').trim();
    const interval = savedInterval(task);
    if (!machine || !interval) continue;
    const list = byMachine.get(machine) ?? [];
    list.push({...task, ...interval});
    byMachine.set(machine, list);
  }
  for (const [machine, list] of byMachine) {
    list.sort((a, b) => Number(a.start) - Number(b.start) || Number(a.end) - Number(b.end));
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length && Number(list[j].start) < Number(list[i].end); j += 1) {
        if (Number(list[i].start) < Number(list[j].end)) {
          const a=list[i],b=list[j];
          if(a.resourceBatchId&&a.resourceBatchId===b.resourceBatchId&&a.start===b.start&&a.end===b.end&&a.machine===b.machine&&a.operation===b.operation&&a.productId===b.productId&&a.productionBatchId&&b.productionBatchId&&a.productionBatchId!==b.productionBatchId)continue;
          const message=`${machine} 上 ${list[i].id} 与 ${list[j].id} 时间重叠 [${Math.max(Number(list[i].start),Number(list[j].start))},${Math.min(Number(list[i].end),Number(list[j].end))}) 分钟。`;
          machineProblems.push(message);
          if(enabledRules.includes('MACHINE'))findings.push({code:'VERIFY / MACHINE_OVERLAP',message,taskIds:[list[i].id,list[j].id],interval:{kind:'machine-overlap',machine,start:Math.max(Number(list[i].start),Number(list[j].start)),end:Math.min(Number(list[i].end),Number(list[j].end))}});
        }
      }
    }
  }
  if (!enabledRules.includes('MACHINE')) details.machineOverlap = result('not_checked', ['规则 MACHINE 当前未启用。']);
  else if (machineProblems.length) details.machineOverlap = result('problem', machineProblems);
  else if (!tasks.length) details.machineOverlap = result('not_checked', ['没有已排任务可供检查。']);
  else details.machineOverlap = result('pass', [`已检查 ${tasks.length} 个任务在 ${byMachine.size} 台设备上的区间；相邻端点按 [开始,结束) 处理。`]);

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const precedenceLinks = [];
  const precedenceUncheckable = [];
  const precedenceProblems = [];
  for (const task of tasks) {
    const route = routeRows.find((row) => row['产品编号'] === task.productId && row['工序编号'] === task.operation);
    if (!route) {
      precedenceUncheckable.push(`任务 ${task.id} 缺少匹配路线输入，无法核对其前序定义。`);
      continue;
    }
    const expectedOperation = String(route['前序工序'] ?? '').trim();
    const expectedId = expectedOperation ? task.productionBatchIndex?JSON.stringify([task.orderId,task.productionBatchIndex,expectedOperation]):`${task.orderId}-${expectedOperation}` : '';
    if (!expectedId && String(task.predecessor ?? '').trim()) {
      precedenceProblems.push(`任务 ${task.id} 的路线未定义前序，但结果引用了 ${task.predecessor}。`);
      continue;
    }
    if (!expectedId) continue;
    precedenceLinks.push(task);
    if (task.predecessor !== expectedId) {
      precedenceProblems.push(`任务 ${task.id} 的路线要求前序 ${expectedId}，结果引用为 ${task.predecessor || '（缺失）'}。`);
      continue;
    }
    const predecessor = byId.get(expectedId);
    if (!predecessor) {
      precedenceProblems.push(`任务 ${task.id} 的前序任务 ${expectedId} 不在结果中。`);
    } else if (!savedInterval(task) || !savedInterval(predecessor)) {
      precedenceProblems.push(`任务 ${task.id} 或前序 ${predecessor.id} 的时间无效，无法核对先后关系。`);
    } else if (Number(task.start) < Number(predecessor.end)) {
      const message=`任务 ${task.id} 于 ${task.start} 开始，早于前序 ${predecessor.id} 于 ${predecessor.end} 完成，提前 ${Number(predecessor.end)-Number(task.start)} 分钟。`;
      precedenceProblems.push(message);
      if(enabledRules.includes('PRECEDENCE'))findings.push({code:'VERIFY / PRECEDENCE',message,taskIds:[predecessor.id,task.id],interval:{kind:'precedence',start:Number(task.start),end:Number(predecessor.end),priorEnd:Number(predecessor.end),nextStart:Number(task.start),violationDuration:Number(predecessor.end)-Number(task.start)}});
    }
  }
  if (!enabledRules.includes('PRECEDENCE')) details.precedence = result('not_checked', ['规则 PRECEDENCE 当前未启用。']);
  else if (precedenceProblems.length) details.precedence = result('problem', precedenceProblems);
  else if (precedenceUncheckable.length) details.precedence = result('not_checked', [...precedenceUncheckable, ...(precedenceLinks.length ? [`已核对 ${precedenceLinks.length} 条关系且未发现问题。`] : [])]);
  else if (!tasks.length || !precedenceLinks.length) details.precedence = result('not_checked', ['结果中没有可核对的前序任务关系。']);
  else details.precedence = result('pass', [`已核对 ${precedenceLinks.length} 条前序关系；后序均不早于前序完成。`]);

  details.resourcePolicies=result('not_checked',['旧方案缺少资源参数契约，未检查资源参数。']);
  if(frozenData||plan.resourcePolicyContract==='CR-DEC02-03-v1'){
    details.resourcePolicies=verifyResourcePolicies(plan,frozenData,frozenConditions??plan.conditions);
    if(details.resourcePolicies.status==='problem'){
      const structured=details.resourcePolicies.findings||[];findings.push(...structured);
      findings.push(...details.resourcePolicies.details.filter(message=>!structured.some(f=>{const m=message.match(/^(.*) 在分钟 ([\d.]+) 超容量 /);return m&&m[1]===f.interval.resourceId&&Number(m[2])>=f.interval.start&&Number(m[2])<f.interval.end;})).map(message=>({code:'VERIFY / RESOURCE_POLICY',message,taskIds:[]})));
    }
  }
  if(frozenConditions?.jointConditionsContract){
    const problems=verifyJointConditions(plan,frozenData,frozenConditions);
    details.jointConditions=result(problems.length?'problem':tasks.length?'pass':'not_checked',problems.length?problems:['按冻结输入复核机器完整日历与停机、物料需求覆盖、来源资格及累计分配守恒；不调用排程或分配器。']);
    findings.push(...problems.map(message=>({code:'VERIFY / JOINT_CONDITIONS',message,taskIds:[]})));
  }
  const original=verifyOriginalResources(plan,frozenData,frozenConditions||{});
  if(original){details.originalResources=original;findings.push(...(original.status==='problem'?original.details.map(message=>({code:'VERIFY / ORIGINAL_RESOURCES',message,taskIds:[]})):[]));}
  return { checkedAt, planId: plan?.id ?? '', findings, scopeNote:'独立复核检查单线、机器不重叠、工序先后，以及有完整冻结配置的新契约资源窗口、技能资格与容量；未检查项另列，不代表完整业务可执行。', checks: details };
}
