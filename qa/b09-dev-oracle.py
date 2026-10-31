"""File-only expected-value checks; imports no APS calculation or validation code."""
from pathlib import Path
from fractions import Fraction as F
import hashlib,json,sys
p=Path(sys.argv[1]);checks=[]
def exact(v):return F(int(v['numerator']),int(v['denominator']))
def check(label,condition):
    assert condition,label
    checks.append({'id':label,'result':'PASS'})
def load(name):return json.loads((p/name).read_text())
for name,stock,gap,count in [('UAT09-result.json','162.5','0',2),('UAT10-result.json','162.4','0.1',0),('AC10-explicit25kg.json','300','25',0)]:
    x=load(name);plan=x['plan'];row=next(r for r in plan['materialDemands'] if r['materialId']=='LEAN')
    qty=F(240 if count or gap=='0.1' else 480)/F('0.96')*F(650)/1000
    check(name+' independent demand',exact(row['exactQuantity'])==qty)
    check(name+' independent net deficit',qty-F(stock)==F(gap)==exact(row['exactShortage']))
    check(name+' coverage/unplanned',len(plan['tasks'])==count and (count or len(plan['resultAssessment']['tasks'])==2))
    check(name+' no negative stock',all(exact(a['exactRemaining'])>=0 for r in plan['materialDemands'] for a in r['allocations']))
    check(name+' all six constraint families enabled',{'MACHINE','PRECEDENCE','CALENDAR','MOLD','LABOR','MATERIAL'}<=set(x['snapshot']['conditions']['enabledRuleIds']))
x=load('UAT09-result.json');tasks=x['plan']['tasks'];d=x['snapshot']['originalInput']
for t in tasks:
    check(t['id']+' bounded positive duration',t['end']-t['start']==30 and 0<=t['start']<t['end']<=600)
    machine=next(m for m in d['machines']if m['设备编号']==t['machine'])
    windows=[r for r in d['calendars']if r['日历编号']==machine['日历编号']]
    check(t['id']+' explicit calendar',any(int(w['起始分钟'])<=t['start']and t['end']<=int(w['结束分钟'])for w in windows))
    if t['predecessor']:check(t['id']+' precedence',next(a for a in tasks if a['id']==t['predecessor'])['end']<=t['start'])
    for u in tasks:
        if u['id']!=t['id'] and u['machine']==t['machine']:check(t['id']+'/'+u['id']+' machine no overlap',t['end']<=u['start'] or u['end']<=t['start'])
for r in x['plan']['resourceReservations']:
    check(r['id'] if 'id' in r else str(len(checks))+' resource legal',0<=r['start']<r['end']<=600 and F(str(r['quantity']))<=2)
for n,minimum in [('expected-ready180.json',180),('expected-ready240.json',240)]:
    x=load(n);task=next(t for t in x['plan']['tasks'] if t['id']=='B-MIX');row=next(r for r in x['plan']['materialDemands'] if r['taskId']=='B-MIX' and r['materialId']=='LEAN')
    check(n+' arrival is not ready',task['start']>=minimum and row['feedMinute']==task['start'] and all(a['conditional'] for a in row['allocations']))
x=load('edited-independent-bom160.json');row=next(r for r in x['plan']['materialDemands'] if r['materialId']=='LEAN')
check('changed normalized quantity independent of literal original09',exact(row['exactQuantity'])==F(240)/F('.96')*F(640)/1000==160 and x['snapshot']['originalInput']['originalBom'][0]['定额']=='650')
report={'kind':'independent file-only Fraction oracle, no product imports','checks':checks,'passed':len(checks),'files':{f.name:hashlib.sha256(f.read_bytes()).hexdigest()for f in p.iterdir()if f.is_file()and f.suffix in ['.json','.csv']}}
(p/'independent-oracle.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('PASS',len(checks),'independent assertions')
