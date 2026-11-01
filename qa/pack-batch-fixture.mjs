import {r4Scenario,at} from './r4-fixture.mjs';
export {at};
export function packScenario(boundary='同订单合并'){
 const d=r4Scenario('12');d.downtime=[];
 d.orders[0]['合格需求']='242.4';d.orders[0]['是否允许拆分']='是';
 // Two equal source production identities: 121.2kg each, 126.25kg input.
 for(const m of d.machines){if(m['工序编号']==='MIX')m['最大装载kg']='200';m['最小装载kg']=m['工序编号']==='HEAT'?'400':'0';m['不足批处理']='允许实际量';}
 for(const dep of d.dependencies.filter(r=>r['资源类型']==='空间'))dep['需求数量']='121.2';
 for(const c of d.resourceClaims)c['需求数量']='121.2';
 Object.assign(d.times.find(t=>t['工序编号']==='PACK'),{'计算方式':'包装速率','固定分钟':'','包装工时':'1','工时时间单位':'小时','包装速率':'242.4','速率时间单位':'小时','包装数量单位':'kg','包装时长模式':'按目标数量','包装作业边界':boundary,'配置版本':'1','数据性质':'显式可替换mock'});
 d.bom.find(b=>b['用量类型']==='包装物料')['最小包装单位']='10';
 return d;
}
