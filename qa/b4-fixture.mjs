import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Self-contained software unit input for plain npm test. When B4_INPUTS is set,
// the replay instead reads and hashes the untouched controlled original JSON.
function synthetic(id){
 const orders=(['13','14'].includes(id)?['A','B']:['A']);
 const ops=['MIX','FILL','HEAT','COOL','PACK'];
 const tables={
  '01_fixture':[],
  '07_fixture':[{'产品编号':'HC40','总收率':'0.96','模拟交付等待分钟':'60'}],
  '17_fixture':orders.map((o,i)=>({'订单编号':o,'产品编号':'HC40','产线编号':'L01','合格需求kg':'240','要求可交付分钟':id==='17'?'90':'480','优先顺序':String(i+1)})),
  '10_fixture':ops.map((op,i)=>({'产品编号':'HC40','工序编号':op,'前序工序':ops[i-1]||'','程序编号':op==='HEAT'?'TP-HC40':'','最大等待分钟':op==='COOL'?'10':''})),
  '11_fixture':ops.map((op,i)=>({'产品编号':'HC40','工序编号':op,'计算方式':'固定','固定分钟':String([30,30,120,60,50][i])})),
  '03_fixture':[['HEAT01','HEAT','500','BOM总投入'],['COOL01','COOL','10000','合格产出'],['COOL02','COOL','10000','合格产出']].map(([m,o,max,basis])=>({'设备编号':m,'工序编号':o,'日历编号':'FC01','最小装载kg':'0','最大装载kg':max,'装载计量基准':basis})),
  '02_fixture':[{'日历编号':'FC01','起始分钟':'0','结束分钟':'600','是否工作':'是'}],
  '04_fixture':id==='12'?[{'设备编号':'COOL01','起始分钟':'180','结束分钟':'210'}]:[],
  '12_fixture':orders.flatMap((o,i)=>[{'订单编号':o,'工序编号':'HEAT','资源类型':'设备','资源编号':'HEAT01','需求数量':'1','提前占用分钟':'0','后延占用分钟':'0'},{'订单编号':o,'工序编号':'COOL','资源类型':'设备','资源编号':'COOL0'+(i+1),'需求数量':'1','提前占用分钟':'0','后延占用分钟':'0'},{'订单编号':o,'工序编号':'COOL','资源类型':'空间','资源编号':'COLD','需求数量':'按合格产出kg','提前占用分钟':'0','后延占用分钟':'0'}]),
  '15_fixture':[{'资源编号':'HEAT01','资源类型':'批处理装载','容量':'500','单位':'kg','允许程序':'TP-HC40'},{'资源编号':'COLD','资源类型':'共享冷却空间','容量':id==='14'?'400':'480','单位':'kg'}],
  '09_fixture':[{'产品编号':'HC40','物料编号':'SYNTHETIC-RAW','定额':'1000'}]
 };
 return {id:'UAT-'+id,tables,reference:orders.map((o,i)=>({task_id:o+'-FILL',end:i?90:60}))};
}

// Unit fixture only: keep original files untouched and identify every extra fact.
// In particular, the original BOM has no runtime version/effective date. These
// software facts must be replaced by B3's controlled material-chain admission.
export function b4Fixture(id='13',root=process.env.B4_INPUTS) {
 const file=root?path.join(root,'UAT-'+id,'场景完整输入与参考结果.json'):'self-contained synthetic unit fixture';
 const bytes=root?fs.readFileSync(file):Buffer.from(JSON.stringify(synthetic(id))),raw=JSON.parse(bytes);
 const table=n=>structuredClone(raw.tables[Object.keys(raw.tables).find(k=>k.startsWith(n+'_'))]).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v)])));
 const data=Object.fromEntries([['factoryLines','01'],['products','07'],['orders','17'],['routes','10'],['times','11'],['machines','03'],['calendars','02'],['downtime','04'],['dependencies','12'],['batchResources','15']].map(([k,n])=>[k,table(n)]));
 data.orders=data.orders.map(o=>({...o,'数量单位':'kg'}));
 data.bom=table('09').map(r=>({...r,'版本编号':'B4-SYNTHETIC-BOM-v1','生效日期':'2026-01-01'}));
 data.resourceStops=[];data.resourceClaims=[];
 const productionBatches=data.orders.map(o=>{
  if(o['合格需求kg']!=='240')throw Error('Fixture scope is explicit 240kg output / 250kg input');
  return {id:JSON.stringify([o['订单编号'],1]),orderId:o['订单编号'],unit:'kg',inputKg:{numerator:'250',denominator:'1'},qualifiedKg:{numerator:'240',denominator:'1'}};
 });
 const upstreamTasks=productionBatches.map(b=>{const ref=raw.reference.find(t=>t.task_id===b.orderId+'-FILL');return {id:b.orderId+'-FILL-fixture',orderId:b.orderId,productionBatchId:b.id,operation:'FILL',end:ref.end};});
 return {data,productionBatches,upstreamTasks,startMinute:0,endMinute:600,provenance:{id:raw.id,sha256:createHash('sha256').update(bytes).digest('hex'),file,scope:'unit-level process/cooling; not original import or full UAT',explicitSoftwareFacts:['订单数量单位kg（原17合格需求kg字段）','每订单一个完整生产批，独立算术240/0.96=250；未声称B3物料分配通过','B4-SYNTHETIC-BOM-v1 / 2026-01-01，仅合批兼容身份，非客户版本','上游FILL完成分钟来自原参考方案，只是给定单元前置，不冒充已执行','原加工/冷却工时、程序、设备、容量、最大等待、空间和停机按原JSON；原CSV另存未修改'],integrationDependency:'B3 established production records + shared planner joint staging + full Worker/UI/persistence/export on one combined SHA'}};
}
