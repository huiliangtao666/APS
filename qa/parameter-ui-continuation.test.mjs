// Lightweight pure contract checks: Node built-ins only; no workbook parse,
// HTTP listener, subprocess, Worker, browser, container or build.
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyParameters,changeParameter,parameterIssues,parameterView} from '../server/parameter-contract.mjs';
import {parseParameterSheets,integrateParameterImport} from '../server/parameter-import.mjs';
const source=()=>({id:'PURE',version:1,profile:'excel-qualified-output-202611-r1',tables:{'配置参数':[],'供应商与供货条件':[{'供货关系编号':'SUP','检验天数':'1','采购导期天数':'3'}]},parameterContract:'CR-PARAM-UI-20261101:r1',parameterTrials:[{id:'OWN',actor:'A'}]});
const edit=(extra={})=>({cp:'CP074',objectId:'SUP',field:'检验天数',value:'2',unit:'天',from:0,to:15,scope:'dataset',...extra});
test('PCU11: resolving periods out of order and a gap restores literal base input',()=>{
 const d=source();changeParameter(d,edit({newId:'FIRST'}),'A');changeParameter(d,edit({newId:'SECOND',value:'3',from:15,to:31}),'A');
 for(const [day,value]of [[14,'2'],[15,'3'],[31,'1'],[0,'2'],[43,'1']]){applyParameters(d,day);assert.equal(d.tables['供应商与供货条件'][0]['检验天数'],value);}
 assert.equal(d.parameterBaseFields.find(b=>b.field==='检验天数').value,'1');
});
test('PCU09/12: trial zero without a shared record clears back to business-table inheritance',()=>{
 const d=source();changeParameter(d,edit({newId:'LOCAL',scope:'trial:OWN',value:'0',to:44}),'A');applyParameters(d,1,'trial:OWN');assert.equal(d.tables['供应商与供货条件'][0]['检验天数'],'0');
 const view=parameterView(d,{scope:'trial:OWN',day:1},'A').records[0];assert.equal(view.baseValue,'1');assert.equal(view.overrideValue,'0');assert.equal(view.effectiveSource,'trial:OWN');
 changeParameter(d,edit({id:'LOCAL',scope:'trial:OWN',value:'0',to:44,operation:'inherit'}),'A');applyParameters(d,1,'trial:OWN');assert.equal(d.tables['供应商与供货条件'][0]['检验天数'],'1');
});
test('PCU08/10: effective provenance includes the actual global values and frozen objects remain unchanged',()=>{
 const d=source();changeParameter(d,edit({cp:'CP101',field:'标准生产批量千克',objectId:'GLOBAL',value:'500',unit:'千克',to:44,newId:'BATCH'}),'A');applyParameters(d,1);assert.equal(d.effectiveParameters.values[0].field,'标准生产批量千克');assert.equal(d.effectiveParameters.values[0].value,'500');assert.equal(d.effectiveParameters.values[0].unit,'千克');
 const frozen=structuredClone(d);changeParameter(d,edit({cp:'CP101',field:'标准生产批量千克',objectId:'GLOBAL',value:'400',unit:'千克',to:44,id:'BATCH'}),'A');applyParameters(d,1);assert.equal(frozen.effectiveParameters.values[0].value,'500');assert.equal(d.effectiveParameters.values[0].value,'400');
});
test('PCU02/04/20: composite candidate imports validate values and periods without activation',()=>{
 const parsed={tables:{'配置参数':[{'参数编号':'C','对象编号':'RESOURCE','参数名称':'速率口径及效率','参数值':{rateType:'有效',rate:'50',efficiency:'1.1',unit:'kg/天'},'单位':'组合','生效日':'0','失效日':'44',_cp:'CP091'}]},issues:[],warnings:[],classification:[],schemaVersion:'test',parameterDefinitions:[],parameterCategories:[],parameterAnnotations:{}};
 const opts={id:'PURE',name:'pure candidate',expectedVersion:1,fileHash:'test',actor:'A',adoptParameters:true};
 const bad=integrateParameterImport(parsed,source(),opts);assert.ok(bad.issues.some(i=>/效率/.test(i.message)));assert.equal(bad.d.tables['配置参数'].length,0);
 parsed.tables['配置参数'][0]['参数值'].efficiency='1';const good=integrateParameterImport(parsed,source(),opts);assert.equal(good.issues.length,0);assert.equal(good.d.parameterCandidates.length,1);assert.equal(good.d.tables['配置参数'].length,0);
 parsed.tables['配置参数'][0]['失效日']='0';assert.ok(integrateParameterImport(parsed,source(),opts).issues.some(i=>/有效期/.test(i.message)));
});
test('PCU04/13: a new record cannot duplicate another identity or relabel an imported semantic CP',()=>{
 const d=source();changeParameter(d,edit({newId:'TAKEN'}),'A');assert.throws(()=>changeParameter(d,edit({newId:'TAKEN',cp:'CP073',field:'采购导期天数'}),'A'),/参数编号已存在/);
 const record=d.tables['配置参数'][0],parsed={tables:{'配置参数':[{...record,_cp:'CP073'}]},issues:[],warnings:[],classification:[]};assert.throws(()=>integrateParameterImport(parsed,d,{id:d.id,expectedVersion:1,fileHash:'bad',adoptParameters:true,actor:'A'}),/身份冲突/);
});
test('PCU02/20: atomic candidates in a composite CP stay editable; invalid loss proposals reject',()=>{
 const d=source();changeParameter(d,edit({cp:'CP093',field:'最大等待天数',objectId:'ROUTE',candidate:true,value:'2'}),'A');assert.equal(d.parameterCandidates[0]['参数值'],'2');
 const candidate={'参数编号':'LOSS','对象编号':'GLOBAL','参数名称':'统一生产损耗','参数值':'1','单位':'比例','生效日':'0','失效日':'44',_cp:'CP030',_candidate:true};assert.ok(parameterIssues({tables:{'配置参数':[candidate]}}).some(i=>/损耗比例/.test(i.message)));
});
test('PCU02/11: a future or trial atomic edit validates the paired waiting bound at its effective date',()=>{
 const d=source();d.tables['工艺路线']=[{'路线工序编号':'R','最小等待天数':'1','最大等待天数':'3'}];
 changeParameter(d,edit({cp:'CP093',field:'最小等待天数',objectId:'R',value:'4',from:15,to:31}),'A');applyParameters(d,0);const issues=parameterIssues(d);assert.ok(issues.some(i=>i.code==='PARAMETER_RELATION'&&i.sheet==='工艺路线'&&i.record==='R'&&/日15/.test(i.message)));
});
test('PCU05/13: keyword CP063 resolves the same inspection source and keeps both catalog aliases',()=>{
 const d=source();changeParameter(d,edit({to:44}),'A');assert.equal(parameterView(d,{q:'CP063',day:1},'A').records[0].cp,'CP074');assert.deepEqual(parameterView(d,{q:'CP063',layer:'catalog'},'A').records.map(p=>p['参数编号']),['CP063','CP074']);
});
test('PCU04/13: the import layer rejects duplicate PA ids and a mismatched explicit CP before merge',()=>{
 const values={'参数清单':[['参数编号'],['CP074']],'仿真参数分类':[['分类编号','目录引用'],['SP','CP074']],'仿真参数实例':[['参数编号','对象编号','对象名称','参数名称','参数值','单位','生效日','失效日','CP编号'],['PA','SUP','Supplier','检验天数','1','天','0','44','CP074'],['PA','SUP','Supplier','检验天数','2','天','0','44','CP073']]};
 const cells=name=>new Map(values[name].flatMap((row,i)=>row.map((value,j)=>[String.fromCharCode(65+j)+(i+2),{value,formula:null}])));
 const parsed=parseParameterSheets(Object.keys(values),cells);assert.ok(parsed.issues.some(i=>/为空或重复/.test(i.message)));assert.ok(parsed.issues.some(i=>/语义与原子字段映射/.test(i.message)));
});
