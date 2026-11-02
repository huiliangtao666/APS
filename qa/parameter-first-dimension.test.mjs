import test from 'node:test';import assert from 'node:assert/strict';
import {prepareBusinessImport} from '../server/workbook-workbench.mjs';
import {integrateParameterImport} from '../server/parameter-import.mjs';
import {parameterIssues} from '../server/parameter-contract.mjs';
const row={'参数编号':'CAP','对象编号':'LOC','参数名称':'最大容量','参数值':'5000','单位':'本行容量单位','生效日':'0','失效日':'44',_row:3};
test('parameter-first relative dimension binds once on first B; later concrete dimension drift remains rejected',()=>{
 const p=integrateParameterImport({tables:{'配置参数':[row]},parameterDefinitions:[],parameterCategories:[],parameterAnnotations:{},classification:[],issues:[],warnings:[]},null,{id:'EXAMPLE',name:'explicit',expectedVersion:0,fileHash:'P',adoptParameters:true,actor:'owner'});
 assert.deepEqual(p.issues,[]);assert.equal(p.d.tables['配置参数'][0]._dimension,'本行容量单位');
 const raw={id:'EXAMPLE',fileHash:'B',tables:{'配置参数':[],'库区库位':[{'库位编号':'LOC','容量单位':'千克','最大容量':'1000',_row:3}]},bindings:[]};
 const d=prepareBusinessImport(raw,p.d),adopted=d.tables['配置参数'][0];
 assert.equal(adopted._dimension,'千克');assert.equal(adopted._dimensionBinding.relative,'本行容量单位');assert.equal(adopted['单位'],'本行容量单位');
 assert.deepEqual(parameterIssues(d,{completeness:false}),[]);
 const replaced=structuredClone(raw);replaced.fileHash='B2';replaced.tables['库区库位'][0]['容量单位']='个';
 const bad=prepareBusinessImport(replaced,d),issues=parameterIssues(bad,{completeness:false});
 assert.equal(bad.tables['配置参数'][0]._dimension,'千克');
 assert.ok(issues.some(i=>i.code==='PARAMETER_INVALID'&&i.record==='CAP'&&i.field==='参数值'&&i.message==='参数量纲与业务对象单位不一致，须明确映射；不自动换算'));
 console.log('REJECTION_FACTS '+JSON.stringify(issues));
});
