"""Independent stdlib oracle: derives demand, windows, duration and capacities from raw CSV.
Never imports product code or accepts its resource ledger as the expected answer.
"""
from pathlib import Path
import csv,json,sys,copy,itertools
raw=Path(sys.argv[1]);out=Path(sys.argv[2]);checks=[]
def table(n):
 with next(raw.glob(n+'_*.csv')).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
src={n:table(n) for n in ['01','02','03','04','05','07','10','11','12','16','17']}
def add(id,fn):
 try:details=fn();checks.append(dict(id=id,status='PASS',details=details))
 except Exception as e:checks.append(dict(id=id,status='FAIL',details=str(e)));raise
def overlap(a,b):return max(a[0],b[0])<min(a[1],b[1])
def peak(rows):
 points=sorted({v for r in rows for v in [r['start'],r['end']]});return max([sum(r['quantity'] for r in rows if r['start']<=t<r['end']) for t in points]or[0])
def oracle(plan,data=None,complete=True,ledger=True):
 orders={r['订单编号']:r for r in src['17']};routes={(r['产品编号'],r['工序编号']):r for r in src['10']};times={(r['产品编号'],r['工序编号']):r for r in src['11']};tools={r['资源编号']:r for r in src['05']};machines={r['设备编号']:r for r in src['03']};cal=src['02'];down=src['04'];claims=None
 if data is not None:
  tools={r['工装编码']:{'可用数量':r['可用数量'],'最早可用分钟':r['可用起始分钟'],'最晚可用分钟':r['可用结束分钟']} for r in data['tools']};cal=data['calendars'];down=data['downtime'];claims=data['resourceClaims']
 tasks=plan['tasks'];by={t['id']:t for t in tasks};expected={o+'-'+op for o,r in orders.items() for p,op in routes if p==r['产品编号']}
 assert len(by)==len(tasks),'duplicate task'
 assert set(by)<=expected,'invented task'
 if complete:assert set(by)==expected,('incomplete',expected-set(by))
 res=[];machinebusy={}
 for t in tasks:
  oid,op=t['orderId'],t['operation'];route=routes[orders[oid]['产品编号'],op];duration=int(times[orders[oid]['产品编号'],op]['固定分钟']);assert t['end']-t['start']==duration,'duration'
  deps=[r for r in src['12'] if r['订单编号']==oid and r['工序编号']==op];md=[r for r in deps if r['资源类型']=='设备'];assert len(md)==1 and t['machine']==md[0]['资源编号'],'machine dependency'
  pred=route['前序工序'];assert not pred or oid+'-'+pred in by and by[oid+'-'+pred]['end']<=t['start'],'precedence'
  m=machines[t['machine']];wins=[(int(r['起始分钟']),int(r['结束分钟'])) for r in cal if r['日历编号']==m['日历编号'] and r['是否工作']=='是'];assert any(a<=t['start']<t['end']<=b for a,b in wins),'calendar'
  assert not any(overlap((t['start'],t['end']),(int(r['起始分钟']),int(r['结束分钟']))) for r in down if r['设备编号']==t['machine']),'downtime'
  busy=machinebusy.setdefault(t['machine'],[]);assert not any(overlap((t['start'],t['end']),w) for w in busy),'machine overlap';busy.append((t['start'],t['end']))
  demand=[r for r in deps if r['资源类型'] in ['模具','工具']]
  for d in demand:
   c=next((r for r in claims if r['订单编号']==oid and r['工序编号']==op and r['资源编号']==d['资源编号']),None) if claims is not None else d
   assert c,'missing claim';tool=tools[d['资源编号']];start=t['start']-int(c['提前占用分钟']);end=t['end']+int(c['后延占用分钟']);quantity=int(c['需求数量']);assert int(tool['最早可用分钟'])<=start<end<=int(tool['最晚可用分钟']),'tool window'
   r=dict(taskId=t['id'],resourceId=d['资源编号'],start=start,end=end,quantity=quantity);res.append(r)
   if ledger:
    actual=[v for v in plan['resourceReservations'] if v['type']=='工装' and v['resourceId']==r['resourceId'] and t['id'] in v['taskIds']];assert len(actual)==1,'missing/duplicate reservation';a=actual[0];assert (a['start'],a['end'],int(a['quantity']),int(a['capacity']))==(start,end,quantity,int(tool['可用数量'])),'acquisition/release ledger mismatch'
 peaks={k:peak([r for r in res if r['resourceId']==k]) for k in tools}
 for k,v in peaks.items():assert v<=int(tools[k]['可用数量']),('capacity',k,v,tools[k]['可用数量'])
 if ledger:assert len([r for r in plan['resourceReservations'] if r['type']=='工装'])==len(res),'extra reservation'
 return dict(tasks=len(tasks),peaks=peaks,reservations=res)
def rejects(p,data=None,complete=True):
 try:oracle(p,data,complete,ledger=False)
 except AssertionError as e:return {'rejected':str(e)}
 raise AssertionError('illegal schedule accepted')
