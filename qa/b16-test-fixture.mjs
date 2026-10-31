import {claim} from './joint-fixture.mjs';
import {sharingContract} from '../src/lib/b16-sharing.mjs';
export const at='2026-11-02T08:00:00+08:00';
// Explicit replaceable normalized MOCK. Derived lean demand =240/.96*.65.
// This is not the original 19 CSV bundle or a production default.
export function fixture(){
 const data={orders:[],products:[],materials:[],machines:[],routes:[],times:[],factoryLines:[],inventory:[],supplies:[],supplyDelays:[],supplyUses:[],bom:[],rules:[],tools:[],personnelGroups:[],personnelPools:[],dependencies:[],resourceClaims:[],batchResources:[],skillSubstitutions:[],calendars:[],downtime:[],resourceStops:[],simulationEvents:[],executionFacts:[],executionMaterials:[]};
 data.factoryLines=['L01','L02'].map(id=>({'产线编号':id,'工厂编号':'F01'}));
 data.products=['P1','P2'].map(id=>({'产品编号':id,'单支净重kg':'0.04','每袋支数':'10','总收率':'0.96','模拟交付等待分钟':'0'}));
 data.materials=[{'物料编号':'LEAN','物料名称':'MOCK lean','单位':'kg','类别':'原料'},{'物料编号':'OTHER','物料名称':'MOCK other','单位':'kg','类别':'原料'}];
 data.orders=['A','B'].map((id,i)=>({'订单编号':id,'产品编号':'P'+(i+1),'产线编号':'L0'+(i+1),'合格需求':'240','已完成合格数量':'0','数量单位':'kg','要求可交付分钟':'300','是否允许拆分':'否'}));
 for(const [i,id]of ['A','B'].entries())for(const operation of ['MIX','FILL']){
  const product='P'+(i+1),machine=operation+(i+1);
  data.machines.push({'设备编号':machine,'产线编号':'L0'+(i+1),'工序编号':operation,'日历编号':'FC01','最小装载kg':'0','最大装载kg':'1000','装载计量基准':'BOM总投入'});
  data.routes.push({'产品编号':product,'工序编号':operation,'前序工序':operation==='FILL'?'MIX':'','最大等待分钟':''});
  data.times.push({'产品编号':product,'工序编号':operation,'计算方式':'固定','固定分钟':'30'});
  data.dependencies.push({'订单编号':id,'工序编号':operation,'资源类型':'设备','资源编号':machine,'需求数量':'1'});
  if(operation==='FILL'){
   data.dependencies.push({'订单编号':id,'工序编号':operation,'资源类型':'人员技能','资源编号':'LP01','需求数量':'1','所需技能':'FILL','所需班次':'DAY','人员开始偏移':'0','人员结束偏移':'0','窗口外释放':'否'});
   data.resourceClaims.push(claim(id+'-G',id,operation,'G01'));
  }
 }
 data.bom=data.products.flatMap(p=>[['LEAN','650'],['OTHER','350']].map(([id,qty])=>({'版本编号':'V1','产品编号':p['产品编号'],'生效日期':'2026-01-01','投料工序编号':'MIX','用量类型':'BOM物料','物料编号':id,'配置用量':qty,'用量单位':'kg','用量基准':'每1000kg投入','损坏比例':'0','收率/损耗口径备注':''})));
 data.inventory=[['LEAN','162.5'],['OTHER','1000']].map(([id,qty])=>({'批次编号':id+'-LOT','物料编号':id,'账面数量':qty,'已占用数量':'0','有效期':'2026-12-31','质量状态':'合格','位置':'MOCK','预计可用时间':''}));
 data.supplies=[{'供给编号':'S90','物料编号':'LEAN','批次编号':'LEAN-FUTURE','预计数量':'162.5','预计到达时间':'2026-11-02T09:30:00+08:00','预计可用时间':'2026-11-02T09:30:00+08:00','质量状态':'预计可用','有效期':'2026-12-31','单位':'kg'}];
 data.supplyUses=[{'引用编号':'B-S90','订单编号':'B','工序编号':'MIX','供给编号':'S90','使用数量':'162.5'}];
 data.calendars=[{'日历编号':'FC01','工厂编号':'F01','起始分钟':'0','结束分钟':'600','是否工作':'是'}];
 data.tools=[{'工装编码':'G01','可用数量':'1','每任务需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','可用起始分钟':'0','可用结束分钟':'600','是否启用':'是','适用任务':'FILL'}];
 data.personnelGroups=[{'人员组编号':'LP01','人员数量':'1','技能':'FILL','班次':'DAY','可用起始分钟':'0','可用结束分钟':'600'}];
 const enabled=['MACHINE','PRECEDENCE','CALENDAR','MATERIAL','MOLD','LABOR'];
 data.rules=enabled.map(id=>({'规则编号':id,'是否启用':'是','参数JSON':id==='MATERIAL'?JSON.stringify({'允许预计供给':true,'可用状态':['合格'],'预计状态':['预计可用']}):'{}'}));
 const profile={contract:sharingContract,version:'mock16-v1',source:'v0.3 UAT16 + explicit replaceable normalized domain MOCK',mock:true,lines:[{id:'L01',factoryId:'F01'},{id:'L02',factoryId:'F01'}],products:[{productId:'P1',lineIds:['L01','L02']},{productId:'P2',lineIds:['L02']}],resources:[{type:'工装',resourceId:'G01',factoryId:'F01',lineIds:['L01','L02'],allowCrossLine:true,capacity:'1',unit:'套'},{type:'人员',resourceId:'LP01',factoryId:'F01',lineIds:['L01','L02'],allowCrossLine:true,capacity:'1',unit:'人'}],materials:data.materials.map(m=>({materialId:m['物料编号'],factoryId:'F01',lineIds:['L01','L02']})),selections:[{orderId:'A',mode:'automatic'},{orderId:'B',mode:'specified',lineId:'L02'}]};
 const conditions={mode:'supported',ruleEvaluationAt:at,enabledRuleIds:enabled,jointConditionsContract:'FR022-joint-v1',workingWindowsContract:'P06-windows-v1',resourcePolicyVersion:'MOCK16-v1'};
 const plan={id:'MOCK16',tasks:[],resourceReservations:[],materialDemands:[],rules:enabled,jointConditionsContract:conditions.jointConditionsContract,workingWindowsContract:conditions.workingWindowsContract,resourcePolicyContract:'CR-DEC02-03-v1'};
 for(const [i,o]of data.orders.entries())for(const [j,operation]of ['MIX','FILL'].entries()){
  const start=i*90+j*30,id=o['订单编号']+'-'+operation;
  plan.tasks.push({id,orderId:o['订单编号'],productId:o['产品编号'],lineId:o['产线编号'],operation,machine:operation+(i+1),start,end:start+30,duration:30,quantity:'240',unit:'kg',predecessor:j?o['订单编号']+'-MIX':''});
  if(j)plan.resourceReservations.push({id:id+'-G',type:'工装',resourceId:'G01',taskId:id,taskIds:[id],start,end:start+30,quantity:'1',unit:'套',declarationId:o['订单编号']+'-G'},{id:id+'-P',type:'人员',resourceId:'LP01',taskId:id,taskIds:[id],start,end:start+30,quantity:'1',unit:'人',requiredSkill:'FILL',providedSkill:'FILL',relationId:'',roleSource:o['订单编号'],occupationPolicies:[]});
 }
 return {profile,data,plan,conditions};
}
export function moveOrder(f,orderId,start){
 for(const t of f.plan.tasks.filter(t=>t.orderId===orderId)){const delta=start-f.plan.tasks.find(t=>t.orderId===orderId&&t.operation==='MIX').start;if(!delta)break;for(const t of f.plan.tasks.filter(t=>t.orderId===orderId)){t.start+=delta;t.end+=delta;}for(const r of f.plan.resourceReservations.filter(r=>(r.taskIds||[r.taskId]).some(id=>f.plan.tasks.some(t=>t.id===id&&t.orderId===orderId)))){r.start+=delta;r.end+=delta;}break;}
 return f;
}
