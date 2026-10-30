import {stageEvents} from '../src/lib/simulation-events.mjs';
import {seed} from '../server/planner.ts';
import {executionFixture} from './execution-fixture.mjs';
import {event} from './event-fixture.mjs';
import {claim} from './joint-fixture.mjs';
// These are inputs sent through the actual validator. No saved/confirmed plans
// or input versions are written into the store by this fixture.
export function categoryInputs(execution=false,applied=false){
 const d=execution?executionFixture(seed):structuredClone(seed);
 if(!execution)d.bom=[{'版本编号':'QUERY-V1','产品编号':'HC40','生效日期':'2026-01-01','投料工序编号':'MIX','用量类型':'BOM物料','物料编号':'LEAN','配置用量':'1000','用量单位':'kg','用量基准':'每1000kg投入','收率/损耗口径备注':'模拟','损坏比例':'0'}];
 d.downtime=[{'设备编号':'MIX02','起始分钟':'120','结束分钟':'130','原因':'模拟例外'}];
 d.supplies=[{'供给编号':'S1','物料编号':'LEAN','批次编号':'S-LOT','预计数量':'100','预计到达时间':'2026-11-02T08:30:00+08:00','预计可用时间':'2026-11-02T08:40:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];
 d.supplyDelays=[{'记录编号':'D1','供给编号':'S1','记录时间':'2026-11-01T08:00:00+08:00','调整后到达时间':'2026-11-02T09:00:00+08:00','调整后可用时间':'2026-11-02T09:10:00+08:00','原因':'模拟延迟'}];
 d.supplyUses=[{'引用编号':'U1','订单编号':'A','工序编号':'MIX','供给编号':'S1','使用数量':'10'}];
 d.tools=[{'工装编码':'G40','工装名称':'模拟工装','适用任务':'MIX|FILL','可用数量':'2','每任务需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','可用起始分钟':'0','可用结束分钟':'480','是否启用':'是','说明':'配置不代表已占用'}];
 d.batchResources=[{'资源编号':'SPACE1','资源类型':'共享冷却空间','容量':'10','单位':'位置','允许程序':'','说明':'显式模拟空间'}];
 d.resourceClaims=[claim('G-A','A','MIX','G40'),claim('SPACE-A','A','FILL','SPACE1','空间','1','位置')];
 d.deliveryConditions=[{'订单编号':'A','模拟质量状态':'模拟合格','模拟质量可用时间':'','模拟有效期截止时间':'2026-12-31T08:00:00+08:00','要求剩余有效分钟':'0'}];
 d.personnelGroups=[{'人员组编号':'GROUP1','人员组名称':'模拟人员组','人员数量':'2','技能':'fill','班次':'day','可用起始分钟':'0','可用结束分钟':'480'}];
 d.dependencies.push({'订单编号':'A','工序编号':'FILL','资源类型':'人员技能','资源编号':'GROUP1','需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','所需技能':'fill','所需班次':'day','人员参与阶段':'全工序','人员开始偏移':'0','人员结束偏移':'0'});
 if(execution){
  d.executionSources=[{'来源编号':'SRC1','原始任务编号':'A-MIX','事实编号':'F-A-MIX','原始汇总耗料':'40','耗料单位':'kg','来源说明':'模拟离线来源','原始分配JSON':JSON.stringify([{'记录编号':'C1','批次编号':'EX-LOT','物料编号':'LEAN','数量':'40','单位':'kg'}])}];
  d.simulationEvents=[event('设备故障',{machineId:'MIX02',endMinute:60})];
 }
 if(execution&&applied){const staged=stageEvents({...d,simulationEvents:[]},d,['executionFacts','simulationEvents']);if(staged.issues.length)throw Error(JSON.stringify(staged.issues));return staged.data;}
 return d;
}
export const edits={products:['产品名称','模拟新产品名称'],materials:['物料名称','模拟新物料名称'],supplies:['预计数量','101'],supplyDelays:['原因','模拟延期已核对'],supplyUses:['使用数量','11'],inventory:['位置','模拟新库位'],orders:['优先顺序','3'],bom:['收率/损耗口径备注','模拟新备注'],routes:['工序名称','模拟混合新名称'],times:['固定分钟','31'],machines:['设备名称','模拟设备新名称'],tools:['工装名称','模拟工装新名称'],deliveryConditions:['要求剩余有效分钟','1'],resourceClaims:['后延占用分钟','1'],batchResources:['说明','模拟空间新说明'],calendars:['说明','模拟日历新说明'],downtime:['原因','模拟停机新原因'],dependencies:['资源编号','MIX02'],personnelGroups:['人员组名称','模拟人员组新名称'],rules:['中文名称','模拟规则新名称']};
