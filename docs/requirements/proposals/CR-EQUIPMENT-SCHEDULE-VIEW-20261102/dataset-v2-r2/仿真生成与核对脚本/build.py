# -*- coding: utf-8 -*-
from parameters import *
import re,hashlib
CRS=[['CR50','设备分钟排程','#50','https://github.com/huiliangtao666/APS/issues/50',VERSION,'工艺/班次/停机/WIP/投料/资源/清洗/分钟边界','V2分钟输入与真实run使用；不以演示任务替代求解'],['CR49','五类业务查询','#49','https://github.com/huiliangtao666/APS/issues/49',VERSION,'140SKU/BOM/每日需求/库存/产能/补料、P参数及所有新增分钟来源','按天查询需求库存补料，生产追溯保分钟；全选/栏位/分页/源身份'],['CR45','输入与配置双入口','#45','https://github.com/huiliangtao666/APS/issues/45',VERSION,'双文件导入/参数定义规则及有效值/查询编辑/冻结与导出','新schema须显式识别；保持P优先；原任务缺陷和轮次不重开']]
for book in [B,P]:book.add('CR与版本引用',['引用编号','业务范围','实施原卡','原卡链接','本次数据版本','引用内容','执行与验证边界'],CRS,'CR同一版本引用；真正任务/开工/验收由PM在原卡维护，本表仅数据与需求的追溯关系，不替代实施主账。')
refs=['生产补给建议','物料需求来源','每日缺料净算','采购订单草案','采购缺料汇总','关键路径明细']
B.addcols('关键路径明细',['示意开始日期','示意完成日期'],lambda r:{'示意开始日期':date(int(r['相对开始日'])+1),'示意完成日期':date(int(r['相对完成日'])+1)})
B.add('参考结果说明',['工作表','来源版本','数据角色','V2使用边界'],[[s,'原合并图示版V1','补给日参考'if s=='关键路径明细'else'旧日演算参考','保留原行原数不重算；不当V2运行结果/已采用草稿/自动新增供给；V2结果必须来自真实run']for s in refs],'保留历史参考便于查询验证；分钟生产输入已升级，旧演算不冒充采用V2模型后的结果，不能用于证明新的可执行计划。')
for s in refs:B.summary(s,'V1原日口径参考演算，原行原数保留；V2未重算。只作查询/来源对照，不是V2分钟run结果，不自动下达或转供给。'+('累计提前期仍按物料本级补给天数/BOM关键路径解释，非实际工序分钟关键路径。'if s=='关键路径明细'else''))

index=[]
for r in ORIGINAL['说明索引']:
 r=bare(r)
 if r['项目']=='版本':r['内容']=VERSION+'；保留原主业务与图示，生产升级分钟，日业务按天；详情优先阅读版本与使用。'
 if r.get('工作表')in B.paths and r['工作表']not in ['BOM对应图','提前期时序图','工艺设备示意图']:r['记录行数']=len(B.table(r['工作表'])[0])
 if '整数天'in str(r['内容'])or'日粒度'in str(r['内容']):r['内容']='V2：生产分钟、半小时刻度；需求库存补料日历日；原日序为内部转换。详版本与使用。'
 index.append(r)
listed={r['工作表']for r in index}
for s in B.paths:
 if s not in listed and s not in ['说明索引','BOM对应图','提前期时序图','工艺设备示意图']:index.append({'项目':'工作表','内容':'V2完整输入/映射或说明，见该表综述','工作表':s,'记录行数':len(B.table(s)[0]),'主键或粒度':'本表中文业务键','关联说明':'同版本双文件；P优先；原点/单位明确'})
B.replace_table('说明索引',list(index[0]),index,'V2完整数据索引；阅读版本与使用后按工作表跳转。主数据、配套参数、业务与只读参考分别在综述说明，不重复添加分类抬头。')
fields=[bare(r)for r in ORIGINAL['字段说明']];known={(r['工作表'],r['字段名称'])for r in fields}
for r in fields:
 if r['工作表']=='配置参数'and r['字段名称']=='参数值':r['类型']='按P定义：数字/枚举/日期时刻';r['业务含义']='数值字段用数值，时区/原点/版本/枚举为文字；禁止统一强转整数；采用规则和单位来自P'
 if r['工作表']=='工艺路线'and r['字段名称']in ['跨日历时天数','最大等待天数','清洗与日粒度说明']:r['业务含义']='原V1日字段保留对照；V2精排不用。以工时模型/基准加工分钟/最大等待分钟及清洗矩阵为准。';r['维护方式']='历史来源只读';r['示例值']='V1日口径示例仅追溯，V2看分钟字段'
