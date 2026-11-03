import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hash} from '../server/workbook-model.mjs';
import {createReportSnapshot,readReport,reportOptions,reportDetail,reportValue,openReportExport,VIEWS,
  materialSelectionFingerprint,calendarDay,calendarWindow,dayCalendar,minuteCalendar,minuteDay,effectiveBom,expandBom,bomLeads,intervalPeak,unionMinutes,LIMITS} from '../server/query-reports/index.mjs';

const access={read:true,export:true},zero='2026-10-31';
// First assertion anomaly stops this serial fixture entry immediately. Retain the
// exact stack and resource reading; no same-source automatic retry is scheduled.
const test=(name,fn)=>nodeTest(name,t=>{try{return fn(t);}catch(e){console.error('QUERY_REPORT_FIRST_ANOMALY',name,e.stack);process.exit(1);}});
nodeTest.after(()=>{const metrics={kind:'SYNTHETIC_PURE_MODULE_ONLY',maxRSSKiB:process.resourceUsage().maxRSS,heapUsed:process.memoryUsage().heapUsed,views:18,
  pagingFixtureRecords:1203,wideFixtureRecords:510,deepBomNodes:2000,limitHeapMiB:128,activeResources:process.getActiveResourcesInfo()};
  console.log('QUERY_REPORT_MODULE_MEASUREMENTS '+JSON.stringify(metrics));if(metrics.maxRSSKiB>=256*1024){console.error('QUERY_REPORT_FIRST_ANOMALY RSS256MiB');process.exit(1);}});
