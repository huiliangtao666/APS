import {seed,defs} from '../server/planner.ts';
export const at='2026-11-01T00:00:00Z';
export const policy=(from,to,durationMinutes=10,waitMinutes=5,prohibited=false)=>({id:from+'-'+to,from,to,resourceIds:['M'],durationMinutes,prohibited,resources:[{type:'设备',id:'M',quantity:1}],personnel:[{groupId:'CLEAN',quantity:1,skill:'CLEAN'}],validation:{waitMinutes,clock:'elapsed-minutes',resources:[{type:'设备',id:'M',quantity:1}],personnel:[]},source:{id:'MOCK:BR13-approved-fields',version:'1'}});
export function scenario(){
 const d=structuredClone(seed);for(const def of defs)d[def.key]=[];
 d.factoryLines=[{'工厂编号':'F','工厂名称':'BR13仿真','产线编号':'L','产线名称':'可替换仿真路线','时区':'Asia/Shanghai'}];
 d.products=['A','B'].map(id=>({'产品编号':id,'产品名称':id,'单支净重kg':'1','每袋支数':'1','总收率':'1','模拟交付等待分钟':'0'}));
 d.orders=['A','B'].map((id,i)=>({'订单编号':id,'产品编号':id,'产线编号':'L','合格需求':'1','数量单位':'支','要求可交付分钟':'200','优先顺序':String(i),'是否允许拆分':'否','需求类型':'正式订单','订单状态':'有效','已完成合格数量':'0'}));
 d.routes=d.products.map(p=>({'产品编号':p['产品编号'],'工序编号':'OP','工序名称':'完整生产','前序工序':'','最大等待分钟':'','程序编号':'P'}));
 d.times=d.products.map(p=>({'产品编号':p['产品编号'],'工序编号':'OP','计算方式':'固定','固定分钟':'10','速度支每分钟':''}));
 d.machines=[{'设备编号':'M','设备名称':'仿真设备','产线编号':'L','工序编号':'OP','日历编号':'C','最小装载kg':'0','最大装载kg':'100','装载计量基准':'合格产出','不足批处理':''}];
 d.dependencies=d.orders.map(o=>({'订单编号':o['订单编号'],'工序编号':'OP','资源类型':'设备','资源编号':'M','需求数量':'1','提前占用分钟':'0','后延占用分钟':'0'}));
 d.calendars=[{'日历编号':'C','工厂编号':'F','起始分钟':'0','结束分钟':'200','是否工作':'是','说明':'显式模拟'}];
 d.personnelGroups=[{'人员组编号':'CLEAN','人员组名称':'仿真清洗','人员数量':'2','技能':'CLEAN','班次':'D','可用起始分钟':'0','可用结束分钟':'200','poolId':'P'}];
 d.personnelPools=[{poolId:'P','池名称':'唯一物理池','总人数':'2','是否启用':'是','允许共用':'是','容量来源':'MOCK:原人数','适用范围':'*','生效时间':'','交接设置':'','策略版本':'P10-explicit-v2','策略来源':'既有明确策略','互斥粒度':'无互斥','交接模式':'不设交接限制','交接起始分钟':'','交接结束分钟':'','交接容量人数':'','占用策略':'依赖声明','释放策略':'半开端点释放'}];
 d.rules=structuredClone(seed.rules).map(r=>({...r,'是否启用':['MACHINE','PRECEDENCE','CALENDAR','CLEANING'].includes(r['规则编号'])?'是':'否'}));
 d.rules.push({'规则编号':'CLEANING','中文名称':'换型清洗','是否启用':'是','适用对象':'*','生效时间':'','参数JSON':'{}'});
 d.rules.find(r=>r['规则编号']==='CLEANING')['参数JSON']=JSON.stringify({contract:'BR13-saved-order-v1',source:{id:'MOCK:BR13-application',version:'1'},startPolicy:'前序结束',policies:[policy('A','B'),policy('B','A',4,2)]});
 // Freeze exact CSV schema shape, including every blank optional field.
 for(const def of defs)d[def.key]=(d[def.key]||[]).map(r=>Object.fromEntries(def.fields.map(k=>[k,r[k]??''])));
 return d;
}
export function configure(d,fn){const r=d.rules.find(r=>r['规则编号']==='CLEANING'),c=JSON.parse(r['参数JSON']);fn(c);r['参数JSON']=JSON.stringify(c);return d;}
export const tasks=(ab=true)=>[{id:ab?'A-OP':'B-OP',orderId:ab?'A':'B',productId:ab?'A':'B',operation:'OP',machine:'M',start:0,end:10,duration:10},{id:ab?'B-OP':'A-OP',orderId:ab?'B':'A',productId:ab?'B':'A',operation:'OP',machine:'M',start:ab?25:16,end:ab?35:26,duration:10}];
export function planOf(ts=tasks()){return {tasks:ts,resourceReservations:ts.map(t=>({type:'设备',resourceId:t.machine,quantity:'1',start:t.start,end:t.end,taskIds:[t.id]}))};}
