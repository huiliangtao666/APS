"""Independent csv/Decimal/datetime oracle. No product parser or scheduler imported."""
import csv,json,hashlib,os
from decimal import Decimal
from datetime import datetime,timedelta,timezone
from pathlib import Path
root=Path(os.environ.get('B1_STAGE_EVIDENCE','temp/b1-stage'));e=root/'evidence';results=[]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def record(id,expected,actual,files):results.append(dict(id=id,result='PASS',expected=expected,actual=actual,evidence=[dict(path=str(p.relative_to(root)),sha256=digest(p)) for p in files]))
for op in sorted(e.glob('*-oracle.json')):
 d=json.loads(op.read_text());p=e/(d['key']+'-filtered.csv');rows=list(csv.DictReader(p.open(encoding='utf-8-sig',newline='')));assert len(rows)==len(d['expectedRows'])
 for actual,expected in zip(rows,d['expectedRows']):
  for f in d['fields']:
   rendered='无附加参数' if f=='参数JSON' and json.loads(expected.get(f) or '{}')=={} else expected.get(f,'')
   assert actual[f]==rendered,(d['key'],f,actual[f],rendered)
  assert actual['模拟说明'].startswith('模拟数据');assert actual['查询输入版本']=='0';assert actual['关联方案编号']=='未选择';assert '08:00:00+08:00' in actual['分钟基准']
 record('CSV-EXACT-'+d['key'],'UI filter count and every exported field equal independently supplied input; explicit simulation/time/version/plan context',{'rows':len(rows),'fields':len(d['fields']),'numericUnitTimeFields':[f for f in d['fields'] if any(s in f for s in ['数量','单位','分钟','kg','时区','编号'])]},[op,p])
# A distinct AC26 consistency assertion over immutable QA artifacts: no UAT scenario is re-executed.
for scene in ['UAT-01','UAT-02']:
 q=root/'prior/qa';jp=q/'live'/(scene+'-run-plan.json');cp=q/'live'/(scene+'-plan.csv');d=json.loads(jp.read_text());plan=d['plan'];run=d['run'];raw=q/'inputs'/scene/'17_生产订单与交期.csv';orders={r['订单编号']:r for r in csv.DictReader(raw.open(encoding='utf-8-sig',newline=''))};rows=list(csv.reader(cp.open(encoding='utf-8-sig',newline='')));report=json.loads(next(r[1] for r in rows if r and r[0]=='结果报告'));assert report==plan['resultAssessment']
 for item in report['orders']:assert Decimal(str(item['remainingQuantity']))==Decimal(orders[item['orderId']]['合格需求kg']);assert item['unit']=='kg'
 for item in report['tasks']:assert Decimal(str(item['quantity']))==Decimal(orders[item['orderId']]['合格需求kg']);assert item['unit']=='kg'
 header=next(r for r in rows if r and r[0]=='任务编号');i=rows.index(header);taskrows={r[0]:dict(zip(header,r)) for r in rows[i+1:i+1+len(plan['tasks'])]};origin=datetime.fromisoformat('2026-11-02T08:00:00+08:00')
 for task in plan['tasks']:
  r=taskrows[task['id']]
  for field,key in [('开始分钟','start'),('结束分钟','end'),('工时分钟','duration')]:assert Decimal(r[field])==Decimal(str(task[key]))
  assert r['设备编号']==task['machine'];item=next(x for x in report['tasks'] if x['id']==task['id']);assert datetime.fromisoformat(item['startAt'].replace('Z','+00:00'))==origin+timedelta(minutes=task['start']);assert datetime.fromisoformat(item['endAt'].replace('Z','+00:00'))==origin+timedelta(minutes=task['end'])
 conditions=json.loads(next(r[1] for r in rows if r and r[0]=='计算条件'));assert conditions['lineId']=='L01';assert conditions==run['conditions'];assert plan['inputVersionId']==run['inputVersionId'];assert all(r['产线编号']=='L01' for r in orders.values())
 record('AC26-QUANTITY-UNIT-PLAN-'+scene,'raw order quantity/unit equals per-order and per-task saved assessment; no cross-operation sum; native CSV equals saved plan/minute timezone/line/input context',{'orderQuantityUnit':[[x['orderId'],x['remainingQuantity'],x['unit']] for x in report['orders']],'taskCount':len(report['tasks']),'origin':origin.isoformat(),'planId':plan['id'],'runId':run['id'],'mode':'new artifact-consistency assertion only; no scenario rerun'},[jp,cp,raw])
(e/'independent-oracle-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print('independent distinct assertions',len(results),'PASS')
