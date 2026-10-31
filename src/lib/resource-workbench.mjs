import {verifyResourcePolicies} from './verify-resource-policies.mjs';
import {resourceLoad} from './resource-load.mjs';

export const resourceTables={originalResourceEvents:'MOCK取得归还释放账',tools:'工装与套数',resourceClaims:'取得与归还窗口',personnelPools:'共享人员池',personnelGroups:'人数、技能与班次',dependencies:'任务人数与参与窗口',skillSubstitutions:'有向技能替代',rules:'资源规则启用'};
export const terminalResourceRun=run=>['completed','partial','failed','cancelled','timed_out'].includes(run.status);

// Presentation uses a single saved run and its own immutable input, never today's configuration.
export function resourceRunView(run,snapshot,plan){
 if(!run||!snapshot||snapshot.runId!==run.id||snapshot.snapshotHash!==run.snapshotHash||snapshot.inputVersionId!==run.inputVersionId)throw Error('运行与冻结输入版本不一致，请重新读取');
 if(!plan||plan.id!==run.planId||plan.runId!==run.id||plan.snapshotHash!==run.snapshotHash||plan.inputVersionId!==run.inputVersionId)throw Error('方案与运行版本不一致，请重新读取');
 const data=snapshot.executionData,conditions=snapshot.conditions;
  const verification=verifyResourcePolicies(plan,data,conditions);
  const load=resourceLoad({...plan,inputSnapshot:snapshot.originalInput},{start:conditions.startMinute,end:conditions.endMinute??525600});
  const findings=[],seen=new Set();
  // A reopened result can contain conflicts found only by the independent checker.
  // Keep their task/source references available to the same finding navigation.
  for(const finding of [...(plan.findings||[]),...(verification.findings||[])]){
    const key=JSON.stringify([finding.code,finding.message,[...(finding.taskIds||[])].sort()]);
    if(!seen.has(key)){seen.add(key);findings.push(finding);}
  }
  return {run,plan,snapshot,verification,load,version:conditions.resourcePolicyVersion,
  provenance:{runId:run.id,planId:plan.id,inputVersionId:run.inputVersionId,snapshotHash:run.snapshotHash,resourcePolicyVersion:conditions.resourcePolicyVersion},
  findings,reservations:plan.resourceReservations||[]};
}

export function resourceTaskSources(view,taskIds){
 const tasks=view.plan.tasks.filter(t=>taskIds.includes(t.id)),input=view.snapshot.originalInput,refs=[];
 const dependencies=(input.dependencies||[]).filter(r=>tasks.some(t=>t.orderId===r['订单编号']&&t.operation===r['工序编号']));
 const originalDependencies=(input.originalDependencies||[]).filter(r=>tasks.some(t=>t.orderId===r['订单编号']&&t.operation===r['工序编号']));
 const claims=(input.resourceClaims||[]).filter(r=>tasks.some(t=>t.orderId===r['订单编号']&&t.operation===r['工序编号']));
 const reservations=view.reservations.filter(r=>(r.taskIds||[r.taskId]).some(id=>taskIds.includes(id)));
 const resourceMappings=(input.resourceMappings||[]).filter(m=>m['来源类别']==='originalTools'&&reservations.some(r=>r.type==='工装'&&r.resourceId===m['运行编号']));
 const originalTools=(input.originalTools||[]).filter(t=>resourceMappings.some(m=>m['来源编号']===t['资源编号']));
 for(const [table,rows] of Object.entries({originalDependencies,dependencies,resourceClaims:claims,originalTools,resourceMappings,tools:(input.tools||[]).filter(t=>reservations.some(r=>r.type==='工装'&&r.resourceId===t['工装编码'])),personnelGroups:(input.personnelGroups||[]).filter(g=>reservations.some(r=>r.type==='人员'&&r.resourceId===g['人员组编号'])),personnelPools:(input.personnelPools||[]).filter(p=>reservations.some(r=>r.poolId===p.poolId))}))for(const row of rows){
  const index=input[table].indexOf(row),source=view.plan.inputCsvSources?.[table];
  refs.push({table,index,physicalRow:source?.records?.[index]?.line??null,canonicalRow:index+2,file:source?.file??null,sourceSha256:source?.sha256??null,inputVersionId:view.run.inputVersionId,row});
 }
 return refs;
}

// Thin adapter to the existing authenticated/atomic business API. No parallel configuration store.
export function resourceClient(request){
 return {
  preview:(tables,revision,selection)=>request('/inputs/resource-policy-preview',{tables,revision,selection}),
  start:(revision,selection)=>request('/runs',{revision,selection}),
  runs:()=>request('/runs'),
  async reopen(id){
   const run=await request('/runs/'+encodeURIComponent(id));
   const snapshot=await request('/runs/'+encodeURIComponent(id)+'/inputs');
   const plans=await request('/plans');
   return resourceRunView(run,snapshot,plans.find(p=>p.id===run.planId));
  },
  exportBody:view=>({planId:view.plan.id,resourceLoad:{start:view.load.window.start,end:view.load.window.end,kind:'resources'}})
 };
}
