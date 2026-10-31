"""External stdlib HTTP driver for the real isolated application/Worker.
Usage: python3 qa/workbook-dev-http.py BASE_URL ORIGINAL.xlsx MUTATIONS_DIR OUTPUT_DIR
Does not start an application or install dependencies on the host.
"""
import base64,hashlib,json,pathlib,sys,time,urllib.request,urllib.error,gzip
BASE,ORIGINAL,MUTATIONS,OUT=sys.argv[1:];OUT=pathlib.Path(OUT);OUT.mkdir(parents=True,exist_ok=True)
records=[];prefix='HTTP-'+str(int(time.time()));dataset=prefix
def call(p,b=None,code=200):
 data=json.dumps(dict(reason='显式可替换仿真HTTP自验',**b),ensure_ascii=False).encode() if b is not None else None
 req=urllib.request.Request(BASE+'/api'+p,data=data,headers={'Content-Type':'application/json','X-APS-Request':'workbench'})
 try:
  response=urllib.request.urlopen(req,timeout=90);status=response.status;raw=response.read()
 except urllib.error.HTTPError as e:status=e.code;raw=e.read()
 assert status==code,(p,status,raw[:700])
 return json.loads(raw) if raw[:1] in [b'{',b'['] else raw
def check(id,**facts):
 records.append(dict(id=id,status='PASS',facts=facts));(OUT/'http-checks.json').write_text(json.dumps(dict(dataset=dataset,checks=records),ensure_ascii=False,indent=2));print('PASS',id,flush=True)
def b64(path):return base64.b64encode(pathlib.Path(path).read_bytes()).decode()
def row_query(t,q=''):
 return call('/workbooks/datasets/'+dataset+'/rows?table='+urllib.parse.quote(t)+'&q='+urllib.parse.quote(q))
def poll(id):
 for _ in range(180):
  r=call('/workbooks/runs/'+id)
  if r['status'] not in ['queued','running']:return r
  time.sleep(.2)
 raise ValueError('Worker did not finish')
def edit(t,key,changes):
 global version
 r=call('/workbooks/datasets/'+dataset+'/edit',dict(expectedVersion=version,table=t,key=key,changes=changes));version=r['version'];return r
before=call('/state');p=call('/workbooks/preview',dict(datasetId=dataset,fileBase64=b64(ORIGINAL)));assert len(p['classification'])==29 and not p['issues'];check('IN-01',classifications=p['classification'],fileHash=p['fileHash'])
r=call('/workbooks/commit',dict(previewId=p['id'],fileHash=p['fileHash'],expectedVersion=0));version=r['version'];assert call('/state')['data']==before['data'];assert not r['readiness']['ready'];check('IN-29-unmapped',gaps=[i['code'] for i in r['readiness']['issues']])
expected={'物料主数据':140,'物料清单':317,'供应商与供货条件':215,'工艺路线':87,'期初库存':420,'既有采购在途':55,'期初在制':8,'每日需求':2150}
for t,n in expected.items():assert row_query(t)['total']==n
check('IN-02',counts=expected,legacyUnchanged=True)
again=call('/workbooks/commit',dict(previewId=p['id'],fileHash=p['fileHash'],expectedVersion=0));assert again['version']==version and again['idempotent'];assert call('/workbooks/previews/'+p['id'])['status']=='committed';check('IN-03',sameVersion=version,recoverable=True)
for name,code in [('IN04-unknown-child','FOREIGN_KEY'),('IN05-duplicate-header','DUPLICATE_HEADER'),('IN05-unknown-column','UNKNOWN_FIELD'),('IN07-unknown-formula','INVALID_FORMULA'),('IN07-external-formula','INVALID_FORMULA'),('IN17-bom-cycle','BOM_CYCLE'),('IN17-overlap-version','BOM_VERSION_OVERLAP')]:
 p=call('/workbooks/preview',dict(datasetId=prefix+'-'+name,fileBase64=b64(pathlib.Path(MUTATIONS)/(name+'.xlsx'))));assert any(i['code']==code for i in p['issues']),(name,p['issues'][:3]);call('/workbooks/commit',dict(previewId=p['id'],fileHash=p['fileHash'],expectedVersion=0),422);assert call('/workbooks/datasets/'+dataset)['version']==version;check(name,expectedCode=code,sourceIssue=p['issues'][0],atomic=True)
for name in ['IN05-valid-reorder','IN06-stale-cache']:
 p=call('/workbooks/preview',dict(datasetId=prefix+'-'+name,fileBase64=b64(pathlib.Path(MUTATIONS)/(name+'.xlsx'))));assert not p['issues'],p['issues'][:3]
 if name=='IN06-stale-cache':assert any(w['cell']=='G3' and w['value']=='4' for w in p['warnings'])
 check(name,warnings=p['warnings'][:3])
