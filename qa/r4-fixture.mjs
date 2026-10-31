import {seed} from '../server/planner.ts';
import {materialFixture} from './material-fixture.mjs';
import {batchParameters} from '../src/lib/batch-policy.mjs';
import {enableJoint,claim} from './joint-fixture.mjs';
export const at='2026-10-31T00:00:00Z';
// Explicit software facts. Fixed PACK50, BOM version/date and normalized order
// fields are supplements, never claims about original customer CSV admission.
export function r4Scenario(id='13'){
 const d=materialFixture(seed),names=['MIX','FILL','HEAT','COOL','PACK'];
 d.orders=[{...seed.orders[0],'合格需求':'240','已完成合格数量':'0'}];
 if(id!=='12')d.orders.push({...d.orders[0],'订单编号':'B','优先顺序':'2'});
 d.factoryLines=[{'工厂编号':'F01','工厂名称':'R4显式模拟工厂','产线编号':'L01','产线名称':'R4模拟线','时区':'Asia/Shanghai'}];
 d.products=[{...d.products[0]}];
 d.routes=names.map((op,i)=>({'产品编号':'HC40','工序编号':op,'工序名称':op+'模拟工序','前序工序':names[i-1]||'','最大等待分钟':op==='COOL'?'10':'','程序编号':op==='HEAT'?'TP-HC40':''}));
 d.times=names.map((op,i)=>({'产品编号':'HC40','工序编号':op,'计算方式':'固定','固定分钟':String([30,30,120,60,50][i]),'速度支每分钟':''}));
 d.machines=[...['MIX','FILL'].flatMap(op=>[1,2].map(n=>[op+'0'+n,op,op==='MIX'?'300':'10000','BOM总投入'])),['HEAT01','HEAT','500','BOM总投入'],['COOL01','COOL','240','合格产出'],['COOL02','COOL','240','合格产出'],['PACK01','PACK','10000','合格产出']].map(([m,op,max,basis])=>({'设备编号':m,'设备名称':m,'产线编号':'L01','工序编号':op,'日历编号':'FC01','最小装载kg':'0','最大装载kg':max,'装载计量基准':basis}));
 d.dependencies=d.orders.flatMap((o,i)=>[...names.map(op=>({'订单编号':o['订单编号'],'工序编号':op,'资源类型':'设备','资源编号':op+(['MIX','FILL','COOL'].includes(op)?'0'+(i+1):'01'),'需求数量':'1','提前占用分钟':'0','后延占用分钟':'0'})),{'订单编号':o['订单编号'],'工序编号':'COOL','资源类型':'空间','资源编号':'COLD','需求数量':'240','提前占用分钟':'0','后延占用分钟':'0'}]);
 d.bom=d.bom.map(r=>({...r,'版本编号':'R4-SYNTHETIC-v1','投料工序编号':r['用量类型']==='包装物料'?'PACK':'MIX','损坏比例':r['用量类型']==='包装物料'?'0':'','收率/损耗口径备注':''}));
 d.batchResources=[{'资源编号':'HEAT01','资源类型':'批处理装载','容量':'500','单位':'kg','允许程序':'TP-HC40','说明':'显式模拟固定程序'}, {'资源编号':'COLD','资源类型':'共享冷却空间','容量':id==='14'?'400':'480','单位':'kg','允许程序':'','说明':'显式模拟kg容量'}];
 for(const id of ['CAPACITY','PROGRAM','MAX_LAG'])Object.assign(d.rules.find(r=>r['规则编号']===id),{'是否启用':'是','参数JSON':JSON.stringify(id==='CAPACITY'?batchParameters:id==='PROGRAM'?{兼容条件:batchParameters.合批条件}:{})});
 enableJoint(d,'STORAGE');d.resourceClaims=d.orders.map(o=>claim('R4-COLD-'+o['订单编号'],o['订单编号'],'COOL','COLD','空间','240','kg'));
 d.downtime=id==='12'?[{'设备编号':'COOL01','起始分钟':'180','结束分钟':'210','原因':'原UAT12形状的显式模拟停机'}]:[];
 d.resourceStops=[];d.personnelGroups=[];d.personnelPools=[];d.tools=[];
 return d;
}
