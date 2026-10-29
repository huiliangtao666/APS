import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';import {filesOf} from './fr013-main-fixture.mjs';import {executionFixture} from './execution-fixture.mjs';import {seed} from '../server/planner.ts';
const out='/evidence/guards';fs.mkdirSync(out,{recursive:true});const report={checks:[],proofs:[]};
const hash=x=>createHash('sha256').update(x).digest('hex');
function snapshot(f){const raw=f.bytes(),s=JSON.parse(raw);return {whole:hash(raw),bytes:Buffer.byteLength(raw),revision:s.revision,data:hash(JSON.stringify(s.data)),plans:hash(JSON.stringify(s.plans)),audit:hash(JSON.stringify(s.records)),facts:hash(JSON.stringify([s.data.executionFacts,s.data.executionMaterials,s.data.executionSources]))};}
async function proof(f,name,endpoint,body,status,role='planner'){const before=snapshot(f),r=await f.call(endpoint,body,role),after=snapshot(f);assert.equal(r.status,status,JSON.stringify(r));assert.deepEqual(after,before);report.proofs.push({name,status,error:r.body.error,issues:r.body.issues,before,after});return r;}
const f=await fixture(null);
try{
 await f.ok('/calculate',{revision:0});
 const d=structuredClone(seed);d.orders[0]['优先顺序']='8';d.machines[0]['设备名称']='independent';d.routes[0]['工序名称']='independent route';d.times[0]['固定分钟']='31';d.dependencies[0]['说明']='independent dependency';d.rules[0]['中文名称']='independent rule';
 // Only use contracted fields in this fixture; change dependency selection to an existing value.
 delete d.dependencies[0]['说明'];d.dependencies[0]['资源编号']='MIX02';
 const files=filesOf(d),before=snapshot(f),p=await f.ok('/imports/preview',{revision:0,files});assert.equal(p.valid,true);assert.deepEqual(snapshot(f),before);
 const rename=fs.renameSync;let businessRenames=0;fs.renameSync=(a,b)=>{if(b===path.join(f.dir,'business.json'))businessRenames++;return rename(a,b);};
 let committed;try{committed=await f.ok('/imports/commit',{previewId:p.id,files:filesOf(seed),tables:{orders:[]},actor:'fake',role:'admin',revision:999});}finally{fs.renameSync=rename;}
 assert.equal(businessRenames,1);assert.equal(committed.revision,1);assert.equal(committed.data.orders[0]['优先顺序'],'8');assert.equal(committed.data.dependencies[0]['资源编号'],'MIX02');const s=JSON.parse(f.bytes());const records=s.records.filter(r=>r.action==='import');assert.equal(records.length,6);assert.equal(new Set(records.map(r=>r.batchId)).size,1);assert.ok(records.every(r=>r.actor==='test#planner'&&r.role==='planner'));
 report.proofs.push({name:'all six changed tables one rename and trusted shared audit; forged payload ignored',before,after:snapshot(f),businessRenames,audit:records});
 await proof(f,'consumed token','/imports/commit',{previewId:p.id},409);
 const q=await f.ok('/imports/preview',{revision:1,files});const repeatBefore=snapshot(f),repeat=await f.ok('/imports/commit',{previewId:q.id});assert.equal(repeat.unchanged,true);assert.deepEqual(snapshot(f),repeatBefore);
 const token=await f.ok('/imports/preview',{revision:1,files});const invite=f.store.createInvite({role:'planner',createdBy:'test#admin',requireApproval:false});f.store.acceptInvite(invite.token,'test#other-planner');await proof(f,'same-role different owner','/imports/commit',{previewId:token.id},409,'other-planner');
 const legacy=filesOf(d);legacy[0].text=legacy[0].text.replace('合格需求','合格需求kg');let r=await proof(f,'legacy kg explicit rejection','/imports/preview',{revision:1,files:legacy},200);assert.equal(r.body.valid,false);assert.ok(r.body.issues.some(x=>x.field==='合格需求kg'&&/不自动转换/.test(x.reason)));
 const invalid=filesOf(d);invalid[1].text+='"unclosed';r=await proof(f,'syntax negative no token','/imports/preview',{revision:1,files:invalid},200);assert.equal(r.body.valid,false);assert.equal(r.body.id,undefined);
 report.checks.push('six distinct changed tables one rename; caller files/tables/actor/role/revision ignored; shared trusted audit; single use; repeat no-op; same-role owner; legacy and syntax rejection');
}finally{await f.close();}
const e=await fixture(null);
try{
 const data=executionFixture(seed);await e.ok('/inputs',{revision:0,tables:data});const changed=structuredClone(data);changed.orders[0]['优先顺序']='8';let p=await e.ok('/imports/preview',{revision:1,files:filesOf(changed)});assert.equal(p.valid,true);
 const current=structuredClone((await e.ok('/state')).data);current.executionFacts[0]['观测分钟']='31';current.executionFacts[0]['工序完成数量']='41';current.executionMaterials[0]['累计已用数量']='41';await e.ok('/inputs',{revision:1,tables:{executionFacts:current.executionFacts,executionMaterials:current.executionMaterials}});
 await proof(e,'actual facts updated after preview','/imports/commit',{previewId:p.id},409);
 const old=await proof(e,'re-preview stale demand data against new current facts','/imports/preview',{revision:2,files:filesOf({...changed,orders:changed.orders.map(r=>({...r,'合格需求':'1'}))})},409);assert.equal(old.body.error,'execution_reconciliation_required');
 p=await e.ok('/imports/preview',{revision:2,files:filesOf(changed)});assert.equal(p.valid,true);const before=JSON.parse(e.bytes());await e.ok('/imports/commit',{previewId:p.id});const after=JSON.parse(e.bytes());for(const k of ['executionFacts','executionMaterials','executionSources'])assert.deepEqual(after.data[k],before.data[k]);
 report.checks.push('actual current fact update invalidates token; re-preview revalidates changed facts; valid import preserves all fact/material/source values');
}finally{await e.close();}
fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log('INDEPENDENT_GUARDS_PASS '+report.checks.length+' groups / '+report.proofs.length+' proofs');
