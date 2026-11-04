import test from 'node:test';
import assert from 'node:assert/strict';
import {rational,encode,coefficient,safe} from '../server/solver-choice/exact.mjs';
import {quantityLattice,nativeScales,decimalProduct,sourceLotQuantity,exactBatchBound} from '../server/solver-choice/quantity-lattice.mjs';
import {INT64_MAX,int64,activity,workbookIntegerBounds} from '../server/solver-choice/integer-bounds.mjs';
import {fingerprint} from '../server/solver-choice/contract.mjs';
import {urgentFixture,selection} from './urgent-order-fixture.mjs';
import {compileWorkbookModel} from '../server/solver-choice/workbook-compiler.mjs';
import {validateWorkbookModel} from '../server/solver-choice/workbook-model.mjs';
const sample=()=>({tables:{'物料主数据':[
 {'物料编号':'P','基础单位':'千克','每件净重千克':'0.1000'},
 {'物料编号':'C','基础单位':'千克'},
 {'物料编号':'UNRELATED','基础单位':'千克','每件净重千克':'0.000001'}],
 '物料清单':[{'用量关系编号':'B1','父项编号':'P','子项编号':'C','子项基准用量':'2','父项基准产出千克':'3','数量单位':'千克','标准收率':'0.96',_row:3}]}});
