import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {RunPanel} from '../src/RunPanel';
import {DataEditor} from '../src/DataEditor';
import {b16Defs} from '../src/lib/b16-application.mjs';
test('B16 user interface renders explicit capability selection and editable structured profile',()=>{
 const data:any={orders:[{'订单编号':'A','产线编号':'L01','需求类型':'正式订单','订单状态':'有效'}],b16Profiles:[{'配置编号':'MOCK16','配置JSON':JSON.stringify({products:[{productId:'P1',lineIds:['L01','L02']}],selections:[{orderId:'A',mode:'automatic'}]})}],rules:[]};
 const html=renderToStaticMarkup(<RunPanel data={data} runs={[]} canWrite busy={false} onStart={()=>{}} onCancel={()=>{}} onResult={()=>{}} onInputs={async()=>({})}/>);
 assert.match(html,/P0 单线默认/);assert.match(html,/MOCK16/);assert.match(html,/多线配置/);
 const edit=renderToStaticMarkup(<DataEditor data={data} def={b16Defs[0]} rows={data.b16Profiles} revision={1} canWrite busy={false} reason="mock" onSave={async()=>{}}/>);
 assert.match(edit,/产品适用线/);assert.match(edit,/订单选线/);assert.match(edit,/automatic/);assert.match(edit,/保存修改/);
});
