"""Check independent kit, or compare captures from a fixed real candidate.
No --observations => all 35 product assertions remain NOT_EXECUTED.
This entry never calls a substitute scheduler or treats fixture selfcheck as product PASS.
"""
import argparse, csv, hashlib, importlib.util, json, pathlib, re
from fractions import Fraction as F
Q=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('independent_oracle',Q/'input-data-upgrade-oracle.py')
oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
def j(name):return json.loads((Q/('input-data-upgrade-'+name+'.json')).read_text())
def selfcheck():
    src,sim=j('source'),j('simulation');t=src['tables'];expect=oracle.derive()
    assert src['workbook_bytes']==1672626 and len(src['sheet_names'])==29
    assert src['formula_cells']==4839 and src['direct_bindings']==4129
    assert expect==j('expected'),'Checked-in expected output drift; regenerate and review'
    ids=[r['id'] for r in sim['resources']];assert len(ids)==len(set(ids))==47
    assert sum(r['kind']=='设备' for r in sim['resources'])==33
    assert sum(r['kind']=='工装' for r in sim['resources'])==14
    assert all(F(r['units'])>0 for r in sim['resources'])
    assert all(F(r['daily_kg'])>0 for r in sim['resources'] if r['kind']=='设备')
    resources={r['id']:r for r in sim['resources']}
    assert len(set(i for pool in sim['tool_pools'].values() for i in pool))==14
    assert sum(len(pool) for pool in sim['tool_pools'].values())==14,'physical tool duplicated'
    rows=list(csv.DictReader((Q/'input-data-upgrade-sf-routes.csv').open()))
    mids={m['物料编号']:m for m in t['物料主数据']}
    sf=sorted(k for k in mids if k.startswith('SF'));assert len(sf)==20 and len(rows)==40
    by_step={r['路线工序编号']:r for r in rows};assert len(by_step)==40
    for i in sf:
        ops=sorted([r for r in rows if r['物料编号']==i],key=lambda r:int(r['工序顺序']))
        assert len(ops)==2 and mids[i]['物料来源']=='制造'
        assert sum(F(r['跨日历时天数']) for r in ops)==F(mids[i]['生产提前期天数'])
        assert ops[1]['前序工序编号']==ops[0]['路线工序编号']
        assert ops[1]['设备组编号']=='SIM-EG-SF'
    all_steps={r['路线工序编号']:r.get('成品编号',r.get('物料编号')) for r in t['工艺路线']+rows}
    assert len(sim['feed_mappings'])==317
    for feed in sim['feed_mappings']:assert all_steps[feed['route_step_id']]==feed['parent']
    assert len(sim['wip_remaining'])==8
    for w in sim['wip_remaining']:
        assert all_steps[w['current_route_step']]==w['product']
        assert resources[w['resource']]['group']=='EG012'
        assert w['remaining_route_steps'] and w['remaining_material_bom_ids']
        assert all(all_steps[i]==w['product'] for i in w['remaining_route_steps'])
        assert F(w['remaining_labor_count'])>0 and F(w['remaining_tool_count'])>0
    assert len([w for w in sim['wip_remaining'] if w['current_occupancy_day_interval'][0]<=1<w['current_occupancy_day_interval'][1]])==4
    assert F(**{k:int(v) for k,v in expect['IN-18']['child_kg'].items()})==F('177.0833334')
    assert expect['IN-26']['suggested_kg']==[oracle.exact(200),oracle.exact(250)]
    assert expect['IN-27']=={'theoretical_order_day':1,'earliest_order_day':2,'available_day':6,'late_days':1}
    assert expect['IN-08']['first_window_kg']==oracle.exact(65464)
    assert expect['IN-13']['B0_minutes']==-3360 and expect['IN-13']['B1_minutes']==-1920
    matrix=list(csv.DictReader((Q/'input-data-upgrade-matrix.csv').open()))
    ids={f'IN-{i:02}' for i in range(1,36)}
    assert {r['id'] for r in matrix}==ids and len(matrix)==35
    assert set(j('facts'))==ids
    closure=list(csv.DictReader((Q/'input-data-upgrade-closure.csv').open()))
    assert len(closure)==27
    return {'kit_result':'PASS','checks':['original fingerprint/counts','Fraction numeric anchors','all-140-material lead recursion','no cache execution','unique finite physical resources','20SF complete route/sum','317 parent-specific feed mappings','8WIP positive remaining work/material','day1 WIP occupancy'],'product_sha':None,'product_result':'NOT_EXECUTED'}

