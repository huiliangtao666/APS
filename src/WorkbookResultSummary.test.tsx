import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildResultSummary,filterResultGroups,resultGroupsForScope,type ResultRecordScope} from './WorkbookResultSummaryModel';
import {WorkbookResultSummary,ResultAnalysisDialog} from './WorkbookResultSummary';
import {WorkbookResult} from './InputData';
import {equipmentFilterFields,SuggestionDraftAction} from './EquipmentSchedule';
import {WorkbookRuleDetails} from './WorkbookFindingExplanation';
import {explainFinding} from './lib/workbook-explanations.mjs';

const demand=(id:string,status='unplanned',extra={})=>({id,productId:'FG-'+id,status,quantity:20,unit:'千克',arrivalDay:status==='scheduled'?4:null,latestArrivalDay:3,lateDays:status==='scheduled'?1:null,source:{sheet:'每日需求',row:2},...extra});
const makeRun=(result={})=>({id:'SYNTHETIC-RESULT-ONLY',datasetId:'SYNTHETIC',version:6,status:'partial',inputHash:'fixture',result:{dayZero:'2026-10-31',timeUnit:'day',conditions:{startDay:1,endDay:15},tasks:[],demandResults:[demand('D1'),demand('D2','scheduled')],findings:[],shortages:[],verification:{status:'pass',scope:['测试范围'],notChecked:['未覆盖项目'],issues:[]},...result}});
const renderDialog=(run:any,scope:ResultRecordScope='all')=>renderToStaticMarkup(<ResultAnalysisDialog run={run} model={buildResultSummary(run)} initialScope={scope} onClose={()=>{}} onLocate={()=>{}}/>);
test('all findings are grouped without truncating counts or treating process events as final unplanned demands',()=>{
 const findings=Array.from({length:155},(_,i)=>({code:'MAX_WAIT',need:i%2?'D1':'D2',message:'等待超过上限',sheet:'工艺路线',row:i+2,field:'最大等待天数'}));
 const run=makeRun({findings}),before=JSON.stringify(run),model=buildResultSummary(run),group=model.groups.find(g=>g.id==='FINDING:MAX_WAIT')!;
 assert.equal(model.findingCount,155);assert.equal(group.entries.length,155);assert.equal(group.affected,2);assert.equal(model.unplanned,1);assert.equal(model.late,1);assert.equal(group.kind,'计算记录');assert.equal(group.entries[154].source,findings[154]);assert.equal(group.entries[0].demand.status,'scheduled');assert.equal(JSON.stringify(run),before);
 const html=renderDialog(run,'findings');
 assert.equal((html.match(/工序间等待超过上限/g)||[]).length,1);assert.ok(html.includes('155 条记录 / 2 条需求'));assert.ok(html.includes('1–20 / 155 条'));assert.ok(html.includes('下一页'));assert.ok(html.includes('计算问题记录 · 155 条'));assert.ok(html.includes('未覆盖项目'));
});
test('final outcomes, late days and verification are independent of a pass on limited checks',()=>{
 const model=buildResultSummary(makeRun());assert.equal(model.headline,'部分需求未排');assert.equal(model.checkFailed,false);assert.equal(model.groups.find(g=>g.id==='LATE')?.entries[0].detail,'预计到货 2026-11-04；最晚 2026-11-03；迟交 1 天');
 const failed=buildResultSummary(makeRun({verification:{status:'pass',issues:['独立核对冲突']}}));assert.equal(failed.checkFailed,true);assert.equal(failed.headline,'结果独立检查存在问题');assert.equal(failed.groups.find(g=>g.id==='VERIFY')?.kind,'检查问题');
});
test('missing checks, unknown outcomes and no records never imply all checks passed',()=>{
 const run=makeRun({demandResults:[],verification:undefined}),html=renderToStaticMarkup(<WorkbookResultSummary run={run} onLocate={()=>{}}/>);
 assert.ok(html.includes('独立检查未检查'));assert.ok(renderDialog(run).includes('本运行未保存检查范围'));assert.ok(html.includes('未记录需求结果'));assert.ok(!html.includes('所选需求已排'));
 assert.equal(buildResultSummary(makeRun({demandResults:[demand('X','unknown')]})).headline,'需求状态待核对');
});
test('quantities remain separate by unit and missing quantities are explicit',()=>{
 const run=makeRun({demandResults:[demand('A','scheduled',{quantity:0,unit:'千克'}),demand('B','unplanned',{quantity:3,unit:'个'}),demand('C','unplanned',{quantity:null,unit:'套'})]});
 assert.deepEqual(buildResultSummary(run).quantities.map(q=>[q.unit,q.total,q.unknown]),[['千克',0,0],['个',3,0],['套',0,1]]);
 const html=renderToStaticMarkup(<WorkbookResultSummary run={run} onLocate={()=>{}}/>);assert.ok(html.includes('0 / 0 / 0 千克'));assert.ok(html.includes('3 / 0 / 3 个'));assert.ok(html.includes('数量未提供'));assert.ok(!html.includes('0 / 0 / 0 套'));
});
test('WIP and unrecognized codes retain records without inventing affected demand or capacity values',()=>{
 const finding={code:'FUTURE_RULE',need:'WIP-UNKNOWN',message:'新类型原始说明',sheet:'期初在制',row:99};
 const model=buildResultSummary(makeRun({findings:[finding],shortages:[{need:'WIP-UNKNOWN',materialId:'M1',quantity:2,unit:'个',needDay:2}]}));
 const unknown=model.groups.find(g=>g.id.startsWith('FINDING:'))!;assert.equal(unknown.category,'other');assert.equal(unknown.affected,0);assert.equal(unknown.entries[0].source,finding);assert.ok(unknown.logic.includes('不作推算'));
 assert.equal(model.groups.find(g=>g.id==='SHORTAGE')?.entries[0].detail,'M1 · 缺 2 个 · 需料 2026-11-02');
});
test('main result section shows only metrics and underlined detail entries, with analysis in a dialog',()=>{
 const run=makeRun({findings:[{code:'MAX_WAIT',message:'测试记录',need:'D1',sheet:'工艺路线',row:9}]});
 const html=renderToStaticMarkup(<WorkbookResultSummary run={run} onLocate={()=>{}} actions={<button>重新检查</button>}/>),dialog=renderDialog(run);
 for(const text of ['排程结果汇总','result-metric-link','aria-haspopup="dialog"','错误 1 条，查看明细','提醒 2 条，查看明细','重新检查'])assert.ok(html.includes(text),text);
 for(const text of ['问题分类','result-groups','工序间等待超过上限','role="dialog"','计算口径、检查范围与来源'])assert.ok(!html.includes(text),text);
 for(const text of ['role="dialog"','计算口径、检查范围与来源','工序间等待超过上限','定位来源：工艺路线','原记录未保存的候选实际等待时长','维护业务数据或配置后创建新运行'])assert.ok(dialog.includes(text),text);
});
test('search links demand and material matches to source records while keeping category and type filters effective',()=>{
 const groups=buildResultSummary(makeRun({findings:['D1','D2'].map(need=>({code:'MAX_WAIT',need,message:'等待超限'}))})).groups;
 const matches=filterResultGroups(groups,'resource','计算记录',' fg-d2 ');assert.equal(matches.length,1);assert.equal(matches[0].entries.length,1);assert.equal(matches[0].entries[0].need,'D2');assert.equal(matches[0].affected,1);
 assert.equal(filterResultGroups(groups,'material','计算记录','D2').length,0);assert.equal(filterResultGroups(groups,'resource','结果异常','D2').length,0);assert.equal(filterResultGroups(groups,'resource','计算记录','等待')[0]?.entries.length,2);
});
test('frozen result page shows the unified summary before six views and removes the repeated problem button list',()=>{
 const run={...makeRun({source:{datasetId:'SYNTHETIC',version:6},allocations:[],suggestions:[],findings:[{code:'MAX_WAIT',message:'候选撤销',need:'D1'}]}),selection:{startDay:1,endDay:15}};
 const html=renderToStaticMarkup(<WorkbookResult run={run} canWrite={false} canExport={false} api={async()=>{throw Error('must not fetch while rendering');}} perform={()=>{}} onRun={()=>{}} onLocate={()=>{}} onDraft={()=>{}} onExport={()=>{}}/>);
 assert.ok(html.indexOf('排程结果汇总')<html.indexOf('设备排程六视图'));assert.ok(!html.includes('class="input-problem"'));assert.ok(!html.includes('<details open'));for(const label of ['任务与日占用','需求状态与交付','缺料与供应来源','采购参考建议（预览'])assert.ok(!html.includes(label));assert.ok(html.includes('设备甘特'));assert.ok(html.includes('需求交付'));assert.ok(html.includes('物料风险'));
});

