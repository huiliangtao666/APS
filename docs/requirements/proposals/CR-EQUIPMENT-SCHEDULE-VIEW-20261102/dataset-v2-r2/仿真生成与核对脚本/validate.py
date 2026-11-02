# -*- coding: utf-8 -*-
from pathlib import Path
import sys,json,zipfile,xml.etree.ElementTree as E,datetime,collections,hashlib,re
from xlsx_edit import Book,q
p=Path(__file__).parent;r=json.loads((p/'build.json').read_text());b=Book(r['business_file']);param=Book(r['parameter_file']);old=Book('upload/肉食品仿真数据_202611_合并图示版.xlsx');oldp=Book('upload/APS配置参数梳理_20261101.xlsx');checks=[]
def test(name,fn):
 try:fn();checks.append({'项目':name,'结果':'通过'})
 except Exception as e:checks.append({'项目':name,'结果':'失败','原因':str(e)});(p/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));raise
def require(v,m='断言不符'):
 if not v:raise AssertionError(m)
T={s:b.table(s)[0]for s in b.paths if s not in ['BOM对应图','提前期时序图','工艺设备示意图']};P={s:param.table(s)[0]for s in param.paths}
def structure():
 for book in [b,param]:
  with zipfile.ZipFile(book.path)as z:
   require(z.testzip()is None)
   for n in z.namelist():
    if n.endswith('.xml')or n.endswith('.rels'):E.fromstring(z.read(n))
  require(len(set(book.paths))==len(book.paths))
  for name in book.paths:
   if name in ['BOM对应图','提前期时序图','工艺设备示意图']:continue
   require(book.value(book.rows(name)[0].find(q('c'))).startswith('综述：'),name+'无综述')
test('两份完整Excel的CRC/XML/页签/逐表综述',structure)
def kept():
 for sheet in ['物料主数据','单位换算','物料清单','客户与交付','库区库位','供应商与供货条件','每日需求','每日成品汇总','期初库存','既有采购在途','生产补给建议','物料需求来源','每日缺料净算','采购订单草案','采购缺料汇总']:
  source,h=old.table(sheet);new=T[sheet];require(len(source)==len(new),sheet)
  for a,c in zip(source,new):
   for k in h.values():require(a[k]==c[k],f'{sheet}/{a["_row"]}/{k}被改')
test('原主数据/需求/库存/采购及参考演算所有原字段原值保留',kept)
m={a['物料编号']:a for a in T['物料主数据']};routes={a['路线工序编号']:a for a in T['工艺路线']};res={a['资源编号']:a for a in T['设备与工装']};staff={a['班组编号']for a in T['班组资源']};edges={a['用量关系编号']:a for a in T['物料清单']}
test('140SKU与原类别规模',lambda:require(collections.Counter(a['物料类别']for a in m.values())=={'成品':10,'半成品':20,'原辅料':75,'包装材料':35}))
def bom():
 children=collections.defaultdict(list)
 for e in edges.values():require(e['父项编号']in m and e['子项编号']in m);children[e['父项编号']].append(e['子项编号'])
 def depth(x,path=()):
  require(x not in path,'BOM循环');return max([1+depth(y,path+(x,))for y in children[x]]or[0])
 require(max(depth(k)for k in m if m[k]['物料类别']=='成品')==3)
 def acc(x):return float(m[x]['本级补给提前期天数'])+max([acc(y)for y in children[x]]or[0])
 for x in m:require(abs(acc(x)-float(m[x]['累计提前期天数']))<1e-6,x+'累计期')
