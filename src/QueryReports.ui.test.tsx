import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryColumns,QueryMultiselect,QueryTable} from './QueryReportsControls';
import {queryInitial,queryUrl,queryValue,sameQueryIdentity,type QueryCatalog,type QueryIdentity} from './QueryReportsTypes';

const identity:QueryIdentity={datasetId:'synthetic',version:1,fingerprint:'fixed',dayZero:'2026-10-31',minuteOrigin:'2026-11-02T08:00:00+08:00'};
const api=async()=>{throw Error('Static rendering must not request a product API');};
test('calendar presentation preserves old minute origin and 17-minute endpoints without half-hour rounding',()=>{
  assert.equal(queryValue(1,{key:'date',label:'日期',format:'date'},identity),'2026.11.01');
  assert.equal(queryValue(14,{key:'date',label:'日期',format:'date'},identity),'2026.11.14');
  assert.equal(queryValue(-1,{key:'date',label:'日期',format:'date'},identity),'2026.10.30');
  const minute={key:'start',label:'开始',format:'instant' as const,timeUnit:'minute' as const};
  assert.equal(queryValue(7,minute,identity),'2026.11.02 08:07');
  assert.equal(queryValue(24,minute,identity),'2026.11.02 08:24');
  assert.equal(queryValue(0,{key:'duration',label:'时长',format:'duration'},identity),'0');
  assert.equal(queryValue(undefined,minute,identity),'— 未提供');
});
test('initial/reset options are bounded ALL, BOM disabled, default100 and metadata dates, not hardcoded all-project dates',()=>{
  const catalog={identity,preferenceScope:'synthetic-actor',views:[],fromDate:'2030-02-01',toDateInclusive:'2030-02-14'} as QueryCatalog;
  const d=queryInitial(catalog);
  assert.deepEqual(d.filters,{});assert.equal(d.includeBom,false);assert.equal(d.pageSize,100);assert.equal(d.fromDate,'2030-02-01');assert.equal(d.toDateInclusive,'2030-02-14');
  const html=renderToStaticMarkup(<QueryMultiselect api={api} identity={identity} view="bom" field="fg" label="成品" value={{mode:'ALL'}} onChange={()=>{}}/>);
  for(const s of ['全部','全选搜索结果','清空（0项）','恢复不限','编号 / 名称','搜索保留隐藏选择'])assert.ok(html.includes(s),s);
  assert.ok(!html.includes('发送意见'));assert.ok(!html.includes('FG001'));
});
test('business keys remain fixed and source strings are escaped; a read-only detail has no dead navigation',()=>{
  const columns=[{key:'id',label:'业务键',fixed:true},{key:'name',label:'名称'}];
  const settings=renderToStaticMarkup(<QueryColumns columns={columns} value={['id','name']} onChange={()=>{}}/>);
  assert.match(settings,/disabled=""/);assert.ok(settings.includes('业务键固定'));
  const html=renderToStaticMarkup(<QueryTable id="test:detail" columns={columns} records={[{id:'M1',values:{id:'M1',name:'<script>unsafe</script>'}}]}/>);
  assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));assert.ok(!html.includes('<script>unsafe'));
  assert.ok(!html.includes('class="qr-link"'));
});
test('wire identity rejects version/hash drift and encoded query includes full filters, not only visible page IDs',()=>{
  assert.equal(sameQueryIdentity(identity,{...identity,version:2}),false);
  assert.equal(sameQueryIdentity(identity,{...identity,minuteOrigin:'other'}),false);
  const url=queryUrl('query',{identity,view:'demand',pageSize:500,filters:{fg:{mode:'ALL'}}});
  const payload=JSON.parse(new URL('https://synthetic.invalid'+url).searchParams.get('request')!);
  assert.equal(payload.pageSize,500);assert.deepEqual(payload.filters.fg,{mode:'ALL'});assert.equal(payload.identity.fingerprint,'fixed');
});

import {readQueryPage,QueryBomPreview} from './QueryReports';
test('logical UI page assembles bounded chunks with one identity and rejects changed fingerprints',async()=>{
 const calls:any[]=[];const api=async(path:string)=>{const q=JSON.parse(new URL('https://synthetic.invalid'+path).searchParams.get('request')!);calls.push(q);const n=q.chunkOffset;return {identity,view:'bom.materials',queryFingerprint:'Q',total:205,offset:n,nextOffset:n+60<205?n+60:null,records:Array.from({length:Math.min(60,205-n)},(_,i)=>({id:String(i+n),values:{id:i+n}})),columns:[]};};
 const request={identity,view:'bom.materials',offset:0,pageSize:100};const page=await readQueryPage(api,request);assert.equal(page.records.length,100);assert.equal(page.nextOffset,100);assert.equal(calls.length,2);assert.equal(calls[1].queryFingerprint,'Q');
 await assert.rejects(readQueryPage(async()=>({identity:{...identity,version:2}}),request),/身份变化/);
});

test('BOM graph and lead timeline render only actual queried values and retain fractional duration',()=>{
 const base={identity,view:'bom.paths',queryFingerprint:'Q',total:1,offset:0,nextOffset:null,columns:[],records:[{id:'path1',values:{root:'M1',materialId:'C1',sequence:1,ownLeadDays:0.5,cumulativeLeadDays:1.25,illustrativeStartDate:'2026-11-01',illustrativeEndDate:'2026-11-02'}}]};
 const html=renderToStaticMarkup(<QueryBomPreview view="bom.paths" page={base} identity={identity} onOpen={()=>{}}/>);assert.ok(html.includes('0.5天'));assert.ok(html.includes('结束偏移1.25天'));assert.ok(html.includes('非实际开工'));
 const edge=renderToStaticMarkup(<QueryBomPreview view="bom.relations" page={{...base,records:[{id:'edge',values:{父项编号:'M1',子项编号:'C1'}}]}} identity={identity} onOpen={()=>{}}/>);assert.ok(edge.includes('M1'));assert.ok(edge.includes('C1'));assert.ok(edge.includes('有向关系图'));
});
