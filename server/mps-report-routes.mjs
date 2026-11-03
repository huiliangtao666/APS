import {workbookQueryContext,workbookQueryBoundContext} from './workbook-query-report-context.mjs';
import {mpsReportDomain} from './mps-report-domain.mjs';
import {mpsFail} from './mps-report.mjs';

/** Read-only GET seam; existing actor and read/export permission controls apply. */
export function registerMpsReportRoutes(router,ctx){
 for(const key of ['read','dataset','snapshot','permission','actorKey'])if(typeof ctx[key]!=='function')throw Error('Missing MPS context '+key);
 const parse=req=>{let q;try{const raw=req.query.request;if(typeof raw!=='string'||Buffer.byteLength(raw)>16000)mpsFail('MPS_REQUEST_LIMIT');q=JSON.parse(raw);}catch(e){if(e.code)throw e;mpsFail('MPS_REQUEST_INVALID');}if(!q||Array.isArray(q)||typeof q!=='object')mpsFail('MPS_REQUEST_INVALID');return q;};
 const handle=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>{if(res.headersSent){res.destroy(e);return;}if(!e.code&&!e.status)return next(e);res.status(e.status||422).json({error:e.code||'MPS_INVALID',message:e.message});});
 const json=(res,out)=>{const body=JSON.stringify(out);if(Buffer.byteLength(body)>256*1024)mpsFail('MPS_RESPONSE_LIMIT',413);res.type('application/json').send(body);};
 router.get('/mps-report/context',ctx.permission('read'),handle((req,res)=>{const q=parse(req),v=workbookQueryContext(ctx,q,ctx.actorKey(req));json(res,{...mpsReportDomain.catalog(v),identity:v.identity});}));
 for(const kind of ['options','query','matrix','detail','source'])router.get('/mps-report/'+kind,ctx.permission('read'),handle((req,res)=>{const q=parse(req),v=workbookQueryBoundContext(ctx,q.identity,ctx.actorKey(req));json(res,{...mpsReportDomain[kind](v,q),identity:v.identity});}));
 router.get('/mps-report/export',ctx.permission('export'),handle(async(req,res)=>{
  const q=parse(req),v=workbookQueryBoundContext(ctx,q.identity,ctx.actorKey(req)),out=mpsReportDomain.export(v,q),iterator=out.chunks[Symbol.iterator]();
  const first=iterator.next();res.type(out.type).set('Content-Disposition','attachment; filename="'+out.filename+'"');
  try{for(let step=first;!step.done;step=iterator.next()){
   if(res.destroyed)return;
   if(!res.write(step.value))await new Promise(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});
  }res.end();}finally{iterator.return?.();}
 }));
 return router;
}
