import {CHANGEOVER_CONTRACT} from '../src/lib/b12-changeover.mjs';
// REPLACEABLE TEST MOCK ONLY. No number or empty list is a business default.
export const src = (id = 'mock-config', version = 'mock-v1') => ({id, version, purpose: 'selftest-only'});
export function fixture() {
  const registry = id => ({id, capacity: 1, capacityScope: 'independent', windows: [{start: 0, end: 200}], unavailable: [], source: src(id + '-calendar')});
  const policy = (id, from, to, durationMinutes, waitMinutes) => ({
    id, from, to, resourceIds: ['M'], prohibited: false, durationMinutes,
    resources: [{id: 'M', quantity: 1}], personnel: [{id: 'P', quantity: 1, skill: 'clean'}],
    validation: {clock: 'elapsed-minutes', waitMinutes, resources: [{id: 'M', quantity: 1}], personnel: []},
    source: src(id),
  });
  return {
    config: {contract: CHANGEOVER_CONTRACT, source: src(), timebase: {unit: 'minute', origin: 'mock-epoch-not-site-time'}, products: ['A', 'B'],
      resources: [registry('M'), registry('TOOL')], personnel: [{...registry('P'), capacity: 2, skills: ['clean']}],
      policies: [policy('A-B', 'A', 'B', 10, 5), policy('B-A', 'B', 'A', 20, 7)]},
    transitions: [{id: 'T1', from: 'A', to: 'B', resourceId: 'M', fromTaskId: 'production-A', toTaskId: 'production-B', predecessorEnd: 30, start: 30, successorStart: 45, source: src('explicit-mock-sequence')}],
    existingOccupations: [], horizon: {start: 0, end: 200}, source: src('frozen-mock-candidate'),
  };
}
