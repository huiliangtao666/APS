import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parameterCatalog,atomicFields,changeParameter,parameterView,applyParameters,parameterIssues,effectiveParameters,scopeFor,validateComposite,validateAtomic,specification} from '../server/parameter-contract.mjs';
import {parseWorkbook} from '../server/workbook-parse.mjs';
import {integrateParameterImport} from '../server/parameter-import.mjs';
import {refreshDerived,validateWorkbook,workbookSchema,procurement,hash} from '../server/workbook-model.mjs';
const dir=process.env.PARAMETER_FIXTURE;if(!dir)throw Error('PARAMETER_FIXTURE required');
const source=()=>({id:'MOCK',name:'explicit simulation',version:1,profile:'excel-qualified-output-202611-r1',fileHash:'business-source',tables:{'供应商与供货条件':[{'供货关系编号':'MOCK-SUP','物料编号':'RAW','供应商编号':'SUP','采购导期天数':'3','检验天数':'1','订货倍数':'1','最小订货量':'0'}],'物料主数据':[{'物料编号':'RAW','物料来源':'采购','参考供货关系编号':'MOCK-SUP','基础单位':'千克'}],'配置参数':[]},bindings:[],parameterContract:'CR-PARAM-UI-20261101:r1',parameterTrials:[{id:'own',actor:'userA'},{id:'other',actor:'userB'}]});
const request=(x={})=>({cp:'CP074',objectId:'MOCK-SUP',field:'检验天数',value:'1',unit:'天',from:0,to:44,scope:'dataset',reason:'explicit synthetic edit',...x});
const commit=(d,r)=>{const next=structuredClone(d),result=changeParameter(next,r,'userA');applyParameters(next,0);const issues=parameterIssues(next);if(issues.length)throw Error(issues.map(i=>i.message).join('；'));next.version++;return {d:next,result};};
test('PCU01/04/16: 11-sheet import has distinct CP/SP/PA/D/Q layers; no implicit activation and original unchanged',()=>{
 const bytes=fs.readFileSync(dir+'/parameters-small.xlsx'),before=hash(bytes),parsed=parseWorkbook(bytes,workbookSchema);assert.equal(parsed.issues.length,0,JSON.stringify(parsed.issues));assert.equal(parsed.classification.length,11);assert.deepEqual(parsed.parameterCounts,{definitions:168,categories:2,instances:2,discussions:1,questions:1});
 const {d,issues}=integrateParameterImport(parsed,null,{id:'NEW',name:'isolated candidate',expectedVersion:0,fileHash:before});assert.equal(issues.length,0);assert.equal(d.parameterCandidates.length,2);assert.equal(d.tables['配置参数']?.length||0,0);assert.equal(effectiveParameters(d,1).length,0);assert.equal(hash(bytes),before);assert.equal(d.parameterAnnotations.questions[0]['复核'],'最长13，保留14窗口');
 const bad=parseWorkbook(fs.readFileSync(dir+'/parameters-invalid.xlsx'),workbookSchema),invalid=integrateParameterImport(bad,null,{id:'BAD',name:'negative',expectedVersion:0,fileHash:'invalid'});assert.ok(invalid.issues.some(i=>/有限数值/.test(i.message)));assert.equal(source().version,1);
});
test('PCU02/03: contract bounds, legal decimal text, efficiency/rate split and conditional absence',()=>{
 assert.throws(()=>validateAtomic(specification('换算系数'),'0'),/须>0/);assert.throws(()=>validateAtomic(specification('检验天数'),''),/空白/);assert.equal(validateAtomic(specification('检验天数'),'2.0'),'2.0');assert.throws(()=>validateComposite('CP093',{min:3,max:2}),/最小等待/);
 assert.equal(validateComposite('CP091',{rateType:'有效',rate:'50',efficiency:'1',unit:'kg/天'}).rate,'50');assert.throws(()=>validateComposite('CP091',{rateType:'有效',rate:'50',efficiency:'1.1',unit:'kg/天'}),/效率/);assert.doesNotThrow(()=>validateComposite('CP066',{min:-25,max:-18}));assert.equal(parameterIssues(source()).length,0); // No bag/random capability selected: no invented all-168 required list.
 const d=source();assert.throws(()=>changeParameter(d,request({cp:'CP030',field:'统一原料损耗率',objectId:'GLOBAL',value:'1',candidate:true}),'userA'),/损耗比例/);
});
test('PCU05: 168 catalog entries, nine topics/six step mappings and complete pagination',()=>{
 const d=source();assert.equal(parameterCatalog.length,168);assert.equal(new Set(parameterCatalog.map(x=>x['统一配置页签'])).size,9);const ids=[];for(let offset=0;offset<168;offset+=25){const page=parameterView(d,{layer:'catalog',offset},'userA');assert.equal(page.total,168);ids.push(...page.records.map(r=>r['参数编号']));}assert.equal(new Set(ids).size,168);assert.ok(parameterView(d,{layer:'catalog',step:'A3'},'userA').total>0);
});
test('PCU06/07/13/15: central→step and step→central use canonical CP063/074 and same actual procurement input',()=>{
 let d=source();let saved=commit(d,request({value:'1',newId:'P1'}));d=saved.d;const central=parameterView(d,{cp:'CP063',step:'A3'},'userA');assert.equal(central.records.length,1);assert.equal(central.records[0]['参数值'],'1');const s=d.tables['供应商与供货条件'][0];assert.equal(procurement(10,s,5,2).availableDay,6);assert.equal(procurement(10,s,5,2).lateDays,1);
 d=commit(d,request({cp:'CP063',id:'P1',value:'2'})).d;const back=parameterView(d,{cp:'CP074'},'userA');assert.equal(back.records.length,1);assert.equal(back.records[0]['参数值'],'2');assert.equal(procurement(10,d.tables['供应商与供货条件'][0],5,2).availableDay,7);assert.equal(procurement(10,d.tables['供应商与供货条件'][0],5,2).lateDays,2);assert.equal(d.checkedAt,null);
});
test('PCU08/09/12: explicit trial uses same fields; zero overrides shared, clear restores inheritance, other trial rejected',()=>{
 let d=commit(source(),request({newId:'BASE',value:'2'})).d;const original=hash(d.tables['供应商与供货条件']);d=commit(d,request({scope:'trial:own',newId:'OVERRIDE',value:'0'})).d;
 assert.equal(hash(d.tables['供应商与供货条件']),original);assert.equal(effectiveParameters(d,1,'trial:own')[0]['参数值'],'0');assert.equal(effectiveParameters(d,1,'dataset')[0]['参数值'],'2');assert.throws(()=>scopeFor(d,'trial:other','userA'),/无权/);
 d=commit(d,request({scope:'trial:own',id:'OVERRIDE',operation:'inherit'})).d;assert.equal(effectiveParameters(d,1,'trial:own')[0]['参数值'],'2');assert.throws(()=>changeParameter(d,request({scope:'trial:no-context'}),'userA'),/试算不存在/);
});
test('PCU10/11: day14/15 use half-open periods, overlap rejects before write and another object stays independent',()=>{
 let d=commit(source(),request({newId:'FIRST',from:1,to:15,value:'1'})).d;d=commit(d,request({newId:'SECOND',from:15,to:31,value:'2'})).d;assert.equal(effectiveParameters(d,14)[0]['参数值'],'1');assert.equal(effectiveParameters(d,15)[0]['参数值'],'2');const before=hash(d);assert.throws(()=>commit(d,request({from:14,to:16,value:'3'})),/重叠/);assert.equal(hash(d),before);const frozen=structuredClone(d);d=commit(d,request({id:'SECOND',from:15,to:31,value:'4'})).d;assert.equal(effectiveParameters(frozen,15)[0]['参数值'],'2');assert.equal(effectiveParameters(d,15)[0]['参数值'],'4');
});
test('PCU13/14/20: derived and system fields immutable, candidates never activated, qualified-output profile not silently migrated',()=>{
 const d=source(),before=hash(d);for(const cp of ['CP018','CP147','CP152'])assert.throws(()=>changeParameter(d,request({cp,field:'immutable'}),'userA'),/只读/);assert.equal(hash(d),before);
 changeParameter(d,request({cp:'CP091',field:'速率口径及效率',candidate:true,value:{rateType:'有效',rate:'50',efficiency:'1',unit:'kg/天'}}),'userA');assert.equal(d.parameterCandidates.length,1);assert.equal(effectiveParameters(d,1).length,0);assert.throws(()=>changeParameter(d,request({cp:'CP091',field:'速率口径及效率',candidate:true,enable:true,value:{}}),'userA'),/不能显示已启用/);assert.equal(d.profile,'excel-qualified-output-202611-r1');
});
test('PCU13: packaging ratio20 derived; fractional ratio is a located conflict without rounding',()=>{
 const d=source();Object.assign(d.tables['物料主数据'][0],{'每箱净重千克':'6','每件净重千克':'0.3'});refreshDerived(d);assert.equal(d.tables['物料主数据'][0]['每箱件数'],'20');d.tables['物料主数据'][0]['每件净重千克']='0.7';refreshDerived(d);assert.ok(validateWorkbook(d).some(i=>i.code==='PACKAGING_RATIO'));
});
test('PCU04: repeated parameter import updates by PA identity rather than appending or changing unrelated source hash',()=>{
 const parsed=parseWorkbook(fs.readFileSync(dir+'/parameters-small.xlsx'),workbookSchema);const opts={id:'MOCK',name:'test',expectedVersion:1,fileHash:'parameter-source',adoptParameters:true};const once=integrateParameterImport(parsed,source(),opts),twice=integrateParameterImport(parsed,once.d,{...opts,expectedVersion:2});assert.equal(once.issues.length,0);assert.equal(twice.issues.length,0);assert.equal(twice.d.tables['配置参数'].length,2);assert.equal(twice.d.fileHash,'business-source'); // HTTP commit, not this pure function, owns version idempotency.
});

