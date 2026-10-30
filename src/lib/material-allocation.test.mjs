import test from 'node:test';
import assert from 'node:assert/strict';
import {materialFixture} from '../../qa/material-fixture.mjs';
import {calculateMaterialDemand,createMaterialAllocator,materialPolicy} from './material-allocation.mjs';
const seed={products:[{'产品编号':'HC40','单支净重kg':'0.04','每袋支数':'10','总收率':'0.96'}],materials:['LEAN','FAT','WATER','PREMIX','BAG'].map(id=>({'物料编号':id})),orders:[{'订单编号':'A','产品编号':'HC40','合格需求':'480','数量单位':'kg'}],rules:[{'规则编号':'MATERIAL'}],routes:[],dependencies:[]};
const fixture=()=>materialFixture(seed);
const demand=(d,op='MIX',minute=0)=>calculateMaterialDemand(d,d.orders[0],op,minute);
const allocator=d=>createMaterialAllocator(d,materialPolicy(d,'2026-10-29T00:00:00Z'));
test('FR020 AC08/09 exact only-loss recipe, both specifications and packaging damaged-share formula',()=>{
 const d=fixture();assert.deepEqual(demand(d).map(r=>r.quantity),[325,75,75,25]);assert.equal(demand(d,'FILL')[0].quantity,1213);
 d.products[0]['单支净重kg']='0.06';assert.equal(demand(d,'FILL')[0].quantity,809);
 d.orders[0]['已完成合格数量']='240';assert.deepEqual(demand(d).map(r=>r.quantity),[162.5,37.5,37.5,12.5]);
 d.orders[0]['数量单位']='支';d.orders[0]['合格需求']='8000';d.orders[0]['已完成合格数量']='0';assert.equal(demand(d)[0].quantity,325);
});
test('FR020 AC10 325kg demand,400 stock,100 occupied leaves25 shortage and no committed deduction',()=>{
 const d=fixture();Object.assign(d.inventory[0],{'账面数量':'400','已占用数量':'100'});const before=JSON.stringify(d),a=allocator(d),r=a.preview(demand(d),0);
 assert.equal(r.ok,false);assert.equal(r.rows[0].shortage,25);assert.equal(r.rows[0].allocations[0].quantity,300);assert.equal(r.rows[0].committed,false);assert.equal(JSON.stringify(d),before);
 assert.deepEqual(a.preview(demand(d),0).rows,r.rows);
});
test('FR020 FEFO checks expiry/status/time/quantity together, excludes frozen,pending,rejected and over-occupied',()=>{
 const d=fixture(),base=d.inventory[0];d.inventory=d.inventory.slice(1);
 for(const [id,qty,reserved,expiry,status,ready]of [['late','62.5','0','2026-12-31','合格',''],['early','137.5','37.5','2026-11-03','合格',''],['hold','999','0','2026-12-31','冻结',''],['pending','999','0','2026-12-31','待检',''],['reject','999','0','2026-12-31','不合格',''],['expired','999','0','2026-11-01','合格',''],['future','999','0','2026-12-31','合格','2026-11-02T11:00:00+08:00']])d.inventory.push({...base,'批次编号':id,'账面数量':qty,'已占用数量':reserved,'有效期':expiry,'质量状态':status,'预计可用时间':ready});
 d.orders[0]['合格需求']='240';let r=allocator(d).preview(demand(d),0);assert.equal(r.ok,true);assert.deepEqual(r.rows[0].allocations.map(a=>[a.lotId,a.quantity]),[['early',100],['late',62.5]]);
 r=allocator(d).preview(demand(d,'MIX',180),180);assert.ok(r.rows[0].allocations.every(a=>a.quality==='合格'));
});
test('FR020 shared lot ledger and exact decimal deductions never double consume; aborted attempts are free',()=>{
 const d=fixture();d.orders[0]['合格需求']='240';d.inventory[0]['账面数量']='325';const a=allocator(d);
 const first=a.preview(demand(d),0);assert.equal(first.ok,true);first.commit();
 const second=a.preview(demand(d),0);assert.equal(second.ok,true);second.commit();
 const third=a.preview(demand(d),0);assert.equal(third.rows[0].shortage,162.5);assert.equal(third.rows[0].allocations.length,0);
 const small=fixture();small.orders[0]['合格需求']='0.96';small.inventory[0]['账面数量']='0.65';const ar=allocator(small);const rr=ar.preview(demand(small),0);assert.equal(rr.ok,true);rr.commit();assert.equal(ar.preview(demand(small),0).rows[0].shortage,0.65);
});
test('FR020 unsupported units, ambiguous versions, incomplete recipes, free-text loss and fractional packaging block',()=>{
 for(const mutate of [d=>d.orders[0]['数量单位']='箱',d=>d.bom[0]['配置用量']='600',d=>d.bom[0]['损坏比例']='0.01',d=>d.bom[0]['用量基准']='每批（待确认）',d=>d.bom[0]['收率/损耗口径备注']='工序加水10kg',d=>d.bom.push({...d.bom[0],'版本编号':'V2'}),d=>d.products[0]['总收率']='1.2']){const d=fixture();mutate(d);assert.throws(()=>demand(d));}
 const d=fixture();d.orders[0]['合格需求']='1';assert.throws(()=>demand(d,'FILL'),/中间取整/);
 d.orders[0]['合格需求']='480';delete d.bom.at(-1)['损坏比例'];assert.throws(()=>demand(d,'FILL'),/显式/);
});
test('FR020 expected supply is explicit, conditional, delayed, qualified, FEFO and capped by use and supply',()=>{
 const d=fixture();d.inventory[0]['账面数量']='0';const rule=d.rules.find(r=>r['规则编号']==='MATERIAL'),p=JSON.parse(rule['参数JSON']);p['允许预计供给']=true;rule['参数JSON']=JSON.stringify(p);
 d.supplies=[{'供给编号':'S','物料编号':'LEAN','批次编号':'EXPECTED','预计数量':'325','预计到达时间':'2026-11-02T10:00:00+08:00','预计可用时间':'2026-11-02T11:00:00+08:00','质量状态':'预计可用','有效期':'2026-12-31'}];
 d.supplyUses=[{'引用编号':'U','订单编号':'A','工序编号':'MIX','供给编号':'S','使用数量':'325'}];
 let a=allocator(d);assert.equal(a.preview(demand(d),120).ok,false);let r=a.preview(demand(d,'MIX',180),180);assert.equal(r.ok,true);assert.equal(r.rows[0].allocations[0].conditional,true);r.commit();assert.equal(a.preview(demand(d,'MIX',180),180).rows[0].shortage,325);
 d.supplyDelays=[{'记录编号':'D','供给编号':'S','记录时间':'2026-11-01T00:00:00Z','调整后到达时间':'2026-11-02T11:00:00+08:00','调整后可用时间':'2026-11-02T12:00:00+08:00','原因':'模拟延期'}];a=allocator(d);assert.equal(a.preview(demand(d),180).ok,false);assert.equal(a.preview(demand(d,'MIX',240),240).ok,true);
 d.inventory.push({...d.inventory[0],'批次编号':'EXPECTED'});assert.throws(()=>allocator(d).preview(demand(d),240),/重复批次/);
});
test('FR020 exact0.1kg shortage is not forgiven and waiting/expired expected lots cannot be consumed',()=>{
 const d=fixture();d.orders[0]['合格需求']='240';d.inventory[0]['账面数量']='162.4';let r=allocator(d).preview(demand(d),0);assert.equal(r.rows[0].shortage,0.1);assert.equal(r.ok,false);
 d.inventory[0]['账面数量']='.5';d.orders[0]['合格需求']='.48';r=allocator(d).preview(demand(d),0);assert.equal(r.ok,true);assert.equal(r.rows[0].quantity,0.325);
 const supply={'供给编号':'S','物料编号':'LEAN','批次编号':'S-LOT','预计数量':'325','预计到达时间':'2026-11-02T08:00:00+08:00','预计可用时间':'2026-11-02T08:00:00+08:00','有效期':'2026-12-31','质量状态':'预计可用'};
 for(const change of ['denied','missingStatus','frozen','expired','missingExpiry','noReference','referenceCap']){
  const x=fixture();x.inventory[0]['账面数量']='0';x.supplies=[{...supply}];x.supplyUses=[{'引用编号':'U','订单编号':'A','工序编号':'MIX','供给编号':'S','使用数量':'325'}];const p=JSON.parse(x.rules[0]['参数JSON']);p['允许预计供给']=change!=='denied';x.rules[0]['参数JSON']=JSON.stringify(p);
  if(change==='missingStatus')delete x.supplies[0]['质量状态'];if(change==='frozen')x.supplies[0]['质量状态']='冻结';if(change==='expired')x.supplies[0]['有效期']='2026-11-01';if(change==='missingExpiry')delete x.supplies[0]['有效期'];if(change==='noReference')x.supplyUses=[];if(change==='referenceCap')x.supplyUses[0]['使用数量']='300';
  r=allocator(x).preview(demand(x),0);assert.equal(r.ok,false,change);assert.equal(r.rows[0].shortage,change==='referenceCap'?25:325,change);
 }
});
test('FR020 shortage commit rejected, repeat commit idempotent and stale candidate cannot overwrite later allocations',()=>{
 const d=fixture();const a=allocator(d),first=a.preview(demand(d),0),stale=a.preview(demand(d),0);first.commit();first.commit();assert.throws(()=>stale.commit(),/过期/);
 d.inventory[0]['账面数量']='300';const missing=allocator(d).preview(demand(d),0);assert.equal(missing.ok,false);assert.throws(()=>missing.commit(),/缺料/);
});
test('FR020 feed-date expiry and BOM effective date share the v0.3 factory midnight boundary',()=>{
 const d=fixture();d.inventory[0]['有效期']='2026-11-02';assert.equal(allocator(d).preview(demand(d,'MIX',959),959).ok,true);assert.equal(allocator(d).preview(demand(d,'MIX',960),960).ok,false);
 d.inventory[0]['有效期']='2026-12-31';d.bom.forEach(b=>b['生效日期']='2026-11-03');assert.throws(()=>demand(d,'MIX',959),/已生效/);assert.equal(demand(d,'MIX',960)[0].quantity,325);
});

test('FR016 P29 collision trace retains every actual original occurrence and excludes unrelated rows',()=>{
 const d=fixture(),lot=d.inventory[0]['批次编号'];
 d.inventory.push({...d.inventory[0]});
 d.supplies=[{'供给编号':'S','批次编号':lot},{'供给编号':'S','批次编号':'UNRELATED'},{'供给编号':'S2','批次编号':lot}];
 const before=JSON.stringify(d),seen=[];
 const trace=(table,rows)=>seen.push({table,rows});
 assert.throws(()=>allocator(d).preview(demand(d),0,trace),/库存与预计供给重复批次/);
 assert.deepEqual(seen.map(x=>[x.table,x.rows.length]),[['inventory',2],['supplies',2]]);
 assert.equal(seen[0].rows[0],d.inventory[0]);assert.equal(seen[0].rows[1],d.inventory.at(-1));
 assert.equal(seen[1].rows[0],d.supplies[0]);assert.equal(seen[1].rows[1],d.supplies[2]);
 assert.equal(JSON.stringify(d),before);
 d.supplies=[];const clean=[];allocator(d).preview(demand(d),0,(...x)=>clean.push(x));assert.deepEqual(clean,[]);
});
