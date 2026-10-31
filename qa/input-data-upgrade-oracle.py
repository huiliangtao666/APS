"""Offline independent expectations. Python stdlib only; imports no APS code.
Consumes reviewed literal evidence, never executes Excel formulas/caches.
Usage: python3 qa/input-data-upgrade-oracle.py [output-directory]
"""
import collections, csv, datetime, fractions, hashlib, json, pathlib, sys

Q = pathlib.Path(__file__).resolve().parent
F = fractions.Fraction
def load(name): return json.loads((Q / ('input-data-upgrade-'+name+'.json')).read_text())
def exact(x):
    x=F(x)
    return {'numerator':str(x.numerator),'denominator':str(x.denominator)}
def ceil(x): return -(-x.numerator//x.denominator)
def derive():
    src, cases, sim = load('source'), load('cases'), load('simulation')
    t=src['tables']; materials={x['物料编号']:x for x in t['物料主数据']}
    suppliers={x['供货关系编号']:x for x in t['供应商与供货条件']}
    children=collections.defaultdict(set)
    for b in t['物料清单']: children[b['父项编号']].add(b['子项编号'])
    memo, traces={},{}
    def lead(i,stack=()):
        if i in stack: raise ValueError('BOM_CYCLE: '+' -> '.join(stack+(i,)))
        if i in memo: return memo[i]
        m=materials[i]
        if m['物料来源']=='制造': own=F(m['生产提前期天数'])+F(m['检验提前期天数'])
        else:
            s=suppliers[m['参考供货关系编号']]
            assert s['物料编号']==i
            own=F(s['采购导期天数'])+F(s['检验天数'])
        downstream={c:lead(c,stack+(i,)) for c in sorted(children[i])}
        longest=max(downstream.values(),default=F(0))
        traces[i]={'own_days':exact(own),'children_longest_days':exact(longest),'critical_children':[c for c,v in downstream.items() if v==longest],'source_material_row':m['_row'],'supplier_relation':m.get('参考供货关系编号')}
        memo[i]=own+longest
        return memo[i]
    fgs=sorted(i for i in materials if i.startswith('FG'))
    fg_leads={i:exact(lead(i)) for i in fgs}
    assert [lead(i) for i in fgs]==list(map(F,[12,11,13,13,13,12,13,11,12,12]))
    demand=collections.defaultdict(F); demand_rows=collections.Counter()
    for d in t['每日需求']:
        day=int(d['需求日']); product=d['成品编号']
        kg=F(d['需求箱数'])*F(materials[product]['每箱净重千克'])
        demand[(day,product)]+=kg; demand_rows[day]+=1
    demand_totals={str(day):exact(sum((v for (d,p),v in demand.items() if d==day),F(0))) for day in sorted(demand_rows)}
    total=lambda low,high:sum((v for (day,p),v in demand.items() if low<=day<high),F(0))
    bm=next(b for b in t['物料清单'] if b['用量关系编号']==cases['bom']['id'])
    bm_need=F(bm['子项基准用量'])*F(cases['bom']['target_kg'])/F(bm['父项基准产出千克'])
    assert bm_need==F('177.0833334')
    loss=cases['loss']; quotas=list(map(F,loss['quotas'])); perc=list(map(F,loss['production_percent']))
    outputs=[q*(1-p/100) for q,p in zip(quotas,perc)]; produced=sum(outputs,F(0)); basis=sum(quotas,F(0)); target=F(loss['target_kg'])
    assert produced==966 and produced/basis==F('0.966')
    target_in=[q*target/produced for q in quotas]; target_out=[q*target/produced for q in outputs]
    assert sum(target_out,F(0))==target
    inv=cases['inventory']; available={}
    for status in inv['statuses']:
        available[status]={str(day):exact(max(F(0),F(inv['on_hand'])-F(inv['reserved'])) if status=='released' and inv['release']<=day<inv['expiry'] else F(0)) for day in inv['days']}
    transit=cases['in_transit']; avail_day=transit['arrival']+transit['inspection_days']
    transit_values={str(day):{'conditional_kg':exact(F(transit['quantity']) if avail_day<=day<transit['expiry'] else F(0)),'physical_inventory_kg':exact(0),'supply_identity':transit['id']} for day in transit['days']}
    pr=cases['procurement']; moq,multiple=F(pr['moq']),F(pr['multiple'])
    orders=[multiple*ceil(max(F(g),moq)/multiple) for g in pr['gaps']]
    theoretical=pr['need_day']-pr['purchase_days']-pr['inspection_days']; allowed=max(theoretical,pr['current_day']); supply_day=allowed+pr['purchase_days']+pr['inspection_days']
    customer=cases['customer']; unit=cases['unit']; cap=cases['capacity']
    resource=next(x for x in t['设备与工装'] if x['资源编号']==cap['resource'])
    calendar=next(x for x in t['工厂日历'] if int(x['日序'])==cap['day'])
    ratio=F(calendar['日产能分子'])/F(calendar['日产能分母'])
    assert F(resource['标准日产能千克'])==F(cap['standard_daily_kg']) and ratio==F(cap['day_fraction'])
    day_cap=F(resource['标准日产能千克'])*ratio; jobs=list(map(F,cap['same_day_jobs_kg']))
    crew=next(x for x in t['班组资源'] if x['班组编号']==cap['labor_crew'])
    required_people=sum(map(F,cap['overload_parallel_people']),F(0)); crew_people=F(crew['每班可用人数'])
    wip_pack=[]
    for w in sim['wip_remaining']:
        rows=[]
        for i in w['remaining_material_bom_ids']:
            b=next(b for b in t['物料清单'] if b['用量关系编号']==i)
            raw=F(b['子项基准用量'])*F(w['quantity_kg'])/F(b['父项基准产出千克'])
            rows.append({'bom_id':i,'child':b['子项编号'],'unit':b['数量单位'],'raw_quantity':exact(raw),'required_quantity':exact(ceil(raw) if b['数量单位']=='个' else raw)})
        wip_pack.append({'wip_id':w['id'],'expected_output_is_conditional':True,'historical_ingredients_reissue_kg':exact(0),'remaining_packaging':rows,'remaining_route_steps':w['remaining_route_steps']})
    zero=datetime.date(2026,10,31)
    zone=datetime.timezone(datetime.timedelta(hours=8))
    old_origin=datetime.datetime(2026,11,2,8,tzinfo=zone)
    coordinate=lambda d: int((datetime.datetime.combine(zero+datetime.timedelta(days=d),datetime.time(),zone)-old_origin).total_seconds()/60)
    planned=next(x for x in t['停机安排'] if x['资源编号']=='EQ007')
    failure=next(x for x in t['停机安排'] if x['资源编号']=='EQ010')
    return {'schema':'IN-INDEPENDENT-EXPECTED-r1','design_sha':src['design_sha'],'product_sha':None,'product_status':'NOT_EXECUTED','source_workbook_sha256':src['workbook_sha256'],
        'IN-01':{'sheets':29,'input_tables':16,'reference_tables':7,'explanation_diagrams':6},
        'IN-02':src['counts'],
        'IN-06':{'parameter_id':'PA0001','cell':'配置参数!E3','old_days':3,'new_days':4,'old_fg001_cumulative_days':12,'new_fg001_cumulative_days':13,'derived_cache_must_not_override_parameter':True},
        'IN-08':{'demand_count':2150,'grouped_demand_count':430,'reference_supply_count':0,'physical_inventory_rows_from_netting':0,'day_totals_kg':demand_totals,'first_window_kg':exact(total(1,15)),'november_kg':exact(total(1,31)),'tail_kg':exact(total(31,44))},
        'IN-12':{'day_dates':{str(d):(zero+datetime.timedelta(days=d)).isoformat() for d in [0,1,14,15,30,31,43]},'first_window':[1,15],'first_window_demand_rows':sum(v for d,v in demand_rows.items() if 1<=d<15),'november_demand_rows':sum(v for d,v in demand_rows.items() if 1<=d<31)},
        'IN-13':{'old_origin':old_origin.isoformat(),'B0_minutes':coordinate(0),'B1_minutes':coordinate(1),'historical_shift_minutes':0},
        'IN-14':{'outage_count':len(t['停机安排']),'EQ007_unavailable':[int(planned['开始日']),int(planned['结束日'])],'EQ007_restored_day':int(planned['结束日']),'EQ010_known_day':int(failure['可知日']),'EQ010_visible_at_day1':int(failure['可知日'])<=1,'EQ010_visible_at_day15':int(failure['可知日'])<=15},
        'IN-15':{'resource':cap['resource'],'day_capacity_kg':exact(day_cap),'zero_cross_day_jobs_workload_kg':exact(sum(jobs,F(0))),'over_capacity_kg':exact(sum(jobs,F(0))-day_cap),'first_four_fit_exactly':sum(jobs[:4],F(0))==day_cap,'fifth_requires_delay_split_or_rejection':True,'crew_available_people':exact(crew_people),'parallel_people_required':exact(required_people),'parallel_overload_people':exact(required_people-crew_people)},
        'IN-16':{'fg_cumulative_days':fg_leads,'all_material_recursion':traces},
        'IN-18':{'bom':'BM001','source_cells':['物料清单!H3','物料清单!I3','物料清单!K3'],'basis_type':'qualified-output-yield-included','child_kg':exact(bm_need),'double_deducted_wrong_kg':exact(bm_need/F(bm['标准收率']))},
        'IN-19':{'profile':loss['profile'],'basis_input_kg':exact(basis),'output_kg':exact(produced),'yield':exact(produced/basis),'row_outputs_kg':list(map(exact,outputs)),'target_inputs_kg':list(map(exact,target_in)),'target_outputs_kg':list(map(exact,target_out)),'target_input_total_kg':exact(sum(target_in,F(0))),'target_output_total_kg':exact(sum(target_out,F(0))),'raw_transport_affect_quota':False},
        'IN-20':{'original_kg':exact(F(unit['boxes'])*F(unit['kg_per_box'])),'original_pieces':exact(F(unit['boxes'])*F(unit['kg_per_box'])/F(unit['kg_per_piece'])),'changed_kg':exact(F(unit['boxes'])*F(unit['changed_kg_per_box'])),'changed_pieces':exact(F(unit['boxes'])*F(unit['changed_kg_per_box'])/F(unit['changed_kg_per_piece']))},
        'IN-21':{'arrival_window_inclusive':[customer['need_day']-customer['early'],customer['need_day']+customer['late']],'latest_dispatch_day':customer['need_day']-customer['transport_days']},
        'IN-22':available,'IN-24':{'available_day':avail_day,'by_need_day':transit_values,'unique_supply_count_after_retry':1},
        'IN-25':{'source_wip_count':8,'physical_output_added_kg':exact(0),'wips':wip_pack},
        'IN-26':{'suggested_kg':list(map(exact,orders))},'IN-27':{'theoretical_order_day':theoretical,'earliest_order_day':allowed,'available_day':supply_day,'late_days':max(0,supply_day-pr['need_day'])},
        'IN-28':cases['draft'],'IN-29':{'unmapped_source_sf_count':20,'supplement_sf_route_count':20,'supplement_step_count':40,'source_unselected_line_blocks':True,'new_manufactured_sf_must_remain_manufactured':True},
        'IN-30':{'quantity_edit_multiplier':exact(2),'shifted_transit_arrival_day':5,'shifted_transit_available_day':7,'mutated_EQ007_outage':[5,7],'restored_day_after_mutation':7},
        'IN-31':{'frozen_run_version':'v1','current_edit_version':'v2','reopen_export_version':'v1','historical_hash_must_equal_before':True},
        'IN-34':{'necessary_unsupported_capability':'BLOCK_RUN_CONSISTENTLY','final_workbook_acceptance_with_unsupported_required':'NOT_READY'}}

if __name__=='__main__':
    data=derive(); out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else Q
    out.mkdir(parents=True,exist_ok=True)
    p=out/'input-data-upgrade-expected.json';p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'result':'PASS_INDEPENDENT_ARITHMETIC_ONLY','expected_file':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'product_sha':None,'product_status':'NOT_EXECUTED','fg_days':data['IN-16']['fg_cumulative_days'],'first_window_kg':data['IN-08']['first_window_kg']},ensure_ascii=False))