test('PCU17 pure planner: equipment600 and one physical tool500 both constrain new task quantities; no Worker',async()=>{
 const {calculateWorkbook}=await import('../server/workbook-plan.mjs');let d=parseWorkbook(fs.readFileSync(dir+'/supply/small.xlsx'),workbookSchema);Object.assign(d,{id:'MOCK-CAP',version:1,fileHash:'synthetic-capacity',profile:'excel-qualified-output-202611-r1',mapping:JSON.parse(fs.readFileSync(dir+'/supply/mapping.json')),parameterContract:'CR-PARAM-UI-20261101:r1'});
 for(const r of d.tables['设备与工装'])Object.assign(r,r['资源类别']==='设备'?{'单次批量上限千克':'600','标准日产能千克':'5000','同时占位上限千克':'600'}:{'单次批量上限千克':'500'});
 for(const r of d.tables['期初库存'])Object.assign(r,{'当前数量':'1000','放行日':'0','到期日':'44'});d.tables['库区库位'][0]['最大容量']='100000';d.tables['每日需求'][0]['需求箱数']='60';
 refreshDerived(d);const plan=calculateWorkbook(d,{startDay:1,endDay:14,currentDay:1});assert.equal(plan.verification.status,'pass',plan.verification.issues.join('；'));assert.ok(plan.tasks.length>0);assert.ok(plan.tasks.every(t=>t.quantity<=500));assert.equal(d.tables['设备与工装'].find(r=>r['资源类别']==='设备')['单次批量上限千克'],'600');assert.ok(plan.tasks.every(t=>t.tools.length===1));
});

