import test from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {DemandTaskHoverContent,EquipmentLayerHoverContent} from './DemandTaskHover';import {DemandTaskDetails,TaskFields,TaskChainCards,loadTaskCard} from './DemandTaskDetails';
import {EquipmentLayerDetails,LayerDetailContent} from './EquipmentLayerDetails';
import {loadNodeAnalysis} from './EquipmentNodeAnalysis';
import type {QueryIdentity} from './QueryReportsTypes';
const identity={datasetId:'SYN',version:1,runId:'R',fingerprint:'F',dayZero:'2026-10-31',minuteOrigin:'2026-10-31T00:00:00+08:00'} as QueryIdentity;
const node={id:'T1',kind:'task' as const,resource:'EQ1',recordId:'DE1'},task={id:'T1',label:'热加工',orderId:'DE1',productId:'FG',productName:'鸡肉香肠',quantity:132,start:1440,end:2880,machine:'EQ1',machineName:'热加工机位'};
test('hover shows task, product, quantity, time and equipment with no fabricated progress',()=>{const html=renderToStaticMarkup(<DemandTaskHoverContent task={task} identity={identity}/>);for(const text of ['T1 · 热加工','鸡肉香肠','132 千克','2026.11.01 00:00','2026.11.02 00:00','EQ1','现场进度：未提供'])assert.ok(html.includes(text),text);assert.ok(!html.includes('已完成'));assert.ok(!html.includes('进行中'));});
test('task popup exposes five tabs and chain cards retain explicit predecessor references and batch boundaries',()=>{
 const html=renderToStaticMarkup(<DemandTaskDetails api={async()=>({})} identity={identity} tableIdentity={identity} query={{}} fingerprint="Q" node={node} onClose={()=>{}} onSelect={()=>{}} onTask={()=>{}} onDemand={()=>{}} preferenceScope="SYN"/>);
 for(const tab of ['任务明细','前后工序','资源需求','物料风险','数据来源'])assert.ok(html.includes(tab));assert.equal((html.match(/role="tab"/g)||[]).length,5);
 const fields=renderToStaticMarkup(<TaskFields fields={[{label:'现场进度',value:null},{label:'需求人数',value:0}]}/>);assert.ok(fields.includes('未提供'));assert.ok(fields.includes('>0<'));
 const chain=renderToStaticMarkup(<TaskChainCards selected="T1" records={[{id:'T1',values:{...task,productionId:'B1'}},{id:'T2',values:{...task,productionId:'B2',predecessor:'T1',linkedPredecessor:null}}]} identity={identity} onSelect={()=>{}}/>);assert.ok(chain.includes('生产批次 B1'));assert.ok(chain.includes('生产批次 B2'));assert.ok(chain.includes('未关联到同批任务'));
});
test('task card loader rejects foreign task, demand, resource and stale identity',async()=>{const response={identity,queryFingerprint:'Q',task:{...task},section:'overview'};const load=(r:any)=>loadTaskCard(async()=>r,identity,{},'Q',node,'overview',0);assert.equal((await load(response)).task.id,'T1');for(const change of [{id:'OTHER'},{orderId:'OTHER'},{machine:'OTHER'}])await assert.rejects(load({...response,task:{...task,...change}}),/身份不一致/);await assert.rejects(load({...response,queryFingerprint:'OTHER'}),/身份不一致/);});
test('E1 task loader requests the actual machine while validating the demand identity',async()=>{
 let sent:any;const r=await loadTaskCard(async path=>{sent=JSON.parse(new URL('http://qa'+path).searchParams.get('request')!);return {identity,queryFingerprint:'Q',task,section:'resources'};},identity,{view:'E1'},'Q',node,'resources',0);assert.equal(sent.id,'EQ1');assert.equal(sent.node.recordId,'DE1');assert.equal(r.task.orderId,'DE1');
});
test('WIP and downtime hovers and panes distinguish physical reservations from production tasks',async()=>{
 const layer={id:'WP',kind:'WIP物理保留',productId:'FG',productName:'鸡肉香肠',quantity:200,start:0,end:1440,machine:'EQ1'};
 const hover=renderToStaticMarkup(<EquipmentLayerHoverContent layer={layer} identity={identity}/>);assert.ok(hover.includes('预计合格产出：200 千克'));assert.ok(hover.includes('不代表已完工或已入库'));assert.ok(!hover.includes('已排计划'));
 const stop=renderToStaticMarkup(<EquipmentLayerHoverContent layer={{...layer,id:'STOP',kind:'可知停机'}} identity={identity}/>);assert.ok(stop.includes('设备不可用区间'));assert.ok(!stop.includes('200 千克'));
 const pane=renderToStaticMarkup(<EquipmentLayerDetails api={async()=>({})} identity={identity} query={{view:'E1'}} fingerprint="Q" node={{id:'WP',kind:'wip',resource:'EQ1'}} onClose={()=>{}} onDetails={()=>{}}/>);assert.equal((pane.match(/role="tab"/g)||[]).length,5);assert.ok(pane.includes('保留明细'));
 const empty=renderToStaticMarkup(<LayerDetailContent data={{basis:[]}} tab="chain" kind="stop"/>);assert.ok(empty.includes('没有生产任务的前后工序'));
 const analysis={node:{id:'WP',kind:'wip',resource:'EQ1'}};assert.deepEqual(await loadNodeAnalysis(async()=>({identity,queryFingerprint:'Q',analysis}),identity,{},'Q',analysis.node as any),analysis);
 await assert.rejects(loadNodeAnalysis(async()=>({identity,queryFingerprint:'Q',analysis:{node:{...analysis.node,kind:'stop'}}}),identity,{},'Q',analysis.node as any),/身份不一致/);
});
