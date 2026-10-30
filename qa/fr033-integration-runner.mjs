// Explicit opt-in, disposable, loopback-only REAL APP validation.
// No imports from this file exist in production. Never publish this runner.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import express from 'express';
import {build} from 'vite';
import {openStore} from '../server/auth/store.mjs';
import {createAuthRouter} from '../server/auth/routes.mjs';
import {createBusinessRouter} from '../server/business.mjs';
import {seed} from '../server/planner.ts';
import {jointFixture,enableJoint,claim} from './joint-fixture.mjs';
import {executionFixture} from './execution-fixture.mjs';

export const sourceSHA='6e1cee732170c176c2a3f876e410be3ed7fc3792';
export async function startValidation(){
 assert.equal(process.env.FR033_DISPOSABLE_VALIDATION,'1','Set FR033_DISPOSABLE_VALIDATION=1 explicitly');
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'fr033-real-app-'));
 const dist=path.join(scratch,'dist');
 const alias=fileURLToPath(new URL('./fr033-integration-runtime.mjs',import.meta.url));
 const label='FR033 DISPOSABLE VALIDATION · SYNTHETIC DATA / TEST IDENTITY · NO GATEWAY AUTHENTICATION';
 const pinned=JSON.parse(fs.readFileSync(path.join(root,'qa/fr033-integration-source-sha256.json')));
 assert.equal(pinned.productSourceSHA,sourceSHA);
 const sourceHashes=Object.fromEntries(Object.entries(pinned.files).map(([f,expected])=>{const actual=createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');assert.equal(actual,expected,f+' differs from canonical product source');return [f,actual];}));
 let server;
 try{
 await build({root,base:'/',resolve:{alias:[{find:/^@praetor\/lite-app-runtime$/,replacement:alias}]},build:{outDir:dist,emptyOutDir:true},plugins:[{name:'fr033-disposable-label',transformIndexHtml:html=>html.replace('<title>','<title>DISPOSABLE FR033 — ').replace('<body>',`<body><aside style="position:sticky;top:0;z-index:9999;background:#ffe69c;color:#111;padding:12px;font-weight:bold">${label}<br>Product source ${sourceSHA}</aside>`)}]});
 const dataDir=path.join(scratch,'data'),store=openStore(dataDir);
 store.initFirstAdmin('fr033-test#admin');
 const invite=store.createInvite({role:'planner',createdBy:'fr033-test#admin',requireApproval:false});
 store.acceptInvite(invite.token,'fr033-test#synthetic-planner');
 // Same injection seam as server/business.test.mjs; fixed actor, no request-selected role.
 const actor=(req,_res,next)=>{req.praetorActor={kind:'user',issuer:'fr033-test',sub:'synthetic-planner',requestId:'fr033-disposable'};next();};
 const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store});
 const app=express();app.use(express.json({limit:'2mb'}));
 app.use('/api/auth',router);app.use('/api',createBusinessRouter({dataDir,actorMiddleware:actor,requireMember}));
 app.use(express.static(dist));app.get('*',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const url=`http://127.0.0.1:${server.address().port}`;
 const html=await (await fetch(url)).text();assert.ok(html.includes(label));
 const assets=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(m=>m[1]);assert.ok(assets.length>=2);for(const asset of assets){const r=await fetch(url+asset);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),asset.endsWith('.js')?/javascript/:/css/);}
 const call=async(endpoint,body)=>{const r=await fetch(url+'/api'+endpoint,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify({...body,reason:'FR033 explicitly disposable synthetic acceptance'}):undefined});const json=await r.json();assert.ok(r.ok,`${endpoint} ${r.status} ${JSON.stringify(json)}`);return json;};
 // Import through real validated routes; plans are calculated and saved by the server.
 const d=jointFixture(seed);d.orders=d.orders.filter(o=>o['订单编号']!=='C');d.dependencies=d.dependencies.filter(x=>x['订单编号']!=='C');d.resourceClaims=d.resourceClaims.filter(x=>x['订单编号']!=='C');
 d.dependencies.find(x=>x['订单编号']==='A'&&x['工序编号']==='MIX')['资源编号']='MIX02';
 d.downtime=[{'设备编号':'MIX02','起始分钟':'30','结束分钟':'60','原因':'FR033 synthetic AC05 maintenance'}];
 d.tools[0]['可用数量']='1';d.resourceClaims.forEach(c=>c['后延占用分钟']='10');enableJoint(d,'STORAGE');
 d.batchResources=[{'资源编号':'COLD','资源类型':'共享冷却空间','容量':'1000','单位':'kg','允许程序':''}];
 d.resourceClaims.push(...d.orders.map(o=>claim('S'+o['订单编号'],o['订单编号'],'MIX','COLD','空间','600','kg','0','30')));
 d.personnelGroups=[{'人员组编号':'G','人员组名称':'FR033 synthetic staff','人员数量':'2','技能':'mix','班次':'D','可用起始分钟':'0','可用结束分钟':'600'}];
 for(const o of d.orders)d.dependencies.push({'订单编号':o['订单编号'],'工序编号':'MIX','资源类型':'人员技能','资源编号':'G','需求数量':'2','所需技能':'mix','所需班次':'D','人员开始偏移':'5','人员结束偏移':'20'});
 await call('/inputs',{tables:d,revision:0,operation:'import'});
 const joint=await call('/calculate',{revision:1});await call('/plans',{id:joint.id});
 assert.deepEqual(joint.tasks.filter(t=>t.id==='B-MIX').map(t=>[t.start,t.end]),[[60,90]]);
 for(const task of joint.tasks){for(const stop of d.downtime.filter(s=>s['设备编号']===task.machine))assert.ok(!(task.start<Number(stop['结束分钟'])&&task.end>Number(stop['起始分钟'])));if(task.predecessor)assert.ok(joint.tasks.find(t=>t.id===task.predecessor).end<=task.start);}
 assert.equal(joint.tasks.length,4);for(const type of ['工装','人员','空间'])assert.ok(joint.resourceReservations.some(r=>r.type===type),type);
 const execution=executionFixture(seed);await call('/inputs',{tables:execution,revision:1,operation:'import'});
 const historical=await call('/calculate',{revision:2});await call('/plans',{id:historical.id});
 const changed=structuredClone(execution.executionFacts);Object.assign(changed[0],{'工序完成数量':'50','观测分钟':'35','剩余工时分钟':'15'});
 await call('/tables/executionFacts',{rows:changed,revision:2});
 const plans=await call('/plans');assert.equal(plans.find(p=>p.id===historical.id).inputSnapshot.executionFacts[0]['工序完成数量'],'40');
 assert.equal((await call('/state')).data.executionFacts[0]['工序完成数量'],'50');
 const manifest={label,productSourceSHA:sourceSHA,sourceHashes,jointPlanId:joint.id,historicalPlanId:historical.id,fixture: {joint:d,execution,savedFactQuantity:'40',currentFactQuantity:'50'},plans};
 const close=async()=>{await new Promise(r=>server.close(r));fs.rmSync(scratch,{recursive:true,force:true});};
 return {url,call,manifest,close};
 }catch(e){if(server)await new Promise(r=>server.close(r));fs.rmSync(scratch,{recursive:true,force:true});throw e;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const run=await startValidation();console.log(JSON.stringify({label:run.manifest.label,url:run.url,productSourceSHA:sourceSHA,sourceHashes:run.manifest.sourceHashes,fixtureHashes:Object.fromEntries(Object.entries(run.manifest.fixture).map(([k,v])=>[k,createHash('sha256').update(JSON.stringify(v)).digest('hex')])),plans:run.manifest.plans.map(p=>({id:p.id,inputVersion:p.inputVersion,runId:p.runId,snapshotHash:p.snapshotHash,tasks:p.tasks.map(t=>({id:t.id,machine:t.machine,start:t.start,end:t.end,predecessor:t.predecessor})),resources:p.resourceReservations,facts:p.inputSnapshot.executionFacts})),checks:['real validated import / calculate / save / refresh routes','AC05 B-MIX60..90 after downtime30..60','precedence and half-open downtime constraints','tooling/personnel/space reservation types present','saved40 versus current50 fact quantities retained']},null,2));
 if(process.argv.includes('--smoke'))await run.close();
 else {console.log('Loopback-only. Stop with Ctrl-C; data and build are deleted.');for(const sig of ['SIGINT','SIGTERM'])process.once(sig,async()=>{await run.close();process.exit(0);});}
}