test('PCU12/14 pure existing standard-input service: shared2%/material0 and isolated trial use same recipe source',async()=>{
 const {createBomLossConfig,calculateBomLoss}=await import('../src/lib/bom-loss-policy.mjs');const {changeScopedBomApplication,bomScope,bomApplication}=await import('../server/workbook-bom-application.mjs');
 const data={bom:['A','B'].map(id=>({'产品编号':'PRODUCT','物料编号':id,'用量类型':'BOM物料','版本编号':'V1','用量基准':'每1000kg投入','用量单位':'kg','配置用量':'500'}))},state={revision:1,data,trials:[{id:'T',actor:'A',status:'active',revision:1,data:structuredClone(data)}]};const config=createBomLossConfig('explicit simulation','1');config.unified.production='2';config.overrides=[{materialId:'B',losses:{production:'0'}}];
 const base=changeScopedBomApplication(state,{productId:'PRODUCT',version:'V1',revision:1,config},'A');assert.equal(base.scope,'standard-input:shared');const result=calculateBomLoss(base.recipe,base.config);assert.equal(result.rows.find(r=>r.materialId==='A').output.numerator,'490');assert.equal(result.rows.find(r=>r.materialId==='B').output.numerator,'500');
 const shared=hash(state.data),local=structuredClone(config);local.unified.production='3';const trial=changeScopedBomApplication(state,{productId:'PRODUCT',version:'V1',revision:1,trialId:'T',config:local},'A');assert.equal(trial.scope,'trial:T');assert.equal(hash(state.data),shared);assert.equal(bomApplication(bomScope(state,'T','A').target.data,'PRODUCT','V1').config.unified.production,'3');assert.equal(bomApplication(state.data,'PRODUCT','V1').config.unified.production,'2');const before=hash(state);assert.equal(changeScopedBomApplication(state,{productId:'PRODUCT',version:'V1',revision:1,trialId:'T',config:local},'A').conflict,true);assert.equal(hash(state),before);assert.throws(()=>bomScope(state,'T','B'),/不属于/);
});

