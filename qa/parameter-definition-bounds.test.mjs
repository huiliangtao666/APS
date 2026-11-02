import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adoptDefinitionBounds,finiteNumber,parameterIssues,changeParameter,applyParameters,effectiveParameters,parameterView} from '../server/parameter-contract.mjs';
import {integrateParameterImport} from '../server/parameter-import.mjs';
import {parseWorkbook} from '../server/workbook-parse.mjs';
import {workbookSchema,hash} from '../server/workbook-model.mjs';

const row=(value='10',extra={})=>({'参数编号':'MOCK-P1','对象编号':'MOCK-PRODUCT','参数名称':'每箱净重千克','参数值':value,'单位':'千克/箱','生效日':'0','失效日':'44',_cp:'CP016',_sourceRole:'B',_row:3,_cells:{'参数值':'E3'},...extra});
const dataset=(record=row(),definitions=[])=>({id:'MOCK',version:1,fileHash:'business-hash',profile:'excel-qualified-output-202611-r1',parameterContract:'CR-PARAM-UI-20261101:r1',parameterDefinitions:definitions,tables:{'物料主数据':[{'物料编号':'MOCK-PRODUCT','每箱净重千克':'10'}],'配置参数':[record]}});
const definition=(min,max)=>({'参数编号':'CP016','最小值':min,'最大值':max});

test('original business parameter MOCK-P1=10 at E3 accepts SYSTEM >0 without changing source value',()=>{
 const d=dataset(),before=JSON.stringify(d);
 assert.deepEqual(parameterIssues(d),[]);
 assert.equal(JSON.stringify(d),before);
 applyParameters(d,0);
 assert.equal(d.tables['物料主数据'][0]['每箱净重千克'],'10');
 assert.equal(parameterView(d,{cp:'CP016'}).records[0].effectiveValue,'10');
});

test('unchanged approved business180.xlsx reproducer passes parameter validation', {skip:!process.env.BOUNDS_BUSINESS_FIXTURE},()=>{
 const bytes=fs.readFileSync(process.env.BOUNDS_BUSINESS_FIXTURE),before=hash(bytes),parsed=parseWorkbook(bytes,workbookSchema);
 assert.deepEqual(parsed.issues,[]);
 const p=parsed.tables['配置参数'].find(p=>p['参数编号']==='MOCK-P1');
 assert.ok(p);assert.equal(p['参数值'],'10');assert.equal(p._cells['参数值'],'E3');
 assert.deepEqual(parameterIssues(parsed),[]);
 assert.equal(hash(fs.readFileSync(process.env.BOUNDS_BUSINESS_FIXTURE)),before);
});

test('CP016 zero, negatives, nonfinite, expressions and empty values remain located import errors',()=>{
 for(const value of ['0','-1','-0.1','',' ','Infinity','NaN','1e999','>0','10kg','1+9']){
  const issues=parameterIssues(dataset(row(value)));
  assert.equal(issues.length,1,value);assert.equal(issues[0].code,'PARAMETER_INVALID');
  assert.equal(issues[0].record,'MOCK-P1');assert.equal(issues[0].cell,'E3');assert.equal(issues[0].row,3);
 }
 for(const value of ['0.01','1e-3','+10','10.0'])assert.deepEqual(parameterIssues(dataset(row(value))),[],value);
});

test('P numeric min/max are inclusive and still restrict import and online edits',()=>{
 const defs=[definition('5','12')];
 for(const value of ['5','10','12'])assert.deepEqual(parameterIssues(dataset(row(value),defs)),[]);
 for(const value of ['4.99','12.01'])assert.match(parameterIssues(dataset(row(value),defs))[0].message,/P目录边界/);
 const edit=value=>({cp:'CP016',objectId:'MOCK-PRODUCT',field:'每箱净重千克',value,unit:'千克/箱',from:0,to:44,reason:'synthetic regression'});
 assert.doesNotThrow(()=>changeParameter(dataset(row(),defs),edit('12'),'A'));
 for(const value of ['0','-1','4.99','12.01','>0'])assert.throws(()=>changeParameter(dataset(row(),defs),edit(value),'A'));
});

