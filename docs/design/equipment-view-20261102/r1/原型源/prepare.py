# -*- coding: utf-8 -*-
from pathlib import Path
import json, hashlib, copy
p=Path(__file__).parent
raw=json.loads(Path('temp/query-prototype-r2-20261102/data.json').read_text())
tables={k:[dict(zip(v['columns'],r))for r in v['rows']]for k,v in raw.items()if isinstance(v,dict)and'columns'in v}
keep=['物料主数据','物料清单','设备与工装','工艺路线','班组资源','工厂日历','停机安排','客户与交付','供应商与供货条件','参数目录']
d={k:tables[k]for k in keep};d['参数实例']=[r for r in tables['参数实例']if r['对象编号'].startswith(('EQ','TL','RT','TM'))or r['对象编号']=='CAL']
resources=[r for r in d['设备与工装']if r['资源类别']=='设备'];rmap={r['资源编号']:r for r in resources};groups={}
for r in resources:groups.setdefault(r['资源组编号'],[]).append(r)
selected=[]
for product in [r['物料编号']for r in d['物料主数据']if r['物料类别']=='成品']:
    candidates=[r for r in tables['每日需求']if r['成品编号']==product and 10<=int(r['需求日'])<=14 and float(r['需求千克'])<=500]
    selected.extend(candidates[:3])
assert len(selected)==30
d['每日需求']=selected
busy={r['资源编号']:[]for r in resources};tasks=[];lots=[];risk=[];count=0
stops=[r for r in d['停机安排']if int(r['可知日'])<=3]
def overlap(a,b):return a[0]<b[1]and b[0]<a[1]
for i,order in enumerate(selected):
    product=order['成品编号'];quantity=float(order['需求千克']);route=sorted([r for r in d['工艺路线']if r['成品编号']==product],key=lambda r:int(r['工序顺序']))
    lot='PL'+str(i+1).zfill(3);at=1+(i%4);previous='';ids=[]
    for j,step in enumerate(route):
        # 日槽位用于设计夹具；原件0天工序明确转为1个演示槽位，不作为新业务默认。
        span=max(1,int(step['跨日历时天数']));chosen=None
        for day in range(at,43-span):
            options=groups[step['设备组编号']]
            for resource in options:
                rid=resource['资源编号'];interval=(day,day+span)
                if any(overlap(interval,x)for x in busy[rid]):continue
                if any(r['资源编号']==rid and overlap(interval,(int(r['开始日']),int(r['结束日'])))for r in stops):continue
                chosen=(rid,day,day+span);break
            if chosen:break
        assert chosen
        rid,start,end=chosen;busy[rid].append((start,end));count+=1;tid='TK'+str(count).zfill(4)
        tools=[r['资源编号']for r in d['设备与工装']if r['资源类别']=='工装'and r['资源组名称']==step['所需工装类型']][:int(step['每批工装套数'])]
        blocked=(i in [3,12,23]and j==min(3,len(route)-1));waiting=(i in [6,16]and j==2)
        flags=[]
        if i in [0,1]and j==0:flags.append('锁定示例')
        if blocked:flags.append('缺料示例')
        if waiting:flags.append('待料示例')
        tasks.append({'id':tid,'orderId':order['需求编号'],'productId':product,'productionId':lot,'operation':step['工序编号'],'routeStepId':step['路线工序编号'],'label':step['工序名称'],'machine':rid,'resource':rid,'start':start,'end':end,'quantity':quantity,'unit':'千克','crew':step['班组编号'],'people':int(step['需求人数']),'tools':tools,'predecessor':previous,'flags':flags,'state':'blocked'if blocked else'waiting'if waiting else'completed'if end<=3 else'running'if start<=3<end else'planned','source':{'kind':'DESIGN_FIXTURE','sheet':'工艺路线','row':step['_row'],'demandSheet':'每日需求','demandRow':order['_row'],'zeroDayConvertedToSlot':step['跨日历时天数']=='0','toolMapping':'设计演示分配，非生产G03物理池映射'}})
        if blocked or waiting:
            reachable=[product];seen=set();materials=[]
            while reachable:
                parent=reachable.pop()
                if parent in seen:continue
                seen.add(parent)
                for edge in d['物料清单']:
                    if edge['父项编号']==parent:
                        child=edge['子项编号'];m=next(r for r in d['物料主数据']if r['物料编号']==child)
                        if m['物料来源']!='制造':materials.append((child,edge['用量关系编号']))
                        else:reachable.append(child)
            mid,bomid=materials[0]if materials else(product,'')
            risk.append({'id':'MRD'+str(len(risk)+1).zfill(3),'taskId':tid,'orderId':order['需求编号'],'materialId':mid,'bomId':bomid,'needDay':start,'availableDay':start+2,'quantity':24 if blocked else 12,'unit':next(r['基础单位']for r in d['物料主数据']if r['物料编号']==mid),'kind':'缺料示例'if blocked else'待料示例','sourceKind':'DESIGN_FIXTURE','note':'数量与预计日期为设计构造，未运行净算或供应分配'})
        previous=tid;ids.append(tid);at=end
    lots.append({'id':lot,'orderId':order['需求编号'],'productId':product,'quantity':quantity,'taskIds':ids})
base={'id':'DEMOA','name':'演示方案 A','version':'A1','sourceKind':'DESIGN_FIXTURE','tasks':tasks,'lots':lots,'risks':risk}
adjusted=copy.deepcopy(base);adjusted.update({'id':'DEMOB','name':'调整演示 B','version':'B1'})
# 预设一组非法调整供展示：移到既有设备同槽位，保留依赖不改，显示设备/前序/停机冲突。
target=next(t for t in adjusted['tasks']if t['machine']=='EQ007')
peer=next(t for t in adjusted['tasks']if t['machine']=='EQ008')
for t in [target,peer]:t['machine']='EQ007';t['resource']='EQ007';t['start']=5;t['end']=6;t['flags'].append('调整示例')
changed={target['id'],peer['id']}
for t in adjusted['tasks']:
    if t['predecessor']in changed:t['start']+=1;t['end']+=1;t['flags'].append('调整示例')
d['期初库存']=[r for r in tables['期初库存']if r['物料编号']in {r['materialId']for r in risk}]
d['既有采购在途']=[r for r in tables['既有采购在途']if r['物料编号']in {r['materialId']for r in risk}]
sources=raw['sources'];d['sources']={'B':sources['B'],'P':sources['P'],'reviewedProductSha':json.loads((p/'head.json').read_text())['sha'],'prototypeVersion':'EQUIPMENT-VIEW-20261102-r1','fixtureMeaning':'设备/工艺/班组/日历/停机/目录来自用户仿真原件；任务、工装分配、状态、缺料和调整均为设计夹具，不是APS计算或执行事实','zeroDurationMeaning':'原件0天工序在本设计夹具中按1个整日槽位呈现，仅为可读布局，不是加工默认值或修改真实时长'}
payload={'tables':d,'plans':[base,adjusted]}
(p/'data.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')))
print(json.dumps({'orders':len(selected),'tasks':len(tasks),'resources':len(resources),'risks':len(risk),'latestEnd':max(t['end']for t in tasks),'bytes':(p/'data.json').stat().st_size},ensure_ascii=False))