const q=(view,extra={})=>({view,fromDate:'2026-11-01',toDateInclusive:'2026-11-04',knownAtDate:'2026-11-01',...extra});
function fixture(){
  const tables={};const put=(t,rs)=>tables[t]=rs.map((r,i)=>({...r,_row:i+3,_cells:Object.fromEntries(Object.keys(r).map((k,j)=>[k,String.fromCharCode(65+j)+(i+3)]))}));
  put('物料主数据',[
    ...['FG1','FG2'].map(id=>({'物料编号':id,'物料名称':id+'熟食','物料类别':'成品','物料来源':'制造','基础单位':'千克','生产提前期天数':'2','检验提前期天数':'1'})),
    {'物料编号':'SF1','物料名称':'半成品','物料类别':'半成品','物料来源':'制造','基础单位':'千克','生产提前期天数':'1','检验提前期天数':'0'},
    {'物料编号':'RM1','物料名称':'原料','物料类别':'原辅料','物料来源':'采购','基础单位':'千克','参考供货关系编号':'SUP1'},
    {'物料编号':'PK1','物料名称':'纸箱','物料类别':'包装材料','物料来源':'采购','基础单位':'个','参考供货关系编号':'SUP2'},
    {'物料编号':'FG0','物料名称':'无BOM成品','物料类别':'成品','物料来源':'制造','基础单位':'千克','生产提前期天数':'0','检验提前期天数':'0'}]);
  const edge=(id,p,c,start='0',end='99',version='V1',unit='千克')=>({'用量关系编号':id,'清单版本编号':version,'父项编号':p,'子项编号':c,'父项基准产出千克':'1000','子项基准用量':'25','数量单位':unit,'生效日':start,'失效日':end,'标准收率':'0.8'});
  put('物料清单',[edge('B1','FG1','SF1'),edge('B2','FG2','SF1'),edge('B3','SF1','RM1'),edge('B4','FG1','PK1','0','99','V1','个')]);
  put('供应商与供货条件',[
    {'供货关系编号':'SUP1','供应商编号':'S1','供应商名称':'供应一','物料编号':'RM1','采购导期天数':'4','检验天数':'1','最小订货量':'10','订货倍数':'5','数量单位':'千克'},
    {'供货关系编号':'SUP2','供应商编号':'S2','供应商名称':'供应二','物料编号':'PK1','采购导期天数':'1','检验天数':'0','数量单位':'个'}]);
  put('客户与交付',[
    {'客户编号':'C1','客户名称':'客户一','区域编号':'R1','区域名称':'区域一','客户等级':'A','运输天数':'1','允许提前天数':'1','允许延后天数':'0'},
    {'客户编号':'C2','客户名称':'客户二','区域编号':'R2','区域名称':'区域二','客户等级':'B','运输天数':'2'}]);
  put('每日需求',[
    {'需求编号':'D1','成品编号':'FG1','客户编号':'C1','需求日':'1','需求千克':'0.1','需求箱数':'1'},
    {'需求编号':'D2','成品编号':'FG1','客户编号':'C2','需求日':'1','需求千克':'0.2','需求箱数':'2'},
    {'需求编号':'D3','成品编号':'FG2','客户编号':'C1','需求日':'4','需求千克':'9','需求箱数':'3'},
    {'需求编号':'D5','成品编号':'FG1','客户编号':'C1','需求日':'5','需求千克':'100','需求箱数':'10'}]);
  put('期初库存',[
    {'库存批次编号':'L1','物料编号':'RM1','仓库编号':'W1','库位编号':'LOC','当前数量':'10','数量单位':'千克','期初已占用量':'2','质量状态':'合格','放行日':'0','到期日':'2','快照日':'0'},
    {'库存批次编号':'L2','物料编号':'RM1','仓库编号':'W2','当前数量':'5','数量单位':'千克','期初已占用量':'1','质量状态':'待检','放行日':'0','到期日':'9','快照日':'0'},
    {'库存批次编号':'L3','物料编号':'PK1','当前数量':'30','数量单位':'个','期初已占用量':'0','质量状态':'合格','放行日':'0','到期日':'0','快照日':'0'}]);
  put('库区库位',[{'库位编号':'LOC','储存环境':'冷藏'}]);
  put('既有采购在途',[{'在途记录编号':'IN1','采购订单编号':'PO1','订单行号':'1','物料编号':'RM1','供应商编号':'S1','供货关系编号':'SUP1','订购数量':'20','数量单位':'千克','约定到货日':'2','预计放行日':'2','下单日':'0'}]);
  put('期初在制',[{'在制批次编号':'WP1','成品编号':'SF1','数量单位':'千克','预计合格产出':'7','已开工日':'0','预计完工日':'2','预计放行日':'3','占用资源编号':'EQ1'}]);
  put('每日缺料净算',[
    {'净算记录编号':'NC1','物料编号':'RM1','需料日':'1','需新增补给缺口':'5','数量演算期末量':'20','数量单位':'千克','时序风险':'提前期不足'},
    {'净算记录编号':'NC2','物料编号':'SF1','需料日':'1','需新增补给缺口':'3','数量演算期末量':'8','数量单位':'千克','时序风险':'正常'}]);
  put('采购订单草案',[{'采购建议编号':'PR1','拟制采购订单编号':'DRAFT1','物料编号':'RM1','供应商编号':'S1','供货关系编号':'SUP1','生产需料日':'1','建议采购数量':'10','数量单位':'千克','预计晚于需料天数':'2','建议下单日':'1','预计放行日':'6','单据状态':'草案未下达'}]);
  put('生产补给建议',[{'生产建议编号':'MP1','物料编号':'SF1','需求日':'1','建议生产量':'8','数量单位':'千克','状态或风险':'正常'}]);
  put('物料需求来源',[{'物料需求编号':'MR1','所需物料编号':'RM1','需料日':'1','需求数量':'5','用量关系编号':'B3','来源生产建议编号':'MP1'}]);
  put('设备与工装',[{'资源编号':'EQ1','资源名称':'熟食线','资源类别':'设备','资源组编号':'G1','标准日产能千克':'100','可用数量':'1'},
    {'资源编号':'TL1','资源名称':'共享工装','资源类别':'工装','资源组编号':'TG1','可用数量':'1'}]);
  put('工厂日历',Array.from({length:6},(_,i)=>({'日序':String(i),'公历日期':dayCalendar(zero,i),'生产班次数':i===1?'1':'2','日产能分子':i===1?'1':'2','日产能分母':'2'})));
  put('工艺路线',[{'路线工序编号':'RT1','成品编号':'FG1','设备组编号':'G1','班组编号':'CREW','需求人数':'2','跨日历时天数':'0.01','所需工装类型':'TG1','每批工装套数':'1'}]);
  put('班组资源',[{'班组编号':'CREW','每班可用人数':'4','标准日班次数':'2','周日班次数':'1'}]);
  put('停机安排',[{'停机编号':'STOP1','资源编号':'EQ1','开始日':'2','结束日':'3','可知日':'0'},
    {'停机编号':'FUTURE','资源编号':'EQ1','开始日':'1','结束日':'2','可知日':'3'}]);
  put('配置参数',[]);put('单位换算',[]);
  return {id:'FIXTURE',version:1,profile:'excel-qualified-output-202611-r1',fileHash:'explicit-synthetic-file',dayZero:zero,timeUnit:'day',businessFileName:'显式合成夹具.xlsx',tables,
    mapping:{version:'MOCK-M1',mock:true,wip_remaining:[{id:'WP1',resource:'EQ1',current_occupancy_day_interval:[1.9,2.1],remaining_labor_pool:'CREW',remaining_labor_count:1,remaining_tool_type:'TG1',remaining_tool_count:1}],tool_pools:{TG1:['TL1']}}};
}
function snapshot(d=fixture(),extra={}){return createReportSnapshot({dataset:d,datasetId:d.id,version:d.version,dayZero:zero,...extra},access);}
function runFixture(d=fixture()){
  const selection={startDay:1,endDay:5,currentDay:1};
  const result={status:'partial',dayZero:zero,timeUnit:'minute',minuteOrigin:'2026-10-31T00:00:00+08:00',conditions:{...selection,interval:'[start,end)'},
    source:{datasetId:d.id,version:d.version,fileHash:d.fileHash,parameterHash:hash(d.tables['配置参数']),mappingHash:hash(d.mapping)},
    demandResults:[{id:'D1',productId:'FG1',quantity:0.1,unit:'千克',status:'scheduled',readyDay:1.5,arrivalDay:2,lateDays:0},{id:'D2',productId:'FG1',quantity:0.2,unit:'千克',status:'unplanned',readyDay:null,arrivalDay:null,lateDays:null}],
    tasks:[{id:'T1',productId:'FG1',orderId:'D1',productionId:'MAKE1',machine:'EQ1',resource:'EQ1',crew:'CREW',people:2,tools:['TL1'],startMinute:1927,endMinute:1944,quantity:10},
      {id:'T2',productId:'FG1',orderId:'D1',productionId:'MAKE1',machine:'EQ1',resource:'EQ1',crew:'CREW',people:2,tools:['TL1'],startMinute:2870,endMinute:2890,quantity:20}],
    allocations:[{materialId:'RM1',supplyId:'L1',quantity:0.1,feedDay:1,need:'D1',conditional:false},{materialId:'FG1',supplyId:'production:MAKE1',quantity:10,feedDay:2,kind:'本次制造产出',source:{productionId:'MAKE1',taskId:'T2'},need:'D1',conditional:true}],
    shortages:[{id:'SH1',materialId:'RM1',quantity:5,unit:'千克',needDay:1,need:'D2'}],suggestions:[{id:'SH1',materialId:'RM1',quantity:10,unit:'千克',needDay:1,need:'D2',orderDay:1,availableDay:6,lateDays:5,relationId:'SUP1',supplierId:'S1',status:'reference'}]};
  return {id:'RUN1',datasetId:d.id,version:d.version,status:'partial',selection,inputHash:hash(d),result,resultHash:hash(result),provenance:{dayZero:zero,effectiveAt:1,parameterScope:'dataset'}};
}
function frozen(d=fixture(),run=runFixture(d)){return createReportSnapshot({frozenInput:d,run,datasetId:d.id,version:d.version},access);}
function materials(s,values){const result={};for(const c of ['成品','半成品','原辅料','包装材料'])result[c]={mode:values[c]?.length?'VALUES':'NONE',...(values[c]?.length?{values:values[c]}:{}),fingerprint:materialSelectionFingerprint(s,c)};return result;}
function full(s,query){const items=[];let cursor;do{const page=readReport(s,{...query,cursor},access);items.push(...page.items);cursor=page.nextCursor;}while(cursor);return items;}
const error=code=>e=>e.code===code;

