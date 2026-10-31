import fs from 'node:fs';import path from 'node:path';
import {parseInputCsvRecords} from '../src/lib/input-csv.mjs';
import {b2Scenario,canon} from './b2-fixture.mjs';
import {mapping,csvFiles} from './fr013-config-fixture.mjs';
import {stageInput} from './issue6-stage-input.mjs';
import {runtimeDependencyFile} from '../src/lib/original-dependencies.mjs';
export const literalRows=text=>{const records=parseInputCsvRecords(text).filter(r=>r.cells.some(c=>c.trim()));return records.slice(1).map(r=>Object.fromEntries(records[0].cells.map((f,i)=>[f,r.cells[i]??''])));};
export function originalBatch(id,all=false){const root=path.join(process.env.B2_INPUTS,'UAT-'+id),stage=stageInput(root);return {...stage,files:all?fs.readdirSync(root).filter(n=>/^\d\d_/.test(n)&&!n.startsWith('00_')).sort().map(name=>({name,text:fs.readFileSync(path.join(root,name),'utf8')})):stage.files};}
// Explicit simulation configurations exercise the existing approved contracts.
// They are supplementary files, never customer defaults or edited originals.
export function configuredOriginalBatch(id){
 const batch=originalBatch(id,true),find=n=>batch.files.find(f=>f.name.startsWith(n+'_'));
 const d=b2Scenario(id).data,raw=literalRows(find('12').text),tools=literalRows(find('05').text),people=literalRows(find('06').text);
 const resourceMappings=[];
 for(const s of tools.filter(s=>raw.some(r=>['模具','工具'].includes(r['资源类型'])&&r['资源编号']===s['资源编号'])))resourceMappings.push(mapping('originalTools',s,d.tools.find(t=>t['工装编码']===s['资源编号'])));
 if(d.rules.some(r=>r['规则编号']==='LABOR'&&r['是否启用']==='是'))for(const s of people.filter(s=>raw.some(r=>r['资源类型']==='人员'&&r['资源编号']===s['人员组编号'])))resourceMappings.push(mapping('originalPersonnel',s,d.personnelGroups.find(t=>t['人员组编号']===s['人员组编号'])));
 const tables={tools:d.tools,resourceClaims:d.resourceClaims,personnelPools:d.personnelPools,personnelGroups:d.personnelGroups,dependencies:d.dependencies,resourceMappings};
 const supplements=csvFiles(tables).map(f=>f.name.startsWith('12_')?{...f,name:runtimeDependencyFile}:f);
 return {...batch,resourceRuleBinding:{contract:'CR-DEC02-03-v1',reference:'显式软件测试采用已批准CR的固定资源参数契约；原16 MOLD {}留存'},supplements,tables,files:[...batch.files,...supplements],provenance:{purpose:'explicit engineering simulation; not customer fact or approval of missing business choices',toolFields:'capacity/window/name/id from literal original05; claim quantity/early/late from original12',choices:['原17补录否/正式订单/有效：显式软件测试配置','工装适用MIX|FILL及每任务1/偏移0：既有B2模拟配置；表23逐项声明优先','表23套/显式逐生产批完整区间：既有批准合同的显式测试配置','人员QA整窗班次、完整参与/偏移0/释放是及独立物理池：显式测试配置，未称原件事实'],resourceMappings}};
}
