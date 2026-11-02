import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {hash,workbookSchema} from '../server/workbook-model.mjs';
import {importChanges,bindPreview} from '../server/workbook-workbench.mjs';
import {buildWorkbookPreview,previewSummary,confirmationPayload,confirmWorkbookPreview,previewCommitStatus,previewLimits,digest,sourceRef} from '../server/workbook-preview.mjs';
import {previewRecords,previewFields,previewIssues,previewLocations,previewValue,previewAnchors,exportWorkbookPreview} from '../server/workbook-preview-query.mjs';

// Explicit, replaceable mock: no original Excel, no real production mapping.
// Expected counts/values below come from this generator, not product summaries.
const row=(id,n)=>({_row:n+3,_cells:{'需求编号':'A'+(n+3),'客户编号':'B'+(n+3),'成品编号':'C'+(n+3),'需求箱数':'D'+(n+3),'需求日':'E'+(n+3)},'需求编号':id,'客户编号':'C1','成品编号':'FG1','需求箱数':String(n+1),'需求日':String(n%43+1)});
const access={actor:'mock-planner',canEdit:true,canExport:true,csrfVerified:true,now:1000};
function fixture(n=101,{issues=[],warnings=[],readiness=[],replace=false}={}){
  const before=replace?{id:'fixture',version:1,fileHash:'old',tables:{'每日需求':[row('D0',0)]}}:null;
  const data={id:'fixture',version:replace?2:1,fileHash:'mock-file',profile:'excel-qualified-output-202611-r1',tables:{'每日需求':Array.from({length:n},(_,i)=>row('D'+i,i))},mapping:{mock:true}};
  if(replace)data.tables['每日需求'][0]['需求箱数']='9';
  const p={id:'preview-mock',datasetId:data.id,expectedVersion:replace?1:0,fileHash:'mock-file',snapshotHash:hash(data),profile:data.profile,
    owner:access.actor,requestedKind:'business',mode:'candidate',scope:'dataset',overlayResolution:'keep',status:'preview',issues,warnings,readiness:{issues:readiness},changeSet:importChanges(before,data)};
  bindPreview(p);p.previewModule=buildWorkbookPreview(p,{data,before,now:1000});return {p,data,before,v:p.previewModule};
}
const q=(v,extra={})=>({revision:1,summaryFingerprint:v.summaryFingerprint,...extra});
const rejects=(fn,code)=>assert.throws(fn,e=>e.code===code);
const stateOf=p=>({previews:[p],datasets:p.expectedVersion?[{id:p.datasetId,versions:[{version:p.expectedVersion}],imports:[]}]:[],records:[],runs:[{id:'old-run',frozen:'unchanged'}]});
function applyImport(s,p){let d=s.datasets.find(d=>d.id===p.datasetId);if(!d){d={id:p.datasetId,versions:[],imports:[]};s.datasets.push(d);}d.versions.push({version:p.expectedVersion+1});const r={previewId:p.id,status:'committed',datasetId:p.datasetId,version:p.expectedVersion+1,fileHash:p.fileHash};d.imports.push(r);return r;}
const bodyOf=p=>confirmationPayload(previewSummary(p,{now:1000}),{reason:'显式仿真自测',idempotencyKey:'mock-key-0001',acknowledgedReplaceDelete:true,acknowledgedWarnings:true});