test('explicit context, read/export permission, immutable input and no current/frozen mixing',()=>{
  const d=fixture(),before=hash(d),s=snapshot(d);d.tables['物料主数据'][0]['物料名称']='later';assert.notEqual(s.input.tables['物料主数据'][0]['物料名称'],'later');
  assert.throws(()=>createReportSnapshot({dataset:s.input,datasetId:d.id,version:2,dayZero:zero},access),error('CONTEXT_MISMATCH'));
  assert.throws(()=>readReport(s,q('bom.materials'),{}),error('FORBIDDEN'));
  const request=q('bom.materials'),p=readReport(s,request,access);assert.throws(()=>openReportExport(s,{...request,fingerprint:p.fingerprint},{},{read:true}),error('FORBIDDEN'));
  assert.throws(()=>createReportSnapshot({dataset:d,frozenInput:d,run:runFixture(d),datasetId:d.id,version:1},access),error('MIXED_CURRENT_AND_FROZEN'));
  assert.equal(hash(s.input),before);assert.ok(Object.isFrozen(s.input.tables));
});

test('all 18 real input and frozen projection seams are callable, read-only and bounded',()=>{
  const d=fixture(),before=hash(d),s=snapshot(d),f=frozen(d),seen=[];
  for(const view of Object.keys(VIEWS)){for(const snap of [s,f]){const page=readReport(snap,q(view),access);assert.equal(page.view,view);assert.equal(page.identity.frozen,!!snap.run);assert.ok(Buffer.byteLength(JSON.stringify(page))<=LIMITS.responseBytes);seen.push(view);}}
  assert.equal(seen.length,36);assert.equal(hash(d),before);
});

test('calendar conversion: inclusive tail, leap/invalid dates, negative days and offset minute precision',()=>{
  assert.deepEqual(calendarWindow(zero,'2026-11-01','2026-11-14'),{start:1,end:15,interval:'[start,end)'});
  assert.equal(dayCalendar(zero,-1),'2026-10-30');assert.equal(calendarDay('2028-02-28','2028-02-29'),1);
  for(const v of ['2026-11-31','2026-02-29','11/01/2026','2026-1-01'])assert.throws(()=>calendarDay(zero,v),error('INVALID_DATE'));
  assert.throws(()=>calendarWindow(zero,'2026-11-02','2026-11-01'),error('INVALID_DATE_WINDOW'));
  assert.equal(minuteCalendar('2026-10-31T00:00:00+08:00',1927),'2026-11-01T08:07:00+08:00');
  assert.equal(minuteCalendar('2026-11-02T08:00:00+08:00',-480),'2026-11-02T00:00:00+08:00');
  assert.equal(minuteDay({dayZero:zero,minuteOrigin:'2026-10-31T00:00:00+08:00'},2880),2);
  assert.throws(()=>minuteCalendar('2026-10-31T00:00:00',1),error('MINUTE_ORIGIN_REQUIRED'));
});

test('default ALL selects all actual categories, counts full options, NONE stays empty and reset restores all',()=>{
  const s=snapshot(),query=q('bom.materials'),page=readReport(s,query,access);assert.equal(page.total,6);
  assert.equal(page.bom.enabled,false);assert.equal(page.materialSelections['成品'].selectedCount,3);
  const opt=reportOptions(s,query,{field:'material',category:'成品',search:'FG1'},access);assert.equal(opt.total,3);assert.equal(opt.selected,3);assert.ok(opt.items[0].checked);
  const none=reportOptions(s,query,{field:'material',category:'成品',action:{kind:'none'}},access);
  const restricted={...query,materialSelections:materials(s,{})};assert.equal(readReport(s,restricted,access).total,0);
  assert.equal(none.selection.mode,'NONE');assert.equal(none.selected,0);
  const restored=reportOptions(s,{...query,materialSelections:{'成品':none.selection}},{field:'material',category:'成品',action:{kind:'restore'}},access);
  assert.equal(restored.selection.mode,'ALL');assert.equal(restored.selected,3);
});

test('global candidate search-all exceeds page, preserves hidden selection, toggles and rejects stale ALL',()=>{
  const d=fixture();for(let i=0;i<251;i++)d.tables['物料主数据'].push({'物料编号':'EX'+i,'物料名称':'match'+i,'物料类别':'成品','物料来源':'制造','基础单位':'千克'});
  const s=snapshot(d),query=q('bom.materials'),fp=materialSelectionFingerprint(s,'成品');
  let state={mode:'VALUES',fingerprint:fp,values:['FG1']};
  let opts=reportOptions(s,{...query,materialSelections:{'成品':state}},{field:'material',category:'成品',action:{kind:'searchAll',query:'match'}},access);
  assert.equal(opts.selected,252);assert.equal(opts.items.length,100);state=opts.selection;
  opts=reportOptions(s,{...query,materialSelections:{'成品':state}},{field:'material',category:'成品',search:'FG1'},access);assert.equal(opts.selected,252);assert.equal(opts.items[0].checked,true);
  opts=reportOptions(s,{...query,materialSelections:{'成品':state}},{field:'material',category:'成品',action:{kind:'toggle',id:'EX250',checked:false}},access);assert.equal(opts.selected,251);
  const d2=structuredClone(d);d2.version=2;const s2=snapshot(d2);
  assert.throws(()=>readReport(s2,{...query,materialSelections:{'成品':{mode:'ALL',fingerprint:fp}}},access),error('SELECTION_CONTEXT_CHANGED'));
  assert.throws(()=>readReport(s,{...query,materialSelections:{'成品':{mode:'VALUES',values:['bogus'],fingerprint:fp}}},access),error('OPTION_NOT_IN_SNAPSHOT'));
});

