// Isolated loopback QA host. Production never imports this module.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import express from 'express';
import {openStore} from '../server/auth/store.mjs';import {createAuthRouter} from '../server/auth/routes.mjs';import {createBusinessRouter} from '../server/business.mjs';
import {b2Scenario} from './b2-fixture.mjs';
export async function b2Host({dir,browser=false,scenario,port=0}){
 if(!path.isAbsolute(dir))throw Error('B2 requires an absolute isolated QA data directory');
 fs.mkdirSync(dir,{recursive:true});const marker=path.join(dir,'B2-QA-ISOLATED.json');
 if(!fs.existsSync(marker)&&fs.readdirSync(dir).length)throw Error('B2 requires an empty or marked isolated QA directory');
 if(!fs.existsSync(marker))fs.writeFileSync(marker,JSON.stringify({purpose:'B2 isolated task-level simulation',seed:'B2-20261031-explicit-v1',identity:'synthetic QA members; not production identity'}));
 const store=openStore(dir);if(!store.hasAdmin()){
  store.initFirstAdmin('b2-qa#admin');for(const role of ['planner','supervisor','query']){const invite=store.createInvite({role,createdBy:'b2-qa#admin',requireApproval:false});store.acceptInvite(invite.token,'b2-qa#'+role);}
 }
 const actor=(req,_res,next)=>{req.praetorActor={kind:'user',issuer:'b2-qa',sub:req.get('test-sub')||'planner',requestId:'B2-isolated-synthetic'};next();};
 const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store});const app=express();app.use(express.json({limit:'2mb'}));
 app.use('/api/auth',router);
 app.use('/api',createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember}));
 if(browser){const {build}=await import('vite');const root=fileURLToPath(new URL('..',import.meta.url)),dist=path.join(dir,'dist');await build({root,base:'/',resolve:{alias:[{find:/^@praetor\/lite-app-runtime$/,replacement:fileURLToPath(new URL('./fr033-integration-runtime.mjs',import.meta.url))}]},build:{outDir:dist,emptyOutDir:true}});app.use(express.static(dist));app.get('*',(_req,res)=>res.sendFile(path.join(dist,'index.html')));}
 const server=app.listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
 const call=async(endpoint,body,role='planner')=>{const response=await fetch(url+'/api'+endpoint,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','test-sub':role},body:body?JSON.stringify({reason:'B2 explicit simulation',...body}):undefined});return {status:response.status,body:response.headers.get('content-type')?.includes('json')?await response.json():await response.text()};};
 const ok=async(...args)=>{const r=await call(...args);if(r.status>=300)throw Error(JSON.stringify(r));return r.body;};
 if(scenario&&!fs.existsSync(path.join(dir,'business.json')))await ok('/inputs',{revision:0,tables:b2Scenario(scenario).data});
 return {url,dir,ok,call,bytes:()=>fs.readFileSync(path.join(dir,'business.json'),'utf8'),close:()=>new Promise(r=>server.close(r))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.env.B2_DISPOSABLE_QA!=='1')throw Error('Set B2_DISPOSABLE_QA=1; never run this host as production');
 const host=await b2Host({dir:process.env.B2_DATA_DIR,browser:true,scenario:process.env.B2_SCENARIO,port:Number(process.env.B2_PORT||0)});
 console.log(JSON.stringify({url:host.url,dataDir:host.dir,identity:'synthetic isolated QA members',scenario:process.env.B2_SCENARIO||'persisted',scope:'task-level simulation; no production customer facts or UAT verdict'}));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await host.close();process.exit(0);});
}
