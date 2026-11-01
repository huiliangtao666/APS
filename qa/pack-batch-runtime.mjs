// Private loopback task-level fixture. Never imported by production or bound in Portal.
import fs from 'node:fs';import express from 'express';
import {openStore} from '../server/auth/store.mjs';import {createAuthRouter} from '../server/auth/routes.mjs';import {createBusinessRouter} from '../server/business.mjs';
import {packScenario} from './pack-batch-fixture.mjs';import {scenarioFiles} from './b3-material-fixture.mjs';
if(process.env.PACK_PRIVATE!=='1'||process.env.NODE_ENV==='production')throw Error('Private simulation fixture only');
const out=process.env.PACK_OUTPUT,dir=process.env.PACK_STATE;
if(!out||!dir)throw Error('Isolated evidence and state required');
fs.writeFileSync(out+'/browser-profile.json',JSON.stringify({data:packScenario(),files:scenarioFiles(packScenario())}));
const store=openStore(dir);if(!store.hasAdmin()){store.initFirstAdmin('b2-qa#admin');for(const role of ['planner','supervisor','query']){const invite=store.createInvite({role,createdBy:'b2-qa#admin',requireApproval:false});store.acceptInvite(invite.token,'b2-qa#'+role);}}
const actor=(req,_res,next)=>{req.praetorActor={kind:'user',issuer:'b2-qa',sub:req.get('test-sub')||'planner',requestId:'pack-private'};next();};
const {router,requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store}),app=express();app.use(express.json({limit:'2mb'}));app.use('/api/auth',router);app.use('/api',createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember}));
app.use(express.static(dir+'/dist'));app.get('*',(_req,res)=>res.sendFile(dir+'/dist/index.html'));
const server=app.listen(4318,'0.0.0.0');await new Promise(r=>server.once('listening',r));console.log('PACK_PRIVATE_READY');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
