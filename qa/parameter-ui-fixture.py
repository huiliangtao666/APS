"""Small, explicitly synthetic 11-sheet parameter fixture; never the private upload."""
import json,pathlib,sys,zipfile
from xml.sax.saxutils import escape
root=pathlib.Path(__file__).resolve().parent.parent
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
text=(root/'src/lib/parameter-catalog.mjs').read_text();catalog=json.loads(text.split('export const parameterCatalog=',1)[1].rsplit(';',1)[0])
fields=['参数编号','业务领域','中文配置项','配置对象','类型与单位','规则与边界','依据性质','明确默认或样例','维护入口','依据链接','最小值','最大值','是否必填','缺失时行为','权威来源及校验备注']
instances=[{'参数编号':'MOCK-P-INSPECT','对象编号':'MOCK-SUP','对象名称':'模拟供货关系','参数名称':'检验天数','参数值':'1','单位':'天','生效日':'0','失效日':'44'}, {'参数编号':'MOCK-P-LEAD','对象编号':'MOCK-SUP','对象名称':'模拟供货关系','参数名称':'采购导期天数','参数值':'3','单位':'天','生效日':'0','失效日':'44'}]
tables={'参数清单':(fields,catalog),'仿真参数分类':(['分类编号','目录引用'],[{'分类编号':'MOCK-SP01','目录引用':'CP063/CP074'},{'分类编号':'MOCK-SP02','目录引用':'CP073'}]),'仿真参数实例':(['参数编号','对象编号','对象名称','参数名称','参数值','单位','生效日','失效日','参数说明'],instances),'讨论事项':(['讨论编号','内容'],[{'讨论编号':'MOCK-D14','内容':'未明新公式保留候选'}]),'校验问题':(['问题编号','内容','复核'],[{'问题编号':'MOCK-Q03','内容':'约15天估算','复核':'最长13，保留14窗口'}])}
for name in ['使用说明','配套配置','派生说明','旧69追溯','依据','来源说明']:tables[name]=(['说明'],[{'说明':'明确模拟，非现场默认'}])
def col(n):
 s=''
 while n:n,r=divmod(n-1,26);s=chr(65+r)+s
 return s
def workbook(path,tables):
 with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
  sn=[];rels=[]
  for i,(name,(keys,rs)) in enumerate(tables.items(),1):
   rows=[]
   for rn,row in [(2,dict(zip(keys,keys)))]+[(i+3,r) for i,r in enumerate(rs)]:
    rows.append('<row r="'+str(rn)+'">'+''.join('<c r="'+col(c)+str(rn)+'" t="inlineStr"><is><t>'+escape(str(row.get(k,'')))+'</t></is></c>' for c,k in enumerate(keys,1))+'</row>')
   z.writestr(f'xl/worksheets/sheet{i}.xml','<worksheet><sheetData>'+''.join(rows)+'</sheetData></worksheet>');sn.append(f'<sheet name="{name}" r:id="rId{i}"/>');rels.append(f'<Relationship Id="rId{i}" Target="worksheets/sheet{i}.xml"/>')
  z.writestr('xl/workbook.xml','<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(sn)+'</sheets></workbook>');z.writestr('xl/_rels/workbook.xml.rels','<Relationships>'+''.join(rels)+'</Relationships>')
workbook(out/'parameters-small.xlsx',tables)
instances[0]['参数值']='illegal'
workbook(out/'parameters-invalid.xlsx',tables)
print(json.dumps({'fixture':'SYNTHETIC_NOT_USER_ORIGINAL','sheets':len(tables),'CP':168,'SP':2,'PA':2,'D':1,'Q':1}))
