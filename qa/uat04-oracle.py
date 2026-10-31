"""Independent source-derived UAT04 oracle; stdlib only, no product imports."""
from pathlib import Path
from fractions import Fraction as F
import csv, json, hashlib, copy, sys
rawroot, evidence = map(Path, sys.argv[1:3])
def read(n):
    p=next(rawroot.glob(n+'_*.csv'))
    return list(csv.DictReader(p.read_text(encoding='utf-8-sig').splitlines()))
raw={n:read(n) for n in ['01','02','03','04','05','06','10','11','12','16','17']}
checks=[]
def ok(id, actual): checks.append(dict(id=id,status='PASS',actual=actual))
def demand_at(rows, cap):
    points=sorted({v for a,b,q in rows for v in [a,b]})
    vals=[(a,b,sum(q for x,y,q in rows if x<=a<y)) for a,b in zip(points,points[1:])]
    assert all(q<=cap for a,b,q in vals), str((rows,cap,vals))
    return vals
def validate(plan, data, complete=True):
    tasks={t['id']:t for t in plan['tasks']}
    expected={o['订单编号']+'-'+r['工序编号']:(o,r) for o in raw['17'] for r in raw['10'] if o['产品编号']==r['产品编号']}
    if complete: assert set(tasks)==set(expected), 'task coverage'
    allpeople=[];tools={}; person_minutes=F(0)
    reservations=plan['resourceReservations']
    for tid,t in tasks.items():
        o,route=expected[tid];op=route['工序编号'];start,end=F(str(t['start'])),F(str(t['end']))
        duration=next(F(r['固定分钟']) for r in raw['11'] if r['产品编号']==o['产品编号'] and r['工序编号']==op)
        assert end-start==duration and start>=0 and end<=600, 'duration/horizon'
        prereq=route['前序工序']
        if prereq: assert F(str(tasks[o['订单编号']+'-'+prereq]['end']))<=start, 'precedence'
        deps=[r for r in raw['12'] if r['订单编号']==o['订单编号'] and r['工序编号']==op]
        machine=next(r['资源编号'] for r in deps if r['资源类型']=='设备')
        assert t['machine']==machine, 'source machine'
        m=next(r for r in raw['03'] if r['设备编号']==machine)
        assert any(F(c['起始分钟'])<=start and end<=F(c['结束分钟']) for c in raw['02'] if c['日历编号']==m['日历编号'] and c['是否工作']=='是'), 'calendar'
        assert all(end<=F(d['起始分钟']) or F(d['结束分钟'])<=start for d in raw['04'] if d['设备编号']==machine), 'downtime'
        pd=next(r for r in deps if r['资源类型']=='人员')
        # Source identity/skill/count is independently checked against the frozen explicit configuration.
        configured=next(r for r in data['dependencies'] if r['订单编号']==o['订单编号'] and r['工序编号']==op and r['资源类型']=='人员技能')
        assert configured['资源编号']==pd['资源编号'] and configured['所需技能']==pd['所需技能']
        g=next(r for r in data['personnelGroups'] if r['人员组编号']==pd['资源编号'])
        original_group=next(r for r in raw['06'] if r['人员组编号']==g['人员组编号'])
        assert F(g['人员数量'])==F(original_group['可用人数'])==1
        pool=next(r for r in data['personnelPools'] if r['poolId']==g['poolId'])
        assert F(pool['总人数'])==1, 'unique physical pool cap'
        assert pd['所需技能'] in g['技能'].split('|') and g['班次']==configured['所需班次'], 'skill and shift'
        extended=bool(configured.get('人员占用基准'))
        pre=F(configured['提前占用分钟'] or '0') if extended else F(0)
        post=F(configured['后延占用分钟'] or '0') if extended else F(0)
        a,b=start-pre,end+post
        assert F(g['可用起始分钟'])<=a<b<=F(g['可用结束分钟']), 'entire actual personnel interval'
        assert any(F(c['起始分钟'])<=a and b<=F(c['结束分钟']) for c in raw['02'] if c['是否工作']=='是'), 'personnel factory shift'
        q=F(configured['需求数量']); assert q==F(pd['需求数量']), 'source count'
        rr=[r for r in reservations if r['type']=='人员' and tid in r.get('taskIds',[r.get('taskId')])]
        assert len(rr)==1 and rr[0]['resourceId']==g['人员组编号'], 'personnel complete exactly once'
        assert (F(str(rr[0]['start'])),F(str(rr[0]['end'])),F(rr[0]['quantity']))==(a,b,q), 'source-derived actual endpoints/count'
        if extended:
            pol=rr[0]['occupationPolicies']; assert len(pol)==1
            assert pol[0]['source']==configured['人员配置来源'] and pol[0]['version']==configured['人员配置版本'] and pol[0]['order']==configured['人员检查顺序']
        allpeople.append((a,b,q));person_minutes+=(b-a)*q
        for r in deps:
            if r['资源类型'] not in ['工具','模具']:continue
            rid=r['资源编号'];a,b=start-F(r['提前占用分钟']),end+F(r['后延占用分钟']);quantity=F(r['需求数量'])
            source=next(g for g in raw['05'] if g['资源编号']==rid)
            assert F(source['最早可用分钟'])<=a<b<=F(source['最晚可用分钟'])
            rr=[x for x in reservations if x['type']=='工装' and x['resourceId']==rid and tid in x.get('taskIds',[x.get('taskId')])]
            assert len(rr)==1 and (F(str(rr[0]['start'])),F(str(rr[0]['end'])),F(rr[0]['quantity']))==(a,b,quantity)
            tools.setdefault(rid,[]).append((a,b,quantity))
    people=demand_at(allpeople,F(1))
    for rid,intervals in tools.items(): demand_at(intervals,next(F(g['可用数量']) for g in raw['05'] if g['资源编号']==rid))
    for m in {t['machine'] for t in tasks.values()}:demand_at([(F(str(t['start'])),F(str(t['end'])),F(1)) for t in tasks.values() if t['machine']==m],F(1))
    return dict(taskCount=len(tasks),personMinutes=str(person_minutes),peak=max([q for a,b,q in people],default=F(0)),intervals=[[str(a),str(b),str(q)] for a,b,q in people])

