// Source-only sample generator. Run in an authorized isolated app runtime.
// Does not contact an API, start a server or overwrite a live dataset.
import fs from 'node:fs';import path from 'node:path';
import {applicationFixture} from './b16-application-fixture.mjs';
import {defs} from '../server/planner.ts';
const out=process.argv[2];if(!out)throw Error('Usage: node --experimental-strip-types qa/b16-application-sample.mjs <empty-output-directory>');
if(fs.existsSync(out)&&fs.readdirSync(out).length)throw Error('Output must be an empty directory');
fs.mkdirSync(out,{recursive:true});const f=applicationFixture();
for(const d of defs){const csv=[d.fields,...(f.data[d.key]||[]).map(r=>d.fields.map(k=>r[k]||''))].map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n');fs.writeFileSync(path.join(out,d.file),csv);}
fs.writeFileSync(path.join(out,'selection.json'),JSON.stringify(f.selection,null,2));
fs.writeFileSync(path.join(out,'README.txt'),'明确可替换MOCK，非客户现场默认；B16小样例，非原19CSV字节副本。\n在独立实例数据与CSV批导全部CSV；排程工作台选择MOCK16；计算并按任务产线筛选、保存、独立复核和导出。\n参考A MIX0–30/FILL30–60，B MIX90–120/FILL120–150。LEAN初始162.5+09:30条件到料162.5=325kg，两单各162.5；不实施全局预占。\n');
console.log(JSON.stringify({directory:out,files:defs.length+2,selection:f.selection}));
