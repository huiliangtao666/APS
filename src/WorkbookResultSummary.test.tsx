import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildResultSummary,filterResultGroups} from './WorkbookResultSummaryModel';
import {WorkbookResultSummary} from './WorkbookResultSummary';
import {WorkbookResult} from './InputData';
import {SuggestionDraftAction} from './EquipmentSchedule';

const demand=(id:string,status='unplanned',extra={})=>({id,productId:'FG-'+id,status,quantity:20,unit:'千克',arrivalDay:status==='scheduled'?4:null,latestArrivalDay:3,lateDays:status==='scheduled'?1:null,source:{sheet:'每日需求',row:2},...extra});
const makeRun=(result={})=>({id:'SYNTHETIC-RESULT-ONLY',datasetId:'SYNTHETIC',version:6,status:'partial',inputHash:'fixture',result:{dayZero:'2026-10-31',timeUnit:'day',conditions:{startDay:1,endDay:15},tasks:[],demandResults:[demand('D1'),demand('D2','scheduled')],findings:[],shortages:[],verification:{status:'pass',scope:['测试范围'],notChecked:['未覆盖项目'],issues:[]},...result}});
test('all findings are grouped without truncating counts or treating process events as final unplanned demands',()=>{
 const findings=Array.from({length:155},(_,i)=>({code:'MAX_WAIT',need:i%2?'D1':'D2',message:'等待超过上限',sheet:'工艺路线',row:i+2,field:'最大等待天数'}));
 const run=makeRun({findings}),before=JSON.stringify(run),model=buildResultSummary(run),group=model.groups.find(g=>g.id==='FINDING:MAX_WAIT')!;
 assert.equal(model.findingCount,155);assert.equal(group.entries.length,155);assert.equal(group.affected,2);assert.equal(model.unplanned,1);assert.equal(model.late,1);assert.equal(group.kind,'计算记录');assert.equal(group.entries[154].source,findings[154]);assert.equal(group.entries[0].demand.status,'scheduled');assert.equal(JSON.stringify(run),before);
 const html=renderToStaticMarkup(<WorkbookResultSummary run={run} onLocate={()=>{}}/>);
 assert.equal((html.match(/工序间等待超过上限/g)||[]).length,1);assert.ok(html.includes('155 条记录 / 2 条需求'));assert.ok(html.includes('1–20 / 155 条'));assert.ok(html.includes('下一页'));assert.ok(html.includes('2026-11-01 至 2026-11-14'));assert.ok(html.includes('未覆盖项目'));
});
test('final outcomes, late days and verification are independent of a pass on limited checks',()=>{
 const model=buildResultSummary(makeRun());assert.equal(model.headline,'部分需求未排');assert.equal(model.checkFailed,false);assert.equal(model.groups.find(g=>g.id==='LATE')?.entries[0].detail,'预计到货 2026-11-04；最晚 2026-11-03；迟交 1 天');
 const failed=buildResultSummary(makeRun({verification:{status:'pass',issues:['独立核对冲突']}}));assert.equal(failed.checkFailed,true);assert.equal(failed.headline,'结果独立检查存在问题');assert.equal(failed.groups.find(g=>g.id==='VERIFY')?.kind,'检查问题');
});
test('missing checks, unknown outcomes and no records never imply all checks passed',()=>{
 const run=makeRun({demandResults:[],verification:undefined}),html=renderToStaticMarkup(<WorkbookResultSummary run={run} onLocate={()=>{}}/>);
 assert.ok(html.includes('独立检查未检查'));assert.ok(html.includes('本运行未保存检查范围'));assert.ok(html.includes('未记录需求结果'));assert.ok(!html.includes('所选需求已排'));
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
test('summary puts overall outcome and explanations ahead of grouped source records',()=>{
 const html=renderToStaticMarkup(<WorkbookResultSummary run={makeRun({findings:[{code:'MAX_WAIT',message:'测试记录',need:'D1',sheet:'工艺路线',row:9}]})} onLocate={()=>{}} actions={<button>重新检查</button>}/>);
 assert.ok(html.indexOf('排程结果汇总')<html.indexOf('问题分类'));assert.ok(html.indexOf('计算口径、检查范围与冻结来源')<html.indexOf('工序间等待超过上限'));assert.ok(html.includes('定位来源：工艺路线'));assert.ok(html.includes('原记录未保存的候选实际等待时长'));assert.ok(html.includes('维护业务数据或配置后创建新运行'));assert.ok(html.includes('重新检查'));
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
