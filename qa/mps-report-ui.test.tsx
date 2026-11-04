import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToString} from 'react-dom/server';
import {MpsReport} from '../src/MpsReport';
import {mpsChecked,mpsToggle,mpsValue,mpsUrl,readMpsPage} from '../src/MpsReportTypes';
test('all/none selections preserve hidden exclusions across candidate searches',()=>{
 const selected=mpsToggle({mode:'ALL'},'outside-current-search',false);
 assert.equal(mpsChecked(selected,'outside-current-search'),false);assert.equal(mpsChecked(selected,'another-hidden-option'),true);
 assert.equal(mpsChecked(mpsToggle(selected,'outside-current-search',true),'outside-current-search'),true);
 assert.equal(mpsChecked({mode:'NONE'},'anything'),false);
});
test('Chinese presentation keeps true zero, unknown, uncovered and NA distinct',()=>{
 assert.equal(mpsValue({state:'KNOWN',value:0,reason:''}),'0');
 assert.match(mpsValue({state:'PENDING_REVIEW',value:null,reason:'占用归属未知'}),/待核对.*占用归属未知/);
 assert.match(mpsValue({state:'NOT_COVERED',value:null,reason:'无run'}),/未覆盖/);
 assert.match(mpsValue({state:'NOT_APPLICABLE',value:null,reason:''}),/不适用/);
 assert.ok(mpsUrl('query',{q:'中文 # & ?'}).includes('%'));assert.throws(()=>mpsUrl('query',{q:'x'.repeat(12001)}));
});
test('read-only report shell renders using existing API prop and explicit version',()=>{
 const html=renderToString(<MpsReport api={async()=>{throw Error('SSR must not issue requests');}} context={{datasetId:'DS1',version:9}} canExport={false} onClose={()=>{}}/>);
 assert.match(html,/生产主计划/);assert.match(html,/输入参考/);assert.match(html.replace(/<!--.*?-->/g,''),/v9/);assert.doesNotMatch(html,/自动下单|自动修改库存/);
});
test('logical 500-row page assembles bounded source chunks and rejects a changed identity',async()=>{
 const identity={datasetId:'DS',version:1,dayZero:'2026-10-31',fingerprint:'F'};
 const api=async(url:string)=>{const q=JSON.parse(new URL('https://unit'+url).searchParams.get('request')!);const offset=q.offset??0,n=Math.min(61,503-offset);return {identity,queryFingerprint:'Q',total:503,offset,nextOffset:offset+n<503?offset+n:null,records:Array.from({length:n},(_,i)=>({id:offset+i})),columns:[{key:'id',label:'编号'}]};};
 const page=await readMpsPage(api,'query',{identity,pageSize:500,offset:0});assert.equal(page.records.length,500);assert.equal(page.nextOffset,500);
 await assert.rejects(()=>readMpsPage(async url=>({...await api(url),identity:{...identity,fingerprint:'changed'}}),'query',{identity,pageSize:100}),/身份变化/);
});
