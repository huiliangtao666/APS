import {materialFixture} from './material-fixture.mjs';
import {batchParameters} from '../src/lib/production-batches.mjs';
export function batchFixture(seed){
 const d=materialFixture(seed);d.bom=d.bom.filter(b=>b['用量类型']==='BOM物料');
 d.orders[0]['是否允许拆分']='是';
 d.routes.forEach(r=>r['程序编号']='PROGRAM-'+r['工序编号']);
 Object.assign(d.rules.find(r=>r['规则编号']==='CAPACITY'),{'是否启用':'是','参数JSON':JSON.stringify(batchParameters)});
 Object.assign(d.rules.find(r=>r['规则编号']==='PROGRAM'),{'是否启用':'是','参数JSON':JSON.stringify({兼容条件:batchParameters.合批条件})});
 d.batchResources=d.machines.map(m=>({'资源编号':m['设备编号'],'资源类型':'批处理装载','容量':m['最大装载kg'],'单位':'kg','允许程序':'PROGRAM-'+m['工序编号'],'说明':'显式测试批处理配置，非业务默认'}));
 return d;
}
