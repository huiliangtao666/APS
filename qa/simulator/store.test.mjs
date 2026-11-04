import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {SimulatorStore} from '../../server/simulator/store.mjs';
import {copy,fingerprint} from '../../server/simulator/contract.mjs';
import {threeDaySpec} from './three-day.mjs';

async function fixture(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aps-simulator-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const root=path.join(dir,'independent-simulator'),store=await new SimulatorStore(root).init();
  await store.create('SIM900','BR900',threeDaySpec());return {dir,root,store};
}
test('SIM-03: daily and N-day business snapshots equal; persist and reopen',async t=>{
  const {store,root}=await fixture(t);await store.create('SIM900','DAILY',threeDaySpec());
  await store.advance('SIM900','BR900',{requestId:'THREE',expectedRevision:1,days:3});
  for(let i=0;i<3;i++){const d=await store.read('SIM900','DAILY');await store.advance('SIM900','DAILY',{requestId:'D'+i,expectedRevision:d.revision,days:1});}
  const restarted=await new SimulatorStore(root).init(),a=await restarted.read('SIM900','BR900'),b=await restarted.read('SIM900','DAILY');
  assert.deepEqual(a.checkpoints.map(c=>c.snapshot.businessHash),b.checkpoints.map(c=>c.snapshot.businessHash));assert.equal(a.lastSuccessfulDate,'2026-11-03');
});
test('SIM-04: failure keeps successful checkpoint and rejected receipt; corrected script requires new branch',async t=>{
  const {store}=await fixture(t),spec=threeDaySpec();spec.events.find(e=>e.id==='E11').data.allocations[0].quantity=999;
  await store.create('SIM900','FAIL',spec);const result=await store.advance('SIM900','FAIL',{requestId:'BAD',expectedRevision:1,days:3});
  assert.equal(result.operation.status,'FAILED');assert.equal(result.operation.completedDays,1);assert.equal(result.view.lastSuccessfulDate,'2026-11-01');
  const previous=fingerprint((await store.read('SIM900','FAIL')).state);
  const again=await store.advance('SIM900','FAIL',{requestId:'BAD',expectedRevision:1,days:3});assert.equal(again.operation.status,'FAILED');
  assert.equal(fingerprint((await store.read('SIM900','FAIL')).state),previous);
  const old=await store.read('SIM900','FAIL');const fixed=await store.fork('SIM900','FAIL',{newBranch:'FIXED',checkpointId:'CP-2026-11-01',expectedRevision:old.revision,replacementSpec:threeDaySpec()});
  const done=await store.advance('SIM900','FIXED',{requestId:'REPAIRED',expectedRevision:fixed.revision,days:2});assert.equal(done.operation.status,'COMPLETED');
  assert.equal((await store.read('SIM900','FAIL')).lastSuccessfulDate,'2026-11-01');
});
test('SIM-18: another node process reads durable receipt and duplicate request cannot rededuct',async t=>{
  const {store,root}=await fixture(t),req={requestId:'ONCE',expectedRevision:1,days:2};await store.advance('SIM900','BR900',req);
  const moduleUrl=new URL('../../server/simulator/store.mjs',import.meta.url).href;
  const script='import {SimulatorStore} from '+JSON.stringify(moduleUrl)+';const s=await new SimulatorStore(process.argv[1]).init();const out=await s.advance("SIM900","BR900",'+JSON.stringify(req)+');process.stdout.write(JSON.stringify(out));';
  const out=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',script,root],{stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('child exceeded 10s'));},10000);
    child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);code===0?resolve(JSON.parse(stdout)):reject(Error(stderr));});});
  assert.equal(out.operation.completedDays,2);assert.equal(out.view.lastSuccessfulDate,'2026-11-02');
  assert.equal((await store.read('SIM900','BR900')).state.lots.find(l=>l.id==='RAW01').quantity,30);
});
test('SIM-19: content conflict and version conflict leave state unchanged',async t=>{
  const {store}=await fixture(t);await store.advance('SIM900','BR900',{requestId:'ONCE',expectedRevision:1,days:1});
  const prior=fingerprint(await store.read('SIM900','BR900'));
  await assert.rejects(store.advance('SIM900','BR900',{requestId:'ONCE',expectedRevision:1,days:2}),{code:'REQUEST_CONFLICT'});
  await assert.rejects(store.advance('SIM900','BR900',{requestId:'NEW',expectedRevision:1,days:1}),{code:'VERSION_CONFLICT'});
  assert.equal(fingerprint(await store.read('SIM900','BR900')),prior);
});
test('SIM-20: history preserved; from-checkpoint fork has new lineage, old facts immutable',async t=>{
  const {store}=await fixture(t);await store.advance('SIM900','BR900',{requestId:'RUN',expectedRevision:1,days:3});const original=await store.read('SIM900','BR900');
  const out=await store.fork('SIM900','BR900',{newBranch:'CHILD',checkpointId:'CP-2026-11-01',expectedRevision:original.revision});
  assert.equal(out.lineage.parentBranch,'BR900');assert.equal(out.lastSuccessfulDate,'2026-11-01');
  const replay=await store.advance('SIM900','CHILD',{requestId:'REPLAY',expectedRevision:out.revision,days:2});assert.equal(replay.view.current.businessHash,original.checkpoints.at(-1).snapshot.businessHash);
  const changed=copy(original.spec);changed.events.find(e=>e.id==='E01').data.cumulative=29;
  await assert.rejects(store.fork('SIM900','BR900',{newBranch:'ILLEGAL',checkpointId:'CP-2026-11-01',expectedRevision:original.revision,replacementSpec:changed}),{code:'HISTORY_CONFLICT'});
  assert.equal(fingerprint(await store.read('SIM900','BR900')),fingerprint(original));
});
test('SIM-01/18: exclusive writer and paused boundary, corrupt checkpoint fail closed',async t=>{
  const {store,root}=await fixture(t);await fs.mkdir(store.file('SIM900','BR900')+'.lock');
  await assert.rejects(store.advance('SIM900','BR900',{requestId:'LOCKED',expectedRevision:1,days:1}),{code:'BRANCH_BUSY'});
  await fs.rmdir(store.file('SIM900','BR900')+'.lock');await store.pause('SIM900','BR900');
  const paused=await store.advance('SIM900','BR900',{requestId:'PAUSED',expectedRevision:1,days:3});assert.equal(paused.operation.status,'PAUSED');assert.equal(paused.operation.completedDays,0);
  await store.resume('SIM900','BR900',paused.view.revision);const out=await store.advance('SIM900','BR900',{requestId:'CONTINUE',expectedRevision:paused.view.revision,days:1});assert.equal(out.operation.completedDays,1);
  const f=store.file('SIM900','BR900'),raw=JSON.parse(await fs.readFile(f,'utf8'));raw.document.state.lots[0].quantity=0;await fs.writeFile(f,JSON.stringify(raw));
  await assert.rejects(new SimulatorStore(root).read('SIM900','BR900'),{code:'CHECKPOINT_CORRUPT'});
});
