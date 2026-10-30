import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {DataQueries} from './DataQueries';
import {defs} from './data-defs';
const data:Record<string,Record<string,string>[]>=Object.fromEntries(defs.map(d=>[d.key,[]]));
data.orders=[{'订单编号':'订单甲','产品编号':'产品甲','订单状态':'正式订单'}];
const props={data,plans:[],revision:2,canExport:false,reason:'',onExport:()=>{},onTask:()=>{}};
test('Chinese query controls expose all supported categories, read-only rows, empty plan and disabled export without permission',()=>{
 const html=renderToStaticMarkup(<DataQueries {...props}/>);
 for(const def of defs)assert.ok(html.includes(def.label),def.label);
 assert.ok(html.includes('方案任务'));assert.ok(html.includes('查询产品'));assert.ok(html.includes('查询订单'));assert.ok(html.includes('查询状态'));assert.ok(html.includes('查询日期字段'));
 assert.ok(html.includes('订单甲'));assert.ok(html.includes('未选择方案'));assert.match(html,/disabled="">导出筛选结果/);
 assert.ok(!html.includes('contenteditable'));assert.ok(!html.includes('新增一行'));
});
test('task detail renders saved times, current input warning, related inputs, findings and Gantt action without raw JSON',()=>{
 const plan={id:'plan',revision:1,status:'draft',name:'测试方案',tasks:[{id:'T',orderId:'订单甲',productId:'产品甲',operation:'OP',machine:'M',start:15,end:30,duration:15,source:'<script>bad</script>'}],findings:[{code:'SIM',message:'模拟问题',taskIds:['T']}]};
 const html=renderToStaticMarkup(<DataQueries {...props} plans={[plan]} initialPlan="plan" initialTask="T"/>);
 for(const text of ['记录详情','开始分钟','15','结束分钟','30','订单与交期','输入已变化','模拟问题','定位方案甘特与问题','当前数据'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('<script>bad</script>'));assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
});
test('task list with no saved plan explains missing data without fabricated task or success',()=>{
 const html=renderToStaticMarkup(<DataQueries {...props} initialTask="missing"/>);
 assert.ok(html.includes('没有匹配记录'));assert.ok(html.includes('不代表下游能力已经完成'));assert.ok(!html.includes('记录详情'));
});

test('FR015 editor exposes explicit staged add/copy/delete/save/cancel and read-only role disables mutation controls',async()=>{
 const {DataEditor}=await import('./DataEditor');
 const def=defs.find(d=>d.key==='orders')!;
 for(const canWrite of [true,false]){
  const html=renderToStaticMarkup(<DataEditor def={def} rows={data.orders} revision={2} canWrite={canWrite} busy={false} reason="" onSave={async()=>{throw Error('render must never save');}}/>);
  for(const text of ['新增一行','复制选中','删除选中','保存修改','取消修改','全部草稿一起保存','质量状态均为模拟状态'])assert.ok(html.includes(text),text);
  assert.match(html,/disabled="">保存修改/);
  if(!canWrite){assert.match(html,/disabled="">新增一行/);assert.match(html,/disabled="" aria-label="订单与交期 1 订单编号"/);}
 }
});
test('FR015 legacy plans explain unavailable inputs; new plans expose original input review and authorized restore',()=>{
 const old={id:'old',revision:1,name:'旧方案',tasks:[]};
 let html=renderToStaticMarkup(<DataQueries {...props} plans={[old]}/>);
 assert.ok(html.includes('无法恢复'));assert.ok(!html.includes('恢复该方案输入为新版本'));
 const p={...old,inputSnapshot:data,inputVersionId:'trusted-sha'};
 html=renderToStaticMarkup(<DataQueries {...props} plans={[p]} onRestore={()=>{}}/>);
 assert.ok(html.includes('查看所选方案计算时的输入'));assert.match(html,/disabled="">恢复该方案输入为新版本/);
 html=renderToStaticMarkup(<DataQueries {...props} plans={[p]} reason="模拟恢复"/>);
 assert.ok(!html.includes('恢复该方案输入为新版本'));
});
