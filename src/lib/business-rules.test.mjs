import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRules,validRuleTime,ruleCatalog} from './business-rules.mjs';
import {queryInventoryAvailability} from './inventory.mjs';
const row=(id,parameters={},extra={})=>({'规则编号':id,'中文名称':id,'是否启用':'是','参数JSON':JSON.stringify(parameters),...extra});
const data=()=>({rules:[row('MACHINE'),row('PRECEDENCE'),row('CALENDAR')],machines:[{}],dependencies:[{}],routes:[{}],times:[{}],calendars:[{}],materials:[{'物料编号':'M'}]});
test('all chapter7 categories described; unknown and unimplemented enablement rejected even with valid JSON',()=>{
 assert.equal(new Set(ruleCatalog.map(r=>r.category)).size,18);
 for(const id of [...ruleCatalog.filter(c=>!c.supported).map(c=>c.id),'UNKNOWN']){
  const d=data();d.rules.push(row(id));assert.ok(assessRules(d).issues.some(i=>i.field==='是否启用'),id);
  d.rules.at(-1)['是否启用']='否';assert.equal(assessRules(d).issues.length,0,id);assert.equal(assessRules(d).settings.at(-1).status,'未实现/未检查');
 }
});
test('necessary constraints cannot be deleted, disabled, narrowed or deferred',()=>{
 for(const id of ['MACHINE','PRECEDENCE','CALENDAR'])for(const change of ['delete','disable','scope','future','parameter']){
  const d=data(),r=d.rules.find(r=>r['规则编号']===id);
  if(change==='delete')d.rules=d.rules.filter(x=>x!==r);
  if(change==='disable')r['是否启用']='否';
  if(change==='scope')r['适用对象']='M1';
  if(change==='future')r['生效时间']='2099-01-01T00:00:00Z';
  if(change==='parameter')r['参数JSON']='{"parallel":true}';
  assert.ok(assessRules(d,'2026-10-29T00:00:00Z').issues.length,id+change);
 }
});
test('activation requires data and parameter schema; future unsupported stays rejected',()=>{
 const d=data();d.rules.push(row('LABOR'));assert.ok(assessRules(d).issues.length);
 d.rules.pop();d.rules.push(row('SORT',{'排序方式':'优化'}));assert.ok(assessRules(d).issues.length);
 d.rules.pop();d.rules.push(row('INVENTORY',{'可用质量状态':[]}));assert.ok(assessRules(d).issues.length);
 d.rules.at(-1)['参数JSON']='{"可用质量状态":["合格"]}';d.rules.at(-1)['适用对象']='NO';assert.ok(assessRules(d).issues.length);
 d.rules.pop();d.rules.push(row('MOLD',{}, {'生效时间':'2099-01-01T00:00:00Z'}));assert.ok(assessRules(d).issues.length);
 d.rules.pop();d.calendars=[];assert.ok(assessRules(d).issues.length);
});
test('effective time uses exact instant including offset and refuses impossible dates or clocks',()=>{
 for(const value of ['2026-02-30T00:00:00Z','2026-01-01','2026-01-01T24:00:00Z','2026-01-01T00:00:00','2026-13-01T00:00:00Z'])assert.equal(validRuleTime(value),false,value);
 const d=data();d.rules.push(row('SORT',{'排序方式':'要求日期'},{'生效时间':'2026-11-02T08:00:00+08:00'}));
 assert.equal(assessRules(d,'2026-11-01T23:59:59Z').settings.at(-1).active,false);
 assert.equal(assessRules(d,'2026-11-02T00:00:00Z').settings.at(-1).active,true);
});
test('inventory configured statuses honor material scope, effective time and explicit disabling',()=>{
 const batches=['M','N'].map(m=>({'物料编号':m,'账面数量':'10','已占用数量':'2','质量状态':'条件放行','有效期':'2026-12-31'}));
 const rules=[row('INVENTORY',{'可用质量状态':['合格','条件放行']},{'适用对象':'M','生效时间':'2026-11-02T08:00:00+08:00'})];
 const amounts=at=>queryInventoryAvailability(batches,{rules,asOf:at}).map(b=>b['当前可用数量']);
 assert.deepEqual(amounts('2026-11-01T23:59:59Z'),[0,0]);assert.deepEqual(amounts('2026-11-02T00:00:00Z'),[8,0]);
 rules[0]['是否启用']='否';assert.deepEqual(amounts('2026-11-02T00:00:00Z'),[0,0]);
});
