"""Independent data arithmetic/provenance check. Does not run the APS product."""
import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from decimal import Decimal, localcontext, ROUND_HALF_EVEN, ROUND_HALF_UP
from fractions import Fraction as Q
from pathlib import Path

ROOT=Path(__file__).resolve().parent
MOCK=ROOT/'mock'
def sha(data):return hashlib.sha256(data).hexdigest()
def table(scenario,prefix):
    files=list((MOCK/'baseline'/scenario).glob(prefix+'_*.csv'))
    assert len(files)==1,(scenario,prefix)
    return list(csv.DictReader(io.StringIO(files[0].read_text(encoding='utf-8-sig'),newline='')))
def number(value):
    with localcontext() as ctx:
        ctx.prec=50
        text=format(Decimal(value.numerator)/Decimal(value.denominator),'f')
    return text.rstrip('0').rstrip('.') if '.' in text else text
def ceiling(q):return (q.numerator+q.denominator-1)//q.denominator

def bom(scenario):
    order=table(scenario,'17')[0]
    product=next(r for r in table(scenario,'07') if r['产品编号']==order['产品编号'])
    good=Q(order['合格需求kg']);yield_rate=Q(product['总收率'])
    assert 0<yield_rate<=1
    total=good/yield_rate
    result={'input_kg':number(total)}
    amounts=[]
    for r in table(scenario,'09'):
        if r['产品编号']!=product['产品编号']:continue
        basis=re.fullmatch(r'每([0-9.]+)kg投入',r['计量基准'])
        if not basis:continue
        assert Q(r['损坏比例'])==0
        amount=total*Q(r['定额'])/Q(basis[1])
        result[r['物料编号']]=number(amount);amounts.append(amount)
    assert sum(amounts)==total
    pieces=good/Q(product['单支净重kg'])
    assert pieces.denominator==1
    result['pieces']=number(pieces)
    result['bags']=str(ceiling(pieces/Q(product['每袋支数'])))
    return result

def derive(case,quality):
    a=case['inputs'];kind=case['kind']
    if kind=='baseline_bom':return bom(case['source_scenario'])
    if kind=='staged_yield':
        rate=Q(1)
        for r in a['yields']:rate*=Q(r)
        return {'input':number(Q(a['good'])/rate)}
    if kind=='round_scope':
        amounts=list(map(Q,a['amounts']));quantum=Q(a['quantum'])
        raw=[sum(amounts)] if a['scope']=='ORDER' else amounts
        return {'quantity':number(sum(ceiling(x/quantum)*quantum for x in raw))}
    if kind=='pack':
        pieces=Q(a['pieces']);per=Q(a['per_pack']);loss=Q(a['loss'])
        assert pieces.denominator==per.denominator==1 and per>0 and 0<=loss<1
        if not a['partial_allowed'] and pieces%per:
            return {'error':'PARTIAL_PACK_NOT_ALLOWED'}
        packs=Q(ceiling(pieces/per))/(1-loss)
        return {'pieces':number(pieces),'gross_packs':str(ceiling(packs))}
    if kind=='display':
        mode={'HALF_EVEN':ROUND_HALF_EVEN,'HALF_UP':ROUND_HALF_UP}[a['mode']]
        value=Decimal(a['amount']).quantize(Decimal(1).scaleb(-a['scale']),rounding=mode)
        return {'display':format(value,'f'),'raw':a['amount']}
    if kind=='validate_yield':
        return {'error':'INVALID_YIELD'} if not 0<Q(a['yield'])<=1 else {'valid':True}
    if kind=='validate_modes':
        return {'error':'DUPLICATE_YIELD_PATH'} if a['apply_total'] and a['apply_stages'] else {'valid':True}
    if kind=='validate_units':
        return {'error':'MISSING_UNIT_CONVERSION'} if a['basis_unit']!=a['quota_unit'] and a['conversion'] is None else {'valid':True}
    if kind=='baseline_stock':
        required=Q(a['required'])
        assert required==Q(bom(case['source_scenario'])['LEAN'])
        total=Q(0)
        for r in table(case['source_scenario'],'13'):
            if r['物料编号']!='LEAN':continue
            net=Q(r['库存kg或个'])-Q(r['已占用kg或个'])
            assert net>=0
            if quality['mapping'].get(r['质量状态'])=='CONFIRMED' and max(Q(r['到达分钟']),Q(r['最早可用分钟']))<=0<Q(r['到期分钟']):total+=net
        return {'available':number(total),'shortage':number(max(Q(0),required-total))}
    if kind=='availability':
        cls=quality['mapping'].get(a['status'])
        assert cls==a['class']
        ok=cls in ['CONFIRMED','CONDITIONAL']
        ok=ok and (cls!='CONDITIONAL' or a['expected_on'])
        ok=ok and max(Q(a['arrival']),Q(a['ready']))<=Q(a['at'])<Q(a['expiry'])
        return {'available':bool(ok),'conditional':bool(ok and cls=='CONDITIONAL')}
    if kind=='net_stock':
        net=Q(a['quantity'])-Q(a['reserved'])
        return {'error':'NEGATIVE_NET_STOCK'} if net<0 else {'quantity':number(net)}
    if kind=='validate_mapping':
        return {'error':'CONFLICTING_STATUS_MAPPING'} if len(set(a['classes']))>1 else {'valid':True}
    if kind=='fixed':return {'minutes':number(Q(a['minutes']))}
    if kind=='rate':
        speed=Q(a['speed'])
        if a['basis']=='NOMINAL':speed*=Q(a['efficiency'])
        assert speed>0
        return {'minutes':number(Q(a['quantity'])/speed)}
    if kind=='capacity':return {'fits':sum(map(Q,a['loads']))<=Q(a['capacity'])}
    if kind=='program':return {'compatible':a['mixed_allowed'] or len(set(a['programs']))<=1}
    if kind=='wait':return {'fits':0<=Q(a['lag'])<=Q(a['limit'])}
    if kind=='space':
        events={}
        for start,end,weight in a['intervals']:
            start,end,weight=Q(start),Q(end),Q(weight)
            assert start<end and weight>=0
            events[start]=events.get(start,Q(0))+weight
            events[end]=events.get(end,Q(0))-weight
        current=peak=Q(0)
        for time in sorted(events):
            current+=events[time];peak=max(peak,current)
        assert current==0
        return {'peak':number(peak),'fits':peak<=Q(a['capacity'])}
    if kind=='transition':
        value=a['matrix'].get(a['from']+'>'+a['to'])
        return {'minutes':number(Q(value))} if value is not None else {'error':'MISSING_TRANSITION'}
    raise ValueError('Unsupported mock kind '+kind)

