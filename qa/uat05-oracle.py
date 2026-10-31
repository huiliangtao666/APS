"""Independent UAT05 oracle: stdlib rational arithmetic and literal CSVs; no product imports."""
from pathlib import Path
from fractions import Fraction as F
from datetime import datetime
import csv,json,copy,sys,hashlib
rawroot,E=map(Path,sys.argv[1:3]);checks=[]
def read(n):return list(csv.DictReader(next(rawroot.glob(n+'_*.csv')).read_text(encoding='utf-8-sig').splitlines()))
raw={n:read(n)for n in ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','16','17']}
def check(id,actual):checks.append(dict(id=id,status='PASS',actual=actual))
def exact(x):return F(x['numerator'])/F(x['denominator'])
def cap(intervals,capacity):
 points=sorted(set(x for a,b,q in intervals for x in [a,b]));assert all(sum(q for a,b,q in intervals if a<=t<b)<=capacity for t in points),'capacity'
origin=datetime.fromisoformat('2026-11-02T08:00:00+08:00')
def minute(s):return F(str((datetime.fromisoformat(s.replace('Z','+00:00'))-origin).total_seconds()))/60
orders={o['订单编号']:o for o in raw['17']};products={p['产品编号']:p for p in raw['07']}
expected={o['订单编号']+'-'+r['工序编号']:(o,r)for o in raw['17']for r in raw['10']if o['产品编号']==r['产品编号']}
def demand(o,op):return {b['物料编号']:F(o['合格需求kg'])/F(products[o['产品编号']]['总收率'])*F(b['定额'])/1000 for b in raw['09']if b['产品编号']==o['产品编号'] and b['投料工序']==op}
assert demand(orders['A'],'MIX')=={'LEAN':F('162.5'),'FAT':F('37.5'),'WATER':F('37.5'),'PREMIX':F('12.5')}
assert sum(F(b['定额'])for b in raw['09']if b['产品编号']=='HC40')==1000
check('SOURCE_BOM_YIELD',{'A/B_output_kg':'240 each','input_kg':'250 each','lean_kg':'162.5 each','four_material_kg':['162.5','37.5','37.5','12.5'],'formula':'240 / (96/100) * 650 / 1000 = 325/2'})
assert F(raw['13'][0]['库存kg或个'])-F(raw['13'][0]['已占用kg或个'])==F('162.5')
assert F(raw['14'][0]['最早可用分钟'])==180
check('SOURCE_BOUNDARY_179_180',{'after_A_available179':'0','B_demand':'162.5','at179_shortage':'162.5','at180_supply':'162.5'})

def validate(p,d,complete=True):
 tasks={t['id']:t for t in p['tasks']};assert len(tasks)==len(p['tasks'])
 if complete:assert set(tasks)==set(expected),'complete coverage'
 else:assert set(tasks)<=set(expected)
 intervals={};people=[];tools={};used={};saved=p['materialDemands'];committed_seen=set()
 for tid,t in tasks.items():
  o,r=expected[tid];op=r['工序编号'];a,b=F(str(t['start'])),F(str(t['end']));assert 0<=a<b<=600
  tm=next(z for z in raw['11']if z['产品编号']==o['产品编号']and z['工序编号']==op);assert b-a==F(tm['固定分钟']),'duration'
  if r['前序工序']:assert F(str(tasks[o['订单编号']+'-'+r['前序工序']]['end']))<=a,'precedence'
  deps=[z for z in raw['12']if z['订单编号']==o['订单编号']and z['工序编号']==op]
  machine=next(z['资源编号']for z in deps if z['资源类型']=='设备');assert t['machine']==machine,'source machine'
  m=next(z for z in raw['03']if z['设备编号']==machine)
  assert any(F(c['起始分钟'])<=a and b<=F(c['结束分钟'])for c in d['calendars']if c['日历编号']==m['日历编号']and c['是否工作']=='是'),'calendar'
  assert all(b<=F(z['起始分钟'])or F(z['结束分钟'])<=a for z in raw['04']if z['设备编号']==machine),'downtime'
  intervals.setdefault(machine,[]).append((a,b,F(1)))
  for dep in deps:
   kind,rid=dep['资源类型'],dep['资源编号']
   if kind=='人员':
    source=next(g for g in raw['06']if g['人员组编号']==rid);g=next(g for g in d['personnelGroups']if g['人员组编号']==rid)
    assert dep['所需技能']in g['技能'].split('|')and g['技能']==source['技能'],'skill';assert F(g['人员数量'])==F(source['可用人数'])==1
    assert F(g['可用起始分钟'])<=a<b<=F(g['可用结束分钟']),'personnel window'
    rr=[z for z in p['resourceReservations']if z['type']=='人员'and tid in z.get('taskIds',[z.get('taskId')])];assert len(rr)==1
    assert rr[0]['resourceId']==rid and (F(str(rr[0]['start'])),F(str(rr[0]['end'])),F(rr[0]['quantity']))==(a,b,F(dep['需求数量'])),'people ledger'
    people.append((a,b,F(dep['需求数量'])))
   if kind in ['模具','工具']:
    source=next(g for g in raw['05']if g['资源编号']==rid);g=next(g for g in d['tools']if g['工装编码']==rid)
    x,y=a-F(dep['提前占用分钟']),b+F(dep['后延占用分钟']);assert F(g['可用起始分钟'])<=x<y<=F(g['可用结束分钟']),'tool window'
    rr=[z for z in p['resourceReservations']if z['type']=='工装'and z['resourceId']==rid and tid in z.get('taskIds',[z.get('taskId')])];assert len(rr)==1
    assert (F(str(rr[0]['start'])),F(str(rr[0]['end'])),F(rr[0]['quantity']))==(x,y,F(dep['需求数量'])),'tool ledger'
    tools.setdefault(rid,[]).append((x,y,F(dep['需求数量'])))
  needs=demand(o,op);rows=[z for z in saved if z['taskId']==tid and z['committed']];assert len(rows)==len(needs),'material coverage'
  for row in rows:
   mid=row['materialId'];amount=needs[mid];assert exact(row['exactQuantity'])==F(str(row['quantity']))==amount,'BOM demand'
   assert F(str(row['feedMinute']))==a and row['shortage']==0 and exact(row['exactShortage'])==0,'feed/shortage'
   total=F(0)
   for al in row['allocations']:
    q=exact(al['exactQuantity']);assert q==F(str(al['quantity'])) and q>0;total+=q
    conditional=al['conditional'];key=('supply'if conditional else'inventory',al['supplyId']if conditional else al['lotId']);used[key]=used.get(key,F(0))+q
    if conditional:
     src=next(z for z in d['supplies']if z['供给编号']==al['supplyId']);assert JSONpolicy(d)['允许预计供给'];assert src['质量状态']in JSONpolicy(d)['预计状态'];assert minute(src['预计可用时间'])<=a,'supply before available'
     assert row['orderId']=='B';limit=sum(F(z['使用数量'])for z in d['supplyUses']if z['供给编号']==src['供给编号']and z['订单编号']==row['orderId']);assert used[key]<=limit
     capacity=F(src['预计数量'])
    else:
     src=next(z for z in d['inventory']if z['批次编号']==al['lotId']);assert src['质量状态']in JSONpolicy(d)['可用状态'];assert not src['预计可用时间']or minute(src['预计可用时间'])<=a
     capacity=F(src['账面数量'])-F(src['已占用数量'])
    assert src['物料编号']==mid and src['批次编号']==al['lotId'];assert used[key]<=capacity,'lot conservation';assert F(str(al['remaining']))>=0 and exact(al['exactRemaining'])>=0,'no negative inventory'
   assert total==amount,'allocation conservation';committed_seen.add(id(row))
 assert len(committed_seen)==len([z for z in saved if z['committed']]),'orphan committed material'
 for z in intervals.values():cap(z,F(1))
 cap(people,F(1))
 for rid,z in tools.items():cap(z,F(next(g['可用数量']for g in raw['05']if g['资源编号']==rid)))
 return dict(tasks=len(tasks),person_minutes=str(sum((b-a)*q for a,b,q in people)),projected_used={str(k):str(v)for k,v in used.items()})
def JSONpolicy(d):return json.loads(next(r['参数JSON']for r in d['rules']if r['规则编号']=='MATERIAL'))

for name in ['core','insufficient','gap01','supply-denied','delayed240','pending-stock','labor-start200','tool-start200','calendar-start200']:
 x=json.loads((E/f'api/{name}.json').read_text());complete=name not in ['insufficient','gap01','supply-denied','pending-stock'];v=validate(x['plan'],x['input']['executionData'],complete);check('API_'+name,v);assert x['stockBefore']==x['stockAfter'],'physical input inventory changed'
 if name=='gap01':
  r=next(r for r in x['plan']['materialDemands']if r['orderId']=='B'and r['materialId']=='LEAN');assert exact(r['exactShortage'])==F('0.1')and not r['committed'];assert set(t['orderId']for t in x['plan']['tasks'])=={'A'}
 if name=='pending-stock':assert set(t['orderId']for t in x['plan']['tasks'])=={'B'}
 if name=='delayed240':assert next(t['start']for t in x['plan']['tasks']if t['id']=='B-MIX')>=240
check('INPUT_STOCK_IMMUTABLE','9 Worker cases: projected plan allocation only; physical input stock unchanged')
b=json.loads((E/'api/boundary.json').read_text());assert next(r for r in b['at179']if r['materialId']=='LEAN')['shortage']==162.5;assert all(r['shortage']==0 for r in b['at180']);check('ACTUAL_ALLOCATOR_BOUNDARY','179 rejected/180 eligible after A consumed; independently matches CSV rational stock equation')
core=json.loads((E/'api/core.json').read_text());p=core['plan'];d=core['input']['executionData']
alt=copy.deepcopy(p)
# Shift the whole valid plan later by60: legal different order/times, not screenshot equality.
for t in alt['tasks']:t['start']+=60;t['end']+=60
for r in alt['resourceReservations']:r['start']+=60;r['end']+=60
for r in alt['materialDemands']:r['feedMinute']+=60
validate(alt,d);check('ALTERNATIVE_LEGAL_SCHEDULE','whole plan+60 accepted; reference not sole legal plan')
for name in ['before180','missingtask','machine','BOM','doubleallocation','personnel']:
 m=copy.deepcopy(p)
 if name=='before180':
  t=next(t for t in m['tasks']if t['id']=='B-MIX');t['start']=179;t['end']=209
  for r in m['resourceReservations']:
   if 'B-MIX'in r['taskIds']:r['start']-=1;r['end']-=1
  for r in m['materialDemands']:
   if r['taskId']=='B-MIX':r['feedMinute']=179
 if name=='missingtask':m['tasks'].pop()
 if name=='machine':m['tasks'][0]['machine']='MIX02'
 if name=='BOM':m['materialDemands'][0]['quantity']=162.4
 if name=='doubleallocation':m['materialDemands'][0]['allocations'].append(copy.deepcopy(m['materialDemands'][0]['allocations'][0]))
 if name=='personnel':next(r for r in m['resourceReservations']if r['type']=='人员')['quantity']='2'
 try:validate(m,d)
 except (AssertionError,KeyError,StopIteration)as e:check('ORACLE_REJECT_'+name,str(e))
 else:raise AssertionError('mutation accepted '+name)
if (E/'ui/legal-result.json').exists():
 u=json.loads((E/'ui/legal-result.json').read_text());check('UI_WORKER_FULL',validate(u['plan'],u['input']['executionData']))
 v=json.loads((E/'ui/delayed240-result.json').read_text());check('UI_DELAY240',validate(v['plan'],v['input']['executionData']));assert next(t['start']for t in v['plan']['tasks']if t['id']=='B-MIX')==240
 assert (E/'ui/native-plan.csv').read_bytes()==(E/'ui/history-native-plan.csv').read_bytes();rows=list(csv.reader((E/'ui/native-plan.csv').read_text(encoding='utf-8-sig').splitlines()));decoded=[]
 for row in rows:
  for cell in row:
   if cell.startswith('['):
    try:val=json.loads(cell)
    except Exception:continue
    if isinstance(val,list):decoded.extend(x for x in val if isinstance(x,dict)and 'materialId'in x)
 assert sum(1 for x in decoded if x.get('materialId')=='LEAN')==2
 assert sum(exact(x['exactQuantity'])for x in decoded if x.get('materialId')=='LEAN')==325
 check('NATIVE_EXPORT_CONSERVATION','2 lean demands162.5+162.5=325; historical native bytes unchanged')
 out=json.loads((E/'ui/browser-results.json').read_text());assert out['complete']and not out['errors'];check('BROWSER_COMPLETE',len(out['checks']))
(E/'oracle-results.json').write_text(json.dumps({'scope':'source-derived task oracle, not QA UAT','checks':checks,'complete':True},ensure_ascii=False,indent=2));print(json.dumps({'PASS':len(checks),'FAIL':0}))
