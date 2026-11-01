import {defs,seed} from '../server/planner.ts';
import {p1InitialStrategies} from '../src/lib/p1-topics-contract.mjs';
export function topicFixture(){
 const data=structuredClone(seed);
 for(const d of defs)data[d.key]??=[];
 data.factoryLines=[{'工厂编号':'F01','工厂名称':'可替换模拟工厂','产线编号':'L01','产线名称':'模拟单线','时区':'Asia/Shanghai'}];
 // Same replaceable native single-line seed, with an explicitly separate forecast.
 const order=structuredClone(data.orders[0]);
 Object.assign(order,{'订单编号':'MOCK:P1:F1','需求类型':'预测','合格需求':'24','已完成合格数量':'0'});
 data.orders.push(order);
 data.dependencies.push(...data.dependencies.filter(d=>d['订单编号']===data.orders[0]['订单编号']).map(d=>({...d,'订单编号':order['订单编号']})));
 data.p1Profiles=[{'配置编号':'MOCK:P1','配置版本':'mock-v1','来源说明':'可替换小样例，非现场事实','策略JSON':JSON.stringify(p1InitialStrategies)}];
 data.p1DemandSources=[{'订单编号':order['订单编号'],'配置编号':'MOCK:P1','来源编号':'MOCK:forecast-01','来源版本':'source-v1','来源说明':'用户手填独立模拟，未与订单关联冲减'}];
 for(const def of defs)data[def.key]=data[def.key].map(r=>Object.fromEntries(def.fields.map(f=>[f,r[f]??''])));
 return {data,selection:{p1ProfileId:'MOCK:P1',mode:'supported',orderIds:[order['订单编号']],startMinute:0,endMinute:600}};
}
