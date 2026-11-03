// Rebuild tiny synthetic OOXML fixtures inside disposable Node-only validation containers.
import fs from 'node:fs';import path from 'node:path';
import {parameterWorkbook,workbookTables} from '../server/parameter-workbook-export.mjs';
import {parameterCatalog} from '../server/parameter-contract.mjs';
import {workbookSchema} from '../server/workbook-model.mjs';
const root=path.resolve(process.argv[2]||'temp/parameter-check'),data=JSON.parse(fs.readFileSync(new URL('./parameter-fixture-data.json',import.meta.url)));
fs.mkdirSync(path.join(root,'supply'),{recursive:true});
fs.writeFileSync(path.join(root,'supply/small.xlsx'),workbookTables(Object.entries(data.tables).map(([table,values])=>{const fields=workbookSchema.tables[table].fields.map(f=>f.name);return [table,fields,values.map(row=>fields.map(f=>row[f]??''))];})));
fs.writeFileSync(path.join(root,'supply/mapping.json'),JSON.stringify(data.mapping));
const records=[['MOCK-P-INSPECT','检验天数','1','CP074'],['MOCK-P-LEAD','采购导期天数','3','CP073']].map(([id,field,value,cp])=>({'参数编号':id,'对象编号':'MOCK-SUP','对象名称':'模拟供货关系','参数名称':field,'参数值':value,'单位':'天','生效日':'0','失效日':'44',_cp:cp}));
const definitions=parameterCatalog.filter(c=>Number(c['参数编号'].slice(2))<=168),annotations={discussions:[{讨论编号:'MOCK-D14',内容:'未明新公式保留候选'}],questions:[{问题编号:'MOCK-Q03',内容:'约15天估算',复核:'最长13，保留14窗口'}]};
fs.writeFileSync(path.join(root,'parameters-small.xlsx'),parameterWorkbook(records,1,annotations,definitions));records[0]['参数值']='illegal';fs.writeFileSync(path.join(root,'parameters-invalid.xlsx'),parameterWorkbook(records,1,annotations,definitions));
console.log('Synthetic fixture prepared:',root);
