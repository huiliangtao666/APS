// Private task-level engineering fixture; no deployment or Portal binding.
import fs from 'node:fs';import express from 'express';import {createHash} from 'node:crypto';
import {openStore} from '../server/auth/store.mjs';import {createAuthRouter} from '../server/auth/routes.mjs';import {createBusinessRouter} from '../server/business.mjs';
import {losslessProfile} from './b15-lossless-fixture.mjs';import {defs} from '../server/planner.ts';
if(process.env.LOSSLESS_ISOLATED!=='1'||process.env.NODE_ENV==='production')throw Error('private nonproduction fixture required');
const dir='/state',hash=x=>createHash('sha256').update(x).digest('hex');fs.mkdirSync(dir,{recursive:true});
const manifestPath='/workspace/temp/b15-lossless/runtime-source-manifest.json';const manifest=JSON.parse(fs.readFileSync(manifestPath));
for(const [f,h]of Object.entries(manifest.files))if(hash(fs.readFileSync(f))!==h)throw Error('runtime source drift '+f);
const store=openStore(dir);if(!store.hasAdmin()){store.initFirstAdmin('test#admin');for(const role of ['planner','supervisor','query']){const invite=store.createInvite({role,createdBy:'test#admin',requireApproval:false});store.acceptInvite(invite.token,'test#'+role);store.setExport('test#'+role,true,'test#admin');}}
const actor=(req,_res,next)=>{req.praetorActor={kind:'user',issuer:'test',sub:req.get('test-sub')||'planner',requestId:'lossless-engineering-'+Date.now()};next();};
const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store}),app=express();app.use(express.json({limit:'2mb'}));app.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});app.use('/api/auth',router);app.use('/api',createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember}));
app.get('/__qa/version',(_req,res)=>res.json({...manifest,files:undefined,scope:'private explicit simulation; no QA verdict or publication'}));app.use(express.static('/workspace/temp/b15-lossless/ui-dist'));app.get('*',(_req,res)=>res.sendFile('/workspace/temp/b15-lossless/ui-dist/index.html'));
const profiles=Object.fromEntries(['12','13','14','15','17','18'].map(id=>[id,losslessProfile(id)]));fs.writeFileSync('/evidence/browser-profiles.json',JSON.stringify(profiles));fs.writeFileSync('/evidence/browser-defs.json',JSON.stringify(defs));
const server=app.listen(4317,'0.0.0.0');await new Promise(r=>server.once('listening',r));console.log('LOSSLESS_PRIVATE_READY');for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>server.close(()=>process.exit(0)));
