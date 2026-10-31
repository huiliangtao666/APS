#!/usr/bin/env python3
"""Independent source/CSV/Fraction checks. No application imports or expected outputs from allocator."""
import csv,hashlib,io,json,pathlib,sys
from fractions import Fraction
root=pathlib.Path(sys.argv[1]);checks=[]
def check(name,condition,detail=None):
 if not condition:raise AssertionError((name,detail))
 checks.append({'id':name,'result':'PASS','details':detail})
def load(p):return json.loads(p.read_text())
def personnel(data,plan,label):
 rows=plan['resourceReservations'];tasks=plan['tasks']
 for task in tasks:
  deps=[r for r in data['dependencies'] if r['资源类型']=='人员技能' and r['订单编号']==task['orderId'] and r['工序编号']==task['operation']]
  for d in deps:
   whole=d.get('窗口外释放')=='否' or d.get('人员占用基准')=='完整工序'
   a=(task['start'] if whole else task['start']+int(d.get('人员开始偏移')or 0))-int(d['提前占用分钟'])
   b=(task['end'] if whole else task['end']-int(d.get('人员结束偏移')or 0))+int(d['后延占用分钟'])
   got=[r for r in rows if r['type']=='人员' and task['id'] in r['taskIds'] and r.get('postId')==d['人员岗位编号']]
   points=sorted(set([a,b]+[x for r in got for x in [r['start'],r['end']]]))
   for t in points[:-1]:check(label+':coverage:'+task['id']+':'+str(t),sum(Fraction(r['quantity']) for r in got if r['start']<=t<r['end'])==(Fraction(d['需求数量']) if a<=t<b else 0),{'want':[a,b],'at':t})
   for r in got:
    g=next(g for g in data['personnelGroups'] if g['人员组编号']==r['resourceId'])
    check(label+':available:'+task['id'],int(g['可用起始分钟'])<=r['start']<r['end']<=int(g['可用结束分钟']))
    check(label+':source:'+task['id'],any(p['source']==d['人员配置来源'] and p['version']==d['人员配置版本'] and p['order']==d['人员检查顺序'] for p in r['occupationPolicies']))
 for pool in data['personnelPools']:
  groups={g['人员组编号'] for g in data['personnelGroups'] if g.get('poolId')==pool['poolId']}
  rs=[r for r in rows if r['type']=='人员' and r['resourceId'] in groups]
  for t in sorted({x for r in rs for x in [r['start'],r['end']]}):check(label+':unique-pool:'+str(t),sum(Fraction(r['quantity']) for r in rs if r['start']<=t<r['end'])<=Fraction(pool['总人数']))
for p in sorted((root/'new').glob('full-*.json')):
 x=load(p);personnel(x['data'],x['plan'],p.name)
 # Independent arithmetic: two30min tasks, each5pre/10post, capacity1 -> occupied45 each.
 check(p.name+':minimal-half-open',[[t['start'],t['end']] for t in x['plan']['tasks']]==[[5,35],[50,80]])
for p in sorted((root/'new').glob('hp04-csv-*.json')):
 x=load(p);personnel(x['state']['data'],x['plan'],p.name)
for name in ['hp04-initial.json','hp04-second.json']:
 x=load(root/'browser'/name);personnel(x['snapshot']['executionData'],x['plan'],name)
# Independently parse native resource CSV (each line is a category and saved JSON).
for name,version in [('hp04-frozen-native.csv','MOCK-hp04-r1'),('n06-frozen-native.csv','r1'),('n06-after-correction-old-native.csv','r1')]:
 text=(root/'browser'/name).read_text(encoding='utf-8-sig');rows=list(csv.reader(io.StringIO(text)));check(name+':csv-parse',len(rows)>5);check(name+':version',version in text)
 if name.startswith('n06'):
  ledger=next(json.loads(r[1]) for r in rows if r[0]=='MOCK取得归还释放账');check(name+':mock',ledger['kind'].startswith('MOCK'))
  event=ledger['events'][0];doc=json.loads(event['原账JSON']);check(name+':source-kind-version',all(s['kind']=='明确模拟' and s['domain']=='N06-MOCK' and s['version']=='r1' for s in doc['sources']))
  check(name+':actual-ends-not-task-ends',[(o['start'],o['end']) for o in doc['occupancies']]==[(0,40)]*3)
  check(name+':old-event-frozen',len(ledger['events'])==1 and 'ui-correction' not in text)
  check(name+':ledger-physical-once',len({o['occupancyId'] for o in ledger['protection']})==3)
x=load(root/'new'/'n06-process.json');events=x['state']['data']['originalResourceEvents'];check('n06:register-release',[(e['事件编号'],e['前事件编号'],e['事件类型']) for e in events]==[('e1','','登记'),('e2','e1','释放')]);a=json.loads(events[0]['原账JSON']);b=json.loads(events[1]['原账JSON']);check('n06:unknown-not-defaulted',a['occupancies'][0]['end'] is None);check('n06:source-backed-full-release',b['occupancies'][0]['end']==40 and b['occupancies'][0]['releaseSource']=='release');check('n06:actual-process-restart',x['firstPid']!=x['secondPid']);check('n06:all-source-mock',all(s['kind']=='明确模拟' for s in b['sources']))
mock=pathlib.Path(__file__).with_name('n06-mock-source.txt').read_bytes();check('n06:source-bytes-sha',all(s['sha256']==hashlib.sha256(mock).hexdigest() for s in b['sources']))
y=load(root/'browser'/'n06-final-state.json');check('n06:UI-append-history',len(y['data']['originalResourceEvents'])==2);check('n06:frozen-initial-history',len(load(root/'browser'/'n06-initial.json')['snapshot']['originalInput']['originalResourceEvents'])==1)
print(json.dumps({'independent':True,'imports':'Python standard library CSV/JSON/Fraction only; no application code','checks':checks,'counts':{'PASS':len(checks),'FAIL':0}},ensure_ascii=False,indent=2))
