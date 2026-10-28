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
