// QA-only tooling: install react-test-renderer@18.3.1 in the disposable validation
// copy with --no-save --package-lock=false. No app dependency/lockfile changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {create,act} from 'react-test-renderer';
import {DataEditor} from '../src/DataEditor';
import {DataQueries} from '../src/DataQueries';
import {defs} from '../src/data-defs';
const orderDef=defs.find(d=>d.key==='orders')!;
const orders=[{'订单编号':'A','产品编号':'P','合格需求':'240'}];
const button=(tree:any,label:string)=>tree.root.findAllByType('button').find((b:any)=>b.children.join('')===label)!;
const input=(tree:any,label:string)=>tree.root.findAllByType('input').find((b:any)=>b.props['aria-label']===label)!;
const text=(tree:any)=>JSON.stringify(tree.toJSON());
test('draft editing, copying and cancel never write until explicit save; failures retain draft',async()=>{
 let calls:any[]=[];let reject=false;
 const props={def:orderDef,rows:orders,revision:3,canWrite:true,busy:false,reason:'模拟调整',onSave:async(...args:any[])=>{calls.push(args);if(reject)throw Error('invalid_input');}};
 let tree:any;act(()=>{tree=create(<DataEditor {...props}/>);});
 act(()=>input(tree,'订单与交期 1 合格需求').props.onChange({target:{value:'241'}}));
 assert.equal(calls.length,0);assert.equal(input(tree,'订单与交期 1 合格需求').props.value,'241');
 act(()=>input(tree,'选择第1行').props.onChange({target:{checked:true}}));
 act(()=>button(tree,'复制选中').props.onClick());assert.equal(input(tree,'订单与交期 2 订单编号').props.value,'A');
 act(()=>input(tree,'订单与交期 2 订单编号').props.onChange({target:{value:'B'}}));
 act(()=>button(tree,'取消修改').props.onClick());assert.equal(calls.length,0);assert.equal(input(tree,'订单与交期 1 合格需求').props.value,'240');
 act(()=>button(tree,'新增一行').props.onClick());
 act(()=>input(tree,'订单与交期 2 订单编号').props.onChange({target:{value:'C'}}));
 reject=true;await act(async()=>{await button(tree,'保存修改').props.onClick();});
 assert.equal(calls.length,1);assert.ok(text(tree).includes('invalid_input'));assert.equal(input(tree,'订单与交期 2 订单编号').props.value,'C');
 reject=false;await act(async()=>{await button(tree,'保存修改').props.onClick();});assert.equal(calls.length,2);assert.equal(calls[1][1],3);assert.equal(calls[1][0].orders[1]['订单编号'],'C');
});
test('cross-category drafts save together and retain original revision; stale refresh disables save',async()=>{
 const calls:any[]=[];const props={def:orderDef,rows:orders,revision:5,canWrite:true,busy:false,reason:'reason',onSave:async(...args:any[])=>{calls.push(args);}};
 let tree:any;act(()=>{tree=create(<DataEditor {...props}/>);});
 act(()=>input(tree,'订单与交期 1 合格需求').props.onChange({target:{value:'300'}}));
 const material=defs.find(d=>d.key==='materials')!;
 act(()=>tree.update(<DataEditor {...props} def={material} rows={[]}/>));act(()=>button(tree,'新增一行').props.onClick());
 act(()=>input(tree,'物料主数据 1 物料编号').props.onChange({target:{value:'M'}}));
 await act(async()=>{await button(tree,'保存修改').props.onClick();});
 assert.equal(calls.length,1);assert.equal(calls[0][0].orders[0]['合格需求'],'300');assert.equal(calls[0][0].materials[0]['物料编号'],'M');assert.equal(calls[0][1],5);
 act(()=>tree.update(<DataEditor {...props}/>));act(()=>input(tree,'订单与交期 1 合格需求').props.onChange({target:{value:'301'}}));
 act(()=>tree.update(<DataEditor {...props} revision={6}/>));assert.equal(button(tree,'保存修改').props.disabled,true);assert.ok(text(tree).includes('输入已变化'));
});
test('deletion is staged and query members cannot mutate through editor controls',()=>{
 let tree:any;const props={def:orderDef,rows:orders,revision:1,canWrite:true,busy:false,reason:'reason',onSave:async()=>{throw Error('unexpected save');}};
 act(()=>{tree=create(<DataEditor {...props}/>);});act(()=>input(tree,'选择第1行').props.onChange({target:{checked:true}}));act(()=>button(tree,'删除选中').props.onClick());assert.ok(text(tree).includes('当前表无记录'));
 act(()=>button(tree,'取消修改').props.onClick());assert.equal(input(tree,'订单与交期 1 订单编号').props.value,'A');
 act(()=>tree.update(<DataEditor {...props} canWrite={false}/>));for(const label of ['新增一行','复制选中','删除选中','保存修改'])assert.equal(button(tree,label).props.disabled,true);
});
test('historical query toggle renders and exports old inputs, current toggle restores current rows',()=>{
 const old={...orders[0],'合格需求':'111'};const current={...orders[0],'合格需求':'222'};const calls:any[]=[];
 const plan={id:'p1',name:'模拟方案',revision:0,status:'draft',tasks:[],inputVersionId:'sha',inputSnapshot:{orders:[old]}};
 let tree:any;act(()=>{tree=create(<DataQueries data={{orders:[current]}} plans={[plan]} revision={1} canExport={true} reason="导出" onExport={q=>calls.push(q)} onTask={()=>{}}/>);});
 assert.ok(text(tree).includes('222'));
 const checkbox=tree.root.findAllByType('input').find((n:any)=>n.props.type==='checkbox');act(()=>checkbox.props.onChange({target:{checked:true}}));
 assert.ok(text(tree).includes('111'));assert.ok(!text(tree).includes('222'));
 act(()=>button(tree,'导出筛选结果（1）').props.onClick());assert.equal(calls[0].sourcePlanId,'p1');assert.equal(calls[0].planId,'p1');
 act(()=>checkbox.props.onChange({target:{checked:false}}));assert.ok(text(tree).includes('222'));act(()=>button(tree,'导出筛选结果（1）').props.onClick());assert.equal(calls[1].sourcePlanId,undefined);
});

