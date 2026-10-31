"""Independent source CSV / Fraction / datetime oracle. No product imports."""
import csv,json,hashlib,sys
from pathlib import Path
from fractions import Fraction as F
from datetime import datetime,timedelta
fixtures,evidence,browser=map(Path,sys.argv[1:4]);manifest=json.loads((fixtures/'PROVENANCE.json').read_text())
assert manifest['seed']=='B234-20261031-v1'
for name,h in manifest['files'].items():assert hashlib.sha256((fixtures/name).read_bytes()).hexdigest()==h
origin=datetime.fromisoformat('2026-11-02T08:00:00+08:00')
def table(scene,name):
 with (fixtures/scene/name).open(encoding='utf-8-sig',newline='')as f:return list(csv.DictReader(f))
def frac(v):return F(int(v['numerator']),int(v['denominator']))
def overlap(a,b,c,d):return a<d and c<b
checks=[{'id':'O-I00','result':'PASS','assertion':'all supplementary source CSV hashes match manifest'}]
def check(scene,plan):
 orders=table(scene,'17_生产订单与交期.csv');routes=table(scene,'10_工艺路线配置.csv');times=table(scene,'11_工序工时配置.csv');machines=table(scene,'03_设备资源配置.csv');calendar=table(scene,'02_工厂工作日历.csv');stops=table(scene,'31_人员与工装停用例外.csv');down=table(scene,'04_设备停机与例外日历.csv');tools=table(scene,'18_工装配置.csv');staff=table(scene,'19_人员组与可用时间.csv');deps=table(scene,'12_工序资源与物料依赖.csv');bom=table(scene,'09_BOM与包装用量.csv');products=table(scene,'07_产品与包装规格.csv');supplies=table(scene,'20_预计到料.csv');stock=table(scene,'09_库存批次.csv');tasks=plan['tasks']
 expected={(o['订单编号'],r['工序编号'])for o in orders for r in routes if r['产品编号']==o['产品编号']};assert {(t['orderId'],t['operation'])for t in tasks}==expected and len(tasks)==len(expected)
 used={};tool_intervals=[];staff_intervals=[]
 for t in tasks:
  order=next(o for o in orders if o['订单编号']==t['orderId']);route=next(r for r in routes if r['产品编号']==order['产品编号'] and r['工序编号']==t['operation']);tm=next(r for r in times if r['产品编号']==order['产品编号'] and r['工序编号']==t['operation']);assert t['end']-t['start']==int(tm['固定分钟'])
  machine=next(m for m in machines if m['设备编号']==t['machine']);assert any(int(c['起始分钟'])<=t['start'] and t['end']<=int(c['结束分钟']) for c in calendar if c['日历编号']==machine['日历编号'] and c['是否工作']=='是')
  assert not any(overlap(t['start'],t['end'],int(s['起始分钟']),int(s['结束分钟']))for s in down if s['设备编号']==t['machine'])
  for other in tasks:
   if other['id']!=t['id'] and other['machine']==t['machine']:assert not overlap(t['start'],t['end'],other['start'],other['end'])
  if route['前序工序']:assert next(x for x in tasks if x['orderId']==t['orderId'] and x['operation']==route['前序工序'])['end']<=t['start']
  for dep in deps:
   if dep['订单编号']!=t['orderId'] or dep['工序编号']!=t['operation']:continue
   if dep['资源类型']=='模具':kind='工装';rid=dep['资源编号'];cap=next(x for x in tools if x['工装编码']==rid);start=t['start']-int(dep['提前占用分钟']);end=t['end']+int(dep['后延占用分钟']);assert int(cap['可用起始分钟'])<=start and end<=int(cap['可用结束分钟']);tool_intervals.append((rid,start,end,int(dep['需求数量'])))
   elif dep['资源类型']=='人员技能':kind='人员';rid=dep['资源编号'];cap=next(x for x in staff if x['人员组编号']==rid);start=t['start']+int(dep['人员开始偏移']);end=t['end']-int(dep['人员结束偏移']);assert dep['所需技能']==cap['技能'] and dep['所需班次']==cap['班次'];assert int(cap['可用起始分钟'])<=start and end<=int(cap['可用结束分钟']);staff_intervals.append((rid,start,end,int(dep['需求数量'])))
   else:continue
   assert not any(overlap(start,end,int(s['起始分钟']),int(s['结束分钟']))for s in stops if s['资源类型']==kind and s['资源编号']==rid)
  day=(origin+timedelta(minutes=t['start'])).date().isoformat();eligible=[r for r in bom if r['产品编号']==order['产品编号'] and r['生效日期']<=day];latest=max(r['生效日期']for r in eligible);recipe=[r for r in eligible if r['生效日期']==latest];product=next(p for p in products if p['产品编号']==order['产品编号'])
  for row in recipe:
   if row['投料工序编号']!=t['operation']:continue
   if row['用量类型']=='BOM物料':amount=F(order['合格需求'])/F(product['总收率'])*F(row['配置用量'])/1000
   else:
    amount=F(order['合格需求'])/F(product['单支净重kg'])/F(product['每袋支数'])*F(row['配置用量'])/(1-F(row['损坏比例']));amount=F(-(-amount.numerator//amount.denominator))
   saved=next(x for x in plan['materialDemands']if x['taskId']==t['id'] and x['materialId']==row['物料编号']);assert saved['committed'] and frac(saved['exactQuantity'])==amount and saved['version']==row['版本编号'] and saved['feedMinute']==t['start'];assert sum(frac(a['exactQuantity'])for a in saved['allocations'])==amount
   for a in saved['allocations']:
    source=next(x for x in (supplies if a['conditional'] else stock)if x['批次编号']==a['lotId']);ready=source['预计可用时间'];assert not ready or datetime.fromisoformat(ready)<=origin+timedelta(minutes=t['start']);key=('supply'if a['conditional']else'stock',a['lotId']);used[key]=used.get(key,F(0))+frac(a['exactQuantity']);capacity=F(source['预计数量'])if a['conditional']else F(source['账面数量'])-F(source['已占用数量']);assert used[key]<=capacity
 for intervals,resources,key,cap in [(tool_intervals,tools,'工装编码','可用数量'),(staff_intervals,staff,'人员组编号','人员数量')]:
  for r in resources:
   rs=[x for x in intervals if x[0]==r[key]];points=sorted({p for _,a,b,_ in rs for p in [a,b]})
   for m in points:assert sum(q for _,a,b,q in rs if a<=m<b)<=int(r[cap])
 return True
r=json.loads((evidence/'I01.json').read_text());assert check('joint',r['result']['plan'])
# Independent exhaustive boundary scan derives the legal lower bound from CSV.
stops=table('joint','31_人员与工装停用例外.csv');down=table('joint','04_设备停机与例外日历.csv');supply=table('joint','20_预计到料.csv')[0];ready=int((datetime.fromisoformat(supply['预计可用时间'])-origin).total_seconds()/60)
legal=[m for m in range(ready,571)if not any(overlap(m,m+30,int(s['起始分钟']),int(s['结束分钟']))for s in stops) and not any(overlap(m,m+30,int(s['起始分钟']),int(s['结束分钟']))for s in down if s['设备编号']=='MIX02')];assert min(legal)==310
checks.append({'id':'O-I01','result':'PASS','derivedEarliestJointFeed':min(legal),'allEnabledConstraints':'complete source-derived coverage/calendar/machine/tool/personnel/material checks'})
b=json.loads((browser/'result.json').read_text());assert check('joint',b['plan']);assert any('162.5' in line for line in (browser/'joint-plan.csv').read_text().splitlines());checks.append({'id':'O-I01-UI','result':'PASS','assertion':'real UI result matches source contracts; native CSV is separately parsed below'})
# Native plan export contains task-level JSON material rows, compare exact demands.
rows=list(csv.reader((browser/'joint-plan.csv').read_text(encoding='utf-8-sig').splitlines()));exports=[]
for row in rows:
 if len(row)>11 and row[11].startswith(('[','{')):
  try:entry=json.loads(row[11])
  except ValueError:continue
  exports.extend(entry if isinstance(entry,list)else[entry])
for oid in ['A','B']:
 lean=next(x for x in exports if x.get('orderId')==oid and x.get('materialId')=='LEAN');assert frac(lean['exactQuantity'])==F('162.5') and frac(lean['exactShortage'])==0
checks.append({'id':'O-I01-CSV','result':'PASS','assertion':'native export exact material allocations conserved'})
r=json.loads((evidence/'I03.json').read_text());assert check('next-day-bom',r['result']['plan']);checks.append({'id':'O-I03','result':'PASS','assertion':'actual feed day uses effective BOM, exact160 vs162.5'})
r=json.loads((evidence/'I02.json').read_text());assert all(x['orderId']=='A'for x in r['result']['plan']['tasks']);assert all(not x['committed']for x in r['result']['plan']['materialDemands']if x['orderId']=='B');checks.append({'id':'O-I02','result':'PASS','assertion':'horizon refusal has no committed B allocation'})
print(json.dumps({'oracle':'independent Python CSV/Fraction/datetime/interval scan; no product code imports','checks':checks,'allPassed':True},indent=2))
