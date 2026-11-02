# -*- coding: utf-8 -*-
from pathlib import Path
import zipfile,xml.etree.ElementTree as E,re,copy
N='http://schemas.openxmlformats.org/spreadsheetml/2006/main';R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';PK='http://schemas.openxmlformats.org/package/2006/relationships';CT='http://schemas.openxmlformats.org/package/2006/content-types'
E.register_namespace('',N);E.register_namespace('r',R)
def q(t):return '{'+N+'}'+t
def col(n):
 s=''
 while n:n,j=divmod(n-1,26);s=chr(65+j)+s
 return s
def ci(ref):
 n=0
 for c in re.match('[A-Z]+',ref)[0]:n=n*26+ord(c)-64
 return n
def xml(e):return E.tostring(e,encoding='utf-8',xml_declaration=True)
class Book:
 def __init__(self,path):
  self.path=Path(path)
  with zipfile.ZipFile(path)as z:self.parts={n:z.read(n)for n in z.namelist()};assert z.testzip()is None
  self.strings=[]
  if'xl/sharedStrings.xml'in self.parts:self.strings=[''.join(x.itertext())for x in E.fromstring(self.parts['xl/sharedStrings.xml']).findall(q('si'))]
  self.wb=E.fromstring(self.parts['xl/workbook.xml']);self.rels=E.fromstring(self.parts['xl/_rels/workbook.xml.rels']);self.ct=E.fromstring(self.parts['[Content_Types].xml']);self.paths={};self.trees={};self.rowcache={}
  rels={r.get('Id'):r.get('Target')for r in self.rels}
  for sh in self.wb.find(q('sheets')):
   target=rels[sh.get('{'+R+'}id')];self.paths[sh.get('name')]=target.lstrip('/')if target.startswith('/')else'xl/'+target
 def sheet(self,name):
  if name not in self.trees:self.trees[name]=E.fromstring(self.parts[self.paths[name]])
  return self.trees[name]
 def rows(self,name):return self.sheet(name).find(q('sheetData')).findall(q('row'))
 def value(self,c):
  if c is None:return ''
  if c.get('t')=='inlineStr':return ''.join(c.find(q('is')).itertext())
  v=c.find(q('v'));s=v.text if v is not None and v.text is not None else''
  return self.strings[int(s)]if c.get('t')=='s'else s
 def values(self,row):return {ci(c.get('r')):self.value(c)for c in row.findall(q('c'))}
 def table(self,name):
  rows=self.rows(name);headers=self.values(next(r for r in rows if r.get('r')=='2'));data=[]
  for r in rows:
   if int(r.get('r'))<=2:continue
   values=self.values(r);data.append(dict({v:values.get(k,'')for k,v in headers.items()},_row=int(r.get('r'))))
  return data,headers
 def cell(self,name,r,c,value,style=None):
  sd=self.sheet(name).find(q('sheetData'))
  if name not in self.rowcache:self.rowcache[name]={x.get('r'):x for x in sd}
  row=self.rowcache[name].get(str(r))
  if row is None:row=E.SubElement(sd,q('row'),{'r':str(r),'ht':'18','customHeight':'1'});self.rowcache[name][str(r)]=row
  ref=col(c)+str(r);old=next((x for x in row if x.get('r')==ref),None);st=style if style is not None else old.get('s','0')if old is not None else'0'
  if old is not None:row.remove(old)
  if value is None or value=='':return
  x=E.Element(q('c'),{'r':ref,'s':str(st)})
  if isinstance(value,(int,float)):E.SubElement(x,q('v')).text=str(value)
  else:
   x.set('t','inlineStr');t=E.SubElement(E.SubElement(x,q('is')),q('t'));t.set('{http://www.w3.org/XML/1998/namespace}space','preserve');t.text=str(value)
  at=next((i for i,a in enumerate(row)if ci(a.get('r'))>c),len(row));row.insert(at,x)
 def update(self,name,r,changes):
  _,h=self.table(name);index={v:k for k,v in h.items()}
  for key,value in changes.items():self.cell(name,r,index[key],value)
 def summary(self,name,text):self.cell(name,1,1,'综述：'+text)
 def addcols(self,name,fields,compute):
  data,h=self.table(name);start=max(h,default=0)+1
  headerrow=next(r for r in self.rows(name)if r.get('r')=='2');style=headerrow.find(q('c')).get('s','0')
  for i,f in enumerate(fields,start):self.cell(name,2,i,f,style)
  for row in data:
   values=compute(row)
   for i,k in enumerate(fields,start):self.cell(name,row['_row'],i,values.get(k,''))
  self.resize(name)
 def resize(self,name,hidden=()):
  s=self.sheet(name);rows=self.rows(name);maxc=max(ci(c.get('r'))for r in rows for c in r);maxr=max(int(r.get('r'))for r in rows)
  dim=s.find(q('dimension'))
  if dim is not None:dim.set('ref',f'A1:{col(maxc)}{maxr}')
  af=s.find(q('autoFilter'))
  if af is not None:af.set('ref',f'A2:{col(maxc)}{maxr}')
  cols=s.find(q('cols'))
  if cols is None:cols=E.Element(q('cols'));s.insert(list(s).index(s.find(q('sheetData'))),cols)
  cols.clear();h=self.values(next(r for r in rows if r.get('r')=='2'))
  for i in range(1,maxc+1):
   label=h.get(i,'');width=48 if any(k in label for k in ['说明','规则','依据','备注','状态'])else 24 if any(k in label for k in ['时刻','日期','名称'])else 18
   attrs={'min':str(i),'max':str(i),'width':str(width),'customWidth':'1'}
   if label in hidden:attrs['hidden']='1'
   E.SubElement(cols,q('col'),attrs)
  for row in rows:row.set('ht','18'if row.get('r')!='1'else'23');row.set('customHeight','1')
 def replace_table(self,name,headers,rows,summary):
  sd=self.sheet(name).find(q('sheetData'));sd.clear();self.rowcache.pop(name,None);self.summary(name,summary)
  for i,h in enumerate(headers,1):self.cell(name,2,i,h)
  for ri,row in enumerate(rows,3):
   vals=[row.get(k,'')for k in headers]if isinstance(row,dict)else row
   for i,v in enumerate(vals,1):self.cell(name,ri,i,v)
  self.resize(name)
 def add(self,name,headers,rows,summary,first=False):
  sid=max(int(x.get('sheetId'))for x in self.wb.find(q('sheets')))+1;rid='rIdV2Sheet'+str(sid);path=f'xl/worksheets/sheet{sid}.xml';self.paths[name]=path
  sh=E.Element(q('sheet'),{'name':name,'sheetId':str(sid),'{'+R+'}id':rid});ss=self.wb.find(q('sheets'));ss.insert(0,sh)if first else ss.append(sh)
  E.SubElement(self.rels,'{'+PK+'}Relationship',{'Id':rid,'Type':R+'/worksheet','Target':f'worksheets/sheet{sid}.xml'})
  E.SubElement(self.ct,'{'+CT+'}Override',{'PartName':'/'+path,'ContentType':'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'})
  root=E.Element(q('worksheet'));E.SubElement(root,q('dimension'),{'ref':'A1'});view=E.SubElement(E.SubElement(root,q('sheetViews')),q('sheetView'),{'workbookViewId':'0','zoomScale':'90','showGridLines':'0'});E.SubElement(view,q('pane'),{'ySplit':'2','topLeftCell':'A3','activePane':'bottomLeft','state':'frozen'});E.SubElement(root,q('sheetFormatPr'),{'defaultRowHeight':'18'});E.SubElement(root,q('sheetData'));E.SubElement(root,q('autoFilter'),{'ref':'A2'});self.trees[name]=root;self.replace_table(name,headers,rows,summary)
 def save(self,path):
  for name,tree in self.trees.items():self.parts[self.paths[name]]=xml(tree)
  self.parts['xl/workbook.xml']=xml(self.wb);self.parts['xl/_rels/workbook.xml.rels']=xml(self.rels);self.parts['[Content_Types].xml']=xml(self.ct)
  with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED)as z:
   for name,b in self.parts.items():
    info=zipfile.ZipInfo(name,date_time=(2026,11,2,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,b)
