// Finite original AC15 inventory. QA only; no inferred DEC02/03 semantics.
import {seed} from '../server/planner.ts';
import {ruleCatalog} from '../src/lib/business-rules.mjs';
import {categoryInputs} from './fr014015-fixture.mjs';
import {batchFixture} from './batch-fixture.mjs';
import {materialFixture} from './material-fixture.mjs';
import {deliveryParameters} from '../src/lib/delivery-policy.mjs';
export const pin='0aaa003dc85ff453bad3c958b14a94c44dadb0cf';
export const clone=x=>structuredClone(x);
export function profile(id){
 let d=categoryInputs(false);
 if(id==='MATERIAL')d={...d,...materialFixture(seed)};
 if(['CAPACITY','PROGRAM','DELIVERY'].includes(id)){
  const b=batchFixture(seed);d={...d,...b};
  d.deliveryConditions=[{'订单编号':'A','模拟质量状态':'模拟合格','模拟质量可用时间':'','模拟有效期截止时间':'2026-12-31T08:00:00+08:00','要求剩余有效分钟':'0'}];
 }
 if(!d.rules.some(r=>r['规则编号']===id))d.rules.push({'规则编号':id,'中文名称':id,'是否启用':'否','参数JSON':'{}'});
 const c=ruleCatalog.find(c=>c.id===id),r=d.rules.find(r=>r['规则编号']===id);
 Object.assign(r,{'是否启用':c?.supported?'是':'否','参数JSON':c?.parameters||'{}','适用对象':'*','生效时间':''});
 if(id==='DELIVERY')Object.assign(r,{'参数JSON':JSON.stringify(deliveryParameters)});
 return d;
}
// Necessary-data omissions, separate from generic rule-row required fields.
export const omissions={
 MACHINE:['machines',0,'最大装载kg'],PRECEDENCE:['times',0,'固定分钟'],CALENDAR:['calendars',0,'结束分钟'],
 LABOR:['personnelGroups',0,'人员数量'],INVENTORY:['inventory',0,'账面数量'],SORT:['rules',-1,'参数JSON'],
 MATERIAL:['bom',0,'配置用量'],CAPACITY:['batchResources',0,'容量'],PROGRAM:['batchResources',0,'允许程序'],
 MOLD:['resourceClaims',0,'需求数量'],STORAGE:['resourceClaims',1,'后延占用分钟'],DELIVERY:['deliveryConditions',0,'要求剩余有效分钟'],
 PROGRESS:['rules',-1,'中文名称']
};
