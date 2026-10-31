import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';import {b2Worker} from './b2-fixture.mjs';import {occupancyOracle} from './b2-oracle.mjs';
import {originalBatch,configuredOriginalBatch,literalRows} from './b231-fixture.mjs';
import {resourceClient,resourceTaskSources} from '../src/lib/resource-workbench.mjs';
import {verifyResourcePolicies} from '../src/lib/verify-resource-policies.mjs';
async function isolated(t){const f=await fixture(t),bytes=f.bytes;f.bytes=()=>fs.existsSync(path.join(f.dir,'business.json'))?bytes():null;return f;}
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const save=(name,data)=>{fs.mkdirSync(process.env.B2_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.B2_EVIDENCE,'B231-'+name+'.json'),JSON.stringify(data,null,2));};
for(const id of ['03','04','06','07','08'])test('B231 literal UAT-'+id+' stage and all19 batches refuse unconfigured resources atomically with exact source rows',async t=>{
 const f=await isolated(t);await f.ok('/state');const results=[];
 for(const all of [false,true]){const batch=originalBatch(id,all),before=f.bytes(),r=await f.call('/imports/preview',{revision:0,files:batch.files,repairs:batch.repairs,...(batch.resourceRuleBinding?{resourceRuleBinding:batch.resourceRuleBinding}:{})});
  assert.equal(r.body.valid,false);assert.ok(!r.body.id);assert.equal(f.bytes(),before);
  const source=r.body.sources.originalDependencies;assert.ok(source);assert.equal(source.originalText,batch.files.find(f=>f.name.startsWith('12_')).text);
  const failures=r.body.issues.filter(i=>i.table==='originalDependencies');assert.ok(failures.length);assert.ok(failures.every(i=>i.row>=2&&i.field&&i.reason&&i.file==='12_工序资源与物料依赖.csv'));
  assert.ok(failures.some(i=>/READY/.test(i.reason)));
  const invalidCommit=await f.call('/imports/commit',{previewId:r.body.id||'no-valid-token'});assert.ok(invalidCommit.status>=400);assert.equal(f.bytes(),before);
  results.push({all19:all,request:batch,result:r,refusedCommit:invalidCommit,before:hash(before),after:hash(f.bytes())});
 }save('literal-'+id,results);
});
for(const id of ['03','04','06','07','08'])test('B231 UAT-'+id+' literal originals with explicit simulation supplements reach real Worker, frozen source, independent oracle and export',async t=>{
 const f=await isolated(t);await f.ok('/state');const batch=configuredOriginalBatch(id),before=f.bytes();const preview=await f.call('/imports/preview',{revision:0,files:batch.files,repairs:batch.repairs,...(batch.resourceRuleBinding?{resourceRuleBinding:batch.resourceRuleBinding}:{})});
 save('configured-preview-'+id,{batch,preview});assert.equal(preview.body.valid,true,JSON.stringify(preview.body.issues));assert.equal(f.bytes(),before);
 const committed=await f.ok('/imports/commit',{previewId:preview.body.id,resourceRuleBinding:{contract:'forged',reference:'must be ignored'}}),old=await b2Worker(f);const oracle=occupancyOracle(old.plan,old.input.executionData);
 assert.equal(old.plan.tasks.length,id==='06'?6:4);assert.equal(old.input.conditions.originalDependencyContract,'original12-explicit-bindings-v1');
 assert.equal(JSON.parse(f.bytes()).csvSources.rules.originalText,batch.files.find(f=>f.name.startsWith('16_')).text);assert.equal(JSON.parse(f.bytes()).csvSources.rules.resourceRuleBinding.contract,'CR-DEC02-03-v1');
 const rawFile=batch.files.find(f=>f.name.startsWith('12_')),raw=literalRows(rawFile.text);assert.deepEqual(old.input.originalInput.originalDependencies,raw);
 assert.ok(raw.some(r=>r['需求数量']==='由BOM计算'));assert.ok(!old.input.executionData.dependencies.some(r=>r['资源类型']==='物料'||r['资源类型']==='人员'));
 const frozen=await f.ok('/plans/'+old.plan.id+'/inputs');assert.equal(frozen.csvSources.originalDependencies.originalText,rawFile.text);assert.equal(frozen.csvSources.originalDependencies.sha256,hash(rawFile.text));
 const bindings=old.input.conditions.originalDependencyBindings;assert.equal(bindings.length,raw.length);assert.ok(bindings.every(b=>['BOUND','DEFERRED'].includes(b.status)));assert.ok(bindings.filter(b=>b.sourceRecord['资源类型']==='物料').every(b=>b.status==='DEFERRED'));
 const verify=await f.ok('/plans/'+old.plan.id+'/verify',{});assert.equal(verify.verification.checks.resourcePolicies.status,'pass');
 const noBindings=structuredClone(old.input.conditions);delete noBindings.originalDependencyBindings;assert.equal(verifyResourcePolicies(old.plan,old.input.executionData,noBindings).status,'problem');
 const lie=structuredClone(old.input.conditions);lie.originalDependencyBindings.find(b=>b.status==='DEFERRED').status='BOUND';assert.equal(verifyResourcePolicies(old.plan,old.input.executionData,lie).status,'problem');
 const view=await resourceClient(f.ok).reopen(old.run.id),refs=resourceTaskSources(view,['A-FILL']);assert.ok(refs.some(r=>r.table==='originalDependencies'&&r.physicalRow&&r.sourceSha256===hash(rawFile.text)));
 const csv=await f.ok('/export',resourceClient(f.ok).exportBody(view));assert.ok(csv.includes('original12')&&csv.includes('由BOM计算')&&csv.includes(hash(rawFile.text))&&csv.includes(old.run.snapshotHash));
 const times=Object.fromEntries(old.plan.tasks.map(t=>[t.id,[t.start,t.end]]));if(id==='07')assert.equal(times['B-FILL'][0],70);
 save('configured-'+id,{batch,committed,old,oracle,verify,refs,csv,times,store:JSON.parse(f.bytes())});
});

