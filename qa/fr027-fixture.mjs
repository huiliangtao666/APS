// QA-only synthetic actor seam; never imported by production.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import express from 'express';
import {fileURLToPath} from 'node:url';
import {openStore} from '../server/auth/store.mjs';import {createAuthRouter} from '../server/auth/routes.mjs';import {createBusinessRouter} from '../server/business.mjs';
export async function fixture(t,{browser=false,runOptions={}}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fr027-')),store=openStore(dir);store.initFirstAdmin('test#admin');
 for(const role of ['planner','supervisor','query']){const i=store.createInvite({role,createdBy:'test#admin',requireApproval:false});store.acceptInvite(i.token,'test#'+role);}
 const actor=(req,_res,next)=>{req.praetorActor={kind:'user',issuer:'test',sub:req.get('test-sub')||'planner',requestId:'fr027-synthetic'};next();};
 const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store});
 const app=express();app.use(express.json({limit:'2mb'}));app.use('/api/auth',router);app.use('/api',createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember,...runOptions}));
 if(browser){const {build}=await import('vite');const root=fileURLToPath(new URL('..',import.meta.url)),dist=path.join(dir,'dist');await build({root,base:'/',resolve:{alias:[{find:/^@praetor\/lite-app-runtime$/,replacement:fileURLToPath(new URL('./fr033-integration-runtime.mjs',import.meta.url))}]},build:{outDir:dist,emptyOutDir:true}});app.use(express.static(dist));app.get('*',(_req,res)=>res.sendFile(path.join(dist,'index.html')));}
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
 const close=async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});};t?.after(close);
 const call=async(endpoint,body,role='planner',headers={})=>{const r=await fetch(url+'/api'+endpoint,{method:body?'POST':'GET',headers:{'content-type':'application/json','test-sub':role,...headers},body:body?JSON.stringify({reason:'FR027 synthetic test',...body}):undefined});return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};};
 const ok=async(endpoint,body,role)=>{const r=await call(endpoint,body,role);if(r.status>=300)throw Error(endpoint+' '+JSON.stringify(r));return r.body;};
 const bytes=()=>fs.readFileSync(path.join(dir,'business.json'),'utf8');
 return {dir,url,call,ok,close,bytes,store};
}
export async function trialOf(f,data){if(data)await f.ok('/inputs',{revision:0,tables:data});const state=await f.ok('/state'),base=await f.ok('/calculate',{revision:state.revision}),trial=await f.ok('/plans/'+base.id+'/copy',{});return {base,trial,root:'/trials/'+trial.id};}
export async function preview(f,root,taskId='A-FILL',change={start:90,machine:'FILL01'},kind='move'){
 const s=await f.ok(root+'/positions');return f.ok(root+'/'+kind+'-preview',{revision:s.revision,planId:s.planId,planHash:s.planHash,taskId,...change});
}
export async function commit(f,root,p){const checked=await f.ok(root+'/previews/'+p.id+'/recheck',{});if(!checked.valid)throw Error(JSON.stringify(checked));return f.ok(root+'/previews/'+p.id+'/commit',{});}
