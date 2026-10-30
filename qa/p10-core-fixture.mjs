import {p08Fixture} from './p08-fixture.mjs';
export function pool(id='P',capacity='2'){return {poolId:id,'池名称':'显式合成池'+id,'总人数':capacity,'是否启用':'是','允许共用':'是','容量来源':'P10合成验收输入，非现场默认值','适用范围':'*','生效时间':'','交接设置':'','策略版本':'P10-explicit-v2','策略来源':'显式合成测试策略，非现场默认','互斥粒度':'无互斥','交接模式':'不设交接限制','交接起始分钟':'','交接结束分钟':'','交接容量人数':'','占用策略':'依赖声明','释放策略':'半开端点释放'};}
export function p10Fixture(capacity='2'){
 const d=p08Fixture(2);d.personnelPools=[pool('P',capacity)];
 d.personnelGroups=['A','B'].map(id=>({...d.personnelGroups[0],'人员组编号':id,'人员组名称':'资格组'+id,poolId:'P'}));
 d.dependencies.filter(r=>r['资源类型']==='人员技能').forEach((r,i)=>r['资源编号']=i?'B':'A');return d;
}
