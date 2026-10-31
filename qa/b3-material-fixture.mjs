// Deterministic synthetic software fixtures, never customer facts or application defaults.
// Baseline UAT05/09/10/11 + AC08/09/10/11; seed B3-v1, no randomness.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
import {seed,defs} from '../server/planner.ts';import {materialFixture} from './material-fixture.mjs';import {claim,enableJoint} from './joint-fixture.mjs';
export const fixtureVersion='B3-v1';export const at='2026-10-31T00:00:00Z';
export function materialScenario(scene='UAT-09'){
 const d=materialFixture(seed);d.factoryLines=[{'工厂编号':'F01','工厂名称':'B3模拟工厂','产线编号':'L01','产线名称':'B3模拟单产线','时区':'Asia/Shanghai','说明':'B3-v1 显式软件模拟，非客户事实'}];d.orders[0]['合格需求']='240';
 if(scene==='UAT-05'){
  d.orders.push({...seed.orders[1]});d.dependencies=structuredClone(seed.dependencies);
  d.bom.push(...d.bom.map(r=>({...r,'产品编号':'HC60'})));
 }
 // Explicit simulated tooling/personnel from the existing DEC02-03 contract.
 // Simple legal windows only; full UAT05 resource scenario awaits B2 integration.
 d.tools=[{'工装编码':'B3-TOOL','工装名称':'B3模拟工装','适用任务':'MIX|FILL','可用数量':'2','每任务需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','是否启用':'是','说明':'B3-v1 显式软件模拟，非客户默认','可用起始分钟':'0','可用结束分钟':'600'}];
 d.personnelGroups=[{'人员组编号':'B3-STAFF','人员组名称':'B3模拟技能组','人员数量':'2','技能':'MIX','班次':'D','可用起始分钟':'0','可用结束分钟':'600','poolId':''}];
 for(const o of d.orders){d.dependencies.push({'订单编号':o['订单编号'],'工序编号':'MIX','资源类型':'模具','资源编号':'B3-TOOL','需求数量':'1','提前占用分钟':'0','后延占用分钟':'0'});d.dependencies.push({'订单编号':o['订单编号'],'工序编号':'MIX','资源类型':'人员技能','资源编号':'B3-STAFF','需求数量':'1','所需技能':'MIX','所需班次':'D','人员岗位编号':'MIX-POST','人员参与阶段':'全程','人员开始偏移':'0','人员结束偏移':'0','窗口外释放':'是','提前占用分钟':'0','后延占用分钟':'0'});d.resourceClaims.push(claim('B3-CLAIM-'+o['订单编号'],o['订单编号'],'MIX','B3-TOOL'));}
 enableJoint(d,'MOLD');Object.assign(d.rules.find(r=>r['规则编号']==='LABOR'),{'是否启用':'是','参数JSON':'{}'});
 const base=d.inventory[0];d.inventory=d.inventory.filter(r=>r['物料编号']!=='LEAN');
 d.inventory.push({...base,'批次编号':'B3-EARLY','账面数量':'137.5','已占用数量':'37.5','有效期':'2026-11-03'}, {...base,'批次编号':'B3-LATE','账面数量':scene==='UAT-10'?'62.4':'62.5','已占用数量':'0','有效期':'2026-12-31'}, {...base,'批次编号':'B3-FROZEN','账面数量':'999','质量状态':'冻结'}, {...base,'批次编号':'B3-EXPIRED','账面数量':'999','有效期':'2026-11-01'}, {...base,'批次编号':'B3-PENDING','账面数量':'999','质量状态':'待检'}, {...base,'批次编号':'B3-REJECTED','账面数量':'999','质量状态':'不合格'});
 if(scene==='UAT-05'){
  d.supplies=[{'供给编号':'B3-SUPPLY','物料编号':'LEAN','批次编号':'B3-EXPECTED','预计数量':'162.5','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];
  d.supplyUses=[{'引用编号':'B3-USE','订单编号':'B','工序编号':'MIX','供给编号':'B3-SUPPLY','使用数量':'162.5'}];
  const rule=d.rules.find(r=>r['规则编号']==='MATERIAL');rule['参数JSON']=JSON.stringify({...JSON.parse(rule['参数JSON']),'允许预计供给':true});
 }
 if(scene==='UAT-11'){
  d.calendars[0]['结束分钟']='0';d.times=d.times.filter(r=>!(r['产品编号']==='HC40'&&r['工序编号']==='MIX'));
  d.dependencies.find(r=>r['资源类型']==='模具')['资源编号']='B3-NONEXISTENT';d.bom[0]['配置用量']='649.9';
 }
 return d;
}
const csv=rows=>rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
export function scenarioFiles(data){return defs.map(d=>({name:d.file,text:csv([d.fields,...(data[d.key]||[]).map(r=>d.fields.map(f=>r[f]||''))])}));}
export function writeFixtures(out){
 fs.mkdirSync(out,{recursive:true});const manifest={kind:'synthetic-software-fixtures',seed:fixtureVersion,baselineSha256:'e30733655359e71b0c98220910303aefbc922ac123b96fb3025c4976a4067e36',customerFacts:false,source:'APS-BL-001 v0.3 UAT05/09/10/11 and AC08/09/10/11; existing normalized runtime schema; explicit simple DEC02-03 resources',materialFormula:'240 / 0.96 * 650 / 1000 = 162.5 kg; 137.5 - 37.5 = 100; 100 + 62.5 = 162.5; 100 + 62.4 = 162.4; gap = 0.1',resources:'2 tool sets / 2 staff; [0,600); explicit software inputs, no new app parameter semantics',scenarios:{}};
 for(const scene of ['UAT-05','UAT-09','UAT-10','UAT-11']){const dir=path.join(out,scene);fs.mkdirSync(dir,{recursive:true});const data=materialScenario(scene),files=scenarioFiles(data);fs.writeFileSync(path.join(dir,'data.json'),JSON.stringify(data,null,2));manifest.scenarios[scene]={files:{}};for(const f of files){fs.writeFileSync(path.join(dir,f.name),f.text);manifest.scenarios[scene].files[f.name]=crypto.createHash('sha256').update(f.text).digest('hex');}}
 fs.writeFileSync(path.join(out,'PROVENANCE.json'),JSON.stringify(manifest,null,2));return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)writeFixtures(process.argv[2]);
