// Isolated engineering candidate. No Portal binding or production identity.
import fs from 'node:fs';import express from 'express';import {createHash} from 'node:crypto';
import {openStore} from '../server/auth/store.mjs';import {createAuthRouter} from '../server/auth/routes.mjs';import {createBusinessRouter} from '../server/business.mjs';
import {scenario} from './br13-application-closure-fixture.mjs';import {scenarioFiles} from './b3-material-fixture.mjs';
if(process.env.BR13_PRIVATE!=='1'||process.env.NODE_ENV==='production')throw Error('Requires isolated nonproduction candidate');
const dir='/state',meta=JSON.parse(fs.readFileSync('/candidate-metadata.json')),hash=x=>createHash('sha256').update(x).digest('hex');
for(const [file,sha]of Object.entries(meta.files))if(hash(fs.readFileSync(file))!==sha)throw Error('Source drift '+file);
fs.mkdirSync(dir,{recursive:true});const marker=dir+'/BR13-ISOLATED.json';if(!fs.existsSync(marker)&&fs.readdirSync(dir).length)throw Error('Empty private state required');if(!fs.existsSync(marker))fs.writeFileSync(marker,JSON.stringify({delivery:'dlv_4ad8bd4b-f336-4ab1-aef1-fb567eacdd1f',productSha:meta.productSha}));
const store=openStore(dir),issuer='br13-simulation',roles=['planner','supervisor','query'];
if(!store.hasAdmin()){store.initFirstAdmin(issuer+'#admin');for(const role of roles){const invite=store.createInvite({role,createdBy:issuer+'#admin',requireApproval:false});store.acceptInvite(invite.token,issuer+'#'+role);store.setExport(issuer+'#'+role,true,issuer+'#admin');}}
const roleOf=req=>req.get('X-UAT-Synthetic-Role')||req.get('cookie')?.match(/(?:^|;\s*)br13Role=(planner|supervisor|query)(?:;|$)/)?.[1]||'planner';
const actor=(req,res,next)=>{const sub=roleOf(req);if(!roles.includes(sub))return res.sendStatus(400);req.praetorActor={kind:'user',issuer,sub,requestId:'BR13-simulation'};next();};
const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store}),app=express();app.use(express.json({limit:'2mb'}));
app.get('/__qa/role/:role',(req,res)=>{if(!roles.includes(req.params.role))return res.sendStatus(400);res.cookie('br13Role',req.params.role,{httpOnly:true,sameSite:'strict'});res.redirect('/');});app.use('/api/auth',router);
app.get('/api/br13-build',(_req,res)=>res.json({...meta,node:process.version,scope:'BR13 replaceable simulation; Dev selftest only; no QA UAT verdict'}));
app.get('/fixtures/PROFILE.json',(_req,res)=>res.json({simulation:true,data:scenario(),files:scenarioFiles(scenario())}));app.use('/api',createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember}));
const banner='<aside style="padding:12px;background:#fff2bb">BR13 隔离仿真候选 '+meta.productSha+' · <a href="/__qa/role/planner">模拟计划员</a> / <a href="/__qa/role/query">模拟查询员</a> · 非现场事实或QA结论</aside>';
const html=fs.readFileSync('/candidate-dist/index.html','utf8').replace('<body>','<body>'+banner);app.get('/',(_req,res)=>res.type('html').send(html));app.use(express.static('/candidate-dist',{index:false}));app.get('*',(_req,res)=>res.type('html').send(html));
const server=app.listen(4321,'0.0.0.0');await new Promise(r=>server.once('listening',r));console.log(JSON.stringify({ready:true,productSha:meta.productSha,port:4321}));for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
