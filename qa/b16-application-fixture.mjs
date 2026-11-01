import {fixture as domain} from './b16-test-fixture.mjs';
import {b16Capability} from '../src/lib/b16-application.mjs';
import {defs} from '../server/planner.ts';
export function applicationFixture(){
 const {data,profile}=domain();
 for(const def of defs)data[def.key]??=[];
 data.factoryLines=data.factoryLines.map(r=>({...r,'工厂名称':'明确可替换MOCK工厂','产线名称':r['产线编号']+'模拟线','时区':'Asia/Shanghai'}));
 data.machines=data.machines.map(r=>({...r,'设备名称':'MOCK '+r['设备编号']}));
 data.personnelGroups=data.personnelGroups.map(r=>({...r,'人员组名称':'MOCK共享灌装班组'}));
 data.orders=data.orders.map((r,i)=>({...r,'需求类型':'正式订单','订单状态':'有效','优先顺序':String(i+1)}));
 data.rules=data.rules.map(r=>({...r,'中文名称':r['规则编号']+'显式模拟规则'}));
 data.products=data.products.map(r=>({...r,'产品名称':'MOCK '+r['产品编号']}));
 data.routes=data.routes.map(r=>({...r,'工序名称':r['工序编号']}));
 data.b16Profiles=[{'配置编号':'MOCK16','配置JSON':JSON.stringify(profile)}];
 data.b16MachineOptions=data.orders.flatMap(o=>profile.products.find(p=>p.productId===o['产品编号']).lineIds.flatMap(line=>data.routes.filter(r=>r['产品编号']===o['产品编号']).map(r=>({'订单编号':o['订单编号'],'工序编号':r['工序编号'],'产线编号':line,'设备编号':data.machines.find(m=>m['产线编号']===line&&m['工序编号']===r['工序编号'])['设备编号']}))));
 const selection={capability:b16Capability,profileId:'MOCK16',startMinute:0,endMinute:600,priority:'优先顺序'};
 for(const def of defs)data[def.key]=data[def.key].map(r=>Object.fromEntries(def.fields.map(f=>[f,r[f]??''])));
 return {data,profile,selection};
}