ui=json.loads((evidence/'ui/legal-result.json').read_text());core=json.loads((evidence/'api/core.json').read_text())
for name,x in [('ui-core',ui),('api-core',core)]:
    data=x['input']['executionData'];r=validate(x['plan'],data);ok(name,r)
    assert r['personMinutes']=='120' and r['peak']==1
    assert all(F(o['合格需求kg'])==F(next(z['合格需求'] for z in data['orders'] if z['订单编号']==o['订单编号'])) for o in raw['17'])
    ok(name+'-quantity-coverage','A240kg/B240kg; each MIX/FILL complete')
for name in ['later-shift','hp04-expand-first','hp04-check-first']:
    x=json.loads((evidence/('api/'+name+'.json')).read_text());r=validate(x['plan'],x['input']['executionData']);ok(name,r)
    if name=='later-shift': assert min(t['start'] for t in x['plan']['tasks'])>=60
    else: assert r['personMinutes']=='180'
for name in ['demand2','wrong-skill','wrong-shift','hp04-post-shift']:
    x=json.loads((evidence/('api/'+name+'.json')).read_text());assert not x['plan']['tasks']
    assessment=x['plan']['resultAssessment'];assert assessment['unplannedCount']==4
    assert all(t['status']!='scheduled' and t.get('reasons') for t in assessment['tasks'])
    d=x['mutatedInput'];g=next(g for g in d['personnelGroups'] if g['人员组编号']=='LP01')
    if name=='demand2': assert all(F(r['需求数量'])==2 for r in d['dependencies'] if r['资源类型']=='人员技能') and F(g['人员数量'])==1
    if name=='wrong-skill':assert g['技能']!='综合操作'
    if name=='wrong-shift':assert g['班次']!='QA整窗'
    if name=='hp04-post-shift':assert F(g['可用结束分钟'])==35 and 30+5+10>35
    ok(name,'4 explicitly unplanned; enabled constraints not silently ignored')
frozen=ui['frozen'];source=next(rawroot.glob('12_*.csv')).read_bytes();assert frozen['csvSources']['originalDependencies']['sha256']==hashlib.sha256(source).hexdigest()
assert frozen['csvSources']['originalDependencies']['originalText'].encode()==source
assert ui['input']['originalInput']['originalDependencies']==raw['12']
ok('original12-frozen-source-hash','literal bytes and rows match independently read source')
# A different complete legal arrangement must be accepted; never require the reference sequence.
alt=copy.deepcopy(core['plan']); slots={'B-MIX':15,'B-FILL':45,'A-MIX':75,'A-FILL':105}
for t in alt['tasks']:
    delta=slots[t['id']]-t['start'];t['start']+=delta;t['end']+=delta
    for r in alt['resourceReservations']:
        if t['id'] in r.get('taskIds',[r.get('taskId')]):r['start']+=delta;r['end']+=delta
