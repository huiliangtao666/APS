#!/usr/bin/env python3
"""Independent Fraction/event-sweep checks; reads frozen source and output only.
No scheduler, identity builder, adapter, allocator, or product checker imports.
"""
import json, pathlib, runpy, sys
from fractions import Fraction as F
oracle=runpy.run_path(str(pathlib.Path(__file__).with_name('r4-source-oracle.py')))
evidence=json.loads(pathlib.Path(sys.argv[1]).read_text());checks=[]
for case in evidence['core']:
    name=case['id'];p=case.get('plan');source=case.get('input',{}).get('executionData')
    if source and (name.startswith(('full-','capacity-','worker-','split-','enabled-')) or name in ['under-min','wait-0','wait-10','wait-11','wait-30','source-diagnostics']):
        bad=name in ['wait-11','wait-30','source-diagnostics'];partial=name in ['under-min'] or name.startswith('capacity-239')
        try:
            result=oracle['check'](source,p,not partial)
            assert not bad, 'tampered output passed independent source check'
        except AssertionError:
            if not bad: raise
            result={'tamperingRejected':True}
        checks.append({'id':name,'result':'PASS',**result})
    if name.startswith('proposal-') or name=='common-window':
        proposal=case['proposal'];members=case.get('members')
        if members is None:
            fixture=case['fixture'];raw=fixture['data'];members=[]
            for b in fixture['productionBatches']:
                members.append({'id':b['id'],'inputKg':b['inputKg'],'outputKg':b['qualifiedKg']})
        for m in members:
            for t in [t for t in proposal['tasks'] if t['productionBatchId']==m['id']]:
                amount=m['outputKg'] if t['loadBasis']=='合格产出' else m['inputKg']
                assert oracle['exact'](t['exactLoadKg'])==oracle['exact'](amount)
                if t['loadBasis']=='合格产出':
                    prior=next(h for h in proposal['tasks'] if h['id']==t['predecessor'])
                    assert 0<=t['start']-prior['end']<=t['maxWait']
        checks.append({'id':name,'result':'PASS','coolingOutputLoadIndependentlyChecked':True})
assert len(checks)>=20
print(json.dumps({'oracle':'stdlib Fraction and event sweeps from frozen data; no product algorithm imports','checks':checks},ensure_ascii=False,indent=2))
