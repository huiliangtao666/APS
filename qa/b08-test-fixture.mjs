import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {b2Scenario} from './b2-fixture.mjs';import {literalRows,configuredOriginalBatch} from './b231-fixture.mjs';
export const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export const selection=d=>({orderIds:d.orders.map(o=>o['订单编号']),startMinute:0,endMinute:600,priority:'规则设置',enabledRuleIds:d.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']),mode:'supported'});
export function fixture(){
 const root=path.join(process.env.B2_INPUTS,'UAT-08'),read=n=>literalRows(fs.readFileSync(path.join(root,fs.readdirSync(root).find(f=>f.startsWith(n+'_'))),'utf8'));
 const x=b2Scenario('08'),d=x.data,rawRules=read('16');
 d.rules.forEach(r=>r['是否启用']=rawRules.find(s=>s['规则编号']===r['规则编号'])?.['是否启用']||'否');
 const batch=configuredOriginalBatch('08');
 return {data:d,raw:{people:read('06'),dependencies:read('12'),times:read('11'),machines:read('03'),calendars:read('02'),tools:read('05'),orders:read('17'),rules:rawRules},batch,provenance:{...x.provenance,source:'controlled B2 originals; retrieved via authorized APS-Test Files API, per-file hashes in delivery',mock:'Explicit replaceable QA整窗/group name/pool policy/post/full phase/offset0/release yes, not customer defaults',rawRuleIds:rawRules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号'])}};
}
export function hpolicy(order){return {'人员占用基准':'参与窗口','人员检查顺序':order,'提前占用分钟':'5','后延占用分钟':'10','人员配置来源':'qa/b08-test-fixture.mjs explicit replaceable simulation','人员配置版本':'B08-MOCK-r1'};}
export function sourceView(result,x){
 const input=structuredClone(result.input.originalInput||x.data);
 input.originalPersonnel=x.raw.people;input.originalTools=x.raw.tools;input.resourceMappings=x.batch.tables.resourceMappings;input.originalDependencies=x.raw.dependencies;
 return {plan:result.plan,run:result.run,snapshot:{originalInput:input},reservations:result.plan.resourceReservations,findings:result.plan.findings};
}
export function executionMock(){
 const d=fixture().data;
 d.executionFacts=[{'事实编号':'B08-FACT-A','订单编号':'A','工序编号':'MIX','状态':'已完成','开始分钟':'0','完成分钟':'30','观测分钟':'30','工序完成数量':'240','数量单位':'kg','剩余工时分钟':'0','当前设备':'MIX01','暂停原因':'','累计报废数量':'0','报废补做口径':''}];
 const src={id:'B08-source',kind:'明确模拟',domain:'B08-UAT08-N06-MOCK',version:'r1',record:'A-MIX-acquire-release',location:'repo:qa/b08-test-fixture.mjs#executionMock',providerRole:'资源负责人（模拟）',provider:'B08-MOCK-provider',reviewer:'B08-MOCK-reviewer',occurredAt:'2026-11-02T08:40:00+08:00',sha256:createHash('sha256').update(fs.readFileSync(new URL('./b08-test-fixture.mjs',import.meta.url))).digest('hex')};
 const doc={contract:'N06-finite-v1',status:'已核对',reason:'B08 explicit replaceable historical release40; current task completion30 does not release people/tools',eventSource:src.id,timeOrigin:'2026-11-02T08:00:00+08:00',observedAt:40,scope:'UAT08 mock A-MIX only executed, all resource adoption explicit',responsible:'B08-MOCK-provider',ruleVersion:'B08-historical-r1',historicalRules:{personnel:{quantity:'2',skill:'综合操作',releaseMinute:40},tool:{quantity:'1',releaseMinute:40}},ruleSource:src.id,sources:[src],facts:[{factId:'B08-FACT-A',snapshot:structuredClone(d.executionFacts[0]),source:src.id,tasks:[{id:'B08-OLD-A-MIX',batchId:'B08-BATCH-A',batchVersion:'r1',executionRecord:'B08-RECORD-A',member:'A',unit:'kg',quantity:'240',source:src.id}]}],identities:[{type:'人员',physicalId:'B08-PHYS-P',historicalId:'B08-OLD-P',historicalVersion:'r1',currentId:'POOL-LP01',unit:'人',source:src.id},{type:'工装',physicalId:'B08-PHYS-T',historicalId:'B08-OLD-T',historicalVersion:'r1',currentId:'T01',unit:'套',source:src.id}],adoption:[{taskId:'B08-OLD-A-MIX',type:'人员',state:'采用',occupancyIds:['B08-OCC-P'],source:src.id},{taskId:'B08-OLD-A-MIX',type:'工装',state:'采用',occupancyIds:['B08-OCC-T'],source:src.id},{taskId:'B08-OLD-A-MIX',type:'空间',state:'未采用',occupancyIds:[],source:src.id}],occupancies:[{id:'B08-OCC-P',physicalId:'B08-PHYS-P',quantity:'2',unit:'人',start:0,end:40,acquireSource:src.id,releaseSource:src.id,members:['B08-OLD-A-MIX'],people:{groupId:'B08-OLD-LP01',groupVersion:'r1',currentGroupId:'LP01',postId:'B08-OLD-POST',requiredSkill:'综合操作',providedSkill:'综合操作',skills:['综合操作'],shift:'QA整窗',shiftStart:0,shiftEnd:600,mappingVersion:'r1',source:src.id}},{id:'B08-OCC-T',physicalId:'B08-PHYS-T',quantity:'1',unit:'套',start:0,end:40,acquireSource:src.id,releaseSource:src.id,members:['B08-OLD-A-MIX']}]};
 d.originalResourceEvents=[{'事件编号':'B08-E1','原账编号':'MOCK:B08-A-MIX','前事件编号':'','事件类型':'登记','原账JSON':JSON.stringify(doc)}];return d;
}