test('summary separates record count, non-key changed fields, import blockers and scheduling issues',()=>{
  const {p}=fixture(101,{readiness:[{code:'G01',sheet:'工艺路线',row:0,field:'产线归属',message:'missing'}]});
  const s=previewSummary(p,{now:1000});assert.equal(s.counts.records,101);assert.equal(s.counts.changedFieldCount,404);
  assert.equal(s.counts.blockingReports,0);assert.equal(s.canCommit,true);assert.equal(s.simulation,true);
  const raw=JSON.stringify(s);assert(!raw.includes('changeSet'));assert(!raw.includes('fields'));assert(Buffer.byteLength(raw)<128*1024);
});
test('101 records traverse 25-page boundaries exactly once; global search finds last record',()=>{
  const {v}=fixture();let cursor=null,ids=[];
  do{const p=previewRecords(v,q(v,{cursor,pageSize:25}));assert(p.items.length<=25);ids.push(...p.items.map(r=>r.changeId));cursor=p.nextCursor;}while(cursor);
  assert.equal(ids.length,101);assert.equal(new Set(ids).size,101);
  const p=previewRecords(v,q(v,{q:'D100'}));assert.equal(p.total,1);assert.equal(p.items[0].key,'D100');assert(!('fields' in p.items[0]));
  assert.equal(previewRecords(v,q(v,{q:'not-found'})).total,0);
});
test('cursor is bound to filter and fingerprint; invalid sizes and identity fail explicitly',()=>{
  const {v}=fixture();const cursor=previewRecords(v,q(v,{pageSize:25})).nextCursor;
  rejects(()=>previewRecords(v,q(v,{q:'D1',cursor})),'CURSOR_INVALID');
  rejects(()=>previewRecords(v,q(v,{summaryFingerprint:'wrong'})),'FINGERPRINT_MISMATCH');
  for(const size of [0,101,1.5,-1])rejects(()=>previewRecords(v,q(v,{pageSize:size})),'PAGE_SIZE_INVALID');
});
test('typed missing/null/empty/zero plus long values and formulas remain lossless',()=>{
  const {p,data}=fixture(1);data.tables['每日需求'][0]['客户编号']=null;data.tables['每日需求'][0]['成品编号']='';data.tables['每日需求'][0]['需求箱数']=0;
  data.tables['每日需求'][0]['补充说明']='长🙂'.repeat(3000);data.tables['每日需求'][0]._formulas={'需求箱数':'=NOT_EXECUTED()'};
  p.changeSet=importChanges(null,data);p.snapshotHash=hash(data);bindPreview(p);const v=buildWorkbookPreview(p,{data,now:1000}),r=previewRecords(v,q(v)).items[0],fields=previewFields(v,q(v,{changeId:r.changeId}));
  assert.equal(fields.items.find(f=>f.name==='客户编号').after.value,null);assert.equal(fields.items.find(f=>f.name==='成品编号').after.value,'');
  assert.equal(fields.items.find(f=>f.name==='需求箱数').after.value,0);assert.equal(fields.items.find(f=>f.name==='需求箱数').formula.value,'=NOT_EXECUTED()');
  assert.equal(fields.items.find(f=>f.name==='需求编号').changed,false);assert.equal(fields.items.find(f=>f.name==='需求编号').before.present,false);
  // Use a known schema field for long-value paging, rather than relying on unknown columns.
  data.tables['每日需求'][0]['客户编号']='长🙂'.repeat(3000);p.changeSet=importChanges(null,data);p.snapshotHash=hash(data);bindPreview(p);
  const w=buildWorkbookPreview(p,{data,now:1000}),rr=w.records[0],ff=previewFields(w,q(w,{changeId:rr.changeId})).items.find(f=>f.name==='客户编号');
  assert(ff.after.truncated);let offset=0,text='';do{const part=previewValue(w,q(w,{changeId:rr.changeId,fieldId:ff.fieldId,side:'after',offset}));text+=part.chunk;offset=part.nextOffset;}while(offset!==null);
  assert.equal(JSON.parse(text),data.tables['每日需求'][0]['客户编号']);
});
test('four raw reports at two physical positions form one group; unchanged error rows are retained',()=>{
  const issues=[3429,3429,3430,3430].map((r,i)=>({code:'MOCK_OBJECT_UNMAPPED',sheet:'配置参数',row:r,cell:'E'+r,field:'参数值',objectId:'MOCK_UNMAPPED',message:'仿真未知对象，非真实CAL语义',validator:'validator-'+i%2}));
  const {v,p}=fixture(0,{issues});const groups=previewIssues(v,q(v));assert.equal(v.counts.records,0);assert.equal(groups.total,1);assert.equal(groups.items[0].rawReports,4);assert.equal(groups.items[0].uniqueLocations,2);
  const locations=previewLocations(v,q(v,{groupId:groups.items[0].groupId}));assert.equal(locations.total,2);assert.equal(locations.items.flatMap(l=>l.reportIds).length,4);
  assert.equal(previewSummary(p,{now:1000}).canCommit,false);rejects(()=>confirmWorkbookPreview(stateOf(p),bodyOf(p),access,applyImport),'VALIDATION_BLOCKED');
});
test('G01/G02/G03 give honest maintenance gaps, exact SF filter and no invented physical coordinates',()=>{
  const readiness=[{code:'G01',sheet:'工艺路线',row:0,field:'产线归属'},
    {code:'G02',sheet:'物料主数据',record:'SF001',field:'物料编号'},
    {code:'G03',sheet:'物料清单',record:'B01',field:'投料位置'},
    {code:'G03',sheet:'设备与工装',record:'TL01',field:'资源编号'},
    {code:'G03',sheet:'期初在制',record:'WP001',field:'当前工序编号'}];
  const {v}=fixture(0,{readiness});const remedies=v.reports.map(r=>r.remedy);assert(remedies.every(r=>r.capability==='UNAVAILABLE'&&r.entryId===null));
  assert.deepEqual(remedies[1].exactKeyFilter,{field:'成品编号',value:'SF001'});assert.equal(remedies[1].table,'工艺路线');
  assert.deepEqual(remedies.slice(2).map(r=>r.section),['feed','physical-pool','wip']);assert.equal(v.reports[0].sourceRef.physicalRow,null);
  const online=sourceRef({fileHash:'old'},'每日需求',{...row('D1',1),_origin:'应用新增记录'},'需求箱数');assert.equal(online.cell,null);assert.equal(online.physicalRow,null);
});
test('ALL export is complete and independently recounted; FILTERED explicitly narrows query only',()=>{
  const {v}=fixture(101);const lines=[...exportWorkbookPreview(v,q(v,{scope:'ALL',q:'D100'}))],values=lines.map(l=>JSON.parse(l));
  assert.equal(values[0].scope,'ALL');assert.equal(values.filter(v=>v.kind==='record').length,101);
  assert.equal(values.filter(v=>v.kind==='field'&&v.changed).length,404);const tail=values.at(-1);assert.equal(tail.complete,true);
  assert.equal(tail.contentSha256,createHash('sha256').update(lines.slice(0,-1).join('')).digest('hex'));
  assert.equal([...exportWorkbookPreview(v,q(v,{scope:'FILTERED',q:'D100'}))].map(l=>JSON.parse(l)).filter(r=>r.kind==='record').length,1);
  rejects(()=>[...exportWorkbookPreview(v,q(v,{scope:'PAGE'}))],'EXPORT_SCOPE_REQUIRED');
});
test('confirmation always applies full batch; persisted receipt retries after version changes',()=>{
  const {p}=fixture(3),state=stateOf(p),body=bodyOf(p);const before=JSON.stringify(state);
  const out=confirmWorkbookPreview(state,body,access,applyImport);assert.equal(JSON.stringify(state),before);assert.equal(out.result.version,1);assert.equal(out.write,true);assert.deepEqual(out.state.runs,state.runs);
  const reopened=JSON.parse(JSON.stringify(out.state));reopened.datasets[0].versions.push({version:2});
  const replay=confirmWorkbookPreview(reopened,body,{...access,now:999999999},()=>assert.fail('must not import twice'));
  assert.equal(replay.result.idempotent,true);assert.equal(replay.result.version,1);assert.equal(replay.write,false);
  rejects(()=>confirmWorkbookPreview(reopened,{...body,reason:'changed'},access,applyImport),'IDEMPOTENCY_CONFLICT');
  assert.equal(previewCommitStatus(reopened,{previewId:p.id,idempotencyKey:body.idempotencyKey},access.actor).status,'COMMITTED');
});
test('negative gates reject direct calls before mutating state',()=>{
  const {p}=fixture(1,{replace:true,warnings:[{message:'warning'}]}),s=stateOf(p),b=bodyOf(p),unchanged=JSON.stringify(s);
  const check=(patch,code,a=access)=>rejects(()=>confirmWorkbookPreview(s,{...b,...patch},a,applyImport),code);
  check({},'FORBIDDEN',{...access,canEdit:false});check({},'FORBIDDEN',{...access,csrfVerified:false});check({},'FORBIDDEN',{...access,canExport:false});
  check({},'PREVIEW_OWNER_CHANGED',{...access,actor:'other'});check({summaryFingerprint:'bad'},'FINGERPRINT_MISMATCH');
  check({revision:2},'BINDING_CHANGED');check({confirmedAll:false},'WHOLE_BATCH_CONFIRMATION_REQUIRED');
  check({fullBatchScope:'FILTERED'},'WHOLE_BATCH_CONFIRMATION_REQUIRED');check({acknowledgedWarnings:false},'WARNING_ACK_REQUIRED');
  check({acknowledgedReplaceDelete:false},'REPLACE_DELETE_ACK_REQUIRED');check({filter:{}},'PARTIAL_OR_BYPASS_NOT_SUPPORTED');
  check({},'PREVIEW_EXPIRED',{...access,now:1000+previewLimits.ttlMs});assert.equal(JSON.stringify(s),unchanged);
});
test('competing preview and callback failure are atomic; validation tamper invalidates fingerprint',()=>{
  const {p}=fixture(1),s=stateOf(p),b=bodyOf(p);const competitor=structuredClone(p);competitor.id='competitor';s.previews.push(competitor);
  const out=confirmWorkbookPreview(s,b,access,applyImport);const another=structuredClone(p);another.id='other-preview';bindPreview(another);
  // A fresh projection retains base v0 while live target is now v1.
  const {data}=fixture(1);another.previewModule=buildWorkbookPreview(another,{data,now:1000});out.state.previews.push(another);
  rejects(()=>confirmWorkbookPreview(out.state,{...bodyOf(another),idempotencyKey:'another-key-0001'},access,applyImport),'TARGET_CHANGED');
  const baseline=JSON.stringify(s);assert.throws(()=>confirmWorkbookPreview(s,b,access,(clone)=>{clone.datasets.push({id:'partial'});throw Error('rollback');}),/rollback/);assert.equal(JSON.stringify(s),baseline);
  const tampered=structuredClone(p);tampered.previewModule.counts.blockingReports=0;tampered.previewModule.reports.push({message:'tamper'});
  rejects(()=>confirmWorkbookPreview(stateOf(tampered),bodyOf(tampered),access,applyImport),'PREVIEW_DATA_CHANGED');
  const revalidated=structuredClone(p);revalidated.issues.push({code:'NEW_BLOCKER'});
  rejects(()=>confirmWorkbookPreview(stateOf(revalidated),bodyOf(revalidated),access,applyImport),'VALIDATION_CHANGED');
});

