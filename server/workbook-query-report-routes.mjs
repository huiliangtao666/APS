import {workbookQueryContext,workbookQueryBoundContext} from './workbook-query-report-context.mjs';
import {workbookReportDomain} from './workbook-query-report-adapter.mjs';
import {hash} from './workbook-model.mjs';

/** Transport-only seam. domain implements the Test-owned query projection API;
 * its canonical module adapter is supplied by the serial integrator after source
 * delivery. This file never computes a report or stores a parallel result ledger.
 */
export function registerWorkbookQueryReportRoutes(router,ctx,domain=workbookReportDomain,prefix='/query-reports'){
  for(const key of ['read','dataset','snapshot','permission','actorKey'])if(typeof ctx[key]!=='function')throw Error('Missing workbook query context: '+key);
  for(const key of ['catalog','options','query','detail','export'])if(typeof domain[key]!=='function')throw Error('Missing query domain adapter: '+key);
  const bad=(code,status=422)=>{throw Object.assign(Error(code),{code,status});};
  const parse=req=>{
    const raw=req.query.request;
    if(typeof raw!=='string'||Buffer.byteLength(raw)>16000)bad('QUERY_REQUEST_INVALID');
    let q;try{q=JSON.parse(raw);}catch{bad('QUERY_REQUEST_INVALID');}
    if(!q||typeof q!=='object'||Array.isArray(q))bad('QUERY_REQUEST_INVALID');
    return q;
  };
  const handle=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>{
    if(res.headersSent){res.destroy(e);return;}
    if(!e.code&&!e.status)return next(e);
    const status=Number.isInteger(e.status)&&e.status>=400&&e.status<=599?e.status:422;
    res.status(status).json({error:e.code||'QUERY_INVALID',message:e.message});
  });
  const respond=(res,value)=>{
    const data=JSON.stringify(value);
    if(Buffer.byteLength(data)>256*1024)bad('QUERY_RESPONSE_LIMIT',413);
    res.type('application/json').send(data);
  };
  const source=(q,req)=>workbookQueryBoundContext(ctx,q.identity,ctx.actorKey(req));
  router.get(prefix+'/context',ctx.permission('read'),handle((req,res)=>{
    const q=parse(req),value=workbookQueryContext(ctx,q,ctx.actorKey(req));
    respond(res,{...domain.catalog(value),preferenceScope:hash(ctx.actorKey(req)),identity:value.identity});
  }));
  for(const kind of ['options','query','detail','value'])router.get(prefix+'/'+kind,ctx.permission('read'),handle((req,res)=>{
    const q=parse(req),value=source(q,req);
    respond(res,{...domain[kind](value,q),identity:value.identity});
  }));
  router.get(prefix+'/export',ctx.permission('export'),handle(async(req,res)=>{
    const q=parse(req),value=source(q,req),output=domain.export(value,q);
    const iterator=output[Symbol.iterator](),first=iterator.next();
    res.type('application/x-ndjson').set('Content-Disposition','attachment; filename="query-report.ndjson"');
    for(let step=first;!step.done;step=iterator.next()){
      if(res.destroyed)return;
      if(typeof step.value!=='string'&&!Buffer.isBuffer(step.value))bad('QUERY_EXPORT_CHUNK_INVALID');
      if(!res.write(step.value))await new Promise(resolve=>{
        const done=()=>{res.off('drain',done);res.off('close',done);resolve();};
        res.once('drain',done);res.once('close',done);
      });
    }
    res.end();
  }));
  return router;
}
