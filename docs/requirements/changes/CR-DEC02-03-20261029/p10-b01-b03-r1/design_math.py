import json
from pathlib import Path
p=Path(__file__).resolve().parent
cases=json.loads((p/'P10-B01-B03-SCENARIOS-r1.json').read_text())['scenarios']
for c in cases:
 i=c['input'];rows=i['posts'];hs=[];bad=False
 for h in i['handovers']:
  e=max(r['end'] for r in rows if r['task']==h['task'])
  hs.append(dict(task=h['task'],group=h['group'],start=e+h['start_offset'],end=e+h['end_offset'],quantity=h['quantity']))
 for r in rows+hs:
  a,b=i['availability'][r['group']]
  bad |= not(a<=r['start']<r['end']<=b)
 points=sorted({r[k] for r in rows+hs for k in ['start','end']})
 for t in points[:-1]:
  normal={}
  for r in rows:
   if r['start']<=t<r['end']:
    key=(r['task'],r['post']);prev=normal.get(key)
    if prev is None or r['quantity']>prev['quantity']:normal[key]=r
  hh=[r for r in hs if r['start']<=t<r['end']]
  active=list(normal.values())+(hh if i['handover_meaning']=='extra' else [])
  cap=i['pool']['capacity']
  if i['handover_meaning']=='ceiling' and hh:cap=min([cap]+[h['quantity'] for h in hh])
  total=sum(r['quantity'] for r in active)
  bad |= total>cap
  for g,q in i['group_caps'].items():bad |= sum(r['quantity'] for r in active if r['group']==g)>q
  bad |= not i['pool']['shared'] and len({r['task'] for r in active})>1
 assert (not bad)==c['expected']['legal'],c['id']
print(str(len(cases))+' design examples checked; product NOT_EXECUTED; U01/U02 pending')