def compare(observations,out):
    matrix=list(csv.DictReader((Q/'input-data-upgrade-matrix.csv').open()))
    captured=json.loads(observations.read_text()) if observations else None
    report={'event_key':'dlv_a338ccb3-b546-46bf-986d-d161690a2b94:r1','dispatch_event_key':'design:input-data-upgrade:20261031:r1:Test','product_sha':None,'card_recommendation':'NOT_READY','assertions':[]}
    if captured:
        assert re.fullmatch('[0-9a-f]{40}',captured.get('product_sha','')),'Need actual fixed full product SHA'
        assert captured.get('deployment_fingerprint') and captured.get('frozen_input_fingerprint')
        report['product_sha']=captured['product_sha']
    expected=j('facts');actual={r['id']:r for r in captured['assertions']} if captured else {}
    if captured:assert len(actual)==len(captured['assertions']),'duplicate assertion capture'
    for row in matrix:
        i=row['id'];r=actual.get(i);status='NOT_EXECUTED';detail='Real fixed-candidate observations not supplied'
        if r:
            if r.get('status')=='NOT_EXECUTED':detail=r.get('reason',detail)
            else:
                errors=[]
                if r.get('product_sha')!=report['product_sha']:errors.append('row SHA mismatch')
                if r.get('observed')!=expected[i]:errors.append('observed facts differ from independent expected projection')
                evidence=r.get('evidence',[])
                required=set(row['required_evidence_kinds'].split(';'))
                if not required.issubset({e.get('kind') for e in evidence}):errors.append('missing applicable execution path evidence')
                for e in evidence:
                    path=(observations.parent/e.get('path','')).resolve()
                    if not path.is_file():errors.append('missing evidence '+str(path));continue
                    if hashlib.sha256(path.read_bytes()).hexdigest()!=e.get('sha256'):errors.append('evidence hash mismatch '+str(path))
                status='FAIL' if errors else 'PASS';detail='; '.join(errors) if errors else 'Captured facts match; path evidence hashes verified. Reviewer must inspect linked execution evidence.'
        report['assertions'].append({'id':i,'owner_issue':row['owner_issue'],'status':status,'detail':detail,'expected':expected[i],'classification':'CAPTURE_COMPARISON_REQUIRES_EXECUTION_EVIDENCE_REVIEW' if r else 'PRODUCT_NOT_EXECUTED','confirmed_product_defect':False})
    report['result']='NOT_EXECUTED' if all(r['status']=='NOT_EXECUTED' for r in report['assertions']) else 'FAIL' if any(r['status']=='FAIL' for r in report['assertions']) else 'PASS' if all(r['status']=='PASS' for r in report['assertions']) else 'PARTIAL'
    # Kit/capture validation does not set whole-card completion or QA/UAT verdict.
    report['uat']='NOT_EXECUTED_BY_THIS_ENTRY';out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    return {'result':report['result'],'product_sha':report['product_sha'],'counts':{s:sum(r['status']==s for r in report['assertions']) for s in ['PASS','FAIL','NOT_EXECUTED']}}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--selfcheck',action='store_true');p.add_argument('--observations',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,default=pathlib.Path('input-data-upgrade-product-verdict.json'));a=p.parse_args()
    if a.selfcheck:print(json.dumps(selfcheck(),ensure_ascii=False))
    else:
        result=compare(a.observations,a.out);print(json.dumps(result,ensure_ascii=False))
        raise SystemExit(1 if result['result']=='FAIL' else 0)
