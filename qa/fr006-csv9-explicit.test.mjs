import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import express from 'express';
import {fixture} from './fr027-fixture.mjs';
import {defs} from '../server/planner.ts';
import {createBusinessRouter} from '../server/business.mjs';
import {createAuthRouter} from '../server/auth/routes.mjs';
import {inspectSingleCsv} from '../server/csv-single.mjs';
const def=defs.find(d=>d.key==='tools'),fields=['可用起始分钟','可用结束分钟'];
const raw=fs.readFileSync('prototypes/fr006-config-only/sample-data/FR-006/18_工装配置.csv','utf8');
const rows=raw.trimEnd().split(/\r?\n/).map(l=>l.split(','));
const file='18_工装配置.csv',evidence=[];
const hash=x=>createHash('sha256').update(x).digest('hex');
const csv=(omit=[],values=['0','600'],multiline=false)=>rows.map((r,i)=>[...r.map((c,j)=>multiline&&i===1&&j===1?'"首行\r\n名称"':c),...fields.flatMap((f,j)=>omit.includes(f)?[]:[i===0?f:values[j]])].join(',')).join('\r\n')+'\r\n';
const record=(id,f,before,response)=>{const after=f.bytes();assert.equal(after,before,id);evidence.push({id,response,beforeHash:hash(before),afterHash:hash(after)});};
const preview=(f,text,extra={},role='planner')=>f.call('/imports/preview',{table:'tools',revision:0,files:[{name:file,text}],...extra},role);
const rejected=async(f,id,text,locations)=>{const before=f.bytes(),r=await preview(f,text);assert.equal(r.body.valid,false,JSON.stringify(r));assert.ok(!r.body.id);for(const[row,field]of locations)assert.ok(r.body.issues.some(i=>i.file===file&&i.row===row&&i.field===field),JSON.stringify(r));record(id,f,before,r);const c=await f.call('/imports/commit',{previewId:r.body.id});assert.equal(c.status,409);record(id+'-no-commit',f,before,c);};
test('CSV9 and every missing/blank endpoint reject with physical file/row/field and no token or store writes',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});
 await rejected(f,'original-nine',raw,[[2,fields[0]],[2,fields[1]],[3,fields[0]],[3,fields[1]]]);
 for(const field of fields){await rejected(f,'missing-header-'+field,csv([field]),[[2,field],[3,field]]);for(const blank of ['', '   '])await rejected(f,'blank-'+field+'-'+blank.length,csv([],fields.map(x=>x===field?blank:x===fields[0]?'0':'600'),true),[[2,field],[4,field]]);}
 await rejected(f,'both-blank',csv([],['','']),[[2,fields[0]],[2,fields[1]],[3,fields[0]],[3,fields[1]]]);
 for(const values of [['-1','600'],['0','NaN'],['0','Infinity'],['0','525601'],['0.5','600'],['600','600'],['601','600']])await rejected(f,'invalid-'+values.join('/'),csv([],values),[[2,values[0]==='-1'||values[0]==='0.5'?fields[0]:fields[1]]]);
});
test('explicit 11-column preview zero-write, guarded once-only commit, durable reopen, stale and role guards',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const before=f.bytes();
 const p=await preview(f,csv());assert.equal(p.status,200);assert.equal(p.body.valid,true);assert.ok(p.body.id);record('valid-preview-zero-write',f,before,p);
 for(const [id,request,status]of [
  ['query-preview',()=>preview(f,csv(),{},'query'),403],
  ['stale-preview',()=>preview(f,csv(),{revision:-1}),409],
  ['query-commit',()=>f.call('/imports/commit',{previewId:p.body.id},'query'),403],
  ['unowned-commit',()=>f.call('/imports/commit',{previewId:p.body.id},'supervisor'),409]]){const r=await request();assert.equal(r.status,status);record(id,f,before,r);}
 const committed=await f.ok('/imports/commit',{previewId:p.body.id});assert.equal(committed.revision,1);const after=f.bytes(),state=await f.ok('/state');assert.equal(state.data.tools.length,2);for(const row of state.data.tools){assert.equal(row[fields[0]],'0');assert.equal(row[fields[1]],'600');}assert.equal(state.revision,1);for(const k of ['plans','runs','confirmations','execution'])assert.deepEqual(JSON.parse(after)[k],JSON.parse(before)[k]);evidence.push({id:'explicit-commit',result:committed,beforeHash:hash(before),afterHash:hash(after),saved:state.data.tools});if(process.env.EVIDENCE_DIR){fs.writeFileSync(process.env.EVIDENCE_DIR+'/business-before.json',before);fs.writeFileSync(process.env.EVIDENCE_DIR+'/business-after.json',after);}
 const again=await f.call('/imports/commit',{previewId:p.body.id});assert.equal(again.status,409);record('once-only',f,after,again);
 // A new router reads the same persisted business store (no migration/recreation).
 const actor=(req,_res,next)=>{req.praetorActor={kind:'user',issuer:'test',sub:'planner'};next();};
 const {requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store:f.store});
 const app=express();app.use(express.json());app.use('/api',createBusinessRouter({dataDir:f.dir,actorMiddleware:actor,requireMember}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/state');assert.equal(response.status,200);assert.deepEqual((await response.json()).data,state.data);record('new-router-reopen',f,after,{status:200,revision:state.revision,tools:state.data.tools});}finally{await new Promise(r=>server.close(r));}
 const stale=await preview(f,csv(),{revision:1});assert.equal(stale.body.valid,true);await f.ok('/inputs',{revision:1,tables:{tools:state.data.tools.map(x=>({...x,说明:'explicit edit'}))}});const changed=f.bytes(),r=await f.call('/imports/commit',{previewId:stale.body.id});assert.equal(r.status,409);record('stale-token',f,changed,r);
});
test('legacy store reads literally with no migration, new write and new calculation reject missing availability',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const s=JSON.parse(f.bytes());s.data.tools=rows.slice(1).map(r=>Object.fromEntries(rows[0].map((k,j)=>[k,r[j]])));fs.writeFileSync(f.dir+'/business.json',JSON.stringify(s));const before=f.bytes(),read=await f.ok('/state');for(const row of read.data.tools)for(const field of fields)assert.equal(row[field],undefined);record('legacy-read',f,before,{tools:read.data.tools});
 for(const [id,path,body]of [['legacy-save','/inputs',{revision:0,tables:{tools:read.data.tools}}],['legacy-calculate','/calculate',{revision:0}],['legacy-worker','/runs',{revision:0,selection:{}}]]){const r=await f.call(path,body);assert.ok(r.status>=400,JSON.stringify(r));record(id,f,before,r);}
});
test('other single-table compatibility defaults remain literal',()=>{
 for(const [key,expected]of [['resourceClaims',{'窗口开始偏移分钟':'0','窗口结束偏移分钟':'0','参数来源':'逐项声明'}],['dependencies',{'窗口外释放':'是'}]]){const d=defs.find(x=>x.key===key),headers=d.fields.filter(k=>!Object.hasOwn(expected,k));const r=inspectSingleCsv({name:d.file,text:headers.join(',')+'\n'+headers.map(()=> 'literal').join(',')+'\n'},d);assert.deepEqual(r.issues,[]);for(const[k,v]of Object.entries(expected))assert.equal(r.tables[key][0][k],v);}
});
test.after(()=>{if(process.env.EVIDENCE_DIR)fs.writeFileSync(process.env.EVIDENCE_DIR+'/csv9-api.json',JSON.stringify(evidence,null,2));});
