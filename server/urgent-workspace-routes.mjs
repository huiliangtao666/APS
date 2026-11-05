import {randomUUID} from 'node:crypto';
import {hash,rows} from './workbook-model.mjs';
import {workbookTables} from './parameter-workbook-export.mjs';
import {DEMAND_FIELDS,assertTarget,urgentError,previewUrgent} from './urgent-order-input.mjs';
import {validateWorkspace,impactClosure,taskZone,WORKSPACE_CONTRACT} from './urgent-workspace-policy.mjs';
import {validateTrace,batchTrace,replacementCheck} from './urgent-workspace-trace.mjs';
import {fingerprint} from './solver-choice/contract.mjs';

export function assertWorkspaceRunIdentity(r){
 if(r.result&&hash(r.result)!==r.resultHash)throw urgentError('URGENT_RESULT_IDENTITY','候选结果指纹不一致',{},409);
 if(r.workspaceSnapshot&&hash(r.workspaceSnapshot)!==r.workspaceSnapshotHash)throw urgentError('URGENT_WORKSPACE_IDENTITY','工作页冻结来源损坏',{},409);
 if(r.solverConditions&&(r.solver?.requested!==r.solverConditions.request?.requested||r.result&&(r.result.solver?.actual!==r.solverConditions.request?.requested||fingerprint(r.result.solver)!==fingerprint(r.solver)||r.result.solver?.conditionsHash!==r.solverConditions.conditionsHash)))throw urgentError('URGENT_SOLVER_IDENTITY','请求/实际引擎或冻结求解条件不一致',{},409);
}