test('317BOM引用/无环/最深3层/累计提前期关键路径算术',bom)
def routecheck():
 require(len(routes)==127);by=collections.defaultdict(list)
 for a in routes.values():
  require(a['成品编号']in m and a['班组编号']in staff)
  require(any(x['资源组编号']==a['设备组编号']and x['资源类别']=='设备'for x in res.values()))
  for k in ['基准加工分钟','固定准备分钟','最短工艺分钟','最大等待分钟','开始参与分钟','结束参与分钟','工装后延释放分钟']:require(float(a[k]).is_integer()and float(a[k])>=0,a['路线工序编号']+k)
  require(int(a['基准加工分钟'])>0)
  by[a['成品编号']].append(a)
 for id,a in m.items():
  if a['物料来源']=='制造':require(id in by,id+'无路线')
 for id,steps in by.items():
  steps.sort(key=lambda a:int(a['工序顺序']));require([int(a['工序顺序'])for a in steps]==list(range(1,len(steps)+1)))
  if m[id]['物料类别']=='成品':require(5<=len(steps)<=10)
  for i,a in enumerate(steps):require(a['前序工序编号']==(''if i==0 else steps[i-1]['工序编号']))
test('30制造物料全部显式路线/127道工序/顺序资源人员/整数分钟',routecheck)
def params():
 rows=P['仿真参数实例'];mirror=T['配置参数'];cols=list(oldp.table('仿真参数实例')[1].values())
 require([{k:x[k]for k in cols}for x in rows]==[{k:x[k]for k in cols}for x in mirror],'B/P镜像不一致')
 ids=[x['参数编号']for x in rows];require(len(ids)==len(set(ids))==r['counts']['parameter_instances'])
 keys=[(x['对象编号'],x['参数名称'],x['生效日'],x['失效日'])for x in rows];require(len(keys)==len(set(keys)),'同对象参数有效期冲突')
 require(not any(x['对象编号'].startswith('RT')and x['参数名称']in ['跨日历时天数','最大等待天数']for x in rows))
 lookup={(x['对象编号'],x['参数名称']):x for x in rows}
 for id,route in routes.items():
  for key in ['工时模型','基准加工量千克','基准加工分钟','固定准备分钟','最短工艺分钟','最大等待分钟','允许跨班连续','人员参与方式','开始参与分钟','结束参与分钟','工装后延释放分钟','需求人数','每批工装套数']:require(str(route[key])==str(lookup[id,key]['参数值']),id+'/'+key)
 for id,x in res.items():
  for key in ['可用数量','单次批量上限千克','标准日产能千克','同时占位上限千克']:
   if x[key]!='':require(float(x[key])==float(lookup[id,key]['参数值']),id+'/'+key)
test('P权威有效实例与B逐条一致/有效实例唯一键/工艺资源值一致/旧日参数退役',params)
def catalog():
 catalog={x['参数编号']:x for x in P['参数清单']};require(len(catalog)==181);require('生产'in catalog['CP001']['规则与边界']and'分钟'in catalog['CP001']['规则与边界'])
 unchanged={'CP001','CP002','CP005','CP092','CP093','CP097'}
 for orig in oldp.table('参数清单')[0]:
  if orig['参数编号']in unchanged:continue
  for key in ['最小值','最大值','是否必填','缺失时行为','权威来源及校验备注']:require(orig[key]==catalog[orig['参数编号']][key],orig['参数编号']+key)
 sums=sum(int(x['对象参数记录数'])for x in P['仿真参数分类']);require(sums==r['counts']['parameter_instances'])
test('P原K—O校验属性保留/181目录/分类计数一致',catalog)
zero=datetime.datetime(2026,10,31)
def parse(s):return int((datetime.datetime.strptime(s,'%Y.%m.%d %H:%M')-zero).total_seconds()/60)
def minutes():
 for row in T['生产班次']:
  a=parse(row['开始时刻']);c=parse(row['结束时刻（不含）']);require(a==int(row['开始分钟偏移'])and c==int(row['结束分钟偏移'])and c-a==480)
 require(len(T['生产班次'])==81)
 for row in T['停机安排']:
  a=parse(row['停机开始时刻']);c=parse(row['停机结束时刻（不含）']);require(a==int(row['开始分钟偏移'])and c==int(row['结束分钟偏移'])and c-a==int(row['停机分钟'])and c>a)
  require(parse(row['信息可知时刻'])<=a)
 require(len(T['停机安排'])==5)
 for x in T['分钟边界样例']:require(parse(x['结束时刻（不含）'])-parse(x['开始时刻'])==int(x['持续分钟']))