test('PCU01/04/09/11: genuine OOXML template and filtered export preserve scope, period, unit and record identity on re-import',async()=>{
 const {parameterWorkbook}=await import('../server/parameter-workbook-export.mjs');let d=commit(source(),request({newId:'P1'})).d;const p=d.tables['配置参数'][0],bytes=parameterWorkbook([p],d.version);const parsed=parseWorkbook(bytes,workbookSchema);assert.equal(parsed.classification.length,11);assert.equal(parsed.issues.length,0,JSON.stringify(parsed.issues));assert.equal(parsed.parameterCounts.instances,1);assert.equal(parsed.parameterCounts.discussions,0);assert.equal(parsed.parameterCounts.questions,0);
 const restored=integrateParameterImport(parsed,d,{id:d.id,name:d.name,expectedVersion:d.version,fileHash:'export-hash',adoptParameters:true,actor:'userA'});assert.equal(restored.issues.length,0);assert.equal(restored.d.tables['配置参数'].length,1);assert.equal(restored.d.tables['配置参数'][0]['参数编号'],'P1');assert.equal(restored.d.tables['配置参数'][0]['单位'],'天');assert.equal(restored.d.tables['配置参数'][0]._scope,'dataset');
 assert.equal(parseWorkbook(parameterWorkbook(),workbookSchema).issues.length,0);
});

test('PCU17 calendar source adoption: Sunday1/standard2 yields one-half once; actual0 closes without a zero denominator',async()=>{
 const {parameterDayRatio}=await import('../server/parameter-contract.mjs');const d={parameterContract:'CR-PARAM-UI-20261101:r1'},c={'生产班次数':'1','日产能分子':'1','日产能分母':'2'},crew={'标准日班次数':'2','周日班次数':'1'};
 assert.equal(parameterDayRatio(d,c,crew,1),0.5);crew['周日班次数']='0';assert.equal(parameterDayRatio(d,c,crew,1),0);assert.equal(crew['标准日班次数'],'2');crew['周日班次数']='1';c['生产班次数']='0';assert.equal(parameterDayRatio(d,c,crew,1),0);c['日产能分母']='0';assert.throws(()=>parameterDayRatio(d,c,crew,1),/标准班次/);
});
