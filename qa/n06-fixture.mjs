import fs from 'node:fs';import {createHash} from 'node:crypto';
const mockSourceHash=createHash('sha256').update(fs.readFileSync(new URL('./n06-mock-source.txt',import.meta.url))).digest('hex');
import {p10Fixture} from './p10-core-fixture.mjs';
import {policyFixture} from './dec0203-fixture.mjs';
import {defs} from '../server/planner.ts';
export const source=(id='s1')=>({id,kind:'明确模拟',domain:'N06-MOCK',version:'r1',record:id,location:'repo:qa/n06-mock-source.txt#'+id,providerRole:'资源负责人（模拟）',provider:'MOCK-provider',reviewer:'MOCK-reviewer',occurredAt:'2026-11-02T08:40:00+08:00',sha256:mockSourceHash});
export function event(doc,id='e1',prior='',type='登记'){return {'事件编号':id,'原账编号':'L-A','前事件编号':prior,'事件类型':type,'原账JSON':JSON.stringify(doc)};}
export function n06Fixture({unknown=false}={}){
 const d=p10Fixture('2'),tool=policyFixture('tool');
 d.orders[0]['合格需求']='100';d.orders.push({...d.orders[0],'订单编号':'B'});
 d.factoryLines=[{'工厂编号':'F01','工厂名称':'MOCK工厂','产线编号':'L01','产线名称':'MOCK产线','时区':'Asia/Shanghai'}];
 d.dependencies.push(...d.dependencies.map(r=>({...r,'订单编号':'B'})));
 d.tools=tool.tools;d.tools[0]['提前占用分钟']='0';d.tools[0]['后延占用分钟']='0';
 d.resourceClaims=d.orders.map(o=>({...tool.resourceClaims[0],'声明编号':'C-'+o['订单编号'],'订单编号':o['订单编号']}));
 d.batchResources=[{'资源编号':'SPACE','资源类型':'共享冷却空间','允许程序':'','说明':'明确模拟，非客户事实','单位':'kg','容量':'1000'}];
 for(const id of ['MOLD','STORAGE']){const r=d.rules.find(r=>r['规则编号']===id);r['是否启用']=id==='MOLD'?'是':'否';if(id==='MOLD')r['参数JSON']=tool.rules.find(r=>r['规则编号']===id)['参数JSON'];}
 d.rules.find(r=>r['规则编号']==='MATERIAL')['是否启用']='否';
 d.executionFacts=[{'事实编号':'F-A','订单编号':'A','工序编号':'MIX','状态':'已完成','开始分钟':'0','完成分钟':'30','观测分钟':'30','工序完成数量':'100','数量单位':'kg','剩余工时分钟':'0','当前设备':'MIX01','暂停原因':'','累计报废数量':'0','报废补做口径':''}];
 for(const def of defs)d[def.key]=(d[def.key]||[]).map(r=>Object.fromEntries(def.fields.map(k=>[k,r[k]??''])));
 const doc={contract:'N06-finite-v1',status:'已核对',reason:'明确模拟领退原账，非客户数据',eventSource:'s1',timeOrigin:'2026-11-02T08:00:00+08:00',observedAt:40,scope:'模拟产线全部原执行任务A，全部资源采用集合',responsible:'MOCK-provider',ruleVersion:'historical-v1',historicalRules:{tool:{quantity:'1',before:0,after:10},personnel:{group:'old-A',pool:'old-P',skill:'A',shift:[0,60]}},ruleSource:'s1',sources:[source()],facts:[{factId:'F-A',snapshot:structuredClone(d.executionFacts[0]),source:'s1',tasks:[{id:'TASK-A',batchId:'BATCH-A',batchVersion:'v1',executionRecord:'RECORD-A',member:'A',unit:'kg',quantity:'100',source:'s1'}]}],identities:[{type:'工装',physicalId:'PHYS-T',historicalId:'OLD-T',historicalVersion:'v1',currentId:'G40',unit:'套',source:'s1'},{type:'空间',physicalId:'PHYS-S',historicalId:'OLD-S',historicalVersion:'v1',currentId:'SPACE',unit:'kg',source:'s1'},{type:'人员',physicalId:'PHYS-P',historicalId:'OLD-P',historicalVersion:'v1',currentId:'P',unit:'人',source:'s1'}],adoption:['工装','空间','人员'].map((type,i)=>({taskId:'TASK-A',type,state:'采用',occupancyIds:['occ'+i],source:'s1'})),occupancies:['工装','空间','人员'].map((type,i)=>({id:'occ'+i,physicalId:['PHYS-T','PHYS-S','PHYS-P'][i],quantity:i===1?'600':'1',unit:i===0?'套':i===1?'kg':'人',start:0,end:unknown&&i===0?null:40,acquireSource:'s1',...(unknown&&i===0?{}:{releaseSource:'s1'}),members:['TASK-A'],...(i===2?{people:{groupId:'old-A',groupVersion:'v1',currentGroupId:'A',postId:'historical-post',requiredSkill:'A',providedSkill:'A',skills:['A'],shift:'S',shiftStart:0,shiftEnd:60,mappingVersion:'v1',source:'s1'}}:{})}))};
 d.originalResourceEvents=[event(doc)];return d;
}
export const selection={orderIds:['B'],startMinute:40,endMinute:200};
export const decision=r=>({revision:r.revision,workflowRevision:r.workflowRevision,reviewHash:r.reviewHash,submissionId:r.submissionId,unplannedIds:r.unplanned.map(t=>t.id),acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true});