def main(source_zip=None):
    manifest=json.loads((MOCK/'manifest.json').read_text())
    baseline=manifest['baseline_files'];derived=manifest['derived_files']
    assert len(baseline)==76 and len(derived)==38
    for item in baseline+derived:
        raw=(MOCK/item['path']).read_bytes()
        assert sha(raw)==item['sha256'],item['path']
        rows=list(csv.reader(io.StringIO(raw.decode('utf-8-sig'),newline='')))
        assert rows and all(len(row)==len(rows[0]) for row in rows),item['path']
    if source_zip:
        raw=Path(source_zip).read_bytes()
        assert sha(raw)==manifest['source_zip_sha256']
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            for item in baseline:assert archive.read(item['source_member'])==(MOCK/item['path']).read_bytes()
    for item in derived:
        path=MOCK/item['path'];parent=MOCK/item['parent']
        if not path.name.startswith(('14_','16_')):assert path.read_bytes()==parent.read_bytes()
    for suffix,enabled in [('ON',True),('OFF',False)]:
        folder=MOCK/'derived'/('MOCK-D05-EXPECTED-'+suffix)
        supply=list(csv.DictReader(io.StringIO(next(folder.glob('14_*.csv')).read_text(encoding='utf-8-sig'),newline='')))
        assert len(supply)==1 and supply[0]['到料kg或个']=='0.1'
        assert supply[0]['到达分钟']=='60' and supply[0]['最早可用分钟']=='90'
        rules=list(csv.DictReader(io.StringIO(next(folder.glob('16_*.csv')).read_text(encoding='utf-8-sig'),newline='')))
        material=next(r for r in rules if r['规则编号']=='MATERIAL')
        assert json.loads(material['参数JSON'])['允许预计供给'] is enabled
    assert sha((MOCK/'policy-profiles.json').read_bytes())==manifest['policy_sha256']
    assert sha((MOCK/'cases.json').read_bytes())==manifest['cases_sha256']
    profiles=json.loads((MOCK/'policy-profiles.json').read_text())
    heat=next(r for r in table('UAT-12','11') if r['产品编号']=='HC40' and r['工序编号']=='HEAT')
    assert heat['计算方式']=='固定' and Q(heat['固定分钟'])==Q(profiles['process']['HEAT']['minutes'])
    for product,profile in [('HC40','PACK_HC40'),('HC60','PACK_HC60')]:
        row=next(r for r in table('UAT-12','11') if r['产品编号']==product and r['工序编号']=='PACK')
        assert row['计算方式']=='按支数' and Q(row['速度支每分钟'])==Q(profiles['process'][profile]['speed'])
    for scenario,key in [('UAT-12','capacity_UAT12_kg'),('UAT-14','capacity_UAT14_kg')]:
        cold=next(r for r in table(scenario,'15') if r['资源编号']=='COLD')
        assert Q(cold['容量'])==Q(profiles['process']['cooling'][key])
    cases=json.loads((MOCK/'cases.json').read_text())['cases']
    assert len(cases)==38 and len({c['id'] for c in cases})==38
    results=[]
    for case in cases:
        actual=derive(case,profiles['quality'])
        results.append({'id':case['id'],'actual':actual,'expected':case['expected'],'pass':actual==case['expected']})
    report={'scope':'DATA_PROVENANCE_AND_ARITHMETIC_ONLY','source_zip_checked':bool(source_zip),
      'baseline_csv_checked':76,'derived_csv_checked':38,'data_cases_passed':sum(r['pass'] for r in results),
      'data_cases_total':len(results),'product_tests':'NOT_EXECUTED','business_uat':'NOT_EXECUTED',
      'uat_owner':'huiliangtao666','results':results}
    (ROOT/'mock-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    assert all(r['pass'] for r in results),json.dumps([r for r in results if not r['pass']],ensure_ascii=False)
    print('DATA ONLY: source/provenance OK, CSV114, arithmetic38/38; product tests/UAT NOT_EXECUTED')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source-zip')
    main(parser.parse_args().source_zip)
