"""Small OOXML, all approved sheets/headers, complete related material graph.
Synthetic values are explicit. No original Excel edits or formula evaluation.
"""
import copy, hashlib, json, pathlib, sys, zipfile
from xml.sax.saxutils import escape, quoteattr

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCHEMA=json.loads((ROOT/'server/workbook-schema.json').read_text())
def col(i):
    out=''
    while i: i,r=divmod(i-1,26);out=chr(65+r)+out
    return out
def formula(value,cached='3'): return {'formula':value,'cached':cached}
def material(id,source,production,inspection,supply=''):
    return {'物料编号':id,'物料名称':id,'物料来源':source,'基础单位':'千克','生产提前期天数':production,'检验提前期天数':inspection,'参考供货关系编号':supply,'安全库存覆盖天数':'1','参考日均毛用量':'10','每箱净重千克':'10','每件净重千克':'1'}
def bom(id,p,c,start='0',end='44'):
    return {'用量关系编号':id,'清单版本编号':'V'+id,'父项编号':p,'子项编号':c,'父项基准产出千克':'1000','子项基准用量':'100','数量单位':'千克','标准收率':'0.96','生效日':start,'失效日':end}
BASE={t:[] for t,s in SCHEMA['tables'].items()}
BASE['配置参数']=[{'参数编号':'PA0001','对象编号':'FG001','参数名称':'生产提前期天数','参数值':'4','生效日':'0','失效日':'44','单位':'天'}]
BASE['物料主数据']=[material('FG001','制造',formula("'配置参数'!$E$3"),'1'),material('SF001','制造','2','1'),material('SF002','制造','1','1'),material('RM001','采购','0','0','SUP001')]
BASE['物料清单']=[bom('BM001','FG001','SF001'),bom('BM002','SF001','SF002'),bom('BM003','SF002','RM001')]
BASE['供应商与供货条件']=[{'供货关系编号':'SUP001','供应商编号':'S001','物料编号':'RM001','采购导期天数':'2','检验天数':'1','最小订货量':'1','订货倍数':'1','数量单位':'千克'}]
BASE['单位换算']=[{'物料编号':'FG001','换算前单位':'箱','换算后单位':'千克','换算系数':'10'}]