test('BOM off/on: only descendants, multiple roots/shared dedup preserve edges; no-BOM root retained',()=>{
  const s=snapshot(),query=q('bom.materials',{materialSelections:materials(s,{'成品':['FG1','FG2','FG0']})});
  assert.deepEqual(full(s,query).map(x=>x.values.materialId).sort(),['FG0','FG1','FG2']);
  const on=readReport(s,{...query,includeBom:true},access);assert.equal(on.total,6);assert.equal(new Set(on.bom.expandedMaterialIds).size,6);
  const shared=on.items.find(r=>r.values.materialId==='SF1');assert.deepEqual(shared.values.roots,['FG1','FG2']);
  const rm=readReport(s,q('bom.materials',{includeBom:true,materialSelections:materials(s,{'原辅料':['RM1']})}),access);assert.equal(rm.total,1);
  const edges=readReport(s,q('bom.relations',{includeBom:true,materialSelections:query.materialSelections}),access);assert.equal(edges.total,4);
});

test('effective date/version BOM replaces expired edges and recomputes leads without applying yield twice',()=>{
  const d=fixture(),r=d.tables['物料清单'][0];r['失效日']='2';
  d.tables['物料清单'].push({...r,'用量关系编号':'NEW','清单版本编号':'V2','子项编号':'PK1','数量单位':'个','生效日':'2','失效日':'99'});
  // All FG1 edges must have the same active version, not a guessed winner.
  d.tables['物料清单'][3]['失效日']='2';
  const old=effectiveBom(d,1),fresh=effectiveBom(d,2);
  assert.ok(old.edges.some(x=>x['用量关系编号']==='B1'));assert.ok(!fresh.edges.some(x=>x['用量关系编号']==='B1'));
  assert.equal(bomLeads(d,old).get('FG1').total,9);assert.equal(bomLeads(d,fresh).get('FG1').total,4);
  assert.equal(fresh.edges.find(x=>x['用量关系编号']==='NEW')['子项基准用量'],'25');
  assert.equal(expandBom(fresh,['FG1'],true).ids.has('SF1'),false);
});

test('BOM cycles, version/edge conflicts, unknown units and deep chain diagnose without stack overflow',()=>{
  const d=fixture(),edge=d.tables['物料清单'][0];
  d.tables['物料清单'].push({...edge,'用量关系编号':'CYCLE','父项编号':'RM1','子项编号':'FG1','清单版本编号':'V1'},
    {...edge,'用量关系编号':'CONFLICT','清单版本编号':'OTHER','数量单位':'桶'});
  const g=effectiveBom(d,1);for(const code of ['BOM_CYCLE','BOM_VERSION_CONFLICT','BOM_EDGE_CONFLICT','BOM_UNIT_CONVERSION_MISSING'])assert.ok(g.diagnostics.some(x=>x.code===code),code);
  assert.equal(bomLeads(d,g).get('FG1').total,null);assert.equal(expandBom(g,['FG1'],true).ids.size,4);
  const deep={tables:{'物料主数据':[],'物料清单':[]}};
  for(let i=0;i<2000;i++){deep.tables['物料主数据'].push({'物料编号':String(i),'物料来源':'制造','生产提前期天数':'1','检验提前期天数':'0'});
    if(i)deep.tables['物料清单'].push({'用量关系编号':String(i),'父项编号':String(i-1),'子项编号':String(i),'清单版本编号':'V','生效日':'0','失效日':'9','父项基准产出千克':'1','子项基准用量':'1','数量单位':'千克'});}
  assert.equal(bomLeads(deep,effectiveBom(deep,1)).get('0').total,2000);
});

test('same-field union and cross-field intersection apply before daily aggregation with exact decimal sums',()=>{
  const s=snapshot(),query=q('demand.daily'),initial=readReport(s,query,access);
  assert.equal(initial.items.find(r=>r.values.materialId==='FG1').values.quantity,0.3);
  const customer=reportOptions(s,query,{field:'客户编号'},access),region=reportOptions(s,query,{field:'区域编号'},access);
  const result=readReport(s,{...query,filters:{'客户编号':{mode:'VALUES',fingerprint:customer.fingerprint,values:['C1','C2']},'区域编号':{mode:'VALUES',fingerprint:region.fingerprint,values:['R1']}}},access);
  assert.equal(result.items.find(r=>r.values.materialId==='FG1').values.quantity,0.1);assert.equal(result.total,2);
  assert.equal(readReport(s,q('demand.details',{unit:'箱'}),access).summaryByMaterialUnit.find(r=>r.materialId==='FG1').quantity,3);
});

test('daily demand and drilldowns never create component sales demand or delivery facts',()=>{
  const s=snapshot(),query=q('demand.daily'),p=readReport(s,query,access),id=p.items.find(x=>x.values.materialId==='FG1').id;
  const members=reportDetail(s,{...query,fingerprint:p.fingerprint},{recordId:id,section:'members'},access);assert.equal(members.total,2);
  assert.deepEqual(members.items.map(x=>x.values.quantity),[0.1,0.2]);
  const raw=readReport(s,q('demand.details'),access);assert.ok(raw.items.every(x=>x.values.undelivered===null&&x.values.actualDelivered===null));
  const rm=readReport(s,q('demand.details',{includeBom:true,materialSelections:materials(s,{'原辅料':['RM1']})}),access);assert.equal(rm.total,0);
});

