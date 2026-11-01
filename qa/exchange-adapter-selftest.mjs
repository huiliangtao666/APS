import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture,importEnvelope,csvFile,usage} from './exchange-adapter-fixture.mjs';
import {createExchangeAdapter,makeEnvelope,contentHash,realConnection} from '../server/exchange-adapters/index.mjs';
import {createMockTransport} from '../server/exchange-adapters/mock-transport.mjs';
function setup(t,options={}) {
  const f=fixture();t.after(f.close);
  const transport=createMockTransport({dispatch:f.dispatch,retry:{maxReadAttempts:1,source:'qa/exchange-adapter-selftest.mjs explicit mock policy'},...options});
  return {...f,transport,adapter:createExchangeAdapter({transport,scope:'synthetic:mock#planner'})};
}
const writes=f=>f.transport.calls.filter(c=>c.path==='/imports/commit');
test('real CSV preview/commit; repeat/concurrent repeat makes one atomic import, versions and audit',async t=>{
  const f=setup(t),e=await importEnvelope(f);
  const [a,b]=await Promise.all([f.adapter.execute(e),f.adapter.execute({...e,correlationId:'repeat'})]);
  assert.equal(a.status,'COMMITTED');assert.equal(b.duplicate,true);assert.equal(writes(f).length,1);
  const persisted=JSON.parse(f.bytes());assert.equal(persisted.revision,1);assert.equal(persisted.data.orders[0]['合格需求'],'241');
  assert.equal(persisted.records.length,1);assert.equal(persisted.records[0].action,'import');assert.equal(persisted.records[0].actor,'mock#planner');
  assert.equal(Object.keys(persisted.inputVersions).length,2);assert.equal(persisted.records[0].toVersion,a.inputVersionId);
  const before=f.bytes();assert.equal((await f.adapter.execute(e)).duplicate,true);assert.equal(f.bytes(),before);
});
test('same key different content/sourceVersion conflicts, bad hash or identity injection rejects with zero side effects',async t=>{
  const f=setup(t),e=await importEnvelope(f);await f.adapter.execute(e);const before=f.bytes();
  const conflict=makeEnvelope({...e,payload:{...e.payload,reason:'different approved request'}});
  assert.equal((await f.adapter.execute(conflict)).status,'CONFLICT');
  assert.equal((await f.adapter.execute(makeEnvelope({...e,sourceVersion:'mock-v2'}))).status,'CONFLICT');
  assert.equal((await f.adapter.execute({...e,contentHash:'0'.repeat(64)})).code,'content_hash_mismatch');
  assert.throws(()=>makeEnvelope({...e,payload:{...e.payload,actor:'admin'}}),/invalid_import_payload/);
  assert.equal(f.bytes(),before);assert.equal(writes(f).length,1);
});
test('CSV syntax and unknown field reject entire multi-file batch; no partial writes',async t=>{
  const f=setup(t),base=await importEnvelope(f),state=(await f.dispatch('GET','/state')).body;
  for(const text of ['"unclosed','未知字段\r\nx']) {
    const bad=csvFile('calendars',state.data.calendars);bad.text=text;
    const e=makeEnvelope({...base,idempotencyKey:text,payload:{files:[base.payload.files[0],bad],revision:0,reason:'explicit bad batch'}});
    const r=await f.adapter.execute(e);assert.equal(r.status,'REJECTED');assert.ok(r.issues.length);assert.equal(f.bytes(),null);
  }
  assert.equal(writes(f).length,0);
});
test('existing row/reference validation and stale revision reject; existing API rechecks preview on concurrent edit',async t=>{
  const f=setup(t),e=await importEnvelope(f),state=(await f.dispatch('GET','/state')).body;
  const rows=structuredClone(state.data.orders);rows[0]['产品编号']='NONEXISTENT';
  const bad=makeEnvelope({...e,payload:{...e.payload,files:[csvFile('orders',rows)]}});
  const r=await f.adapter.execute(bad);assert.equal(r.status,'REJECTED');assert.equal(f.bytes(),null);
  const stale=makeEnvelope({...e,idempotencyKey:'stale',payload:{...e.payload,revision:99}});
  assert.equal((await f.adapter.execute(stale)).httpStatus,409);assert.equal(f.bytes(),null);
  const transport=createMockTransport({retry:{maxReadAttempts:1,source:'explicit concurrent mock edit'},dispatch:async(m,p,b)=>{
    const result=await f.dispatch(m,p,b);
    if(p==='/imports/preview'&&result.body.valid) {
      const other=structuredClone(state.data.orders);other[0]['合格需求']='242';
      assert.equal((await f.dispatch('POST','/tables/orders',{revision:0,rows:other,reason:'intervening fixture edit'})).status,200);
    }
    return result;
  }});
  const adapter=createExchangeAdapter({transport,scope:'synthetic:mock#planner'});
  const changed=await adapter.execute({...e,idempotencyKey:'concurrent'});assert.equal(changed.httpStatus,409);
  const s=JSON.parse(f.bytes());assert.equal(s.revision,1);assert.equal(s.data.orders[0]['合格需求'],'242');assert.equal(s.records.length,1);
});
test('current permissions rechecked for repeat; query export grant, member removal and CSRF remain enforced',async t=>{
  const f=setup(t),e=await importEnvelope(f);await f.adapter.execute(e);const before=f.bytes();
  f.store.setRole('mock#planner','query','mock#admin');
  assert.equal((await f.adapter.execute(e)).httpStatus,403);assert.equal(f.bytes(),before);
  const out=makeEnvelope({source:'mock',sourceVersion:'1',idempotencyKey:'out',correlationId:'out',direction:'export',payload:{table:'orders',reason:'mock export'}});
  assert.equal((await f.adapter.execute(out)).httpStatus,403);
  f.store.setRole('mock#planner','planner','mock#admin');f.setCrossSite(true);
  assert.equal((await f.adapter.execute({...e,idempotencyKey:'csrf'})).httpStatus,403);assert.equal(f.bytes(),before);
  f.setCrossSite(false);f.store.remove('mock#planner');assert.equal((await f.adapter.execute(e)).httpStatus,403);
});
for(const code of ['disconnect','timeout']) {
  test(`mock ${code} before preview: no write, correlated rejection and no write retry`,async t=>{
    const f=setup(t,{faults:[{step:'/imports/preview',phase:'before',code}]}),e=await importEnvelope(f);
    const r=await f.adapter.execute(e);assert.equal(r.status,'REJECTED');assert.equal(r.code,'mock_'+code);assert.equal(r.correlationId,e.correlationId);
    assert.equal(f.bytes(),null);assert.equal(writes(f).length,0);assert.equal((await f.adapter.execute(e)).duplicate,true);
  });
  test(`mock ${code} after commit: UNKNOWN, traceable and explicit repeat cannot replay`,async t=>{
    const f=setup(t,{faults:[{step:'/imports/commit',phase:'after',code}]}),e=await importEnvelope(f);
    const r=await f.adapter.execute(e);assert.equal(r.status,'UNKNOWN');assert.equal(r.requiresReconciliation,true);assert.equal(r.code,'mock_'+code);
    assert.deepEqual(r.transportFailure,{step:'/imports/commit',phase:'after',source:f.transport.retry.source});
    assert.equal(r.automaticWriteRetries,0);const before=f.bytes();assert.equal(JSON.parse(before).revision,1);
    assert.equal((await f.adapter.execute(e)).duplicate,true);assert.equal(f.bytes(),before);assert.equal(writes(f).length,1);
  });
}
test('explicit mock retry applies only to read, requires provenance; no endpoint or real transport enabled',async t=>{
  const f=setup(t,{retry:{maxReadAttempts:2,source:'selftest-only explicit max2 read attempts'},faults:[{step:'/session',phase:'before',code:'timeout'}]}),e=await importEnvelope(f);
  assert.equal((await f.adapter.execute(e)).status,'COMMITTED');assert.equal(f.transport.calls.filter(c=>c.path==='/session').length,2);assert.equal(writes(f).length,1);
  assert.throws(()=>createMockTransport({dispatch:f.dispatch}),/explicit_mock_retry_source_required/);
  assert.throws(()=>createExchangeAdapter({transport:{kind:'real'},scope:'x'}),/explicit_mock/);
  assert.deepEqual(realConnection,{status:'NOT_CONFIGURED',enabled:false,productionWrites:false});
  await assert.rejects(f.transport.request('POST','https://example.invalid',{}),/unsupported_mock_operation/);
});
test('existing CSV export to mock target gives hash receipt, dedupes export audit, preserves import data and versions',async t=>{
  const f=setup(t);await f.adapter.execute(await importEnvelope(f));const before=JSON.parse(f.bytes());
  const e=makeEnvelope({source:'mock',sourceVersion:'1',idempotencyKey:'export',correlationId:'export',direction:'export',payload:{table:'orders',reason:'explicit mock export'}});
  const a=await f.adapter.execute(e);assert.equal(a.status,'ACKNOWLEDGED');assert.equal(a.target.target,'explicit-local-mock');assert.match(a.target.contentHash,/^[a-f0-9]{64}$/);
  assert.ok(a.target.bytes>0);const once=f.bytes();assert.equal((await f.adapter.execute(e)).duplicate,true);assert.equal(f.bytes(),once);
  const after=JSON.parse(once);assert.deepEqual(after.data,before.data);assert.deepEqual(after.inputVersions,before.inputVersions);assert.equal(after.records.length,before.records.length+1);
  assert.equal(f.transport.destination.size,1);assert.equal(f.transport.calls.filter(c=>c.path==='/export').length,1);
  const artifact=[...f.transport.destination.values()][0];assert.ok(artifact.csv.includes('"241"'));assert.equal(contentHash(artifact.csv),a.target.contentHash);
  assert.throws(()=>makeEnvelope({...e,payload:{confirmationId:'json-is-not-csv',reason:'mock'}}),/invalid_export_payload/);
  assert.equal(makeEnvelope({...e,payload:{planId:'existing-plan-id',ruleSettings:true,reason:'mock'}}).payload.ruleSettings,true);
});
test('ambiguous 5xx after real commit is UNKNOWN, never automatically or explicitly replayed',async t=>{
  const f=setup(t),e=await importEnvelope(f);
  const transport=createMockTransport({retry:{maxReadAttempts:1,source:'explicit mock 503 after atomic commit'},dispatch:async(m,p,b)=>{
    const r=await f.dispatch(m,p,b);return p==='/imports/commit'?{status:503,body:{error:'mock_response_unavailable'}}:r;
  }});
  const adapter=createExchangeAdapter({transport,scope:'synthetic:mock#planner'}),r=await adapter.execute(e);
  assert.equal(r.status,'UNKNOWN');assert.equal(r.requiresReconciliation,true);assert.equal(r.httpStatus,503);
  const before=f.bytes();assert.equal(JSON.parse(before).revision,1);assert.equal((await adapter.execute(e)).duplicate,true);
  assert.equal(f.bytes(),before);assert.equal(transport.calls.filter(c=>c.path==='/imports/commit').length,1);
});
test('lost mock target ACK and lost export response remain UNKNOWN without second export or delivery',async t=>{
  for(const step of ['mock-target','/export']) {
    const f=setup(t,{faults:[{step,phase:'after',code:'timeout'}]});
    const e=makeEnvelope({source:'mock',sourceVersion:'1',idempotencyKey:'export',correlationId:'lost-ack',direction:'export',payload:{table:'orders',reason:'explicit lost ack'}});
    const a=await f.adapter.execute(e);assert.equal(a.status,'UNKNOWN');const before=f.bytes();
    assert.equal((await f.adapter.execute(e)).duplicate,true);assert.equal(f.bytes(),before);
    assert.equal(f.transport.calls.filter(c=>c.path==='/export').length,1);assert.equal(f.transport.destination.size,step==='mock-target'?1:0);
  }
});
test('existing protected-history rejection preserves business bytes; adapter recreation shares only explicit session receipt Map',async t=>{
  const f=setup(t),e=await importEnvelope(f),state=(await f.dispatch('GET','/state')).body;
  fs.writeFileSync(f.dir+'/business.json',JSON.stringify({data:state.data,revision:0,plans:[{id:'protected',status:'confirmed',inputVersionId:'missing'}],records:[]}));
  const before=f.bytes(),r=await f.adapter.execute(e);assert.equal(r.code,'protected_history_unavailable');assert.equal(f.bytes(),before);assert.equal(writes(f).length,0);
  fs.unlinkSync(f.dir+'/business.json');const journal=new Map();
  const first=createExchangeAdapter({transport:f.transport,scope:'synthetic:mock#planner',journal});
  const fresh={...e,idempotencyKey:'shared-session'};assert.equal((await first.execute(fresh)).status,'COMMITTED');
  const again=createExchangeAdapter({transport:f.transport,scope:'synthetic:mock#planner',journal});
  const once=f.bytes();assert.equal((await again.execute(fresh)).duplicate,true);assert.equal(f.bytes(),once);
  assert.equal(contentHash({b:2,a:1}),contentHash({a:1,b:2}));
});
test('offline activity guard and finite memory budget',()=>{
  const observed=usage();assert.equal(observed.networkAttempts,0);assert.equal(observed.listeners,0);assert.equal(observed.Workers,0);
  console.log(JSON.stringify({exchangeMockUsage:observed}));
});
