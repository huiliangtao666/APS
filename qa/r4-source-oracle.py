#!/usr/bin/env python3
"""Independent stdlib source oracle: CSV + Fraction + interval events only.
No product imports, no planner, proposal, material allocator or saved checker status.
Usage: python3 qa/r4-source-oracle.py EVIDENCE_DIR [BROWSER_DIR]
"""
import csv, datetime as dt, fractions, hashlib, io, json, math, pathlib, sys
F = fractions.Fraction
ORIGIN = dt.datetime(2026,11,2,8,tzinfo=dt.timezone(dt.timedelta(hours=8)))
FILES = {'products':'07_产品与包装规格.csv','orders':'17_生产订单与交期.csv','routes':'10_工艺路线配置.csv','times':'11_工序工时配置.csv','machines':'03_设备资源配置.csv','dependencies':'12_工序资源与物料依赖.csv','bom':'09_BOM与包装用量.csv','inventory':'09_库存批次.csv','supplies':'20_预计到料.csv','supplyDelays':'21_延期模拟记录.csv','supplyUses':'22_计划供给引用.csv','resourceClaims':'23_资源占用声明.csv','tools':'18_工装配置.csv','batchResources':'15_空间与组批规则配置.csv','calendars':'02_工厂工作日历.csv','downtime':'04_设备停机与例外日历.csv','resourceStops':'31_人员与工装停用例外.csv','personnelGroups':'19_人员组与可用时间.csv','personnelPools':'30_物理人员池.csv','rules':'16_排程规则配置.csv'}
def exact(x): return F(int(x['numerator']),int(x['denominator']))
def one(rows):
    assert len(rows)==1, ('expected unique',rows)
    return rows[0]
def ident(*args): return json.dumps(list(args),ensure_ascii=False,separators=(',',':'))
def date(minute): return (ORIGIN+dt.timedelta(minutes=minute)).date().isoformat()
def instant(raw): return dt.datetime.fromisoformat(raw.replace('Z','+00:00'))
def recipe(d,pid,minute):
    rows=[r for r in d['bom'] if r['产品编号']==pid and r['生效日期']<=date(minute)]
    day=max(r['生效日期'] for r in rows); version=one(list({r['版本编号'] for r in rows if r['生效日期']==day}))
    return [r for r in rows if r['版本编号']==version]
def sweep(rows,cap):
    for point in sorted({p for r in rows for p in [r['start'],r['end']]}):
        assert sum((F(str(r['quantity'])) for r in rows if r['start']<=point<r['end']),F())<=cap,('capacity',point,cap,rows)
def calendar(d,task,kind,rid,start,end):
    machine=one([m for m in d['machines'] if m['设备编号']==task['machine']]);cid=machine['日历编号'] or one(list({r['日历编号'] for r in d['calendars']}))
    assert any(r['日历编号']==cid and r['是否工作']=='是' and int(r['起始分钟'])<=start and end<=int(r['结束分钟']) for r in d['calendars']),('single window',task['id'],kind,start,end)
    off=[r for r in d['calendars'] if r['日历编号']==cid and r['是否工作']!='是']+[r for r in d['resourceStops'] if r['资源类型']==kind and r['资源编号']==rid]
    if kind=='设备':off += [r for r in d['downtime'] if r['设备编号']==rid]
    assert not any(int(r['起始分钟'])<end and start<int(r['结束分钟']) for r in off),('exception',task['id'],kind,start,end)
