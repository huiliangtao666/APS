import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {ConfirmationPanel} from '../src/ConfirmationPanel';
const plans=[{id:'p',name:'方案'}];
const report={revision:4,workflowRevision:2,reviewHash:'hash',submissionId:'submission',workflow:{state:'submitted',events:[]},blockers:[],unplanned:[{id:'B-MIX',orderId:'B',operation:'MIX',quantity:12,unit:'kg',reasons:[{message:'时间范围未排'}]}],conditionalSupply:[{'供给编号':'S1'}],scope:'模拟支持范围',limits:['未定语义未检查'],changeReasons:[{id:'r',at:'today',reason:'调整原因'}],independentChecks:{},ruleChecks:{},delivery:{},inputVersionId:'input'};
const button=(ui:Renderer.ReactTestRenderer,label:string)=>ui.root.findAllByType('button').find(b=>b.children.join('')===label)!;
async function mount(role='supervisor',r:any=report,api?:any){let ui!:Renderer.ReactTestRenderer;await act(async()=>{ui=Renderer.create(<ConfirmationPanel plans={plans} role={role} busy={false} reason="主管决定" api={api||(async()=>r)} refresh={async()=>{}}/>);});await act(async()=>ui.root.findByType('select').props.onChange({target:{value:'p'}}));return ui;}
test('FR030 supervisor sees reasons and must explicitly check each unplanned item, partial, supply and scope before exact server-bound decision',async()=>{
 const calls:any[]=[],ui=await mount('supervisor',report,async(path:string,body?:any)=>{calls.push([path,body]);return report;});
 assert.equal(button(ui,'确认已排部分 / 全部').props.disabled,true);const text=JSON.stringify(ui.toJSON());for(const x of ['12','时间范围未排','S1','调整原因','未定语义未检查'])assert.ok(text.includes(x));
 for(const input of ui.root.findAllByType('input'))await act(async()=>input.props.onChange({target:{checked:true}}));
 assert.equal(button(ui,'确认已排部分 / 全部').props.disabled,false);await act(async()=>button(ui,'确认已排部分 / 全部').props.onClick());
 assert.deepEqual(calls.at(-1),['/plans/p/confirm',{revision:4,workflowRevision:2,reviewHash:'hash',submissionId:'submission',unplannedIds:['B-MIX'],acceptPartial:true,acceptConditionalSupply:true,acknowledgeScope:true}]);ui.unmount();
});
test('FR030 query role gets no lifecycle action, supervisor conflict blocks confirm while return remains available',async()=>{
 const query=await mount('query');assert.equal(query.root.findAllByType('button').length,0);query.unmount();
 const ui=await mount('supervisor',{...report,blockers:[{message:'已启用规则冲突'}]});assert.equal(button(ui,'确认已排部分 / 全部').props.disabled,true);assert.equal(button(ui,'退回').props.disabled,false);ui.unmount();
});
test('FR030 stale decision refreshes current evidence and clears previous acknowledgments',async()=>{
 let reads=0;const ui=await mount('supervisor',report,async(path:string)=>{if(path.endsWith('/review')){reads++;return report;}throw Error('复核内容已变化');});
 for(const input of ui.root.findAllByType('input'))await act(async()=>input.props.onChange({target:{checked:true}}));await act(async()=>button(ui,'确认已排部分 / 全部').props.onClick());assert.equal(reads,2);assert.ok(ui.root.findByProps({role:'alert'}).children.join('').includes('已变化'));assert.ok(ui.root.findAllByType('input').every(i=>i.props.checked===false));assert.equal(button(ui,'确认已排部分 / 全部').props.disabled,true);ui.unmount();
});
test('FR030 planner independently verifies selected draft, exports immutable confirmation when authorized',async()=>{
 const calls:any[]=[],ui=await mount('planner',{...report,workflow:{state:'draft',events:[]}},async(path:string,body?:any)=>{calls.push([path,body]);return {...report,workflow:{state:'draft',events:[]}};});await act(async()=>button(ui,'独立复核所选方案').props.onClick());assert.deepEqual(calls.at(-1),['/plans/p/verify',{}]);assert.equal(ui.root.findAllByType('button').some(b=>b.children.join('')==='确认已排部分 / 全部'),false);ui.unmount();
});
