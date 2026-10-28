import {jointParameters} from '../src/lib/joint-resources.mjs';
export function enableJoint(d,id){Object.assign(d.rules.find(r=>r['规则编号']===id),{'是否启用':'是','参数JSON':JSON.stringify(jointParameters)});}
export function claim(id,orderId,operation,resourceId,type='工装',quantity='1',unit='套',before='0',after='0'){
 return {'声明编号':id,'订单编号':orderId,'工序编号':operation,'资源类型':type,'资源编号':resourceId,'需求数量':quantity,'单位':unit,'提前占用分钟':before,'后延占用分钟':after,'占用口径':jointParameters.占用口径};
}
export function jointFixture(seed){
 const d=structuredClone(seed);
 d.tools=[{'工装编码':'G40','工装名称':'模拟工装','适用任务':'MIX|FILL','可用数量':'2','每任务需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','是否启用':'是','说明':'仅配置，不推断占用'}];
 d.orders.push({...d.orders[0],'订单编号':'C','优先顺序':'3'});
 d.dependencies.push(...d.dependencies.filter(x=>x['订单编号']==='A').map(x=>({...x,'订单编号':'C','资源编号':x['资源编号'].replace('01','03')})));
 d.resourceClaims=d.orders.map(o=>claim('TOOL-'+o['订单编号'],o['订单编号'],'MIX','G40'));
 enableJoint(d,'MOLD');return d;
}
