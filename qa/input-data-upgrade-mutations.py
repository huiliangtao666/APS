"""Generate isolated negative Excel fixtures by surgical OOXML edits.
Not an importer/parser: does not interpret business records or evaluate formulas.
Usage: python3 qa/input-data-upgrade-mutations.py original.xlsx output-dir
"""
import copy, hashlib, json, pathlib, re, sys, zipfile
import xml.etree.ElementTree as E
N={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
TAG='{'+N['m']+'}'
SHA='c4c2d40b82fd63a60b7ebbe269aecd4208e49f1f612ee0164b963b948a8b56d0'
def text_cell(root,address,value,formula=False):
    cell=root.find(".//m:c[@r='"+address+"']",N)
    if cell is None:
        rownum=re.search(r'\d+',address).group()
        row=root.find("m:sheetData/m:row[@r='"+rownum+"']",N)
        cell=E.SubElement(row,TAG+'c',{'r':address})
    for child in list(cell):cell.remove(child)
    cell.attrib.pop('t',None)
    if formula:
        E.SubElement(cell,TAG+'f').text=value
        E.SubElement(cell,TAG+'v').text='3'  # Deliberately plausible stale cache.
    else:
        cell.set('t','inlineStr');E.SubElement(E.SubElement(cell,TAG+'is'),TAG+'t').text=value
def make(source,out):
    assert hashlib.sha256(source.read_bytes()).hexdigest()==SHA,'Unrecognized original workbook'
    out.mkdir(parents=True,exist_ok=True)
    metadata=json.loads((pathlib.Path(__file__).parent/'input-data-upgrade-source.json').read_text())
    paths=metadata['sheet_xml_paths']
    edits=[
        ('IN04-unknown-child','物料清单','E3','UNKNOWN99',False,'atomic rejection at 物料清单!E3'),
        ('IN05-duplicate-header','物料清单','F2','子项编号',False,'duplicate E2/F2 header blocks'),
        ('IN05-unknown-column','物料清单','Q2','未知业务字段',False,'nonempty Q3 may not be silently discarded'),
        ('IN06-stale-cache','配置参数','E3','4',False,'PA0001=4; material G3 cache stays3; derived FG001 lead becomes13'),
        ('IN07-unknown-formula','配置参数','E3','UNAPPROVED_FUNCTION(1)',True,'formula rejected, cache3 not accepted'),
        ('IN07-external-formula','配置参数','E3',"'[external.xlsx]Sheet1'!A1",True,'external formula rejected, never evaluated'),
        ('IN17-bom-cycle','物料清单','E3','FG001',False,'FG001 -> FG001 cycle at E3'),
    ]
    report=[]
    with zipfile.ZipFile(source) as z:
        for name,sheet,cell,value,formula,expected in edits:
            entry=paths[sheet];root=E.fromstring(z.read(entry));text_cell(root,cell,value,formula)
            if name=='IN05-unknown-column':
                text_cell(root,'Q3','MUST_NOT_DROP')
                dimension=root.find('m:dimension',N)
                if dimension is not None:dimension.set('ref','A1:Q319')
            if name=='IN06-stale-cache':
                numeric=root.find(".//m:c[@r='E3']",N)
                for child in list(numeric):numeric.remove(child)
                numeric.attrib.pop('t',None);E.SubElement(numeric,TAG+'v').text='4'
            changes={entry:E.tostring(root,encoding='utf-8',xml_declaration=True)}
            if name=='IN06-stale-cache':
                # Keep business-sheet formula/cache bytes exactly unchanged.
                original=z.read(paths['物料主数据'])
                assert b'G3' in original
            write_variant(z,out,name,changes,{'sheet':sheet,'cell':cell,'expected':expected},report)
        # A legitimate reorder moves entire columns including addresses/formulas.
        # BOM A/B are literal identities; no derived formulas depend on them.
        wb=E.fromstring(z.read('xl/workbook.xml'));sheets=wb.find('m:sheets',N)
        children=list(sheets);sheets[:]=list(reversed(children))
        root=E.fromstring(z.read(paths['物料清单']))
        for row in root.findall('m:sheetData/m:row',N):
            if int(row.get('r'))<2:continue
            for c in row:
                a=c.get('r');col=re.sub(r'\d+','',a)
                if col in ['A','B']:c.set('r',('B' if col=='A'else'A')+re.search(r'\d+',a).group())
            def rank(c):
                n=0
                for ch in re.sub(r'\d+','',c.get('r')):n=n*26+ord(ch)-64
                return n
            row[:]=sorted(list(row),key=rank)
        write_variant(z,out,'IN05-valid-reorder',{'xl/workbook.xml':E.tostring(wb,encoding='utf-8',xml_declaration=True),paths['物料清单']:E.tostring(root,encoding='utf-8',xml_declaration=True)},{'expected':'sheet order reversed and BOM identity columns A/B exchanged; same records by Chinese header'},report)
        root=E.fromstring(z.read(paths['物料清单']))
        row=copy.deepcopy(root.find("m:sheetData/m:row[@r='3']",N));row.set('r','320')
        for c in row:c.set('r',re.sub(r'\d+$','320',c.get('r')))
        root.find('m:sheetData',N).append(row);text_cell(root,'A320','SIM-BM-OVERLAP');text_cell(root,'B320','SIM-BV-OVERLAP')
        dim=root.find('m:dimension',N)
        if dim is not None:dim.set('ref','A1:P320')
        write_variant(z,out,'IN17-overlap-version',{paths['物料清单']:E.tostring(root,encoding='utf-8',xml_declaration=True)},{'sheet':'物料清单','cells':['A320','B320','N320','O320'],'expected':'same FG001/SF001 relation active on overlapping [-30,44); reject, retain original version'},report)
    (out/'input-data-upgrade-mutation-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'result':'PASS_FIXTURE_ZIP_INTEGRITY_ONLY','variants':len(report),'product_status':'NOT_EXECUTED'},ensure_ascii=False))
def write_variant(z,out,name,changes,case,report):
    p=out/(name+'.xlsx')
    with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as target:
        for info in z.infolist():target.writestr(copy.copy(info),changes.get(info.filename,z.read(info.filename)))
    with zipfile.ZipFile(p) as target:
        assert target.testzip() is None
        for key in z.namelist():
            if key not in changes:assert target.read(key)==z.read(key),key
        for key in changes:E.fromstring(target.read(key))
    report.append({'id':name,'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'source_sha256':SHA,'changed_zip_entries':list(changes),'case':case,'product_status':'NOT_EXECUTED'})
if __name__=='__main__':make(pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]))