def check(d,p,complete=True):
    tasks=p['tasks'];byid={t['id']:t for t in tasks};assert len(byid)==len(tasks)
    expected={};groups={};missing=[];source=d
    for o in d['orders']:
        if o['需求类型']!='正式订单' or o['订单状态']!='有效':continue
        pid=o['产品编号'];product=one([r for r in d['products'] if r['产品编号']==pid]);rate=F(product['总收率'])
        route=[r for r in d['routes'] if r['产品编号']==pid];machines={}
        limits=[]
        for op in route:
            dep=one([r for r in d['dependencies'] if r['订单编号']==o['订单编号'] and r['工序编号']==op['工序编号'] and r['资源类型']=='设备'])
            m=one([m for m in d['machines'] if m['设备编号']==dep['资源编号']]);machines[op['工序编号']]=m
            limits.append(F(m['最大装载kg'])*(rate if m['装载计量基准']=='BOM总投入' else 1))
        remaining=F(o['合格需求'])-F(o['已完成合格数量'] or '0');count=math.ceil(remaining/min(limits));qty=remaining/count;load=qty/rate
        assert count==1 or o['是否允许拆分']=='是'
        saved=[b for b in p['productionBatches'] if b['orderId']==o['订单编号']];assert len(saved)==count
        for index in range(1,count+1):
            bid=ident(o['订单编号'],index);record=one([b for b in saved if b['id']==bid]);assert exact(record['qualifiedKg'])==qty and exact(record['inputKg'])==load
            for op in route:
                tid=ident(o['订单编号'],index,op['工序编号']);expected[tid]=(o,op,qty,load)
                if tid not in byid:missing.append(tid);continue
                t=byid[tid];m=machines[op['工序编号']];time=one([r for r in d['times'] if r['产品编号']==pid and r['工序编号']==op['工序编号']])
                assert t['orderId']==o['订单编号'] and t['productId']==pid and t['operation']==op['工序编号'] and t['productionBatchId']==bid and t['productionBatchIndex']==index
                assert t['machine']==m['设备编号'] and t['start']>=0 and t['end']==t['start']+int(time['固定分钟']) and t['duration']==int(time['固定分钟'])
                assert time['计算方式']=='固定' and exact(t['exactQuantity'])==qty and F(str(t['quantity']))==qty
                actual_load=qty if m['装载计量基准']=='合格产出' else load
                assert exact(t['exactLoadKg'])==actual_load and F(str(t['loadKg']))==actual_load and t['loadBasis']==m['装载计量基准']
                prior=ident(o['订单编号'],index,op['前序工序']) if op['前序工序'] else ''
                assert t['predecessor']==prior
                if prior:assert prior in byid and t['start']>=byid[prior]['end']
                if op['最大等待分钟']!='':assert t['start']-byid[prior]['end']<=int(op['最大等待分钟'])
                calendar(d,t,'设备',t['machine'],t['start'],t['end']);groups.setdefault(t['resourceBatchId'],[]).append((t,m,actual_load))
    assert all(tid in expected for tid in byid)
    if complete:assert not missing,('missing source operations',missing)
    leaders=[]
    for gid,rows in groups.items():
        first,m,_=rows[0];op=expected[first['id']][1]
        cool=[r for r in d['routes'] if r['产品编号']==first['productId'] and r['最大等待分钟']!='']
        heat=one(cool)['前序工序'];assert len(rows)==1 or first['operation']==heat
        load=sum((r[2] for r in rows),F());assert F(m['最小装载kg'])<=load<=F(m['最大装载kg'])
        for t,_,_ in rows:
            assert (t['operation'],t['machine'],t['start'],t['end'])==(first['operation'],first['machine'],first['start'],first['end'])
            if len(rows)>1:
                assert t['productId']==first['productId'] and recipe(d,t['productId'],t['start'])==recipe(d,first['productId'],first['start'])
                def upstream_versions(task):
                    prior=byid.get(task['predecessor']);versions=[]
                    while prior:
                        versions += [(b['物料编号'],b['版本编号'],b['生效日期']) for b in recipe(d,prior['productId'],prior['start']) if b['投料工序编号']==prior['operation']]
                        prior=byid.get(prior['predecessor'])
                    return sorted(versions)
                assert upstream_versions(t)==upstream_versions(first)
        if first['operation']==heat:
            cfg=one([r for r in d['batchResources'] if r['资源编号']==first['machine']]);assert op['程序编号'] in cfg['允许程序'].split(';')
            assert all(t['program']==op['程序编号'] for t,_,_ in rows)
        saved=one([r for r in p['resourceBatches'] if r['id']==gid]);assert exact(saved['exactLoadKg'])==load and set(saved['members'])=={t['productionBatchId'] for t,_,_ in rows}
        res=one([r for r in p['resourceReservations'] if r['type']=='设备' and r['resourceBatchId']==gid]);assert res['resourceId']==first['machine'] and res['start']==first['start'] and res['end']==first['end'] and res['quantity']=='1' and set(res['taskIds'])=={t['id'] for t,_,_ in rows}
        leaders.append(first)
    assert len([r for r in p['resourceReservations'] if r['type']=='设备'])==len(groups)==len(p['resourceBatches'])
    for i,a in enumerate(leaders):
        for b in leaders[i+1:]:assert a['machine']!=b['machine'] or a['end']<=b['start'] or b['end']<=a['start']
    ledger=p['resourceReservations'];enabled={r['规则编号'] for r in d['rules'] if r['是否启用']=='是'};known=set()
    for t in tasks:
        for raw in [c for c in d['resourceClaims'] if c['订单编号']==t['orderId'] and c['工序编号']==t['operation'] and ('MOLD' if c['资源类型']=='工装' else 'STORAGE') in enabled]:
            c=dict(raw)
            if c['参数来源']=='工装配置':
                tool=one([x for x in d['tools'] if x['工装编码']==c['资源编号']]);c.update({k:tool['每任务需求数量' if k=='需求数量' else k] for k in ['需求数量','提前占用分钟','后延占用分钟']})
            begin=t['start']+(int(c['窗口开始偏移分钟'] or 0) if c['占用口径']=='明确窗口' else 0)-int(c['提前占用分钟'])
            end=t['end']-(int(c['窗口结束偏移分钟'] or 0) if c['占用口径']=='明确窗口' else 0)+int(c['后延占用分钟'])
            rows=[(i,r) for i,r in enumerate(ledger) if r.get('declarationId')==c['声明编号'] and t['id'] in r['taskIds'] and r.get('productionBatchId')==t['productionBatchId']]
            index,r=one(rows);known.add(index);assert r['type']==c['资源类型'] and r['resourceId']==c['资源编号'] and r['start']==begin and r['end']==end and F(r['quantity'])==F(c['需求数量'])
            if c['资源类型']=='工装':calendar(d,t,'工装',r['resourceId'],begin,end)
            if expected[t['id']][1]['最大等待分钟']!='' and c['资源类型']=='空间':assert F(r['quantity'])==expected[t['id']][2] and begin==t['start'] and end==t['end']
        for need in [r for r in d['dependencies'] if r['订单编号']==t['orderId'] and r['工序编号']==t['operation'] and r['资源类型']=='人员技能']:
            ids=need['候选人员组'].replace('，',',').split(',') if need['候选人员组'] else [need['资源编号']]
            begin=t['start']+(0 if need['窗口外释放']=='否' else int(need['人员开始偏移'] or 0));end=t['end']-(0 if need['窗口外释放']=='否' else int(need['人员结束偏移'] or 0))
            rows=[(i,r) for i,r in enumerate(ledger) if r['type']=='人员' and t['id'] in r['taskIds'] and r.get('roleSource')==t['productionBatchId'] and r.get('postId','')==need['人员岗位编号']]
            points=sorted({begin,end}|{x for _,r in rows for x in [r['start'],r['end']]})
            for point in points[:-1]:assert sum(int(r['quantity']) for _,r in rows if r['start']<=point<r['end'])==(int(need['需求数量']) if begin<=point<end else 0)
            for index,r in rows:
                known.add(index);g=one([g for g in d['personnelGroups'] if g['人员组编号']==r['resourceId']]);assert g['人员组编号'] in ids and need['所需技能'] in g['技能'].replace(';',',').split(',') and (not need['所需班次'] or g['班次']==need['所需班次'])
                assert int(g['可用起始分钟'])<=r['start']<r['end']<=int(g['可用结束分钟']);calendar(d,t,'人员',r['resourceId'],r['start'],r['end'])
    for index,r in enumerate(ledger):
        if r['type']=='设备':continue
        assert index in known,('unaccounted resource',r)
        rows=[x for x in ledger if x['type']==r['type'] and x['resourceId']==r['resourceId']]
        if r['type']=='工装':cfg=one([t for t in d['tools'] if t['工装编码']==r['resourceId']]);cap=F(cfg['可用数量'])
        elif r['type']=='人员':cfg=one([t for t in d['personnelGroups'] if t['人员组编号']==r['resourceId']]);cap=F(cfg['人员数量'])
        else:cfg=one([t for t in d['batchResources'] if t['资源编号']==r['resourceId']]);cap=F(cfg['容量'])
        sweep(rows,cap)
    for pool in d['personnelPools']:
        groupids={g['人员组编号'] for g in d['personnelGroups'] if g['poolId']==pool['poolId']};rows=[r for r in ledger if r['type']=='人员' and r['resourceId'] in groupids];sweep(rows,F(pool['总人数']))
    used={};used_references={};seen=set();policy=json.loads(one([r for r in d['rules'] if r['规则编号']=='MATERIAL'])['参数JSON'])
    for t in tasks:
        o,op,kg,_=expected[t['id']];product=one([r for r in d['products'] if r['产品编号']==t['productId']]);bom=recipe(d,t['productId'],t['start'])
        raw=[b for b in bom if b['用量类型']=='BOM物料'];assert sum((F(b['配置用量']) for b in raw),F())==1000
        needed=[b for b in bom if b['投料工序编号']==t['operation']];saved=[(i,r) for i,r in enumerate(p['materialDemands']) if r['taskId']==t['id'] and r['committed']];assert len(saved)==len(needed)
        for b in needed:
            index,r=one([(i,r) for i,r in saved if r['materialId']==b['物料编号']]);seen.add(index)
            if b['用量类型']=='BOM物料':amount=kg/F(product['总收率'])*F(b['配置用量'])/1000
            else:
                bags=kg/F(product['单支净重kg'])/F(product['每袋支数']);assert bags.denominator==1
                amount=F(math.ceil(bags*F(b['配置用量'])/(1-F(b['损坏比例']))))
            assert exact(r['exactQuantity'])==amount and F(str(r['quantity']))==amount and r['feedMinute']==t['start'] and r['version']==b['版本编号'] and exact(r['exactShortage'])==0 and r['shortage']==0
            assert sum((exact(a['exactQuantity']) for a in r['allocations']),F())==amount
            for a in r['allocations']:
                qty=exact(a['exactQuantity']);assert qty>0 and F(str(a['quantity']))==qty
                if a['conditional']:
                    assert policy['允许预计供给'];lot=one([s for s in d['supplies'] if s['供给编号']==a['supplyId']]);assert lot['质量状态'] in policy['预计状态'] and lot['批次编号']==a['lotId']
                    delays=sorted([r for r in d['supplyDelays'] if r['供给编号']==a['supplyId']],key=lambda r:r['记录时间']);ready=delays[-1]['调整后可用时间'] if delays else lot['预计可用时间']
                    assert instant(ready)<=ORIGIN+dt.timedelta(minutes=t['start'])
                    ref=one([r for r in d['supplyUses'] if r['订单编号']==t['orderId'] and r['工序编号']==t['operation'] and r['供给编号']==a['supplyId']]);used_references[ref['引用编号']]=used_references.get(ref['引用编号'],F())+qty;assert used_references[ref['引用编号']]<=F(ref['使用数量']);capacity=F(lot['预计数量'])
                else:
                    lot=one([l for l in d['inventory'] if l['批次编号']==a['lotId']]);assert lot['质量状态'] in policy['可用状态'];capacity=F(lot['账面数量'])-F(lot['已占用数量'])
                    if lot['预计可用时间']:assert instant(lot['预计可用时间'])<=ORIGIN+dt.timedelta(minutes=t['start'])
                assert lot['物料编号']==b['物料编号'] and lot['有效期']>=date(t['start'])
                used[a['lotId']]=used.get(a['lotId'],F())+qty;assert used[a['lotId']]<=capacity
    assert {i for i,r in enumerate(p['materialDemands']) if r['committed']}==seen
    return {'sourceOperations':len(expected),'scheduledOperations':len(tasks),'missingOperations':missing,'resourceGroups':len(groups)}