test('B231 activation, mismatches, unknown types, physical multiline rows and history are guarded without writes',async t=>{
 const f=await isolated(t);await f.ok('/state');const batch=configuredOriginalBatch('07'),preview=await f.ok('/imports/preview',{revision:0,files:batch.files,repairs:batch.repairs,...(batch.resourceRuleBinding?{resourceRuleBinding:batch.resourceRuleBinding}:{})});await f.ok('/imports/commit',{previewId:preview.id});const old=await b2Worker(f),initial=await f.ok('/state');
 const cases=[];
 for(const [name,change,field] of [
  ['enabled material',d=>{d.rules.find(r=>r['规则编号']==='MATERIAL')['是否启用']='是';},'需求数量'],
  ['unknown type',d=>{d.originalDependencies[0]['资源类型']='未批准资源';},'资源类型'],
  ['tool count mismatch',d=>{d.originalDependencies.find(r=>r['资源类型']==='模具')['需求数量']='2';},'需求数量'],
  ['tool return mismatch',d=>{d.originalDependencies.find(r=>r['资源类型']==='模具')['后延占用分钟']='11';},'后延占用分钟'],
  ['personnel without mapping',d=>{d.rules.find(r=>r['规则编号']==='LABOR')['是否启用']='是';},'资源编号'],
  ['missing explicit rule',d=>{d.rules=d.rules.filter(r=>r['规则编号']!=='MATERIAL');},'资源类型'],
 ]){const data=structuredClone(initial.data);change(data);const before=f.bytes(),result=await f.call('/inputs',{revision:initial.revision,tables:data});assert.equal(result.status,400,JSON.stringify(result));assert.equal(f.bytes(),before);assert.ok(result.body.issues.some(i=>i.table==='originalDependencies'&&i.field===field));cases.push({name,result,before:hash(before),after:hash(f.bytes())});}
 const before=f.bytes(),enabled=initial.data.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']);const activation=await f.call('/runs',{revision:initial.revision,selection:{orderIds:['A','B'],startMinute:0,endMinute:600,enabledRuleIds:[...enabled,'MATERIAL']}});assert.equal(activation.status,400);assert.match(activation.body.error,/原12|original12|MATERIAL/);assert.equal(f.bytes(),before);
 // A quoted newline before the bad record proves logical row != physical row.
 const raw=batch.files.find(f=>f.name.startsWith('12_')),multiline=raw.text.replace(/,MIX,设备,/,',MIX,设备,').replace(/,1,0,0,\r?\n/,',1,0,0,"说明\n跨行"\r\n').replace(',模具,G01,1,0,10,',',模具,G01,1,0,11,');
 const physical=await f.call('/imports/preview',{table:'dependencies',revision:initial.revision,files:[{...raw,text:multiline}]});assert.equal(physical.body.valid,false);assert.equal(f.bytes(),before);const issue=physical.body.issues.find(i=>i.table==='originalDependencies'&&i.field==='后延占用分钟');assert.ok(issue);const source=physical.body.sources.originalDependencies;const index=literalRows(multiline).findIndex(r=>r['资源类型']==='模具');assert.equal(issue.row,source.lines[index]);assert.ok(issue.row>index+2);
 const selected=await b2Worker(f,{orderIds:['A'],startMinute:0,endMinute:600});assert.equal(selected.plan.tasks.length,2);assert.equal(verifyResourcePolicies(selected.plan,selected.input.executionData,selected.input.conditions).status,'pass');assert.ok(selected.input.conditions.originalDependencyBindings.filter(b=>b.sourceRecord['订单编号']==='B').every(b=>b.status==='NOT_SELECTED'));
 const off=await b2Worker(f,{orderIds:['A','B'],startMinute:0,endMinute:600,enabledRuleIds:enabled.filter(id=>id!=='MOLD')});assert.ok(!off.plan.resourceReservations.some(r=>r.type==='工装'));assert.ok(off.input.conditions.originalDependencyBindings.filter(b=>['模具','工具'].includes(b.sourceRecord['资源类型'])).every(b=>b.status==='DEFERRED'));assert.equal(verifyResourcePolicies(off.plan,off.input.executionData,off.input.conditions).status,'not_checked');
 const originalSources=await f.ok('/plans/'+old.plan.id+'/inputs');const changed=structuredClone(initial.data);const resource=changed.tools.find(r=>r['工装编码']==='G01');resource['可用数量']='2';changed.originalTools.find(r=>r['资源编号']==='G01')['可用数量']='2';const mapping=changed.resourceMappings.find(m=>m['来源编号']==='G01');mapping['配置版本']='2';mapping['源记录JSON']=JSON.stringify(changed.originalTools.find(r=>r['资源编号']==='G01'));mapping['运行记录JSON']=JSON.stringify(resource);
 await f.ok('/inputs',{revision:initial.revision,tables:changed});const next=await b2Worker(f);assert.equal(old.plan.tasks.find(t=>t.id==='B-FILL').start,70);assert.equal(next.plan.tasks.find(t=>t.id==='B-FILL').start,45);assert.deepEqual(await f.ok('/runs/'+old.run.id+'/inputs'),old.input);assert.deepEqual(await f.ok('/plans/'+old.plan.id+'/inputs'),originalSources);
 const reopened=await resourceClient(f.ok).reopen(old.run.id),csv=await f.ok('/export',resourceClient(f.ok).exportBody(reopened));assert.ok(csv.includes(old.run.snapshotHash)&&csv.includes('由BOM计算'));assert.equal(reopened.snapshot.originalInput.originalTools.find(r=>r['资源编号']==='G01')['可用数量'],'1');
 save('negative-history',{cases,activation,physical,selected,off,old,next,originalSources,csv});
});


