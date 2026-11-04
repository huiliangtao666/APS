import {sourceHash} from '../server/query-reports/source-copy.mjs';
import {sourceIdentity} from '../server/workbook-workbench.mjs';
/** Synthetic contract boundaries only. These rows do not impersonate a real run. */
export function mpsFixture(){
 const d={id:'MPS-UNIT',version:1,profile:'mps-contract-fixture',fileHash:'fixture-file',dayZero:'2026-10-31',mapping:{},tables:{
  '物料主数据':[
   {物料编号:'FG1',物料名称:'成品一',物料类别:'成品',物料来源:'制造',基础单位:'千克',生产提前期天数:'2',检验提前期天数:'1',安全库存量:'50'},
   {物料编号:'RM1',物料名称:'原料一',物料类别:'原料',物料来源:'采购',基础单位:'千克',参考供货关系编号:'S1',安全库存量:'10'},
   {物料编号:'PK1',物料名称:'标签',物料类别:'包装',物料来源:'采购',基础单位:'个',参考供货关系编号:'S2'}],
  '物料清单':[{用量关系编号:'B1',父项编号:'FG1',子项编号:'RM1',父项基准产出千克:'1000',子项基准用量:'900',数量单位:'千克',生效日:'0',失效日:'99',清单版本编号:'V1'},{用量关系编号:'B2',父项编号:'FG1',子项编号:'PK1',父项基准产出千克:'1000',子项基准用量:'100',数量单位:'个',生效日:'0',失效日:'99',清单版本编号:'V1'}],
  '供应商与供货条件':[{供货关系编号:'S1',物料编号:'RM1',供应商编号:'SUP1',采购导期天数:'2',检验天数:'1'},{供货关系编号:'S2',物料编号:'PK1',采购导期天数:'1',检验天数:'0'}],
  '每日需求':[{需求编号:'D1',成品编号:'FG1',客户编号:'C1',需求日:'12',按要求日最晚发运日:'11',需求千克:'100',已发运千克:'20'}],
  '物料需求来源':[{物料需求编号:'MR1',所需物料编号:'RM1',父项编号:'FG1',需料日:'3',需求数量:'30',数量单位:'千克'},{物料需求编号:'MR2',所需物料编号:'RM1',父项编号:'FG2',需料日:'3',需求数量:'40',数量单位:'千克'}],
  '期初库存':[{库存批次编号:'L1',物料编号:'FG1',当前数量:'100',期初已占用量:'50',放行日:'0',到期日:'99',快照日:'0',质量状态:'合格',数量单位:'千克'}],
  '既有采购在途':[{在途记录编号:'PO1',采购订单编号:'PO',订单行号:'1',物料编号:'RM1',供货关系编号:'S1',订购数量:'120',已收数量:'20',约定到货日:'2',预计放行日:'3',在途状态:'未收',数量单位:'千克'}],
  '期初在制':[{在制批次编号:'W1',成品编号:'FG1',预计合格产出:'20',预计完工日:'2',预计放行日:'3',数量单位:'千克'}],
  '采购订单草案':[{采购建议编号:'BUY1',物料编号:'RM1',建议采购数量:'5000',生产需料日:'2',预计放行日:'3',数量单位:'千克'}],
  '生产补给建议':[], '配置参数':[], '工厂日历':[]
 }};
 for(const rows of Object.values(d.tables))for(const [i,r]of rows.entries())r._row=i+3;
 return d;
}
export function mpsRun(d){
 const selection={startDay:1,endDay:15,currentDay:1};
 const tasks=[{id:'T0',productionId:'MAKE1',productId:'FG1',routeStepId:'S0',start:4000,end:4200,quantity:100},{id:'T1',productionId:'MAKE1',productId:'FG1',routeStepId:'S1',start:4200,end:4317,quantity:100},{id:'TW',productionId:'W1',productId:'FG1',routeStepId:'SW',start:4000,end:4100,quantity:20}];
 const result={status:'completed',source:{datasetId:d.id,version:d.version,fileHash:d.fileHash,mappingHash:sourceHash(d.mapping),parameterHash:sourceHash(d.tables['配置参数'])},conditions:{...selection,interval:'[start,end)'},timeUnit:'minute',dayZero:d.dayZero,minuteOrigin:'2026-10-31T00:00:00+08:00',tasks,
  demandResults:[{id:'D1',productId:'FG1',quantity:100,status:'scheduled',arrivalDay:12}],allocations:[{need:'D1',consumer:'D1',materialId:'FG1',supplyId:'production:MAKE1',quantity:100,kind:'本次制造产出',source:{taskId:'T1',productionId:'MAKE1'}},{need:'D1',consumer:'MAKE1:S0',materialId:'RM1',supplyId:'transit:PO1',quantity:10,feedMinute:4319,kind:'需求',taskId:'T0'}],suggestions:[{id:'SH1',materialId:'RM1',quantity:5000,unit:'千克',needDay:2,availableDay:3,status:'reference'}],findings:[],shortages:[]};
 return {id:'RUN-MPS',datasetId:d.id,version:d.version,status:'completed',selection,result,inputHash:sourceHash(d),resultHash:sourceHash(result),provenance:{dayZero:d.dayZero,effectiveAt:1,parameterScope:'dataset'}};
}
export function mpsContext(input=mpsFixture(),run){
 const sources=sourceIdentity(input),identity={datasetId:input.id,version:input.version,scope:'dataset',inputHash:sourceHash(input),...sources,dayZero:input.dayZero,timeUnit:run?'minute':'day',...(run?{runId:run.id,resultHash:sourceHash(run.result),minuteOrigin:run.result.minuteOrigin}:{})};
 identity.fingerprint=sourceHash(identity);return {input,run,identity,sources,actor:'unit-user'};
}
