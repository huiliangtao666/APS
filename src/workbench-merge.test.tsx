import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import App from './App';
import {QueryReports,QueryBomPreview,editableQuerySources} from './QueryReports';
import {QueryTable} from './QueryReportsControls';
const api=async()=>{throw Error('Static rendering must not call any API');};
test('active app exposes only four consolidated workbench pages and no independent legacy data source',()=>{
 const html=renderToStaticMarkup(<App/>);
 for(const name of ['排程流程','业务数据查询与维护','配置参数查询与维护','排程结果与六视图'])assert.ok(html.includes('>'+name+'</button>'),name);
 for(const name of ['>工装配置</button>','>业务数据</button>','>五类业务查询</button>','标准投入作用范围','原生CSV与输入维护','原生报表','兼容历史模式'])assert.ok(!html.includes(name),name);
});
test('maintenance targets require real editable source keys and deduplicate repeated references',()=>{
 const record={id:'sum',values:{quantity:100},refs:[{table:'每日需求',key:'DE1'},{table:'每日需求',key:'DE1'},{table:'每日成品汇总',key:'R1'},{table:'配置参数',key:'PA1'},{table:'每日需求',key:''}]};
 assert.deepEqual(editableQuerySources(record,['每日需求']),[{table:'每日需求',key:'DE1'}]);
 assert.deepEqual(editableQuerySources({id:'reference',values:{id:'DE1'}},['每日需求']),[]);
});
test('historical query disables raw maintenance entry while current query exposes the same entry',()=>{
 const props={api,context:{datasetId:'SYN',version:1},canExport:false,onClose:()=>{},onManageData:()=>{}};
 assert.match(renderToStaticMarkup(<QueryReports {...props}/>),/>原始数据维护<\/button>/);
 const old=renderToStaticMarkup(<QueryReports {...props} context={{...props.context,runId:'FROZEN'}}/>);
 assert.match(old,/<button disabled="" title="历史运行只读/);
});
test('read-only tables have no write column; current-source action is rendered only when supplied',()=>{
 const props={id:'SYN',columns:[{key:'id',label:'编号',fixed:true}],records:[{id:'DE1',values:{id:'DE1'}}]};
 assert.ok(!renderToStaticMarkup(<QueryTable {...props}/>).includes('<th>维护</th>'));
 assert.ok(renderToStaticMarkup(<QueryTable {...props} rowActions={()=> <button>维护来源</button>}/>).includes('<th>维护</th>'));
});
test('BOM diagram defaults to all current-page roots, retains shared/disconnected nodes and discloses pagination',()=>{
 const identity={datasetId:'SYN',version:1,fingerprint:'Q',dayZero:'2026-10-31'};
 const records=[['FG001','SF001'],['FG002','SF001'],['SF001','RM001'],['FG003','PK001']].map(([parent,child],i)=>({id:'B'+i,values:{父项编号:parent,子项编号:child}}));
 const html=renderToStaticMarkup(<QueryBomPreview view="bom.relations" identity={identity} page={{identity,view:'bom.relations',queryFingerprint:'Q',total:10,offset:0,nextOffset:4,columns:[],records}} onOpen={()=>{}}/>);
 assert.match(html,/<option value="" selected="">全选（3 个根项）/);
 for(const id of ['FG001','FG002','FG003','SF001','RM001','PK001'])assert.ok(html.includes('aria-label="'+id+'，查看关联记录"'),id);
 assert.equal((html.match(/class="qr-bom-edge"/g)||[]).length,4);
 assert.ok(html.includes('图示仅含本页，其余请翻页查看'));
});
test('compact lead-time diagram preserves fractional durations and reference meaning',()=>{
 const identity={datasetId:'SYN',version:1,fingerprint:'Q',dayZero:'2026-10-31'};
 const record={id:'P1',values:{root:'FG001',materialId:'SF001',sequence:1,ownLeadDays:0.5,cumulativeLeadDays:1.25}};
 const html=renderToStaticMarkup(<QueryBomPreview view="bom.paths" identity={identity} page={{identity,view:'bom.paths',queryFingerprint:'Q',total:1,offset:0,nextOffset:null,columns:[],records:[record]}} onOpen={()=>{}}/>);
 assert.ok(html.includes('0.5天'));assert.ok(html.includes('结束偏移1.25天'));assert.ok(html.includes('非实际开工'));
});