assert row_query('每日成品汇总')['total']==430 and row_query('每日需求')['total']==2150;check('IN-08',inputRows=2150,referenceRows=430)
for t,q in [('每日需求','FG001'),('期初库存','LT003'),('设备与工装','EG003'),('供应商与供货条件','PA0001')]:assert row_query(t,q)['total']>0
check('IN-09',fourCategories=True,serverQuery=True)
edit('物料主数据','FG001',{'生产提前期天数':'4'});assert row_query('物料主数据','FG001')['rows'][0]['累计提前期天数']=='13';assert row_query('配置参数','PA0001')['rows'][0]['参数值']=='4';check('IN-10',sameParameter='PA0001',cumulativeLead=13)
call('/workbooks/datasets/'+dataset+'/edit',dict(expectedVersion=version-1,table='物料主数据',key='FG001',changes={'物料名称':'不得覆盖'}),409);call('/workbooks/datasets/'+dataset+'/edit',dict(expectedVersion=version,table='物料主数据',key='FG001',operation='delete'),422);check('IN-11',staleRejected=True,referenceDeleteRejected=True)
mapping=call('/workbooks/simulation');r=call('/workbooks/datasets/'+dataset+'/mapping',dict(expectedVersion=version,mapping=mapping));version=r['version'];assert r['readiness']['ready'],r['readiness']['issues'];check('IN-29-mapped',finiteResources=len(mapping['resources']),sfRoutes=len(mapping['sfRoutes']))
first_id=row_query('每日需求')['rows'][0]['需求编号'];created=call('/workbooks/datasets/'+dataset+'/run',dict(version=version,selection=dict(startDay=1,endDay=15,currentDay=1,demandIds=[first_id])),202);run=poll(created['id']);assert run['status'] in ['completed','partial'],run;assert run['result']['demandSummary']['totalKg']==180;old=call('/workbooks/runs/'+run['id']+'/inputs');old_csv=call('/workbooks/runs/'+run['id']+'/export');check('IN-30',realWorker=True,runId=run['id'],summary=run['result']['demandSummary'],verification=run['result']['verification'])
edit('每日需求',first_id,{'需求箱数':'31'});created=call('/workbooks/datasets/'+dataset+'/run',dict(version=version,selection=dict(startDay=1,endDay=15,currentDay=1,demandIds=[first_id])),202);changed=poll(created['id']);assert changed['result']['demandSummary']['totalKg']==186;assert call('/workbooks/runs/'+run['id']+'/inputs')==old;assert call('/workbooks/runs/'+run['id']+'/export')==old_csv;check('IN-31',newKg=186,oldFrozenSame=True,oldCsvHash=hashlib.sha256(old_csv).hexdigest())
# Material/storage boundary through the real save API.
lot=row_query('期初库存','LT003')['rows'][0];call('/workbooks/datasets/'+dataset+'/edit',dict(expectedVersion=version,table='期初库存',key='LT003',changes={'期初已占用量':'999999'}),422)
bad_location=row_query('库区库位','WH01L01')['rows'][0]['库位编号'];call('/workbooks/datasets/'+dataset+'/edit',dict(expectedVersion=version,table='期初库存',key='LT003',changes={'库位编号':bad_location}),422);check('IN-23',wrongEnvironmentRejected=True,negativeAvailabilityRejected=True)
unsupported=json.loads(json.dumps(mapping));unsupported['capabilities_required'].append('UNSUPPORTED-TEST');r=call('/workbooks/datasets/'+dataset+'/mapping',dict(expectedVersion=version,mapping=unsupported));version=r['version'];assert not r['readiness']['ready'];call('/workbooks/datasets/'+dataset+'/run',dict(version=version,selection={}),422);check('IN-34',necessaryCapabilityBlocked=True);r=call('/workbooks/datasets/'+dataset+'/mapping',dict(expectedVersion=version,mapping=mapping));version=r['version']
# Full first window; a partial capacity/material result is a real outcome, not unsupported admission.
created=call('/workbooks/datasets/'+dataset+'/run',dict(version=version,selection=dict(startDay=1,endDay=15,currentDay=1)),202);full=poll(created['id']);assert full['status'] in ['completed','partial'],full;assert full['result']['demandSummary']['records']==700 and full['result']['verification']['status']=='pass';check('IN-12-14-15-25-full',summary=full['result']['demandSummary'],tasks=len(full['result']['tasks']),verification=full['result']['verification'],findings=len(full['result']['findings']))
(OUT/'full-run.json').write_bytes(json.dumps(full,ensure_ascii=False,indent=2).encode());(OUT/'frozen-v1.json.gz').write_bytes(gzip.compress(json.dumps(old,ensure_ascii=False).encode()));(OUT/'old-export.csv').write_bytes(old_csv)
check('IN-33',oldMinuteStateUnchanged=call('/state')['data']==before['data'])
print(json.dumps(dict(result='PASS_EXTERNAL_HTTP_CORE',checks=len(records),dataset=dataset,version=version,oldRun=run['id'],fullRun=full['id'])),flush=True)
