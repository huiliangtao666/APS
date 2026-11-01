import {windowFit} from './working-windows.mjs';

export const CHANGEOVER_CONTRACT = 'BR13-directed-occupations-v1';
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim() === x && x.length > 0;
const minute = x => Number.isSafeInteger(x) && x >= 0;
const positive = x => Number.isSafeInteger(x) && x > 0;
const source = x => object(x) && text(x.id) && text(x.version);
const copy = x => JSON.parse(JSON.stringify(x));
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const key = (kind, id) => JSON.stringify([kind, id]);
const unchecked = [
  'Actual production sequence and authoritative task/product/resource linkage',
  'Completeness/authority of caller-supplied ledgers, calendars, sources and business configuration',
  'Production duration, material/BOM, quantities, delivery and whole-route feasibility',
  'Shared pools, skill substitution and capacity coupling across distinct registry IDs',
  'Physical cleaning completion, quality approval and actual validation/release facts',
  'Application planner, independent saved-plan verifier, UI/API/Worker/persistence/export integration',
];

// Check an explicit candidate, never select a production sequence or move tasks.
// Every input is a JSON value; every successful occupation is still only a proposal.
export function checkChangeovers(input) {
  const findings = [], inspections = [], requiredOccupations = [];
  const add = (code, path, message, evidence = {}) => findings.push({code, path, message, ...evidence});
  const finish = snapshot => ({
    contract: CHANGEOVER_CONTRACT, domainValid: findings.length === 0,
    status: findings.length ? 'rejected' : 'checked', overallSchedulable: null,
    requiredOccupations, acceptedOccupations: findings.length ? [] : copy(requiredOccupations),
    findings, inspections, notChecked: [...unchecked], snapshot,
  });
  // Reject non-JSON values rather than lose undefined, NaN, BigInt or cycles on save.
  function jsonValue(x, seen = new Set()) {
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return true;
    if (typeof x === 'number') return Number.isFinite(x);
    if (typeof x !== 'object' || seen.has(x)) return false;
    if (!Array.isArray(x) && Object.getPrototypeOf(x) !== Object.prototype) return false;
    seen.add(x);
    const ok = Object.values(x).every(v => jsonValue(v, seen));
    seen.delete(x); return ok;
  }
  if (!jsonValue(input) || !object(input)) {
    add('INPUT_JSON', '$', 'Input must be a finite, acyclic plain JSON object.');
    return finish(null);
  }
  const snapshot = copy(input), {config, transitions, existingOccupations, horizon} = snapshot;
  if (!object(config)) {add('CONFIG', 'config', 'Explicit configuration required.'); return finish(snapshot);}
  if (config.contract !== CHANGEOVER_CONTRACT) add('CONTRACT', 'config.contract', 'Unknown or missing contract.');
  if (!source(config.source)) add('SOURCE', 'config.source', 'Configuration source id/version required.');
  if (!object(config.timebase) || config.timebase.unit !== 'minute' || !text(config.timebase.origin))
    add('TIMEBASE', 'config.timebase', 'Explicit common minute origin required.');
  if (!source(snapshot.source)) add('SOURCE', 'source', 'Candidate/ledger snapshot source id/version required.');
  const interval = (x, path) => {
    if (!object(x) || !minute(x.start) || !minute(x.end) || x.end <= x.start) {
      add('INTERVAL', path, 'Require integer half-open [start,end), end > start.'); return false;
    }
    return true;
  };
  interval(horizon, 'horizon');
  for (const name of ['products', 'resources', 'personnel', 'policies'])
    if (!Array.isArray(config[name])) add('CONFIG_ARRAY', `config.${name}`, 'Explicit array required, including explicit empty arrays.');
  for (const name of ['transitions', 'existingOccupations'])
    if (!Array.isArray(snapshot[name])) add('INPUT_ARRAY', name, 'Explicit array required.');
  if (findings.length) return finish(snapshot);
  if (!transitions.length) add('NO_TRANSITIONS', 'transitions', 'No transition supplied; no directional policy was checked.');
  const products = new Set();
  config.products.forEach((id, i) => {
    if (!text(id) || products.has(id)) add('PRODUCT', `config.products[${i}]`, 'Product id must be nonempty and unique.');
    products.add(id);
  });
  const registry = new Map();
  for (const [name, kind] of [['resources', 'resource'], ['personnel', 'personnel']]) {
    config[name].forEach((r, i) => {
      const path = `config.${name}[${i}]`;
      if (!object(r)) {add('REGISTRY', path, 'Registry object required.'); return;}
      if (!text(r.id) || registry.has(key(kind, r.id))) add('REGISTRY_ID', path + '.id', 'Unique id required within kind.');
      if (!positive(r.capacity)) add('CAPACITY', path + '.capacity', 'Positive integer capacity required.');
      if (r.capacityScope !== 'independent') add('CAPACITY_SCOPE', path + '.capacityScope', 'Independent capacity must be explicit; coupled pools need application adapter.');
      if (!source(r.source)) add('SOURCE', path + '.source', 'Frozen registry/calendar source id/version required.');
      for (const field of ['windows', 'unavailable']) {
        if (!Array.isArray(r[field])) add('CALENDAR', path + '.' + field, 'Explicit windows/exceptions required; [] means none.');
        else r[field].forEach((w, j) => interval(w, `${path}.${field}[${j}]`));
      }
      if (kind === 'personnel' && (!Array.isArray(r.skills) || r.skills.some(s => !text(s)) || new Set(r.skills).size !== r.skills.length))
        add('SKILLS', path + '.skills', 'Explicit unique skill ids required.');
      registry.set(key(kind, r.id), r);
    });
  }
  function demands(rows, kind, path) {
    if (!Array.isArray(rows)) {add('DEMANDS', path, 'Explicit demand array required; [] explicitly means none.'); return;}
    const ids = new Set();
    rows.forEach((r, i) => {
      const p = `${path}[${i}]`;
      if (!object(r)) {add('DEMAND', p, 'Demand object required.'); return;}
      if (!text(r.id) || !registry.has(key(kind, r.id))) add('UNKNOWN_' + kind.toUpperCase(), p + '.id', 'Unknown or missing registry id.');
      if (ids.has(r.id)) add('DUPLICATE_DEMAND', p, 'Combine one registry demand explicitly; duplicates are ambiguous.');
      ids.add(r.id);
      if (!positive(r.quantity)) add('QUANTITY', p + '.quantity', 'Positive integer units/headcount required.');
      const skills = registry.get(key(kind, r.id))?.skills;
      if (kind === 'personnel' && (!text(r.skill) || !Array.isArray(skills) || !skills.includes(r.skill)))
        add('SKILL', p + '.skill', 'Known required skill on explicit group required; no substitution inferred.');
    });
  }
  const policyKeys = new Set(), policyIds = new Set();
  config.policies.forEach((p, i) => {
    const path = `config.policies[${i}]`;
    if (!object(p)) {add('POLICY', path, 'Policy object required.'); return;}
    if (!text(p.id) || policyIds.has(p.id)) add('POLICY_ID', path + '.id', 'Unique policy id required.');
    policyIds.add(p.id);
    for (const f of ['from', 'to']) if (!products.has(p[f])) add('DIRECTION', path + '.' + f, 'Explicit known product required.');
    if (!Array.isArray(p.resourceIds) || !p.resourceIds.length) add('APPLICABILITY', path + '.resourceIds', 'Explicit nonempty applicable resource ids required.');
    else for (const id of p.resourceIds) {
      if (!registry.has(key('resource', id))) add('UNKNOWN_RESOURCE', path + '.resourceIds', 'Unknown applicable resource.', {resourceId: id});
      const k = JSON.stringify([p.from, p.to, id]);
      if (policyKeys.has(k)) add('DUPLICATE_DIRECTION', path, 'Direction/resource has more than one policy; no priority inferred.', {direction: [p.from, p.to], resourceId: id});
      policyKeys.add(k);
    }
    if (typeof p.prohibited !== 'boolean') add('PROHIBITION', path + '.prohibited', 'Explicit true/false required.');
    if (!minute(p.durationMinutes)) add('DURATION', path + '.durationMinutes', 'Explicit nonnegative integer duration required; 0 is distinct from missing.');
    if (!source(p.source)) add('SOURCE', path + '.source', 'Directional policy source id/version required.');
    demands(p.resources, 'resource', path + '.resources');
    demands(p.personnel, 'personnel', path + '.personnel');
    if (!object(p.validation)) add('VALIDATION', path + '.validation', 'Explicit validation wait/clock/occupations required.');
    else {
      if (!minute(p.validation.waitMinutes)) add('WAIT', path + '.validation.waitMinutes', 'Explicit nonnegative integer wait required.');
      if (p.validation.clock !== 'elapsed-minutes') add('WAIT_CLOCK', path + '.validation.clock', 'Explicit elapsed-minutes required; working-minute accumulation is not inferred.');
      demands(p.validation.resources, 'resource', path + '.validation.resources');
      demands(p.validation.personnel, 'personnel', path + '.validation.personnel');
    }
  });
  const ledgerIds = new Set();
  existingOccupations.forEach((r, i) => {
    const path = `existingOccupations[${i}]`;
    if (!object(r)) {add('OCCUPATION', path, 'Occupation object required.'); return;}
    interval(r, path);
    if (!text(r.id) || ledgerIds.has(r.id)) add('OCCUPATION_ID', path + '.id', 'Unique ledger id required.');
    ledgerIds.add(r.id);
    if (!['resource', 'personnel'].includes(r.kind) || !registry.has(key(r.kind, r.resourceId))) add('OCCUPATION_REFERENCE', path, 'Unknown occupied registry id/kind.');
    if (!positive(r.quantity)) add('QUANTITY', path + '.quantity', 'Positive integer occupied quantity required.');
    if (!source(r.source)) add('SOURCE', path + '.source', 'Existing occupation source id/version required.');
  });
  // Invalid configuration/ledger is an atomic rejection, even for an unrelated direction.
  if (findings.length) return finish(snapshot);
  const transitionIds = new Set(), edges = new Set();
  transitions.forEach((t, i) => {
    const path = `transitions[${i}]`, before = findings.length;
    if (!object(t)) {add('TRANSITION', path, 'Explicit transition object required.'); return;}
    if (!text(t.id) || transitionIds.has(t.id)) add('TRANSITION_ID', path + '.id', 'Unique transition id required.');
    transitionIds.add(t.id);
    if (!source(t.source)) add('SOURCE', path + '.source', 'Frozen explicit sequence source id/version required.');
    if (!text(t.fromTaskId) || !text(t.toTaskId) || t.fromTaskId === t.toTaskId) add('TASK_LINK', path, 'Distinct predecessor/successor task ids required.');
    const edge = JSON.stringify([t.fromTaskId, t.toTaskId, t.resourceId]);
    if (edges.has(edge)) add('DUPLICATE_TRANSITION', path, 'Task edge/resource repeated.');
    edges.add(edge);
    if (!products.has(t.from) || !products.has(t.to)) add('DIRECTION', path, 'Explicit known from/to products required.');
    if (!registry.has(key('resource', t.resourceId))) add('UNKNOWN_RESOURCE', path + '.resourceId', 'Unknown applicable resource.');
    for (const f of ['predecessorEnd', 'start', 'successorStart']) if (!minute(t[f])) add('TIME', path + '.' + f, 'Explicit nonnegative integer minute required.');
    const p = config.policies.find(p => p.from === t.from && p.to === t.to && p.resourceIds.includes(t.resourceId));
    if (!p) add('MISSING_POLICY', path, 'No exact directed resource policy; reverse direction is never reused.', {direction: [t.from, t.to], resourceId: t.resourceId});
    if (findings.length !== before) return;
    const end = t.start + p.durationMinutes, readyAt = end + p.validation.waitMinutes;
    const ev = {transitionId: t.id, taskIds: [t.fromTaskId, t.toTaskId], policyId: p.id, direction: [t.from, t.to], resourceId: t.resourceId, policySource: copy(p.source), sequenceSource: copy(t.source)};
    const fail = (code, message, evidence = {}) => add(code, path, message, {...ev, ...evidence});
    if (!minute(end) || !minute(readyAt)) {fail('TIME_OVERFLOW', 'Computed endpoints exceed exact integer minutes.'); return;}
    if (p.prohibited) fail('PROHIBITED', 'Exact directed resource combination is explicitly prohibited.');
    if (t.start < t.predecessorEnd) fail('PRECEDENCE', 'Changeover starts before the declared predecessor ends.', {start: t.start, predecessorEnd: t.predecessorEnd});
    if (t.successorStart < readyAt) fail('VALIDATION_WAIT', 'Successor starts before elapsed validation wait completes.', {end, readyAt, successorStart: t.successorStart});
    if (t.start < horizon.start || readyAt > horizon.end || t.successorStart > horizon.end || t.predecessorEnd < horizon.start)
      fail('HORIZON', 'Declared transition/release endpoints exceed explicit horizon.', {start: t.start, readyAt, horizon});
    inspections.push({...ev, start: t.start, end, readyAt, successorStart: t.successorStart,
      declaredNoChangeover: p.durationMinutes === 0, declaredNoPersonnel: p.personnel.length === 0,
      declaredNoWait: p.validation.waitMinutes === 0, policy: copy(p), checks: ['direction', 'prohibition', 'precedence', 'validation-wait', 'horizon']});
    for (const [phase, start, stop, def] of [['changeover', t.start, end, p], ['validation', end, readyAt, p.validation]]) {
      if (start === stop) continue; // Explicit zero creates no phantom occupancy or output.
      for (const [field, kind] of [['resources', 'resource'], ['personnel', 'personnel']]) for (const d of def[field]) {
        const r = registry.get(key(kind, d.id));
        const occupation = {...ev, phase, kind, resourceId: d.id, quantity: d.quantity, ...(kind === 'personnel' ? {skill: d.skill} : {}), start, end: stop, registrySource: copy(r.source)};
        requiredOccupations.push(occupation);
        if (!windowFit(r.windows.map(w => [w.start, w.end]), start, stop).ok || r.unavailable.some(w => overlaps(w, occupation)))
          fail('CALENDAR', 'Complete occupation must fit one available window and avoid every exception.', {occupation, windows: r.windows, unavailable: r.unavailable});
      }
    }
  });
  // Sweep declared demand, including every new transition and existing occupation.
  // Endpoint-adjacent intervals do not overlap. Distinct IDs are explicitly independent.
  for (const [k, r] of registry) {
    const rows = [...existingOccupations, ...requiredOccupations].filter(o => key(o.kind, o.resourceId) === k);
    const points = [...new Set(rows.flatMap(o => [o.start, o.end]))].sort((a, b) => a - b);
    for (let i = 0; i + 1 < points.length; i++) {
      const start = points[i], end = points[i + 1], active = rows.filter(o => o.start <= start && o.end > start);
      // BigInt avoids unsafe sums for individually valid large integer counts.
      const demand = active.reduce((n, o) => n + BigInt(o.quantity), 0n);
      if (demand > BigInt(r.capacity)) add('CAPACITY_OVERLAP', 'occupations', 'Simultaneous demand exceeds frozen independent capacity.', {
        registryKey: k, start, end, demand: demand.toString(), capacity: r.capacity, active: copy(active), registrySource: copy(r.source),
      });
    }
  }
  return finish(snapshot);
}
