// Unbound fixed-source engineering candidate. Never imported by the deployed app.
import fs from 'node:fs';import {createHash} from 'node:crypto';import express from 'express';
import {openStore} from '../../server/auth/store.mjs';import {createAuthRouter} from '../../server/auth/routes.mjs';import {createBusinessRouter} from '../../server/business.mjs';
if(process.env.R7_ISOLATED!=='1'||process.env.NODE_ENV==='production')throw Error('isolated nonproduction candidate required');
const hash=b=>createHash('sha256').update(typeof b==='string'||Buffer.isBuffer(b)?b:JSON.stringify(b)).digest('hex'),manifest=JSON.parse(fs.readFileSync('/source-manifest.json'));
if(manifest.productSha!==process.env.R7_PRODUCT_SHA)throw Error('SHA mismatch');
for(const [f,h]of Object.entries(manifest.files))if(hash(fs.readFileSync('/workspace/apps/app/'+f))!==h)throw Error('source drift '+f);
const dir='/state',marker=dir+'/R7-ISOLATED.json';fs.mkdirSync(dir,{recursive:true});if(!fs.existsSync(marker)&&fs.readdirSync(dir).length)throw Error('requires empty private state');
if(!fs.existsSync(marker))fs.writeFileSync(marker,JSON.stringify({delivery:'dlv_16b0f1de-32f3-4ce0-a436-df42b8d25d43',productSha:manifest.productSha,scope:'R7 replaceable simulation; whole Issue41 remains subject to residuals; no QA verdict'}));
const store=openStore(dir),issuer='r7-explicit-simulation',roles=['planner','supervisor','query'];
if(!store.hasAdmin()){store.initFirstAdmin(issuer+'#admin');for(const role of roles){const i=store.createInvite({role,createdBy:issuer+'#admin',requireApproval:false});store.acceptInvite(i.token,issuer+'#'+role);store.setExport(issuer+'#'+role,true,issuer+'#admin');}}
const roleOf=req=>{const role=req.get('X-UAT-Synthetic-Role')||req.get('cookie')?.match(/(?:^|;\s*)r7Role=(planner|supervisor|query)(?:;|$)/)?.[1]||'planner';return roles.includes(role)?role:null;};
const actor=(req,res,next)=>{const role=roleOf(req);if(!role)return res.status(400).json({error:'unknown_synthetic_role'});req.praetorActor={kind:'user',issuer,sub:role,requestId:'R7-synthetic-'+Date.now()};next();};
const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store}),app=express();app.disable('x-powered-by');app.use(express.json({limit:'2mb'}));app.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
app.get('/__qa/role/:role',(req,res)=>{if(!roles.includes(req.params.role))return res.sendStatus(400);res.cookie('r7Role',req.params.role,{httpOnly:true,sameSite:'strict'});res.redirect('/');});app.use('/api/auth',router);
const meta=JSON.parse(fs.readFileSync('/r7-build-metadata.json'));
app.get('/api/uat-build',(req,res)=>{const state=fs.existsSync(dir+'/business.json')?JSON.parse(fs.readFileSync(dir+'/business.json')):{revision:0,plans:[],runs:[]};res.json({...meta,environment:'R7 isolated normalized simulation; no QA verdict',roles,syntheticRole:roleOf(req),formalAccountRequired:false,customerSsoVerified:false,inputRevision:state.revision,stateFingerprint:hash(state),plans:state.plans.length,runs:state.runs.length});});
app.use('/api',createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember}));
app.get('/__qa/source-manifest.json',(_req,res)=>res.sendFile('/source-manifest.json'));app.use('/fixtures',express.static('/fixtures',{index:false,dotfiles:'deny'}));
const banner='<aside role="note" style="padding:14px;background:#fff3c4"><strong>R7 · 隔离模拟候选 · '+manifest.productSha+'</strong><p>显式可替换模拟；不是原19类完整直通、AC25整包或QA结论。模拟角色：<a href="/__qa/role/planner">计划员</a> / <a href="/__qa/role/supervisor">主管</a> / <a href="/__qa/role/query">查询员</a>。</p><p><a href="/fixtures/PROFILE.json">模拟配置</a> · <a href="/api/uat-build">固定版本与指纹</a></p></aside>';
const html=fs.readFileSync('/r7-dist/index.html','utf8').replace('<body>','<body>'+banner);app.get('/',(_req,res)=>res.type('html').send(html));app.use(express.static('/r7-dist',{index:false}));app.get('*',(_req,res)=>res.type('html').send(html));
const server=app.listen(4317,'0.0.0.0');await new Promise(r=>server.once('listening',r));console.log(JSON.stringify({ready:true,productSha:manifest.productSha,port:4317}));for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