core=json.loads((out/'api/core.json').read_text());p=core['plan']
add('SOURCE_ENABLED_FOUR',lambda: next(True for _ in [0] if [r['规则编号'] for r in src['16'] if r['是否启用']=='是']==['MACHINE','PRECEDENCE','CALENDAR','MOLD']))
add('SOURCE_THREE_DEMANDS_TWO_PHYSICAL_SETS',lambda: next({'resource':'G01','operation':'FILL','instances':3,'capacity':2,'T01_literal_capacity':3} for _ in [0] if len([r for r in src['12'] if r['资源编号']=='G01' and r['资源类型']=='模具' and r['需求数量']=='1'])==3 and next(r for r in src['05'] if r['资源编号']=='G01')['可用数量']=='2'))
for name in ['core','mix-cap2','single-set','late-return10','calendar-start100','machine-stop','tool-window100','demand3-cap2']:
 x=json.loads((out/f'api/{name}.json').read_text());add('WORKER_'+name,lambda x=x,name=name:oracle(x['plan'],x['data'],complete=name!='demand3-cap2'))
# Every permutation of the three complete order pairs is a legal alternative:
# two FILL at30; remaining one starts60, without an imposed order identity.
def alternatives():
 for first,second,third in itertools.permutations('ABC'):
  a=copy.deepcopy(p)
  for t in a['tasks']:
   if t['operation']=='FILL':t['start']=60 if t['orderId']==third else 30;t['end']=t['start']+30
  oracle(a,ledger=False)
 return {'accepted_complete_legal_alternatives':6}
add('ANY_COMPLETE_LEGAL_ORDER',alternatives)
bad=copy.deepcopy(p)
for t in bad['tasks']:
 if t['operation']=='FILL':t['start']=30;t['end']=60
add('THREE_SIMULTANEOUS_ILLEGAL',lambda:rejects(bad))
def physical_sets():
 rows=oracle(p)['reservations'];slots=[0,0];assignment=[]
 for r in sorted((r for r in rows if r['resourceId']=='G01'),key=lambda r:r['start']):
  free=next((i for i,end in enumerate(slots) if end<=r['start']),None);assert free is not None,'third physical set required';slots[free]=r['end'];assignment.append({'task':r['taskId'],'testSetLabel':'G01-set-'+str(free+1),'acquire':r['start'],'release':r['end']})
 return {'assignment':assignment,'labels':'oracle-only interchangeable set labels; not invented customer asset IDs'}
add('TWO_PHYSICAL_SETS_ACQUIRE_RELEASE',physical_sets)
b=copy.deepcopy(p);t=next(t for t in b['tasks'] if t['id']=='C-FILL');t['start']=59;t['end']=89
add('BEFORE_RETURN_59_ILLEGAL',lambda:rejects(b));add('EXACT_RETURN_60_HALF_OPEN_LEGAL',lambda:oracle(p))
b=copy.deepcopy(p);b['tasks']=[t for t in b['tasks'] if t['id']!='C-FILL'];add('MISSING_DEMAND_REJECTED',lambda:rejects(b))
b=copy.deepcopy(p);next(t for t in b['tasks'] if t['id']=='A-FILL').update(start=0,end=30);add('PRECEDENCE_MUTATION_REJECTED',lambda:rejects(b))
b=copy.deepcopy(p);next(t for t in b['tasks'] if t['id']=='A-MIX')['machine']='MIX02';add('MACHINE_MUTATION_REJECTED',lambda:rejects(b))
b=copy.deepcopy(p)
for t in b['tasks']:t['start']+=600;t['end']+=600
add('CALENDAR_MUTATION_REJECTED',lambda:rejects(b))
late=json.loads((out/'api/late-return10.json').read_text());bad=copy.deepcopy(late['plan']);fills=sorted([t for t in bad['tasks'] if t['operation']=='FILL'],key=lambda t:t['start']);fills[-1].update(start=69,end=99);add('BEFORE_DELAYED_RETURN69_REJECTED',lambda:rejects(bad,late['data']))
if (out/'ui/core.json').exists():
 x=json.loads((out/'ui/core.json').read_text());add('BROWSER_REAL_WORKER',lambda:oracle(x['plan'],x['data']))
if (out/'ui/native-plan.csv').exists():
 def native_export():
  with (out/'ui/native-plan.csv').open(encoding='utf-8-sig',newline='') as f:rows=list(csv.reader(f))
  i=next(i for i,r in enumerate(rows) if r and r[0]=='任务编号');headers=rows[i];tasks=[];reservations=[]
  for row in rows[i+1:]:
   if not row or row[0] not in {t['id'] for t in p['tasks']}:break
   r=dict(zip(headers,row));tasks.append(dict(id=r['任务编号'],orderId=r['订单编号'],operation=r['工序编号'],machine=r['设备编号'],start=int(r['开始分钟']),end=int(r['结束分钟'])));reservations.extend(json.loads(r['联合资源占用']))
  return oracle({'tasks':tasks,'resourceReservations':reservations})
 add('NATIVE_EXPORT_PARSED_SIX_TASKS_AND_LEDGER',native_export)
(out/'oracle-results.json').write_text(json.dumps({'scope':'independent source-derived oracle; task evidence only','checks':checks},ensure_ascii=False,indent=2));print(json.dumps({'checks':len(checks),'PASS':sum(c['status']=='PASS' for c in checks)}))
