import {verifyResourcePolicies} from './verify-resource-policies.mjs';
import {resourceLoad} from './resource-load.mjs';
import {personnelCandidates,skillsOf} from './resource-policies.mjs';

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
 // Failed tasks have no reservation or task geometry. Use only the producer's
 // explicit structured context; never parse an identifier or translated text.
 const contexts=(view.findings||[]).filter(f=>(f.taskIds||[]).some(id=>taskIds.includes(id))&&f.context?.orderId&&f.context?.operation).map(f=>({orderId:f.context.orderId,operation:f.context.operation,machine:f.context.machineId}));
 const selected=[...tasks,...contexts],same=r=>selected.some(t=>t.orderId===r['订单编号']&&t.operation===r['工序编号']);
 const dependencies=(input.dependencies||[]).filter(same);
 const originalDependencies=(input.originalDependencies||[]).filter(same);
 const claims=(input.resourceClaims||[]).filter(same);
 const reservations=view.reservations.filter(r=>(r.taskIds||[r.taskId]).some(id=>taskIds.includes(id)));
 const personnelIds=new Set([...dependencies.filter(r=>r['资源类型']==='人员技能').flatMap(personnelCandidates),...reservations.filter(r=>r.type==='人员').map(r=>r.resourceId)]);
 const toolIds=new Set([...claims.filter(r=>r['资源类型']==='工装').map(r=>r['资源编号']),...reservations.filter(r=>r.type==='工装').map(r=>r.resourceId)]);
 const personnelGroups=(input.personnelGroups||[]).filter(g=>personnelIds.has(g['人员组编号']));
 const poolIds=new Set(personnelGroups.map(g=>g.poolId).filter(Boolean));
 // Mapping is the only authority connecting original05/06 and runtime IDs.
 const resourceMappings=(input.resourceMappings||[]).filter(m=>m['来源类别']==='originalTools'?toolIds.has(m['运行编号']):m['来源类别']==='originalPersonnel'&&personnelIds.has(m['运行编号']));
 const originalTools=(input.originalTools||[]).filter(t=>resourceMappings.some(m=>m['来源类别']==='originalTools'&&m['来源编号']===t['资源编号']));
 const originalPersonnel=(input.originalPersonnel||[]).filter(g=>resourceMappings.some(m=>m['来源类别']==='originalPersonnel'&&m['来源编号']===g['人员组编号']));
 const machines=(input.machines||[]).filter(m=>selected.some(t=>t.machine===m['设备编号']));
 const calendars=new Set(machines.map(m=>m['日历编号']?.trim()||input.calendars?.[0]?.['日历编号']));
 const skillSubstitutions=(input.skillSubstitutions||[]).filter(s=>dependencies.some(d=>d['资源类型']==='人员技能'&&d['所需技能']===s['所需技能']&&(s['适用工序']==='*'||s['适用工序']===d['工序编号'])&&personnelGroups.some(g=>personnelCandidates(d).includes(g['人员组编号'])&&skillsOf(g['技能']).includes(s['可提供技能']))));
 const originalResourceEvents=(input.originalResourceEvents||[]).filter(r=>{try{const doc=JSON.parse(r['原账JSON']);return (doc.facts||[]).some(f=>same(f.snapshot||{}))||(doc.identities||[]).some(i=>i.type==='人员'&&poolIds.has(i.currentId)||i.type==='工装'&&toolIds.has(i.currentId));}catch{return false;}});
 const tables={originalDependencies,dependencies,resourceClaims:claims,originalTools,originalPersonnel,resourceMappings,tools:(input.tools||[]).filter(t=>toolIds.has(t['工装编码'])),personnelGroups,personnelPools:(input.personnelPools||[]).filter(p=>poolIds.has(p.poolId)),skillSubstitutions,machines,calendars:(input.calendars||[]).filter(r=>calendars.has(r['日历编号'])),resourceStops:(input.resourceStops||[]).filter(r=>r['资源类型']==='人员'?personnelIds.has(r['资源编号']):r['资源类型']==='工装'&&toolIds.has(r['资源编号'])),originalResourceEvents};
 for(const [table,rows] of Object.entries(tables))for(const row of rows){
  const index=input[table].indexOf(row),source=view.plan.inputCsvSources?.[table];
  // Preserve frozen logical positions when no independently matching CSV row exists.
  const csvMatches=source?.canonicalRows?.[index]&&JSON.stringify(source.canonicalRows[index])===JSON.stringify(row);
  refs.push({table,index,physicalRow:csvMatches?(source.records?.[index]?.line??source.lines?.[index]??null):null,canonicalRow:index+2,file:source?.file??null,sourceSha256:csvMatches?(source.sha256??null):null,inputVersionId:view.run.inputVersionId,row});
 }
 // Process producers bind their occurrences through makePlan/bindProblemSource.
 // Accept only this run's verified original record; never resolve against edits.
 for(const ref of tasks.flatMap(t=>t.processSources||[])){
  const index=ref.origin?.occurrence?.index,table=ref.table;
  if(ref.origin?.inputVersionId!==view.run.inputVersionId||!Number.isInteger(index)||JSON.stringify(input[table]?.[index])!==JSON.stringify(ref.row))continue;
  if(refs.some(r=>r.table===table&&r.index===index))continue;
  refs.push({table,index,physicalRow:ref.csv?.physicalRow??null,canonicalRow:index+2,file:ref.csv?.file??null,sourceSha256:ref.csv?.sha256??null,inputVersionId:view.run.inputVersionId,row:ref.row});
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
