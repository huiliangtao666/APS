"""Offline Design example and provenance checks; never imports or runs product code."""
from pathlib import Path
from fractions import Fraction as F
import json,csv,hashlib
p=Path(__file__).resolve().parent
root=p.parents[1] if not (p/'N06-MOCK-CASES-r1.json').exists() else p
# In delivery directory this script may be next to the mock assets.
if not (root/'N06-MOCK-CASES-r1.json').exists():
 root=Path.cwd()
cs=json.loads((root/'N06-MOCK-CASES-r1.json').read_text())['cases'];cases={c['id']:c for c in cs}
def peak(rows):
 pts=sorted({r[k] for r in rows for k in ['start','end']})
 return max([sum(F(str(r['q'])) for r in rows if r['start']<=t<r['end']) for t in pts]+[F(0)])
results=[]
def check(name,condition):
 assert condition,name;results.append(name)
c=cases['S01'];i=c['inputs'];e=c['expected']
check('S01 adjacent half-open peak',peak([i['actual_tool'],i['candidate_adjacent']])==e['adjacent_peak'])
check('S01 replay overlap peak',peak([i['actual_tool'],i['replay_overlap']])==e['overlap_peak'])
c=cases['S07'];i=c['inputs'];e=c['expected'];old=i['old_actual'];new={**old,'q':i['correction']['q']}
check('S07 old-view peak',peak([old,i['replay_new_request']])==e['old_view_peak'])
check('S07 corrected view peak',peak([new,i['replay_new_request']])==e['new_view_peak'])
c=cases['S09'];i=c['inputs'];check('S09 single shared physical pool',peak([i['historical_actual'],i['candidate']])==c['expected']['replay_peak'])
c=cases['S10'];check('S10 one acquisition multiple members',peak([c['inputs']['actual_occupancy']])==c['expected']['physical_load'] and len(c['inputs']['membership'])==c['expected']['member_count'])
c=cases['S14'];i=c['inputs'];e=c['expected'];v=peak([i['A'],i['B']]);check('S14 space peak/excess',v==e['peak'] and v-i['capacity']==e['excess'])
c=cases['S11'];check('S11 declared coverage has missing item',sorted(set(c['inputs']['manifest'])-set(c['inputs']['rows']))==c['expected']['missing_items'])
for c in cs:
 check(c['id']+' traceability and NOT_EXECUTED markers',c['original_card_AC_responsibility'] and c['input_source'] and c['release_owner'] and c['completeness_or_failure_boundary'] and c['product_execution']==c['independent_test']==c['QA_UAT']=='NOT_EXECUTED')
for c in cs:
 def walk(x):
  if isinstance(x,dict):
   if all(k in x for k in ['start','end','observedAt']) and x['end'] is not None:assert x['start']<x['end']<=x['observedAt'],c['id']
   for v in x.values():walk(v)
  elif isinstance(x,list):
   for v in x:walk(v)
 walk(c['inputs'])
fs=list(csv.DictReader((root/'N06-FIELD-SOURCE-MATRIX-r1.csv').open(encoding='utf-8-sig')))
check('F01-F12 plus U01/U02/M01 covered exactly once',{r['id'] for r in fs}=={'F%02d'%j for j in range(1,13)}|{'U01','U02','M01'} and len(fs)==15)
result={'kind':'DESIGN_ONLY_CHECK_NOT_PRODUCT_TEST','arithmetic_and_coverage_checks':results,'finite_released_input_temporal_consistency':'PASS','mock_cases':len(cs),'field_matrix_rows':len(fs),'product_execution':'NOT_EXECUTED','QA_UAT':'NOT_EXECUTED'}
(root/'N06-DESIGN-CHECK-r1.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('offline Design checks',len(results),'cases',len(cs),'product NOT_EXECUTED')
