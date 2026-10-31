"""Independent Decimal checks over actual JSON/CSV output, without product imports."""
import csv, json, sys
from decimal import Decimal as D
from fractions import Fraction
from pathlib import Path
root=Path(sys.argv[1]);result=json.loads((root/'domain-results.json').read_text())
checks=[]
def check(name, condition):
    assert condition, name
    checks.append({'assertion':name,'result':'PASS'})
for name,book,shortage in [('positive',D('162.5'),D('0')),('negative',D('162.4'),D('0.1')),('twentyFive',D('300'),D('25'))]:
    x=result[name];o=x['input']['orders'][0];p=x['input']['products'][0]
    # Approved existing normalized only-loss formula, independently evaluated.
    demand=(D(o['合格需求'])-D(o.get('已完成合格数量','0')))/D(p['总收率'])*D('650')/D('1000')
    r=x['rows'][0];net=sum((D(b['账面数量'])-D(b['已占用数量']) for b in x['input']['inventory'] if b['物料编号']=='LEAN' and b['质量状态']=='合格' and b['有效期']>='2026-11-02' and not b.get('预计可用时间')),D(0))
    check(name+': independent net stock',net==book)
    check(name+': independent demand',D(str(r['quantity']))==demand)
    check(name+': exact shortage',Fraction(int(r['exactShortage']['numerator']),int(r['exactShortage']['denominator']))==Fraction(shortage))
    check(name+': committed iff complete',all(y['committed']==(shortage==0) for y in x['rows']))
    allocated=sum((D(str(a['quantity'])) for a in r['allocations']),D(0))
    check(name+': conservation',allocated+shortage==demand)
    check(name+': no negative remainder',all(Fraction(int(a['exactRemaining']['numerator']),int(a['exactRemaining']['denominator']))>=0 for a in r['allocations']))
check('FEFO expected identity and 100+62.5',[(a['lotId'],D(str(a['quantity']))) for a in result['positive']['rows'][0]['allocations']]==[('early',D(100)),('late',D('62.5'))])
check('arrival is not availability',result['supplyAtArrival']['ok'] is False and result['supplyAtReady']['ok'] is True)
check('supply stays conditional',result['supplyAtReady']['rows'][0]['allocations'][0]['conditional'] is True and '未确认到货' in result['supplyAtReady']['rows'][0]['allocations'][0]['source'])
check('fixed-plan check and tamper detection',result['independentCheck']==[] and len(result['tamperCheck'])>0)
with (root/'native-plan.csv').open(newline='') as f: rows=list(csv.DictReader(f))
mix=json.loads(next(r for r in rows if r['任务编号']=='A-MIX')['物料需求与批次分配（含未排）'])
check('native CSV exact source roundtrip',mix==result['positive']['rows'])
print(json.dumps({'checks':checks,'pass':len(checks),'fail':0},ensure_ascii=False,indent=2))