test('分钟原点/81班次/5停机/非整半小时及跨午夜样例无损',minutes)
def feed():
 rows=T['工序投料'];require(len(rows)==317 and len({x['用量关系编号']for x in rows})==317)
 for x in rows:require(x['用量关系编号']in edges and x['路线工序编号']in routes and x['父物料编号']==routes[x['路线工序编号']]['成品编号'])
test('317BOM逐条投料映射/父项与实际工序匹配',feed)
def tools():
 require(len(T['工装资源池'])==17);require(len(res)==49)
 entities={x['实体工装编号']:x for x in T['工装资源池']};require(len(entities)==17)
 for x in entities:require(x in res and res[x]['资源类别']=='工装')
 assigned=[];loads=collections.Counter()
 for x in T['在制剩余映射']:
  require(x['当前路线工序编号']in routes);require(x['当前占用设备编号']in res)
  require(parse(x['物理保留开始时刻'])==int(x['保留开始分钟偏移'])and parse(x['物理保留结束时刻（不含）'])==int(x['保留结束分钟偏移']))
  assigned.append(x['当前实体工装编号']);require(assigned[-1]in entities)
  loads[x['当前占用设备编号']]+=float(x['当前占用数量千克'])
  for rid in x['剩余路线工序编号'].split(','):require(rid in routes)
  for bid in filter(None,x['尚需投料BOM编号'].split(',')):require(bid in edges)
 require(len(assigned)==len(set(assigned))==8,'WIP工装重用')
 for id,weight in loads.items():require(weight<=float(res[id]['同时占位上限千克']))
test('17实体工装/8WIP唯一实体保留/冷却间重量容量与剩余映射',tools)
def cleaning():
 rows=T['换型清洗'];keys={(x['设备组编号'],x['前产品编号'],x['后产品编号'])for x in rows};require(len(keys)==len(rows)==1986)
 products=collections.defaultdict(set)
 for x in routes.values():products[x['设备组编号']].add(x['成品编号'])
 for group,ids in products.items():
  for a in ids:
   for c in ids:require((group,a,c)in keys)
 for x in rows:require(int(x['清洗分钟'])in [0,30,45,60]);require(x['前产品编号']!=x['后产品编号']or int(x['清洗分钟'])==0)
test('1986条适用产品有向清洗矩阵完整/无重复/分钟合法',cleaning)
def refs():
 require(len(T['参考结果说明'])==6);require(len(T['日业务时点规则'])==8)
 for table in ['生产补给建议','物料需求来源','每日缺料净算','采购订单草案']:require('V1原日口径'in b.value(b.rows(table)[0].find(q('c'))))
 require(len(T['CR与版本引用'])==3 and all(x['本次数据版本']==r['version']for x in T['CR与版本引用']))
 for file in ['xl/drawings/drawing27.xml','xl/drawings/drawing28.xml','xl/drawings/drawing29.xml']:require(file in b.parts)
 require(b'\xe8\xb7\xa8\xe6\x97\xa5\xe6\xae\xb50'not in b.parts['xl/drawings/drawing29.xml'])
test('原3张原生图保留/工艺图分钟化/旧演算角色及3CR版本引用明确',refs)
result={'version':r['version'],'checks':checks,'passed':len(checks),'failed':0,'meaning':'独立Excel数据结构/引用/算术检查，不是产品导入/Worker/浏览器/任务测试/UAT','product_import_or_runtime':'NOT_EXECUTED','counts':r['counts']}
(p/'checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':len(checks),'failed':0,'product':'NOT_EXECUTED'},ensure_ascii=False))