test('bounded G1/G2 mock measurements; no application, import, Worker or browser',()=>{
  const measurements=[];
  for(const n of [1830,7320]){const start=performance.now(),{v,p}=scaleFixture(n),built=performance.now();
    const page=previewRecords(v,q(v,{q:'K'+(n-1)})),end=performance.now();
    assert.equal(v.counts.records,n);assert.equal(v.counts.changedFieldCount,4*n);assert.equal(page.total,1);
    assert.equal(v.tables.length,29);for(const operation of ['create','replace','delete'])assert.equal(v.records.filter(r=>r.operation===operation).length,n/3);
    const summaryBytes=Buffer.byteLength(JSON.stringify(previewSummary(p,{now:1000})));assert(summaryBytes<128*1024);
    measurements.push({mockRecords:n,expectedNonKeyFields:4*n,projectionBytes:v.projectionBytes,summaryBytes,buildMs:built-start,searchMs:end-built});
  }
  console.log('WORKBOOK_PREVIEW_MODULE_MEASUREMENTS '+JSON.stringify(measurements));
});

function scaleFixture(n){
  const names=Object.keys(workbookSchema.tables),inputs=names.filter(t=>workbookSchema.tables[t].kind==='输入'&&t!=='单位换算');
  const before={id:'scale-mock',version:1,fileHash:'mock-old',tables:Object.fromEntries(names.map(t=>[t,[]]))},data={...before,version:2,fileHash:'mock-new',tables:Object.fromEntries(names.map(t=>[t,[]]))};
  for(let i=0;i<n;i++){
    const table=inputs[i%inputs.length],spec=workbookSchema.tables[table],fields=spec.fields.filter(f=>f.name!==spec.key).slice(0,4),key='K'+i;
    const r={_row:i+3,_cells:{[spec.key]:'A'+(i+3)},[spec.key]:key};
    fields.forEach((f,j)=>{r[f.name]='next-'+i+'-'+j;r._cells[f.name]=String.fromCharCode(66+j)+(i+3);});
    if(i%3!==0){const old=structuredClone(r);fields.forEach(f=>old[f.name]='old-'+i);before.tables[table].push(old);}
    if(i%3!==2)data.tables[table].push(r);
  }
  const p={id:'scale-preview',datasetId:data.id,expectedVersion:1,fileHash:'mock-new',snapshotHash:hash(data),profile:'mock-scale-only',owner:access.actor,requestedKind:'business',mode:'candidate',scope:'dataset',overlayResolution:'keep',status:'preview',issues:[],warnings:[],changeSet:importChanges(before,data)};
  bindPreview(p);p.previewModule=buildWorkbookPreview(p,{data,before,now:1000});return {p,v:p.previewModule};
}