test('catalog comparison operators preserve open and closed boundaries, including scientific literals',()=>{
 for(const [min,max,valid,invalid]of [
  ['>5','<12',['5.1','11.9'],['5','12']],
  ['>=5','<=12',['5','12'],['4.9','12.1']],
  ['≥ 5','≤ 12',['5','12'],['4.9','12.1']],
  ['> 1e-3','< +1.2e1',['0.002','11'],['0.001','12']],
 ]){
  for(const value of valid)assert.doesNotThrow(()=>adoptDefinitionBounds(dataset(row(),[definition(min,max)]),row(value)));
  for(const value of invalid)assert.throws(()=>adoptDefinitionBounds(dataset(row(),[definition(min,max)]),row(value)),/P目录边界/);
 }
 for(const min of ['>','>>0','>=Infinity','0 || true','garbage'])assert.throws(()=>adoptDefinitionBounds(dataset(row(),[definition(min,'')]),row()),/有限数值/);
 for(const value of ['>0','>=1','≤12','1+2','0x10','Infinity','',' '])assert.throws(()=>finiteNumber(value),/有限数值/);
 assert.equal(finiteNumber('1e-3'),0.001);
});

test('adopted P keeps precedence and explicit zero bound; B source and frozen data remain intact',()=>{
 const original=dataset(),frozen=structuredClone(original),before=JSON.stringify(original);
 const parsed={tables:{'配置参数':[row('12',{'参数编号':'P-MOCK','CP编号':'CP016'})]},parameterDefinitions:[definition('0','12')],parameterCategories:[],parameterAnnotations:{},parameterCounts:{instances:1},classification:[],issues:[],warnings:[],schemaVersion:'test'};
 const {d,issues}=integrateParameterImport(parsed,original,{id:'MOCK',expectedVersion:1,fileHash:'P-hash',adoptParameters:true,actor:'A'});
 assert.deepEqual(issues,[]);assert.equal(JSON.stringify(original),before);assert.deepEqual(frozen,original);
 assert.equal(d.fileHash,'business-hash');assert.equal(effectiveParameters(d,0)[0]['参数值'],'12');
 assert.equal(effectiveParameters(d,0)[0]._sourceRole,'P');
 assert.equal(d.tables['配置参数'].find(p=>p._sourceRole==='B')['参数值'],'10');
 applyParameters(d,0);assert.equal(d.tables['物料主数据'][0]['每箱净重千克'],'12');
 const invalid=structuredClone(parsed);invalid.tables['配置参数'][0]['参数值']='0';
 assert.ok(integrateParameterImport(invalid,original,{id:'MOCK',expectedVersion:1,fileHash:'bad-P',adoptParameters:true,actor:'A'}).issues.some(i=>i.code==='PARAMETER_INVALID'));
});

test('other atomic fields retain strict >0, inclusive zero, upper bound and unit checks',()=>{
 const d=dataset(row('0',{'参数名称':'检验天数',_cp:'CP074','单位':'天','对象编号':'SUP'}));
 d.tables['供应商与供货条件']=[{'供货关系编号':'SUP','检验天数':'0'}];
 assert.deepEqual(parameterIssues(d),[]);
 assert.equal(parameterIssues(dataset(row('10',{'单位':'天'})))[0].code,'PARAMETER_INVALID');
 const ratio=value=>dataset(row(value,{'参数名称':'标准收率',_cp:'CP036','单位':'比例','对象编号':'BOM'}));
 for(const value of ['0.5','1']){const x=ratio(value);x.tables['物料清单']=[{'用量关系编号':'BOM'}];assert.deepEqual(parameterIssues(x),[]);}
 for(const value of ['0','1.01'])assert.ok(parameterIssues(ratio(value)).some(i=>i.code==='PARAMETER_INVALID'));
});
