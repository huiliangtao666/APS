import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {hash} from '../server/workbook-model.mjs';
import {bindPreview,importChanges} from '../server/workbook-workbench.mjs';
import {buildWorkbookPreview,confirmationPayload,previewSummary} from '../server/workbook-preview.mjs';
import {registerWorkbookPreviewRoutes} from '../server/workbook-preview-routes.mjs';

function setup(){
  const data={id:'mock',version:1,fileHash:'mock-original',tables:{'每日需求':[{'需求编号':'M1','客户编号':'C1',_row:3,_cells:{'需求编号':'A3','客户编号':'B3'}}]}};
  const p={id:'preview-seam',datasetId:'mock',expectedVersion:0,fileHash:data.fileHash,snapshotHash:hash(data),profile:'mock',requestedKind:'business',mode:'candidate',scope:'dataset',overlayResolution:'keep',owner:'planner',status:'preview',issues:[],warnings:[],changeSet:[{table:'每日需求',key:'M1',operation:'create'}]};
  p.changeSet=importChanges(null,data);bindPreview(p);p.previewModule=buildWorkbookPreview(p,{data});
  let state={previews:[p],datasets:[],records:[]},writes=0;const routes=new Map(),permissions=[];
  const router={get:(route,...handlers)=>routes.set('GET '+route,handlers),post:(route,...handlers)=>routes.set('POST '+route,handlers)};
  const ctx={read:()=>state,write:s=>{state=s;writes++;},actorKey:req=>req.mockActor,
    permission:action=>(req,res,next)=>{permissions.push(action);if(req.denied)return res.status(403).json({error:'forbidden'});next();},
    access:req=>({canEdit:true,canExport:true,csrfVerified:!req.badCsrf}),
    applyImport:(s,pp)=>{const result={previewId:pp.id,status:'committed',datasetId:pp.datasetId,version:1};s.datasets.push({id:pp.datasetId,versions:[{version:1}],imports:[result]});return result;}};
  registerWorkbookPreviewRoutes(router,ctx);
  async function request(method,route,{body={},query={},denied=false,badCsrf=false}={}){
    const req={params:{id:p.id},body,query,mockActor:'planner',denied,badCsrf},res=new EventEmitter();
    Object.assign(res,{statusCode:200,headersSent:false,destroyed:false,text:'',status(n){this.statusCode=n;return this;},json(v){this.jsonValue=v;return this;},type(){return this;},set(){return this;},write(s){this.headersSent=true;this.text+=s;return true;},end(){this.ended=true;},destroy(e){this.destroyed=true;this.error=e;}});
    const [auth,handler]=routes.get(method+' '+route);let allowed=false;auth(req,res,()=>allowed=true);if(allowed)await handler(req,res,e=>{throw e;});return res;
  }
  return {p,request,writes:()=>writes,state:()=>state,permissions};
}
test('router seam summary/pages export and permission hooks stay bounded without HTTP or application start',async()=>{
  const f=setup(),s=await f.request('GET','/previews/:id/summary');assert.equal(s.jsonValue.counts.records,1);assert(!('changeSet' in s.jsonValue));
  const query={revision:1,summaryFingerprint:s.jsonValue.summaryFingerprint};
  const rows=await f.request('GET','/previews/:id/records',{query});assert.equal(rows.jsonValue.items.length,1);assert(!('fields' in rows.jsonValue.items[0]));
  const exported=await f.request('GET','/previews/:id/export',{query:{...query,scope:'ALL'}});assert.equal(JSON.parse(exported.text.trim().split('\n').at(-1)).complete,true);assert.equal(exported.ended,true);
  const denied=await f.request('GET','/previews/:id/export',{query:{...query,scope:'ALL'},denied:true});assert.equal(denied.statusCode,403);assert.equal(denied.text,'');
  assert.deepEqual(f.permissions,['read','read','export','export']);assert.equal(f.writes(),0);
});
test('direct confirmation uses CSRF/access gate and one existing-state write; retries are read-only',async()=>{
  const f=setup(),body=confirmationPayload(previewSummary(f.p),{reason:'mock-seam',idempotencyKey:'seam-key-0001'});
  const denied=await f.request('POST','/previews/:id/confirm',{body,badCsrf:true});assert.equal(denied.statusCode,403);assert.equal(f.writes(),0);
  const result=await f.request('POST','/previews/:id/confirm',{body});assert.equal(result.jsonValue.status,'committed');assert.equal(f.writes(),1);
  const retry=await f.request('POST','/previews/:id/confirm',{body});assert.equal(retry.jsonValue.idempotent,true);assert.equal(f.writes(),1);
  const queried=await f.request('GET','/previews/:id/commit-status',{query:{idempotencyKey:body.idempotencyKey}});assert.equal(queried.jsonValue.status,'COMMITTED');
});
test('component TypeScript syntax and props seam parse without a build or UI runtime',()=>{
  const require=createRequire(import.meta.url),ts=require('typescript');
  const file=path.resolve('src/WorkbookPreview.tsx');
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.ES2020,true,ts.ScriptKind.TSX);
  assert.equal(source.parseDiagnostics.length,0,source.parseDiagnostics.map(d=>d.messageText).join('\n'));
  const interfaces=source.statements.filter(ts.isTypeAliasDeclaration).map(d=>d.name.text);
  assert(interfaces.includes('WorkbookPreviewProps'));assert(interfaces.includes('PreviewMemory'));
});
