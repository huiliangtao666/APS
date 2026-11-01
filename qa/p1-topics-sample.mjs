import fs from 'node:fs';import path from 'node:path';import {defs} from '../server/planner.ts';import {topicFixture} from './p1-topics-fixture.mjs';
const output=process.argv[2];if(!output)throw Error('Specify output directory');fs.mkdirSync(output,{recursive:true});
const {data,selection}=topicFixture();
for(const d of defs){const csv=[d.fields,...(data[d.key]||[]).map(r=>d.fields.map(f=>r[f]||''))].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');fs.writeFileSync(path.join(output,d.file),'\ufeff'+csv);}
fs.writeFileSync(path.join(output,'PROFILE.json'),JSON.stringify({kind:'REPLACEABLE_MOCK_NOT_CUSTOMER_FACT',selection,tables:data},null,2));
fs.writeFileSync(path.join(output,'README.txt'),'1. 在隔离验证副本的数据与CSV页批量导入本目录CSV，预览后确认保存。\n2. 在排程工作台选择“独立模拟 MOCK:P1 / mock-v1”，保留24kg的独立预测并另开计算；正式订单A/B不计入。\n3. 查看冻结输入、保存方案、按任务查询或导出CSV。修改配置版本/来源后旧运行仍为原值；模拟不可提交为正式计划。\n未启用预测冲减/目标库存自动补库；新增分支返工、配方选择、新资源/权重未支持。未知公式不提供默认。\n');