test('source decimals reduce before propagation; unrelated kg and cancellable numerators do not expand child lattice',()=>{
 const d=sample(),before=fingerprint(d),proof=quantityLattice(d),s=nativeScales(proof);
 assert.equal(s.P.scale,10);assert.equal(s.C.scale,15);assert.equal(s.UNRELATED.scale,1000000);
 assert.deepEqual(proof.steps[0].unitStep,{unreduced:{n:'2',d:'30'},gcd:'2',n:'1',d:'15'});
 assert.deepEqual(coefficient(s.C.scale,s.P.scale,'2','3'),{n:1,d:1});assert.equal(before,fingerprint(d));
});
test('source decimal multiplication and inventory subtraction do not freeze binary tails',()=>{
 assert.equal(decimalProduct('0.1','0.2'),'0.02');assert.equal(decimalProduct('2.5','0.125'),'0.3125');
 const d={tables:{'期初库存':[{_row:3,'当前数量':'0.3','期初已占用量':'0.1'}]}};
 assert.deepEqual(sourceLotQuantity({id:'inventory:I',source:{sheet:'期初库存',row:3}},d),{n:1n,d:5n});
 assert.equal(encode(sourceLotQuantity({id:'inventory:I',source:{sheet:'期初库存',row:3}},d),5,'I'),1);
 assert.equal(exactBatchBound(['1'],['0.1'],3,10),3);
});
test('actual workbook compiler emits numeric protocol; complete activity checks veto aggregate overflow and strings',()=>{
 const d=urgentFixture();d.tables['配置参数'].push({'参数编号':'CP101','对象编号':'GLOBAL','参数名称':'标准生产批量千克','参数值':'1000','单位':'千克','生效日':'0','失效日':'44',_row:3});
 const selected={...selection,demandIds:['N3']},before=fingerprint(d),m=compileWorkbookModel(d,selected,{inputHash:before,selectionHash:fingerprint(selected),objective:{kind:'feasibility',source:'EXPLICIT_MODULE_FIXTURE_NOT_NATIVE'}});
 assert.equal(fingerprint(d),before);assert.deepEqual(JSON.parse(JSON.stringify(m)),m);
 assert.ok(workbookIntegerBounds(m).expressions.some(x=>x.path.includes('lotAndFEFOClaims')));
 const rehash=x=>{const {modelHash,...body}=x;return {...body,modelHash:fingerprint(body)};};
 const str=structuredClone(m);str.groups[0].maxQuantity='6';assert.throws(()=>validateWorkbookModel(rehash(str)),e=>e.code==='CP_MODEL_INPUT');
 const overflow=structuredClone(m),delivery=overflow.feeds.find(f=>f.demandId);
 for(let i=0;i<1030;i++)overflow.feeds.push({...delivery,id:'OVERFLOW-'+i,maxQuantity:Number.MAX_SAFE_INTEGER});
 assert.throws(()=>validateWorkbookModel(rehash(overflow)),e=>e.code==='CP_INT64_OVERFLOW'&&e.details.path.includes('lotAndFEFOClaims'));
 const product=structuredClone(m),routed=product.groups.find(g=>g.routes.length);routed.maxQuantity=Number.MAX_SAFE_INTEGER;routed.routes[0].durationRatio={n:1000000000,d:1};
 // Task domains (not just the group domain) drive native duration helpers.
 for(const t of product.tasks)t.maxQuantity=Number.MAX_SAFE_INTEGER;
 assert.throws(()=>validateWorkbookModel(rehash(product)),e=>e.code==='CP_INT64_OVERFLOW');
});
test('original six-place BOM/yield is exact; no simpler fraction or second yield deduction',()=>{
 const d=sample();d.tables['物料清单'][0]['子项基准用量']='885.416667';d.tables['物料清单'][0]['父项基准产出千克']='1000';
 const p=quantityLattice(d);assert.deepEqual({n:p.steps[0].ratio.n,d:p.steps[0].ratio.d},{n:'885416667',d:'1000000000'});
 assert.equal(p.steps[0].source.yield,'0.96');assert.notEqual(p.steps[0].ratio.d,'96');
});
test('53-bit JSON boundary stays numeric and exact; unsafe/string APIs and fractional quantities reject',()=>{
 assert.equal(safe(BigInt(Number.MAX_SAFE_INTEGER),'x'),Number.MAX_SAFE_INTEGER);
 assert.throws(()=>safe(BigInt(Number.MAX_SAFE_INTEGER)+1n,'x'),e=>e.code==='CP_QUANTITY_OVERFLOW');
 assert.throws(()=>encode('0.125',100,'x'),e=>e.code==='CP_QUANTITY_NOT_EXACT');
 assert.deepEqual(JSON.parse(JSON.stringify({q:encode('0.125',8,'x')})),{q:1});
 const d=sample();d.tables['物料主数据'][0]['每件净重千克']=0.1;
 assert.throws(()=>quantityLattice(d),e=>e.code==='CP_QUANTITY_PRECISION');
});
test('signed int64 and aggregate activity limits checked with BigInt including negative activity',()=>{
 assert.equal(int64(INT64_MAX,'x'),INT64_MAX);assert.equal(int64(-(1n<<63n),'x'),-(1n<<63n));
 assert.throws(()=>int64(INT64_MAX+1n,'x'),e=>e.code==='CP_INT64_OVERFLOW');
 assert.deepEqual(activity('at-boundary',[{max:INT64_MAX}]),{path:'at-boundary',min:'0',max:String(INT64_MAX)});
 assert.throws(()=>activity('sum',[{max:INT64_MAX},{max:1}]),e=>e.code==='CP_INT64_OVERFLOW');
 assert.throws(()=>activity('negative',[{coefficient:-1n,max:INT64_MAX},{coefficient:-1n,max:2}]),e=>e.code==='CP_INT64_OVERFLOW');
 // Internal exact arithmetic can cross 53 bits while every JSON field remains
 // safe and the whole activity stays int64; no change to the field guard.
 assert.equal(activity('internal',[{coefficient:1000000000,max:1000000000}]).max,'1000000000000000000');
});
test('irreducible propagation beyond int64 produces a located certificate rather than a rounded model',()=>{
 const d=sample();d.tables['物料清单'].push({...d.tables['物料清单'][0],'用量关系编号':'B2','父项编号':'C','子项编号':'UNRELATED','子项基准用量':'0.000000001','父项基准产出千克':'1000000000'});
 const p=quantityLattice(d);assert.throws(()=>nativeScales(p),e=>e.code==='CP_QUANTITY_OVERFLOW'&&e.details.path==='UNRELATED'&&e.details.exceedsInt64);
 assert.equal(d.tables['物料清单'][1]['子项基准用量'],'0.000000001');
});
test('missing/invalid precision, units, counts and cycles are located refusals',()=>{
 for(const value of ['',undefined,'NaN','-0.1','1e-3'])assert.throws(()=>rational(value),e=>e.code==='CP_QUANTITY_PRECISION');
 const d=sample();d.tables['物料清单'][0]['数量单位']='吨';assert.throws(()=>quantityLattice(d),e=>e.code==='CP_QUANTITY_UNIT');
 d.tables['物料清单'][0]['数量单位']='千克';d.tables['物料主数据'][0]['基础单位']='个';assert.throws(()=>quantityLattice(d),e=>e.code==='CP_INDIVISIBLE_UNIT');
 const c=sample();c.tables['物料清单'].push({...c.tables['物料清单'][0],'父项编号':'C','子项编号':'P'});assert.throws(()=>quantityLattice(c),e=>e.code==='CP_BOM_CYCLE');
});
