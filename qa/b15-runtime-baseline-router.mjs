// Explicit independent MOCK domain inside the EXISTING B15 process; no listener.
// Offline deliverable. Loading this module into 18251 requires PM-coordinated activation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {createBusinessRouter} from '../server/business.mjs';
import {baselineHtml,baselinePrefix} from './b15-runtime-baseline-ui.mjs';
const id='SIM-LP01-PRE1-v1';
export function installB15BaselineRoutes({app,actor,requireMember,metadata,authRouter}){
 // Activation metadata may only be installed after the reviewed window gates pass.
 // Do not change an existing container's environment or manufacture gate results.
 if(metadata.qaBaselineActivation?.scope!==id)return false;
 if(metadata.productSha!=='48e0766d9733eff99f9bc3f0718639aab89fcf0e')throw Error('baseline requires fixed48e');
 const prefix=baselinePrefix, dataDir=path.join('/state','baselines',id);
 fs.mkdirSync(dataDir,{recursive:true});
 const marker=path.join(dataDir,'EXPLICIT-MOCK.json');
 if(!fs.existsSync(marker)&&fs.readdirSync(dataDir).length)throw Error('unknown nonempty baseline directory');
 if(!fs.existsSync(marker))fs.writeFileSync(marker,JSON.stringify({id,kind:'independent derived MOCK; NOT rollback of current history',productSha:metadata.productSha}),{flag:'wx',mode:0o600});
 app.use(prefix,(req,res,next)=>{
  res.set('X-B15-Simulation',id);
  if((req.path==='/api'||req.path.startsWith('/api/'))&&req.get('X-B15-Simulation')!==id)return res.status(400).json({error:'explicit_simulation_scope_required',id});
  next();
 });
 app.get(prefix+'/ui',(_req,res)=>res.type('html').send(baselineHtml()));
 app.get(prefix+'/role/:role',(req,res)=>{
  if(!['planner','supervisor','query'].includes(req.params.role))return res.sendStatus(400);
  res.cookie('b15Role',req.params.role,{httpOnly:true,sameSite:'lax'});res.redirect(prefix+'/ui');
 });
 app.get(prefix+'/api/uat-build',(_req,res)=>{
  const f=path.join(dataDir,'business.json'),bytes=fs.existsSync(f)?fs.readFileSync(f):null;
  res.json({productSha:metadata.productSha,buildSource:metadata.buildSource,parent:metadata.parent,baselineScope:id,simulation:true,mainStore:false,stateHash:bytes?createHash('sha256').update(bytes).digest('hex'):null,adapters:metadata.adapters,qaBaselineActivation:metadata.qaBaselineActivation,uiEntry:prefix+'/ui',activation:'independent dataDir; same existing process/port; ordinary product guards/Worker'});
 });
 if(!authRouter)throw Error('original auth router required');
 app.use(prefix+'/api/auth',authRouter);
 // Existing auth/roles and unmodified product router. No history injection or guard bypass.
 let activeWorker=null;
 const workerFactory=workerData=>{
  if(activeWorker)throw Error('bounded baseline permits one Worker');
  const worker=new Worker(new URL('../server/calculation-worker.mjs',import.meta.url),{workerData,resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:4,stackSizeMb:4}});
  activeWorker=worker;worker.once('exit',()=>{if(activeWorker===worker)activeWorker=null;});
  return worker;
 };
 app.use(prefix+'/api',createBusinessRouter({dataDir,actorMiddleware:actor,requireMember,workerFactory}));
 // The reviewed window permits only GET against the existing main domain.
 app.use('/api',(req,res,next)=>['GET','HEAD'].includes(req.method)?next():res.status(405).json({error:'main_read_only_during_baseline_window',baselineScope:id}));
 return true;
}
