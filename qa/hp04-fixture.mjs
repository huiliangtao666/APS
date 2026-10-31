import {twoTasks} from './p10-explicit-fixture.mjs';
export const hp04Orders=['先扩展占用再检查可用性','先检查可用性再扩展占用'];
// Explicit synthetic input; these numbers are test premises, never product defaults.
export function hp04Fixture(order=hp04Orders[0]){
 const d=twoTasks();d.factoryLines=[{'工厂编号':'F01','工厂名称':'H-P04 MOCK工厂','产线编号':'L01','产线名称':'H-P04 MOCK产线','时区':'Asia/Shanghai'}];d.personnelPools[0]['总人数']='1';d.personnelGroups.forEach(g=>{g['人员数量']='1';g['可用起始分钟']='0';g['可用结束分钟']='600';});
 d.dependencies.filter(r=>r['资源类型']==='人员技能').forEach(r=>Object.assign(r,{'人员参与阶段':'MOCK装卸','人员开始偏移':'0','人员结束偏移':'0','提前占用分钟':'5','后延占用分钟':'10','人员占用基准':'参与窗口','人员检查顺序':order,'人员配置来源':'qa/hp04-fixture.mjs 合成断言，非现场值','人员配置版本':'MOCK-hp04-r1'}));
 return d;
}