def native_plan(value):
    rows=list(csv.reader(io.StringIO(value['csv'].lstrip('\ufeff'))));header=next(row for row in rows if row and row[0]=='任务编号');out=dict(value['plan']);tasks=[]
    saved={t['id']:t for t in value['plan']['tasks']}
    for row in rows:
        if not row or row[0] not in saved:continue
        cells=dict(zip(header,row));tid=cells['任务编号'];index=json.loads(tid)[1]
        tasks.append({'id':tid,'orderId':cells['订单编号'],'productId':cells['产品编号'],'operation':cells['工序编号'],'machine':cells['设备编号'],'start':int(cells['开始分钟']),'end':int(cells['结束分钟']),'duration':int(cells['工时分钟']),'predecessor':cells['前序任务'],'productionBatchId':cells['生产批编号'],'productionBatchIndex':index,'resourceBatchId':cells['资源批编号'],'quantity':float(cells['合格数量kg']),'exactQuantity':json.loads(cells['精确合格数量']),'loadKg':float(cells['投入装载kg']),'exactLoadKg':json.loads(cells['精确投入装载']),'loadBasis':cells['装载口径'],'program':cells['程序编号']})
    out['tasks']=tasks;return out

def inspect(root,min_cases):
    reports=[]
    for file in sorted(root.glob('R4-*.json')):
        value=json.loads(file.read_text());p=value.get('plan');d=value.get('data')
        if not p or not d:continue
        source_dir=root/(file.stem+'-source')
        assert source_dir.is_dir()
        source={k:list(csv.DictReader((source_dir/name).open(encoding='utf-8-sig',newline=''))) for k,name in FILES.items()}
        for key in source:assert source[key]==[{k:str(r.get(k,'')) for k in source[key][0]} for r in d[key]] if source[key] else not d[key]
        partial=file.stem.startswith('R4-03') or file.stem.startswith('R4-09-239.99')
        result=check(source,p,not partial)
        native=False
        if value.get('csv'):
            check(source,native_plan(value),not partial);native=True
        reports.append({'case':file.stem,'result':'PASS','inputHash':hashlib.sha256(file.read_bytes()).hexdigest(),'sourceFileHashes':{name:hashlib.sha256((source_dir/name).read_bytes()).hexdigest() for name in FILES.values()},'nativeCsvIndependentlyChecked':native,**result})
    assert len(reports)>=min_cases
    return reports
def main():
    reports=inspect(pathlib.Path(sys.argv[1]),15)
    if len(sys.argv)>2:reports+=inspect(pathlib.Path(sys.argv[2]),3)
    print(json.dumps({'oracle':'independent CSV/Fraction/events; no product imports','checks':reports},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
