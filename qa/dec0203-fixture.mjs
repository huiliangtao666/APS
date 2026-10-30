import {seed} from '../server/planner.ts';
import {migratePolicies,whole} from '../src/lib/resource-policies.mjs';
import {jointParameters} from '../src/lib/joint-policy.mjs';
export const clone=x=>structuredClone(x);
export function policyFixture(kind='tool'){
 const d=migratePolicies(seed);d.routes=d.routes.filter(r=>r['工序编号']==='MIX');d.times=d.times.filter(t=>t['工序编号']==='MIX');d.dependencies=d.dependencies.filter(r=>r['工序编号']==='MIX');d.machines=d.machines.filter(r=>r['工序编号']==='MIX');
 if(kind==='tool'){
  d.tools=[{'工装编码':'G40','工装名称':'仿真工装','适用任务':'MIX','可用数量':'1','每任务需求数量':'1','提前占用分钟':'5','后延占用分钟':'10','是否启用':'是','说明':'可改仿真值，非业务批准','可用起始分钟':'0','可用结束分钟':'600'}];
  d.resourceClaims=d.orders.map(o=>({'声明编号':'C-'+o['订单编号'],'订单编号':o['订单编号'],'工序编号':'MIX','资源类型':'工装','资源编号':'G40','需求数量':'','单位':'套','提前占用分钟':'','后延占用分钟':'','占用口径':whole,'窗口开始偏移分钟':'0','窗口结束偏移分钟':'0','参数来源':'工装配置'}));
  Object.assign(d.rules.find(r=>r['规则编号']==='MOLD'),{'是否启用':'是','参数JSON':JSON.stringify(jointParameters)});
 }else{
  d.personnelGroups=[{'人员组编号':'G1','人员组名称':'仿真共享人员池','人员数量':'1','技能':'A','班次':'早班','可用起始分钟':'0','可用结束分钟':'600'}];
  d.dependencies.push(...d.orders.map(o=>({'订单编号':o['订单编号'],'工序编号':'MIX','资源类型':'人员技能','资源编号':'G1','需求数量':'1','所需技能':'B','所需班次':'早班','人员参与阶段':'明确准备窗口','人员开始偏移':'0','人员结束偏移':'20','窗口外释放':'是'})));
  d.skillSubstitutions=[{'关系编号':'AB','可提供技能':'A','所需技能':'B','是否启用':'是','适用工序':'*','说明':'只允许单跳有向'}];
  d.rules.find(r=>r['规则编号']==='LABOR')['是否启用']='是';
 }
 return d;
}
