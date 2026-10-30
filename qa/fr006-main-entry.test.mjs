import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './fr027-fixture.mjs';
import {policyFixture} from './dec0203-fixture.mjs';
import {defs} from '../server/planner.ts';
import {validateInputs} from '../server/input-validation.mjs';
const tool={工装编码:'ENTRY-01',工装名称:'首轮测试工装',适用任务:'MIX',可用数量:'2',每任务需求数量:'1',提前占用分钟:'5',后延占用分钟:'10',是否启用:'是',说明:'仅测试',可用起始分钟:'0',可用结束分钟:'600'};
const legacyTemplate=fs.readFileSync('prototypes/fr006-config-only/sample-data/FR-006/18_工装配置.csv','utf8');
// Main product now requires explicit availability; the nine-column prototype remains unchanged.
const template=legacyTemplate.trimEnd().split(/\r?\n/).map((line,i)=>line+(i===0?',可用起始分钟,可用结束分钟':',0,600')).join('\r\n')+'\r\n';
test('root API tooling CRUD versions audit and saved plan input remain immutable',async t=>{
 const f=await fixture(t);let s=await f.ok('/state');const base=await f.ok('/calculate',{revision:s.revision});const old=await f.ok('/plans/'+base.id+'/inputs');
 for(const role of ['planner','supervisor']){s=await f.ok('/state');await f.ok('/inputs',{revision:s.revision,tables:{tools:[{...tool,说明:role}]}},role);}
 let audit=await f.ok('/operations');assert.ok(audit.some(r=>r.target==='tools'&&r.actor==='test#supervisor'&&r.fromVersion&&r.toVersion&&r.reason));
 assert.deepEqual(await f.ok('/plans/'+base.id+'/inputs'),old);
 s=await f.ok('/state');const bytes=f.bytes();
 for(const request of [()=>f.call('/inputs',{revision:s.revision,tables:{tools:[]}},'query'),()=>f.call('/inputs',{revision:s.revision-1,tables:{tools:[]}}),()=>f.call('/inputs',{revision:s.revision,tables:{tools:[]},reason:''})]){assert.ok((await request()).status>=400);assert.equal(f.bytes(),bytes);}
 await f.ok('/inputs',{revision:s.revision,tables:{tools:[]},operation:'delete'});assert.deepEqual((await f.ok('/state')).data.tools,[]);assert.deepEqual(await f.ok('/plans/'+base.id+'/inputs'),old);
});
test('original 18 CSV preview rejects invalid physical line with zero complete business writes',async t=>{
 const f=await fixture(t);await f.ok('/calculate',{revision:0});const before=f.bytes(),s=await f.ok('/state');
 const bad=template.replace('HC40 注塑模具','"HC40\r\n注塑模具"').replace('FILL,3,1,0,5','FILL,0,1,0,5');
 const p=await f.call('/imports/preview',{table:'tools',revision:s.revision,files:[{name:'18_工装配置.csv',text:bad}]});assert.equal(p.status,400);assert.ok(p.body.issues.some(i=>i.row===4&&i.table==='tools'&&i.field==='可用数量'),JSON.stringify(p));assert.equal(f.bytes(),before);assert.ok(!p.body.id);
 const good=await f.ok('/imports/preview',{table:'tools',revision:s.revision,files:[{name:'18_工装配置.csv',text:template}]});assert.equal(f.bytes(),before);assert.equal(good.valid,true);await f.ok('/imports/commit',{previewId:good.id});const saved=await f.ok('/state');assert.equal(saved.data.tools.length,2);
 const exported=await f.ok('/export',{table:'tools'});assert.ok(exported.includes('MOLD-40'));assert.ok(exported.includes('可用起始分钟'));
});
test('tool field and availability errors identify exact file row field',()=>{
 for(const [field,value]of [['工装名称',''],['适用任务',''],['可用数量','0'],['每任务需求数量','Infinity'],['提前占用分钟',' '],['后延占用分钟','-1'],['是否启用','maybe'],['可用结束分钟','']]){const d=policyFixture();d.tools[0][field]=value;const issues=validateInputs(defs,d);assert.ok(issues.some(i=>i.table==='tools'&&i.row===2&&(i.field===field||i.message.includes(field))),JSON.stringify({field,issues}));}
});