test('FR017 rule editor stages scope/time/parameters, preserves rejected drafts, and used settings remain historical',async()=>{
 const {RulePanel,UsedRules}=await import('../src/RulePanel');
 const {assessRules}=await import('../src/lib/business-rules.mjs');
 const def=defs.find(d=>d.key==='rules')!;
 const rows=[{'规则编号':'SORT','中文名称':'任务排序','是否启用':'是','参数JSON':'{"排序方式":"优先顺序"}','适用对象':'*','生效时间':''}];
 const calls:any[]=[];let reject=true;let editor:any;
 act(()=>{editor=create(<DataEditor def={def} rows={rows} revision={4} canWrite={true} busy={false} reason="变更排序" onSave={async(...args)=>{calls.push(args);if(reject)throw Error('生效时间无效');}}/>);});
 act(()=>input(editor,'排程规则 1 生效时间').props.onChange({target:{value:'2099-01-01T00:00:00Z'}}));
 act(()=>input(editor,'排程规则 1 参数JSON').props.onChange({target:{value:'{"排序方式":"要求日期"}'}}));
 assert.equal(calls.length,0);await act(async()=>{await button(editor,'保存修改').props.onClick();});
 assert.ok(text(editor).includes('生效时间无效'));assert.equal(input(editor,'排程规则 1 生效时间').props.value,'2099-01-01T00:00:00Z');
 reject=false;await act(async()=>{await button(editor,'保存修改').props.onClick();});
 assert.equal(calls[1][0].rules[0]['参数JSON'],'{"排序方式":"要求日期"}');assert.equal(calls[1][1],4);
 const data={rules:rows};const old=assessRules(data,'2026-10-29T00:00:00Z');
 let used:any;act(()=>{used=create(<UsedRules snapshot={old}/>);});
 const original=text(used);assert.ok(original.includes('优先顺序'));assert.ok(!original.includes('要求日期'));
 rows[0]['参数JSON']='{"排序方式":"要求日期"}';act(()=>used.update(<UsedRules snapshot={old}/>));assert.equal(text(used),original);
 let panel:any;act(()=>{panel=create(<RulePanel data={data} history={[{id:'h',at:'2026-10-29T00:00:00Z',actor:'test#planner',reason:'变更排序',target:'rules',before:[],after:rows}]}/>);});
 assert.ok(text(panel).includes('未支持可配置启用'));assert.ok(text(panel).includes('BR-18'));assert.ok(text(panel).includes('变更排序'));assert.ok(text(panel).includes('test#planner'));
 act(()=>used.update(<UsedRules/>));assert.ok(text(used).includes('无法重建'));
});

