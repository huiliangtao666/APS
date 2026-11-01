import {freezeP1Topic,p1EligibleOrders} from '../src/lib/p1-topics-contract.mjs';
import {b16Capability,applicationProfile,assignmentCandidates} from '../src/lib/b16-application.mjs';
import {validatePackBatch,packRequested} from '../src/lib/pack-batch.mjs';
import {checkStageBindings} from '../src/lib/stage-bindings.mjs';
import {originalTable} from '../src/lib/original-resources.mjs';
import {adoptProcessScope} from '../src/lib/process-route.mjs';
import {adoptChangeoverScope} from '../src/lib/changeover-application.mjs';
import {validateResourceMappings,mappingFingerprintInput,freezeResourceEntities} from '../src/lib/resource-mapping.mjs';
import {adaptOriginalDependencies} from '../src/lib/original-dependencies.mjs';
import {hasPhysicalPools,validatePhysicalPools} from '../src/lib/physical-pools.mjs';
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
  if (!selection || typeof selection !== 'object' || Array.isArray(selection) || Object.keys(selection).some(k=>!['orderIds','startMinute','endMinute','priority','enabledRuleIds','mode','capability','profileId','p1ProfileId'].includes(k))) throw Error('invalid_selection');
  let checkScope=schedulingScope(selection.mode);
  if(selection.capability!==undefined&&selection.capability!==b16Capability)throw Error("invalid_capability");
  const multiline=selection.capability===b16Capability;
  if(multiline&&checkScope.mode!=="supported")throw Error("B16 requires supported mode");
  const b16Profile=multiline?applicationProfile(data,selection.profileId):null;
  const p1Topic=selection.p1ProfileId!==undefined?freezeP1Topic(data,selection.p1ProfileId):null;
  if(p1Topic&&checkScope.mode!=='supported')throw Error('P1独立模拟必须采用已有支持模式，不能以最小模式跳过硬约束');
  const eligible=p1Topic?p1EligibleOrders(data,selection.p1ProfileId):data.orders.filter(o=>o['需求类型']==='正式订单'&&o['订单状态']==='有效');
  const orderIds=selection.orderIds??eligible.map(o=>o['订单编号']);
  if(!Array.isArray(orderIds)||!orderIds.length||orderIds.some(id=>typeof id!=='string'||!eligible.some(o=>o['订单编号']===id))||new Set(orderIds).size!==orderIds.length)throw Error('invalid_orders');
  const selected=eligible.filter(o=>orderIds.includes(o['订单编号']));
  const lines=new Set(selected.map(o=>o['产线编号']));
  if(!multiline&&(lines.size!==1||!selected[0]['产线编号']||data.machines.some(m=>m['产线编号']!==selected[0]['产线编号'])))throw Error('invalid_line_scope');
  const startMinute=selection.startMinute??0, endMinute=selection.endMinute??null;
  if(typeof startMinute!=='number'||!Number.isFinite(startMinute)||startMinute<0||startMinute>525600|| (endMinute!==null&&(typeof endMinute!=='number'||!Number.isFinite(endMinute)||endMinute<=startMinute||endMinute>525600)))throw Error('invalid_horizon');
  const priority=selection.priority??'规则设置';
  if(!['规则设置','优先顺序','要求日期'].includes(priority))throw Error('invalid_priority');
  const enabledRuleIds=selection.enabledRuleIds??data.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']);
  if(!Array.isArray(enabledRuleIds)||enabledRuleIds.some(id=>typeof id!=='string'||!data.rules.some(r=>r['规则编号']===id))||new Set(enabledRuleIds).size!==enabledRuleIds.length||ruleCatalog.some(c=>c.required&&(checkScope.mode!=='minimal-r1'||data.inputStage!=='minimal-r1'||['MACHINE','PRECEDENCE'].includes(c.id))&&!enabledRuleIds.includes(c.id)))throw Error('invalid_rule_selection');
  const adopted={...data,rules:data.rules.map(r=>({...r,'是否启用':enabledRuleIds.includes(r['规则编号'])?'是':'否'}))};
  const stages=checkStageBindings(adopted,{forRun:true,startMinute});
  const stageIssues=stages.issues.filter(i=>i.table==='stageMappings');
  if(stageIssues.length)throw Error(stageIssues.map(i=>`${i.code} ${i.table}:${i.row}:${i.field} ${i.message}`).join('；'));
  if(stages.contract&&checkScope.mode==='minimal-r1')throw Error('原来源显式绑定不可用于未检查最小模式');
  const intake=adaptOriginalDependencies(adopted,{at:calculatedAt});
  if(intake.issues.length)throw Error(intake.issues.map(i=>`${i.code} ${i.file}:${i.row}:${i.field} ${i.message}`).join('；'));
  const mappingIssues=validateResourceMappings(adopted,{forRun:true,at:calculatedAt});
  if(mappingIssues.length)throw Error(mappingIssues.map(i=>`${i.code} ${i.file}:${i.row}:${i.field} ${i.message}`).join('；'));
  const mappingContract=(data.resourceMappings||[]).some(m=>m['合同版本']==='FR013-resource-map-v2')?'FR013-resource-map-v2':'FR013-resource-map-v1';
  const hasMappings=(data.resourceMappings||[]).some(m=>m['状态']==='READY');
  if(hasMappings&&checkScope.mode==='minimal-r1')throw Error('NOT_READY_CONFIG 原05/06显式映射不可用于minimal-r1未检查模式');
  const executionData=migratePolicies(intake.data);
  executionData.resourceStops??=[];
  // Only this isolated execution copy uses the existing order scheduling kernel.
  // Original prediction rows remain immutable in originalInput and p1Topic.sources.
  executionData.orders=selected.map(o=>({...o,...(p1Topic?{'需求类型':'正式订单'}:{})}));
  if(p1Topic){
   p1Topic.sources=selected.map(o=>({orderId:o['订单编号'],originalDemandType:o['需求类型'],quantity:o['合格需求'],unit:o['数量单位'],profileVersion:p1Topic.profile['配置版本'],source:structuredClone(data.p1DemandSources.find(s=>s['订单编号']===o['订单编号']))}));
   for(const product of new Set(selected.map(o=>o['产品编号']))){const route=data.routes.filter(r=>r['产品编号']===product);if(route.some(r=>route.filter(c=>c['前序工序']===r['工序编号']).length>1||/[;,、]/.test(r['前序工序']||'')))throw Error('P1分支汇合/返工 UNSUPPORTED：仅复用既有顺序路线');}
  }
  if((data.executionFacts||[]).length)executionData.executionContext=structuredClone(data);
  executionData.dependencies=executionData.dependencies.filter(r=>orderIds.includes(r['订单编号']));
  executionData.deliveryConditions=(executionData.deliveryConditions||[]).filter(r=>orderIds.includes(r['订单编号']));
  executionData.resourceClaims=(executionData.resourceClaims||[]).filter(r=>orderIds.includes(r['订单编号']));
  executionData.supplyUses=executionData.supplyUses.filter(r=>orderIds.includes(r['订单编号']));
  executionData.rules=executionData.rules.map(r=>({...r,'是否启用':enabledRuleIds.includes(r['规则编号'])?'是':'否'}));
  if(hasMappings&&!intake.contract&&(data.resourceMappings||[]).some(m=>m['来源类别']==='originalTools')&&!executionData.rules.some(r=>r['规则编号']==='MOLD'&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(calculatedAt))))throw Error('NOT_READY_CONFIG 运行选择未采用MOLD或尚未生效，不能忽略原05资源');
  if(executionData.executionContext)executionData.executionContext.rules=structuredClone(executionData.rules);
  checkScope=schedulingScope(checkScope.mode,executionData.rules.some(r=>r['规则编号']==='MATERIAL'&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(calculatedAt))),activeBatchRule(executionData,calculatedAt),jointFlags(executionData,calculatedAt),deliveryActive(executionData,calculatedAt));
  if(packRequested(executionData)){const issues=validatePackBatch(executionData);if(issues.length)throw Error(issues.map(i=>i.message).join('；'));if(checkScope.mode!=='supported'||!['MATERIAL','CAPACITY','PROGRAM','CALENDAR','MACHINE','PRECEDENCE'].every(id=>executionData.rules.some(r=>r['规则编号']===id&&r['是否启用']==='是'&&(!r['生效时间']||Date.parse(r['生效时间'])<=Date.parse(calculatedAt)))))throw Error('包装作业须采用支持模式及物料/容量/日历/机器/顺序规则');checkScope.checked.push('CR-PACK-BATCH显式包装工时×速率、最小包装单位和同订单/逐生产批作业；实际量尾批与既有兼容合炉');checkScope.unchecked=checkScope.unchecked.map(s=>s==='速度换算及完整精度规则'?'任意新单位转换、跨订单包装重组及非整数分钟精度':s);}
  checkScope=adoptProcessScope(checkScope,executionData,calculatedAt);
  checkScope=adoptChangeoverScope(checkScope,executionData,calculatedAt);
  if((data.originalResourceEvents||[]).length)checkScope.checked.push('N06明确模拟 MOCK 有限已释放原账；来源/版本与取得、归还、释放全链冻结；非现场验证');
  if((data.executionFacts||[]).length){checkScope.checked.push('模拟累计执行事实、原始保护区间与剩余工时/耗料（支持口径）');checkScope.unchecked=checkScope.unchecked.map(x=>x==='执行事实与主管确认'?'真实执行/质量确认、FR031事件恢复/转机/冲销':x);}
  if((data.simulationEvents||[]).length)checkScope.checked.push('FR029事件时点累计事实、不可改写事件历史、禁止未开始任务开工保护窗口与需处理阻断；不含恢复/转机/撤销');
  if((data.originalBom||[]).length)checkScope.unchecked.push('原09 BOM来源资料未映射计算：未推定版本、生效日期、用量类型、单位及基准/收率/损失/取整组合');
  if(hasMappings)checkScope.checked.push(`原05/06 ${mappingContract} 显式来源/运行绑定；全局唯一容量、套/人、半开分钟区间`);
  if(checkScope.mode==='minimal-r1'&&hasPhysicalPools(executionData))throw Error('P10物理人员池不可用于minimal-r1未检查模式；请选择支持人员策略的完整试算');
  if(checkScope.mode!=='minimal-r1'){const issues=validatePhysicalPools(executionData,{at:calculatedAt,forRun:true});if(issues.length)throw Error(issues.map(i=>`${i.file}:${i.row}:${i.field} ${i.message}`).join('；'));}
  if(checkScope.mode==='supported')checkScope.checked.push('P06单窗多班：继承工厂工作窗口、扣除人员/工装停用例外；完整阶段与占用；不跨班拼接');
  if(stages.contract)checkScope.checked.push('原13/14/18/19显式版本绑定；分钟边界及模拟/事实性质分别冻结，不推定客户权威');
  if(multiline){
   if(!["MACHINE","PRECEDENCE","CALENDAR","MATERIAL","MOLD","LABOR"].every(id=>enabledRuleIds.includes(id)))throw Error("B16 requires MACHINE/PRECEDENCE/CALENDAR/MATERIAL/MOLD/LABOR");
   checkScope.label="B16 同厂多线（显式配置）";checkScope.note='B16按显式产品适用/共享配置检查全厂数量与占用、完整需求和交期；自动选线有界，不承诺全局最优；预计供给始终附条件。未检查项保留原状态。';checkScope.checked=checkScope.checked.filter(s=>s!=="单产线");checkScope.checked.push("显式合法选线、全厂资源共享、全计划物料事务及独立多线复核");
   assignmentCandidates(b16Profile,executionData);
  }
  if(p1Topic){checkScope={...checkScope,label:'P1 独立模拟 · '+checkScope.label,checked:[...checkScope.checked,'显式独立预测适配、来源/profile/版本冻结；与正式订单隔离'],unchecked:[...checkScope.unchecked,'预测自动冲减/目标库存补库/新增分支返工/配方/资源/目标权重'],note:checkScope.note+' 本次仅独立模拟，不自动叠加正式订单，不进入正式提交确认。'};}
  const conditions={...(p1Topic?{p1Topic,p1ProfileId:selection.p1ProfileId}:{}),...(multiline?{capability:b16Capability,profileId:selection.profileId,b16Profile:structuredClone(b16Profile)}:{}),...(packRequested(executionData)?{packBatchContract:'CR-PACK-BATCH-20261031-v1'}:{}),...(stages.contract?{stageBindingContract:stages.contract,stageBindings:stages.bindings}:{}),...((data.originalResourceEvents||[]).length?{executionResourceContract:'N06-finite-v1',executionResourceVersion:inputHash(data.originalResourceEvents),executionResourceKind:'明确模拟'}:{}),...((data[originalTable]||[]).length?{originalLedgerContract:'N06-finite-v1',originalLedgerVersion:inputHash(data[originalTable]),...(!hasMappings?{originalResourceContract:'N06-finite-v1',originalResourceVersion:inputHash(data[originalTable])}:{})}:{}),...(intake.contract?{originalDependencyContract:intake.contract,originalDependencyBindings:intake.bindings.map(b=>orderIds.includes(b.sourceRecord['订单编号'])?b:{...b,status:'NOT_SELECTED',targets:[],reason:'订单未被本次运行选择；仅冻结原文'})}:{}),...(data.r21OrderConfiguration?{r21OrderConfiguration:structuredClone(data.r21OrderConfiguration)}:{}),...(hasMappings?{originalResourceContract:mappingContract,...(mappingContract==='FR013-resource-map-v2'?{originalResourceEntities:freezeResourceEntities(executionData)}:{}),originalResourceMappings:executionData.resourceMappings.map(m=>({id:m['配置编号'],version:m['配置版本']})),originalResourceVersion:inputHash(mappingFingerprintInput(executionData))}:{}),workingWindowsContract:checkScope.mode==='supported'?'P06-windows-v1':null,jointConditionsContract:checkScope.mode==='supported'?'FR022-joint-v1':null,personnelPoolContract:hasPhysicalPools(executionData)?'P10-explicit-v2':null,resourcePolicyContract:'CR-DEC02-03-v1',resourcePolicyVersion:inputHash({calendars:executionData.calendars,downtime:executionData.downtime,resourceStops:executionData.resourceStops,tools:executionData.tools,resourceClaims:executionData.resourceClaims,dependencies:executionData.dependencies,personnelGroups:executionData.personnelGroups,...(hasPhysicalPools(executionData)?{personnelPools:executionData.personnelPools}:{}),skillSubstitutions:executionData.skillSubstitutions}),eventSummary:eventSummary(data),executionFactsVersion:inputHash(executionState(data)),executionSummary:executionSummary(executionData.executionContext||executionData,calculatedAt),mode:checkScope.mode,checkScope,ruleEvaluationAt:calculatedAt,orderIds:selected.map(o=>o['订单编号']),lineId:multiline?b16Profile.lines.map(l=>l.id).join('、'):selected[0]['产线编号'],startMinute,endMinute,priority,enabledRuleIds:[...enabledRuleIds],timeOrigin:'2026-11-02T08:00:00+08:00',interval:'[start,end)',horizonPolicy:'完整工序须在结束范围内；未排不代表全局无解'};
  const sourceMap=Object.fromEntries(Object.entries(data).filter(([,rows])=>Array.isArray(rows)).map(([table,rows])=>[table,rows.map((r,index)=>({r,index})).filter(({r})=>table==='orders'?selected.includes(r):['dependencies','deliveryConditions','resourceClaims','supplyUses'].includes(table)?orderIds.includes(r['订单编号']):true).map(({index})=>index)]));
  if(intake.contract)sourceMap.dependencies=executionData.dependencies.map(r=>(data.dependencies||[]).findIndex(s=>Object.keys(r).every(k=>(s[k]??'')===(r[k]??''))));
  return {conditions,executionData,sourceMap,snapshotHash:inputHash({conditions,executionData})};
}
