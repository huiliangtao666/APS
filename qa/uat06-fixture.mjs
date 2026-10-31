// Independent UAT06 task fixture. Every supplemental choice is replaceable simulation.
import fs from 'node:fs';import path from 'node:path';
import {b2Scenario,canon} from './b2-fixture.mjs';
import {configuredOriginalBatch,literalRows} from './b231-fixture.mjs';
import {csvFiles} from './fr013-config-fixture.mjs';
import {runtimeDependencyFile} from '../src/lib/original-dependencies.mjs';
export function uat06(){
 const root=path.join(process.env.B2_INPUTS,'UAT-06'),read=n=>literalRows(fs.readFileSync(path.join(root,fs.readdirSync(root).find(f=>f.startsWith(n+'_'))),'utf8'));
 const d=b2Scenario('06').data,rawRules=read('16');
 for(const r of d.rules)r['是否启用']=rawRules.find(x=>x['规则编号']===r['规则编号'])?.['是否启用']||'否';
 const batch=configuredOriginalBatch('06');
 // Keep every original05 row, including unused G60. Explicitly mark it unmapped;
 // runnable simulation selects only the two task-referenced identities.
 const used=new Set(d.resourceClaims.map(c=>c['资源编号']));d.tools=d.tools.filter(t=>used.has(t['工装编码']));
 const tables={...batch.tables,tools:d.tools,originalTools:read('05').filter(r=>used.has(r['资源编号']))};
 const replacements=csvFiles(tables).map(f=>f.name.startsWith('12_')?{...f,name:runtimeDependencyFile}:f);const files=[...batch.files.filter(f=>!replacements.some(r=>r.name===f.name)),...replacements];
 return {data:d,rawFiles:batch.files.slice(0,19),files,repairs:batch.repairs,resourceRuleBinding:batch.resourceRuleBinding,choices:{customerDefaults:false,source:'UAT06 original19 from controlled B234 archive; no previous verdict transferred',target:'G01: three FILL demands of1, physical capacity2; T01: three MIX demands of1, literal capacity3',ambiguity:'Baseline prose three-demand/two-set scenario versus illustrative MIX trio; raw05/12 distinguish G01 FILL2 from T01 MIX3. Do not use reference order as PASS oracle. Additional T01=2 is explicit replaceable test configuration, never a source correction.',enabled:rawRules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']),supplement:batch.provenance,selection:'Raw19 retained; runnable simulation uses selected referenced G01/T01; unused G60 raw remains external evidence; no claim original19 is ready without explicit mappings/order repairs'}};
}
export const select=d=>({orderIds:['A','B','C'],startMinute:0,endMinute:600,priority:'规则设置',enabledRuleIds:d.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']),mode:'supported'});
