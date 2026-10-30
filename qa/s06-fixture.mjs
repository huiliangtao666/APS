import {policyFixture} from './dec0203-fixture.mjs';
export const edges=[{'关系编号':'AB','可提供技能':'A','所需技能':'B','是否启用':'是','适用工序':'*','说明':'S06仿真，非批准默认值'}];
export const groups=['A','B'].map(id=>({'人员组编号':id,'人员组名称':'仿真池'+id,'人员数量':'1','技能':id,'班次':'S','可用起始分钟':'0','可用结束分钟':'600'}));
export const requirements=['B','A'].map((skill,i)=>({'订单编号':'A','工序编号':'MIX','资源类型':'人员技能','资源编号':i?'A':'','候选人员组':i?'':'A,B','需求数量':'1','所需技能':skill,'所需班次':'S','人员参与阶段':'R'+(i+1),'人员开始偏移':'0','人员结束偏移':'0','窗口外释放':'是'}));
export function s06Fixture(){
 const d=policyFixture('personnel');d.orders=d.orders.filter(r=>r['订单编号']==='A');d.dependencies=d.dependencies.filter(r=>r['订单编号']==='A'&&r['资源类型']!=='人员技能');d.personnelGroups=structuredClone(groups);d.dependencies.push(...structuredClone(requirements));d.skillSubstitutions=structuredClone(edges);return d;
}