test('suggestion action remains explicit and respects write permission and missing handler',()=>{
 const suggestion={id:'SYNTHETIC-SUGGESTION'};
 const render=(canWrite:boolean,onDraft?:()=>void)=>renderToStaticMarkup(<SuggestionDraftAction suggestion={suggestion} canWrite={canWrite} onDraft={onDraft}/>);
 assert.ok(render(false,()=>{}).includes('disabled'));assert.ok(render(true).includes('disabled'));assert.ok(!render(true,()=>{}).includes('disabled'));assert.ok(render(true,()=>{}).includes('复制为模拟草稿'));assert.ok(render(true,()=>{}).includes('需显式纳入新试算'));
});

test('DE620 historical rule is readable in both summary and detail without invented numerical evidence',()=>{
 const finding={need:'DE620',code:'MATERIAL_AT_ACTUAL_FEED',message:'原分配供给在投料时不适用'},run=makeRun({findings:[finding],demandResults:[demand('DE620')]});
 const summary=renderDialog(run,'findings'),detail=renderToStaticMarkup(<WorkbookRuleDetails explanations={[explainFinding(finding,run.result)]}/>);
 for(const html of [summary,detail])for(const text of ['处理规则','结果处理','完善位置','证据说明','不自动重选其他供给批次','历史记录未保存具体候选时点'])assert.ok(html.includes(text));
 assert.ok(detail.includes('到期边界不含'));assert.ok(!detail.includes('<table'));assert.ok(!detail.includes('判定：投料时已到期'));
});
test('new rejected supply evidence renders dates and verdict rather than raw JSON',()=>{
 const e=explainFinding({code:'MATERIAL_AT_ACTUAL_FEED',need:'D1',evidence:{kind:'material-at-feed',timeUnit:'minute',supplyId:'inventory:TEST',quantity:10,unit:'千克',actualFeed:1927,ready:1440,expiry:1927}},{dayZero:'2026-10-31'});
 const html=renderToStaticMarkup(<WorkbookRuleDetails explanations={[e]}/>);assert.ok(html.includes('2026-11-01 08:07'));assert.ok(html.includes('判定：投料时已到期'));assert.ok(html.includes('供给批次：inventory:TEST'));assert.ok(!html.includes('&quot;kind&quot;'));
});
test('metric counts and scoped records stay consistent: 17 findings, 8 shortages, 12 outcomes, 37 total',()=>{
 const demands=Array.from({length:12},(_,i)=>demand('D'+i,i<3?'scheduled':'unplanned'));
 const findings=Array.from({length:17},(_,i)=>({code:i<10?'MAX_WAIT':'FUTURE_RULE',need:i<15?'D'+(i%12):'WIP-X',message:'计算记录'+i,sheet:'工艺路线',row:i+2}));
 const shortages=Array.from({length:8},(_,i)=>({need:'D'+i,materialId:'M'+i,quantity:i,unit:i%2?'千克':'个',needDay:1}));
 const run=makeRun({demandResults:demands,findings,shortages}),before=JSON.stringify(run),model=buildResultSummary(run);
 const count=(scope:ResultRecordScope)=>resultGroupsForScope(model.groups,scope).reduce((n,g)=>n+g.entries.length,0);
 assert.equal(count('findings'),model.findingCount);assert.equal(count('findings'),17);assert.equal(count('shortages'),model.shortageCount);assert.equal(count('shortages'),8);assert.equal(count('outcomes'),12);assert.equal(count('verification'),0);assert.equal(count('all'),37);
 const problemHtml=renderDialog(run,'findings'),shortageHtml=renderDialog(run,'shortages');
 assert.ok(problemHtml.includes('data-record-total="17"'));assert.ok(!problemHtml.includes('最终未排需求'));assert.ok(!problemHtml.includes('排程时记录的缺料'));assert.ok(problemHtml.includes('WIP-X'));
 assert.ok(shortageHtml.includes('data-record-total="8"'));assert.ok(shortageHtml.includes('排程时记录的缺料'));assert.ok(!shortageHtml.includes('工序间等待超过上限'));
 const filtered=filterResultGroups(resultGroupsForScope(model.groups,'findings'),'resource','计算记录','D0');assert.equal(filtered.reduce((n,g)=>n+g.entries.length,0),1);
 assert.equal(JSON.stringify(run),before);
});

