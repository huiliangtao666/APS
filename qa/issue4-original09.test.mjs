import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';import {defs} from '../server/planner.ts';import {originalBomDef as def} from '../src/lib/original-bom.mjs';
import {sourceRows,file,sample} from './issue4-original09-fixture.mjs';import {related,filterRows} from '../src/lib/data-query.mjs';import {parseInputCsv} from '../src/lib/input-csv.mjs';
async function setup(t){const f=await fixture(t),trace=[],call=f.call;f.call=async(...a)=>{const r=await call(...a);trace.push({endpoint:a[0],request:a[1],role:a[2]||'planner',...r});return r;};f.ok=async(...a)=>{const r=await f.call(...a);assert.ok(r.status<300,JSON.stringify(r));return r.body;};await f.ok('/calculate',{revision:0});if(process.env.EVIDENCE_DIR)t.after(()=>{fs.mkdirSync(process.env.EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.EVIDENCE_DIR,t.name.replace(/[^a-z0-9]+/gi,'-')+'.json'),JSON.stringify(trace,null,2));});return f;}
const preview=(f,rows=sourceRows,revision=0,extra={})=>f.call('/imports/preview',{files:[file(rows)],revision,...extra});
test('original09 source identity and literal sample roundtrip reopen audit idempotency and frozen history',async t=>{
 assert.equal(sourceRows.length,8);assert.deepEqual(def.fields,['产品编号','物料编号','投料工序','计量基准','定额','损坏比例']);
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/fr036/original09-source.json',import.meta.url)));assert.equal(createHash('sha256').update(sample).digest('hex'),manifest.raw_sha256);
 assert.equal(defs.find(d=>d.key==='inventory').file,'09_库存批次.csv');
 const f=await setup(t);const confirmedFixture=JSON.parse(f.bytes());confirmedFixture.plans[0].status='confirmed';fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(confirmedFixture));const before=f.bytes(),old=JSON.parse(before);const p=await f.ok('/imports/preview',{files:[{name:def.file,text:sample}],revision:0});assert.equal(p.valid,true);assert.equal(f.bytes(),before);assert.deepEqual(p.tables.originalBom,sourceRows);assert.deepEqual(p.sources.originalBom.lines,[2,3,4,5,6,7,8,9]);
 await f.ok('/imports/commit',{previewId:p.id,tables:{inventory:[]}});const saved=f.bytes(),disk=JSON.parse(saved);assert.deepEqual(disk.data.originalBom,sourceRows);assert.equal(disk.revision,1);assert.deepEqual(disk.data.bom,old.data.bom);assert.deepEqual(disk.data.inventory,old.data.inventory);assert.deepEqual(disk.plans,old.plans);for(const [id,v] of Object.entries(old.inputVersions))assert.deepEqual(disk.inputVersions[id],v);
 const audit=disk.records.at(-1);assert.equal(audit.target,'originalBom');assert.equal(audit.actor,'test#planner');assert.deepEqual(audit.after,sourceRows);assert.ok(audit.fromVersion&&audit.toVersion&&audit.batchId&&audit.reason);
 const repeat=await preview(f,sourceRows,1);assert.equal((await f.ok('/imports/commit',{previewId:repeat.body.id})).unchanged,true);assert.equal(f.bytes(),saved);
 const reopen=await fixture(t);fs.writeFileSync(path.join(reopen.dir,'business.json'),saved);assert.deepEqual((await reopen.ok('/state')).data.originalBom,sourceRows);
 const exp=await reopen.ok('/export',{table:'originalBom'});assert.deepEqual(parseInputCsv(exp),[def.fields,...sourceRows.map(r=>def.fields.map(f=>r[f]))]);
 const q=await reopen.ok('/export',{query:{table:'originalBom',revision:1,filters:{product:'HC60',text:'PREMIX'}}});assert.equal(parseInputCsv(q).length,2);assert.ok(q.includes('50'));
 const plan=await reopen.ok('/calculate',{revision:1});assert.ok(plan.conditions.checkScope.unchecked.some(x=>x.includes('原09')));assert.equal(plan.materialChecked,false);const snapshot=await reopen.ok('/plans/'+plan.id+'/inputs');assert.deepEqual(snapshot.data.originalBom,sourceRows);
 const changed=structuredClone(sourceRows);changed[0]['定额']='0650.000';changed[0]['损坏比例']='0.000';changed[0]['计量基准']=' 每1000kg投入,"来源"\r\n原文 ';
 const p2=await preview(reopen,changed,1,{table:'originalBom'});assert.equal(p2.body.valid,true);await reopen.ok('/imports/commit',{previewId:p2.body.id});assert.deepEqual((await reopen.ok('/plans/'+plan.id+'/inputs')).data.originalBom,sourceRows);assert.deepEqual((await reopen.ok('/state')).data.originalBom,changed);
});
test('invalid values and references reject full mixed batch with physical row field reason and zero store writes',async t=>{
 const f=await setup(t),before=f.bytes();let cases=0;
 const variants=[...def.fields.map(x=>[x,'']),...['-1','0','1kg','1e2','Infinity','9'.repeat(310)].map(v=>['定额',v]),...['-0.1','1','1.1','10%','1e-2','NaN'].map(v=>['损坏比例',v]),['产品编号','NO_PRODUCT'],['物料编号','NO_MATERIAL'],['投料工序','NO_OPERATION']];
 for(const [field,value]of variants){for(const single of [false,true]){const rows=structuredClone(sourceRows);rows[0]['计量基准']='每1000kg投入\r\n原文';rows[1][field]=value;
 const product=defs.find(d=>d.key==='products'),state=(await f.ok('/state')).data,pr=structuredClone(state.products);pr[0]['产品名称']='must roll back';
 const pf={name:product.file,text:[product.fields,...pr.map(r=>product.fields.map(x=>r[x]||''))].map(r=>r.join(',')).join('\r\n')};
 const r=await f.call('/imports/preview',{files:single?[file(rows)]:[pf,file(rows)],revision:0,...(single?{table:'originalBom'}:{})});assert.equal(r.body.valid,false,JSON.stringify(r));assert.ok(r.body.issues.some(i=>i.file===def.file&&i.row===4&&i.field===field&&(i.reason||i.message)),JSON.stringify(r));assert.equal(r.body.id,undefined);assert.equal((await f.call('/imports/commit',{previewId:r.body.id||'forged'})).status,409);assert.equal(f.bytes(),before);cases++;}}
 console.log('ORIGINAL09_NEGATIVE_VARIANTS '+cases);
});
test('header filename shape and duplicate composite identities reject without write',async t=>{
 const f=await setup(t),before=f.bytes();
 const duplicate=[...sourceRows,{...sourceRows[0],'计量基准':'其他原文'}],p=await preview(f,duplicate);assert.equal(p.body.valid,false);assert.ok(p.body.issues.some(i=>i.row===10&&i.field==='产品编号 + 物料编号 + 投料工序'));
 for(const text of [sample.replace('损坏比例','未知字段'),sample.replace('损坏比例','定额'),sample.replace('定额,',''),sample+'HC40,LEAN,MIX\r\n',sample+'"unterminated']){const r=await f.call('/imports/preview',{files:[{name:def.file,text}],revision:0});assert.equal(r.body.valid,false);assert.equal(f.bytes(),before);}
 for(const name of ['09_库存批次.csv','09_BOM与包装用量.csv']){const r=await f.call('/imports/preview',{files:[{name,text:sample}],revision:0,table:'originalBom'});assert.equal(r.body.valid,false);assert.ok(r.body.issues.some(i=>i.field==='文件'));assert.equal(f.bytes(),before);}
});
test('roles reasons owned preview stale revision and direct edit share guards',async t=>{
 const f=await setup(t),before=f.bytes(),p=await preview(f);
 for(const [endpoint,body,role,status]of [['/imports/preview',{files:[file()],revision:0},'query',403],['/imports/commit',{previewId:p.body.id},'query',403],['/imports/commit',{previewId:p.body.id},'supervisor',409],['/imports/preview',{files:[file()],revision:9},'planner',409],['/imports/preview',{files:[file()],revision:0,reason:''},'planner',400],['/tables/originalBom',{rows:[{...sourceRows[0],'损坏比例':'1'}],revision:0},'planner',400]]){assert.equal((await f.call(endpoint,body,role)).status,status);assert.equal(f.bytes(),before);}
 await f.ok('/tables/originalBom',{rows:sourceRows,revision:0},'supervisor');const saved=f.bytes();assert.equal((await f.call('/imports/commit',{previewId:p.body.id})).body.error,'stale_preview');assert.equal(f.bytes(),saved);
});
test('typed bidirectional reference links use product-specific process and filtered query',()=>{
 const d={originalBom:sourceRows,products:[{'产品编号':'HC40'}],materials:[{'物料编号':'LEAN'}],routes:[{'产品编号':'HC40','工序编号':'MIX'},{'产品编号':'HC60','工序编号':'MIX'}]};
 assert.deepEqual(related(d,'originalBom',0).map(r=>[r.table,r.index]),[['products',0],['materials',0],['routes',0]]);assert.ok(related(d,'routes',0).filter(r=>r.table==='originalBom').every(r=>r.index<4));assert.equal(filterRows(d,'originalBom',{product:'HC60',text:'PREMIX'}).length,1);
});
test('old stores are not backfilled on read and missing frozen history blocks original09 import',async t=>{
 const f=await setup(t),old=JSON.parse(f.bytes());delete old.data.originalBom;fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(old));const before=f.bytes();await f.ok('/state');assert.equal(f.bytes(),before);
 old.plans[0].status='confirmed';old.plans[0].inputVersionId='missing';fs.writeFileSync(path.join(f.dir,'business.json'),JSON.stringify(old));const protectedBytes=f.bytes(),p=await preview(f);assert.equal(p.status,409);assert.equal(p.body.error,'protected_history_unavailable');assert.equal(f.bytes(),protectedBytes);
});
