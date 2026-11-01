import fs from 'node:fs';
import path from 'node:path';
import {defs} from '../server/planner.ts';
import {inspectCsvBatch} from '../server/csv-batch.mjs';
import {residualProfile} from './b15-residual-fixture.mjs';
import {scenarioFiles} from './b3-material-fixture.mjs';
import {minuteInstant} from '../src/lib/minute-validity.mjs';
import {stageContract} from '../src/lib/stage-bindings.mjs';
import {PLAN_TIME_ORIGIN} from '../src/lib/expected-supply.mjs';
import {b15DevScenario} from './b15-dev-fixture.mjs';
const rootFor=id=>['15','18'].includes(id)?'/workspace/temp/main-b15/originals':'/workspace/temp/main-r7/regression-originals';
const canonical=(key,row)=>Object.fromEntries(defs.find(d=>d.key===key).fields.map(f=>[f,String(row[f]??'')]));
function mapping(category,source,target,params){return canonical('stageMappings',{'配置编号':'MOCK-'+category+'-'+(source['批次编号']||source['任务编号']||source['事件编号']),'配置版本':'1','合同版本':stageContract,'状态':'READY','来源类别':category,'来源编号':source['批次编号']||source['任务编号']||source['事件编号'],'源记录JSON':JSON.stringify(source),'运行编号':target,'参数JSON':JSON.stringify(params),'配置依据':'Issue39/40本次显式可替换工程模拟；原字节另存，不是客户权威配置','数据性质':'明确模拟'});}
const validity=(s,boundary='截止前')=>({'时效模式':'显式分钟','时间原点':PLAN_TIME_ORIGIN,'到达分钟':s['到达分钟'],'可用分钟':s['最早可用分钟'],'到期分钟':s['到期分钟'],'到期边界':boundary,'有效期':'','预计可用时间':minuteInstant(PLAN_TIME_ORIGIN,s['最早可用分钟'])});
export function losslessProfile(id,root=rootFor(id)){
 const profile=residualProfile(id,root),data=profile.data,parsed=inspectCsvBatch(profile.originals,defs,profile.repairs);
 for(const key of ['originalInventory','originalSupply','originalProgress','originalEvents'])data[key]=parsed.tables[key];
 data.stageMappings=[];
 data.inventory=data.originalInventory.map(s=>canonical('inventory',{'批次编号':s['批次编号'],'物料编号':s['物料编号'],'账面数量':s['库存kg或个'],'已占用数量':s['已占用kg或个'],'位置':'MOCK-SOURCE-LOCATION','质量状态':'合格',...validity(s)}));
 for(const s of data.originalInventory){const unit=data.materials.find(m=>m['物料编号']===s['物料编号'])['单位'];data.stageMappings.push(mapping('originalInventory',s,s['批次编号'],{unit,origin:PLAN_TIME_ORIGIN,location:'MOCK-SOURCE-LOCATION',quality:'合格',scope:'全工厂',expiryBoundary:'截止前'}));}
 if(id==='15'){
  // These are explicit replaceable facts, not deductions from the 250kg input.
  // Both operations have 240kg output; the original does NOT supply this value.
  data.executionFacts=['MIX','FILL'].map((op,i)=>canonical('executionFacts',{'事实编号':'MOCK-A-'+op,'订单编号':'A','工序编号':op,'状态':'已完成','开始分钟':i?'30':'0','完成分钟':i?'60':'30','观测分钟':'60','工序完成数量':'240','数量单位':'kg','剩余工时分钟':'0','当前设备':op+'01','累计报废数量':'0'}));
  const amounts={LEAN:'162.5',FAT:'37.5',WATER:'37.5',PREMIX:'12.5'};
  data.executionMaterials=Object.entries(amounts).map(([material,amount])=>canonical('executionMaterials',{'记录编号':'MOCK-C-'+material,'事实编号':'MOCK-A-MIX','批次编号':'LOT-'+material,'物料编号':material,'累计已用数量':amount,'单位':'kg'}));
  data.executionSources=data.originalProgress.map((s,i)=>canonical('executionSources',{'来源编号':'MOCK-S-'+s['任务编号'],'原始任务编号':s['任务编号'],'事实编号':data.executionFacts[i]['事实编号'],'原始汇总耗料':s['已用投入kg'],'耗料单位':'kg','来源说明':'明确可替换模拟，250kg逐批耗料及240kg工序产出分别显式提供；非真实客户事实','原始分配JSON':JSON.stringify(i?[]:data.executionMaterials.map(c=>({'记录编号':c['记录编号'],'批次编号':c['批次编号'],'物料编号':c['物料编号'],'数量':c['累计已用数量'],'单位':c['单位']})))}));
  for(const [i,s] of data.originalProgress.entries())data.stageMappings.push(mapping('originalProgress',s,data.executionFacts[i]['事实编号'],{fact:data.executionFacts[i],sourceId:data.executionSources[i]['来源编号']}));
  const s=data.originalSupply[0],uses=[canonical('supplyUses',{'引用编号':'MOCK-RCPT-B-MIX','订单编号':'B','工序编号':'MIX','供给编号':'MOCK-RCPT-LEAN','使用数量':'162.5'})];
  data.supplies=[canonical('supplies',{'供给编号':'MOCK-RCPT-LEAN','批次编号':s['批次编号'],'物料编号':s['物料编号'],'预计数量':s['到料kg或个'],'已占用数量':s['已占用kg或个'],'质量状态':'预计可用','预计到达时间':minuteInstant(PLAN_TIME_ORIGIN,s['到达分钟']),...validity(s)})];data.supplyUses=uses;
  const rule=data.rules.find(r=>r['规则编号']==='MATERIAL'),p=JSON.parse(rule['参数JSON']);p['允许预计供给']=true;rule['参数JSON']=JSON.stringify(p);
  data.stageMappings.push(mapping('originalSupply',s,'MOCK-RCPT-LEAN',{unit:'kg',origin:PLAN_TIME_ORIGIN,location:'MOCK-EXPECTED-NOT-RECEIVED',quality:'预计可用',scope:'全工厂',expiryBoundary:'截止前',uses}));
  const oldGroup=structuredClone(data.personnelGroups.find(g=>g['人员组编号']==='LP01')),oldPool=structuredClone(data.personnelPools.find(p=>p.poolId===oldGroup.poolId));
  oldGroup['人员数量']='1';oldPool['总人数']='1';
  data.personnelGroups.find(g=>g['人员组编号']==='LP01')['人员数量']='2';data.personnelPools.find(p=>p.poolId===oldPool.poolId)['总人数']='2';
  data.resourceMappings.filter(m=>m['来源类别']==='originalPersonnel').forEach(m=>{m['运行记录JSON']=JSON.stringify(data.personnelGroups.find(g=>g['人员组编号']===m['运行编号']));});
  const event=canonical('simulationEvents',{'事件编号':'MOCK-EV-PEOPLE','事件分钟':'60','保护截止分钟':'60','保护策略':'禁止未开始任务开工','事件类型':'人员数量变化','参数JSON':JSON.stringify({groupId:'LP01',poolId:oldPool.poolId,beforeCount:'1',afterCount:'2',scope:'事件起新运行'}),'原因':'原19 EV-PEOPLE显式映射，后续新运行人数增加，历史N06不变','需处理事实JSON':'[]'});
  data.simulationEvents=[event];data.stageMappings.push(mapping('originalEvents',data.originalEvents[0],event['事件编号'],{event,groupBefore:oldGroup,poolBefore:oldPool}));
  // Genesis MOCK ledger is supplied explicitly for this new fixture. Its two
  // frozen facts retain original 0–30 / 30–60 and historical one-person policy.
  const doc=JSON.parse(b15DevScenario('15').originalResourceEvents[0]['原账JSON']);
  doc.facts=doc.facts.map((f,i)=>({...f,factId:data.executionFacts[i]['事实编号'],snapshot:data.executionFacts[i],tasks:f.tasks.map(t=>({...t,quantity:'240'}))}));
  const ids={工装:data.tools[0]['工装编码'],空间:data.batchResources.find(r=>r['资源类型']==='共享冷却空间')?.['资源编号'],人员:oldPool.poolId};
  doc.identities.forEach(p=>p.currentId=ids[p.type]);doc.occupancies.forEach(o=>{if(o.people)o.people.currentGroupId='LP01';});
  data.originalResourceEvents=[canonical('originalResourceEvents',{'事件编号':'MOCK-GENESIS','原账编号':'MOCK:L-A','前事件编号':'','事件类型':'登记','原账JSON':JSON.stringify(doc)})];
 }
 for(const def of defs)data[def.key]=(data[def.key]||[]).map(r=>canonical(def.key,r));
 const selected=['05','06','09','12','13','14','17','18','19'],files=scenarioFiles(data).filter(f=>!['05_模具与工具配置.csv','06_人员技能与班次.csv','09_物料BOM配置.csv','12_原始工序资源与物料依赖.csv','13_物料库存批次.csv','14_预计到料与可用时间.csv','17_生产订单与交期.csv','18_模拟执行进度.csv','19_模拟异常与条件变更.csv'].includes(f.name));
 const dep=files.find(f=>f.name==='12_工序资源与物料依赖.csv');if(dep)dep.name='32_运行工序资源依赖.csv';
 for(const f of profile.originals.filter(f=>selected.some(n=>f.name.startsWith(n+'_'))))files.push(f);
 return {...profile,data,files,root,selection:{orderIds:data.orders.map(o=>o['订单编号']),startMinute:id==='15'?60:0,endMinute:600,priority:'规则设置',enabledRuleIds:data.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']),mode:'supported'},kind:'EXPLICIT_REPLACEABLE_SIMULATION_WITH_UNCHANGED_ORIGINAL_BYTES'};
}
