import fs from 'node:fs';
import path from 'node:path';
import {defs} from '../server/planner.ts';
import {inspectCsvBatch} from '../server/csv-batch.mjs';
import {b15DevScenario} from './b15-dev-fixture.mjs';
import {b12Scenario} from './b12-dev-fixture.mjs';
import {scenarioFiles} from './b3-material-fixture.mjs';
import {resourceMappingDef} from '../src/lib/resource-mapping.mjs';

// Existing explicit, replaceable profiles supply the missing runtime facts.
// The five original categories below are imported byte-for-byte and adopted;
// original09 stays literal. This is deliberately not a raw19 admission claim.
export function residualProfile(id,root='/fixtures/originals'){
 const directory=path.join(root,'UAT-'+id),originals=fs.readdirSync(directory).filter(n=>/^(0[1-9]|1[0-9])_.*\.csv$/.test(n)).map(name=>({name,text:fs.readFileSync(path.join(directory,name),'utf8')}));
 const data=b12Scenario(id,root);
 const repairs=[];const orderFile=originals.find(f=>f.name.startsWith('17_'));
 // Physical lines, including any blanks/BOM, come from the actual parser.
 const inspected=inspectCsvBatch(originals,defs);
 for(const record of inspected.sources.orders.records){
  const order=data.orders.find(o=>o['订单编号']===record.values['订单编号']);
  for(const field of ['是否允许拆分','需求类型','订单状态'])repairs.push({file:orderFile.name,row:record.line,field,value:order[field]});
 }
 const parsed=inspectCsvBatch(originals,defs,repairs);
 if(['15','18'].includes(id)){
  data.machines=parsed.tables.machines;
  data.bom=data.bom.filter(b=>b['用量类型']==='BOM物料');
  data.bom.push(...data.bom.filter(b=>b['产品编号']==='HC40').map(b=>({...b,'产品编号':'HC60'})));
  const enabled=new Set(parsed.tables.rules.filter(r=>r['是否启用']==='是').map(r=>r['规则编号']));
  data.rules.forEach(r=>r['是否启用']=enabled.has(r['规则编号'])?'是':'否');
 }

 for(const key of ['originalTools','originalPersonnel','originalDependencies','originalBom','orders'])data[key]=parsed.tables[key];
 const referenced=(key,id)=>data.originalDependencies.some(d=>d['资源编号']===id&&(key==='originalTools'?['模具','工具']:['人员']).includes(d['资源类型']));
 data.resourceMappings=[];
 for(const key of ['originalTools','originalPersonnel'])for(const source of data[key]){
  const tool=key==='originalTools',id=source[tool?'资源编号':'人员组编号'];if(!referenced(key,id))continue;
  const target=data[tool?'tools':'personnelGroups'].find(r=>r[tool?'工装编码':'人员组编号']===id);
  if(!target)throw Error('Missing explicitly configured target '+id);
  const record={'配置编号':'B15-RESIDUAL-'+key+'-'+id,'配置版本':'1','合同版本':'FR013-resource-map-v1','状态':'READY','来源类别':key,'来源编号':id,'源记录JSON':JSON.stringify(source),'运行编号':id,'运行记录JSON':JSON.stringify(target),'别名':'','映射模式':'DIRECT_IDENTITY','源类型':tool?source['资源类型']:'人员技能','共享范围原文':source['共享范围'],'适用产线':'L01','范围模式':'全局唯一池','容量单位':tool?'套':'人','时间单位':'分钟','释放策略':'半开端点释放','配置依据':'Issue39/40；原05/06/12逐值 + 已有显式可替换profile的班次/物理池/参与窗；非现场默认','字段权威JSON':''};
  data.resourceMappings.push(Object.fromEntries(resourceMappingDef.fields.map(f=>[f,record[f]??''])));
 }
 const selected=['05_模具与工具配置.csv','06_人员技能与班次.csv','09_物料BOM配置.csv','12_工序资源与物料依赖.csv','17_生产订单与交期.csv'];
 const files=scenarioFiles(data).filter(f=>(!selected.includes(f.name)||f.name==='12_工序资源与物料依赖.csv')&&f.name!=='12_原始工序资源与物料依赖.csv');
 // A separate 32 file supplies the explicit personnel/space runtime contract.
 const dep=files.find(f=>f.name==='12_工序资源与物料依赖.csv');if(dep)dep.name='32_运行工序资源依赖.csv';
 for(const file of originals.filter(f=>selected.includes(f.name)))files.push(file);
 return {data,files,repairs,originals,originalCategoriesAdopted:['05','06','12','17'],literalOnly:['09'],runtimeProfileIsExplicitMock:true};
}
