// Prepared source assertions only. Execution needs a separately authorized
// container window; these fixtures do not replace the two original workbooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {integrateParameterImport} from '../server/parameter-import.mjs';
import {prepareBusinessImport,bindPreview,commitBinding} from '../server/workbook-workbench.mjs';
import {effectiveParameters,parameterIssues,changeParameter,sourceRole,applyParameters,parameterDayRatio,businessDefinition} from '../server/parameter-contract.mjs';
import {procurement} from '../server/workbook-model.mjs';
import {selectionDataset} from '../server/workbook-selection.mjs';
import {resolvedExportRecords} from '../server/parameter-workbook-export.mjs';

const param=(id,value,extra={})=>({'参数编号':id,'对象编号':'SO001','对象名称':'供货关系','参数名称':'检验天数','参数值':String(value),'单位':'天','生效日':'0','失效日':'44',_cp:'CP074',_scope:'dataset',_sourceRole:'B',_profile:'workbook-day',_formulas:{},...extra});
function base(){return prepareBusinessImport({id:'D',name:'isolated fixture',version:1,fileHash:'B-HASH',tables:{'配置参数':[param('B-PA',1)],'供应商与供货条件':[{'供货关系编号':'SO001','物料编号':'M1','采购导期天数':'3','检验天数':'1','最小订货量':'0','订货倍数':'1'},{'供货关系编号':'SO002','物料编号':'M2','检验天数':'1'}]},bindings:[],mapping:null},null);}
function parsed(records,definitions=[]){return {tables:{'配置参数':records},parameterDefinitions:definitions,parameterCategories:[],parameterAnnotations:{},parameterCounts:{instances:records.length,definitions:definitions.length},classification:[],warnings:[],issues:[],schemaVersion:'fixture'};}
function imported(d,records,extra={}){return integrateParameterImport(parsed(records),d,{id:d.id,name:d.name,expectedVersion:d.version,fileHash:'P-HASH',adoptParameters:true,actor:'fixture',...extra});}
const value=(d,day=0,object='SO001')=>effectiveParameters(d,day).find(p=>p['对象编号']===object)?.['参数值'];

