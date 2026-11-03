import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,PROFILE} from '../server/workbook-model.mjs';
import {workbookQueryContext,workbookQueryBoundContext} from '../server/workbook-query-report-context.mjs';
import {registerWorkbookQueryReportRoutes} from '../server/workbook-query-report-routes.mjs';

function fixture(){
  const old={id:'fixture',version:1,fileHash:'synthetic-file',profile:PROFILE,mapping:{version:'synthetic'},tables:{配置参数:[],物料主数据:[{物料编号:'M1',名称:'历史名称'}]}};
  const latest=structuredClone(old);latest.version=2;latest.tables.物料主数据[0].名称='当前名称';
  const result={status:'completed',source:{datasetId:old.id,version:old.version,fileHash:old.fileHash,mappingHash:hash(old.mapping),parameterHash:hash([])},conditions:{startDay:1,endDay:15,interval:'[start,end)'},tasks:[]};
  const run={id:'frozen',datasetId:old.id,version:1,inputRef:'original',inputHash:hash(old),status:'completed',result,resultHash:hash(result),selection:{startDay:1,endDay:15},provenance:{dayZero:'2026-10-31',timeUnit:'day'}};
  const state={datasets:[],runs:[run]};let writes=0;
  const ctx={actorKey:()=> 'synthetic-actor',read:()=>state,snapshot:ref=>{assert.equal(ref,'original');return old;},dataset:(_s,id,v)=>id==='fixture'?v===1?old:v===2?latest:undefined:undefined,write:()=>writes++,permission:action=>(req,res,next)=>{if(action==='export'&&!req.canExport)return res.status(403).json({error:'forbidden'});next();}};
  return {old,latest,run,state,ctx,writes:()=>writes};
}
test('explicit historical version and frozen run never read latest or mutate authority',()=>{
  const f=fixture(),before=JSON.stringify(f);
  const current=workbookQueryContext(f.ctx,{datasetId:'fixture',version:2});
  const historical=workbookQueryContext(f.ctx,{datasetId:'fixture',version:1});
  const frozen=workbookQueryContext(f.ctx,{datasetId:'fixture',version:1,runId:'frozen'});
  assert.equal(current.input.tables.物料主数据[0].名称,'当前名称');
  assert.equal(historical.input.tables.物料主数据[0].名称,'历史名称');
  assert.equal(frozen.input.tables.物料主数据[0].名称,'历史名称');
  frozen.input.tables.物料主数据[0].名称='projection edit';frozen.run.result.tasks.push({id:'not real'});
  assert.equal(f.old.tables.物料主数据[0].名称,'历史名称');assert.deepEqual(f.run.result.tasks,[]);
  assert.equal(JSON.stringify(f),before);assert.equal(f.writes(),0);
  assert.notEqual(current.identity.fingerprint,historical.identity.fingerprint);
  assert.notEqual(frozen.identity.fingerprint,historical.identity.fingerprint);
});
test('missing, mixed, invalid and unsupported contexts fail explicitly',()=>{
  const f=fixture();
  for(const ref of [{datasetId:'fixture'},{datasetId:'fixture',version:0},{datasetId:'fixture',version:1,scope:'other-user'},{datasetId:'fixture',version:2,runId:'frozen'}])assert.throws(()=>workbookQueryContext(f.ctx,ref));
  assert.throws(()=>workbookQueryContext(f.ctx,{datasetId:'fixture',version:3}),{code:'DATASET_NOT_FOUND'});
  assert.throws(()=>workbookQueryContext(f.ctx,{datasetId:'fixture',version:1,runId:'unknown'}),{code:'RUN_NOT_FOUND'});
  f.old.profile='unrecognized-profile';assert.throws(()=>workbookQueryContext(f.ctx,{datasetId:'fixture',version:1}),{code:'DAY_ZERO_NOT_PROVIDED'});
});
test('fingerprint, input, result, parameters and selection corruption cannot silently return empty success',()=>{
  for(const mutate of [f=>f.old.tables.物料主数据[0].名称='tampered',f=>f.run.result.tasks.push({id:'tampered'}),f=>{f.run.result.source.parameterHash='other';f.run.resultHash=hash(f.run.result);},f=>f.run.selection.endDay=16]){
    const f=fixture();mutate(f);assert.throws(()=>workbookQueryContext(f.ctx,{datasetId:'fixture',version:1,runId:'frozen'}));
  }
  const f=fixture(),value=workbookQueryContext(f.ctx,{datasetId:'fixture',version:1});
  assert.throws(()=>workbookQueryBoundContext(f.ctx,{...value.identity,fingerprint:'wrong'}),{code:'CONTEXT_MISMATCH'});
  assert.throws(()=>workbookQueryBoundContext(f.ctx,{...value.identity,parameterHash:'wrong'}),{code:'CONTEXT_MISMATCH'});
  assert.deepEqual(workbookQueryBoundContext(f.ctx,value.identity).identity,value.identity);
});
function transport(f){
  const routes=new Map(),router={get:(path,...handlers)=>routes.set(path,handlers)};
  const called=[];
  const domain={catalog:()=>({views:[]}),query:()=>({records:[],total:0}),options:()=>({items:[]}),value:()=>({}),detail:()=>({records:[]}),export:function*(value,q){called.push({value,q});if(q.queryFingerprint!=='valid')throw Object.assign(Error('stale'),{code:'QUERY_CHANGED',status:409});yield JSON.stringify({identity:value.identity,value:'=literal'})+'\n';}};
  registerWorkbookQueryReportRoutes(router,f.ctx,domain);
  async function request(kind,payload,canExport=false){
    const req={query:{request:JSON.stringify(payload)},canExport},res={statusCode:200,headersSent:false,headers:{},body:'',status(s){this.statusCode=s;return this;},json(b){this.body=b;return this;},type(t){this.headers.type=t;return this;},set(k,v){this.headers[k]=v;return this;},send(b){this.body=b;return this;},write(b){this.headersSent=true;this.body+=b;return true;},end(){this.ended=true;},destroy(e){this.destroyed=e;}};
    const handlers=routes.get('/query-reports/'+kind);let index=0;
    const next=e=>{if(e)throw e;return handlers[index++]?.(req,res,next);};
    await next();await new Promise(resolve=>setImmediate(resolve));return res;
  }
  return {request,called};
}
test('actual read/export transport registration checks permission and binding before streaming',async()=>{
  const f=fixture(),t=transport(f),identity=workbookQueryContext(f.ctx,{datasetId:'fixture',version:1}).identity;
  const denied=await t.request('export',{identity,queryFingerprint:'valid'});assert.equal(denied.statusCode,403);assert.equal(t.called.length,0);
  const stale=await t.request('export',{identity,queryFingerprint:'wrong'},true);assert.equal(stale.statusCode,409);assert.equal(stale.headersSent,false);
  const changed=await t.request('query',{identity:{...identity,inputHash:'wrong'}});assert.equal(changed.statusCode,409);
  const success=await t.request('export',{identity,queryFingerprint:'valid'},true);assert.equal(success.statusCode,200);assert.equal(success.ended,true);assert.equal(JSON.parse(success.body).value,'=literal');assert.equal(f.writes(),0);
});

