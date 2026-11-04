import path from 'node:path';
import {SimulatorStore} from './store.mjs';
import {SimulationError, requireThat as need, fingerprint, copy} from './contract.mjs';
import {validateSpec, precheck, visibleEvents} from './model.mjs';
import {catalog, exportPackage, tableTemplate} from './export.mjs';
import {threeDaySpec} from './example.mjs';

/** No listener, app mount, data imports, solver, exchange adapter or background job is started here.
 * Mount only through the existing authenticated router and its write guard. */
export function registerSimulatorRoutes(router,{root,permission,actorKey,writeGuard,workbookSchema,csvDefs}) {
  for(const [k,v] of Object.entries({permission,actorKey,writeGuard}))need(typeof v==='function','CONTEXT_REQUIRED',k,'须复用现有身份/权限/写入控制');
  need(path.isAbsolute(root)&&path.basename(root)==='independent-simulator','STORE_ROOT','root','须显式专属模拟根目录');
  const fields=catalog(workbookSchema,csvDefs);
  const store=async req=>{const actor=actorKey(req);need(typeof actor==='string'&&actor.length>0,'ACTOR_REQUIRED','actor','未取得现有会话身份',401);
    return new SimulatorStore(path.join(root,fingerprint(actor),'independent-simulator')).init();};
  const handle=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){
    if(res.headersSent)return next(e);
    if(e instanceof SimulationError)return res.status(e.status).json({error:e.code,path:e.path,message:e.message});
    next(e);
  }};
  const get=(route,fn)=>router.get('/simulator'+route,permission('read'),handle(fn));
  const post=(route,fn)=>router.post('/simulator'+route,permission('edit'),writeGuard,handle(fn));
  const body=req=>{need(req.body&&typeof req.body==='object'&&!Array.isArray(req.body),'BODY_REQUIRED','body','请求须为对象');
    need(Buffer.byteLength(JSON.stringify(req.body))<=2*1024*1024,'REQUEST_LIMIT','body','场景操作请求上限2MiB');return req.body;};
  const keys=(req,allowed)=>{const b=body(req);for(const key of Object.keys(b))need(key==='reason'||allowed.includes(key),'UNSUPPORTED_FIELD',key,'未知操作字段；联动保持关闭');
    return Object.fromEntries(Object.entries(b).filter(([k])=>k!=='reason'));};
  get('/catalog',async(_req,res)=>res.json(fields));
  get('/example',async(_req,res)=>res.json({kind:'EXPLICIT_MOCK',description:'三日独立工程样例，非现场默认，PB01额外17分钟工序见文档',spec:threeDaySpec()}));
  get('/branches',async(req,res)=>res.json(await(await store(req)).list()));
  post('/precheck',async(req,res)=>res.json(precheck(validateSpec(keys(req,['spec']).spec))));
  post('/branches',async(req,res)=>{const b=keys(req,['scenario','branch','spec']);res.status(201).json(await(await store(req)).create(b.scenario,b.branch,b.spec));});
  const base='/branches/:scenario/:branch';
  const args=req=>[req.params.scenario,req.params.branch];
  get(base,async(req,res)=>res.json(await(await store(req)).get(...args(req))));
  get(base+'/script',async(req,res)=>{const s=await store(req),d=await s.read(...args(req));res.json({authorView:true,spec:copy(d.spec),specHash:d.specHash});});
  get(base+'/events',async(req,res)=>{const d=await(await store(req)).read(...args(req));
    need(d.lastSuccessfulDate,'NO_CHECKPOINT','checkpoint','尚无成功观测');res.json(visibleEvents(d.spec,d.checkpoints.at(-1).snapshot.cutoff));});
  get(base+'/opening',async(req,res)=>res.json(await(await store(req)).opening(...args(req))));
  get(base+'/operations/:requestId',async(req,res)=>res.json(await(await store(req)).operation(...args(req),req.params.requestId)));
  post(base+'/advance',async(req,res)=>res.json(await(await store(req)).advance(...args(req),keys(req,['requestId','expectedRevision','days']))));
  post(base+'/pause',async(req,res)=>{keys(req,[]);res.json(await(await store(req)).pause(...args(req)));});
  post(base+'/resume',async(req,res)=>res.json(await(await store(req)).resume(...args(req),keys(req,['expectedRevision']).expectedRevision)));
  post(base+'/fork',async(req,res)=>res.status(201).json(await(await store(req)).fork(...args(req),keys(req,['newBranch','checkpointId','expectedRevision','replacementSpec']))));
  get(base+'/compare',async(req,res)=>res.json(await(await store(req)).compare(...args(req),String(req.query.from),String(req.query.to))));
  router.get('/simulator'+base+'/export',permission('export'),handle(async(req,res)=>{
    const d=await(await store(req)).read(...args(req));res.type('application/json').attachment('simulator-'+d.scenario+'-'+d.branch+'.json').send(JSON.stringify(exportPackage(d,fields)));
  }));
  router.get('/simulator/template',permission('export'),handle(async(req,res)=>{
    const out=tableTemplate(fields,String(req.query.model),String(req.query.table));res.type('text/csv').attachment(out.filename).send(out.content);
  }));
  return router;
}
