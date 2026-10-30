import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fixture} from './fr027-fixture.mjs';import {defs} from '../server/planner.ts';import {parseInputCsv} from '../src/lib/input-csv.mjs';
import {related,filterRows} from '../src/lib/data-query.mjs';import {freezeRunInput} from '../server/run-input.mjs';
import {sourceRows,files} from './issue4-0506-fixture.mjs';
async function setup(t){
 const f=await fixture(t),trace=[],call=f.call;
 f.call=async(endpoint,body,role='planner',headers={})=>{const result=await call(endpoint,body,role,headers);trace.push({endpoint,request:body,role,...result});return result;};
 f.ok=async(endpoint,body,role)=>{const r=await f.call(endpoint,body,role);assert.ok(r.status<300,endpoint+' '+JSON.stringify(r));return r.body;};
 if(process.env.EVIDENCE_DIR){fs.mkdirSync(process.env.EVIDENCE_DIR,{recursive:true});t.after(()=>fs.writeFileSync(path.join(process.env.EVIDENCE_DIR,t.name.replace(/[^a-z0-9]+/gi,'-').slice(0,95)+'.json'),JSON.stringify(trace,null,2)));}
 await f.ok('/calculate',{revision:0});return f;
}
const preview=(f,tables=sourceRows,revision=0)=>f.call('/imports/preview',{files:files(tables).reverse(),revision});
test('original 7/6 columns preserve literals; preview, atomic save, exact reimport, reopen, exports and old snapshots',async t=>{
 const f=await setup(t),before=f.bytes(),old=JSON.parse(before),d=structuredClone(sourceRows);d.originalTools[0]['资源名称']='原件,"名称"\r\n保留行';d.originalPersonnel[0]['技能']=' 自定义技能原文 ';
 const p=await preview(f,d);assert.equal(p.body.valid,true,JSON.stringify(p));assert.equal(f.bytes(),before);assert.deepEqual(p.body.tables,d);
 assert.deepEqual(p.body.sources.originalTools.lines,[2,4]);const saved=await f.ok('/imports/commit',{previewId:p.body.id});assert.equal(saved.revision,1);
 const disk=JSON.parse(f.bytes());assert.deepEqual(disk.plans,old.plans);for(const [id,v] of Object.entries(old.inputVersions))assert.deepEqual(disk.inputVersions[id],v);
 assert.deepEqual(disk.data.tools,old.data.tools);assert.deepEqual(disk.data.personnelGroups,old.data.personnelGroups);
 for(const [key,rows] of Object.entries(d))assert.deepEqual(disk.data[key],rows);
 const same=f.bytes(),again=await preview(f,d,1);assert.equal((await f.ok('/imports/commit',{previewId:again.body.id})).unchanged,true);assert.equal(f.bytes(),same);
 await f.close();const reopen=await fixture(t);fs.writeFileSync(path.join(reopen.dir,'business.json'),same);const state=await reopen.ok('/state');assert.deepEqual(state.data,disk.data);
 for(const [key,rows] of Object.entries(d)){
  const def=defs.find(d=>d.key===key),exported=await reopen.ok('/export',{table:key});assert.deepEqual(parseInputCsv(exported),[def.fields,...rows.map(r=>def.fields.map(f=>r[f]))]);
  const query=await reopen.ok('/export',{query:{table:key,revision:1,filters:{text:rows[0][def.fields[0]]}}});assert.ok(query.includes(rows[0][def.fields[0]]));
 }
 assert.throws(()=>freezeRunInput(state.data),/NOT_READY_CONFIG.*缺READY显式映射/);
 const beforeRun=reopen.bytes(),result=await reopen.call('/calculate',{revision:1});assert.equal(result.status,400);assert.equal(reopen.bytes(),beforeRun);const persisted=JSON.parse(reopen.bytes());assert.deepEqual(persisted.data.originalTools,d.originalTools);assert.deepEqual(persisted.plans.find(p=>p.id===old.plans[0].id),old.plans[0]);
 console.log('SOURCE_ROUNDTRIP_AND_HISTORY_PASS');
});
test('single table and batch required values, safe quantity, minute units/date/bounds, duplicate identity, header and physical locations reject whole store',async t=>{
 const f=await setup(t),before=f.bytes();let count=0;
 for(const def of defs.filter(d=>['originalTools','originalPersonnel'].includes(d.key))){
  const key=def.key,start=key==='originalTools'?'最早可用分钟':'起始分钟',end=key==='originalTools'?'最晚可用分钟':'结束分钟',qty=key==='originalTools'?'可用数量':'可用人数';
  const cases=[...def.fields.map(field=>[field,'']),...['1.5','-1','1e2','2人','9007199254740992'].map(v=>[qty,v]),...[start,end].flatMap(field=>['-1','0h','2026-11-02T08:00:00+08:00','Infinity'].map(v=>[field,v])),[end,'0']];
  for(const [field,value]of cases){const d=structuredClone(sourceRows);d[key][0][field]=value;
   for(const single of [false,true]){const selected=single?files({[key]:d[key]}):files(d);const r=await f.call('/imports/preview',{files:selected,revision:0,...(single?{table:key}:{})});assert.equal(r.body.valid,false,JSON.stringify(r));assert.equal(r.body.id,undefined);assert.ok(r.body.issues.some(i=>i.field===field&&i.row===2&&i.file===def.file),JSON.stringify(r));assert.equal(f.bytes(),before);count++;}
  }
  const duplicate=structuredClone(sourceRows);duplicate[key].push({...duplicate[key][0]});const r=await preview(f,duplicate);assert.equal(r.body.valid,false);assert.ok(r.body.issues.some(i=>i.table===key&&i.field===def.fields[0]&&i.row===duplicate[key].length+1));assert.equal(f.bytes(),before);count++;
 }
 const d=structuredClone(sourceRows);d.originalTools[0]['资源名称']='name\r\nsecond';d.originalTools[1]['可用数量']='bad';const r=await preview(f,d);assert.ok(r.body.issues.some(i=>i.file==='05_模具与工具配置.csv'&&i.row===4&&i.field==='可用数量'));assert.equal(f.bytes(),before);
 const bad=files().map(f=>({...f,text:f.text.replace('"共享范围"','"错误字段"')}));const p=await f.call('/imports/preview',{files:bad,revision:0});assert.equal(p.body.valid,false);assert.ok(p.body.issues.some(i=>i.row===1));assert.equal((await f.call('/imports/commit',{previewId:p.body.id||'forged'})).status,409);assert.equal(f.bytes(),before);
 console.log('REJECTION_VARIANTS '+count);
});
test('roles/reason/owner/revision and stale preview stay zero-write; direct edit validation and explicit missing keys',async t=>{
 const f=await setup(t),before=f.bytes();const p=await f.ok('/imports/preview',{files:files(),revision:0});
 for(const [endpoint,body,role,status]of [['/imports/preview',{files:files(),revision:0},'query',403],['/imports/commit',{previewId:p.id},'query',403],['/imports/commit',{previewId:p.id},'supervisor',409],['/imports/preview',{files:files(),revision:99},'planner',409],['/imports/preview',{files:files(),revision:0,reason:''},'planner',400],['/tables/originalTools',{revision:0,rows:[{...sourceRows.originalTools[0],'可用数量':'2.1'}]},'planner',400]]){assert.equal((await f.call(endpoint,body,role)).status,status);assert.equal(f.bytes(),before);}
 await f.ok('/calculate',{revision:0});const after=f.bytes();assert.equal((await f.call('/imports/commit',{previewId:p.id})).body.error,'stale_preview');assert.equal(f.bytes(),after);
 const single=await f.ok('/imports/preview',{files:files({originalPersonnel:sourceRows.originalPersonnel}),table:'originalPersonnel',revision:0});await f.ok('/imports/commit',{previewId:single.id},'planner');
 const sup=await f.ok('/tables/originalPersonnel',{rows:[{...sourceRows.originalPersonnel[0],'可用人数':'2'}],revision:1},'supervisor');assert.equal(sup.revision,2);
});
test('typed original ID references are navigable both ways; name and cross-type collisions do not link',()=>{
 const d={...structuredClone(sourceRows),tools:[{'工装编码':'G01','工装名称':'unrelated name'}],personnelGroups:[{'人员组编号':'LP01'}],dependencies:[{'资源类型':'模具','资源编号':'G01'},{'资源类型':'设备','资源编号':'G01'},{'资源类型':'人员技能','资源编号':'LP01'},{'资源类型':'工具','资源编号':'G01'}]};
 assert.deepEqual(related(d,'originalTools',0).map(r=>[r.table,r.index]),[['tools',0],['dependencies',0]]);assert.ok(related(d,'tools',0).some(r=>r.table==='originalTools'));assert.ok(related(d,'originalPersonnel',0).some(r=>r.table==='dependencies'&&r.index===2));assert.equal(related(d,'dependencies',1).some(r=>r.table==='originalTools'),false);
 assert.equal(filterRows(d,'originalTools',{dateField:'最晚可用分钟',from:'600',to:'600'}).length,2);
});
test('legacy store is not backfilled on read; source import cannot bypass protected missing history',async t=>{
 const f=await setup(t),old=JSON.parse(f.bytes());delete old.data.originalTools;delete old.data.originalPersonnel;
 fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(old));const before=f.bytes();await f.ok('/state');assert.equal(f.bytes(),before);
 const p=await preview(f);assert.equal(p.body.valid,true);assert.equal(f.bytes(),before);await f.ok('/imports/commit',{previewId:p.body.id});
 const protectedStore=JSON.parse(f.bytes());protectedStore.plans[0].status='confirmed';protectedStore.plans[0].inputVersionId='MISSING_HISTORY';fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(protectedStore));const bytes=f.bytes();const blocked=await preview(f,sourceRows,1);assert.equal(blocked.status,409);assert.equal(blocked.body.error,'protected_history_unavailable');assert.equal(f.bytes(),bytes);
});
