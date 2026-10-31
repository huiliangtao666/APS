"""Independent stdlib Fraction/event/CSV oracle. Usage: python3 qa/b16-test-oracle.py <evidence-dir>."""
import csv,hashlib,json,pathlib,sys
from fractions import Fraction as F
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]); records=json.loads((out/'results.json').read_text()); by={r['id']:r for r in records};checks=[]
def check(name,condition):
 assert condition,name
 checks.append({'id':name,'status':'PASS'})
def exact(v):return F(int(v['numerator']),int(v['denominator']))
for record in records:
 result=record['result']
 if result.get('status')!='pass' or 'checks' not in result:continue
 f=record['input'];d=f['data'];p=f['plan'];prefix=record['id']
 expected={(o['订单编号'],r['工序编号']) for o in d['orders'] for r in d['routes'] if r['产品编号']==o['产品编号']}
 check(prefix+':coverage',expected=={(t['orderId'],t['operation']) for t in p['tasks']} and len(expected)==len(p['tasks']))
 check(prefix+':applicability',all(t['lineId'] in next(r['lineIds'] for r in f['profile']['products'] if r['productId']==t['productId']) for t in p['tasks']))
 check(prefix+':precedence',all(not t['predecessor'] or next(x['end'] for x in p['tasks'] if x['id']==t['predecessor'])<=t['start'] for t in p['tasks']))
 check(prefix+':calendar',all(any(c['是否工作']=='是' and F(c['起始分钟'])<=t['start'] and F(c['结束分钟'])>=t['end'] for c in d['calendars']) for t in p['tasks']))
 check(prefix+':due',all(max(t['end'] for t in p['tasks'] if t['orderId']==o['订单编号'])+F(next(x['模拟交付等待分钟'] for x in d['products'] if x['产品编号']==o['产品编号']))<=F(o['要求可交付分钟']) for o in d['orders']))
 for resource in f['profile']['resources']:
  rows=[r for r in p['resourceReservations'] if r['type']==resource['type'] and r['resourceId']==resource['resourceId']]
  points=sorted({x for r in rows for x in [r['start'],r['end']]})
  peak=max([sum((F(r['quantity']) for r in rows if r['start']<=t<r['end']),F(0)) for t in points]+[F(0)])
  check(prefix+':global:'+resource['resourceId'],peak<=F(resource['capacity']))
 for pool in d['personnelPools']:
  members={g['人员组编号'] for g in d['personnelGroups'] if g.get('poolId')==pool['poolId']};rows=[r for r in p['resourceReservations'] if r['type']=='人员' and r['resourceId'] in members]
  check(prefix+':physical:'+pool['poolId'],all(sum(F(r['quantity']) for r in rows if r['start']<=t<r['end'])<=F(pool['总人数']) for t in {x for r in rows for x in [r['start'],r['end']]}))
 used={}
 for row in p['materialDemands']:
  order=next(o for o in d['orders'] if o['订单编号']==row['orderId']);product=next(x for x in d['products'] if x['产品编号']==order['产品编号']);bom=next(b for b in d['bom'] if b['产品编号']==order['产品编号'] and b['物料编号']==row['materialId'])
  expectedQty=(F(order['合格需求'])-F(order.get('已完成合格数量','0')))/F(product['总收率'])*F(bom['配置用量'])/1000
  check(prefix+':formula:'+row['taskId']+':'+row['materialId'],exact(row['exactQuantity'])==expectedQty)
  check(prefix+':sum:'+row['taskId']+':'+row['materialId'],sum((exact(a['exactQuantity']) for a in row['allocations']),F(0))==expectedQty and row['committed'] and row['shortage']==0)
  for a in row['allocations']:
   k=('supply' if a['conditional'] else 'inventory',a['supplyId'] if a['conditional'] else a['lotId']);used[k]=used.get(k,F(0))+exact(a['exactQuantity'])
 for (kind,id),quantity in used.items():
  src=next(r for r in d['supplies' if kind=='supply' else 'inventory'] if r['供给编号' if kind=='supply' else '批次编号']==id)
  cap=F(src['预计数量']) if kind=='supply' else F(src['账面数量'])-F(src['已占用数量'])
  check(prefix+':conservation:'+kind+':'+id,quantity<=cap)
check('literal:lean-demand',F('240')/F('.96')*F('650')/1000==F('162.5'))
check('negative:exact-gap0.1',exact(next(r for r in by['exact-gap0.1']['result']['plan']['materialDemands'] if r['taskId']=='B-MIX' and r['materialId']=='LEAN')['exactShortage'])==F('0.1'))
check('literal:two-only',F('162.5')*2==F('325') and F('162.5')*3>F('325'))
check('feed89:shortage',next(r for r in by['feed89']['result']['plan']['materialDemands'] if r['taskId']=='B-MIX' and r['materialId']=='LEAN')['shortage']==162.5)
check('third-order:shortage',next(r for r in by['third-order']['result']['plan']['materialDemands'] if r['taskId']=='C-MIX' and r['materialId']=='LEAN')['shortage']==162.5)
for name,resource,start,end,cap in [('overlap','G01',30,60,1),('overlap','LP01',30,60,1),('overlap1','G01',59,60,1),('source-labor-overlap','LP01',30,60,1),('physical-pool-overlap','PHYSICAL-LP',30,60,1)]:
 findings=by[name]['result']['findings'];check('negative:'+name+':'+resource,any(f.get('interval',{}).get('resourceId')==resource and [f['interval'][k] for k in ['start','end','demand','effectiveCapacity']]==[start,end,2,cap] for f in findings))
profile=json.loads((out/'mapping-profile.json').read_text());rows=list(csv.DictReader((out/'mapping.csv').open(newline='',encoding='utf8')))
check('csv:metadata-literal',all(r['source']==profile['source'] and r['version']==profile['version'] and r['mock']=='true' for r in rows))
check('csv:unique-mappings',len(rows)==8 and len({(r['kind'],r['id']) for r in rows})==8)
check('csv:resource-capacity',all(r['capacity']=='1' and r['lineIds']=='L01|L02' for r in rows if r['kind']=='resource'))
manifest=json.loads((root/'sample-data/source-manifest.json').read_text());source=[r for r in manifest['copied_files'] if r['path'].startswith('sample-data/UAT-16/')]
for r in source:
 b=(root/r['path']).read_bytes();check('source:'+r['path'],len(b)==r['size_bytes'] and hashlib.sha256(b).hexdigest()==r['sha256'])
result={'tool':'Python stdlib Fraction, independent event sums and csv parser; no product imports','checks':checks,'count':len(checks),'source_files':len(source),'source_zip_sha256':manifest['source_zip_sha256']}
(out/'oracle.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'checks':len(checks),'source_files':len(source),'status':'PASS'}))
