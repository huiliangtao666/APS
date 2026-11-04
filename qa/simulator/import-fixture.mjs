// Explicit engineering fixture for native field mapping, never a real run or user dataset.
import fs from 'node:fs';
import {rawHash} from '../../server/simulator/source.mjs';
import {parameterCatalog} from '../../server/parameter-contract.mjs';
export const schema=JSON.parse(fs.readFileSync(new URL('../../server/workbook-schema.json',import.meta.url),'utf8'));
const h='a'.repeat(64);
export function nativeFixture(){
  const parameter=(key,name,value,unit,object='GLOBAL',role='P')=>({'参数编号':key,'对象编号':object,'参数名称':name,'参数值':String(value),'单位':unit,'生效日':'0','失效日':'44',
    _sourceRole:role,_scope:'dataset',_profile:'workbook-day',_source:{role,fileHash:h,sheet:'仿真参数实例',row:3}});
  const tables=Object.fromEntries(Object.keys(schema.tables).map(t=>[t,[]]));
  tables['物料主数据']=[{'物料编号':'RAW','物料名称':'工程原料','基础单位':'千克'},{'物料编号':'FG','物料名称':'工程成品','基础单位':'千克'}];
  tables['库区库位']=[{'库位编号':'LOC','储存环境':'冷藏'}];
  tables['期初库存']=[{'库存批次编号':'LOT','物料编号':'RAW','当前数量':'100','数量单位':'千克','质量状态':'合格','放行日':'-1','到期日':'5','快照日':'0','期初已占用量':'20','库位编号':'LOC'}];
  tables['既有采购在途']=[{'在途记录编号':'PO','物料编号':'RAW','订购数量':'60','数量单位':'千克','采购订单编号':'PUR','订单行号':'1','约定到货日':'2'}];
  tables['每日需求']=[{'需求编号':'D','成品编号':'FG','客户编号':'C','需求千克':'30','需求日':'1'}];
  tables['物料清单']=[{'用量关系编号':'BOM','清单版本编号':'B1','父项编号':'FG','子项编号':'RAW','父项基准产出千克':'1000','子项基准用量':'1200','数量单位':'千克','标准收率':'0.8','生效日':'0','失效日':'44'}];
  tables['工厂日历']=Array.from({length:16},(_,n)=>({'日序':String(n),'公历日期':new Date(Date.UTC(2026,9,31+n)).toISOString().slice(0,10)}));
  tables['配置参数']=[parameter('B-WINDOW','窗口天数',7,'天','GLOBAL','B'),parameter('P-WINDOW','窗口天数',14,'天'),
    parameter('P-EXPIRY','批次到期日内失效分钟',0,'日内分钟')];
  const input={id:'explicit-engineering-source',version:1,profile:'excel-qualified-output-202611-r1',fileHash:h,mapping:null,tables,
    parameterContract:'CR-PARAM-UI-20261101:r1',parameterPrecedence:'two-file-precedence-r1',
    parameterDefinitions:structuredClone(parameterCatalog),parameterSources:[{fileHash:h,role:'P',mode:'dataset'}]};
  const run={id:'engineering-run',datasetId:input.id,version:1,inputHash:rawHash(input),selection:{startDay:0,endDay:3},status:'queued',result:null};
  const asOf='2026-10-31T00:00:00+08:00';
  return {kind:'FROZEN_RUN_COPY',frozen:{input,run},calendar:{dayZero:'2026-10-31',minuteOrigin:asOf,startDate:'2026-10-31',endDate:'2026-11-02',coverageEnd:'2026-11-15'},
    opening:{asOf,version:'engineering-opening@1',source:'explicit-test-facts',inventoryBasis:'AFTER_CONSUMPTION',materialScales:{RAW:1000,FG:1000},
      purchases:{PO:{asOf,source:'explicit-test-purchase',issued:true,received:40,cancelled:0}},
      demands:{D:{asOf,source:'explicit-test-delivery',change:0,cancelled:0,shipped:0,signed:0,fulfillment:'SHIP'}}},
    script:{rules:{version:'explicit-test-rules@1',hash:'b'.repeat(64)},events:[]},production:{mode:'NON_PRODUCTION',taskIds:[]}};
}
export function rehash(f){f.frozen.run.inputHash=rawHash(f.frozen.input);return f;}
