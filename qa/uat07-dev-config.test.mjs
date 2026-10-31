import test from 'node:test';
import assert from 'node:assert/strict';
import {toolMappingDraft} from '../src/lib/tool-mapping-draft.mjs';
import {validateResourceMappings,resourceMappingTransition} from '../src/lib/resource-mapping.mjs';
import {configFixture} from './fr013-config-fixture.mjs';

test('bound tool edits require explicit simulation for capacity changes and preserve saved records',()=>{
 const saved=configFixture('tool'),before=JSON.stringify(saved),draft=structuredClone(saved);
 draft.tools[0]['可用数量']='2';
 assert.throws(()=>toolMappingDraft(draft,saved),/模拟/);
 const {tables}=toolMappingDraft(draft,saved,{simulation:true});
 const after={...draft,...tables};
 assert.deepEqual(validateResourceMappings(after),[]);
 assert.deepEqual(resourceMappingTransition(saved,after),[]);
 assert.equal(after.originalTools[0]['可用数量'],'2');
 assert.equal(after.resourceMappings[0]['配置版本'],'2');
 assert.match(after.resourceMappings[0]['配置依据'],/可替换模拟配置/);
 assert.equal(JSON.stringify(saved),before);
 assert.throws(()=>toolMappingDraft(after,after),/没有需要更新/);
});

test('window edits refresh runtime snapshot without fabricating source; version reuse is rejected',()=>{
 const saved=configFixture('tool'),draft=structuredClone(saved);
 const afterMinutes=String(Number(draft.tools[0]['后延占用分钟'])+10);
 draft.tools[0]['后延占用分钟']=afterMinutes;
 const {tables}=toolMappingDraft(draft,saved),after={...draft,...tables};
 assert.deepEqual(after.originalTools,saved.originalTools);
 assert.equal(JSON.parse(after.resourceMappings[0]['运行记录JSON'])['后延占用分钟'],afterMinutes);
 assert.deepEqual(validateResourceMappings(after),[]);
 after.resourceMappings[0]['配置版本']='1';
 assert.equal(resourceMappingTransition(saved,after).length,1);
});
