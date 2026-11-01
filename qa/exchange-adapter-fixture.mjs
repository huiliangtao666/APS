// Explicit synthetic actor fixture. Never register this dispatcher in the app.
// Real business/auth routers, no listener, network request or Worker.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createBusinessRouter} from '../server/business.mjs';
import {openStore} from '../server/auth/store.mjs';
import {createAuthRouter} from '../server/auth/routes.mjs';
import {defs} from '../server/planner.ts';
import {makeEnvelope} from '../server/exchange-adapters/index.mjs';
import net from 'node:net';
import dgram from 'node:dgram';

// Executable proof that these examples/tests cannot use external or loopback
// transport. Scoped to these standalone QA processes, never production imports.
export const activity={networkAttempts:0,listeners:0,Workers:0};
const forbiddenNetwork=()=>{activity.networkAttempts++;throw Error('network forbidden in explicit offline fixture');};
net.Socket.prototype.connect=forbiddenNetwork;
net.Server.prototype.listen=()=>{activity.listeners++;throw Error('listener forbidden in explicit offline fixture');};
dgram.createSocket=forbiddenNetwork;
globalThis.fetch=forbiddenNetwork;
export function usage() {
  const peakRssKiB=process.resourceUsage().maxRSS;
  if(peakRssKiB>=256*1024)throw Error('256MiB STOP threshold');
  return {...activity,peakRssKiB,heapCapMiB:128};
}

export function fixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aps-exchange-mock-'));
  const store=openStore(dir);store.initFirstAdmin('mock#admin');
  for(const role of ['planner','query']) {
    const invite=store.createInvite({role,createdBy:'mock#admin',requireApproval:false});
    store.acceptInvite(invite.token,'mock#'+role);
  }
  let role='planner',crossSite=false;
  const actor=(req,_res,next)=>{req.praetorActor={kind:'user',issuer:'mock',sub:role,requestId:'mock-'+randomUUID()};next();};
  const {requireMember}=createAuthRouter({actorMiddleware:actor,sendActorError:()=>{},store});
  const router=createBusinessRouter({dataDir:dir,actorMiddleware:actor,requireMember,workerFactory:()=>{activity.Workers++;throw Error('Workers forbidden in exchange fixture');}});
  const dispatch=(method,url,body={})=>new Promise((resolve,reject)=>{
    const headers={'content-type':'application/json','host':'mock.invalid','sec-fetch-site':crossSite?'cross-site':'same-origin'};
    const req={method,url,body,headers,query:{},get:k=>headers[k.toLowerCase()],is:type=>type==='application/json'};
    const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},type(v){this.headers['content-type']=v;return this;},
      status(code){this.statusCode=code;return this;},json(value){resolve({status:this.statusCode,body:structuredClone(value)});return this;},send(value){resolve({status:this.statusCode,body:value});return this;}};
    try { router.handle(req,res,error=>error?reject(error):resolve({status:404,body:{error:'not_found'}})); } catch(error){reject(error);}
  });
  const bytes=()=>fs.existsSync(path.join(dir,'business.json'))?fs.readFileSync(path.join(dir,'business.json'),'utf8'):null;
  return {dir,store,dispatch,bytes,setRole:value=>{role=value;},setCrossSite:value=>{crossSite=value;},
    close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
export function csvFile(table,rows) {
  const def=defs.find(d=>d.key===table);if(!def)throw Error('unknown approved table');
  const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  return {name:def.file,text:[def.fields,...rows.map(r=>def.fields.map(f=>r[f]??''))].map(r=>r.map(cell).join(',')).join('\r\n')};
}
export async function importEnvelope(f,overrides={}) {
  const state=(await f.dispatch('GET','/state')).body;
  const rows=structuredClone(state.data.orders);rows[0]['合格需求']='241';
  return makeEnvelope({source:'explicit-local-fixture',sourceVersion:'mock-fixture-v1',idempotencyKey:randomUUID(),correlationId:randomUUID(),direction:'import',
    payload:{files:[csvFile('orders',rows)],table:'orders',revision:state.revision,reason:'Explicit offline #44 mock import'},...overrides});
}
