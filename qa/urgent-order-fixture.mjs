// Synthetic single-operation fixture. No private workbook is reproduced here.
// This is the design's 60-minute example, not the 900/600kg full-route test.
import {workbookSchema,refreshDerived,dayDate,PROFILE,hash} from '../server/workbook-model.mjs';
import {calculateWorkbook} from '../server/workbook-plan.mjs';
import {MINUTE_ORIGIN} from '../server/workbook-minute.mjs';
export const selection={startDay:1,endDay:2,currentDay:1};
export const observed=1440+9*60+17;
export function urgentFixture(){
 const tables=Object.fromEntries(Object.keys(workbookSchema.tables).map(t=>[t,[]]));
 const products=['P1','P2','P3','PU','W'];
 tables['物料主数据']=[...products.map(id=>({'物料编号':id,'物料名称':id,'物料类别':'成品','物料来源':'制造','基础单位':'千克','每箱净重千克':'6','每件净重千克':'1','保质天数':'30','生产提前期天数':'0','检验提前期天数':'0'})),...['RM','RM3'].map(id=>({'物料编号':id,'物料名称':id,'物料来源':'采购','基础单位':'千克','保质天数':'30'}))];
 tables['客户与交付']=[{'客户编号':'C','客户名称':'合成客户','客户等级':'A','运输天数':'0','允许提前天数':'0','允许延后天数':'0','到货剩余保质比例':'0','服务优先级':'1'}];
 tables['工厂日历']=[{'日序':'1','公历日期':dayDate(1).replaceAll('-',''),'生产班次数':'1','日产能分子':'1','日产能分母':'1'}];
 tables['班组资源']=[{'班组编号':'CREW','每班可用人数':'10','标准日班次数':'1','周日班次数':'1'}];
 tables['设备与工装']=[...['EQ1','EQ2'].map((id,i)=>({'资源编号':id,'资源类别':'设备','资源组编号':i?'G2':'G1','可用数量':'1','单次批量上限千克':'1000','标准日产能千克':'10000','资源占用方式':'独占','生产日历方式':'工厂班次','产线编号':'LN01'})),{'资源编号':'TL','资源类别':'工装','资源组编号':'T','可用数量':'1','单次批量上限千克':'1000','产线编号':'LN01'}];
 tables['工艺路线']=products.map(id=>({'路线工序编号':'RT-'+id,'成品编号':id,'工序编号':'OP','工序名称':'单工序','工序顺序':'1','设备组编号':id==='P3'?'G2':'G1','班组编号':'CREW','需求人数':'1','每批工装套数':'0','所需工装类型':'T','工时模型':'固定连续历时','基准加工分钟':'60','固定准备分钟':'0','最短工艺分钟':'60','基准加工量千克':'6','人员参与方式':'全程参与','允许跨班连续':'否','开始参与分钟':'0','结束参与分钟':'0','工装后延释放分钟':'0','最大等待分钟':'600'}));
 tables['生产班次']=[{'班次日历编号':'SHIFT','开始分钟偏移':'1980','结束分钟偏移':'2460'}];
 tables['工装资源池']=[{'实体工装编号':'TL','工装类型':'T'}];
 tables['换型清洗']=products.flatMap(from=>products.map(to=>({'清洗规则编号':from+'-'+to,'设备组编号':to==='P3'?'G2':'G1','前产品编号':from,'后产品编号':to,'清洗分钟':'0','清洗人数':'0'})));
 tables['物料清单']=[['PU','RM'],['P3','RM3']].map(([parent,child])=>({'用量关系编号':'B-'+parent,'清单版本编号':'BOM-'+parent,'父项编号':parent,'子项编号':child,'父项基准产出千克':'1','子项基准用量':'1','数量单位':'千克','生效日':'0','失效日':'44','标准收率':'1'}));
 tables['工序投料']=[['PU','RM'],['P3','RM3']].map(([parent,child])=>({'投料映射编号':'FEED-'+parent,'用量关系编号':'B-'+parent,'父物料编号':parent,'子物料编号':child,'路线工序编号':'RT-'+parent}));
 tables['库区库位']=[{'库位编号':'LOC','最大容量':'10000','容量单位':'千克'}];
 tables['期初库存']=['RM','RM3'].map(id=>({'库存批次编号':'LOT-'+id,'物料编号':id,'库位编号':'LOC','当前数量':'1000','期初已占用量':'0','数量单位':'千克','质量状态':'合格','放行日':id==='RM'?'0':'1','快照日':id==='RM'?'0':'1','到期日':'43'}));
 tables['期初在制']=[{'在制批次编号':'WIP','成品编号':'W','当前工序编号':'OP','占用资源编号':'EQ1','预计合格产出':'1','数量单位':'千克','已开工日':'1','预计完工日':'1','预计放行日':'1','已投料口径':'已投料不回库','库存口径':'期初净账'}];
 tables['在制剩余映射']=[{'在制批次编号':'WIP','当前路线工序编号':'RT-W','当前占用设备编号':'EQ1','当前占用数量千克':'1','保留开始分钟偏移':'1980','保留结束分钟偏移':'2040','当前实体工装编号':'TL','工装保留至':'2026-11-01T10:00:00+08:00','剩余人员班组编号':'CREW','结束参与人数':'1','结束参与分钟':'0','剩余路线工序编号':'RT-W','尚需投料BOM编号':'','预计完工时刻':'2026-11-01T10:00:00+08:00','预计放行时刻':'2026-11-01T10:00:00+08:00'}];
 tables['日业务时点规则']=[{'规则编号':'BOUNDARY','业务对象':'日业务','日内时点':'10:00'}];
 tables['每日需求']=['P1','P2','P3'].map((id,i)=>({'需求编号':'N'+(i+1),'需求日':'1','客户编号':'C','成品编号':id,'需求箱数':'1'}));
 for(const values of Object.values(tables))values.forEach((r,i)=>r._row=i+3);
 const globals={'生产计算精度分钟':1,'甘特显示刻度分钟':30,'第一班开始分钟':540,'第一班结束分钟':1020,'第二班开始分钟':1020,'第二班结束分钟':1440,'日粒度放行时点分钟':600,'日粒度到货时点分钟':600,'最早交付日内时点分钟':600,'最晚交付日内时点分钟':1440,'批次到期日内失效分钟':1440,'重排保护时段':0,'客户服务优先级排序方向':'数值小优先'};
 const d={id:'SYNTHETIC-URGENT',name:'独立单工序合成夹具',version:1,fileHash:'synthetic-not-user-data',profile:PROFILE,productionContract:'workbook-minute-v2',minuteOrigin:MINUTE_ORIGIN,bindings:[],tables,drafts:[],effectiveParameters:{values:Object.entries(globals).map(([field,value])=>({object:/班开始|班结束|日粒度/.test(field)?'CAL':'GLOBAL',field,value,from:0,to:44}))}};
 refreshDerived(d,1);return d;
}
export function urgentBaseline(){const d=urgentFixture(),result=calculateWorkbook(d,selection);return {d,result};}
export function planOf(d,result){return {id:'SYNTHETIC-PLAN',baseRunId:'BASE',headRunId:'BASE',inputHash:hash(d),revision:1,factsRevision:1,selection,originalDemandIds:result.demandResults.map(r=>r.id),facts:{sourceResultHash:hash(result),observationMinute:observed,tasks:result.tasks.map(t=>({id:t.id,status:'not_started'})),completed:Object.fromEntries(result.demandResults.map(r=>[r.id,0]))},batches:[]};}
export const urgentRow=(id='U1')=>({'需求编号':id,'需求日':'1','客户编号':'C','成品编号':'PU','需求箱数':'1',_row:3});
