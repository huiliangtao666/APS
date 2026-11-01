"""Generate small explicit simulation files; never modify private Excel originals."""
import pathlib,sys,subprocess,json,zipfile,copy
from xml.sax.saxutils import escape
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
root=pathlib.Path(__file__).resolve().parent.parent
subprocess.run([sys.executable,str(root/'qa/input-data-upgrade-supply-fixture.py'),str(out/'supply')],check=True)
# Execute only the generator definitions into an isolated namespace so the
# existing synthetic schema can be reused, without importing any user file.
ns={'__file__':str(root/'qa/parameter-ui-fixture.py')};old=sys.argv;sys.argv=['generator',str(out)];exec((root/'qa/parameter-ui-fixture.py').read_text(),ns);sys.argv=old
business=json.loads((out/'supply/literal-inputs.json').read_text())
business['每日需求'][0]['需求箱数']='18'
business['期初在制']=[]
for lot in business['期初库存']:
 lot.update({'当前数量':'5000','期初已占用量':'0','放行日':'0','到期日':'44'})
for r in business['库区库位']:r['最大容量']='20000'
for r in business['设备与工装']:
 if r['资源类别']=='设备':r.update({'单次批量上限千克':'1000','标准日产能千克':'1000','同时占位上限千克':'1000'})
mapping=json.loads((out/'supply/mapping.json').read_text());mapping['wip_remaining']=[]
# Existing readiness expects a declared WIP mapping list, even with no WIP.
mapping['wip_remaining']=[{'id':'NO-WIP-SYNTHETIC','remaining_route_steps':[]}]
(out/'mapping.json').write_text(json.dumps(mapping,ensure_ascii=False))
schema=json.loads((root/'server/workbook-schema.json').read_text())
def write_business(path,tables):
 ns['workbook'](path,{t:([f['name'] for f in schema['tables'][t]['fields']],rs) for t,rs in tables.items()})
write_business(out/'business180.xlsx',business)
business['每日需求'][0]['需求箱数']='20';write_business(out/'business200.xlsx',business)
params=ns['tables'];params['仿真参数分类']=(['分类编号','目录引用'],[{'分类编号':'SYN-TOOL','目录引用':'CP099'}])
fields=['参数编号','对象编号','对象名称','参数名称','参数值','单位','生效日','失效日','参数说明']
for qty in ['1','0']:
 params['仿真参数实例']=(fields,[{'参数编号':'SYN-PA-TOOL','对象编号':'MOCK-T','对象名称':'唯一模拟工装','参数名称':'可用数量','参数值':qty,'单位':'个','生效日':'0','失效日':'44'}])
 ns['workbook'](out/('parameter'+qty+'.xlsx'),params)
print('R2_SYNTHETIC: business180/business200 and parameter1/parameter0; no site defaults')
