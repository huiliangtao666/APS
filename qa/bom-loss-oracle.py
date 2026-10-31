"""Independent Python Fraction oracle. No APS modules are imported."""
import json,sys,pathlib
from fractions import Fraction as F
out=pathlib.Path(sys.argv[1])
s=json.loads((out/'example-snapshot.json').read_text()); actual=s['result']
def frac(x):return F(int(x['numerator']),int(x['denominator']))
q=[F(650),F(150),F(150),F(50)]; losses=[F(2,100),F(4,100),F(10,100),F(0)]
kept=[a*(1-b) for a,b in zip(q,losses)]; O=sum(kept); Q=sum(q); T=F(240)
expected={'Q':str(Q),'O':str(O),'yield':str(O/Q),'targetInput':[str(v*T/O) for v in q],'targetOutput':[str(v*T/O) for v in kept],'targetTotalInput':str(Q*T/O),'targetTotalOutput':str(T)}
assert frac(actual['totalInput'])==Q and frac(actual['totalOutput'])==O and frac(actual['yield'])==O/Q
for i,row in enumerate(actual['rows']):
 assert frac(row['input'])==q[i] and frac(row['output'])==kept[i]
 assert frac(row['targetInput'])==q[i]*T/O and frac(row['targetOutput'])==kept[i]*T/O
assert sum(frac(r['targetOutput'])for r in actual['rows'])==T
assert sum(frac(r['targetInput'])for r in actual['rows'])==Q*T/O
# Browser snapshot must match the independently derived example, not display decimals.
browser=json.loads((out/'browser-frozen-snapshot.json').read_text())
assert {k:v for k,v in browser['result'].items() if k!='configVersion'}=={k:v for k,v in actual.items() if k!='configVersion'}
# Raw and transport losses cannot participate in production arithmetic.
saved=json.loads((out/'browser-saved-config.json').read_text());assert saved['unified']['production']=='100'
assert browser['config']['unified']['production']=='0'
(out/'oracle-expected.json').write_text(json.dumps(expected,indent=2)+'\n')
print('PASS: independent Fraction expected -> domain snapshot -> browser frozen JSON; mass conservation and historical isolation')
