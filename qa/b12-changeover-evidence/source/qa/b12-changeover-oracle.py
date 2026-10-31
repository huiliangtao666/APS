"""Independent integer-slot oracle. Does not import domain helpers or fixtures.
All generated values are selftest-only mocks, never site configuration defaults.
"""
import csv
import json
import os
import pathlib
import random
import shlex
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'qa/b12-changeover-evidence'
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(131320261031)
source = {'id': 'independent-integer-slot-mock', 'version': 'oracle-v1', 'purpose': 'selftest-only'}


def expected(f):
    p = f['config']['policies'][0]
    t = f['transitions'][0]
    start, end = t['start'], t['start'] + p['durationMinutes']
    ready = end + p['validation']['waitMinutes']
    occupations = []
    codes = set()
    if t['successorStart'] < ready:
        codes.add('VALIDATION_WAIT')
    if start < t['predecessorEnd']:
        codes.add('PRECEDENCE')
    if start < 0 or ready > 60 or t['successorStart'] > 60:
        codes.add('HORIZON')
    if p['prohibited']:
        codes.add('PROHIBITED')
    for phase, a, b, definition in [('changeover', start, end, p), ('validation', end, ready, p['validation'])]:
        if a == b:
            continue
        for field, kind in [('resources', 'resource'), ('personnel', 'personnel')]:
            for d in definition[field]:
                occupations.append([phase, kind, d['id'], a, b, d['quantity']])
                r = next(x for x in f['config'][field] if x['id'] == d['id'])
                # One complete window; adjacent rows are not automatically merged.
                covered = any(w['start'] <= a and w['end'] >= b for w in r['windows'])
                occupied_slots = set(range(a, b))
                blocked_slots = set().union(*(set(range(w['start'], w['end'])) for w in r['unavailable'])) if r['unavailable'] else set()
                if not covered or occupied_slots & blocked_slots:
                    codes.add('CALENDAR')
    # Deliberately enumerate each integer slot instead of reproducing the sweep.
    all_rows = [(o[1], o[2], o[3], o[4], o[5]) for o in occupations]
    all_rows += [(o['kind'], o['resourceId'], o['start'], o['end'], o['quantity']) for o in f['existingOccupations']]
    for field, kind in [('resources', 'resource'), ('personnel', 'personnel')]:
        for r in f['config'][field]:
            for tick in range(60):
                demand = sum(q for k, rid, a, b, q in all_rows if k == kind and rid == r['id'] and tick in range(a, b))
                if demand > r['capacity']:
                    codes.add('CAPACITY_OVERLAP')
    return sorted(codes), occupations, ready


inputs, precomputed = [], []
for case in range(160):
    def registry(id, capacity):
        windows = [{'start': 0, 'end': 60}]
        if rng.randrange(5) == 0:
            windows = [{'start': 0, 'end': 22}, {'start': 22 + rng.randrange(2), 'end': 60}]
        unavailable = [] if rng.randrange(4) else [{'start': 18, 'end': 25}]
        return {'id': id, 'capacity': capacity, 'capacityScope': 'independent', 'windows': windows, 'unavailable': unavailable, 'source': source}
    start, duration, wait = rng.randrange(10, 30), rng.randrange(0, 15), rng.randrange(0, 9)
    p = {'id': 'direction-test', 'from': 'A', 'to': 'B', 'resourceIds': ['M'], 'durationMinutes': duration,
         'prohibited': rng.randrange(10) == 0, 'resources': [{'id': 'M', 'quantity': rng.randrange(1, 4)}],
         'personnel': [{'id': 'P', 'quantity': rng.randrange(1, 4), 'skill': 'clean'}],
         'validation': {'clock': 'elapsed-minutes', 'waitMinutes': wait,
                        'resources': [] if rng.randrange(2) else [{'id': 'M', 'quantity': 1}],
                        'personnel': [] if rng.randrange(2) else [{'id': 'P', 'quantity': 1, 'skill': 'clean'}]}, 'source': source}
    t = {'id': 'T', 'from': 'A', 'to': 'B', 'resourceId': 'M', 'fromTaskId': 'FROM', 'toTaskId': 'TO',
         'predecessorEnd': start + (1 if rng.randrange(12) == 0 else 0), 'start': start,
         'successorStart': start + duration + wait + rng.choice([-1, 0, 0, 1]), 'source': source}
    ledger = []
    for n in range(rng.randrange(0, 5)):
        a = rng.randrange(0, 50)
        kind = rng.choice(['resource', 'personnel'])
        ledger.append({'id': 'E' + str(n), 'kind': kind, 'resourceId': 'M' if kind == 'resource' else 'P',
                       'start': a, 'end': min(a + rng.randrange(1, 11), 60), 'quantity': rng.randrange(1, 3), 'source': source})
    f = {'config': {'contract': 'BR13-directed-occupations-v1', 'source': source,
                    'timebase': {'unit': 'minute', 'origin': 'independent-mock-zero'}, 'products': ['A', 'B'],
                    'resources': [registry('M', rng.randrange(1, 5))],
                    'personnel': [dict(registry('P', rng.randrange(1, 5)), skills=['clean'])], 'policies': [p]},
         'transitions': [t], 'existingOccupations': ledger, 'horizon': {'start': 0, 'end': 60}, 'source': source,
         'productionContext': [{'taskId': 'FROM', 'orderId': 'O1', 'quantity': 250, 'start': 0, 'end': 30, 'fixedMinutes': 30},
                               {'taskId': 'TO', 'orderId': 'O2', 'quantity': 250, 'start': 60, 'end': 90, 'fixedMinutes': 30}]}
    inputs.append(f)
    codes, occupations, ready = expected(f)
    precomputed.append({'id': 'ORACLE-%03d' % case, 'codes': codes, 'occupations': occupations, 'readyAt': ready,
                        'productionQuantityBefore': 500, 'productionQuantityAfter': 500,
                        'productionDurationsBefore': [30, 30], 'productionDurationsAfter': [30, 30]})

