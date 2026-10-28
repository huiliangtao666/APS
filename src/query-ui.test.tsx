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
