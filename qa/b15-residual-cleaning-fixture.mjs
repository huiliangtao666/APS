import {seed} from '../server/planner.ts';import {pool} from './p10-core-fixture.mjs';
export function cleaningFixture(reverse=false){
 const d=structuredClone(seed);d.factoryLines=[{'工厂编号':'F01','工厂名称':'BR13明确模拟','产线编号':'L01','产线名称':'模拟线','时区':'Asia/Shanghai'}];d.routes=d.routes.filter(r=>r['工序编号']==='MIX');d.times=d.times.filter(r=>r['工序编号']==='MIX');d.machines=d.machines.filter(m=>m['设备编号']==='MIX01');d.dependencies=d.dependencies.filter(r=>r['工序编号']==='MIX').map(r=>({...r,'资源编号':'MIX01'}));
 d.orders.forEach((o,i)=>o['产品编号']=reverse?(i?'HC40':'HC60'):(i?'HC60':'HC40'));
 d.bom=[];d.inventory=[];d.personnelGroups=[{'人员组编号':'CLEAN','人员组名称':'明确模拟清洗组','人员数量':'1','技能':'clean','班次':'D','可用起始分钟':'0','可用结束分钟':'600',poolId:'CLEAN-POOL'}];d.personnelPools=[pool('CLEAN-POOL','1')];
 d.supplies=[{'供给编号':'S','物料编号':'LEAN','批次编号':'S-LOT','预计数量':'1','预计到达时间':'2026-11-02T09:30:00+08:00','预计可用时间':'2026-11-02T09:30:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];d.supplyUses=[{'引用编号':'USE-B','订单编号':'B','工序编号':'MIX','供给编号':'S','使用数量':'1'}];
 const policy=(from,to,duration,wait)=>({id:from+'-'+to,from,to,resourceIds:['MIX01'],prohibited:false,durationMinutes:duration,resources:[{type:'设备',id:'MIX01',quantity:1}],personnel:[{groupId:'CLEAN',quantity:1,skill:'clean'}],validation:{clock:'elapsed-minutes',waitMinutes:wait,resources:[{type:'设备',id:'MIX01',quantity:1}],personnel:[]},source:{id:'EXPLICIT-REPLACEABLE-MOCK-'+from+'-'+to,version:'1'}});
 d.rules.push({'规则编号':'CLEANING','中文名称':'换型清洗方向政策','是否启用':'是','参数JSON':JSON.stringify({contract:'BR13-saved-order-v1',startPolicy:'前序结束',source:{id:'EXPLICIT-REPLACEABLE-MOCK',version:'1'},policies:[policy('HC40','HC60',10,5),policy('HC60','HC40',20,7)]})});return d;
}