test('inventory quality, release/expiry snapshot boundaries and units stay separate from transit/WIP',()=>{
  const s=snapshot(),p=readReport(s,q('inventory.batches'),access);assert.equal(p.total,3);
  assert.equal(p.items.find(x=>x.id.endsWith('L1')).values.available,8);assert.equal(p.items.find(x=>x.id.endsWith('L2')).values.available,0);
  assert.equal(p.items.find(x=>x.id.endsWith('L3')).values.available,0);
  assert.ok(p.items.every(x=>x.values.snapshotDate==='2026-10-31'));
  const summary=readReport(s,q('inventory.summary'),access);assert.equal(summary.total,3);
  const rm=summary.items.find(x=>x.values.materialId==='RM1'&&x.values['质量状态']==='合格');assert.deepEqual(rm.values['2026-10-31'],{quantity:10,reserved:2,available:8,records:1});
  const pending=summary.items.find(x=>x.values.materialId==='RM1'&&x.values['质量状态']==='待检');assert.equal(pending.values['2026-10-31'].quantity,5);assert.equal(pending.values['2026-10-31'].available,0);
  const supply=readReport(s,q('inventory.supply'),access);assert.equal(supply.total,2);
  assert.equal(supply.items.find(x=>x.id.endsWith('IN1')).values.availableDate,'2026-11-03');assert.ok(supply.items.every(x=>x.values.physicalStock===false));
});

test('unknown inventory field is null, frozen allocations never become fabricated balances',()=>{
  const d=fixture();delete d.tables['期初库存'][0]['期初已占用量'];const s=snapshot(d),p=readReport(s,q('inventory.batches'),access);
  assert.equal(p.items.find(x=>x.id.endsWith('L1')).values.available,null);
  const f=frozen(),projected=readReport(f,q('inventory.projected'),access);assert.ok(projected.items.every(x=>x.values.projectedBalance===null));assert.equal(projected.notProvided[0],'完整可推预计余额依据');
  const input=readReport(snapshot(),q('inventory.projected'),access);assert.equal(input.items[0].values.projectedBalance,20);assert.match(input.items[0].values.meaning,/输入数量演算/);
});
test('inventory matrix separates snapshot dates, quality and units; decimal sums, unknown fields, sources and exports remain exact',()=>{
 const d=fixture(),base=d.tables['期初库存'][0];
 const add=(id,changes)=>d.tables['期初库存'].push({...base,'库存批次编号':id,'仓库编号':'W2',...changes});
 add('L4',{'快照日':'1','当前数量':'0.2','期初已占用量':'0.1','到期日':'9'});
 add('L5',{'快照日':'1','当前数量':'0.1','期初已占用量':'0','到期日':'9'});
 add('L6',{'快照日':'2','当前数量':'7','期初已占用量':'','到期日':'9'});
 add('L7',{'快照日':'1','当前数量':'2','数量单位':'箱','期初已占用量':'0'});
 const s=snapshot(d),query=q('inventory.summary'),p=readReport(s,query,access);
 assert.equal(p.total,4);
 const kg=p.items.find(r=>r.values.materialId==='RM1'&&r.values['质量状态']==='合格'&&r.values.unit==='千克');
 assert.equal(kg.values['2026-10-31'].quantity,10);
 assert.deepEqual(kg.values['2026-11-01'],{quantity:0.3,reserved:0.1,available:0.2,records:2});
 assert.deepEqual(kg.values['2026-11-02'],{quantity:7,reserved:null,available:null,records:1});
 const box=p.items.find(r=>r.values.unit==='箱');assert.equal(box.values['2026-11-01'].quantity,2);assert.equal(box.values['2026-10-31'],undefined);
 const members=reportDetail(s,{...query,fingerprint:p.fingerprint},{recordId:kg.id,section:'members'},access);assert.equal(members.total,4);
 const options=reportOptions(s,query,{field:'质量状态'},access);
 const filtered=readReport(s,{...query,filters:{'质量状态':{...options.selection,mode:'VALUES',values:['待检']}}},access);assert.equal(filtered.total,1);assert.equal(filtered.items[0].values['质量状态'],'待检');
 const exported=[...openReportExport(s,{...query,fingerprint:p.fingerprint},{},access).chunks].join('').trim().split('\n').map(JSON.parse);
 const output=exported.find(r=>r.kind==='record'&&r.id===kg.id);assert.equal(output.values['2026-11-01'].value.quantity,0.3);assert.equal(exported.at(-1).total,4);
});

test('capacity calendar/known-date stops keep reference dimensions; missing run occupation is unknown',()=>{
  const s=snapshot(),p=readReport(s,q('capacity.daily'),access),eq=p.items.filter(x=>x.values['资源编号']==='EQ1');
  assert.equal(eq.find(x=>x.values.day===1).values.calendarCapacityKg,50);
  assert.equal(eq.find(x=>x.values.day===1).values.referenceAvailableKg,50); // future unknown stop must not be deducted
  assert.equal(eq.find(x=>x.values.day===2).values.referenceAvailableKg,0);
  assert.ok(eq.every(x=>x.values.occupiedNaturalMinutes===null&&x.values.utilization===null&&x.values.waitingLoss===null));
  const stops=readReport(s,q('capacity.stops'),access);assert.equal(stops.total,2);assert.equal(stops.items.find(x=>x.id==='stop:FUTURE').values.knownAsOf,false);
  assert.throws(()=>readReport(s,q('capacity.daily',{knownAtDate:undefined}),access),error('INFORMATION_AS_OF_REQUIRED'));
});