export function liveIdentity(ctx,s,p){const d=ctx.dataset?.(s,p.datasetId);return d?{datasetId:d.id,version:d.version,inputHash:hash(d),parameterRevision:d.parameterRevision||0,parameterHash:hash(rows(d,'配置参数'))}:null;}
export function candidateStaleness(ctx,s,p,r){
 const reasons=[];if(r.urgentRevision!==p.revision)reasons.push('计划/接纳批次/事实/策略修订已变化');
 if(r.urgentImpact?.factsHash!==hash(p.facts))reasons.push('执行事实已变化');
 if(r.workspaceIdentity&&hash(r.workspaceIdentity.live)!==hash(liveIdentity(ctx,s,p)))reasons.push('当前业务数据或P参数已变化');
 return {stale:reasons.length>0,reasons};
}
export function candidateOverride(body){
 const v=body.workspaceOverride;if(v===undefined)return undefined;
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['strategy','scope','seedTaskIds','overtime'].includes(k)))throw urgentError('URGENT_OVERRIDE','本次覆盖仅支持策略、范围、影响起点和明确加班，不改持久配置或执行事实');
 return v;
}
export function registerUrgentWorkspace(router,ctx,helpers){
 const {read,write,audit,actorKey,persist,permission}=ctx,{plan,publicPlan,source,handle}=helpers;
 const edit=(name,fn)=>router.post('/urgent/plans/:id/'+name,permission('edit'),handle((req,res)=>{
  const s=read(),p=plan(s,req.params.id);assertTarget(p,req.body.targetToken);const {d,r}=source(s,p);const result=fn(req,p,d,r,s);p.revision++;audit(s,req,'urgent_workspace_'+name,{planId:p.id,revision:p.revision,workspaceHash:hash(p.workspace||null)});write(s);res.json({plan:publicPlan(p),...result});
 }));
 router.get('/urgent/plans/:id/workspace',permission('read'),handle((req,res)=>{
  const s=read(),p=plan(s,req.params.id),{d,r}=source(s,p),w=p.workspace;
  const candidates=p.runs.map(id=>s.runs.find(r=>r.id===id)).filter(Boolean).map(c=>({id:c.id,status:c.status,failure:c.failure,candidateState:c.candidateState,...candidateStaleness(ctx,s,p,c),strategy:c.workspaceIdentity?.strategy||'legacy',scope:c.workspaceIdentity?.scope,requested:c.solver?.requested,actual:c.solver?.actual,independentCheck:c.result?.verification,arrival:c.urgentImpact?.tabs.urgent.map(x=>({demandId:x.demandId,arrival:x.afterArrival,unplannedQuantity:x.unplannedQuantity,unit:x.unit,conditions:x.reasons})),originalChanges:c.urgentImpact?.stats.changedOriginalOperations??null,overtime:c.workspaceIdentity?.overtime||[],optimality:'本次搜索找到的可行候选；未证明最早或全局最优',inputHash:c.inputHash,resultHash:c.resultHash}));
  res.json({contract:WORKSPACE_CONTRACT,plan:publicPlan(p),workspace:w||null,live:liveIdentity(ctx,s,p),zones:w?r.result.tasks.map(t=>({id:t.id,orderId:t.orderId,start:t.start,end:t.end,machine:t.machine,zone:taskZone(t,p,w)})):[],closure:w?impactClosure(d,p,r.result,w):null,candidates,trace:batchTrace(d,p,r.result),drafts:p.drafts||[]});
 }));
 edit('workspace',(req,p,d)=>{
  const next=validateWorkspace(req.body.workspace,p,d);
  for(const old of p.workspace?.events||[])if(old.knownMinute<=p.facts.observationMinute&&!next.events.some(e=>e.id===old.id&&(old.recoveryConfirmed?hash(e)===hash(old):hash({...e,recoveryConfirmed:old.recoveryConfirmed,recoveryMinute:old.recoveryMinute})===hash(old))))throw urgentError('URGENT_EVENT_FACT','已可知事件的发生/来源不能删除或改写；恢复只能补充确认');
  p.workspaceHistory??=[];p.workspaceHistory.push({revision:p.revision,workspace:p.workspace||null,actor:actorKey(req),at:new Date().toISOString()});p.workspace=next;return {};
 });
 edit('trace',(req,p,d,r)=>{
  const next=validateTrace(req.body.records,p);for(const old of p.trace||[])if(!next.some(x=>x.id===old.id&&hash(x)===hash(old)))throw urgentError('URGENT_TRACE_FACT','已保存实际批次关系不能删除或改写');
  const candidate={...p,trace:next},trace=batchTrace(d,candidate,r.result);p.trace=next;return {trace};
 });
 edit('replacement',(req,p,d,r)=>{const result=replacementCheck(d,p,r.result,req.body);p.replacements??=[];p.replacements.push({...result,id:randomUUID(),actor:actorKey(req),createdAt:new Date().toISOString()});return {replacement:result};});
 edit('drafts',(req,p)=>{
  const row=req.body.row;if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!DEMAND_FIELDS.includes(k)))throw urgentError('URGENT_DRAFT','请按原17列合同录入需求，不接受未知字段');
  p.drafts??=[];const old=p.drafts.find(x=>x.id===req.body.id);if(old&&old.status!=='draft')throw urgentError('URGENT_DRAFT_STATE','接纳或撤回记录不能覆盖，请另建有修订来源的草稿');
  if(old&&old.revision!==req.body.revision)throw urgentError('URGENT_DRAFT_REVISION','草稿修订已变化',{},409);
  const draft={id:old?.id||randomUUID(),revision:(old?.revision||0)+1,row:structuredClone(row),effectiveTime:req.body.effectiveTime,status:'draft',actor:actorKey(req),at:new Date().toISOString()};
  if(old){p.draftHistory??=[];p.draftHistory.push(structuredClone(old));Object.assign(old,draft);}else p.drafts.push(draft);return {draft};
 });
 router.post('/urgent/plans/:id/drafts/:draft/preview',permission('edit'),handle((req,res)=>{
  const s=read(),p=plan(s,req.params.id);assertTarget(p,req.body.targetToken);const draft=p.drafts?.find(x=>x.id===req.params.draft);if(!draft||draft.status!=='draft')throw urgentError('URGENT_DRAFT_STATE','请选择未接纳草稿');
  const {d}=source(s,p),fileName='手工需求-'+draft.id+'.xlsx',buffer=workbookTables([['每日需求',DEMAND_FIELDS,[DEMAND_FIELDS.map(k=>draft.row[k]??'')],'手工需求；沿原17列合同校验']]),preview=previewUrgent(buffer,d,p,{fileName,effectiveTime:draft.effectiveTime});
  const item={...preview,id:randomUUID(),actor:actorKey(req),createdAt:new Date().toISOString(),fileRef:persist({fileBase64:buffer.toString('base64')}),draftId:draft.id,draftRevision:draft.revision,status:'preview'};
  p.previews.push(item);audit(s,req,'urgent_manual_preview',{planId:p.id,draftId:draft.id,previewId:item.id});write(s);const {fileRef,...visible}=item;res.json(visible);
 }));
 router.post('/urgent/plans/:id/batches/:batch/withdraw',permission('edit'),handle((req,res)=>{
  const s=read(),p=plan(s,req.params.id);assertTarget(p,req.body.targetToken);const b=p.batches.find(b=>b.id===req.params.batch);if(!b)throw urgentError('URGENT_BATCH_NOT_FOUND','批次不存在');
  if(b.status==='withdrawn')return res.json({plan:publicPlan(p),idempotent:true});
  if(!String(req.body.reason||'').trim())throw urgentError('URGENT_WITHDRAW_REASON','撤回须明确原因');
  if(ctx.workers.size||s.runs.some(r=>['queued','running','cancelling'].includes(r.status)))throw urgentError('URGENT_RUN_BUSY','计算未释放，不能撤回',{},409);
  const ids=new Set(b.demands.map(r=>r['需求编号'])),{r}=source(s,p),protectedTasks=new Set(p.facts.tasks.filter(f=>f.status!=='not_started').map(f=>f.id));
  if(p.workspace&&r.result.tasks.some(t=>ids.has(t.orderId)&&taskZone(t,p,p.workspace)!=='free'))throw urgentError('URGENT_WITHDRAW_FROZEN','该批次在冻结/半冻结区，撤回会改变受保护任务；请核对策略和事实');
  if(r.result.tasks.some(t=>ids.has(t.orderId)&&protectedTasks.has(t.id))||Object.entries(p.facts.completed).some(([id,q])=>ids.has(id)&&q>0)||p.facts.allocations?.some(f=>f.quantity>0&&ids.has(r.result.allocations[f.index]?.need)))throw urgentError('URGENT_WITHDRAW_EXECUTED','该批次已有执行/锁定/实耗事实，不能撤回抹除；保留原记录待处置');
  b.history??=[];b.history.push({status:b.status,revision:p.revision});b.status='withdrawn';b.withdrawal={actor:actorKey(req),reason:req.body.reason,at:new Date().toISOString(),revision:p.revision+1};p.revision++;
  const draft=p.drafts?.find(x=>x.id===b.draftId);if(draft)draft.status='withdrawn';audit(s,req,'urgent_batch_withdrawn',{planId:p.id,batchId:b.id,revision:p.revision});write(s);res.json({plan:publicPlan(p)});
 }));
 router.get('/urgent/runs/:id/workspace-export',permission('export'),handle((req,res)=>{
  const s=read(),r=s.runs.find(x=>x.id===req.params.id);if(!r?.workspaceSnapshot)throw urgentError('URGENT_WORKSPACE_SNAPSHOT','该运行没有独立工作页冻结来源');
  assertWorkspaceRunIdentity(r);
  res.type('application/json').attachment('插单冻结策略与实际批次-'+r.id+'.json').send(JSON.stringify({runId:r.id,inputHash:r.inputHash,resultHash:r.resultHash,solver:r.solver,independentCheck:r.result?.verification,...r.workspaceSnapshot},null,2));
 }));
}
