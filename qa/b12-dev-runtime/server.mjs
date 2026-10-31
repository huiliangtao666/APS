// Unbound, isolated fixed-SHA candidate; never imported by the deployed app.
import fs from 'node:fs';import {createHash} from 'node:crypto';import express from 'express';
import {openStore} from '../../server/auth/store.mjs';import {createAuthRouter} from '../../server/auth/routes.mjs';import {createBusinessRouter} from '../../server/business.mjs';
if(process.env.B12_ISOLATED!=='1'||process.env.NODE_ENV==='production')throw Error('isolated nonproduction candidate required');
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const manifest=JSON.parse(fs.readFileSync('/source-manifest.json'));if(manifest.productSha!==process.env.B12_PRODUCT_SHA)throw Error('SHA mismatch');
for(const [f,h]of Object.entries(manifest.files))if(hash(fs.readFileSync('/workspace/apps/app/'+f))!==h)throw Error('source drift '+f);
const dir='/state',marker=dir+'/B12-ISOLATED.json';fs.mkdirSync(dir,{recursive:true});if(!fs.existsSync(marker)&&fs.readdirSync(dir).length)throw Error('requires empty private state');
if(!fs.existsSync(marker))fs.writeFileSync(marker,JSON.stringify({delivery:'dlv_4c01a1e7-3520-4764-81a6-b7438c2b41f1',continuation:'dlv_095eca3c-c1c4-4882-97cb-3cdf82e8f2b8',productSha:manifest.productSha,scope:'B12 explicit simulation candidate; no QA verdict'}));
const store=openStore(dir),issuer='b12-explicit-simulation',roles=['planner','supervisor','query'];
if(!store.hasAdmin()){store.initFirstAdmin(issuer+'#admin');for(const role of roles){const invite=store.createInvite({role,createdBy:issuer+'#admin',requireApproval:false});store.acceptInvite(invite.token,issuer+'#'+role);store.setExport(issuer+'#'+role,true,issuer+'#admin');}}
const roleOf=req=>{const role=req.get('X-UAT-Synthetic-Role')||req.get('cookie')?.match(/(?:^|;\s*)b12Role=(planner|supervisor|query)(?:;|$)/)?.[1]||'planner';return roles.includes(role)?role:null;};
const actor=(req,res,next)=>{const role=roleOf(req);if(!role)return res.status(400).json({error:'unknown_synthetic_role'});req.praetorActor={kind:'user',issuer,sub:role,requestId:'B12-synthetic-'+Date.now()};next();};
const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store}),app=express();app.disable('x-powered-by');app.use(express.json({limit:'2mb'}));app.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
app.get('/__qa/role/:role',(req,res)=>{if(!roles.includes(req.params.role))return res.sendStatus(400);res.cookie('b12Role',req.params.role,{httpOnly:true,sameSite:'strict'});res.redirect('/');});app.use('/api/auth',router);
const metadata=JSON.parse(fs.readFileSync('/b12-build-metadata.json'));
app.get('/api/uat-build',(req,res)=>{const state=fs.existsSync(dir+'/business.json')?JSON.parse(fs.readFileSync(dir+'/business.json')):{revision:0,data:null,plans:[],runs:[]};res.json({...metadata,environment:'B12 isolated replaceable simulation; original19 admission remains incomplete; no QA verdict',roles,syntheticRole:roleOf(req),formalAccountRequired:false,customerSsoVerified:false,inputRevision:state.revision,dataFingerprint:hash(state.data),stateFingerprint:hash(state),plans:state.plans.length,runs:(state.runs||[]).length});});
app.use('/api',createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember}));
app.get('/__qa/source-manifest.json',(_req,res)=>res.sendFile('/source-manifest.json'));app.get('/__qa/build-metadata.json',(_req,res)=>res.sendFile('/b12-build-metadata.json'));app.use('/fixtures',express.static('/fixtures',{index:false,dotfiles:'deny'}));
const banner='<aside role="note" style="padding:14px;background:#fff3c4;color:#382b00"><strong>B12 · 隔离模拟候选 · '+manifest.productSha+'</strong><p>可替换显式模拟；不是客户事实、原19类全部贯通或 QA UAT 结论。模拟角色：<a href="/__qa/role/planner">计划员</a> / <a href="/__qa/role/supervisor">主管</a> / <a href="/__qa/role/query">查询员</a>。</p><p>'+['12','13','14'].map(id=>'<a href="/fixtures/UAT-'+id+'/PROFILE.json">UAT'+id+'模拟配置及原件指纹</a>').join(' · ')+' · <a href="/api/uat-build">版本与实时指纹</a></p></aside>';
const html=fs.readFileSync('/b12-dist/index.html','utf8').replace('<body>','<body>'+banner);app.get('/',(_req,res)=>res.type('html').send(html));app.use(express.static('/b12-dist',{index:false}));app.get('*',(_req,res)=>res.type('html').send(html));
const server=app.listen(4317,'0.0.0.0');await new Promise(r=>server.once('listening',r));
console.log(JSON.stringify({ready:true,productSha:manifest.productSha,port:4317}));for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
