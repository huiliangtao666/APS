"""Independent CSV/Fraction oracle. No product imports or reference-arrangement comparisons."""
import csv,json,hashlib,sys,copy
from pathlib import Path
from fractions import Fraction as F
T=Path(sys.argv[1]);S=T/'inputs/UAT-03';E=T/'evidence'
def rows(n):
 p=next(S.glob(n+'_*.csv'));return list(csv.DictReader(p.read_text(encoding='utf-8-sig').splitlines())),p
raw={n:rows(n)[0] for n in ['01','02','03','04','05','10','11','12','16','17']}
num=lambda r,k:F(r[k]);overlap=lambda a,b,c,d:max(a,c)<min(b,d)
checks=[]
def check(label,x,expected_frozen=True):
 plan=x['plan'];inp=x['input'];d=inp['originalInput'];execution=inp['executionData'];tasks=plan['tasks'];conditions=inp['conditions']
 assert conditions['enabledRuleIds']==['MACHINE','PRECEDENCE','CALENDAR','MOLD']
 assert inp['snapshotHash']==plan['snapshotHash'] and inp['inputVersionId']==plan['inputVersionId'] and inp['runId']==plan['runId']
 for n,key in [('01','factoryLines'),('02','calendars'),('03','machines'),('04','downtime'),('05','originalTools'),('10','routes'),('11','times'),('12','originalDependencies')]:
  src=plan['inputCsvSources'][key];text=rows(n)[1].read_bytes().decode('utf-8-sig');stored=src['originalText'];assert stored.lstrip('\ufeff')==text,(label,key)
  assert src['sha256']==hashlib.sha256(stored.encode()).hexdigest()
  for a,b in zip(raw[n],d[key]):assert all(b[k]==v for k,v in a.items()),(key,a,b)
  assert len(raw[n])==len(d[key])
 for o in raw['17']:
  current=next(r for r in d['orders'] if r['订单编号']==o['订单编号']);assert current['合格需求']==o['合格需求kg'] and current['产线编号']==o['产线编号'];assert [current[k] for k in ['是否允许拆分','需求类型','订单状态']]==['否','正式订单','有效']
 expected={(o['订单编号'],r['工序编号']):(o,r) for o in raw['17'] for r in raw['10'] if o['产品编号']==r['产品编号']};assert len(tasks)==len(expected)==4
 assert set((t['orderId'],t['operation'])for t in tasks)==set(expected)
 for t in tasks:
  o,r=expected[t['orderId'],t['operation']];a,b=F(t['start']),F(t['end']);duration=next(x for x in raw['11'] if x['产品编号']==o['产品编号'] and x['工序编号']==t['operation']);assert b-a==num(duration,'固定分钟')
  dep=next(x for x in raw['12'] if x['订单编号']==t['orderId'] and x['工序编号']==t['operation'] and x['资源类型']=='设备');assert t['machine']==dep['资源编号'];m=next(x for x in raw['03'] if x['设备编号']==t['machine']);assert m['产线编号']==o['产线编号']=='L01'
  windows=[c for c in raw['02'] if c['日历编号']==m['日历编号'] and c['是否工作']=='是'];assert any(num(w,'起始分钟')<=a<b<=num(w,'结束分钟')for w in windows);assert 0<=a<b<=600
  assert not any(s['设备编号']==t['machine'] and overlap(a,b,num(s,'起始分钟'),num(s,'结束分钟'))for s in raw['04'])
  if r['前序工序']:assert next(x for x in tasks if x['orderId']==t['orderId'] and x['operation']==r['前序工序'])['end']<=t['start']
 for t in tasks:
  assert not any(u['id']!=t['id']and u['machine']==t['machine']and overlap(F(t['start']),F(t['end']),F(u['start']),F(u['end']))for u in tasks)
 tools={x['资源编号']:x for x in raw['05']};claims=[r for r in raw['12'] if r['资源类型']in ['工具','模具']];expected_ledger=[]
 for r in claims:
  t=next(t for t in tasks if t['orderId']==r['订单编号']and t['operation']==r['工序编号']);tool=tools[r['资源编号']];a=F(t['start'])-num(r,'提前占用分钟');b=F(t['end'])+num(r,'后延占用分钟');assert num(tool,'最早可用分钟')<=a<b<=num(tool,'最晚可用分钟');expected_ledger.append((t['id'],r['资源编号'],a,b,num(r,'需求数量')))
  maps=[m for m in d['resourceMappings']if m['来源编号']==r['资源编号']];assert len(maps)==1;m=maps[0];assert m['状态']=='READY' and m['合同版本']=='FR013-resource-map-v1';assert json.loads(m['源记录JSON'])==tool;runtime=json.loads(m['运行记录JSON']);actual=next(t for t in execution['tools']if t['工装编码']==r['资源编号']);assert runtime==actual
  for k,src in [('可用数量','可用数量'),('可用起始分钟','最早可用分钟'),('可用结束分钟','最晚可用分钟')]:assert runtime[k]==tool[src]
  decl=next(t for t in d['resourceClaims'] if t['订单编号']==r['订单编号'] and t['工序编号']==r['工序编号'] and t['资源编号']==r['资源编号']);assert all(decl[k]==r[k]for k in ['需求数量','提前占用分钟','后延占用分钟']);assert decl['占用口径']=='显式逐生产批完整区间'
 actual_ledger=[(r['taskId'],r['resourceId'],F(r['start']),F(r['end']),F(r['quantity']))for r in plan['resourceReservations'] if r['type']=='工装'];assert sorted(expected_ledger)==sorted(actual_ledger),'ledger missing/duplicate/wrong'
 events={}
 for tid,rid,a,b,q in expected_ledger:events.setdefault(rid,[]).extend([(a,q),(b,-q)])
 maxima={}
 for rid,ev in events.items():
  current=F(0);mx=F(0)
  for minute,delta in sorted(ev,key=lambda e:(e[0],e[1])):current+=delta;assert 0<=current<=num(tools[rid],'可用数量'),(rid,minute,current);mx=max(mx,current)
  assert current==0;maxima[rid]=str(mx)
 binds=conditions['originalDependencyBindings'];assert len(binds)==len(raw['12'])
 for i,r in enumerate(raw['12']):
  b=binds[i];assert b['sourceIndex']==i and b['sourceRecord']==r
  assert b['status']==('DEFERRED'if r['资源类型']in ['人员','物料']else 'BOUND')
 a=next(t for t in tasks if t['id']=='A-FILL');b=next(t for t in tasks if t['id']=='B-FILL');assert b['start']>=a['end'],'B must wait for A release'
 checks.append({'id':label,'status':'PASS','tasks':len(tasks),'enabledConstraints':['MACHINE','PRECEDENCE','CALENDAR','MOLD'],'maximumConcurrentDemand':maxima,'releaseBoundary':[a['end'],b['start']],'sourceRecords':len(raw['12'])})
 return x
