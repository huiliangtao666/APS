import {randomUUID} from 'node:crypto';
import {hash,rows,workbookReadiness,procurement,workbookSchema} from './workbook-model.mjs';
import {verifyWorkbookPlan} from './workbook-plan.mjs';
export function registerWorkbookRuns(router,ctx) {
 const {read,write,dataset,audit,handle,permission,workerFactory,workers,saveVersion}=ctx;
 const inputOf=r=>ctx.snapshot(r.inputRef);
 const publicRun=r=>{const {inputRef,...result}=r;return result;};
 router.get('/runs',permission('read'),(_req,res)=>res.json(read().runs.map(publicRun)));
 router.get('/runs/:id',permission('read'),(req,res)=>{const r=read().runs.find(r=>r.id===req.params.id);if(!r)return res.status(404).json({error:'run_not_found'});res.json(publicRun(r));});
 router.get('/runs/:id/inputs',permission('read'),(req,res)=>{const r=read().runs.find(r=>r.id===req.params.id);if(!r)return res.status(404).json({error:'run_not_found'});if(hash(inputOf(r))!==r.inputHash)return res.status(409).json({error:'frozen_input_corrupt'});res.json({runId:r.id,input:inputOf(r),inputHash:r.inputHash,selection:r.selection});});
 router.post('/datasets/:id/run',permission('calculate'),handle((req,res)=>{
  const s=read(),d=dataset(s,req.params.id,req.body.version);if(!d)return res.status(404).json({error:'dataset_not_found'});
  if(workers.size>=2)return res.status(429).json({error:'run_capacity'});const ready=workbookReadiness(d);if(!ready.ready)return res.status(422).json({error:'not_ready',issues:ready.issues});
  const selection=req.body.selection||{},start=selection.startDay??1,end=selection.endDay??start+14,current=selection.currentDay??start;
  if(![start,end,current].every(Number.isInteger)||start<current||current<0||end<=start||end>44)throw Error('日窗口无效');
  if(selection.demandIds&&(!Array.isArray(selection.demandIds)||!selection.demandIds.length||selection.demandIds.some(id=>!rows(d,'每日需求').some(r=>r['需求编号']===id))))throw Error('需求选择无效');
  const run={id:randomUUID(),status:'queued',createdAt:new Date().toISOString(),inputRef:ctx.persist(d),inputHash:hash(d),datasetId:d.id,version:d.version,selection:{...selection,startDay:start,endDay:end,currentDay:current},result:null};s.runs.unshift(run);audit(s,req,'workbook_run_created',{runId:run.id,inputHash:run.inputHash});write(s);
  let timer;
  const finish=(status,result,failure)=>{const state=read(),r=state.runs.find(r=>r.id===run.id);if(!r||!['queued','running'].includes(r.status))return;Object.assign(r,{status,result,failure,finishedAt:new Date().toISOString()});audit(state,req,'workbook_run_'+status,{runId:r.id,inputHash:r.inputHash});write(state);clearTimeout(timer);const w=workers.get(run.id);workers.delete(run.id);w?.terminate();};
  try{const executionData={...d,tables:Object.fromEntries(Object.entries(d.tables).filter(([table])=>workbookSchema.tables[table]?.kind==='输入')),referenceSource:{frozenInputHash:run.inputHash,meaning:'参考试算原文保留在冻结对象，不重复进入业务计算'}};const worker=workerFactory({workbookData:executionData,selection:run.selection});workers.set(run.id,worker);timer=setTimeout(()=>finish('failed',null,'计算超时；冻结输入保留，不代表无解'),90000);
   worker.on('message',m=>{if(m?.kind==='progress'){const state=read(),r=state.runs.find(r=>r.id===run.id);if(r?.status==='queued'){r.status='running';r.startedAt=new Date().toISOString();write(state);}}
    else if(m?.kind==='result'&&m.plan){const check=verifyWorkbookPlan(d,m.plan);if(check.status!=='pass')return finish('failed',null,'结果独立检查失败：'+check.issues.join('；'));finish(m.plan.status,m.plan,null);}else finish('failed',null,'计算失败；未保存结果');});
   worker.on('error',()=>finish('failed',null,'Worker执行失败'));worker.on('exit',()=>finish('failed',null,'Worker未返回结果即退出'));
  }catch{finish('failed',null,'Worker无法启动');}
  res.status(202).json(publicRun(read().runs.find(r=>r.id===run.id)));
 }));
 router.post('/runs/:id/verify',permission('calculate'),handle((req,res)=>{const s=read(),r=s.runs.find(r=>r.id===req.params.id);if(!r?.result)return res.status(409).json({error:'result_not_ready'});if(hash(inputOf(r))!==r.inputHash)return res.status(409).json({error:'frozen_input_corrupt'});const verification=verifyWorkbookPlan(inputOf(r),r.result);r.result.verification=verification;audit(s,req,'workbook_verified',{runId:r.id,status:verification.status});write(s);res.json(verification);}));
 router.get('/runs/:id/export',permission('export'),handle((req,res)=>{const r=read().runs.find(r=>r.id===req.params.id);if(!r?.result)return res.status(409).json({error:'result_not_ready'});if(hash(inputOf(r))!==r.inputHash)return res.status(409).json({error:'frozen_input_corrupt'});
  const exportInput=inputOf(r);const body=[['种类','运行编号','数据集','版本','冻结hash','来源profile','业务编号','数量/值','单位','开始日','结束/可用日','来源/状态']];
  const put=(kind,id,value,unit,start,end,source)=>body.push([kind,r.id,r.datasetId,r.version,r.inputHash,exportInput.profile,id,value,unit,start,end,typeof source==='object'?JSON.stringify(source):source]);
  for(const x of r.result.demandResults)put('需求',x.id,x.quantity,x.unit,x.readyDay,x.arrivalDay,{...x.source,status:x.status,lateDays:x.lateDays});
  for(const x of r.result.tasks)put('任务',x.id,x.quantity,'千克',x.start,x.end,{...x.source,resource:x.machine,crew:x.crew,tools:x.tools});
  for(const x of r.result.allocations)put('分配',x.supplyId,x.quantity,'基础单位',x.feedDay,'',{...x.source,materialId:x.materialId,conditional:x.conditional});
  for(const x of r.result.shortages)put('净缺口',x.materialId,x.quantity,x.unit,x.needDay,'',x.source);
  for(const x of r.result.suggestions)put('参考采购建议',x.materialId,x.quantity,x.unit,x.orderDay,x.availableDay,{relationId:x.relationId,lateDays:x.lateDays,need:x.need,netGap:x.netGap});
  put('检查范围','',JSON.stringify(r.result.verification),'','','',r.result.checkScope);put('时间基准','',r.result.dayZero,'自然日','','',r.result.minuteOrigin);
  for(const p of exportInput.bomLossProfiles||[])put('标准投入逐物料损耗',p.productId,JSON.stringify(p.config),'%','','',p.recipe);
  res.type('text/csv; charset=utf-8').attachment('排程冻结结果-'+r.id+'.csv').send('\ufeff'+body.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n'));
 }));
 router.post('/datasets/:id/draft',permission('edit'),(req,res,next)=>{const d=dataset(read(),req.params.id),prior=d?.drafts?.find(r=>req.body.id?r.id===req.body.id:r.sourceRun===req.body.sourceRun&&r.suggestionId===req.body.suggestionId);if(prior&&!req.body.changes&&((req.body.action==='adopt'&&prior.status==='adopted')||(req.body.action==='void'&&prior.status==='void')||(!req.body.id&&!req.body.action)))return res.json({...summaryForDraft(d),draft:prior,idempotent:true,externalDispatch:false});next();},handle((req,res)=>saveVersion(req,res,d=>{
  d.drafts??=[];const prior=req.body.id?d.drafts.find(x=>x.id===req.body.id):null,run=read().runs.find(r=>r.id===req.body.sourceRun),source=run?.result?.suggestions.find(s=>s.id===req.body.suggestionId);
  if(!prior&&!source)throw Error('需先选择本数据集运行产生的采购建议');if(run&&run.datasetId!==d.id)throw Error('建议属于其他数据集');
  const draft=prior||{id:randomUUID(),status:'draft',sourceRun:run.id,suggestionId:source.id,sourceVersion:run.version,netGap:source.netGap,needDay:source.needDay,materialId:source.materialId,unit:source.unit,quantity:source.quantity,relationId:source.relationId,orderDay:source.orderDay,availableDay:source.availableDay,expiryDay:source.availableDay+Number(rows(d,'物料主数据').find(m=>m['物料编号']===source.materialId)['保质天数'])};
  if(req.body.action==='void'){draft.status='void';}else{
   const edits=req.body.changes||{};for(const k of ['quantity','relationId','orderDay','expiryDay','note'])if(Object.hasOwn(edits,k))draft[k]=edits[k];
   const relation=rows(d,'供应商与供货条件').find(s=>s['供货关系编号']===draft.relationId&&s['物料编号']===draft.materialId);if(!relation)throw Error('有效供货关系不存在');
   draft.quantity=Number(draft.quantity);draft.orderDay=Number(draft.orderDay);const needed=procurement(draft.netGap,relation,draft.needDay,Number(req.body.currentDay??1));
   if(!Number.isFinite(draft.quantity)||draft.quantity<Number(relation['最小订货量'])||draft.quantity/Number(relation['订货倍数'])%1!==0)throw Error('草稿数量须满足MOQ及订货倍数');if(!Number.isInteger(draft.orderDay)||draft.orderDay<Number(req.body.currentDay??1))throw Error('不能回填历史下单日');
   draft.availableDay=draft.orderDay+Number(relation['采购导期天数'])+Number(relation['检验天数']);draft.lateDays=Math.max(0,draft.availableDay-draft.needDay);draft.supplierId=relation['供应商编号'];draft.remainingGap=Math.max(0,draft.netGap-draft.quantity);draft.recommendedQuantity=needed.quantity;
   if(!(Number(draft.expiryDay)>draft.availableDay))throw Error('到期日须晚于可用日');if(req.body.action==='adopt')draft.status='adopted';
  }
  draft.version=(draft.version||0)+1;draft.supplyIdentity='draft:'+draft.id;if(!prior)d.drafts.push(draft);return {draft,externalDispatch:false};
 })));
 router.get('/datasets/:id/drafts',permission('read'),(req,res)=>{const m=ctx.meta(read(),req.params.id,req.query.version);if(!m)return res.status(404).end();res.json(m.drafts||[]);});
 return router;
}
function summaryForDraft(d){return {id:d.id,version:d.version};}
