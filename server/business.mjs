import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { subjectKey } from './auth/store.mjs';
import { defs, seed, calculate } from './planner.ts';
import { validateExpectedSupply, exportSupplyPlanCsv } from '../src/lib/expected-supply.mjs';
import { independentlyVerifyPlan } from '../src/lib/independent-verification.mjs';

// One local application process; mutation + audit are one atomic rename.
// No request body can supply identity, audit fields, or plan status.
export function createBusinessRouter({ dataDir, actorMiddleware, requireMember }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file=path.join(dataDir,'business.json');
  const read=()=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;let legacy=[];try{legacy=JSON.parse(fs.readFileSync(path.join(dataDir,'plans.json'),'utf8'));}catch(old){if(old.code!=='ENOENT')throw old;}return {data:structuredClone(seed),revision:0,plans:legacy.map(p=>({...p,status:'legacy'})),records:[]};}};
  const write=s=>{const tmp=`${file}.${randomUUID()}.tmp`;try{fs.writeFileSync(tmp,JSON.stringify(s),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}};
  const router=Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.use(actorMiddleware,requireMember(['planner','supervisor','query']));
  const permission=(action)=> (req,res,next)=>{
    const m=req.member;
    const allowed= action==='read' || (action==='export' ? m.role!=='query'||m.canExport===true : ['confirm','return','release'].includes(action) ? m.role==='supervisor' : ['planner','supervisor'].includes(m.role));
    if(!allowed){console.info(JSON.stringify({action,decision:'deny',requestId:req.praetorActor.requestId,actor:subjectKey(req.praetorActor)}));return res.status(403).json({error:'forbidden'});}
    if(req.method!=='GET'){
      const site=req.get('sec-fetch-site');const origin=req.get('origin');
      if((site&&!['same-origin','none'].includes(site))||(!site&&origin&&new URL(origin).host!==req.get('host')))return res.status(403).json({error:'csrf'});
      if(typeof req.body?.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>1000)return res.status(400).json({error:'reason_required'});
    }
    next();
  };
  const record=(s,req,action,target,details={})=>s.records.push({id:randomUUID(),action,target,actor:subjectKey(req.praetorActor),role:req.member.role,at:new Date().toISOString(),reason:req.body.reason.trim(),requestId:req.praetorActor.requestId,...details});
  router.get('/meta',permission('read'),(_req,res)=>res.json({release:'R1 prototype + FR-037 supported-flow slice',baseline:'APS v0.3 review draft',supportedRules:['BR-02 precedence','BR-03 exclusive machine overlap','FR-008 calendar','FR-007 personnel'],timeOrigin:'2026-11-02T08:00:00+08:00',interval:'[start,end)',unsupportedWorkflows:['confirm','return','release']}));
  router.get('/session',permission('read'),(req,res)=>res.json({role:req.member.role,canWrite:['planner','supervisor'].includes(req.member.role),canExport:req.member.role!=='query'||req.member.canExport===true}));
  router.get('/state',permission('read'),(_req,res)=>{const s=read();res.json({data:s.data,revision:s.revision});});
  router.get('/operations',permission('read'),(_req,res)=>res.json(read().records));
  router.get('/plans',permission('read'),(_req,res)=>res.json(read().plans));
  router.post('/tables/:table',permission('edit'),(req,res)=>{
    const def=defs.find(d=>d.key===req.params.table);if(!def)return res.status(404).json({error:'unknown_table'});
    const {rows,revision,operation}=req.body;
    if(!Array.isArray(rows)||rows.length>10000||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)||Object.values(r).some(v=>typeof v!=='string')))return res.status(400).json({error:'invalid_rows'});
    const s=read();if(revision!==s.revision)return res.status(409).json({error:'stale_input'});
    if(operation==='import'&&['supplies','supplyDelays','supplyUses'].includes(def.key)){
      const n={...s.data,[def.key]:rows};const issues=validateExpectedSupply({supplies:n.supplies,delays:n.supplyDelays,uses:n.supplyUses,materials:n.materials,orders:n.orders,routes:n.routes});
      if(issues.length)return res.status(400).json({error:'invalid_supply',issues});
    }
    const before=s.data[def.key];s.data[def.key]=rows;s.revision++;
    record(s,req,operation==='import'?'import':'edit',def.key,{before,after:rows});write(s);res.json({data:s.data,revision:s.revision});
  });
  router.post('/calculate',permission('calculate'),(req,res)=>{
    const s=read();if(req.body.revision!==s.revision)return res.status(409).json({error:'stale_input'});
    const plan={...calculate(s.data,s.revision),id:randomUUID(),status:'draft',revision:s.revision};
    s.plans.unshift(plan);record(s,req,'calculate',plan.id);write(s);res.status(201).json(plan);
  });
  // The old arbitrary-snapshot POST is closed: only save a calculated server plan.
  router.post('/plans',permission('edit'),(req,res)=>{
    const s=read(),p=s.plans.find(p=>p.id===req.body.id);if(!p)return res.status(404).json({error:'plan_not_found'});
    if(p.status!=='draft')return res.status(409).json({error:'immutable_plan'});
    record(s,req,'edit',p.id,{kind:'save_snapshot'});write(s);res.status(201).json(p);
  });
  router.post('/plans/:id/verify',permission('edit'),(req,res)=>{
    const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});
    if(p.status!=='draft')return res.status(409).json({error:'immutable_plan'});
    if(p.revision!==s.revision)return res.status(409).json({error:'stale_input'});
    p.verification=independentlyVerifyPlan(p,s.data.orders,s.data.routes,p.rules);record(s,req,'edit',p.id,{kind:'verify'});write(s);res.json(p);
  });
  // FR-025/030 submission, conflict/partial/staleness confirmation and return
  // are not implemented in this slice. Never turn a client status into release.
  for(const action of ['confirm','return','release'])router.post(`/plans/:id/${action}`,permission(action),(_req,res)=>res.status(501).json({error:'workflow_not_supported',action}));
  router.post('/export',permission('export'),(req,res)=>{
    const s=read();let csv,target;
    if(req.body.planId){const p=s.plans.find(p=>p.id===req.body.planId);if(!p)return res.status(404).json({error:'plan_not_found'});csv=exportSupplyPlanCsv(p);target=p.id;}
    else{const d=defs.find(d=>d.key===req.body.table);if(!d)return res.status(404).json({error:'unknown_table'});csv=[d.fields,...s.data[d.key].map(r=>d.fields.map(f=>r[f]||''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');target=d.key;}
    record(s,req,'export',target);write(s);res.type('text/csv').send('\ufeff'+csv);
  });
  router.use((_req,res)=>res.status(404).json({error:'unsupported_action'}));
  router.use((err,_req,res,_next)=>{console.error('business request failed',err.code||'internal_error');res.status(500).json({error:'internal_error'});});
  return router;
}