test('frozen minute tasks retain 08:07–08:24, overnight interval and WIP/tools/crew occupation without batch duplication',()=>{
  const s=frozen(),query=q('capacity.daily'),p=readReport(s,query,access),eq=p.items.filter(x=>x.values['资源编号']==='EQ1');
  assert.equal(eq.find(x=>x.values.day===1).values.startedBatchKg,30);assert.equal(eq.find(x=>x.values.day===2).values.startedBatchKg,0);
  assert.ok(eq.find(x=>x.values.day===2).values.occupiedNaturalMinutes>=10);
  assert.ok(p.items.some(x=>x.values['资源编号']==='TL1'&&x.values.day===1&&x.values.occupationPeak>0));
  const first=eq.find(x=>x.values.day===1),details=reportDetail(s,{...query,fingerprint:p.fingerprint},{recordId:first.id,section:'run'},access);
  assert.equal(details.items[0].interval.startTime,'2026-11-01T08:07:00+08:00');assert.equal(details.items[0].interval.endTime,'2026-11-01T08:24:00+08:00');
  assert.equal(details.items[0].interval.endMinute-details.items[0].interval.startMinute,17);
  const mapping=reportDetail(s,{...query,fingerprint:p.fingerprint},{recordId:first.id,section:'mapping'},access);assert.equal(mapping.items[0].value.id,'WP1');
  assert.equal(first.values.dailyOutputAllocation,null);
  assert.equal(intervalPeak([{start:0,end:1},{start:1,end:2}],0,2),1);assert.equal(unionMinutes([{start:0,end:1},{start:.5,end:2}],0,2),2880);
});

test('all supplier/risk includes normal manufacturing net; hidden supplier/risk filters cannot leak across views',()=>{
  const s=snapshot(),query=q('replenishment.net'),p=readReport(s,query,access);assert.equal(p.total,2);
  const opt=reportOptions(s,query,{field:'供应商编号'},access);assert.equal(opt.total,1);
  const filtered=readReport(s,{...query,filters:{'供应商编号':{mode:'VALUES',fingerprint:opt.fingerprint,values:['S1']}}},access);assert.equal(filtered.total,2);
  // Tokens are intentionally from another view: hidden fields are ignored before
  // binding validation, while active fields always check their own identity.
  const hidden={'供应商编号':{mode:'NONE',fingerprint:'hidden'},'时序风险':{mode:'NONE',fingerprint:'hidden'}};
  assert.equal(readReport(s,q('replenishment.manufacture',{filters:{'供应商编号':hidden['供应商编号']}}),access).total,1);
  assert.equal(readReport(s,q('replenishment.incoming',{filters:{'时序风险':hidden['时序风险']}}),access).total,1);
  const risk=reportOptions(s,query,{field:'时序风险'},access);assert.equal(risk.total,2);
  assert.equal(readReport(s,{...query,filters:{'时序风险':{mode:'NONE',fingerprint:risk.fingerprint}}},access).total,0);
});

test('procurement suggestions remain drafts, trace MR/BOM/NC and supply facts, never create orders',()=>{
  const d=fixture(),before=hash(d),s=snapshot(d),query=q('replenishment.purchase'),p=readReport(s,query,access);assert.equal(p.total,1);
  assert.equal(p.items[0].values.ordered,false);assert.equal(p.items[0].values['建议采购数量'],'10');
  const details=reportDetail(s,{...query,fingerprint:p.fingerprint},{recordId:p.items[0].id,section:'sources'},access);
  for(const name of ['物料需求来源','物料清单','每日缺料净算','供应商与供货条件'])assert.ok(details.items.some(x=>x.reference.table===name));
  const run=readReport(frozen(),query,access);assert.equal(run.items[0].values.status,'reference');assert.equal(run.items[0].values.ordered,false);
  assert.equal(hash(d),before);
  const f=frozen(),mQuery=q('replenishment.manufacture'),m=readReport(f,mQuery,access),mDetail=reportDetail(f,{...mQuery,fingerprint:m.fingerprint},{recordId:m.items[0].id,section:'run'},access);
  assert.equal(mDetail.items[0].value.kind,'本次制造产出');assert.equal(mDetail.items[0].value.materialId,'FG1');
});

test('frozen identity and all hashes/conditions reject tamper and never read latest version',()=>{
  const d=fixture(),run=runFixture(d),s=frozen(d,run),old=readReport(s,q('demand.details'),access);
  d.version=2;d.tables['每日需求'][0]['需求千克']='999';assert.equal(readReport(s,q('demand.details'),access).items.find(x=>x.id.endsWith('D1')).values.quantity,0.1);
  assert.equal(old.identity.runId,'RUN1');assert.equal(old.identity.version,1);assert.ok(old.identity.parameterHash&&old.identity.mappingHash&&old.identity.resultHash);
  const badInput=fixture();badInput.tables['每日需求'][0]['需求千克']='88';assert.throws(()=>frozen(badInput,run),error('FROZEN_INPUT_CORRUPT'));
  const badResult=structuredClone(run);badResult.result.tasks[0].quantity=99;assert.throws(()=>frozen(fixture(),badResult),error('FROZEN_RESULT_CORRUPT'));
  const badSource=structuredClone(run);badSource.result.source.parameterHash='bad';badSource.resultHash=hash(badSource.result);assert.throws(()=>frozen(fixture(),badSource),error('FROZEN_SOURCE_MISMATCH'));
  const badCondition=structuredClone(run);badCondition.result.conditions.endDay=6;badCondition.resultHash=hash(badCondition.result);assert.throws(()=>frozen(fixture(),badCondition),error('FROZEN_SOURCE_MISMATCH'));
  const pending=structuredClone(run);pending.status='running';assert.throws(()=>frozen(fixture(),pending),error('RESULT_NOT_READY'));
  assert.throws(()=>createReportSnapshot({frozenInput:fixture(),run,datasetId:'FIXTURE',version:1,dayZero:'2027-01-01'},access),error('CONTEXT_MISMATCH'));
});

