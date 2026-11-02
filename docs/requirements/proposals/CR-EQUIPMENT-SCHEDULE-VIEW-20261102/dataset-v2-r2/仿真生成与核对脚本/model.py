# -*- coding: utf-8 -*-
from pathlib import Path
import json,datetime,math,copy,collections
from xlsx_edit import Book,q,xml
ROOT=Path('temp/dataset-v2-20261102');VERSION='APS-MEAT-202611-V2.0';BFILE='肉食品仿真数据_202611_完整分钟版_V2.0_20261102.xlsx';PFILE='APS配置参数梳理_完整分钟版_V2.0_20261102.xlsx'
B=Book('upload/肉食品仿真数据_202611_合并图示版.xlsx');P=Book('upload/APS配置参数梳理_20261101.xlsx')
ORIGINAL={s:B.table(s)[0]for s in B.paths if s not in ['BOM对应图','提前期时序图','工艺设备示意图']}
ORIGP={s:P.table(s)[0]for s in P.paths};zero=datetime.datetime(2026,10,31)
def date(day):return (zero+datetime.timedelta(days=int(float(day)))).strftime('%Y.%m.%d')
def stamp(day,minute=0):return(zero+datetime.timedelta(days=int(float(day)),minutes=int(minute))).strftime('%Y.%m.%d %H:%M')
def bare(r):return {k:v for k,v in r.items()if not k.startswith('_')}
def setrow(book,sheet,row,changes):
 _,h=book.table(sheet);ix={v:k for k,v in h.items()}
 for k,v in changes.items():book.cell(sheet,row,ix[k],v)
RES=[bare(r)for r in ORIGINAL['设备与工装']];MATS={r['物料编号']:r for r in ORIGINAL['物料主数据']};CREWS={r['班组编号']:r for r in ORIGINAL['班组资源']}
# 原8批在制有7批占用挂架；补3个明确物理挂架，保持原14件编号不变。
template=next(r for r in RES if r['资源编号']=='TL007')
for i in range(15,18):
 r=copy.deepcopy(template);r.update(资源编号=f'TL{i:03}',资源名称=f'食品热加工挂架{i:02}号');RES.append(r)
ROUTES=[bare(r)for r in ORIGINAL['工艺路线']]
routeheaders=list(B.table('工艺路线')[1].values())
for i,m in enumerate(r for r in MATS.values()if r['物料类别']=='半成品'):
 for j,(name,group,crew)in enumerate([('半成品称量备料','EG003','TM02'),('半成品混合暂存','EG006','TM02')],1):
  r=dict.fromkeys(routeheaders,'');r.update(路线工序编号=f'RT{88+i*2+j-1:03}',路线编号=f'RP{i+11:03}',成品编号=m['物料编号'],成品名称=m['物料名称'],工序顺序=j,工序编号=f'OPS{j:02}',工序名称=name,前序工序编号=''if j==1 else'OPS01',设备组编号=group,设备组名称=next(x['资源组名称']for x in RES if x['资源组编号']==group),跨日历时天数=0,最大等待天数=0,允许加工中断='否',班组编号=crew,需求人数=2,所需工装类型='料车',每批工装套数=1,清洗与日粒度说明='V2新增半成品显式路线；具体配方仅仿真，分钟字段为本版排程依据');ROUTES.append(r)
for r in ROUTES:
 group=r['设备组编号'];cap=min(float(x['标准日产能千克'])for x in RES if x['资源组编号']==group and x['资源类别']=='设备');span=int(r['跨日历时天数'])
 r.update({'工时模型':'固定连续历时'if span else'按量加工','基准加工量千克':500,'基准加工分钟':span*1440 if span else max(1,math.ceil(500/cap*960)),'固定准备分钟':0 if span else 15,'最短工艺分钟':span*1440 if span else 0,'最大等待分钟':int(r['最大等待天数'])*1440 if int(r['最大等待天数'])>0 else 60,'允许跨班连续':'是'if span else'否','人员参与方式':'首尾参与'if span else'全程参与','开始参与分钟':15 if span else 0,'结束参与分钟':15 if span else 0,'工装后延释放分钟':0,'工时取整规则':'完成一次实际加工后向上取整至1分钟','时间字段性质':'V2仿真输入；工时及准备均可配置，非现场标准','旧日字段用途':'历史来源对照；原0天等待V2显式设60分钟样例，不声称还原未知日内时长'})
 r['清洗与日粒度说明']='V2按分钟；换型清洗见矩阵，同一清洗段只计一次；原日字段仅追溯'
