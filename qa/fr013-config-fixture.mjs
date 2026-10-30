import {defs} from '../server/planner.ts';import {twoTasks} from './p10-explicit-fixture.mjs';import {policyFixture} from './dec0203-fixture.mjs';
export const canonical=(key,row)=>Object.fromEntries(defs.find(d=>d.key===key).fields.map(k=>[k,row[k]||'']));
export function mapping(key,s,t,n=1){const tool=key==='originalTools';return canonical('resourceMappings',{'配置编号':'CFG-'+(tool?s['资源编号']:s['人员组编号']),'配置版本':String(n),'合同版本':'FR013-resource-map-v1','状态':'READY','来源类别':key,'来源编号':s[tool?'资源编号':'人员组编号'],'源记录JSON':JSON.stringify(s),'运行编号':t[tool?'工装编码':'人员组编号'],'运行记录JSON':JSON.stringify(t),'别名':'显式合成别名','映射模式':'DIRECT_IDENTITY','源类型':tool?s['资源类型']:'人员技能','共享范围原文':s['共享范围'],'适用产线':'L01','范围模式':'全局唯一池','容量单位':tool?'套':'人','时间单位':'分钟','释放策略':'半开端点释放','配置依据':'v0.3+生效CR：合成测试选择，非现场默认'});}
export function configFixture(kind='personnel'){
 const d=kind==='tool'?policyFixture('tool'):twoTasks();d.factoryLines=[{'工厂编号':'F01','工厂名称':'合成工厂','产线编号':'L01','产线名称':'合成产线','时区':'Asia/Shanghai'}];for(const def of defs)d[def.key]=(d[def.key]||[]).map(row=>canonical(def.key,row));
 d.originalTools=[];d.originalPersonnel=[];d.resourceMappings=[];
 if(kind==='tool'){
  const t=d.tools[0],s={'资源编号':'原件-T','资源名称':'带引号"\n同名工具','资源类型':'工具','可用数量':t['可用数量'],'最早可用分钟':t['可用起始分钟'],'最晚可用分钟':t['可用结束分钟'],'共享范围':'全工厂'};
  d.originalTools=[s];d.resourceMappings=[mapping('originalTools',s,t)];
 }else for(const [i,t] of d.personnelGroups.entries()){
  const s={'人员组编号':'原件-G'+i,'技能':t['技能'],'可用人数':t['人员数量'],'起始分钟':t['可用起始分钟'],'结束分钟':t['可用结束分钟'],'共享范围':'全工厂'};
  d.originalPersonnel.push(s);d.resourceMappings.push(mapping('originalPersonnel',s,t));
 }
 return d;
}
export function csvFiles(tables){return Object.entries(tables).map(([key,rows])=>{const def=defs.find(d=>d.key===key);return {name:def.file,text:[def.fields,...rows.map(r=>def.fields.map(f=>r[f]||''))].map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n')};});}