def write(out,name,data=None,orders=None,headers=None):
    data=copy.deepcopy(BASE if data is None else data);orders=orders or list(SCHEMA['tables']);headers=headers or {}
    sheets=[];rels=[];entries={}
    for idx,t in enumerate(orders,1):
        sheets.append('<sheet name='+quoteattr(t)+f' sheetId="{idx}" r:id="rId{idx}"/>')
        rels.append(f'<Relationship Id="rId{idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{idx}.xml"/>')
        fields=headers.get(t,[f['name'] for f in SCHEMA['tables'][t]['fields']]);rows=[]
        def cell(address,value):
            if isinstance(value,dict): return f'<c r="{address}"><f>{escape(value["formula"])}</f><v>{escape(value["cached"])}</v></c>'
            return f'<c r="{address}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'
        rows.append('<row r="2">'+''.join(cell(col(i)+'2',f) for i,f in enumerate(fields,1))+'</row>')
        for rn,r in enumerate(data[t],3):rows.append(f'<row r="{rn}">'+''.join(cell(col(i)+str(rn),r[f]) for i,f in enumerate(fields,1) if f in r)+'</row>')
        entries[f'xl/worksheets/sheet{idx}.xml']='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+''.join(rows)+'</sheetData></worksheet>'
    entries['xl/workbook.xml']='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(sheets)+'</sheets></workbook>'
    entries['xl/_rels/workbook.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(rels)+'</Relationships>'
    entries['_rels/.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    entries['[Content_Types].xml']='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1,len(orders)+1))+'</Types>'
    p=out/(name+'.xlsx')
    with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:
        for n,v in entries.items():
            info=zipfile.ZipInfo(n,(2026,11,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,v)
    return {'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}

def main(out):
    out.mkdir(parents=True,exist_ok=True);manifest=[]
    def save(name,d=None,**kw):manifest.append(write(out,name,d,**kw))
    save('valid');d=copy.deepcopy(BASE);d['物料清单'][0]['子项编号']='UNKNOWN99';save('unknown-child',d)
    headers={t:[f['name'] for f in s['fields']] for t,s in SCHEMA['tables'].items()}
    headers['配置参数']=list(reversed(headers['配置参数']));headers['物料清单']=list(reversed(headers['物料清单']))
    d=copy.deepcopy(BASE);d['物料主数据'][0]['生产提前期天数']=formula("'配置参数'!$E$3")
    # E remains parameter value in the reversed nine-column parameter sheet;
    # identity moves A -> I, so a hard-coded A binding cannot pass.
    save('valid-reorder',d,orders=list(reversed(list(SCHEMA['tables']))),headers=headers)
    h=copy.deepcopy(headers);h['配置参数']=[f['name'] for f in SCHEMA['tables']['配置参数']['fields']];h['配置参数']=h['配置参数'][2:]+h['配置参数'][:2]
    d=copy.deepcopy(BASE);d['物料主数据'][0]['生产提前期天数']=formula("'配置参数'!$C$3")
    save('valid-reorder-shift',d,orders=list(reversed(list(SCHEMA['tables']))),headers=h)
    h=copy.deepcopy(headers);h['物料清单']=[f['name'] for f in SCHEMA['tables']['物料清单']['fields']];h['物料清单'][5]='子项编号';save('duplicate-header',headers=h)
    h=copy.deepcopy(headers);h['物料清单'].append('未知业务字段');d=copy.deepcopy(BASE);d['物料清单'][0]['未知业务字段']='MUST_NOT_DROP';save('unknown-column',d,headers=h)
    d=copy.deepcopy(BASE);d['物料清单'][0]['UNKNOWN']='x';h=copy.deepcopy(headers);h['物料清单'].append('');d['物料清单'][0]['']='MUST_NOT_DROP';save('unheaded-column',d,headers=h)
    for name,f in [('parameter-known-formula','SUM(1,3)'),('parameter-unknown-formula','UNAPPROVED_FUNCTION(1)'),('parameter-external-formula',"'[external.xlsx]Sheet1'!A1"),('parameter-empty-formula','')]:
        d=copy.deepcopy(BASE);d['配置参数'][0]['参数值']=formula(f);save(name,d)
    for name,f in [('derived-unknown-formula','UNAPPROVED_FUNCTION(1)'),('derived-external-formula',"'[external.xlsx]Sheet1'!A1")]:
        d=copy.deepcopy(BASE);d['物料主数据'][0]['生产提前期天数']=formula(f);save(name,d)
    for name,form in [('sum','SUM(1,3)'),('max','MAX(1,4)'),('if','IF(1=1,4,3)'),('round','ROUND(3.6,0)'),('roundup','ROUNDUP(3.1,0)')]:
        d=copy.deepcopy(BASE);d['物料主数据'][0]['生产提前期天数']=formula(form);save('whitelist-'+name,d)
    d=copy.deepcopy(BASE);d['物料清单'][0]['子项编号']='FG001';save('self-cycle',d)
    d=copy.deepcopy(BASE);d['物料清单'].append(bom('BM004','SF002','FG001'));save('multilevel-cycle',d)
    d=copy.deepcopy(BASE);d['物料清单'].append(bom('BM004','FG001','SF001','43','45'));save('overlap',d)
    d=copy.deepcopy(BASE);d['物料清单'].append(bom('BM004','FG001','SF001','44','45'));save('adjacent',d)
    d=copy.deepcopy(BASE);d['物料清单'][0]['失效日']='0';save('empty-interval',d)
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main(pathlib.Path(sys.argv[1]))
