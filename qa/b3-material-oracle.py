"""Independent stdlib oracle: original CSV + Fraction + datetime, no product imports."""
import csv, io, json, hashlib, sys
from fractions import Fraction as F
from pathlib import Path
from datetime import datetime, timedelta
fixtures, evidence, browser = map(Path, sys.argv[1:4])
manifest = json.loads((fixtures / 'PROVENANCE.json').read_text())
assert manifest['seed'] == 'B3-v1' and manifest['customerFacts'] is False
checks = []
for scene, entry in manifest['scenarios'].items():
    for name, expected in entry['files'].items():
        assert hashlib.sha256((fixtures / scene / name).read_bytes()).hexdigest() == expected
checks.append({'id':'O301', 'result':'PASS', 'assertion':'all synthetic original CSV hashes match seed/version/provenance'})
def table(scene, name):
    with (fixtures / scene / name).open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))
def decoded_export(text):
    rows = list(csv.reader(io.StringIO(text.lstrip('\ufeff')))); header = next(i for i,r in enumerate(rows) if r and r[0] == '任务编号')
    records = []
    for row in rows[header+1:]:
        if len(row) < 12 or not row[11].startswith(('[','{')): continue
        try: value = json.loads(row[11])
        except ValueError: continue
        if isinstance(value, dict): value = [value]
        records.extend(v for v in value if isinstance(v,dict) and 'materialId' in v)
    return records
def frac(exact): return F(int(exact['numerator']),int(exact['denominator']))
origin = datetime.fromisoformat('2026-11-02T08:00:00+08:00')
for scene in ['UAT-09','UAT-10','UAT-05']:
    orders = table(scene, '17_生产订单与交期.csv'); products = table(scene, '07_产品与包装规格.csv'); bom = table(scene, '09_BOM与包装用量.csv'); stocks = table(scene, '09_库存批次.csv')
    order=orders[0]; product=next(p for p in products if p['产品编号']==order['产品编号']); recipe=[r for r in bom if r['产品编号']==order['产品编号'] and r['用量类型']=='BOM物料']
    assert sum(F(r['配置用量']) for r in recipe)==1000
    rate=next(r for r in recipe if r['物料编号']=='LEAN')['配置用量']; demand=F(order['合格需求']) / F(product['总收率']) * F(rate) / 1000; assert demand == F('162.5')
    valid=sorted([r for r in stocks if r['物料编号']=='LEAN' and r['质量状态']=='合格' and r['有效期']>='2026-11-02' and (not r['预计可用时间'] or datetime.fromisoformat(r['预计可用时间'])<=origin)], key=lambda r:(r['有效期'],r['批次编号']))
    net=sum(F(r['账面数量'])-F(r['已占用数量']) for r in valid); gap=max(F(0),demand-net)
    assert net == F('162.4' if scene=='UAT-10' else '162.5'); assert gap==F('0.1' if scene=='UAT-10' else '0')
    for source, text in [('api',json.loads((evidence / ('B305-'+scene+'.json')).read_text())['csv']),('ui',(browser / (scene+'-plan.csv')).read_text())]:
        records=decoded_export(text); lean=next(r for r in records if r['orderId']=='A' and r['materialId']=='LEAN')
        assert frac(lean['exactQuantity'])==demand and frac(lean['exactShortage'])==gap
        assert [a['lotId'] for a in lean['allocations']]==['B3-EARLY','B3-LATE']
        assert [frac(a['exactQuantity']) for a in lean['allocations']]==[F('100'),F('62.4' if scene=='UAT-10' else '62.5')]
        assert sum(frac(a['exactQuantity']) for a in lean['allocations'])+gap==demand
        assert all(frac(a['exactRemaining'])>=0 for a in lean['allocations'])
        assert lean['committed'] is (scene!='UAT-10'); assert {r['lotId'] for r in lean['excludedLots']}=={'B3-FROZEN','B3-EXPIRED','B3-PENDING','B3-REJECTED'}
        if scene=='UAT-05':
            supply=table(scene,'20_预计到料.csv')[0]; arrival=datetime.fromisoformat(supply['预计到达时间']); ready=datetime.fromisoformat(supply['预计可用时间']); assert arrival==origin+timedelta(minutes=120); assert ready==origin+timedelta(minutes=180); assert origin+timedelta(minutes=179)<ready
            b=next(r for r in records if r['orderId']=='B' and r['materialId']=='LEAN'); assert b['feedMinute']>=180; assert frac(b['exactShortage'])==0 and all(a['conditional'] for a in b['allocations']); assert sum(frac(a['exactQuantity']) for a in b['allocations'])==demand
        checks.append({'id':scene+'-'+source,'result':'PASS','demand':str(demand),'net':str(net),'gap':str(gap)})
bad=table('UAT-11','09_BOM与包装用量.csv'); assert sum(F(r['配置用量'])for r in bad if r['用量类型']=='BOM物料')==F('999.9')
errors=json.loads((evidence/'B304.json').read_text()); assert {'calendars','routes','dependencies','bom'} <= {i['table'] for i in errors['preview']['issues']}; assert errors['run']['status']==422
checks.append({'id':'O311','result':'PASS','assertion':'raw BOM999.9 and four error classes rejected before Worker scheduling'})
print(json.dumps({'oracle':'Python stdlib Fraction/CSV/datetime; no product imports or allocator expected outputs','checks':checks,'allPassed':True},ensure_ascii=False,indent=2))
