import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyNativeSource,rawHash} from '../../server/simulator/source.mjs';
import {prepareBusinessImport} from '../../server/workbook-workbench.mjs';
import {nativeFixture} from './import-fixture.mjs';

test('detached native copy preserves own keys, insertion order, undefined, holes and aliases without a source node',()=>{
 const shared={nested:{n:2}};
 const input={z:undefined,items:[undefined,,shared],a:shared,__special:JSON.parse('{"__proto__":{"safe":true},"z":1,"a":2}')};
 const before=rawHash(input),out=copyNativeSource(input),reference=structuredClone(input);
 assert.deepEqual(out,reference);assert.deepEqual(Object.keys(out),Object.keys(input));
 assert.equal(Object.hasOwn(out,'z'),true);assert.equal(Object.hasOwn(out.items,1),false);
 assert.equal(out.items[2],out.a);assert.notEqual(out.a,input.a);assert.notEqual(out.a.nested,input.a.nested);
 assert.deepEqual(Object.keys(out.__special),Object.keys(input.__special));assert.equal(Object.hasOwn(out.__special,'__proto__'),true);
 assert.equal(rawHash(out),createHash('sha256').update(JSON.stringify(reference)).digest('hex'));
 out.a.nested.n=99;out.__special.__proto__.safe=false;
 assert.equal(shared.nested.n,2);assert.equal(input.__special.__proto__.safe,true);assert.equal(rawHash(input),before);
});
test('optional importer copier matches the existing native preparation with no omitted source properties',()=>{
 const value=nativeFixture().frozen.input,before=rawHash(value);
 const reference=prepareBusinessImport(value,null),out=prepareBusinessImport(value,null,copyNativeSource);
 assert.deepEqual(out,reference);assert.equal(rawHash(out),rawHash(reference));assert.equal(rawHash(value),before);
 out.tables['物料主数据'][0]['物料名称']='detached';assert.notEqual(out.tables['物料主数据'][0]['物料名称'],value.tables['物料主数据'][0]['物料名称']);
});

import {canonical,fingerprint,copy} from '../../server/simulator/contract.mjs';
import {integrateParameterImport} from '../../server/parameter-import.mjs';
import {parseWorkbook} from '../../server/workbook-parse.mjs';
import {parameterWorkbook} from '../../server/parameter-workbook-export.mjs';
import {schema as nativeSchema} from './import-fixture.mjs';

test('streaming canonical hash and detached copy match original spelling, sorted keys and JSON scalar failures',()=>{
 const shared={z:-0,a:'汉字😀\ud800',n:{b:true,a:null}};
 const value={z:Array.from({length:2400},(_,i)=>({z:i,a:shared})),a:JSON.parse('{"__proto__":{"safe":true},"10":1,"2":2}')};
 const expected=canonical(value),out=copy(value);
 assert.equal(fingerprint(value),createHash('sha256').update(expected).digest('hex'));
 assert.deepEqual(out,JSON.parse(expected));assert.deepEqual(Object.keys(out),Object.keys(JSON.parse(expected)));
 assert.equal(Object.hasOwn(out.a,'__proto__'),true);assert.notEqual(out.z[0].a,out.z[1].a);assert.notEqual(out.z[0].a,shared);
 out.z[0].a.n.a=9;assert.equal(shared.n.a,null);
 for(const invalid of [undefined,NaN,Infinity,{x:undefined},[undefined]]){
  assert.throws(()=>fingerprint(invalid),e=>e.code==='INVALID_JSON');assert.throws(()=>copy(invalid),e=>e.code==='INVALID_JSON');
 }
 for(const v of [[],Array(1),Array(2),[1,,2]]){
  const expectedHash=createHash('sha256').update(canonical(v)).digest('hex');assert.equal(fingerprint(v),expectedHash);
  let expectedCopy;try{expectedCopy=JSON.parse(canonical(v));}catch(e){assert.throws(()=>copy(v),SyntaxError);continue;}assert.deepEqual(copy(v),expectedCopy);
 }
});

test('parameter default and explicit detached copier preserve P precedence, old input and invalid overlay rejection',()=>{
 const old=nativeFixture().frozen.input,oldHash=rawHash(old);
 const p=parameterWorkbook([{'参数编号':'COPY-P-WINDOW','对象编号':'GLOBAL','参数名称':'窗口天数','参数值':'18','单位':'天','生效日':'0','失效日':'44',_cp:'CP006'}],1,{},old.parameterDefinitions);
 const parsed=parseWorkbook(p,nativeSchema),opts={id:old.id,name:'equivalence',expectedVersion:old.version,fileHash:rawHash(p),adoptParameters:true,actor:'explicit-test',overlayResolution:'keep'};
 const reference=integrateParameterImport(parsed,old,opts),out=integrateParameterImport(parsed,old,{...opts,copyValue:copyNativeSource});
 for(const r of [reference,out]){assert.ok(Number.isFinite(Date.parse(r.d.createdAt)));r.d.createdAt='CLOCK';r.d.parameterBaseline.importedAt='CLOCK';}
 assert.deepEqual(out,reference);assert.equal(rawHash(old),oldHash);assert.equal(out.d.version,old.version+1);
 out.d.tables['物料主数据'][0]['物料名称']='detached-P';assert.notEqual(old.tables['物料主数据'][0]['物料名称'],'detached-P');
 for(const options of [opts,{...opts,copyValue:copyNativeSource}])assert.throws(()=>integrateParameterImport(parsed,old,{...options,overlayResolution:'invalid'}),/在线覆盖/);
});
