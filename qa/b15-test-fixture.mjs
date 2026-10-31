import {seed,calculate} from '../server/planner.ts';
import {freezeRunInput} from '../server/run-input.mjs';
import {executionFixture} from './execution-fixture.mjs';
import {n06Fixture} from './n06-fixture.mjs';
import {r4Scenario} from './r4-fixture.mjs';
import {materialFixture} from './material-fixture.mjs';
import {deliveryParameters} from '../src/lib/delivery-policy.mjs';
import {claim,enableJoint} from './joint-fixture.mjs';
export const at='2026-10-31T00:00:00Z';
export function run(data,id='mock',selection={}){
 const frozen=freezeRunInput(data,selection,at);
 return {data,frozen,plan:{...calculate(frozen.executionData,0,at,frozen.conditions),conditions:frozen.conditions,id,runId:id,snapshotHash:frozen.snapshotHash}};
}
// Explicit replaceable normalized software mock; original CSV is retained separately.
export function uat15(){
 const d=n06Fixture(),e=executionFixture(seed,'已完成');
 d.routes=e.routes;d.times=e.times;d.machines=e.machines;
 d.dependencies.push(...d.orders.map(o=>({...e.dependencies.find(r=>r['工序编号']==='FILL'&&r['资源类型']==='设备'),'订单编号':o['订单编号']})));
 const seen=new Set();d.dependencies=d.dependencies.filter(r=>{if(r['资源类型']!=='人员技能')return true;if(seen.has(r['订单编号']))return false;seen.add(r['订单编号']);return true;});
 d.personnelGroups.forEach(g=>{g['可用起始分钟']='0';g['可用结束分钟']='480';});
 d.products[0]['总收率']='1';d.bom=e.bom;d.inventory=e.inventory;d.inventory[0]['账面数量']='300';d.inventory[0]['已占用数量']='0';
 Object.assign(d.rules.find(r=>r['规则编号']==='MATERIAL'),e.rules.find(r=>r['规则编号']==='MATERIAL'));
 d.executionFacts=[{...e.executionFacts[0],'观测分钟':'60'}, {...e.executionFacts[0],'事实编号':'F-A-FILL','工序编号':'FILL','开始分钟':'30','完成分钟':'60','观测分钟':'60','当前设备':'FILL01'}];
 d.executionMaterials=e.executionMaterials;
 d.personnelGroups.forEach(g=>{g['人员数量']='1';g['人员组名称']='综合操作组显式mock';});d.personnelPools[0]['总人数']='1';
 d.supplies=[{'供给编号':'B-11','物料编号':'LEAN','批次编号':'B-FUTURE','预计数量':'100','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];
 d.supplyUses=[{'引用编号':'B-USE','订单编号':'B','工序编号':'MIX','供给编号':'B-11','使用数量':'100'}];
 d.inventory[0]['账面数量']='100';
 const params=JSON.parse(d.rules.find(r=>r['规则编号']==='MATERIAL')['参数JSON']);params['允许预计供给']=true;d.rules.find(r=>r['规则编号']==='MATERIAL')['参数JSON']=JSON.stringify(params);
 const doc=JSON.parse(d.originalResourceEvents[0]['原账JSON']);doc.observedAt=60;
 doc.facts=d.executionFacts.map((f,i)=>({factId:f['事实编号'],snapshot:structuredClone(f),source:'s1',tasks:[{...doc.facts[0].tasks[0],id:i?'TASK-A-FILL':'TASK-A',executionRecord:i?'RECORD-FILL':'RECORD-A'}]}));
 doc.adoption.push(...doc.adoption.map(a=>({...a,taskId:'TASK-A-FILL'})));
 doc.occupancies.forEach(o=>{o.end=60;o.members=['TASK-A','TASK-A-FILL'];o.resourceBatchId='MOCK:HISTORICAL-SHARED';o.sharedSource='s1';});
 d.originalResourceEvents[0]['原账JSON']=JSON.stringify(doc);
 return d;
}
export function uat17(){
 const d=r4Scenario('12');d.downtime=[];d.orders[0]['要求可交付分钟']='90';d.products[0]['模拟交付等待分钟']='60';
 Object.assign(d.rules.find(r=>r['规则编号']==='DELIVERY'),{'是否启用':'是','参数JSON':JSON.stringify(deliveryParameters)});
 d.deliveryConditions=[{'订单编号':'A','模拟质量状态':'模拟合格','模拟质量可用时间':'','模拟有效期截止时间':'不适用','要求剩余有效分钟':'0'}];return d;
}
export function uat18(changed=false){
 const d=materialFixture(seed);d.orders[0]['合格需求']='240';
 d.factoryLines=[{'工厂编号':'F01','工厂名称':'B15显式模拟工厂','产线编号':'L01','产线名称':'B15显式模拟产线','时区':'Asia/Shanghai'}];
 d.bom=d.bom.filter(b=>b['用量类型']==='BOM物料');
 if(changed){d.bom.find(b=>b['物料编号']==='LEAN')['配置用量']='700';d.bom.find(b=>b['物料编号']==='FAT')['配置用量']='100';d.times.find(t=>t['工序编号']==='MIX')['固定分钟']='40';}
 d.calendars=d.calendars.filter(c=>c['日历编号']==='FC01');d.calendars[0]['起始分钟']=changed?'60':'0';d.calendars[0]['结束分钟']='480';
 d.tools=[{'工装编码':changed?'G60':'G01','工装名称':'显式模拟灌装工装','适用任务':'FILL','可用数量':'1','每任务需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','是否启用':'是','说明':'可替换MOCK','可用起始分钟':changed?'130':'0','可用结束分钟':'480'}];
 d.resourceClaims=[claim('FILL-TOOL','A','FILL',changed?'G60':'G01')];
 enableJoint(d,'MOLD');
 return d;
}
