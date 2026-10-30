import {seed} from '../server/planner.ts';
import {batchFixture} from './batch-fixture.mjs';
import {jointFixture,claim,enableJoint} from './joint-fixture.mjs';
import {pool} from './p10-core-fixture.mjs';
export function jointEnabledFixture(){
 const d=batchFixture(seed);d.orders[0]['合格需求']='240';d.orders.push({...d.orders[0],'订单编号':'B','优先顺序':'2'});
 d.dependencies.push(...d.dependencies.filter(r=>r['订单编号']==='A').map(r=>({...r,'订单编号':'B'})));
 d.machines.forEach(m=>m['最大装载kg']='500');d.batchResources.forEach(r=>r['容量']='500');
 d.tools=jointFixture(seed).tools;Object.assign(d.tools[0],{'可用数量':'2','可用起始分钟':'0','可用结束分钟':'600'});
 enableJoint(d,'MOLD');enableJoint(d,'STORAGE');
 d.batchResources.push({'资源编号':'COOL','资源类型':'共享冷却空间','容量':'1200','单位':'kg','允许程序':'','说明':'合成断言输入，非现场默认'});
 d.resourceClaims=d.orders.flatMap(o=>[claim('T'+o['订单编号'],o['订单编号'],'MIX','G40','工装','1','套','0','10'),claim('S'+o['订单编号'],o['订单编号'],'MIX','COOL','空间','600','kg','0','30')]);
 d.personnelPools=[pool('P','3')];d.personnelGroups=['G1','G2'].map(id=>({'人员组编号':id,'人员组名称':id,'人员数量':'3','技能':'MIX','班次':'D','可用起始分钟':'0','可用结束分钟':'600',poolId:'P'}));
 d.dependencies.push(...d.orders.flatMap(o=>Array.from({length:o['订单编号']==='A'?2:1},(_,i)=>({'订单编号':o['订单编号'],'工序编号':'MIX','资源类型':'人员技能','资源编号':i?'G2':'G1','需求数量':'1','所需技能':'MIX','所需班次':'D','人员岗位编号':'POST'+i,'人员参与阶段':'操作','人员开始偏移':'0','人员结束偏移':'0','窗口外释放':'是'}))));
 return d;
}
