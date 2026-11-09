import {randomUUID} from 'node:crypto';
import {newDaily,confirm,feedback,synchronize,sourceToken,closeDay,balances,ready,DOMAINS,invalidate} from './daily-model.mjs';
import {workbookOpening,projectDaily,adoptDaily,rebaseDaily,rememberSource} from './daily-workbook.mjs';
import {requireThat as need,fingerprint,id,date} from './simulator/contract.mjs';

/** Linked targets are opt-in and use the existing workbook state as the one
 * commit pointer. A checkpoint and its request receipt share that same write. */
export function registerDailyRoutes(router,ctx){
 const {read,write,dataset,persist,tableRefs,summary,permission,actorKey}=ctx;
 const wrap=fn=>(req,res,next)=>{try{fn(req,res);}catch(e){if(e.code&&e.status)return res.status(e.status).json({error:e.code,path:e.path,message:e.message});next(e);}};
 const get=(p,fn)=>router.get('/daily'+p,permission('read'),wrap(fn));
 const post=(p,fn)=>router.post('/daily'+p,permission('edit'),wrap(fn));
 const branch=(s,req)=>{const b=s.dailyBranches?.find(b=>b.id===req.params.branchId);need(b&&b.actor===actorKey(req),'DAILY_NOT_FOUND','branch','每日目标不存在',404);return b;};
 const publishDataset=(s,d,b)=>{const projected=projectDaily(d,b);if(fingerprint(projected.tables)===fingerprint(d.tables)&&d.dailyContext?.branchId===b.id&&d.dailyContext?.date===b.date){rememberSource(b,d);return d;}projected.version=d.version+1;projected.createdAt=new Date().toISOString();const ref=persist(projected),entry={...summary(projected),ref,tableRefs:tableRefs(projected,ref)};s.datasets.find(x=>x.id===d.id).versions.push(entry);b.sourceToken=sourceToken(projected);b.sourceRef=ref;rememberSource(b,projected);return projected;};
 const view=(b,d)=>{const changed=b.sourceToken!==sourceToken(d),visible=structuredClone(b);rebaseDaily(visible,d);synchronize(visible,d);delete visible.sourceBaseline;return {...visible,events:visible.events.filter(e=>e.knownDate<=b.date),balances:balances(visible),ready:ready(visible),sourceChanged:changed,windowEnd:new Date(Math.min(Date.parse(b.endDate),Date.parse(b.date)+(b.windowDays-1)*86400000)).toISOString().slice(0,10)};};
 const transact=(req,res,fn,{project=true,allowEnded=false}={})=>{
  const s=read(),b=branch(s,req),body=req.body;id(body.requestId,'requestId');
  const signature=fingerprint({action:req.route.path,body:Object.fromEntries(Object.entries(body).filter(([k])=>k!=='reason'))}),key=b.id+':'+body.requestId;
  const old=s.dailyReceipts?.[key];if(old){need(old.signature===signature,'DAILY_REQUEST_CONFLICT','requestId','同请求编号内容不同',409);return res.json({...old.result,replayed:true});}
  need(allowEnded||!b.ended,'DAILY_ENDED','date','已结日只读，需另建分支');need(body.expectedRevision===b.revision,'DAILY_REVISION_CONFLICT','revision','每日修订已变化，请刷新后重试',409);
  let d=dataset(s,b.datasetId);rebaseDaily(b,d);synchronize(b,d);const result=fn(s,b,d);
  b.revision++;if(project)d=publishDataset(s,d,b);
  const response={requestId:body.requestId,committed:true,branchId:b.id,revision:b.revision,date:b.date,ended:b.ended,result:result??null};
  (s.dailyReceipts??={})[key]={signature,result:response};
  ctx.audit(s,req,'daily_commit',{branchId:b.id,revision:b.revision,date:b.date,operation:req.route.path,requestId:body.requestId});write(s);res.json(response);
 };
 get('/branches',(req,res)=>{const s=read();res.json((s.dailyBranches||[]).filter(b=>b.actor===actorKey(req)).map(b=>({id:b.id,scenario:b.scenario,datasetId:b.datasetId,date:b.date,revision:b.revision,ended:b.ended})));});
 post('/branches',(req,res)=>{
  const s=read(),d=dataset(s,req.body.datasetId);need(d,'DAILY_DATASET_REQUIRED','datasetId','请选择已导入的隔离数据集');
  need(!(s.dailyBranches||[]).some(b=>b.id===req.body.id||b.datasetId===d.id),'DAILY_BRANCH_EXISTS','id','目标已存在或数据集已有每日分支',409);
  const b=newDaily(req.body,workbookOpening(d,req.body.policies),d);b.actor=actorKey(req);b.policies=structuredClone(req.body.policies);rememberSource(b,d);(s.dailyBranches??=[]).push(b);publishDataset(s,d,b);write(s);res.status(201).json(view(b,dataset(s,b.datasetId)));
 });
 get('/:branchId',(req,res)=>{const s=read(),b=branch(s,req);res.json(view(b,dataset(s,b.datasetId)));});
 get('/:branchId/operations/:requestId',(req,res)=>{const s=read(),b=branch(s,req),receipt=s.dailyReceipts?.[b.id+':'+req.params.requestId];res.status(receipt?200:404).json(receipt?.result||{error:'DAILY_NOT_COMMITTED',requestId:req.params.requestId});});
 get('/:branchId/history/:day',(req,res)=>{const s=read(),b=branch(s,req),entry=b.history.find(h=>h.date===req.params.day);need(entry,'DAILY_HISTORY_NOT_FOUND','day','尚无成功日结',404);res.json({...entry,balances:balances({...b,date:entry.date,state:entry.state}),readOnly:true});});
 get('/:branchId/export',(req,res)=>{const s=read(),b=branch(s,req);res.attachment('daily-'+b.id+'.json').json({contract:'aps-linked-daily@1',branch:b,source:dataset(s,b.datasetId),receipts:Object.fromEntries(Object.entries(s.dailyReceipts||{}).filter(([k])=>k.startsWith(b.id+':')))});});
 post('/:branchId/confirm',(req,res)=>transact(req,res,(_s,b)=>confirm(b,req.body.domain,req.body.source,req.body.unchanged)));
 post('/:branchId/preview',(req,res)=>{
  const s=read(),b=branch(s,req);need(!b.ended,'DAILY_ENDED','date','历史只读');const {domain,channel,facts}=req.body;
  need(DOMAINS.includes(domain)&&['local-mock','online'].includes(channel),'DAILY_CHANNEL','channel','Excel请使用原整本导入预览/接纳；接口首轮须标明local-mock');
  need(Array.isArray(facts)&&facts.length<=1000,'DAILY_INPUT_LIMIT','facts','每次最多1000项');const work=structuredClone(b),d=dataset(s,b.datasetId);rebaseDaily(work,d);synchronize(work,d);
  const types={demand:['demand','demand-revise','demand-cancel','ship'],inventory:['stocktake','quality','scrap','expire','lot-location'],production:['consume','output','resource'],replenishment:['purchase-draft','purchase-issue','purchase-cancel','purchase-delay','receive']};for(const f of facts){need(types[domain].includes(f.type),'DAILY_DOMAIN_FACT','facts','反馈类型与所选领域不符');feedback(work,{...f,channel});}
  const preview={id:randomUUID(),branchId:b.id,revision:b.revision,sourceToken:sourceToken(d),domain,channel,facts,hash:fingerprint(facts),balances:balances(work)};
  (s.dailyPreviews??=[]).push(preview);write(s);res.json(preview);
 });
 post('/:branchId/accept',(req,res)=>transact(req,res,(s,b)=>{
  const p=s.dailyPreviews?.find(p=>p.id===req.body.previewId&&p.branchId===b.id);if(p?.accepted)return {channel:p.channel,sourceHash:p.hash,duplicate:true};need(p&&p.revision===b.revision&&p.sourceToken===b.sourceToken,'DAILY_PREVIEW_STALE','previewId','预览或其引用已变化',409);
  const results=p.facts.map(f=>feedback(b,{...f,channel:p.channel}));p.accepted=true;return {channel:p.channel,sourceHash:p.hash,results};
 },{project:true}));
 post('/:branchId/feedback',(req,res)=>transact(req,res,(_s,b,d)=>{const f=req.body.fact;if(f.type==='lot-location'&&f.data.locationDefinition){const row=f.data.locationDefinition;need(row['库位编号']===f.data.location&&Number(row['最大容量'])>=0,'DAILY_LOCATION','locationDefinition','须给出同一新库位及容量');need(!d.tables['库区库位'].some(r=>r['库位编号']===row['库位编号']),'DAILY_LOCATION_EXISTS','location','库位已存在');d.tables['库区库位'].push(structuredClone(row));}return feedback(b,f);},{project:true}));
 post('/:branchId/events',(req,res)=>transact(req,res,(_s,b)=>{
  const e=req.body.event;id(e.id,'event.id');for(const k of ['knownDate','occurredDate','effectiveDate'])date(e[k]);need(e.source&&e.occurredDate<=e.knownDate,'DAILY_EVENT_SOURCE',e.id,'事件缺来源或时间不合法');
  const prior=b.events.find(x=>x.id===e.id);need(!prior||fingerprint(prior)===fingerprint(e),'DAILY_EVENT_CONFLICT',e.id,'事件身份冲突',409);if(!prior)b.events.push(structuredClone(e));invalidate(b,['production','replenishment']);
 }));
 post('/:branchId/plan',(req,res)=>transact(req,res,(s,b,d)=>{
  const r=s.runs.find(r=>r.id===req.body.runId);need(['save','adopt','discard'].includes(req.body.action),'DAILY_PLAN_ACTION','action','请选择保存、采用或放弃');
  need(r&&r.dailyContext?.branchId===b.id,'DAILY_PLAN_SOURCE','runId','须使用本日真实运行');
  if(req.body.action==='adopt')return adoptDaily(b,r,d);
  need(r.result&&r.dailyContext.date===b.date,'DAILY_PLAN_NOT_READY','runId','尚无本日结果');b.candidate={runId:r.id,status:req.body.action==='save'?'saved':'discarded',stale:r.dailyContext.sourceToken!==b.sourceToken};return b.candidate;
 }));
 post('/:branchId/close',(req,res)=>transact(req,res,(s,b)=>{need(!s.runs.some(r=>r.datasetId===b.datasetId&&['queued','running','cancelling'].includes(r.status)),'DAILY_PENDING_RUN','runs','先等待当前运行结束');const next=closeDay(b,req.body);Object.assign(b,next);return {checkpoint:b.history.at(-1).hash};},{project:true}));
 post('/:branchId/fork',(req,res)=>transact(req,res,(s,b,d)=>{
  const h=b.history.find(h=>h.date===req.body.day);need(h,'DAILY_HISTORY_NOT_FOUND','day','请选择已结日');const newId=id(req.body.newBranch,'newBranch');need(!s.dailyBranches.some(x=>x.id===newId),'DAILY_BRANCH_EXISTS',newId,'分支已存在',409);
  const fork={...structuredClone(b),id:newId,datasetId:'daily-'+randomUUID(),date:h.date,state:structuredClone(h.state),facts:structuredClone(h.facts),confirmations:{},history:b.history.filter(x=>x.date<h.date),revision:0,ended:false,parent:{branchId:b.id,checkpoint:h.hash},candidate:null,adopted:structuredClone(h.adopted)};
  const copy={...structuredClone(d),id:fork.datasetId,version:1};s.datasets.push({id:copy.id,versions:[],imports:[]});s.dailyBranches.push(fork);publishDataset(s,copy,fork);return {branchId:fork.id,datasetId:fork.datasetId};
 },{allowEnded:true}));
 return router;
}