test('B231 explicit rule binding rejects unknown contract, blank authority and malformed shape without writes',async t=>{
 const f=await isolated(t);await f.ok('/state');const batch=configuredOriginalBatch('07');const results=[];
 for(const binding of [{contract:'future',reference:'test'},{contract:'CR-DEC02-03-v1',reference:''},{contract:'CR-DEC02-03-v1',reference:'test',defaultCapacity:1}]){
  const before=f.bytes(),r=await f.call('/imports/preview',{revision:0,files:batch.files,repairs:batch.repairs,resourceRuleBinding:binding});assert.equal(r.body.valid,false);assert.ok(!r.body.id);assert.equal(f.bytes(),before);assert.ok(r.body.issues.some(i=>i.field==='参数JSON'));results.push(r);
 }save('rule-binding-negative',results);
});


test('B231 original equipment facts alone supply new order C without a supplemental runtime dependency table',async t=>{
 const f=await isolated(t);await f.ok('/state');const b=configuredOriginalBatch('06');b.files=b.files.filter(file=>file.name!=='32_运行工序资源依赖.csv');
 const p=await f.ok('/imports/preview',{revision:0,files:b.files,repairs:b.repairs,resourceRuleBinding:b.resourceRuleBinding});assert.equal(p.valid,true);await f.ok('/imports/commit',{previewId:p.id});const result=await b2Worker(f);assert.equal(result.plan.tasks.length,6);assert.ok(result.input.executionData.dependencies.some(r=>r['订单编号']==='C'&&r['资源类型']==='设备'));assert.equal(verifyResourcePolicies(result.plan,result.input.executionData,result.input.conditions).status,'pass');save('equipment-projection-C',{batch:b,preview:p,result});
});
