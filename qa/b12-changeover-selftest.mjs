import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkChangeovers} from '../src/lib/b12-changeover.mjs';
import {fixture, src} from './b12-changeover-fixtures.mjs';

const clone = x => JSON.parse(JSON.stringify(x));
function rejected(input, code, path) {
  const before = clone(input), result = checkChangeovers(input);
  assert.equal(result.domainValid, false); assert.equal(result.status, 'rejected');
  assert.deepEqual(result.acceptedOccupations, []);
  assert.ok(result.findings.some(f => f.code === code && (!path || f.path === path)), JSON.stringify(result.findings));
  assert.deepEqual(input, before); return result;
}
test('CORE-01 A→B: manual 30+10=40, 40+5=45; exact occupations and directed source', () => {
  const input = fixture(), before = clone(input), r = checkChangeovers(input);
  assert.equal(r.domainValid, true); assert.equal(r.overallSchedulable, null);
  assert.deepEqual(r.requiredOccupations.map(o => [o.phase, o.kind, o.resourceId, o.start, o.end, o.quantity]), [
    ['changeover', 'resource', 'M', 30, 40, 1], ['changeover', 'personnel', 'P', 30, 40, 1], ['validation', 'resource', 'M', 40, 45, 1],
  ]);
  assert.equal(r.inspections[0].readyAt, 45); assert.equal(r.inspections[0].policySource.id, 'A-B');
  assert.ok(r.notChecked.some(s => s.includes('quality approval')));
  assert.deepEqual(input, before); r.snapshot.config.policies[0].durationMinutes = 999;
  assert.deepEqual(input, before); // result cannot mutate source configuration
});
test('CORE-02 B→A uses 20+7, never reverse policy or source', () => {
  const f = fixture(); Object.assign(f.transitions[0], {from: 'B', to: 'A', successorStart: 57});
  const r = checkChangeovers(f); assert.equal(r.domainValid, true);
  assert.deepEqual([r.inspections[0].end, r.inspections[0].readyAt, r.inspections[0].policySource.id], [50, 57, 'B-A']);
});
test('CORE-03 explicit zero duration/personnel/wait differs from omitted fields', () => {
  const f = fixture(), p = f.config.policies[0];
  p.durationMinutes = 0; p.personnel = []; p.validation.waitMinutes = 0;
  f.transitions[0].successorStart = 30;
  const r = checkChangeovers(f); assert.equal(r.domainValid, true); assert.deepEqual(r.requiredOccupations, []);
  assert.equal(r.inspections[0].declaredNoChangeover, true); assert.equal(r.inspections[0].declaredNoPersonnel, true);
  assert.equal(r.inspections[0].declaredNoWait, true); assert.equal(r.inspections[0].policySource.version, 'mock-v1');
});
test('CORE-04 multiple independent transitions + auxiliary tool; no task/order/quantity loss', () => {
  const f = fixture(); f.config.policies[0].resources.push({id: 'TOOL', quantity: 1});
  f.transitions.push({...f.transitions[0], id: 'T2', fromTaskId: 'B2', toTaskId: 'A2', from: 'B', to: 'A', predecessorEnd: 45, start: 45, successorStart: 72});
  const protectedProduction = [{id: 'production-A', orderId: 'O1', quantity: 250, start: 0, end: 30, fixedDuration: 30}, {id: 'production-B', orderId: 'O2', quantity: 250, start: 45, end: 75, fixedDuration: 30}];
  f.productionContext = clone(protectedProduction);
  const r = checkChangeovers(f); assert.equal(r.domainValid, true);
  assert.deepEqual(f.productionContext, protectedProduction); assert.deepEqual(r.snapshot.productionContext, protectedProduction);
  assert.equal(r.requiredOccupations.length, 7); assert.ok(r.requiredOccupations.every(o => !('productionQuantity' in o)));
  assert.deepEqual(r.inspections.map(x => x.transitionId), ['T1', 'T2']);
  assert.equal(protectedProduction.reduce((n, p) => n + p.quantity, 0), 500);
  assert.deepEqual(protectedProduction.map(p => p.end - p.start), [30, 30]);
});

