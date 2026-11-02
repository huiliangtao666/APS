import test from 'node:test';
import assert from 'node:assert/strict';
import {minuteResourceCandidate} from '../server/workbook-minute.mjs';
function example(){
 const resource={'资源编号':'EQ','资源类别':'设备','资源组编号':'G','可用数量':'1','单次批量上限千克':'1000','标准日产能千克':'10000','资源占用方式':'独占','生产日历方式':'工厂班次'};
 const crew={'班组编号':'C','每班可用人数':'10','标准日班次数':'1','周日班次数':'1'};
 const route={'路线工序编号':'R2','设备组编号':'G','成品编号':'B','需求人数':'1','每批工装套数':'0','工时模型':'固定连续历时','基准加工分钟':'17','固定准备分钟':'0','最短工艺分钟':'0','基准加工量千克':'500','人员参与方式':'全程参与','允许跨班连续':'否','结束参与分钟':'0','开始参与分钟':'0','工装后延释放分钟':'0','最大等待分钟':'60'};
 const rule=(id,from,to,n)=>({'清洗规则编号':id,'设备组编号':'G','前产品编号':from,'后产品编号':to,'清洗分钟':String(n),'清洗人数':'1'});
 const d={productionContract:'workbook-minute-v2',tables:{'工厂日历':[{'日序':'0','生产班次数':'1','日产能分母':'1'}],'生产班次':[{'开始分钟偏移':'0'}],'停机安排':[],'换型清洗':[rule('A-B','A','B',10),rule('A-C','A','C',10),rule('B-C','B','C',20),rule('C-B','C','B',10)]},effectiveParameters:{values:['第一班开始分钟','第一班结束分钟'].map((field,i)=>({object:'CAL',field,value:[0,1440][i],from:0,to:44}))}};
 return {d,route,quantity:100,earliest:200/1440,end:1,occupancy:[],daily:new Map(),resources:[resource],crew,pool:[],standardBatch:1000,currentMinute:0};
}
test('inserting an earlier product cannot invalidate an already reserved successor cleaning direction',()=>{
 const a=example(),job=(id,product,start,end)=>({taskId:id,resource:'EQ',productId:product,start:start/1440,end:end/1440,quantity:100,crew:'C',people:1,tools:[],labor:[{start,end}]});
 a.occupancy=[job('T1','A',0,100),{...job('T2','C',600,700),cleaning:{start:590,end:600,resource:'EQ',crew:'C',people:1,quantity:0,rule:'A-C'}}];
 const chosen=minuteResourceCandidate(a);
 assert.equal(Math.round(chosen.start*1440),710,'B must follow C; B before C invalidates the retained A->C cleaning');
 assert.equal(chosen.cleaning.rule,'C-B');
});
test('actual predecessor end bounds minute waiting, including WIP and material-delayed readiness',()=>{
 const a=example();a.predecessor={id:'PREV',routeStepId:'R1',endMinute:100};a.earliest=600/1440;
 assert.equal(minuteResourceCandidate(a),null,'readiness at600 must not reset predecessor completion100');
 a.earliest=160/1440;assert.equal(Math.round(minuteResourceCandidate(a).start*1440),160,'exact60-minute boundary allowed');
 a.earliest=161/1440;assert.equal(minuteResourceCandidate(a),null,'one minute beyond boundary rejected');
 a.predecessor.routeStepId='R2';assert.ok(minuteResourceCandidate(a),'sequential batches of same operation retain their own batching semantics');
});