import {RunPanel,type Run} from '../src/RunPanel';
test('FR018 run controls select real scope/conditions and inspect immutable history; only active runs cancel',async()=>{
 const data={orders:[{'订单编号':'A','产线编号':'L01','需求类型':'正式订单','订单状态':'有效','优先顺序':'1'},{'订单编号':'B','产线编号':'L01','需求类型':'正式订单','订单状态':'有效','优先顺序':'2'},{'订单编号':'F','需求类型':'预测','订单状态':'有效'}],rules:[{'规则编号':'MACHINE','中文名称':'机器','是否启用':'是'},{'规则编号':'PRECEDENCE','中文名称':'顺序','是否启用':'是'},{'规则编号':'CALENDAR','中文名称':'日历','是否启用':'是'},{'规则编号':'INVENTORY','中文名称':'库存','是否启用':'是'}]};
 const conditions={orderIds:['A'],lineId:'L01',startMinute:60,endMinute:100,priority:'要求日期',enabledRuleIds:['MACHINE','PRECEDENCE','CALENDAR'],timeOrigin:'2026-11-02T08:00:00+08:00'};
 const runs:Run[]=[{id:'live',status:'running',phase:'计算中',createdAt:'now',inputVersionId:'hash',snapshotHash:'snapshot',conditions},{id:'cancelled',status:'cancelled',phase:'cancelled',createdAt:'now',inputVersionId:'old',snapshotHash:'old-snapshot',conditions,failure:{code:'user_cancelled',message:'用户取消'}},{id:'done',status:'partial',phase:'计算完成，有未排',createdAt:'now',inputVersionId:'old',snapshotHash:'old-snapshot',conditions,planId:'p1'}];
 const calls:any[]=[];const props={data,runs,canWrite:true,busy:false,onStart:(s:any)=>calls.push(s),onCancel:(id:string)=>calls.push(id),onResult:(id:string)=>calls.push(id),onInputs:async(id:string)=>({id,originalInput:{orders:[{'数量':'240'}]}})};
 let tree:any;act(()=>{tree=create(<RunPanel {...props}/>);});
 const boxes=tree.root.findAllByType('input').filter((x:any)=>x.props.type==='checkbox');assert.equal(boxes.length,6);assert.equal(boxes[2].props.disabled,true);
 act(()=>boxes[1].props.onChange());act(()=>boxes[5].props.onChange());act(()=>input(tree,'开始分钟').props.onChange({target:{value:'60'}}));act(()=>input(tree,'计划结束分钟').props.onChange({target:{value:'100'}}));
 act(()=>tree.root.findAllByType('select').find((s:any)=>s.props['aria-label']==='任务排序').props.onChange({target:{value:'要求日期'}}));act(()=>button(tree,'另开计算（冻结当前输入）').props.onClick());assert.deepEqual(calls[0],{orderIds:['A'],startMinute:60,endMinute:100,priority:'要求日期',enabledRuleIds:['MACHINE','PRECEDENCE','CALENDAR']});
 const cancelButtons=tree.root.findAllByType('button').filter((b:any)=>b.children.join('')==='取消运行');assert.deepEqual(cancelButtons.map((b:any)=>b.props.disabled),[false,true,true]);act(()=>cancelButtons[0].props.onClick());assert.equal(calls[1],'live');act(()=>button(tree,'查看结果').props.onClick());assert.equal(calls[2],'p1');
 await act(async()=>{button(tree,'查看本次原始输入、实际规则与条件').props.onClick();});assert.ok(text(tree).includes('240'));assert.ok(text(tree).includes('用户取消'));assert.ok(text(tree).includes('不估算百分比'));
 act(()=>tree.update(<RunPanel {...props} canWrite={false}/>));assert.equal(button(tree,'另开计算（冻结当前输入）').props.disabled,true);assert.equal(button(tree,'取消运行').props.disabled,true);tree.unmount();
});
test('FR018 failed snapshot query is visible without replacing the selected conditions',async()=>{
 let tree:any;const props={data:{orders:[],rules:[]},runs:[{id:'r',status:'failed',phase:'failed',createdAt:'now',inputVersionId:'x',snapshotHash:'y',conditions:{orderIds:['A'],lineId:'L01',startMinute:0,endMinute:600,priority:'规则设置',enabledRuleIds:[],timeOrigin:'fixed'},failure:{code:'worker_error',message:'计算线程失败'}}],canWrite:false,busy:false,onStart:()=>{},onCancel:()=>{},onResult:()=>{},onInputs:async()=>{throw Error('historical_inputs_unavailable');}};
 act(()=>{tree=create(<RunPanel {...props}/>);});await act(async()=>{button(tree,'查看本次原始输入、实际规则与条件').props.onClick();});assert.ok(text(tree).includes('无法读取完整的原始输入'));assert.ok(text(tree).includes('计算线程失败'));tree.unmount();
});