# Persist expectations before running implementation.
(OUT / 'oracle-inputs.json').write_text(json.dumps(inputs, indent=2))
(OUT / 'oracle-expected.json').write_text(json.dumps(precomputed, indent=2))
app_exec = os.environ.get('B12_APP_EXEC')
if app_exec:
    # Python only prepares/compares data on host. Application Node stays in container.
    input_path = str((OUT / 'oracle-inputs.json').resolve().relative_to(ROOT))
    output_path = str((OUT / 'oracle-actual.json').resolve().relative_to(ROOT))
    run = subprocess.run([app_exec, '--cwd', '/workspace/apps/' + ROOT.name, '--mode', 'standalone',
                          'node qa/b12-changeover-json-runner.mjs < ' + shlex.quote(input_path) + ' > ' + shlex.quote(output_path)],
                         text=True, capture_output=True, check=True)
    actual = json.loads((OUT / 'oracle-actual.json').read_text())
else:
    run = subprocess.run(['node', 'qa/b12-changeover-json-runner.mjs'], cwd=ROOT, input=json.dumps(inputs), text=True, capture_output=True, check=True)
    actual = json.loads(run.stdout)
(OUT / 'oracle-actual.json').write_text(json.dumps(actual, indent=2))
rows = []
for f, e, a in zip(inputs, precomputed, actual):
    codes = sorted(set(x['code'] for x in a['findings']))
    occupations = [[o['phase'], o['kind'], o['resourceId'], o['start'], o['end'], o['quantity']] for o in a['requiredOccupations']]
    assert codes == e['codes'], (e['id'], codes, e['codes'])
    assert occupations == e['occupations'], e['id']
    assert a['domainValid'] == (not e['codes']), e['id']
    assert a['inspections'][0]['readyAt'] == e['readyAt'], e['id']
    assert a['acceptedOccupations'] == ([] if e['codes'] else a['requiredOccupations']), e['id']
    assert a['snapshot'] == f and a['overallSchedulable'] is None
    # Explicit protected context is opaque to this domain; added occupations cannot
    # rewrite fixed programs, remove identities or supply extra production output.
    context = a['snapshot']['productionContext']
    assert sum(t['quantity'] for t in context) == e['productionQuantityAfter'] == 500
    assert [t['end'] - t['start'] for t in context] == e['productionDurationsAfter'] == [30, 30]
    assert [(t['taskId'], t['orderId']) for t in context] == [('FROM', 'O1'), ('TO', 'O2')]
    assert 'tasks' not in a and 'productionOutput' not in a
    rows.append([e['id'], 'PASS', '|'.join(e['codes']) or 'checked', e['readyAt'], len(occupations)])
with (OUT / 'oracle-matrix.csv').open('w', newline='') as handle:
    w = csv.writer(handle); w.writerow(['assertion', 'result', 'expected_codes', 'ready_at', 'occupation_count']); w.writerows(rows)
print(json.dumps({'seed': 131320261031, 'cases': len(rows), 'pass': len(rows), 'fail': 0,
                  'valid': sum(not e['codes'] for e in precomputed), 'negative': sum(bool(e['codes']) for e in precomputed),
                  'method': 'independent per-integer-minute enumeration + explicit expected occupations; no domain helper imports'}))
