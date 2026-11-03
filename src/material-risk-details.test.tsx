import test from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {loadRiskCard,RiskCardContent,MaterialRiskDetails} from './MaterialRiskDetails';
const identity={datasetId:'SYN',version:1,runId:'R',fingerprint:'F',dayZero:'2026-10-31'},node={id:'shortage:S',recordId:'shortage:S',kind:'risk' as const,resource:'CORN'},query={view:'E5'};
test('risk card loader preserves bounded request and rejects wrong run, node, section or query identity',async()=>{
 let request:any;const response={identity,queryFingerprint:'Q',node,section:'demands',groups:[]};const api=async(path:string)=>{request=JSON.parse(new URL('http://qa'+path).searchParams.get('request')!);return response;};
 await loadRiskCard(api,identity,query,'Q',node,'demands',100);assert.equal(request.table,'risk-card');assert.equal(request.offset,100);assert.equal(request.id,node.id);
 for(const patch of [{identity:{...identity,runId:'other'}},{queryFingerprint:'other'},{node:{...node,id:'other'}},{node:{...node,resource:'other'}},{section:'overview'}])await assert.rejects(loadRiskCard(async()=>({...response,...patch}),identity,query,'Q',node,'demands',100),/身份不一致/);
});
test('compact floating card has basic and affected-demand tabs, with missing/reference boundaries explicit',()=>{
 const html=renderToStaticMarkup(<MaterialRiskDetails api={async()=>({})} identity={identity} tableIdentity={identity} query={query} fingerprint="Q" node={node} onClose={()=>{}} onDetails={()=>{}} onTask={()=>{}} preferenceScope="SYN"/>);
 for(const text of ['role="dialog"','aria-modal="false"','基本信息','受影响需求','关闭物料风险明细','完整明细与来源'])assert.ok(html.includes(text),text);
 const data={fields:[{label:'预计可用日期',value:null}],analysis:null,groups:[{id:'inventory',title:'原始批次',total:0,note:'原始参考，不是分配结果',records:[]}],relationNote:'未保存明确关联，不按同物料推测'};
 const basic=renderToStaticMarkup(<RiskCardContent data={data} tab="overview" identity={identity} preferenceScope="SYN"/>);assert.ok(basic.includes('未提供'));assert.ok(basic.includes('不是分配结果'));
 const demands=renderToStaticMarkup(<RiskCardContent data={{...data,groups:[{id:'demands',title:'受影响的需求',total:0,records:[]}]}} tab="demands" identity={identity} preferenceScope="SYN"/>);assert.ok(demands.includes('未保存明确关联'));assert.ok(!demands.includes('风险已解除'));
});
