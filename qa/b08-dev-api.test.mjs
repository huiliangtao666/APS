import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {hostProcess} from './b234-host-client.mjs';import {configuredOriginalBatch} from './b231-fixture.mjs';import {personnelProfileDraft,personnelMappingDraft} from '../src/lib/b08-personnel-config.mjs';
const out=process.env.B08_DEV_OUT;const dump=(n,x)=>{if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/'+n,JSON.stringify(x,null,2));}};
const profile={'人员占用基准':'完整工序','人员检查顺序':'先扩展占用再检查可用性','提前占用分钟':'0','后延占用分钟':'10','人员配置来源':'MOCK:B08 API config selftest','人员配置版本':'mock-api-r1'};
test('UAT08 native source import and configuration preview/save API reject invalid, stale, unmapped and unauthorized edits atomically',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b08-dev-config-')),f=await hostProcess(dir),records=[];
 try{
  const batch=configuredOriginalBatch('08'),initial=await f.ok('/state'),preview=await f.ok('/imports/preview',{revision:initial.revision,files:batch.files,repairs:batch.repairs,resourceRuleBinding:batch.resourceRuleBinding});assert.equal(preview.valid,true,JSON.stringify(preview.issues));await f.ok('/imports/commit',{previewId:preview.id});
  const importedSource=JSON.parse(f.bytes()).csvSources.originalPersonnel.originalText;const s=await f.ok('/state'),i=s.data.dependencies.findIndex(r=>r['资源类型']==='人员技能'),tables=personnelProfileDraft(s.data,[i],profile),bytes=f.bytes();
  const p=await f.ok('/inputs/resource-policy-preview',{revision:s.revision,tables});assert.equal(p.persisted,false);assert.equal(f.bytes(),bytes);assert.ok(p.candidate.tasks.length===4);
  for(const field of ['人员配置来源','人员配置版本','人员检查顺序','提前占用分钟']){const invalid=structuredClone(tables);invalid.dependencies[i][field]='';const r=await f.call('/inputs',{revision:s.revision,tables:invalid});assert.equal(r.status,400,JSON.stringify(r));assert.equal(f.bytes(),bytes);records.push({field,response:r});}
  const wrong=structuredClone(s.data.personnelGroups);wrong[0]['可用起始分钟']='60';let r=await f.call('/inputs',{revision:s.revision,tables:{personnelGroups:wrong}});assert.equal(r.status,400);assert.equal(f.bytes(),bytes);records.push({unmapped:r});
  r=await f.call('/inputs',{revision:s.revision-1,tables});assert.equal(r.status,409);assert.equal(f.bytes(),bytes);records.push({stale:r});
  r=await f.call('/inputs',{revision:s.revision,tables},'query');assert.equal(r.status,403);assert.equal(f.bytes(),bytes);records.push({query:r});
  await f.ok('/inputs',{revision:s.revision,tables});let now=await f.ok('/state');assert.equal(now.data.dependencies[i]['后延占用分钟'],'10');
  const d=structuredClone(now.data);d.personnelGroups[0]['可用起始分钟']='60';const mapped=personnelMappingDraft(d,now.data,{simulation:true,groupIds:[d.personnelGroups[0]['人员组编号']]}).tables;await f.ok('/inputs',{revision:now.revision,tables:mapped});now=await f.ok('/state');assert.equal(now.data.resourceMappings.find(m=>m['来源编号']==='LP01')['配置版本'],'2');assert.equal(importedSource,batch.files.find(f=>f.name.startsWith('06_')).text);dump('config-api.json',{records,preview:p,final:now});
 }finally{await f.close();fs.rmSync(dir,{recursive:true,force:true});}
});