import {workbookReportDomain as domain} from '../server/workbook-query-report-adapter.mjs';
function connected(){
 const f=fixture();f.old.dayZero='2026-10-31';
 f.old.tables.物料主数据=Array.from({length:205},(_,i)=>({'物料编号':'M'+String(i).padStart(3,'0'),'物料名称':'物料 '+i,'物料类别':i%2?'原料':'成品','物料来源':'采购','基本单位':'千克'}));
 f.old.tables.每日需求=[{'需求编号':'D1','成品编号':'M000','需求日':'1','需求千克':'17','需求箱数':'2','客户编号':'C1'}];
 f.run.inputHash=hash(f.old);f.run.result.dayZero=f.old.dayZero;f.run.resultHash=hash(f.run.result);
 const value=workbookQueryContext(f.ctx,{datasetId:'fixture',version:1},'synthetic-actor');
 const draft={view:'bom.materials',fromDate:'2026-11-01',toDateInclusive:'2026-11-14',bomAsOfDate:'2026-11-01',knownAsOfDate:'2026-11-01',pageSize:100,offset:0,filters:{},q:''};
 return {...f,value,draft};
}
test('path root classification and names follow the requested input or frozen version without changing query columns',()=>{
 const f=connected(),before=hash(f.old),q={...f.draft,view:'bom.paths'};
 f.latest.tables.物料主数据=structuredClone(f.old.tables.物料主数据);
 Object.assign(f.latest.tables.物料主数据[0],{'物料名称':'当前改名','物料类别':'原辅料'});
 const current=workbookQueryContext(f.ctx,{datasetId:'fixture',version:2},'synthetic-actor');
 const frozen=workbookQueryContext(f.ctx,{datasetId:'fixture',version:1,runId:'frozen'},'synthetic-actor');
 const oldResult=domain.query(f.value,q),newResult=domain.query(current,q),frozenResult=domain.query(frozen,q);
 const root=result=>result.records.find(r=>r.values.root==='M000').rootMaterial;
 assert.deepEqual(root(oldResult),{id:'M000',name:'物料 0',category:'成品'});
 assert.deepEqual(root(frozenResult),root(oldResult));
 assert.deepEqual(root(newResult),{id:'M000',name:'当前改名',category:'原辅料'});
 assert.ok(!oldResult.columns.some(c=>c.key==='rootMaterial'));
 assert.equal(hash(f.old),before);assert.equal(f.writes(),0);
});
test('canonical adapter exposes all 18 wired views, full candidates, NONE/toggle and search selection tokens',()=>{
 const f=connected(),before=hash(f.old),catalog=domain.catalog(f.value);
 assert.equal(catalog.views.length,18);assert.equal(catalog.fromDate,'2026-11-01');assert.equal(catalog.toDateInclusive,'2026-11-14');
 const q={query:f.draft,field:'material:成品'};
 const all=domain.options(f.value,q);assert.equal(all.total,103);assert.equal(all.selectedTotal,103);assert.equal(all.items.length,100);assert.equal(all.nextOffset,100);
 const empty=domain.options(f.value,{...q,action:{kind:'none'}});assert.equal(empty.selectedTotal,0);
 const query={...f.draft,filters:{'material:成品':empty.selection}};
 const chosen=domain.options(f.value,{...q,query,action:{kind:'searchAll',query:'M00'}});assert.equal(chosen.selectedTotal,5);
 const page=domain.query(f.value,{...query,filters:{'material:成品':chosen.selection,'material:原料':{...domain.options(f.value,{query:f.draft,field:'material:原料',action:{kind:'none'}}).selection}}});
 assert.equal(page.total,5);assert.equal(hash(f.old),before);assert.equal(f.writes(),0);
});
test('canonical adapter stable pages, bounded long value and complete/selected exports share the original query',()=>{
 const f=connected();const a=domain.query(f.value,f.draft),b=domain.query(f.value,{...f.draft,offset:100,queryFingerprint:a.queryFingerprint});
 assert.equal(a.total,205);assert.equal(a.records.length,100);assert.equal(b.records.length,100);assert.equal(a.queryFingerprint,b.queryFingerprint);assert.notEqual(a.records[0].id,b.records[0].id);
 const text=[...domain.export(f.value,{...f.draft,queryFingerprint:a.queryFingerprint,scope:'ALL',columns:['id']})].join('');
 const lines=text.trim().split('\n').map(s=>JSON.parse(s));assert.equal(lines.filter(l=>l.kind==='record').length,205);assert.equal(lines.at(-1).complete,true);
 const selected=[...domain.export(f.value,{...f.draft,queryFingerprint:a.queryFingerprint,scope:'SELECTED',ids:[b.records[0].id]})].join('');assert.equal(JSON.parse(selected.trim().split('\n').at(-1)).total,1);
 assert.throws(()=>domain.export(f.value,{...f.draft,queryFingerprint:'stale',scope:'ALL'}),{code:'QUERY_CONTEXT_CHANGED'});
 const key=a.records[0].id;
 const detail=domain.detail(f.value,{query:f.draft,queryFingerprint:a.queryFingerprint,id:key,table:'sources'});assert.ok(detail.records.length);assert.equal(detail.queryFingerprint,a.queryFingerprint);
 const raw=domain.detail(f.value,{query:f.draft,queryFingerprint:a.queryFingerprint,id:key,table:'record'});assert.ok(raw.links.some(l=>l.view==='demand.details'));assert.ok(raw.maintenanceTargets.some(t=>t.table==='物料主数据')); 
});
test('real canonical transport enforces inherited permissions and read-only frozen/current identity',async()=>{
 const f=connected(),routes=new Map(),router={get:(p,...h)=>routes.set(p,h)};registerWorkbookQueryReportRoutes(router,f.ctx);
 async function request(kind,payload,canExport=false){const req={query:{request:JSON.stringify(payload)},canExport};const res={headersSent:false,statusCode:200,status(s){this.statusCode=s;return this;},json(v){this.body=v;return this;},type(){return this;},send(v){this.body=JSON.parse(v);return this;}};const hs=routes.get('/query-reports/'+kind);let i=0;await (function next(e){if(e)throw e;return hs[i++]?.(req,res,next);})();await new Promise(r=>setImmediate(r));return res;}
 const c=await request('context',{datasetId:'fixture',version:1});assert.equal(c.body.views.length,18);
 const result=await request('query',{...f.draft,identity:c.body.identity});assert.equal(result.body.total,205);
 const denied=await request('export',{...f.draft,identity:c.body.identity});assert.equal(denied.statusCode,403);
 const stale=await request('query',{...f.draft,identity:{...c.body.identity,version:2}});assert.equal(stale.statusCode,409);assert.equal(f.writes(),0);
 const run=workbookQueryContext(f.ctx,{datasetId:'fixture',version:1,runId:'frozen'},'synthetic-actor');assert.equal(domain.catalog(run).views.length,18);
 f.run.provenance.parameterScope='trial:other';assert.throws(()=>workbookQueryContext(f.ctx,{datasetId:'fixture',version:1,runId:'frozen'},'synthetic-actor'),{code:'FORBIDDEN'});
});

