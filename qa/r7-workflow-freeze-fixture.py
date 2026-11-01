"""Small literal OOXML input, generated only in a supplied disposable directory.

Values are replaceable simulation inputs, never site defaults or altered uploads.
All 16 input sheets use the current schema. No packages or workbook libraries.
"""
import datetime, hashlib, json, pathlib, sys, zipfile
from xml.sax.saxutils import escape

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
schema = json.loads((pathlib.Path(__file__).parent.parent / 'server/workbook-schema.json').read_text())
tables = {name: [] for name, spec in schema['tables'].items() if spec['kind'] == '输入'}
def row(table, **values):
    tables[table].append({k: str(v) for k, v in values.items()})

row('配置参数', 参数编号='MOCK-P1', 对象编号='MOCK-FG', 对象名称='模拟成品', 参数名称='每箱净重千克', 参数值=10, 单位='千克', 生效日=0, 失效日=44, 参数说明='显式可替换模拟')
for mid, source in [('MOCK-FG', '制造'), ('MOCK-RAW', '采购')]:
    row('物料主数据', 物料编号=mid, 物料名称=mid, 物料类别='成品' if source=='制造' else '原料', 物料来源=source, 补给方式='模拟', 基础单位='千克', 生产提前期天数=1, 采购提前期天数=1, 检验提前期天数=0, 参考供货关系编号='MOCK-SUP' if source=='采购' else '', 储存环境='常温', 保质天数=50, 安全库存覆盖天数=0, 参考日均毛用量=0, 每箱净重千克=10, 每件净重千克=1, 仓储损耗参考率=0)
row('客户与交付', 客户编号='MOCK-C', 客户名称='模拟客户', 运输天数=0, 允许提前天数=0, 允许延后天数=0, 到货剩余保质比例=0, 服务优先级=1, 名称性质='可替换模拟')
row('库区库位', 仓库编号='MOCK-W', 库位编号='MOCK-L', 储存环境='常温', 最大容量=10000, 容量单位='千克', 库位状态='可用')
row('供应商与供货条件', 供货关系编号='MOCK-SUP', 供应商编号='MOCK-S', 物料编号='MOCK-RAW', 采购优先级=1, 采购导期天数=1, 检验天数=0, 最小订货量=1, 订货倍数=1, 数量单位='千克')
row('物料清单', 用量关系编号='MOCK-BOM', 清单版本编号='MOCK-V1', 父项编号='MOCK-FG', 子项编号='MOCK-RAW', 父项基准产出千克=1000, 子项基准用量=1000, 数量单位='千克', 标准收率=1, 投料位置='MOCK-OP', 取整方式='不取整', 生效日=0, 失效日=44, 配方性质='可替换模拟合格产出基准')
row('工艺路线', 路线工序编号='MOCK-RS', 路线编号='MOCK-R', 成品编号='MOCK-FG', 工序顺序=1, 工序编号='MOCK-OP', 工序名称='模拟加工', 前序工序编号='', 设备组编号='MOCK-EG', 跨日历时天数=0, 最大等待天数=0, 允许加工中断='否', 班组编号='MOCK-CREW', 需求人数=1, 所需工装类型='MOCK-TOOL', 每批工装套数=1)
row('设备与工装', 资源编号='MOCK-E', 资源名称='模拟设备', 资源类别='设备', 资源组编号='MOCK-EG', 可用数量=1, 单次批量上限千克=100, 标准日产能千克=100, 同时占位上限千克=100, 能力口径='显式有限模拟')
row('设备与工装', 资源编号='MOCK-T', 资源名称='模拟工装', 资源类别='工装', 资源组编号='MOCK-TOOL', 可用数量=1)
row('班组资源', 班组编号='MOCK-CREW', 班组名称='模拟唯一班组', 每班可用人数=1, 标准日班次数=1, 周日班次数=1)
for day in range(44):
    row('工厂日历', 日序=day, 公历日期=(datetime.date(2026,10,31)+datetime.timedelta(days=day)).strftime('%Y%m%d'), 生产班次数=1, 日产能分子=1, 日产能分母=1, 作业规则='显式模拟')