test('DUAL04/07: changed PA still means P precedence, procurement independently expects day7/late2',()=>{
 const {d,issues}=imported(base(),[param('DIFFERENT-PA',2)]);assert.deepEqual(issues,[]);assert.equal(value(d),'2');
 const p=effectiveParameters(d)[0];assert.equal(sourceRole(p),'P');applyParameters(d);
 const result=procurement(1,d.tables['供应商与供货条件'][0],5,2);assert.equal(result.availableDay,7);assert.equal(result.lateDays,2);
 assert.equal(d.tables['配置参数'].find(p=>sourceRole(p)==='B')['参数值'],'1');
});
test('DUAL05/06: reimport B changes uncovered keys while P and business counts survive',()=>{
 const {d}=imported(base(),[param('P-PA',2)]),next=base();next.version=3;next.fileHash='B2';next.tables['配置参数']=[param('B-PA',3),param('B-SECOND',3,{'对象编号':'SO002'})];
 const updated=prepareBusinessImport(next,d);assert.equal(value(updated),'2');assert.equal(value(updated,0,'SO002'),'3');assert.equal(updated.tables['供应商与供货条件'].length,2);
});
test('DUAL08: half-open P interval freezes day9/10/19/20 as 1/2/2/1',()=>{
 const {d,issues}=imported(base(),[param('P-PA',2,{'生效日':'10','失效日':'20'})]);assert.deepEqual(issues,[]);assert.deepEqual([9,10,19,20].map(day=>value(d,day)),['1','2','2','1']);
});
test('DUAL09: same-P overlaps are rejected before replacement; no persisted base mutation',()=>{
 const d=base(),before=JSON.stringify(d),r=imported(d,[param('P1',2),param('P2',3,{'生效日':'10'})]);assert(r.issues.some(i=>i.message.includes('重叠')));assert.equal(JSON.stringify(d),before);
});
test('DUAL15: explicit missing P shadows B and is legal documentation but blocks readiness',()=>{
 const {d,issues}=imported(base(),[param('P-MISSING','',{'资料状态':'pending'})]);assert.deepEqual(issues,[]);assert.equal(sourceRole(effectiveParameters(d)[0]),'P');assert(parameterIssues(d).some(i=>i.code==='PARAMETER_REQUIRED'));
 applyParameters(d);assert.equal(d.tables['供应商与供货条件'][0]['检验天数'],undefined);
});
test('DUAL11: supported but unmapped object is saved as incomplete, invalid numeric still rejected',()=>{
 const r=imported(base(),[param('P-UNMAPPED',2,{'对象编号':'SO-MISSING'})]);assert.deepEqual(r.issues,[]);assert(r.completenessIssues.some(i=>i.code==='PARAMETER_OBJECT_UNMAPPED'));
 assert(imported(base(),[param('P-BAD','not-number')]).issues.length>0);
});
test('DUAL16: online edit is separate, P reimport keeps it unless preview explicitly replaces',()=>{
 const {d}=imported(base(),[param('P-PA',2)]);
 changeParameter(d,{cp:'CP074',objectId:'SO001',field:'检验天数',id:'P-PA',sourceRole:'P',value:'4',unit:'天',from:0,to:44,scope:'dataset',reason:'fixture'},'fixture');
 assert.equal(value(d),'4');assert.equal(d.tables['配置参数'].find(p=>sourceRole(p)==='P')['参数值'],'2');
 assert.equal(value(imported(d,[param('P-PA',2)]).d),'4');assert.equal(value(imported(d,[param('P-PA',2)],{overlayResolution:'replace'}).d),'2');
 const next=base();next.version=3;assert.equal(value(prepareBusinessImport(next,d)),'4');
});
test('DUAL10: P business definition wins; controlled read-only contract remains',()=>{
 const d=base();d.parameterDefinitions=[{'参数编号':'CP018','中文配置项':'P箱件派生定义','权威来源及校验备注':'派生：每箱净重÷每件净重','呈现与编辑模式':'任意脚本'}];
 const c=businessDefinition(d,'CP018');assert.equal(c['中文配置项'],'P箱件派生定义');assert.equal(c.definitionSource,'P');assert.notEqual(c['呈现与编辑模式'],'任意脚本');
});
test('DUAL02: CAL changes actual Sunday numerator/denominator and ratio, not a dummy TM',()=>{
 const d=base();d.tables['工厂日历']=[{'日序':'1','生产班次数':'2','日产能分子':'2','日产能分母':'2'},{'日序':'2','生产班次数':'2','日产能分子':'2','日产能分母':'2'}];
 const r=imported(d,[param('CAL-STANDARD',2,{'对象编号':'CAL','参数名称':'标准日班次数','单位':'班/天',_cp:'CP130'}),param('CAL-SUNDAY',1,{'对象编号':'CAL','参数名称':'周日班次数','单位':'班/天',_cp:'CP131'})]);assert.deepEqual(r.issues,[]);applyParameters(r.d);
 const [sun,mon]=r.d.tables['工厂日历'];assert.equal(sun['生产班次数'],'1');assert.equal(sun['日产能分子'],'1');assert.equal(mon['生产班次数'],'2');assert.equal(parameterDayRatio(r.d,sun,{'标准日班次数':'2','周日班次数':'2'},1),0.5);
});
test('DUAL17: preview binds online choice; a changed choice needs a fresh preview',()=>{
 const p={id:'PREVIEW',datasetId:'D',expectedVersion:1,requestedKind:'parameter',mode:'dataset',scope:'dataset',owner:'actor',fileHash:'P',snapshotHash:'S',changeSet:[],overlayResolution:'keep',parameterThreeWay:[]};bindPreview(p);
 const b={previewFingerprint:p.previewFingerprint,importKind:'parameter',datasetId:'D',mode:'dataset',scope:'dataset',overlayResolution:'replace'};assert.equal(commitBinding(p,b,'actor'),'preview_binding_changed');
 b.overlayResolution='keep';assert.equal(commitBinding(p,b,'actor'),null);
});
test('DUAL08/18: reimportable export resolves intervals, retaining source PA/role',()=>{
 const {d}=imported(base(),[param('P-PA',2,{'生效日':'10','失效日':'20'})]),out=resolvedExportRecords(d.tables['配置参数']);
 assert.deepEqual(out.map(p=>[p['生效日'],p['失效日'],p['参数值'],p['来源层']]),[['0','10','1','B'],['10','20','2','P'],['20','44','1','B']]);assert.equal(new Set(out.map(p=>p['参数编号'])).size,3);assert.equal(out[1]['源PA编号'],'P-PA');
});
test('DUAL12/13: selected dependency closure retains shared WIP/resources and omits unrelated route gaps',()=>{
 const d=base();Object.assign(d.tables,{'每日需求':[{'需求编号':'N1','需求日':'5','成品编号':'FG1'},{'需求编号':'N7','需求日':'5','成品编号':'FG7'}],'物料主数据':['FG1','FG7','SF1','LOCKED'].map(id=>({'物料编号':id,'物料来源':'制造'})),'物料清单':[{'用量关系编号':'B1','父项编号':'FG1','子项编号':'SF1','生效日':'0','失效日':'44'}],'工艺路线':[{'路线工序编号':'R1','成品编号':'FG1','设备组编号':'GROUP','班组编号':'TM','所需工装类型':'TOOL'}],'设备与工装':[{'资源编号':'E1','资源组编号':'GROUP'},{'资源编号':'T1'}],'期初在制':[{'在制批次编号':'W1','成品编号':'LOCKED','占用资源编号':'E1'}]});
 d.mapping={sfRoutes:[],resources:[],feed_mappings:[],tool_pools:{TOOL:['T1']},wip_remaining:[{id:'W1',remaining_labor_pool:'TM',remaining_tool_type:'TOOL',remaining_material_bom_ids:[]}]};
 const selected=selectionDataset(d,{startDay:2,endDay:10,demandIds:['N1']});assert.deepEqual(selected.tables['每日需求'].map(r=>r['需求编号']),['N1']);assert(!selected._selectionClosure.materialIds.includes('FG7'));assert(selected._selectionClosure.materialIds.includes('SF1'));assert(selected._selectionClosure.wipIds.includes('W1'));assert(selected._selectionClosure.resourceIds.includes('T1'));
});