test('FR019 mode is explicit in selection, historical scope stays visible and does not follow current controls',async()=>{
 const {schedulingScope}=await import('../src/lib/scheduling-scope.mjs');const calls:any[]=[];
 const conditions={mode:'minimal-r1',checkScope:schedulingScope('minimal-r1'),orderIds:['A'],lineId:'L01',startMinute:0,endMinute:600,priority:'规则设置',enabledRuleIds:['MACHINE','PRECEDENCE','CALENDAR'],timeOrigin:'fixed'};
 const data={orders:[{'订单编号':'A','产线编号':'L01','需求类型':'正式订单','订单状态':'有效'}],rules:['MACHINE','PRECEDENCE','CALENDAR'].map(id=>({'规则编号':id,'中文名称':id,'是否启用':'是'}))};
 let tree:any;act(()=>{tree=create(<RunPanel data={data} runs={[{id:'old',status:'completed',phase:'完成',createdAt:'now',inputVersionId:'h',snapshotHash:'s',conditions}]} canWrite={true} busy={false} onStart={s=>calls.push(s)} onCancel={()=>{}} onResult={()=>{}} onInputs={async()=>({})}/>);});
 const mode=tree.root.findAllByType('select').find((s:any)=>s.props['aria-label']==='计算模式');assert.equal(mode.props.value,'supported');
 act(()=>mode.props.onChange({target:{value:'minimal-r1'}}));act(()=>button(tree,'另开计算（冻结当前输入）').props.onClick());assert.equal(calls[0].mode,'minimal-r1');assert.ok(calls[0].enabledRuleIds.includes('CALENDAR'));
 act(()=>mode.props.onChange({target:{value:'supported'}}));assert.ok(text(tree).includes('R1 最小模式'));for(const word of ['日历与停机','人员','模具与工装','物料','不代表完整业务'])assert.ok(text(tree).includes(word));tree.unmount();
});

test('FR020 material panel shows saved quantities/conditional lots/shortages and links task without relabelling unchecked plans',async()=>{
 const {MaterialPanel}=await import('../src/MaterialPanel');const {materialFixture}=await import('./material-fixture.mjs');const {seed,calculate}=await import('../server/planner.ts');
 const d=materialFixture(seed);d.inventory[0]['账面数量']='400';d.inventory[0]['已占用数量']='100';const p=calculate(d,0,'2026-10-29T00:00:00Z'),calls:string[]=[];let tree:any;
 act(()=>{tree=create(<MaterialPanel plan={p} onTask={id=>calls.push(id)}/>);});for(const value of ['325','25','LEAN-LOT','未排候选','未占用','建议采购','仅形成建议'])assert.ok(text(tree).includes(value),value);
 act(()=>tree.root.findAllByType('tr')[1].props.onClick());assert.equal(calls[0],'A-MIX');
 act(()=>tree.update(<MaterialPanel plan={{materialChecked:false,materialDemands:[]}} onTask={()=>{}}/>));assert.ok(text(tree).includes('物料未检查'));assert.ok(!text(tree).includes('325'));tree.unmount();
});

import {BatchPanel} from '../src/BatchPanel';
test('FR021 saved batch display shows original quantities, blocked tails, unchecked mode and selects production tasks',()=>{
 let ids:string[]=[];let tree:any;
 const p={batchChecked:true,productionBatches:[{id:'P1',orderId:'A',index:1,quantity:240,load:250,unit:'kg',qualifiedKg:{numerator:'240',denominator:'1'},inputKg:{numerator:'250',denominator:'1'}}],resourceBatches:[{id:'RB1',members:['P1'],loadKg:250,minimum:280,maximum:300,basis:'BOM总投入',status:'blocked-under-min'}],tasks:[{id:'T1',productionBatchId:'P1'}]};
 act(()=>{tree=create(<BatchPanel plan={p} onTask={v=>ids=v}/>);});assert.match(text(tree),/240/);assert.match(text(tree),/低于下限/);assert.match(text(tree),/不自动超产/);assert.match(text(tree),/最大等待按本次支持模式核对，超限列具体缺口/);
 act(()=>tree.root.findAllByType('tr')[1].props.onClick());assert.deepEqual(ids,['T1']);act(()=>tree.update(<BatchPanel plan={{tasks:[]}} onTask={v=>ids=v}/>));assert.match(text(tree),/程序未检查/);
});
