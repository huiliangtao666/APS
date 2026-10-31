// QA-only explicit, replaceable source-derived simulation. No customer defaults.
import fs from 'node:fs';import path from 'node:path';
import {b2Scenario,canon} from './b2-fixture.mjs';import {configuredOriginalBatch,literalRows} from './b231-fixture.mjs';import {runtimeDependencyFile} from '../src/lib/original-dependencies.mjs';import {csvFiles,mapping} from './fr013-config-fixture.mjs';
export const origin='2026-11-02T08:00:00+08:00', version='MOCK-UAT05-independent-r1';
export const atMinute=m=>new Date(Date.parse(origin)+Number(m)*60000).toISOString().replace('.000Z','Z');
export function uat05(){
 const root=path.join(process.env.B2_INPUTS,'UAT-05');const read=n=>literalRows(fs.readFileSync(path.join(root,fs.readdirSync(root).find(f=>f.startsWith(n+'_'))),'utf8'));
 const d=b2Scenario('05').data;
 d.dependencies.push(...read('12').filter(r=>r['资源类型']==='物料').map(r=>canon('dependencies',{...r,'需求数量':'0'})));
 d.bom=read('09').map(r=>canon('bom',{'版本编号':version,'产品编号':r['产品编号'],'生效日期':'2026-11-02','投料工序编号':r['投料工序'],'用量类型':'BOM物料','物料编号':r['物料编号'],'配置用量':r['定额'],'用量单位':'kg','用量基准':r['计量基准'],'损坏比例':r['损坏比例'],'收率/损耗口径备注':''}));
 d.inventory=read('13').map(r=>canon('inventory',{'批次编号':r['批次编号'],'物料编号':r['物料编号'],'账面数量':r['库存kg或个'],'已占用数量':r['已占用kg或个'],'有效期':'2026-11-03','位置':'UAT05显式模拟库位','质量状态':r['质量状态'],'预计可用时间':atMinute(r['最早可用分钟'])}));
 d.supplies=read('14').map(r=>canon('supplies',{'供给编号':'MOCK-'+r['批次编号'],'物料编号':r['物料编号'],'批次编号':r['批次编号'],'预计数量':r['到料kg或个'],'预计到达时间':atMinute(r['到达分钟']),'预计可用时间':atMinute(r['最早可用分钟']),'质量状态':r['质量状态'],'有效期':'2026-11-03'}));
 d.supplyUses=[canon('supplyUses',{'引用编号':'MOCK-UAT05-B-LEAN','订单编号':'B','工序编号':'MIX','供给编号':'MOCK-RCPT-LEAN','使用数量':'162.5'})];d.supplyDelays=[];d.executionMaterials=[];
 for(const rule of d.rules){const raw=read('16').find(r=>r['规则编号']===rule['规则编号']);rule['是否启用']=raw?.['是否启用']||'否';if(rule['规则编号']==='MATERIAL')rule['参数JSON']=raw['参数JSON'];}
 const batch=configuredOriginalBatch('05');batch.files.push(...csvFiles({bom:d.bom}));
 // Keep raw19 in source-only import; runnable replacement requires explicit separate opt-in.
 const tables={...batch.tables,originalTools:read('05').filter(r=>batch.tables.resourceMappings.some(m=>m['来源类别']==='originalTools'&&m['来源编号']===r['资源编号'])),originalPersonnel:read('06').filter(r=>batch.tables.resourceMappings.some(m=>m['来源类别']==='originalPersonnel'&&m['来源编号']===r['人员组编号'])),supplyUses:d.supplyUses,bom:d.bom,inventory:d.inventory,supplies:d.supplies,dependencies:d.dependencies,originalDependencies:[],originalInventory:[],originalSupply:[]};
 const choices={version,customerDefaults:false,origin,source:'raw UAT05 CSVs09/12/13/14/16/17',material:'Runtime material dependency numeric placeholder0 is explicit and ignored for BOM demand (source says 由BOM计算); B explicit supply reference162.5 selected; rates, yields, quality states and quantities copied literally; no BAG demand because original09 contains none',supplement:'Simulation source05/06 selects only task-referenced G01/T01/LP01; unused G60/LP-GENERAL excluded explicitly (raw retained); BOM version/effective date and kg unit explicitly selected; inventory expiry1440 mapped to next-day date; explicit location and expected-supply identity; no inferred customer values',resource:batch.provenance,originalSources:'All19 previewed first; active MATERIAL with original12 material semantics is rejected atomically. Separate explicit simulation replaces active raw12/13/14 with empty source tables plus separately named runtime dependencies/inventory/supplies/BOM. All external raw bytes and rejected preview/source provenance retained. This is QA substitution, not product runtime mapping.'};
 const replacements=csvFiles(tables).map(f=>f.name==='12_工序资源与物料依赖.csv'?{...f,name:runtimeDependencyFile}:f);
 return {data:d,rawFiles:batch.files.slice(0,19),sourceBatch:batch,simulationFiles:[...batch.files.filter(f=>!['12_工序资源与物料依赖.csv','13_物料库存批次.csv','14_预计到料与可用时间.csv',...replacements.map(f=>f.name)].includes(f.name)),...replacements],choices};
}
export const select=d=>({orderIds:['A','B'],startMinute:0,endMinute:600,priority:'规则设置',enabledRuleIds:d.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']),mode:'supported'});