for sheet in list(B.paths):
 if sheet in ['字段说明','BOM对应图','提前期时序图','工艺设备示意图']:continue
 data,h=B.table(sheet)
 for f in h.values():
  if(sheet,f)in known:continue
  sample=next((r[f]for r in data if r.get(f,'')!=''),'');minute='分钟'in f;typ='数字'if minute and '时刻'not in f and re.fullmatch('-?\d+(\.\d+)?',str(sample))else'业务文字/日历时刻'if'时刻'in f or'日期'in f else'按样例显式类型'
  fields.append({'工作表':sheet,'字段名称':f,'类型':typ,'单位':'分钟'if minute else'日历日期时刻'if'时刻'in f else'见字段','业务含义':'V2新增字段；时间单位/原点/半开边界按本表综述及版本与使用解释，业务键引用同版本输入','维护方式':'输入/配套规则可维护；只读说明或边界样例按综述','示例值':str(sample)})
B.replace_table('字段说明',list(fields[0]),fields,'V2字段词典；原日工时字段标历史只读，新分钟/映射/规则字段补齐。生产时刻及日业务日期分开，不靠显示样式改变计算值。')
for r in ORIGP['阅读说明']:
 if r['项目']=='梳理范围':setrow(P,'阅读说明',r['_row'],{'说明':f'{VERSION}；181目录项，{len(PA)}有效实例；完整保留用户K—O属性，生产分钟新规则优先，需补及校验问题给V2处置。'})
setrow(P,'需补充及后续讨论',4,{'主题':'生产分钟模型与日业务衔接','现有依据与需整理内容':'用户最新已要求生产分钟、半小时显示；V2提供分钟工时/班次/停机/在制及日内衔接规则','建议下一步':'按#50和#45原owner配套，不能只把日字段格式化成时刻'})
P.summary('阅读说明',f'{VERSION}权威配置入口；先看版本与使用及参数清单CP001/169—181，原阅读说明仅按V2已更新条款使用。')

# 更新原生矢量工艺图的时长标签，保留BOM及提前期图的关系和原件图形。
import xml.etree.ElementTree as E
for name,b in list(B.parts.items()):
 if not(name.startswith('xl/drawings/')and name.endswith('.xml')):continue
 root=E.fromstring(b);texts=[x for x in root.iter()if x.tag.endswith('}t')and x.text];changed=False;fg=op=None
 if name.endswith('drawing29.xml'):
  for x in texts:
   t=x.text
   if t.startswith('肉食品工艺'):x.text='V2肉食品工艺—设备—班组—工装分钟示意图';changed=True
   elif t.startswith('箭头表示'):x.text='V2按分钟；EG编号相同表示共享设备组。完整127道路线含半成品，详工艺路线/工序投料。';changed=True
   match=re.match(r'^(FG\d{3})\s',t)
   if match:fg=match[1]
   match=re.search(r'\[(OP\d+)\]',t)
   if match:op=match[1]
   if t.startswith('跨日段')and fg and op:
    r=next(r for r in ROUTES if r['成品编号']==fg and r['工序编号']==op);x.text=f"基准加工{r['基准加工分钟']}分/500kg；准备{r['固定准备分钟']}分；等待≤{r['最大等待分钟']}分";changed=True
 elif name.endswith('drawing28.xml'):
  for x in texts:
   if x.text.startswith('累计提前期关键路径时序图'):x.text='V2补给提前期关键路径示意｜11.01起算日历天，非实际分钟排程';changed=True
   elif re.fullmatch('\d+',x.text):x.text=date(int(x.text)+1)[5:];changed=True
 if changed:B.parts[name]=xml(root)

# 生效/业务日序保留但隐藏，业务观察给日历列；原公历日期纯数字也隐藏。
main_save()
for book in [B,P]:
 # 重新保存已安装日期列后的数据；仅内部日序列隐藏，中文日历字段可见。
 for sheet in list(book.paths):
  if sheet in ['BOM对应图','提前期时序图','工艺设备示意图']:continue
  _,h=book.table(sheet);hidden=[v for v in h.values()if(v.endswith('日')or v=='日序')and not any(t in v for t in ['相对','标准日','生产日'])]
  if sheet=='工厂日历':hidden+=['公历日期']
  if sheet=='关键路径明细':hidden+=['相对开始日','相对完成日']
  if sheet=='工艺路线':hidden+=['跨日历时天数','最大等待天数','清洗与日粒度说明','旧日字段用途']
  book.resize(sheet,hidden)
 book.save(BFILE if book is B else PFILE)
record={'version':VERSION,'business_file':BFILE,'parameter_file':PFILE,'counts':{'sku':len(MATS),'bom':len(FEEDS),'routes':len(ROUTES),'manufactured_materials':len({r['成品编号']for r in ROUTES}),'devices':32,'tools':17,'shift_rows':len(CAL),'downtime':5,'wip':8,'clean_rules':len(CLEAN),'parameter_catalog':len(CAT),'parameter_instances':len(PA),'retired_day_parameters':len(REMOVED)},'reviewed_product_sha':json.loads((ROOT/'head.json').read_text())['sha'],'new_product_sha':None,'product_import_or_runtime':'NOT_EXECUTED','files':[]}
for file in [BFILE,PFILE]:
 f=Path(file);record['files'].append({'path':file,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
(ROOT/'build.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps(record,ensure_ascii=False,indent=2))
