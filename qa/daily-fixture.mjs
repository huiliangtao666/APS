import {urgentFixture} from './urgent-order-fixture.mjs';
import {refreshDerived,dayDate,hash} from '../server/workbook-model.mjs';
export function dailyFixture(){
 const d=urgentFixture();delete d.productionContract;delete d.minuteOrigin;delete d.effectiveParameters;
 d.id='18477fde-464f-4c26-a343-c107c8ba9202';d.name='EXPLICIT_MOCK #170 two/four-day source';d.fileHash=hash({fixture:'DAILY170_V1'});d.timeUnit='day';d.dayZero='2026-10-31';
 const products=['FG101','FG102'],raw=['RM101','RM102','RM103','PM101'];
 d.tables['物料主数据']=[...products.map(id=>({'物料编号':id,'物料名称':id,'物料类别':'成品','物料来源':'制造','基础单位':'千克','每箱净重千克':'1','每件净重千克':'1','保质天数':'30','生产提前期天数':'0','检验提前期天数':'0'})),...raw.map(id=>({'物料编号':id,'物料名称':id,'物料类别':'原料','物料来源':'采购','基础单位':id==='PM101'?'米':'千克','保质天数':'30','参考供货关系编号':'SUP-'+id}))];
 d.tables['期初库存']=raw.map((id,i)=>({'库存批次编号':'LOT-'+id,'物料编号':id,'库位编号':id==='PM101'?'LOC-M':'LOC','当前数量':String([85,70,1,1500][i]),'期初已占用量':'0','数量单位':id==='PM101'?'米':'千克','质量状态':'合格','放行日':'0','快照日':'0','到期日':'31'}));
 d.tables['库区库位']=[{'库位编号':'LOC','最大容量':'100000','容量单位':'千克'},{'库位编号':'LOC-M','最大容量':'100000','容量单位':'米'}];
 d.tables['每日需求']=[['N1','FG101',100,1],['N2','FG102',80,1],['N3','FG101',50,2]].map(([id,p,n,day])=>({'需求编号':id,'成品编号':p,'需求箱数':String(n),'需求日':String(day),'客户编号':'C'}));
 d.tables['期初在制']=[];d.tables['在制剩余映射']=[];d.tables['生产班次']=[];d.tables['换型清洗']=[];
 d.tables['工厂日历']=Array.from({length:30},(_,i)=>({'日序':String(i+1),'公历日期':dayDate(i+1).replaceAll('-',''),'生产班次数':'1','日产能分子':'1','日产能分母':'1'}));
 d.tables['工艺路线']=products.map(id=>({'路线工序编号':'RT-'+id,'成品编号':id,'工序编号':'OP','工序名称':'完整单工序样例','工序顺序':'1','设备组编号':'G1','班组编号':'CREW','需求人数':'1','每批工装套数':'0','所需工装类型':'T','跨日历时天数':'0'}));
 const bill={FG101:[0.85,0.2,0,10],FG102:[0.2,0.85,0.01,10]};
 d.tables['物料清单']=products.flatMap(p=>raw.flatMap((m,i)=>bill[p][i]?[{'用量关系编号':'B-'+p+'-'+m,'清单版本编号':'BOM-'+p,'父项编号':p,'子项编号':m,'父项基准产出千克':'1','子项基准用量':String(bill[p][i]),'数量单位':m==='PM101'?'米':'千克','生效日':'0','失效日':'44','标准收率':'1'}]:[]));
 d.tables['供应商与供货条件']=raw.map(id=>({'供货关系编号':'SUP-'+id,'物料编号':id,'供应商编号':'S','供应商名称':'显式mock供应商','采购导期天数':'1','检验天数':'0','最小订货量':id==='PM101'?'1000':'50','订货倍数':id==='PM101'?'1000':'50','生效日':'0','失效日':'44'}));
 d.tables['工序投料']=[];d.mapping={mock:true,version:'DAILY170-MOCK-1',line:{id:'LN01'},resources:[],sfRoutes:[],tool_pools:{T:['TL']},wip_remaining:[],feed_mappings:d.tables['物料清单'].map(r=>({bom_id:r['用量关系编号'],route_step_id:'RT-'+r['父项编号']})),capabilities_required:[]};
 for(const values of Object.values(d.tables))values.forEach((r,i)=>r._row=i+3);
 refreshDerived(d,1);return d;
}
export const policies={scales:{FG101:1000,FG102:1000,RM101:1000,RM102:1000,RM103:1000,PM101:1000},purchaseReceipts:{},transitBasis:'NET_OPEN'};
export const branchBody={id:'DAILY170',scenario:'MOCK170',isolated:true,startDate:'2026-11-01',endDate:'2026-11-30',dayZero:'2026-10-31',granularity:'day',windowDays:14,policies};