B.replace_table('工艺路线',list(ROUTES[0]),ROUTES,'生产按分钟。原87道成品工序保留并补齐20种半成品共40道工序；0天不再作为加工时长。按量时长=准备分钟+ceil(批量÷基准量×基准加工分钟)；连续历时按固定分钟，不随量缩放。')
for r in RES:
 r.update({'工厂编号':'FC01','产线编号':'LN01','资源占用方式':'重量容量共享'if r['资源组编号']=='EG012'else'独占','生产日历方式':'连续日历'if r['资源组编号']in ['EG001','EG007','EG012']else'工厂班次','标准日有效加工分钟':960 if r['资源类别']=='设备'else'','资源来源说明':'V2补足在制物理挂架'if r['资源编号']in ['TL015','TL016','TL017']else'原件保留'})
B.replace_table('设备与工装',list(RES[0]),RES,'32台设备、17个实体工装。新增3个仿真挂架以覆盖原8批在制；冷却间按重量容量共享，其他资源独占。标准日960分钟为两班样例，工时与日量口径分别显示。')
META=[['版本编号',VERSION],['业务数据文件',BFILE],['权威配置文件',PFILE],['版本日期','2026.11.02'],['统计月','2026.11.01—2026.11.30'],['期初快照日期','2026.10.31'],['期初快照时刻','2026.10.31 23:59'],['默认排程窗','2026.11.01 00:00—2026.11.15 00:00（结束不含，共14天）'],['查询默认日期','2026.11.01—2026.11.14（含尾日）'],['日序与分钟原点','2026-10-31T00:00:00+08:00'],['工厂时区','Asia/Shanghai'],['生产时间精度','整数分钟；图形半小时刻度；时长不按刻度取整'],['其他业务日期精度','需求/库存/补料按天；关联生产明细保留分钟'],['日内班次样例','周日08:00—16:00；其余08:00—16:00及16:00—次日00:00；仅仿真参数'],['两文件优先','P第二份的定义/边界/缺失/同对象有效值优先；新用户分钟要求覆盖旧CP001日粒度'],['参数维护','统一参数页和流程步骤页同源；导入/查询/编辑产生新版本，历史run不变'],['主数据与业务范围','原140SKU/317BOM/40客户/84库位/215供货关系和原业务记录保留；新增分钟及显式映射'],['旧参考演算','MP/MR/NC/DP原值原样保留，仅旧日口径参考；不得当V2分钟运行结果或自动供给'],['此前261任务补充','属于上一版展示夹具，不作为本V2输入或已计算计划；V2由真实APS求解并冻结结果'],['数据性质','全部名称/配方/时长/班次/清洗值为仿真，可直接作V2设计测试输入；非现场批准默认'],['当前产品支持','需按#50分钟契约及#45导入/参数接缝升级；不得忽略新字段回退旧日模式；本包未证明当前程序已可导入'],['关联需求','#50设备分钟排程；#49五类业务查询；#45输入/参数双入口与冻结接缝'],['历史保护','原B/P和旧run/hash保留；V2是新数据版本，不覆盖既有测试数据'],['单线范围','FC01仿真中原肉制品工厂/LN01综合肉制品产线；多设备组不代表多条产线'],['有效区间','BOM/参数按日生效，区间[生效日,失效日)；生产任务按分钟半开区间'],['图示口径','BOM及累计提前期图仍为补给日历天估算；工艺设备图更新分钟，不冒充实际排程'],['导入版本门槛','要求显式识别本V2、单位、原点、P目录及新增表；不支持时列出字段/能力缺口，不静默成功']]
B.add('版本与使用',['项目','内容'],META,'完整版本入口；本文件为B业务输入，与同版本P配置文件配套分别导入；不是独立分钟补充文件。',first=True)
P.add('版本与使用',['项目','内容'],META,'V2权威配置；保留用户第二文件K—O边界/必填/缺失等信息，并按最新生产分钟要求升级。',first=True)

def install_dates(book):
 for sheet in list(book.paths):
  if sheet in ['BOM对应图','提前期时序图','工艺设备示意图','版本与使用','停机安排']:continue
  rows,h=book.table(sheet);fields=list(h.values());dayfields=[f for f in fields if(f.endswith('日')or f=='日序')and not any(t in f for t in ['相对','标准日','生产日'])and any(str(r.get(f,'')).lstrip('-').isdigit()for r in rows)]
  if not dayfields:continue
  extras=[(f,f[:-1]+'日期'if f!='日序'else'日历日期')for f in dayfields]
  book.addcols(sheet,[label for _,label in extras],lambda r:{label:date(r[f])if str(r.get(f,'')).lstrip('-').isdigit()else''for f,label in extras})
  book.resize(sheet,hidden=dayfields)

def main_save():
 install_dates(B);install_dates(P);B.save(BFILE);P.save(PFILE)
