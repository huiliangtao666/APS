"""Dependency-free OOXML export; every cell is text, never a formula."""
from pathlib import Path
from xml.etree import ElementTree as E
from zipfile import ZipFile, ZIP_DEFLATED

S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
P = 'http://schemas.openxmlformats.org/package/2006/relationships'
C = 'http://schemas.openxmlformats.org/package/2006/content-types'
E.register_namespace('', S)
E.register_namespace('r', R)

def xml(root):
    return E.tostring(root, encoding='utf-8', xml_declaration=True)

def cell_column(n):
    value = ''
    while n:
        n, r = divmod(n - 1, 26)
        value = chr(65 + r) + value
    return value

def write_workbook(path, sheets):
    path = Path(path)
    workbook = E.Element(f'{{{S}}}workbook')
    book_views = E.SubElement(workbook, f'{{{S}}}bookViews')
    E.SubElement(book_views, f'{{{S}}}workbookView', activeTab='0')
    tab_nodes = E.SubElement(workbook, f'{{{S}}}sheets')
    workbook_rels = E.Element('Relationships', xmlns=P)
    types = E.Element('Types', xmlns=C)
    for extension, content in [('rels', 'application/vnd.openxmlformats-package.relationships+xml'), ('xml', 'application/xml')]:
        E.SubElement(types, 'Default', Extension=extension, ContentType=content)
    E.SubElement(types, 'Override', PartName='/xl/workbook.xml', ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')
    E.SubElement(types, 'Override', PartName='/xl/styles.xml', ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml')
    styles = '''<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF234E70"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F5FA"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>'''
    with ZipFile(path, 'w', ZIP_DEFLATED) as z:
        for index, (title, headers, rows) in enumerate(sheets, 1):
            assert len(title) <= 31
            E.SubElement(tab_nodes, f'{{{S}}}sheet', name=title, sheetId=str(index), attrib={f'{{{R}}}id': f'rId{index}'})
            E.SubElement(workbook_rels, 'Relationship', Id=f'rId{index}', Type=R + '/worksheet', Target=f'worksheets/sheet{index}.xml')
            E.SubElement(types, 'Override', PartName=f'/xl/worksheets/sheet{index}.xml', ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml')
            sheet = E.Element(f'{{{S}}}worksheet')
            end = cell_column(len(headers)) + str(len(rows) + 1)
            E.SubElement(sheet, f'{{{S}}}dimension', ref='A1:' + end)
            views = E.SubElement(sheet, f'{{{S}}}sheetViews')
            view = E.SubElement(views, f'{{{S}}}sheetView', workbookViewId='0')
            E.SubElement(view, f'{{{S}}}pane', ySplit='1', topLeftCell='A2', activePane='bottomLeft', state='frozen')
            cols = E.SubElement(sheet, f'{{{S}}}cols')
            for col, header in enumerate(headers, 1):
                width = 22
                if any(w in header for w in ['要求', '条文', '差异', '说明', '影响', '结论', '内容', '条件', '建议', '原因']):
                    width = 65
                elif any(w in header for w in ['链接', '证据', '位置', 'SHA', '编号', '版本']):
                    width = 35
                E.SubElement(cols, f'{{{S}}}col', min=str(col), max=str(col), width=str(width), customWidth='1')
            data = E.SubElement(sheet, f'{{{S}}}sheetData')
            hyperlinks = []
            rels = E.Element('Relationships', xmlns=P)
            for row_index, values in enumerate([headers] + list(rows), 1):
                assert len(values) == len(headers), title
                row = E.SubElement(data, f'{{{S}}}row', r=str(row_index), ht='30' if row_index == 1 else '90', customHeight='1')
                for col, raw in enumerate(values, 1):
                    value = '' if raw is None else str(raw)
                    assert len(value) <= 32767
                    ref = cell_column(col) + str(row_index)
                    cell = E.SubElement(row, f'{{{S}}}c', r=ref, t='inlineStr', s='1' if row_index == 1 else ('2' if row_index % 2 == 0 else '0'))
                    inline = E.SubElement(cell, f'{{{S}}}is')
                    E.SubElement(inline, f'{{{S}}}t', attrib={'{http://www.w3.org/XML/1998/namespace}space': 'preserve'}).text = value
                    if value.startswith('https://') and '\n' not in value and ' ' not in value:
                        link_id = 'rId' + str(len(hyperlinks) + 1)
                        hyperlinks.append((ref, link_id))
                        E.SubElement(rels, 'Relationship', Id=link_id, Type=R + '/hyperlink', Target=value, TargetMode='External')
            E.SubElement(sheet, f'{{{S}}}autoFilter', ref='A1:' + end)
            if hyperlinks:
                links = E.SubElement(sheet, f'{{{S}}}hyperlinks')
                for ref, link_id in hyperlinks:
                    E.SubElement(links, f'{{{S}}}hyperlink', ref=ref, attrib={f'{{{R}}}id': link_id})
                z.writestr(f'xl/worksheets/_rels/sheet{index}.xml.rels', xml(rels))
            z.writestr(f'xl/worksheets/sheet{index}.xml', xml(sheet))
        E.SubElement(workbook_rels, 'Relationship', Id='rIdStyles', Type=R + '/styles', Target='styles.xml')
        z.writestr('xl/workbook.xml', xml(workbook))
        z.writestr('xl/_rels/workbook.xml.rels', xml(workbook_rels))
        root_rels = E.Element('Relationships', xmlns=P)
        E.SubElement(root_rels, 'Relationship', Id='rId1', Type=R + '/officeDocument', Target='xl/workbook.xml')
        z.writestr('_rels/.rels', xml(root_rels))
        z.writestr('[Content_Types].xml', xml(types))
        z.writestr('xl/styles.xml', styles)
    with ZipFile(path) as z:
        assert z.testzip() is None
        for name in z.namelist():
            if name.endswith('.xml') or name.endswith('.rels'):
                E.fromstring(z.read(name))
        for i, (_, _, rows) in enumerate(sheets, 1):
            sheet = E.fromstring(z.read(f'xl/worksheets/sheet{i}.xml'))
            assert len(sheet.findall(f'{{{S}}}sheetData/{{{S}}}row')) == len(rows) + 1
