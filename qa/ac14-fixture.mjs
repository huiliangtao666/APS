import {seed} from '../server/planner.ts';
import {batchFixture} from './batch-fixture.mjs';
import {jointParameters} from '../src/lib/joint-policy.mjs';
export function base(spaceCap='480'){
 const d=batchFixture(seed);
 d.orders[0]['合格需求']='240';
 d.orders.push({...d.orders[0],'订单编号':'B','优先顺序':'2'});
 d.dependencies.push(...d.dependencies.filter(r=>r['订单编号']==='A').map(r=>({...r,'订单编号':'B'})));
 d.machines.forEach(m=>{m['最小装载kg']='0';m['最大装载kg']='500';});
 d.batchResources.filter(r=>r['资源类型']==='批处理装载').forEach(r=>r['容量']='500');
 d.times.forEach(t=>t['固定分钟']=t['工序编号']==='MIX'?'120':'60');
 d.routes.find(r=>r['工序编号']==='FILL')['最大等待分钟']='10';
 d.batchResources.push({'资源编号':'COLD','资源类型':'共享冷却空间','容量':spaceCap,'单位':'kg','允许程序':'','说明':'UAT13/14 冷却空间验证值'});
 d.resourceClaims=['A','B'].map(id=>({'声明编号':'COLD-'+id,'订单编号':id,'工序编号':'FILL','资源类型':'空间','资源编号':'COLD','需求数量':'240','单位':'kg','提前占用分钟':'0','后延占用分钟':'0','占用口径':'显式逐生产批完整区间','窗口开始偏移分钟':'0','窗口结束偏移分钟':'0','参数来源':'逐项声明'}));
 const storage=d.rules.find(r=>r['规则编号']==='STORAGE');storage['是否启用']='是';storage['参数JSON']=JSON.stringify(jointParameters);
 return d;
}