test('candidate preview contains proposed P records without relabelling effective input',()=>{
  const {p,data}=fixture(0);data.parameterContract='mock-contract';data.parameterCandidates=[{'参数编号':'P001','对象编号':'CAL','参数名称':'mock','参数值':'0','生效日':'1','失效日':'10',_sourceRole:'P',_scope:'dataset',_row:3,_cells:{'参数值':'E3'},_source:{fileHash:'parameter-mock-file',sheet:'仿真参数实例',row:3}}];
  p.snapshotHash=hash(data);bindPreview(p);const v=buildWorkbookPreview(p,{data,now:1000});
  assert.equal(v.records.length,1);assert.equal(v.records[0].layer,'candidate');assert.equal(v.records[0].sourceRef.fileHash,'parameter-mock-file');
  assert.equal(data.tables['配置参数'],undefined);assert.equal(v.records[0].fields.find(f=>f.name==='参数值').after.value,'0');
});
test('G03 aggregate sources are paged in three sections without inflating original report totals',()=>{
  const {p,data}=fixture(0,{readiness:[{code:'G03',sheet:'工艺路线',field:'资源映射'}]});
  data.tables['物料清单']=[{'用量关系编号':'B1','投料位置':'工序一',_row:3,_cells:{'投料位置':'H3'}}];
  data.tables['设备与工装']=[{'资源编号':'TL1','资源类别':'工装',_row:4,_cells:{'资源编号':'A4'}}];
  data.tables['期初在制']=[{'在制批次编号':'WP1','当前工序编号':'OP1',_row:5,_cells:{'当前工序编号':'F5'}}];
  p.changeSet=importChanges(null,data);p.snapshotHash=hash(data);bindPreview(p);const v=buildWorkbookPreview(p,{data,now:1000});assert.equal(v.reports.length,1);
  for(const section of ['feed','physical-pool','wip']){const r=previewAnchors(v,q(v,{groupId:v.reports[0].groupId,section}));assert.equal(r.total,1);assert(r.items[0].sourceRef.cell);}
});
test('oversize, incomplete source and duplicate change are explicit failures, never partial success',()=>{
  const {p,data}=fixture(2);rejects(()=>buildWorkbookPreview(p,{data,limits:{...previewLimits,maxRecords:1}}),'INPUT_TOO_LARGE');
  rejects(()=>buildWorkbookPreview(p,{data,limits:{...previewLimits,maxProjectionBytes:1}}),'INPUT_TOO_LARGE');
  rejects(()=>buildWorkbookPreview({...p,changeSet:[...p.changeSet,p.changeSet[0]]},{data}),'CHANGESET_INCOMPLETE');
  rejects(()=>buildWorkbookPreview({...p,snapshotHash:'bad'},{data}),'PREVIEW_DATA_CHANGED');
});