test('adapter reconstructs long values without truncation and preserves all 18 view transports and frozen trial actor checks',()=>{
 const f=connected();f.old.tables.物料主数据[0].物料名称='长值'.repeat(3000);
 const v=workbookQueryContext(f.ctx,{datasetId:'fixture',version:1},'synthetic-actor');
 const page=domain.query(v,f.draft),r=page.records.find(r=>r.values['物料名称']?.longValue);assert.ok(r);
 let offset=0,text='';do{const part=domain.value(v,{query:f.draft,queryFingerprint:page.queryFingerprint,id:r.id,field:'物料名称',offset});text+=part.chunk;if(part.nextOffset===null)break;offset=part.nextOffset;}while(true);
 assert.equal(JSON.parse(text),'长值'.repeat(3000));
 for(const view of domain.catalog(v).views){const p=domain.query(v,{...f.draft,view:view.id});assert.equal(p.view,view.id);assert.ok(Array.isArray(p.records));}
 f.old.parameterContext={scope:'trial:own'};f.run.actor='synthetic-actor';f.run.provenance.parameterScope='trial:own';f.run.inputHash=hash(f.old);
 const own=workbookQueryContext(f.ctx,{datasetId:'fixture',version:1,runId:'frozen'},'synthetic-actor');assert.equal(domain.catalog(own).views.length,18);
 assert.throws(()=>workbookQueryContext(f.ctx,{datasetId:'fixture',version:1,runId:'frozen'},'different-actor'),{code:'FORBIDDEN'});
});
