// Explicit replaceable software profile. Originals stay separate and unchanged.
// This is not an original19 production adapter or approved customer configuration.
import {r4Scenario} from './r4-fixture.mjs';
import {b2Scenario,canon} from './b2-fixture.mjs';
import {claim,enableJoint} from './joint-fixture.mjs';
import {deliveryParameters} from '../src/lib/delivery-policy.mjs';
import {scenarioFiles} from './b3-material-fixture.mjs';
import fs from 'node:fs';import path from 'node:path';
export function b12Scenario(id,root){
 const d=r4Scenario(id);if(!root)return d;
 const resources=b2Scenario(id,root).data;
 const raw=JSON.parse(fs.readFileSync(path.join(root,'UAT-'+id,'场景完整输入与参考结果.json')));
 const table=n=>Object.entries(raw.tables).find(([k])=>k.startsWith(n+'_'))[1];
 for(const k of ['factoryLines','products','materials','routes','machines','calendars','downtime','orders','tools','personnelGroups','personnelPools','dependencies'])d[k]=resources[k];
 d.times=resources.times.map(r=>r['工序编号']==='PACK'?{...r,'计算方式':'固定','固定分钟':'50','速度支每分钟':''}:r);
 d.batchResources=table('15').map(r=>canon('batchResources',r));
 const spaces=table('12').filter(r=>r['资源类型']==='空间');
 d.dependencies.push(...spaces.map(r=>canon('dependencies',{...r,'需求数量':'240'})));
 d.resourceClaims=[...resources.resourceClaims,...spaces.map((r,i)=>claim('B12-SIM-COLD-'+i,r['订单编号'],r['工序编号'],r['资源编号'],'空间','240','kg'))];
 enableJoint(d,'MOLD');enableJoint(d,'STORAGE');Object.assign(d.rules.find(r=>r['规则编号']==='LABOR'),{'是否启用':'是','参数JSON':'{}'});
 Object.assign(d.rules.find(r=>r['规则编号']==='DELIVERY'),{'是否启用':'是','参数JSON':JSON.stringify(deliveryParameters)});
 d.deliveryConditions=d.orders.map(o=>({'订单编号':o['订单编号'],'模拟质量状态':'模拟合格','模拟质量可用时间':'','模拟有效期截止时间':'不适用','要求剩余有效分钟':'0'}));
 d.originalBom=table('09').map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v)])));
 return d;
}
// Preserve actual uploaded bytes for schemas that already match. Other inputs
// are explicitly supplemented CSVs, with original files retained alongside them.
export const b12VerbatimFiles=['01_工厂与产线配置.csv','02_工厂工作日历.csv','03_设备资源配置.csv','04_设备停机与例外日历.csv','07_产品与包装规格.csv','08_物料主数据.csv','09_物料BOM配置.csv','10_工艺路线配置.csv','15_空间与组批规则配置.csv'];
export function b12ScenarioFiles(data,id,root){
 return scenarioFiles(data).map(file=>root&&b12VerbatimFiles.includes(file.name)?{...file,text:fs.readFileSync(path.join(root,'UAT-'+id,file.name),'utf8')}:file);
}