prior=json.loads((T/'prior/b234/evidence/b231/B231-configured-03.json').read_text());check('REUSED-833b3d5-API-WORKER',prior['old'])
if (E/'legal-result.json').exists():
 legal=json.loads((E/'legal-result.json').read_text());check('NEW-UI-RESULT',legal)
 # Demonstrate this oracle accepts a different feasible arrangement.
 alt=copy.deepcopy(legal)
 for t in alt['plan']['tasks']:t['start']+=5;t['end']+=5
 for r in alt['plan']['resourceReservations']:r['start']+=5;r['end']+=5
 check('ORACLE-ALTERNATE-LEGAL-ARRANGEMENT',alt)
 negative=[]
 for kind in ['capacity-overlap','missing-task','wrong-machine','calendar-stop','missing-ledger','duplicate-ledger','forged-source-map']:
  bad=copy.deepcopy(legal)
  if kind=='capacity-overlap':
   t=next(t for t in bad['plan']['tasks']if t['id']=='B-FILL');delta=45-t['start'];t['start']+=delta;t['end']+=delta
   for r in bad['plan']['resourceReservations']:
    if r['taskId']=='B-FILL':r['start']+=delta;r['end']+=delta
  elif kind=='missing-task':bad['plan']['tasks'].pop()
  elif kind=='wrong-machine':bad['plan']['tasks'][0]['machine']='MIX03'
  elif kind=='calendar-stop':
   t=next(t for t in bad['plan']['tasks']if t['id']=='B-MIX');t['start']=0;t['end']=30
   for r in bad['plan']['resourceReservations']:
    if r['taskId']=='B-MIX':r['start']=0;r['end']=30
  elif kind=='missing-ledger':bad['plan']['resourceReservations'].pop(0)
  elif kind=='duplicate-ledger':bad['plan']['resourceReservations'].append(copy.deepcopy(bad['plan']['resourceReservations'][0]))
  else:bad['input']['originalInput']['resourceMappings'][0]['源记录JSON']='{}'
  try:check('MUST-REJECT-'+kind,bad)
  except (AssertionError,StopIteration,KeyError):negative.append({'kind':kind,'status':'REJECTED_AS_EXPECTED'})
  else:raise AssertionError('oracle accepted '+kind)
 # Diagnostic UI expected conflict is derived independently from changed tasks/source capacity.
 diag=json.loads((E/'diagnostic-checked.json').read_text());conf=next(f for f in diag['verification']['findings']if f.get('interval',{}).get('kind')=='resource-capacity');v=conf['interval'];assert [v['start'],v['end'],v['demand'],v['effectiveCapacity']]==[45,60,2,1];assert set(conf['taskIds'])=={'A-FILL','B-FILL'}
 checks.append({'id':'NEGATIVE-DIAGNOSTIC-CROSSCHECK','status':'PASS','interval':[45,60],'demand':2,'capacity':1,'mutationsRejected':negative})
 resource=list(csv.reader((E/'native-resources.csv').read_text(encoding='utf-8-sig').splitlines()));source=json.loads(next(r[1]for r in resource if r[0]=='来源'));assert source['planId']==legal['plan']['id'] and source['runId']==legal['run']['id'] and source['snapshotHash']==legal['run']['snapshotHash'];bindings=[json.loads(r[1])for r in resource if r[0]=='original12'];assert len(bindings)==20
 checks.append({'id':'NATIVE-EXPORT-PROVENANCE','status':'PASS','originalBindings':len(bindings)})
result={'oracle':'independent Python CSV/Fraction/half-open event scan; no product imports; no reference arrangement equality','checks':checks,'allPassed':True};(E/'independent-oracle.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