test('P effective values and definitions use existing resolver; candidates and blocked P do not become defaults',()=>{
  const d=fixture();d.parameterContract='FIXTURE';
  const base={'对象编号':'FG1','参数名称':'生产提前期天数','单位':'天','生效日':'0','失效日':'99',_cp:'CP080'};
  d.tables['配置参数']=[{...base,'参数编号':'B','参数值':'2',_sourceRole:'B'},
    {...base,'参数编号':'P','参数值':'7',_sourceRole:'P',_source:{role:'P',fileHash:'P-hash',fileName:'P-fixture.xlsx',sheet:'仿真参数实例',row:3}},
    {...base,'参数编号':'CANDIDATE','参数值':'99',_candidate:true,_sourceRole:'P'}];
  d.parameterDefinitions=[{'参数编号':'CP080','业务含义':'P定义优先','权威来源及校验备注':'建议待评审'}];
  const before=hash(d),s=snapshot(d),query=q('bom.materials'),p=readReport(s,query,access),id=p.items.find(x=>x.values.materialId==='FG1').id;
  assert.equal(p.items.find(x=>x.id===id).values.ownLeadDays,8);assert.equal(p.items.find(x=>x.id===id).values.cumulativeLeadDays,14);
  const detail=reportDetail(s,{...query,fingerprint:p.fingerprint},{recordId:id,section:'parameters',objectId:'FG1'},access);
  assert.ok(detail.items.some(x=>x.definition?.['业务含义']==='P定义优先'));assert.ok(detail.items.some(x=>x.status==='候选，未启用'));
  assert.equal(detail.items.find(x=>x['参数编号']==='P').effectiveValue,'7');assert.equal(hash(d),before);
  const blocked=structuredClone(d);blocked.tables['配置参数'][1]['资料状态']='待补';
  assert.equal(readReport(snapshot(blocked),query,access).items.find(x=>x.values.materialId==='FG1').values.ownLeadDays,null);
});

test('source anchors distinguish Excel physical rows, online changes and unknown/missing provenance',()=>{
  const d=fixture();d.tables['物料主数据'][0]._source={kind:'维护',role:'EDIT',version:1,reason:'explicit edit'};
  d.tables['物料主数据'][1]={...d.tables['物料主数据'][1],_cells:{},_source:undefined};
  const s=snapshot(d),query=q('bom.materials'),p=readReport(s,query,access);
  const source=id=>reportDetail(s,{...query,fingerprint:p.fingerprint},{recordId:'物料主数据:'+id,section:'sources'},access).items[0].source;
  assert.equal(source('FG1').sourceKind,'online');assert.equal(source('FG1').physicalRow,null);
  assert.equal(source('FG2').physicalRow,null);assert.equal(source('SF1').physicalRow,5);
  assert.equal(source('SF1').fileHash,'explicit-synthetic-file');assert.equal(source('SF1').identity.version,1);
  assert.ok(!Object.hasOwn(source('FG2'),'url'));
});

test('100/200/500 full-result stable traversal and global last-record search; condition/size/cursor binding',()=>{
  const d=fixture();d.tables['每日需求']=Array.from({length:1203},(_,i)=>({'需求编号':'D'+String(i).padStart(5,'0'),'成品编号':'FG1','客户编号':i%2?'C1':'C2','需求日':'1','需求千克':'1','需求箱数':'1','备注':i===1202?'UNIQUE-LAST':'tie',_row:i+3,_cells:{'需求编号':'A'+(i+3)}}));
  const s=snapshot(d),query=q('demand.details',{sort:[{field:'quantity',direction:'desc'}],columns:['需求编号','quantity','客户编号']});
  for(const size of [100,200,500]){const items=full(s,{...query,pageSize:size});assert.equal(items.length,1203);assert.equal(new Set(items.map(x=>x.id)).size,1203);assert.equal(items[0].values['需求编号'],'D00000');assert.equal(items.at(-1).values['需求编号'],'D01202');}
  assert.equal(readReport(s,q('demand.details',{q:'UNIQUE-LAST'}),access).items[0].values['需求编号'],'D01202');
  const p=readReport(s,query,access);assert.equal(p.total,1203);assert.equal(p.items.length,100);assert.equal(p.summaryByMaterialUnit[0].quantity,1203);
  assert.throws(()=>readReport(s,{...query,cursor:p.nextCursor,pageSize:200},access),error('CURSOR_CONTEXT_CHANGED'));
  assert.throws(()=>readReport(s,{...query,cursor:p.nextCursor,q:'UNIQUE-LAST'},access),error('CURSOR_CONTEXT_CHANGED'));
  assert.throws(()=>readReport(s,{...query,pageSize:25},access),error('UNSUPPORTED_PAGE_SIZE'));
  assert.throws(()=>readReport(s,{...query,sort:[{field:'nope',direction:'asc'}]},access),error('INVALID_SORT'));
  assert.throws(()=>readReport(s,{...query,filters:{unexpected:{mode:'ALL'}}},access),error('UNKNOWN_FILTER'));
});

test('long values keep byte protection and lossless canonical chunks, preserving null/zero/empty/missing',()=>{
  const d=fixture(),long='测🙂'.repeat(4000);d.tables['每日需求'][0]['备注']=long;d.tables['每日需求'][1]['备注']='';d.tables['每日需求'][2]['备注']=null;
  const s=snapshot(d),query=q('demand.details'),p=readReport(s,query,access),record=p.items.find(x=>x.id.endsWith('D1'));
  assert.equal(record.values['备注'].longValue,true);let offset=0,text='';do{const v=reportValue(s,{...query,fingerprint:p.fingerprint},{recordId:record.id,field:'备注',offset},access);text+=v.chunk;offset=v.nextOffset;}while(offset!==null);
  assert.equal(JSON.parse(text),long);assert.equal(p.items.find(x=>x.id.endsWith('D2')).values['备注'],'');assert.equal(p.items.find(x=>x.id.endsWith('D3')).values['备注'],null);
  assert.throws(()=>reportValue(s,query,{recordId:record.id,field:'备注'},access),error('QUERY_FINGERPRINT_REQUIRED'));
  assert.throws(()=>reportValue(s,{...query,fingerprint:'tamper'},{recordId:record.id,field:'备注'},access),error('QUERY_CONTEXT_CHANGED'));
});

