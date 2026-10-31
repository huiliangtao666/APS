import test from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {findingSource,ResourceFindingSource} from '../src/ResourceFindingSource';
const row={'人员组编号':'LP01','人员数量':'2'};
const view={run:{inputVersionId:'frozen-v1'},snapshot:{originalInput:{personnelGroups:[row,row],tools:[{id:'TOOL'}]}},plan:{inputCsvSources:{personnelGroups:{file:'19.csv',sha256:'frozen-csv',canonicalRows:[row,row],records:[{line:4},{line:8}]}}}};
test('object occurrences preserve precise frozen physical row and render as a source link',()=>{
 const source=findingSource({table:'personnelGroups',row:{...row},occurrence:{index:1}},view);
 assert.match(source.position,/19.csv 原文件第 8 行/);assert.equal(source.sourceSha256,'frozen-csv');
 const html=renderToStaticMarkup(<ResourceFindingSource source={source} onLocate={()=>{}}/>);assert.match(html,/定位冻结来源/);assert.match(html,/LP01/);
});
test('scalar rows resolve through frozen CSV; absent and ambiguous records never invent physical positions',()=>{
 assert.match(findingSource({table:'personnelGroups',row:2},view).position,/第 4 行/);
 assert.match(findingSource({table:'tools',row:{id:'TOOL'}},view).position,/规范化记录第 2 行/);
 for(const ref of [null,{}, {table:'personnelGroups',row},{table:'personnelGroups',row:{bad:'unknown'},occurrence:{index:0}},{table:'personnelGroups',row:2,origin:{inputVersionId:'current-v2'}}]){
  const source=findingSource(ref,view);assert.equal(source.sourceSha256,null);assert.ok(!source.position.includes('原文件第'));assert.doesNotThrow(()=>renderToStaticMarkup(<ResourceFindingSource source={source} onLocate={()=>{}}/>));
 }
});
test('mismatching canonical records and absent source maps retain diagnostic records safely',()=>{
 const changed=structuredClone(view);changed.plan.inputCsvSources.personnelGroups.canonicalRows[1]={'人员组编号':'OTHER','人员数量':'2'};
 const source=findingSource({table:'personnelGroups',row,occurrence:{index:1}},changed);assert.equal(source.sourceSha256,null);assert.match(source.position,/规范化记录第 3 行/);
});
