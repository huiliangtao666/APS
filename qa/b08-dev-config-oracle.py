# B08 configuration impact oracle: standard-library literal arithmetic only.
from pathlib import Path
import sys,json,csv,io,hashlib,itertools
out=Path(sys.argv[1]);src=Path(sys.argv[2])
def rows(n):return list(csv.DictReader(io.StringIO(next(src.glob(n+'_*')).read_text(encoding='utf-8-sig'))))
orders=rows('17');routes=rows('10');times=rows('11');machines=rows('03');deps=rows('12');tools=rows('05');calendar=rows('02');people=rows('06')
assert {r['规则编号']for r in rows('16')if r['是否启用']=='是'}=={'MACHINE','PRECEDENCE','CALENDAR','MOLD','LABOR'}
assert [(p['人员组编号'],int(p['可用人数']))for p in people]==[('LP01',2),('LP-GENERAL',10)]
expected={o['订单编号']+'-'+r['工序编号']for o in orders for r in routes if r['产品编号']==o['产品编号']}
results=[]
for file in ['baseline.json','profile-result.json','availability-result.json']:
 x=json.load(open(out/file));plan=x['plan'];tasks=plan['tasks'];actual={t['id']for t in tasks};assert actual==expected and len(tasks)==len(expected)
 # Supplementary configuration is read from the exact frozen run, not live state.
 d=x['input']['executionData'];rr=[];pr=[]
 for t in tasks:
  oid,op=t['orderId'],t['operation'];o=next(o for o in orders if o['订单编号']==oid);route=next(r for r in routes if r['产品编号']==o['产品编号']and r['工序编号']==op)
  assert t['end']-t['start']==int(next(r for r in times if r['产品编号']==o['产品编号']and r['工序编号']==op)['固定分钟'])
  assert t['end']<=int(o['要求可交付分钟'])
  m=next(r for r in deps if r['订单编号']==oid and r['工序编号']==op and r['资源类型']=='设备');assert t['machine']==m['资源编号'];machine=next(r for r in machines if r['设备编号']==t['machine'])
  assert any(r['日历编号']==machine['日历编号']and r['是否工作']=='是'and int(r['起始分钟'])<=t['start']and t['end']<=int(r['结束分钟'])for r in calendar)
  if route['前序工序']:assert next(p for p in tasks if p['id']==oid+'-'+route['前序工序'])['end']<=t['start']
  for r in deps:
   if r['订单编号']!=oid or r['工序编号']!=op:continue
   if r['资源类型']in ['模具','工具']:
    a=t['start']-int(r['提前占用分钟']);b=t['end']+int(r['后延占用分钟']);rr.append((r['资源编号'],a,b,int(r['需求数量'])))
    literal=next(z for z in tools if z['资源编号']==r['资源编号']);assert int(literal['最早可用分钟'])<=a<b<=int(literal['最晚可用分钟'])
   if r['资源类型']=='人员':
    # UI variants keep raw demands/skills; only explicit occupation and availability change.
    config=next(z for z in d['dependencies']if z['订单编号']==oid and z['工序编号']==op and z['资源类型']=='人员技能');g=next(z for z in d['personnelGroups']if z['人员组编号']==r['资源编号'])
    assert config['需求数量']==r['需求数量'] and config['所需技能']==r['所需技能']==g['技能']
    whole=config.get('人员占用基准')=='完整工序'or config['窗口外释放']=='否'
    a=t['start']+(0 if whole else int(config['人员开始偏移']))-int(config.get('提前占用分钟')or 0);b=t['end']-(0 if whole else int(config['人员结束偏移']))+int(config.get('后延占用分钟')or 0)
    assert int(g['可用起始分钟'])<=a<b<=int(g['可用结束分钟'])
    actualpr=[z for z in plan['resourceReservations']if z['type']=='人员'and t['id']in z['taskIds']];assert len(actualpr)==1;z=actualpr[0];assert (z['start'],z['end'],int(z['quantity']))==(a,b,int(r['需求数量']))
    pr.append((g['poolId'],a,b,int(r['需求数量'])))
 for a,b in itertools.combinations(tasks,2):
  if a['machine']==b['machine']:assert a['end']<=b['start']or b['end']<=a['start']
 for occupations,capacities in [(rr,{r['资源编号']:int(r['可用数量'])for r in tools}),(pr,{r['poolId']:int(r['总人数'])for r in d['personnelPools']})]:
  for rid,capacity in capacities.items():
   relevant=[z for z in occupations if z[0]==rid];points=sorted({v for z in relevant for v in z[1:3]})
   for a,b in zip(points,points[1:]):assert sum(z[3]for z in relevant if z[1]<=a<z[2])<=capacity
 results.append({'file':file,'result':'PASS','tasks':sorted(actual),'completeCoverage':True,'physicalPoolSweeps':pr,'toolSweeps':rr,'sha256':hashlib.sha256((out/file).read_bytes()).hexdigest()})
result={'method':'Python stdlib, no product allocator/planner/checker imports; literal original05/06/10/11/12/16/17 plus explicit frozen UI configuration impact','scope':'Dev own UI profile/availability changes only; Test owns full domain boundary grid','productSha':json.load(open(out/'browser.json'))['build']['productSha'],'sourceHashes':{f.name:hashlib.sha256(f.read_bytes()).hexdigest()for f in src.iterdir()if f.is_file()},'variants':results}
(out/'config-impact-oracle.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('PASS 3 configuration variants: source-derived complete coverage, machine/calendar/precedence/tools/personnel actual windows and physical pool capacities')
