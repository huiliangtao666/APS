#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Read-only offline FR036 deliverable checker. No installs/network/live mutations."""
import csv,hashlib,json,pathlib,re,subprocess
R=pathlib.Path(__file__).resolve().parents[1]
B=R/'docs/fr036-delivery'
def load(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def need(ok,msg):
 if not ok: raise ValueError(msg)
def main():
 manifest=load(B/'MANIFEST-SHA256.json')
 for name,h in manifest.items():
  p=(R/name).resolve();need(p.is_relative_to(R.resolve()),'Unsafe path');need(sha(p)==h,'Changed file '+name)
 actual={str(p.relative_to(R)) for p in (R/'public/fr036').rglob('*') if p.is_file()}|{str(p.relative_to(R)) for p in B.rglob('*') if p.is_file() and p.name!='MANIFEST-SHA256.json'}
 need(actual <= set(manifest),'Unlisted delivery file')
 source=load(R/'qa/fr036-source-sha256.json')
 for f,h in source['files'].items():need(sha(R/f)==h,'Changed source '+f)
 matrix=load(R/'public/fr036/matrix.json');samples=load(R/'public/fr036/samples.json')['samples']
 need(len(matrix['inbound'])==24 and len(matrix['chapter9'])==19 and len(matrix['outbound'])==6,'Category counts')
 for s in samples:need(sha(R/'public/fr036'/s['file'])==s['sha256'],'Changed sample '+s['file'])
 for d in matrix['inbound']:
  with (R/'public/fr036'/d['template']).open(encoding='utf-8-sig',newline='') as f:need(list(csv.reader(f))==[d['fields']],'Template header '+d['key'])
 for d in matrix['outbound']:need(any(s['file']==d['example'] for s in samples),'Unlisted export')
 # Only App adds one guide; preserve every prior product module, including FR038 and issue23 repair.
 pin=matrix['baseSHA'];subprocess.run(['git','merge-base','--is-ancestor',pin,'HEAD'],cwd=R,check=True)
 def original(f):return subprocess.check_output(['git','show',pin+':'+f],cwd=R)
 app=(R/'src/App.tsx').read_bytes().replace(b"import {ExchangeGuide} from './ExchangeGuide';\n",b'').replace(b'        <ExchangeGuide current={currentDef}/>\n',b'')
 need(app==original('src/App.tsx'),'Unexpected App change')
 old=load(R/'qa/fr038-source-sha256.json')
 for f in old['files']:
  if f!='src/App.tsx':need((R/f).read_bytes()==original(f),'Changed upstream product '+f)
 counts={}
 for p in (B/'evidence/tests').glob('*.log'):
  t=p.read_text();n=re.findall(r'^# tests (\d+)$',t,re.M)
  if n:
   for k in ['fail','cancelled','skipped','todo']:need(re.findall(r'^# '+k+r' (\d+)$',t,re.M)==['0']*len(n),'Nonpassing '+str(p))
   need(re.findall(r'^# pass (\d+)$',t,re.M)==n,'Incomplete TAP '+str(p));counts[p.stem]=sum(map(int,n))
 summary=load(B/'validation-summary.json');need(counts==summary['tapBySuite'],'TAP counts')
 for f,key in [('fr035-browser-report.json','completed'),('fr038-browser-report.json','complete'),('fr036-browser-report.json','complete')]:
  report=load(B/'evidence'/f);need(report[key] and not report['errors'],'Browser failure '+f);need(report['sourceHashes']==source['files'],'Browser source '+f)
 need(sha(pathlib.Path(__file__))==manifest['qa/fr036-check.py'],'Checker hash')
 print(json.dumps(dict(result='PASS',hashedFiles=len(manifest),sourceFiles=len(source['files']),templates=24,chapterCategories=19,samples=len(samples),tapBySuite=counts,actualTAPTotal=sum(counts.values()),browser=summary['browser'],issue23='independent Test passed/closed per incoming delivery; old package is historical',publication=False),ensure_ascii=False,indent=2))
if __name__=='__main__':main()