const negatives = [
  ['NEG-01 prohibited directed pair', f => {f.config.policies[0].prohibited = true;}, 'PROHIBITED'],
  ['NEG-02 exact policy missing', f => {f.config.policies.shift();}, 'MISSING_POLICY'],
  ['NEG-03 duplicate direction even if identical', f => {f.config.policies.push({...f.config.policies[0], id: 'duplicate'});}, 'DUPLICATE_DIRECTION'],
  ['NEG-04 unknown applicable resource', f => {f.config.policies[0].resourceIds = ['UNKNOWN'];}, 'UNKNOWN_RESOURCE'],
  ['NEG-05 unknown cleaning resource', f => {f.config.policies[0].resources[0].id = 'UNKNOWN';}, 'UNKNOWN_RESOURCE'],
  ['NEG-06 unknown personnel', f => {f.config.policies[0].personnel[0].id = 'UNKNOWN';}, 'UNKNOWN_PERSONNEL'],
  ['NEG-07 unknown skill', f => {f.config.policies[0].personnel[0].skill = 'unknown';}, 'SKILL'],
  ['NEG-08 missing duration', f => {delete f.config.policies[0].durationMinutes;}, 'DURATION'],
  ['NEG-09 negative duration', f => {f.config.policies[0].durationMinutes = -1;}, 'DURATION'],
  ['NEG-10 fractional duration', f => {f.config.policies[0].durationMinutes = 0.5;}, 'DURATION'],
  ['NEG-11 missing explicit personnel choice', f => {delete f.config.policies[0].personnel;}, 'DEMANDS'],
  ['NEG-12 missing wait distinct from zero', f => {delete f.config.policies[0].validation.waitMinutes;}, 'WAIT'],
  ['NEG-13 absent prohibition is not allow', f => {delete f.config.policies[0].prohibited;}, 'PROHIBITION'],
  ['NEG-14 cannot assume working-minute clock', f => {f.config.policies[0].validation.clock = 'working-minutes';}, 'WAIT_CLOCK'],
  ['NEG-15 missing policy source', f => {delete f.config.policies[0].source.version;}, 'SOURCE'],
  ['NEG-16 duplicate edge atomic', f => {f.transitions.push({...f.transitions[0], id: 'T2'});}, 'DUPLICATE_TRANSITION'],
  ['NEG-17 predecessor overlap', f => {f.transitions[0].predecessorEnd = 31;}, 'PRECEDENCE'],
  ['NEG-18 validation one minute early', f => {f.transitions[0].successorStart = 44;}, 'VALIDATION_WAIT'],
  ['NEG-19 horizon one minute short', f => {f.horizon.end = 44;}, 'HORIZON'],
  ['NEG-20 fragmented calendar cannot be summed', f => {f.config.resources[0].windows = [{start: 0, end: 35}, {start: 36, end: 200}];}, 'CALENDAR'],
  ['NEG-21 adjacent shifts cannot be silently bridged', f => {f.config.resources[0].windows = [{start: 0, end: 35}, {start: 35, end: 200}];}, 'CALENDAR'],
  ['NEG-22 exception intersects cleaning', f => {f.config.resources[0].unavailable = [{start: 39, end: 40}];}, 'CALENDAR'],
  ['NEG-23 complete validation occupancy calendar', f => {f.config.resources[0].windows = [{start: 0, end: 44}];}, 'CALENDAR'],
  ['NEG-24 personnel window incomplete', f => {f.config.personnel[0].windows = [{start: 0, end: 39}];}, 'CALENDAR'],
  ['NEG-25 unsafe endpoint sum', f => {f.config.policies[0].durationMinutes = Number.MAX_SAFE_INTEGER;}, 'TIME_OVERFLOW'],
  ['NEG-26 numeric strings are not explicit integers', f => {f.config.policies[0].durationMinutes = '10';}, 'DURATION'],
  ['NEG-27 duplicate registry', f => {f.config.resources.push(clone(f.config.resources[0]));}, 'REGISTRY_ID'],
  ['NEG-28 coupled pool cannot claim independent capacity', f => {f.config.personnel[0].capacityScope = 'shared';}, 'CAPACITY_SCOPE'],
  ['NEG-29 missing occupied quantity', f => {f.existingOccupations = [{id: 'O', kind: 'resource', resourceId: 'M', start: 0, end: 1, source: src()}];}, 'QUANTITY'],
  ['NEG-30 unknown existing occupation resource', f => {f.existingOccupations = [{id: 'O', kind: 'resource', resourceId: 'X', quantity: 1, start: 0, end: 1, source: src()}];}, 'OCCUPATION_REFERENCE'],
  ['NEG-31 missing validation hold choice', f => {delete f.config.policies[0].validation.resources;}, 'DEMANDS'],
  ['NEG-32 invalid skills object returns gap instead of throwing', f => {f.config.personnel[0].skills = {};}, 'SKILLS'],
  ['NEG-33 empty transitions is not a pass', f => {f.transitions = [];}, 'NO_TRANSITIONS'],
  ['NEG-34 duplicate demand cannot double count silently', f => {f.config.policies[0].personnel.push(clone(f.config.policies[0].personnel[0]));}, 'DUPLICATE_DEMAND'],
  ['NEG-35 unknown transition resource', f => {f.transitions[0].resourceId = 'X';}, 'UNKNOWN_RESOURCE'],
  ['NEG-36 reverse missing does not reuse A→B', f => {f.config.policies.pop(); Object.assign(f.transitions[0], {from: 'B', to: 'A'});}, 'MISSING_POLICY'],
];
for (const [name, edit, code] of negatives) test(name, () => {const f = fixture(); edit(f); rejected(f, code);});
test('BOUND-01 endpoint adjacency/exact wait/horizon is allowed', () => {
  const f = fixture(); f.horizon.end = 45;
  f.existingOccupations = [
    {id: 'before', kind: 'resource', resourceId: 'M', quantity: 1, start: 0, end: 30, source: src()},
    {id: 'after', kind: 'resource', resourceId: 'M', quantity: 1, start: 45, end: 50, source: src()},
  ];
  assert.equal(checkChangeovers(f).domainValid, true);
});
test('BOUND-02 complete cleaning + validation window can end at calendar boundary', () => {
  const f = fixture(); f.config.resources[0].windows = [{start: 30, end: 45}];
  f.config.resources[0].unavailable = [{start: 45, end: 46}];
  assert.equal(checkChangeovers(f).domainValid, true);
});
test('BOUND-03 resource conflict during validation, no accepted partial transition', () => {
  const f = fixture(); f.existingOccupations.push({id: 'busy', kind: 'resource', resourceId: 'M', start: 44, end: 45, quantity: 1, source: src('busy-source')});
  const r = rejected(f, 'CAPACITY_OVERLAP'); const overlap = r.findings.find(x => x.code === 'CAPACITY_OVERLAP');
  assert.deepEqual([overlap.start, overlap.end, overlap.demand, overlap.capacity], [44, 45, '2', 1]);
  assert.ok(overlap.active.some(o => o.policySource?.id === 'A-B'));
  assert.ok(overlap.active.some(o => o.source?.id === 'busy-source'));
});
test('BOUND-04 exact personnel capacity passes; one more head rejects', () => {
  const f = fixture(); f.existingOccupations.push({id: 'busy', kind: 'personnel', resourceId: 'P', start: 30, end: 40, quantity: 1, source: src()});
  assert.equal(checkChangeovers(f).domainValid, true);
  f.existingOccupations[0].quantity = 2; rejected(f, 'CAPACITY_OVERLAP');
});
test('BOUND-05 two new transitions compete even without existing occupations', () => {
  const f = fixture(); f.transitions.push({...f.transitions[0], id: 'T2', fromTaskId: 'X', toTaskId: 'Y'});
  rejected(f, 'CAPACITY_OVERLAP');
});
test('BOUND-06 explicit validation people and tool occupy the wait interval', () => {
  const f = fixture(); f.config.policies[0].validation.personnel = [{id: 'P', quantity: 2, skill: 'clean'}];
  f.config.policies[0].validation.resources.push({id: 'TOOL', quantity: 1});
  const r = checkChangeovers(f); assert.equal(r.domainValid, true);
  assert.deepEqual(r.requiredOccupations.filter(o => o.phase === 'validation').map(o => [o.resourceId, o.start, o.end, o.quantity]), [['M', 40, 45, 1], ['TOOL', 40, 45, 1], ['P', 40, 45, 2]]);
});
test('BOUND-07 explicit no hold means elapsed wait may cross offshift; occupied wait cannot', () => {
  const f = fixture(); f.config.resources[0].windows = [{start: 30, end: 40}];
  f.config.policies[0].validation.resources = [];
  assert.equal(checkChangeovers(f).domainValid, true);
  f.config.policies[0].validation.resources = [{id: 'M', quantity: 1}]; rejected(f, 'CALENDAR');
});
test('BOUND-08 capacity sums stay exact beyond Number safe total', () => {
  const f = fixture(); f.config.resources[0].capacity = Number.MAX_SAFE_INTEGER;
  f.config.policies[0].resources[0].quantity = Number.MAX_SAFE_INTEGER;
  f.existingOccupations = [{id: 'one', kind: 'resource', resourceId: 'M', start: 30, end: 40, quantity: 1, source: src()}];
  const r = rejected(f, 'CAPACITY_OVERLAP'); assert.ok(r.findings.some(x => x.demand === '9007199254740992'));
});
test('NEG-37 invalid JSON values reject without state effects', () => {
  for (const bad of [null, [], NaN, undefined, 1n, new Date(), {x: Infinity}, {x: undefined}]) {
    const r = checkChangeovers(bad); assert.equal(r.domainValid, false); assert.equal(r.snapshot, null);
  }
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(checkChangeovers(cyclic).findings[0].code, 'INPUT_JSON');
});
test('NEG-38 valid transition plus missing policy rejects atomically and retains both input identities', () => {
  const f = fixture(); f.config.policies.pop();
  f.transitions.push({...f.transitions[0], id: 'T2', fromTaskId: 'X', toTaskId: 'Y', from: 'B', to: 'A'});
  const r = rejected(f, 'MISSING_POLICY');
  assert.equal(r.requiredOccupations.length, 3); assert.equal(r.snapshot.transitions.length, 2);
  assert.equal(r.findings[0].path, 'transitions[1]');
});
test('NEG-39 malformed registries/policies/ledgers/calendars reject with precise gaps', () => {
  for (const edit of [
    f => {f.config.resources[0] = null;}, f => {f.config.policies[0] = null;},
    f => {f.config.policies[0].validation = false;}, f => {f.existingOccupations = [null];},
    f => {f.config.resources[0].windows = [{start: 10, end: 5}];}, f => {f.horizon = null;},
    f => {delete f.source.version;}, f => {delete f.config.timebase;},
  ]) {
    const f = fixture(); edit(f); const r = checkChangeovers(f);
    assert.equal(r.domainValid, false); assert.equal(r.acceptedOccupations.length, 0);
    assert.ok(r.findings.every(x => typeof x.path === 'string' && typeof x.code === 'string'));
  }
});
test('SAVE-01 JSON disk save/reopen freezes policy; new version changes only new evaluation', async () => {
  const f = fixture(), r = checkChangeovers(f), dir = await mkdtemp(join(tmpdir(), 'br13-domain-'));
  try {
    const file = join(dir, 'frozen.json'); await writeFile(file, JSON.stringify(r));
    f.config.policies[0].durationMinutes = 11; f.config.policies[0].source.version = 'mock-v2';
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(checkChangeovers(saved.snapshot), r);
    assert.equal(saved.inspections[0].policySource.version, 'mock-v1');
    rejected(f, 'VALIDATION_WAIT');
  } finally {await rm(dir, {recursive: true, force: true});}
});
test('WORKER-01 standalone Node domain worker equals direct JSON result; not app Worker', async () => {
  const f = fixture(), url = new URL('./b12-changeover-worker.mjs', import.meta.url);
  const r = await new Promise((resolve, reject) => {
    const w = new Worker(url, {workerData: f}); w.once('message', resolve); w.once('error', reject);
    w.once('exit', code => {if (code) reject(new Error('worker exit ' + code));});
  });
  assert.deepEqual(r, checkChangeovers(f));
});
