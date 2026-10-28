import { assessRules, ruleCatalog } from '../src/lib/business-rules.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { validateInputs } from './input-validation.mjs';
import { queryCsv } from '../src/lib/data-query.mjs';
import { subjectKey } from './auth/store.mjs';
import { defs, seed, calculate } from './planner.ts';
import { exportSupplyPlanCsv } from '../src/lib/expected-supply.mjs';
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
  router.get('/rules/capabilities',permission('read'),(_req,res)=>res.json(ruleCatalog));
  router.get('/session',permission('read'),(req,res)=>res.json({role:req.member.role,canWrite:['planner','supervisor'].includes(req.member.role),canExport:req.member.role!=='query'||req.member.canExport===true}));
  router.get('/state',permission('read'),(_req,res)=>{const s=read();res.json({data:s.data,revision:s.revision});});
  router.get('/operations',permission('read'),(_req,res)=>res.json(read().records));
  const versionId=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const preserve=s=>{s.inputVersions??={};const id=versionId(s.data);if(!s.inputVersions[id])s.inputVersions[id]={id,revision:s.revision,data:structuredClone(s.data)};return id;};
  const inputs=(s,p)=>{const v=s.inputVersions?.[p.inputVersionId];return v&&v.data&&versionId(v.data)===p.inputVersionId?v:null;};
  router.get('/plans',permission('read'),(_req,res)=>{const s=read();res.json(s.plans.map(p=>({...p,inputSnapshot:inputs(s,p)?.data??null})));});
  router.get('/plans/:id/inputs',permission('read'),(req,res)=>{const s=read(),p=s.plans.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'plan_not_found'});const v=inputs(s,p);if(!v)return res.status(409).json({error:'historical_inputs_unavailable'});res.json(v);});
  function saveInputs(req,res,tables){
    const {revision,operation}=req.body;
    const s=read();if(revision!==s.revision)return res.status(409).json({error:'stale_input'});
    if(operation!==undefined&&!['import','edit','add','copy','delete','restore'].includes(operation))return res.status(400).json({error:'invalid_operation'});
    if(!tables||typeof tables!=='object'||Array.isArray(tables)||!Object.keys(tables).length)return res.status(400).json({error:'invalid_tables'});
    const proposed={...s.data};
    for(const [key,rows] of Object.entries(tables)){
      const def=defs.find(d=>d.key===key);if(!def)return res.status(404).json({error:'unknown_table'});
      if(!Array.isArray(rows)||rows.length>10000||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)||Object.values(r).some(v=>typeof v!=='string')))return res.status(400).json({error:'invalid_rows'});
      if(rows.some(r=>Object.keys(r).some(f=>!def.fields.includes(f))))return res.status(400).json({error:'unknown_fields'});
      proposed[key]=rows.map(r=>Object.fromEntries(def.fields.map(f=>[f,r[f]??''])));
    }
    const newlyEnabled=(proposed.rules||[]).some(r=>r['是否启用']==='是'&&!(s.data.rules||[]).some(old=>old['规则编号']===r['规则编号']&&old['是否启用']==='是'));
    const issues=[...validateInputs(defs,proposed),...(newlyEnabled?assessRules(proposed,new Date().toISOString(),true).issues:[])];if(issues.length)return res.status(400).json({error:'invalid_input',issues});
    // A missing original confirmed snapshot cannot be reconstructed from today's data.
    if(s.plans.some(p=>['confirmed','released'].includes(p.status)&&!inputs(s,p)))return res.status(409).json({error:'protected_history_unavailable'});
    const changes=Object.keys(tables).filter(key=>JSON.stringify(s.data[key])!==JSON.stringify(proposed[key]));
    if(!changes.length)return res.json({data:s.data,revision:s.revision,unchanged:true});
    const before=s.data;const fromVersion=preserve(s);
    s.data=proposed;s.revision++;const toVersion=preserve(s);
    const batchId=randomUUID();
    for(const key of changes)record(s,req,operation||'edit',key,{before:before[key],after:proposed[key],fromVersion,toVersion,batchId});
    write(s);res.json({data:s.data,revision:s.revision,inputVersionId:toVersion});
  }
  router.post('/tables/:table',permission('edit'),(req,res)=>saveInputs(req,res,{[req.params.table]:req.body.rows}));
  router.post('/inputs',permission('edit'),(req,res)=>saveInputs(req,res,req.body.tables));
  router.post('/calculate',permission('calculate'),(req,res)=>{
    const s=read();if(req.body.revision!==s.revision)return res.status(409).json({error:'stale_input'});
    const calculatedAt=new Date().toISOString();
    const issues=[...validateInputs(defs,s.data),...assessRules(s.data,calculatedAt,true).issues];if(issues.length)return res.status(422).json({error:'rule_configuration_blocked',issues});
    const plan={...calculate(s.data,s.revision,calculatedAt),id:randomUUID(),status:'draft',revision:s.revision,inputVersionId:preserve(s)};
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
    if(!p.ruleSnapshot)return res.status(409).json({error:'historical_rules_unavailable'});
    p.verification=independentlyVerifyPlan(p,s.data.orders,s.data.routes,p.rules);record(s,req,'edit',p.id,{kind:'verify'});write(s);res.json(p);
  });
  // FR-025/030 submission, conflict/partial/staleness confirmation and return
  // are not implemented in this slice. Never turn a client status into release.
  for(const action of ['confirm','return','release'])router.post(`/plans/:id/${action}`,permission(action),(_req,res)=>res.status(501).json({error:'workflow_not_supported',action}));
  router.post('/export',permission('export'),(req,res)=>{
    const s=read();let csv,target;
    if(req.body.query){
      const q=req.body.query;
      if(!q||typeof q!=='object'||typeof q.table!=='string'||(q.planId!==undefined&&typeof q.planId!=='string')||(q.filters!==undefined&&(q.filters===null||typeof q.filters!=='object'||Array.isArray(q.filters)||Object.values(q.filters).some(v=>typeof v!=='string'))))return res.status(400).json({error:'invalid_query'});
      if(q.revision!==s.revision)return res.status(409).json({error:'stale_input'});
      let source=s.data;
      if(q.sourcePlanId!==undefined){if(typeof q.sourcePlanId!=='string'||q.planId!==q.sourcePlanId)return res.status(400).json({error:'invalid_query'});const p=s.plans.find(p=>p.id===q.sourcePlanId);if(!p)return res.status(404).json({error:'plan_not_found'});const v=inputs(s,p);if(!v)return res.status(409).json({error:'historical_inputs_unavailable'});source=v.data;}
      try{csv=queryCsv(defs,source,s.plans,s.revision,q);}catch(e){if(['unknown_table','plan_not_found'].includes(e.message))return res.status(404).json({error:e.message});return res.status(500).json({error:'internal_error'});}target=q.table;
    }
    else if(req.body.planId){const p=s.plans.find(p=>p.id===req.body.planId);if(!p)return res.status(404).json({error:'plan_not_found'});if(req.body.ruleSettings===true){if(!p.ruleSnapshot)return res.status(409).json({error:'historical_rules_unavailable'});const fields=['id','category','name','enabled','active','status','scope','effectiveFrom','parameters'];csv=[['能力版本',p.ruleSnapshot.capabilityVersion],['计算时刻',p.ruleSnapshot.at],['输入版本',p.inputVersionId],['始终执行',p.ruleSnapshot.intrinsicChecks.join('；')],['独立复核范围',p.ruleSnapshot.independentChecks.join('；')],['说明',p.ruleSnapshot.note],fields,...p.ruleSnapshot.settings.map(r=>fields.map(f=>typeof r[f]==='object'?JSON.stringify(r[f]):String(r[f])))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');}else csv=exportSupplyPlanCsv(p);target=p.id;}
    else{const d=defs.find(d=>d.key===req.body.table);if(!d)return res.status(404).json({error:'unknown_table'});csv=[d.fields,...s.data[d.key].map(r=>d.fields.map(f=>r[f]||''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');target=d.key;}
    record(s,req,'export',target,req.body.query?{query:req.body.query}:{});write(s);res.type('text/csv').send('\ufeff'+csv);
  });
  router.use((_req,res)=>res.status(404).json({error:'unsupported_action'}));
  router.use((err,_req,res,_next)=>{console.error('business request failed',err.code||'internal_error');res.status(500).json({error:'internal_error'});});
  return router;
}
