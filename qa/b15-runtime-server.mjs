// Isolated B15 integration environment. Product modules are the fixed 48e archive.
import fs from 'node:fs';
import v8 from 'node:v8';
import {createHash} from 'node:crypto';
// Self-exec before product imports/listener/state access: same PID, unchanged
// container command/config/environment, bounded heap for this single activation.
if(v8.getHeapStatistics().heap_size_limit>80*1024*1024){
 if(typeof process.execve!=='function')throw Error('bounded Node bootstrap unavailable');
 process.execve(process.execPath,[process.execPath,'--max-old-space-size=64','--max-semi-space-size=4','--experimental-strip-types',...process.argv.slice(1)],process.env);
 throw Error('execve unexpectedly returned');
}
const {default:express}=await import('express');
const {installB15BaselineRoutes}=await import('./b15-runtime-baseline-router.mjs');
const {openStore}=await import('../server/auth/store.mjs');
const {createAuthRouter}=await import('../server/auth/routes.mjs');
const {createBusinessRouter}=await import('../server/business.mjs');
if(process.env.B15_RUNTIME_ISOLATED!=='1')throw Error('isolated runtime required');
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
if(fs.statSync('/build/metadata.json').size>1024*1024)throw Error('manifest cap');
const metadata=JSON.parse(fs.readFileSync('/build/metadata.json'));
if(Object.keys(metadata.sourceFiles).length+Object.keys(metadata.uiFiles).length>4000)throw Error('manifest entry cap');
const buffer=Buffer.alloc(64*1024);
for(const [prefix,entries]of [['',metadata.sourceFiles],['/ui/',metadata.uiFiles]]){
 for(const name in entries){
  const h=createHash('sha256'),fd=fs.openSync(prefix+name,'r');
  try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))h.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}
  if(h.digest('hex')!==entries[name])throw Error('fixed file drift '+prefix+name);
 }
}
console.log(JSON.stringify({boundedStartup:true,heapLimit:v8.getHeapStatistics().heap_size_limit,chunkBytes:buffer.length,concurrency:1,rss:process.memoryUsage().rss,maxRSSKiB:process.resourceUsage().maxRSS}));
const dir='/state';fs.mkdirSync(dir,{recursive:true});
const marker=dir+'/B15-RUNTIME.json';
if(!fs.existsSync(marker)&&fs.readdirSync(dir).length)throw Error('requires private empty state');
if(!fs.existsSync(marker))fs.writeFileSync(marker,JSON.stringify({productSha:metadata.productSha,delivery:metadata.delivery}));
const roles=['planner','supervisor','query'],issuer='b15-runtime-explicit-mock',store=openStore(dir);
if(!store.hasAdmin()){store.initFirstAdmin(issuer+'#admin');for(const role of roles){const inv=store.createInvite({role,createdBy:issuer+'#admin',requireApproval:false});store.acceptInvite(inv.token,issuer+'#'+role);store.setExport(issuer+'#'+role,true,issuer+'#admin');}}
const roleOf=req=>req.get('test-sub')||req.get('cookie')?.match(/(?:^|;\s*)b15Role=(planner|supervisor|query)(?:;|$)/)?.[1]||'planner';
const actor=(req,res,next)=>{const role=roleOf(req);if(!roles.includes(role))return res.status(400).json({error:'unknown_simulation_role'});req.praetorActor={kind:'user',issuer,sub:role,requestId:'b15-runtime-'+Date.now()};next();};
const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store}),app=express();
app.disable('x-powered-by');app.use(express.json({limit:'2mb'}));app.use((_q,r,n)=>{r.set('Cache-Control','no-store');n();});
app.get('/__qa/role/:role',(req,res)=>{if(!roles.includes(req.params.role))return res.sendStatus(400);res.cookie('b15Role',req.params.role,{httpOnly:true,sameSite:'lax'});res.redirect('/');});
app.get('/api/uat-build',(req,res)=>{const bytes=fs.existsSync(dir+'/business.json')?fs.readFileSync(dir+'/business.json'):Buffer.from('{}'),s=JSON.parse(bytes);res.json({...metadata,sourceFiles:undefined,role:roleOf(req),inputRevision:s.revision||0,dataHash:hash(s.data||null),stateHash:hash(bytes),planIds:(s.plans||[]).map(p=>p.id),mock:true,published:false,uatVerdict:'NOT_EXECUTED'});});
app.get('/__qa/source-manifest.json',(_q,r)=>r.sendFile('/build/metadata.json'));
const baselineActive=installB15BaselineRoutes({app,actor,requireMember,metadata,authRouter:router});
app.use('/fixtures',express.static('/fixtures',{index:false}));app.use('/api/auth',router);app.use('/api',createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember}));
const banner='<aside style="padding:12px;background:#fff3c4">B15 48e0766 · 隔离可替换模拟 · 任务级自测，QA尚未执行。角色：'+roles.map(r=>'<a href="/__qa/role/'+r+'">'+r+'</a>').join(' / ')+' · <a href="/api/uat-build">build指纹</a> · '+['15','17','18'].map(s=>'<a href="/fixtures/'+s+'/PROFILE.json">'+s+'输入清单</a>').join(' / ')+'</aside>';
const domainLink=baselineActive?'<aside><a href="/__qa/baselines/SIM-LP01-PRE1-v1/ui">进入独立SIM-LP01-PRE1-v1产品操作域</a> · 主域只读</aside>':'';
const html=fs.readFileSync('/ui/index.html','utf8').replace('<body>','<body>'+domainLink+banner);
app.get('/',(_q,r)=>r.type('html').send(html));app.use(express.static('/ui',{index:false}));app.get('*',(_q,r)=>r.type('html').send(html));
const server=app.listen(4317,'0.0.0.0');await new Promise(r=>server.once('listening',r));console.log(JSON.stringify({ready:true,productSha:metadata.productSha,delivery:metadata.delivery}));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
