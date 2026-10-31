from pathlib import Path
import csv,io,json,hashlib,itertools,copy
p=Path('temp/uat07-joint');root=p/'runtime-build/fixtures/originals/UAT-07'
def rows(n):return list(csv.DictReader(io.StringIO(next(root.glob(n+'_*')).read_text(encoding='utf-8-sig'))))
resources=rows('05');deps=rows('12');orders=rows('17');routes=rows('10');times=rows('11');calendar=rows('02');machines=rows('03');enabled=[r['规则编号']for r in rows('16')if r['是否启用']=='是'];assert set(enabled)=={'MACHINE','PRECEDENCE','CALENDAR','MOLD'}
cap={r['资源编号']:int(r['可用数量'])for r in resources};assert cap['G01']==1 and cap['T01']==3
expected={o['订单编号']+'-'+r['工序编号']for o in orders for r in routes if r['产品编号']==o['产品编号']}
def check(tasks,capacities=cap):
 errors=[];reservations=[];actual={t['id']for t in tasks}
 if actual!=expected or len(tasks)!=len(expected):errors+=['incomplete or duplicate task coverage']
 for t in tasks:
  if t['id']not in expected:errors+=['unexpected task'];continue
  oid,op=t['id'].split('-');o=next(o for o in orders if o['订单编号']==oid);route=next(r for r in routes if r['产品编号']==o['产品编号']and r['工序编号']==op);duration=int(next(r for r in times if r['产品编号']==o['产品编号']and r['工序编号']==op)['固定分钟']);dev=next(r for r in deps if r['订单编号']==oid and r['工序编号']==op and r['资源类型']=='设备');m=next(r for r in machines if r['设备编号']==dev['资源编号'])
  if t['end']-t['start']!=duration:errors+=['duration '+t['id']]
  if t.get('machine',dev['资源编号'])!=dev['资源编号']:errors+=['machine '+t['id']]
  if t['end']>int(o['要求可交付分钟']):errors+=['deadline '+t['id']]
  if not any(r['日历编号']==m['日历编号']and r['是否工作']=='是'and int(r['起始分钟'])<=t['start']and t['end']<=int(r['结束分钟'])for r in calendar):errors+=['calendar '+t['id']]
  prior=next((x for x in tasks if x['id']==oid+'-'+route['前序工序']),None)if route['前序工序']else None
  if route['前序工序']and(not prior or prior['end']>t['start']):errors+=['precedence '+t['id']]
  for r in deps:
   if r['订单编号']==oid and r['工序编号']==op and r['资源类型']in ['模具','工具']:
    s=next(x for x in resources if x['资源编号']==r['资源编号']);reservation={'taskId':t['id'],'resourceId':r['资源编号'],'quantity':int(r['需求数量']),'start':t['start']-int(r['提前占用分钟']),'end':t['end']+int(r['后延占用分钟'])};reservations.append(reservation)
    if reservation['start']<int(s['最早可用分钟'])or reservation['end']>int(s['最晚可用分钟']):errors+=['tool availability '+t['id']]
    if not any(r['日历编号']==m['日历编号']and r['是否工作']=='是'and int(r['起始分钟'])<=reservation['start']and reservation['end']<=int(r['结束分钟'])for r in calendar):errors+=['extended calendar '+t['id']]
 for a,b in itertools.combinations(tasks,2):
  if a.get('machine')and a.get('machine')==b.get('machine')and a['start']<b['end']and b['start']<a['end']:errors+=['machine overlap']
 sweep={}
 for rid,c in capacities.items():
  rr=[r for r in reservations if r['resourceId']==rid];points=sorted({x for r in rr for x in [r['start'],r['end']]});sweep[rid]=[]
  for a,b in zip(points,points[1:]):
   used=sum(r['quantity']for r in rr if r['start']<=a<r['end']);sweep[rid].append({'start':a,'end':b,'used':used,'capacity':c})
   if used>c:errors+=['capacity '+rid+' at '+str(a)]
 return {'errors':errors,'completeCoverage':actual==expected and len(tasks)==len(expected),'expectedTaskIds':sorted(expected),'reservations':reservations,'sweeps':sweep}
actual=json.load(open(p/'selftest/positive-result.json'))['plan']['tasks'];a=check(actual);assert a['errors']==[]
legal=[{'id':'A-MIX','start':0,'end':30},{'id':'A-FILL','start':30,'end':60},{'id':'B-MIX','start':15,'end':45},{'id':'B-FILL','start':70,'end':100}]
assert check(legal)['errors']==[]
early=[{**t,'start':69,'end':99}if t['id']=='B-FILL'else t for t in legal];assert any('capacity G01'in e for e in check(early)['errors'])
alternative=[{'id':'B-MIX','start':0,'end':30},{'id':'B-FILL','start':30,'end':60},{'id':'A-MIX','start':15,'end':45},{'id':'A-FILL','start':60,'end':90}];assert check(alternative)['errors']==[]
mutations={'missing':actual[:-1],'wrongMachine':[{**t,'machine':'WRONG'}if t['id']=='A-FILL'else t for t in actual],'precedence':[{**t,'start':0,'end':30}if t['id']=='A-FILL'else t for t in actual],'calendar':[{**t,'start':-30,'end':0}if t['id']=='A-MIX'else t for t in actual]};results={k:check(v)for k,v in mutations.items()};assert all(v['errors']for v in results.values())
hashes={f.name:hashlib.sha256(f.read_bytes()).hexdigest()for f in root.iterdir()if f.is_file()};assert all(f.read_bytes()==(Path('temp/hp04-n06/inputs/raw-b2/UAT-07')/f.name).read_bytes()for f in root.iterdir()if f.is_file())
result={'source':'standalone Python literal CSV integer arithmetic; no planner/allocator/checker import','productSha':json.load(open(p/'selftest/browser.json'))['productSha'],'sourceHashes':hashes,'enabledRules':enabled,'actual':a,'exactBoundary':{'09:09':check(early),'09:10':check(legal),'returnArithmetic':'08:00+60+10=09:10; half-open endpoint reusable'},'alternativeCompleteLegalOrder':check(alternative),'mutations':results}
variants=p/'selftest/config-variants.json'
if variants.exists():
 v=json.loads(variants.read_text());two=check(v['two']['plan']['tasks'],{**cap,'G01':2});one=check(v['one']['plan']['tasks']);assert two['errors']==[]and one['errors']==[];result['explicitSimulationVariants']={'twoSets':two,'restoredOneSet':one}
(p/'raw-independent-oracle.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('PASS UAT07 literal arithmetic: complete actual/alternative, 69 reject/70 legal, 4 mutations reject, originals unchanged')