validate(alt,core['input']['executionData']);ok('different-legal-arrangement-accepted',slots)
mutations=[]
for name in ['missing-task','overlap','duration','wrong-machine','shortened-ledger','wrong-count']:
    p=copy.deepcopy(core['plan']);t=p['tasks'][2]
    if name=='missing-task':p['tasks'].pop()
    if name=='overlap':
        delta=15-t['start'];t['start']+=delta;t['end']+=delta
        for r in p['resourceReservations']:
            if t['id'] in r.get('taskIds',[r.get('taskId')]):r['start']+=delta;r['end']+=delta
    if name=='duration':t['end']+=1
    if name=='wrong-machine':t['machine']='MIX01'
    if name=='shortened-ledger':next(r for r in p['resourceReservations'] if r['type']=='人员')['end']-=1
    if name=='wrong-count':next(r for r in p['resourceReservations'] if r['type']=='人员')['quantity']='0'
    try:validate(p,core['input']['executionData'])
    except (AssertionError,KeyError):mutations.append(name)
    else:raise AssertionError('oracle failed to reject '+name)
ok('oracle-mutation-controls',mutations)
hp=json.loads((evidence/'api/hp04-expand-first.json').read_text());bad=copy.deepcopy(hp['plan'])
for r in bad['resourceReservations']:
    if r['type']=='人员':
        t=next(t for t in bad['tasks'] if t['id']==r['taskId']);r['start']=t['start'];r['end']=t['end']
try:validate(bad,hp['input']['executionData'])
except AssertionError:ok('hp04-pre-post-shortening-rejected','cannot truncate ledger to the visible machine task')
else:raise AssertionError('truncated actual H-P04 interval accepted')
# Parse actual browser-native CSV with Python csv/JSON, rather than text matching.
native=list(csv.reader((evidence/'ui/native-resources.csv').read_text(encoding='utf-8-sig').splitlines()))
source_meta=json.loads(next(r[1] for r in native if r[0]=='来源'))
assert source_meta['runId']==ui['run']['id'] and source_meta['snapshotHash']==ui['run']['snapshotHash']
resources=[json.loads(r[1]) for r in native if r[0]=='resources']
person=next(r for r in resources if r.get('id')=='LP01');physical=next(r for r in resources if r.get('id')=='POOL-LP01')
for r in [person,physical]: assert F(str(r['peak']['value']))==1 and F(str(r['quantityMinutes']['value']))==120 and F(str(r['capacity']))==1
assert {(r['taskId'],r['start'],r['end']) for r in person['reservations']}=={(t['id'],t['start'],t['end']) for t in ui['plan']['tasks']}
bindings=[json.loads(r[1]) for r in native if r[0]=='original12'];assert len(bindings)==len(raw['12'])
assert all(b['sourceSha256']==hashlib.sha256(source).hexdigest() for b in bindings)
assert [b['sourceRecord'] for b in bindings]==raw['12']
planrows=list(csv.reader((evidence/'ui/native-plan.csv').read_text(encoding='utf-8-sig').splitlines()))
idx=next(i for i,r in enumerate(planrows) if r[0]=='任务编号');headers=planrows[idx];tasks=[dict(zip(headers,r)) for r in planrows[idx+1:idx+5]]
assert {(r['任务编号'],F(r['开始分钟']),F(r['结束分钟'])) for r in tasks}=={(t['id'],F(str(t['start'])),F(str(t['end']))) for t in ui['plan']['tasks']}
assert (evidence/'ui/native-resources.csv').read_bytes()==(evidence/'ui/history-native-resources.csv').read_bytes()
ok('native-plan-resources-source-and-history','parsed tasks, personnel/group/pool 1/120, all20 original12 source records/hash, history byte equality')
diag=evidence/'ui-diagnostic/diagnostic-checked.json'
diagnostic=json.loads((diag if diag.exists() else evidence/'ui/diagnostic-checked.json').read_text())
try:validate(diagnostic,ui['input']['executionData'])
except AssertionError:ok('diagnostic-independent-repro','injected B-MIX15..45 overlaps LP01 at15..30 and30..45; not a Worker outcome')
else:raise AssertionError('illegal AC17 diagnostic accepted')
# Explicitly reconstruct shared-minute half-open occupancy independent of saved ledger.
assert demand_at([(F(0),F(30),F(1)),(F(30),F(60),F(1))],F(1))[-1][2]==1
ok('half-open-shared-minute','release30/reacquire30: demand1, not2')
result={'scope':'UAT04 task-level only','checks':checks,'count':len(checks),'productImports':0}
(evidence/'independent-oracle.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str))
print(json.dumps(result,ensure_ascii=False,default=str))