for day in [1,14,15,30,31,43]:
    row('每日需求', 需求编号='MOCK-D'+str(day), 需求日=day, 客户编号='MOCK-C', 成品编号='MOCK-FG', 需求箱数=2, 范围='显式小profile')
row('期初库存', 库存批次编号='MOCK-LOT', 物料编号='MOCK-RAW', 仓库编号='MOCK-W', 库位编号='MOCK-L', 当前数量=1000, 数量单位='千克', 质量状态='已放行', 生产日=0, 入库日=0, 放行日=0, 到期日=44, 期初已占用量=0, 快照日=0)
row('期初在制', 在制批次编号='MOCK-WIP', 成品编号='MOCK-FG', 当前工序编号='MOCK-OP', 占用资源编号='MOCK-E', 预计合格产出=1, 数量单位='千克', 已开工日=0, 预计完工日=1, 预计放行日=2, 已投料口径='模拟尚待投入', 库存口径='与期初库存分开')
mapping = {'mock':True,'version':'R7-small-v1','line':{'id':'MOCK-LINE','not_site_default':True},'resources':[], 'sfRoutes':[], 'feed_mappings':[{'bom_id':'MOCK-BOM','route_step_id':'MOCK-RS'}], 'tool_pools':{'MOCK-TOOL':['MOCK-T']}, 'wip_remaining':[{'id':'MOCK-WIP','product':'MOCK-FG','resource':'MOCK-E','current_occupancy_day_interval':[0,1], 'remaining_route_steps':['MOCK-RS'], 'remaining_material_bom_ids':['MOCK-BOM'], 'remaining_labor_pool':'MOCK-CREW','remaining_labor_count':1,'remaining_tool_type':'MOCK-TOOL','remaining_tool_count':1}], 'capabilities_required':['daily-capacity','finite-physical-pools','multilevel-bom','frozen-version-reopen-export']}
def col(n):
    s=''
    while n:
        n,r=divmod(n-1,26);s=chr(65+r)+s
    return s
def cell(address,value):
    return f'<c r="{address}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'
with zipfile.ZipFile(out/'small.xlsx','w',zipfile.ZIP_DEFLATED) as z:
    sheets=[];rels=[]
    for n,(table,values) in enumerate(tables.items(),1):
        fields=[f['name'] for f in schema['tables'][table]['fields']]
        body='<row r="2">'+''.join(cell(col(i)+'2',v) for i,v in enumerate(fields,1))+'</row>'
        for ri,r in enumerate(values,3):
            cells=[]
            for i,f in enumerate(fields,1):
                if table=='物料主数据' and r['物料编号']=='MOCK-FG' and f=='每箱净重千克':
                    cells.append(f'<c r="{col(i)}{ri}"><f>\'配置参数\'!E3</f><v>10</v></c>')
                elif f in r:cells.append(cell(col(i)+str(ri),r[f]))
            body+=f'<row r="{ri}">'+''.join(cells)+'</row>'
        z.writestr(f'xl/worksheets/sheet{n}.xml','<worksheet><sheetData>'+body+'</sheetData></worksheet>')
        sheets.append(f'<sheet name="{escape(table)}" sheetId="{n}" r:id="rId{n}"/>')
        rels.append(f'<Relationship Id="rId{n}" Target="worksheets/sheet{n}.xml"/>')
    z.writestr('xl/workbook.xml','<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(sheets)+'</sheets></workbook>')
    z.writestr('xl/_rels/workbook.xml.rels','<Relationships>'+''.join(rels)+'</Relationships>')
(out/'mapping.json').write_text(json.dumps(mapping,ensure_ascii=False,indent=2))
(out/'literal-inputs.json').write_text(json.dumps(tables,ensure_ascii=False,indent=2))
(out/'fixture-sha256.json').write_text(json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()},indent=2))
print('Small fixture:',(out/'small.xlsx').stat().st_size,'bytes; literal inputs / explicit mapping retained')
