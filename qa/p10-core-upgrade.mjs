// Run with a checkout of the exact e0be9b6 baseline in P10_LEGACY_ROOT.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {fixture} from './fr027-fixture.mjs';import {p10Fixture} from './p10-core-fixture.mjs';
const root=process.env.P10_LEGACY_ROOT;if(!root)throw Error('P10_LEGACY_ROOT exact e0be9b6 source required');
const {fixture:legacyFixture}=await import(pathToFileURL(path.join(root,'qa/fr027-fixture.mjs')));const {p08Fixture}=await import(pathToFileURL(path.join(root,'qa/p08-fixture.mjs')));
const old=await legacyFixture(),next=await fixture(),report={baseline:'e0be9b6dfbf9be7ce404edc1b80d8c50858ed3dc'};const hash=x=>createHash('sha256').update(x).digest('hex');
const decision=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true});
try{
 await old.ok('/inputs',{revision:0,tables:p08Fixture()});let s=await old.ok('/state');const p=await old.ok('/calculate',{revision:s.revision});await old.ok('/plans/'+p.id+'/verify',{});let r=await old.ok('/plans/'+p.id+'/review');assert.deepEqual(r.blockers,[]);await old.ok('/plans/'+p.id+'/submit',decision(r));r=await old.ok('/plans/'+p.id+'/review');await old.ok('/plans/'+p.id+'/confirm',decision(r),'supervisor');const conf=(await old.ok('/plans/'+p.id+'/review')).confirmation;
 const history=async f=>({confirmation:await f.ok('/confirmations/'+conf.id),input:await f.ok('/plans/'+p.id+'/inputs'),plan:(await f.ok('/plans')).find(x=>x.id===p.id)});
 report.before=await history(old);const raw=old.bytes();assert.ok(!('personnelPools' in JSON.parse(raw).data));
 // Same real old store opened by new router, no reconstructed snapshots.
 fs.writeFileSync(path.join(next.dir,'business.json'),raw);assert.deepEqual(await history(next),report.before);await next.ok('/state');assert.equal(next.bytes(),raw);report.readOnlyStartupHash=hash(raw);
 s=await next.ok('/state');await next.ok('/inputs',{revision:s.revision,tables:p10Fixture()});report.after=await history(next);assert.deepEqual(report.after,report.before);assert.equal(hash(JSON.stringify(report.after)),hash(JSON.stringify(report.before)));
 // Exact old software must reject both new table and mapping fields atomically.
 for(const tables of [{personnelPools:p10Fixture().personnelPools},{personnelGroups:p10Fixture().personnelGroups}]){const before=old.bytes();const result=await old.call('/inputs',{revision:(await old.ok('/state')).revision,tables});assert.ok([400,404].includes(result.status));assert.equal(old.bytes(),before);(report.rollbackRejections??=[]).push({result,beforeHash:hash(before),afterHash:hash(old.bytes())});}
 report.complete=true;
}finally{fs.writeFileSync('/evidence/p10-upgrade-results.json',JSON.stringify(report,null,2));await old.close();await next.close();}
