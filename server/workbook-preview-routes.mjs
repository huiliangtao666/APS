import {PreviewError,confirmWorkbookPreview,previewCommitStatus,fail} from './workbook-preview.mjs';
import {readWorkbookPreview,exportWorkbookPreview,identify} from './workbook-preview-query.mjs';

/** Integration seam, deliberately NOT registered by this isolated change.
 * ctx uses the existing router's read/write/permission/actorKey. access(req) is
 * SERVER-derived {canEdit,canExport,csrfVerified}; never read it from req.body.
 * applyImport is the existing commit implementation with snapshot/hash validation,
 * import idempotency, dataset version append, table refs and audit, refactored into
 * a synchronous, side-effect-free-on-disk mutator of the provided state clone.
 * The existing /commit MUST call the same confirm helper (or reject module previews).
 * All writes must share one synchronous read/validate/write critical section. If
 * writers span processes, owner must provide the SAME existing cross-process lock.
 */
export function registerWorkbookPreviewRoutes(router,ctx){
  for(const k of ['read','write','permission','actorKey','access','applyImport'])if(typeof ctx[k]!=='function')throw Error('Missing preview integration dependency: '+k);
  const handle=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>{
    if(res.headersSent){res.destroy(e);return;}
    if(!(e instanceof PreviewError))return next(e);
    res.status(e.status).json({error:e.code,...e.detail});
  });
  const get=req=>{const p=ctx.read().previews.find(p=>p.id===req.params.id);if(!p)fail('PREVIEW_REMOVED',410);return p;};
  router.get('/previews/:id/summary',ctx.permission('read'),handle((req,res)=>res.json(readWorkbookPreview(get(req),req.query,'summary',ctx.access(req)))));
  for(const kind of ['records','fields','value','issues','locations','anchors'])
    router.get('/previews/:id/'+kind,ctx.permission('read'),handle((req,res)=>res.json(readWorkbookPreview(get(req),req.query,kind))));
  router.get('/previews/:id/export',ctx.permission('export'),handle(async(req,res)=>{
    const v=get(req).previewModule;identify(v,req.query);
    // Evaluate the iterator before sending headers: invalid scope never yields an empty success file.
    const iterator=exportWorkbookPreview(v,req.query),first=iterator.next();
    res.type('application/x-ndjson').set('Content-Disposition','attachment; filename="workbook-preview-'+req.query.scope+'.ndjson"');
    for(let step=first;!step.done;step=iterator.next()){
      if(res.destroyed)return;
      if(!res.write(step.value))await new Promise(resolve=>{
        const done=()=>{res.off('drain',done);res.off('close',done);resolve();};
        res.once('drain',done);res.once('close',done);
      });
    }
    res.end();
  }));
  router.post('/previews/:id/confirm',ctx.permission('edit'),handle((req,res)=>{
    if(req.params.id!==req.body.previewId)fail('BINDING_CHANGED');
    const out=confirmWorkbookPreview(ctx.read(),req.body,{...ctx.access(req),actor:ctx.actorKey(req)},ctx.applyImport);
    if(out.write)ctx.write(out.state);res.json(out.result);
  }));
  router.get('/previews/:id/commit-status',ctx.permission('read'),handle((req,res)=>{
    res.json(previewCommitStatus(ctx.read(),{previewId:req.params.id,idempotencyKey:String(req.query.idempotencyKey||'')},ctx.actorKey(req)));
  }));
  return router;
}