test('error and reminder metrics partition records without treating every process finding as an error',()=>{
 const run=makeRun({findings:[{code:'MAX_WAIT',need:'D1',message:'过程记录'},{code:'FUTURE_RULE',need:'WIP-X',severity:'error',message:'显式错误'}],shortages:[{need:'D1',materialId:'M',quantity:3,unit:'个',needDay:1}],verification:{status:'problem',issues:['核对失败']}}),before=JSON.stringify(run),model=buildResultSummary(run);
 assert.equal(model.errorCount,3);assert.equal(model.warningCount,3);
 for(const [scope,count] of [['errors',model.errorCount],['warnings',model.warningCount]] as const){const groups=resultGroupsForScope(model.groups,scope);assert.equal(groups.reduce((n,g)=>n+g.entries.length,0),count);const html=renderDialog(run,scope);assert.ok(html.includes('data-record-total="'+count+'"'));assert.ok(groups.every(g=>g.entries.every(e=>e.level===(scope==='errors'?'error':'warning'))));}
 assert.equal(model.errorCount+model.warningCount,resultGroupsForScope(model.groups,'all').reduce((n,g)=>n+g.entries.length,0));
 const main=renderToStaticMarkup(<WorkbookResultSummary run={run} onLocate={()=>{}}/>);assert.ok(main.includes('错误 3 条'));assert.ok(main.includes('提醒 3 条'));assert.equal(JSON.stringify(run),before);
 const empty=buildResultSummary(makeRun({demandResults:[],findings:[],shortages:[],verification:undefined}));assert.equal(empty.errorCount,0);assert.equal(empty.warningCount,0);
});

test('six view filters expose only relevant fields and remove the repeated visible heading',()=>{
 assert.deepEqual(equipmentFilterFields('E1').map(f=>f[0]),['machine','group']);
 assert.deepEqual(equipmentFilterFields('E2').map(f=>f[0]),['productId','orderId','status']);
 assert.deepEqual(equipmentFilterFields('E3').map(f=>f[0]),['machine','group']);
 assert.deepEqual(equipmentFilterFields('E4'),[]);
 assert.deepEqual(equipmentFilterFields('E5').map(f=>f[0]),['productId','orderId']);
 assert.deepEqual(equipmentFilterFields('E6').map(f=>f[0]),['machine','status']);
 const run={...makeRun({source:{datasetId:'SYNTHETIC',version:6},allocations:[],suggestions:[]}),selection:{startDay:1,endDay:15}};
 const html=renderToStaticMarkup(<WorkbookResult run={run} canWrite={false} canExport={false} api={async()=>{throw Error('static fixture');}}/>);
 assert.ok(!html.includes('设备排程 · 六视图'));assert.ok(!html.includes('>总览 <select'));assert.ok(html.includes('equipment-focus-toggle'));
});
