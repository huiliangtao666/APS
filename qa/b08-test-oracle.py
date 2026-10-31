"""Independent raw-CSV arithmetic; imports no product or JS allocator module."""
import csv,json,pathlib,sys,re,hashlib
raw=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);checks=[]
def read(prefix):
 p=next(raw.glob(prefix+'_*.csv'))
 with p.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
people=read('06');deps=read('12');times=read('11');orders=read('17');routes=read('10');machines=read('03')
assert [(r['技能'],int(r['可用人数']))for r in people]==[('综合操作',2),('普通辅助',10)]
assert {r['订单编号']:int(r['需求数量'])for r in deps if r['资源类型']=='人员'and r['工序编号']=='MIX'}=={'A':2,'B':1}
def sweep(rows,cap):
 for t in sorted({x for r in rows for x in [r['start'],r['end']]}):
  if sum(float(r['quantity'])for r in rows if r['start']<=t<r['end'])>cap:return False
 return True
def covers(rows,start,end):return any(float(r['起始分钟'])<=start and end<=float(r['结束分钟'])for r in rows)
for name in ['core','arrival60','aux-denied','aux-directed','aux-disabled','pool1','hp04-expand','hp04-availability','phase','whole','shift','stop','horizon59','n06']:
 x=json.loads((out/(name+'.json')).read_text());d=x['data'];plan=x['plan'];tasks=plan['tasks'];ledger=plan['resourceReservations'];byid={t['id']:t for t in tasks}
 expected=0 if name in ['aux-denied','aux-disabled']else 2 if name=='pool1'else 1 if name=='horizon59'else 4
 assert len(tasks)==expected,(name,'coverage')
 rawOrder={r['订单编号']:r for r in orders};groups={g['人员组编号']:g for g in d['personnelGroups']}
 facts={f['订单编号']+'-'+f['工序编号']:f for f in d['executionFacts']}
 for t in tasks:
  fact=facts.get(t['id']);historical=fact and fact['状态']=='已完成'
  dur=float(next(r for r in times if r['产品编号']==rawOrder[t['orderId']]['产品编号']and r['工序编号']==t['operation'])['固定分钟'])
  assert t['end']-t['start']==dur,(name,t['id'],'duration')
  machine=next(r for r in deps if r['订单编号']==t['orderId']and r['工序编号']==t['operation']and r['资源类型']=='设备')['资源编号'];assert machine==t['machine']
  route=next(r for r in routes if r['产品编号']==rawOrder[t['orderId']]['产品编号']and r['工序编号']==t['operation'])
  if route.get('前序工序编号'):assert byid[t['orderId']+'-'+route['前序工序编号']]['end']<=t['start']
  if historical:continue
  if x['input']['conditions'].get('endMinute')is not None:assert t['end']<=x['input']['conditions']['endMinute']
  m=next(m for m in d['machines']if m['设备编号']==t['machine']);cal=m.get('日历编号')or d['calendars'][0]['日历编号'];calrows=[c for c in d['calendars']if c['日历编号']==cal];work=[c for c in calrows if c['是否工作']=='是'];closed=[c for c in calrows if c['是否工作']!='是']
  assert covers(work,t['start'],t['end'])
  assert not any(float(r['起始分钟'])<t['end']and float(r['结束分钟'])>t['start']for r in d['downtime']if r['设备编号']==t['machine'])
  requirements=[r for r in d['dependencies']if r['订单编号']==t['orderId']and r['工序编号']==t['operation']and r['资源类型']=='人员技能']
  rows=[r for r in ledger if r['type']=='人员'and t['id']in r.get('taskIds',[r.get('taskId')])]
  assert len(requirements)==1 # This source package has one post per task; no production assumption.
  need=requirements[0];whole=need['窗口外释放']=='否'or need.get('人员占用基准')=='完整工序'
  start=t['start']+(0 if whole else float(need.get('人员开始偏移')or 0))-float(need.get('提前占用分钟')or 0)
  end=t['end']-(0 if whole else float(need.get('人员结束偏移')or 0))+float(need.get('后延占用分钟')or 0)
  assert start>=0 and end>start
  assert rows and all(r['start']==start and r['end']==end for r in rows)
  assert sum(int(r['quantity'])for r in rows)==int(need['需求数量'])
  for r in rows:
   g=groups[r['resourceId']];assert r['resourceId']in (need.get('候选人员组')or need['资源编号']).split(',');assert need['所需班次']==g['班次'];assert float(g['可用起始分钟'])<=start and end<=float(g['可用结束分钟']);assert covers(work,start,end)
   assert not any(float(s['起始分钟'])<end and float(s['结束分钟'])>start for s in closed+[s for s in d['resourceStops']if s['资源类型']=='人员'and s['资源编号']==r['resourceId']])
   have=re.split(r'[;,，；\s]+',g['技能']);required=need['所需技能']
   if required not in have:
    edges=[s for s in d['skillSubstitutions']if s['可提供技能']in have and s['所需技能']==required];valid=[]
    for provided in have:
     exact=next((s for s in edges if s['可提供技能']==provided and s['适用工序']==t['operation']),None);edge=exact or next((s for s in edges if s['可提供技能']==provided and s['适用工序']=='*'),None)
     if edge and edge['是否启用']=='是':valid.append(edge['关系编号'])
    assert r['relationId']in valid
 for g in d['personnelGroups']:assert sweep([r for r in ledger if r['type']=='人员'and r['resourceId']==g['人员组编号']],int(g['人员数量']))
 for p in d['personnelPools']:
  ids=[g['人员组编号']for g in d['personnelGroups']if g['poolId']==p['poolId']];assert sweep([r for r in ledger if r['type']=='人员'and r['resourceId']in ids],int(p['总人数']))
 for tool in d['tools']:
  rows=[r for r in ledger if r['type']=='工装'and r['resourceId']==tool['工装编码']];assert sweep(rows,int(tool['可用数量']))
  for r in rows:
   t=next(t for t in tasks if t['id']in r['taskIds']);c=next(c for c in d['resourceClaims']if c['声明编号']==r['declarationId']);assert r['start']==t['start']-int(c['提前占用分钟'])and r['end']==t['end']+int(c['后延占用分钟']);assert int(r['quantity'])==int(c['需求数量']);assert int(tool['可用起始分钟'])<=r['start']and r['end']<=int(tool['可用结束分钟'])
 if name=='n06':
  doc=json.loads(d['originalResourceEvents'][0]['原账JSON']);assert doc['contract']=='N06-finite-v1';assert doc['sources'][0]['kind']=='明确模拟';assert all(o['end']==40 for o in doc['occupancies']);assert all(t['start']>=40 for t in tasks if t['id']!='A-MIX');assert x['input']['conditions']['executionResourceContract']=='N06-finite-v1'
 checks.append({'id':name,'status':'PASS','tasks':len(tasks),'basis':'literal UAT08 CSV + explicit variant config; all-resource interval/capacity arithmetic, no selected schedule required'})
bad=json.loads((out/'illegal-overlap.json').read_text());assert not sweep([r for r in bad['plan']['resourceReservations']if r['type']=='人员'and r['resourceId']=='LP01'],2);checks.append({'id':'diagnostic-3-vs-2','status':'PASS'})
result={'oracle':'Python stdlib raw CSV independent arithmetic; no product imports','sourceHashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in raw.glob('*.csv')},'checks':checks};(out/'independent-oracle.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'PASS':len(checks),'FAIL':0}))
