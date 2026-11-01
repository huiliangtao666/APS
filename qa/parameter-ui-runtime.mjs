// Explicit isolated test adapter; never imported by the production entry.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {createBusinessRouter} from '../server/business.mjs';
import {createAuthRouter} from '../server/auth/routes.mjs';
import {openStore} from '../server/auth/store.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.env.PARAMETER_UI_ISOLATED!=='1'||process.env.PARAMETER_UI_STATE!=='/state')throw Error('Explicit isolated test state required');
const state='/state',hash=b=>createHash('sha256').update(b).digest('hex');
// Fingerprint the loaded adapter. A Git checkout may replace a host file bind
// later; that must not change the identity of this already loaded test process.
const loadedAdapterSha256=hash(fs.readFileSync(fileURLToPath(import.meta.url)));
const source=JSON.parse(fs.readFileSync(root+'/SOURCE.json'));
if(source.source_sha!==process.env.PARAMETER_UI_PRODUCT_SHA)throw Error('Source SHA mismatch');
for(const f of source.files){if(hash(fs.readFileSync(root+'/'+f.path))!==f.sha256)throw Error('Source drift: '+f.path);}
const build=JSON.parse(fs.readFileSync('/control/build.json'));
if(build.source_sha!==source.source_sha)throw Error('Build SHA mismatch');
for(const f of build.files){if(hash(fs.readFileSync(root+'/dist/'+f.path))!==f.sha256)throw Error('Build drift: '+f.path);}
fs.mkdirSync(state+'/auth',{recursive:true});
const members={};for(const role of ['planner','supervisor','query'])members['parameter-ui-explicit-mock#'+role]={role,status:'active',canExport:role!=='query',name:'Explicit replaceable mock '+role};
const memberFile=state+'/auth/members.json';if(!fs.existsSync(memberFile))fs.writeFileSync(memberFile,JSON.stringify({members,invites:{},initialized:true}));
const app=express(),workers=new Set(),audit=[];let createdWorkers=0;
app.use(express.json({limit:'20mb'}));
app.use((req,res,next)=>{if(req.method!=='GET'){const available=Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)[1]);if(available<1048576)return res.status(503).json({error:'isolated_test_capacity_stop'});}next();});
const actorMiddleware=(req,res,next)=>{const role=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('parameter-ui-role='))?.split('=')[1]||'supervisor';if(!['planner','supervisor','query','anonymous','shared'].includes(role))return res.status(401).json({error:'unknown_explicit_mock'});req.parameterTestRole=role;req.praetorActor={kind:role==='anonymous'?'anonymous':'user',issuer:'parameter-ui-explicit-mock',sub:role,requestId:randomUUID()};next();};
const {requireMember}=createAuthRouter({actorMiddleware,sendActorError:(res,e)=>res.status(401).json({error:String(e)}),store:openStore(state)});
const workerFactory=workerData=>{if(workers.size)throw Error('Only one serial Worker permitted');const w=new Worker(new URL('../server/calculation-worker.mjs',import.meta.url),{workerData,execArgv:['--experimental-strip-types'],resourceLimits:{maxOldGenerationSizeMb:128}});workers.add(w);createdWorkers++;audit.push({event:'worker-start',at:new Date().toISOString(),kind:workerData.kind});w.once('exit',code=>{workers.delete(w);audit.push({event:'worker-exit',at:new Date().toISOString(),code});});return w;};
const managed=createBusinessRouter({dataDir:state,accessMode:'managed',actorMiddleware,requireMember,workerFactory,workbookImportHeapMiB:128});
const shared=createBusinessRouter({dataDir:state,accessMode:'shared',workerFactory,workbookImportHeapMiB:128});
app.get('/api/parameter-ui-deployment',(_req,res)=>res.json({productSha:source.source_sha,parent:source.parent,build,sourceManifestSha256:hash(fs.readFileSync(root+'/SOURCE.json')),adapterSha256:loadedAdapterSha256,mode:'Explicit replaceable mock; production membership/permissions/CSRF, optional actual shared access',defaultMockRole:'supervisor',url:'http://127.0.0.1:18302',ownedWorkers:workers.size,createdWorkers,audit}));
app.use('/api',(req,res,next)=>actorMiddleware(req,res,()=>req.parameterTestRole==='shared'?shared(req,res,next):managed(req,res,next)));
app.use(express.static(root+'/dist'));app.get('*',(_req,res)=>res.sendFile(root+'/dist/index.html'));
const server=app.listen(4317,'0.0.0.0');await new Promise(r=>server.once('listening',r));console.log('PARAMETER_UI_READY '+source.source_sha);
for(const sig of ['SIGINT','SIGTERM'])process.once(sig,async()=>{server.close();for(const w of workers)await w.terminate();console.log(JSON.stringify({event:'released',ownedWorkers:workers.size,createdWorkers}));process.exit(0);});