test('exports cover full matched/selected rows and visible columns, with independent content hash/count',()=>{
  const d=fixture();d.tables['每日需求'][0]['备注']='=SUM(A1)';d.tables['每日需求'][1]['备注']='🙂'.repeat(8000);
  const s=snapshot(d),query=q('demand.details',{columns:['需求编号','quantity','备注']}),p=readReport(s,query,access),bound={...query,fingerprint:p.fingerprint};
  const out=openReportExport(s,bound,{},access),body=[...out.chunks].join(''),lines=body.trimEnd().split('\n'),completion=JSON.parse(lines.at(-1)),content=lines.slice(0,-1).join('\n')+'\n';
  assert.equal(out.manifest.total,p.total);assert.equal(completion.total,3);assert.equal(completion.contentBytes,Buffer.byteLength(content));assert.equal(completion.contentSha256,createHash('sha256').update(content).digest('hex'));
  const records=lines.slice(1,-1).map(l=>JSON.parse(l));assert.equal(records[1].values['备注'].value,'🙂'.repeat(8000));assert.ok(!Object.hasOwn(records[0].values,'客户编号'));
  assert.equal(records[2].values['备注'].present,false);assert.equal(records[0].values['备注'].value,'=SUM(A1)');
  const selected=openReportExport(s,bound,{scope:'SELECTED',selectedIds:[p.items[0].id]},access);assert.equal(selected.manifest.total,1);assert.equal([...selected.chunks].join('').split('\n').filter(Boolean).length,3);
  const csv=openReportExport(s,bound,{format:'csv'},access),csvBody=[...csv.chunks].join('');assert.ok(csvBody.includes("'=SUM(A1)"));assert.equal(csv.manifest.completion.total,3);
  assert.throws(()=>openReportExport(s,bound,{scope:'SELECTED',selectedIds:['outside']},access),error('EXPORT_SELECTION_OUTSIDE_QUERY'));
  assert.throws(()=>openReportExport(s,query,{},access),error('QUERY_FINGERPRINT_REQUIRED'));
});

test('column selection fixes identity and source drilldown uses the exact inherited query fingerprint',()=>{
  const s=snapshot(),query=q('inventory.summary',{columns:['2026-10-31']}),p=readReport(s,query,access);assert.deepEqual(p.columns,['id','2026-10-31']);
  const r=p.items.find(x=>x.sourceCount===2),detail=reportDetail(s,{...query,fingerprint:p.fingerprint},{recordId:r.id,section:'sources',limit:1},access);
  assert.equal(detail.total,2);assert.equal(detail.items.length,1);assert.equal(detail.nextOffset,1);
  assert.throws(()=>reportDetail(s,{...query,q:'different',fingerprint:p.fingerprint},{recordId:r.id},access),error('QUERY_CONTEXT_CHANGED'));
  assert.throws(()=>readReport(s,q('inventory.summary',{columns:['no-such-column']}),access),error('INVALID_COLUMNS'));
  const empty=readReport(s,{...query,materialSelections:materials(s,{}),columns:['quantity','available','snapshotDate']},access);assert.equal(empty.total,0);assert.ok(empty.columns.includes('snapshotDate'));
});

test('engineering guards: query/candidate/date/scope and capacity Cartesian expansion fail explicitly',()=>{
  const s=snapshot();assert.throws(()=>readReport(s,q('bom.materials',{q:'x'.repeat(201)}),access),error('INVALID_SEARCH'));
  assert.throws(()=>reportOptions(s,q('bom.materials'),{field:'material',category:'成品',limit:101},access),error('INVALID_CANDIDATE_PAGE'));
  assert.throws(()=>readReport(s,q('bom.materials',{toDateInclusive:'2030-01-01'}),access),error('INVALID_DATE_WINDOW'));
  assert.throws(()=>snapshot(fixture(),{scope:'trial:other',actor:'me'}),error('FORBIDDEN'));
  const d=fixture();d.tables['设备与工装']=Array.from({length:500},(_,i)=>({'资源编号':'M'+i}));
  assert.throws(()=>readReport(snapshot(d),q('capacity.daily',{toDateInclusive:'2027-10-31'}),access),error('PROJECTION_TOO_LARGE'));
});

test('bounded chunk composition retains page identity, full totals and complete export beyond current page',()=>{
  const d=fixture();d.tables['每日需求']=Array.from({length:510},(_,i)=>({'需求编号':'WIDE'+i,'成品编号':'FG1','客户编号':'C1','需求日':'1','需求千克':'1','备注':'x'.repeat(900),'扩展':'y'.repeat(900)}));
  const s=snapshot(d),query=q('demand.details',{pageSize:500}),p=readReport(s,query,access);
  assert.equal(p.total,510);assert.ok(p.chunked);assert.ok(p.items.length<500);assert.ok(Buffer.byteLength(JSON.stringify(p))<=LIMITS.responseBytes);
  const items=full(s,query);assert.equal(items.length,510);assert.equal(new Set(items.map(x=>x.id)).size,510);
  const exported=openReportExport(s,{...query,fingerprint:p.fingerprint},{},access);assert.equal(exported.manifest.total,510);let records=0;
  let pending='';for(const chunk of exported.chunks){pending+=chunk;let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);if(JSON.parse(line).kind==='record')records++;}}
  assert.equal(records,510);
});
