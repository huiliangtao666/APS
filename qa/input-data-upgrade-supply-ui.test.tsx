import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {WorkbookDrafts} from '../src/WorkbookDrafts';
const record={id:'DRAFT',materialId:'RAW',unit:'千克',quantity:100,relationId:'SUP',orderDay:2,availableDay:6,expiryDay:10,netGap:100,status:'adopted'};
const text=(x:any):string=>Array.isArray(x)?x.map(text).join(''):x&&typeof x==='object'?text(x.props?.children):String(x??'');
function nodes(x:any):any[]{if(Array.isArray(x))return x.flatMap(nodes);return x&&typeof x==='object'?[x,...nodes(x.props?.children)]:[];}
const button=(tree:any,label:string)=>nodes(tree).find(n=>n.type==='button'&&text(n.props.children)===label);
function setup(extra:any={}){const calls:any[]=[],edits:any[]=[];let saved=0;const props={drafts:[record],draftEdit:null,canWrite:true,datasetId:'SET',version:7,currentDay:1,api:async(path:string,body:object)=>{calls.push({path,body});return {};},perform:(fn:any)=>fn(),onEdit:(d:any)=>edits.push(d),onSaved:async()=>{saved++;},...extra};return {props,calls,edits,saved:()=>saved,tree:()=>WorkbookDrafts(props)};}
test('actual draft view renders business states and preserves existing editing and disables duplicate transitions',()=>{
 for(const [status,label]of [['draft','模拟草稿（未采用）'],['adopted','已纳入本次试算'],['void','作废']]){const f=setup({drafts:[{...record,status}]}),tree=f.tree(),markup=renderToStaticMarkup(tree);assert.ok(markup.includes(label));assert.equal(button(tree,'纳入试算').props.disabled,status==='adopted');assert.equal(button(tree,'维护草稿').props.disabled,false);assert.ok(markup.includes('没有向供应商外发'));}
});
test('actual edit/cancel handlers preserve original values and whitelist versioned save payload',async()=>{
 const f=setup(),before=JSON.stringify(record);button(f.tree(),'维护草稿').props.onClick();assert.deepEqual(f.edits[0],record);assert.notEqual(f.edits[0],record);
 f.props.draftEdit={...record};let tree=f.tree();const field=nodes(tree).find(n=>n.type==='input'&&n.props['aria-label']==='草稿-数量');field.props.onChange({target:{value:'120'}});assert.equal(f.edits.at(-1).quantity,'120');assert.equal(JSON.stringify(record),before);
 f.props.draftEdit=f.edits.at(-1);tree=f.tree();assert.ok(text(tree).includes('需再次显式纳入'));await button(tree,'保存草稿').props.onClick();assert.deepEqual(f.calls,[{path:'/workbooks/datasets/SET/draft',body:{expectedVersion:7,id:'DRAFT',changes:{quantity:'120',relationId:'SUP',orderDay:2,expiryDay:10},currentDay:1}}]);assert.equal(f.edits.at(-1),undefined);assert.equal(f.saved(),1);
 const cancel=setup({draftEdit:{...record,quantity:120}});button(cancel.tree(),'取消').props.onClick();assert.equal(cancel.calls.length,0);assert.equal(cancel.edits.at(-1),undefined);assert.equal(JSON.stringify(record),before);
});
test('failed save keeps editor values, explicit adopt and void call existing versioned API only',async()=>{
 const failed=setup({draftEdit:{...record,quantity:121},api:async()=>{throw Error('version_conflict');}});await assert.rejects(button(failed.tree(),'保存草稿').props.onClick(),/version_conflict/);assert.equal(failed.edits.length,0);assert.equal(failed.saved(),0);assert.equal(failed.props.draftEdit.quantity,121);
 const f=setup({drafts:[{...record,status:'draft'}]});await button(f.tree(),'纳入试算').props.onClick();await button(f.tree(),'作废').props.onClick();assert.deepEqual(f.calls.map(c=>c.body),[{expectedVersion:7,id:'DRAFT',action:'adopt',currentDay:1},{expectedVersion:7,id:'DRAFT',action:'void'}]);
});
test('read-only role disables save/maintenance/adopt/void controls',()=>{
 const f=setup({canWrite:false,draftEdit:{...record},drafts:[{...record,status:'draft'}]}),tree=f.tree();for(const label of ['维护草稿','纳入试算','作废','保存草稿'])assert.equal(button(tree,label).props.disabled,true,label);
});
