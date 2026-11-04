import {VERSION, fingerprint} from './contract.mjs';

// Hand-authored engineering fixture following design R1. Not a source workbook or a site default.
// PB01 uses an explicit extra 17-minute fixture operation (17:23–17:40) to cover SIM-05;
// the design only specifies its material and output times. PB02 timing is given by the design.
export function threeDaySpec() {
  const at=(day,time)=>'2026-11-'+day+'T'+time+':00+08:00';
  const source=(version,value)=>({version,hash:fingerprint(value)});
  const s={schema:VERSION,mode:'INDEPENDENT',startDate:'2026-11-01',endDate:'2026-11-03',coverageEnd:'2026-11-03',
    timeZone:'Asia/Shanghai',offset:'+08:00',planningWindowDays:14,random:{enabled:false},
    source:{baseline:source('FIXTURE-R1','SIM900 explicit fixture opening'),parameters:{...source('FIXTURE-P-R1',{planningWindowDays:14}),precedence:'SECOND_P'},
      rules:source('SCRIPT-R1','Hand-authored materialized events'),plan:source('EXPLICIT-SCRIPT-COPY-R1','PB01 17-minute test; PB02 60 minutes; not a solved plan')},
    materials:[{id:'RM900',unit:'千克',scale:1000},{id:'FG900',unit:'千克',scale:1000}],
    lots:[{id:'RAW01',materialId:'RM900',quantity:110,pending:0,qualified:110,frozen:0,externalReserved:20,expiresAt:at('30','00:00'),location:'L01',environment:'冷藏',lineage:'FIXTURE-RAW01'},
      {id:'RAWX',materialId:'RM900',quantity:10,pending:0,qualified:10,frozen:0,externalReserved:0,expiresAt:at('03','00:00'),location:'L01',environment:'冷藏',lineage:'FIXTURE-RAWX'}],
    purchases:[{id:'PO01-1',materialId:'RM900',ordered:60,received:0,cancelled:0,issued:true,lineage:'FIXTURE-PO01-1'}],
    demands:[{id:'D01',materialId:'FG900',required:20,change:0,cancelled:0,shipped:0,signed:0,fulfillment:'SHIP',customer:'仿真客户',lineage:'FIXTURE-D01'}],
    resources:[{id:'M01',capacity:1},{id:'T01',capacity:1},{id:'P01',capacity:1}],
    tasks:[{id:'PB01',outputMaterialId:'FG900',outputLimit:28,balanceUnit:'千克',totalMinutes:17,resources:[],startRequirements:[{lotId:'RAW01',cumulative:30}],lineage:'FIXTURE-PB01',csvMapping:{factId:'F01'}},
      {id:'PB02',outputMaterialId:'FG900',outputLimit:48,balanceUnit:'千克',totalMinutes:60,resources:[{id:'M01',quantity:1},{id:'T01',quantity:1},{id:'P01',quantity:1}],
        startRequirements:[{lotId:'RAW01',cumulative:50}],lineage:'FIXTURE-PB02',csvMapping:{factId:'F02'}}],events:[]};
  const add=(id,day,time,type,data,causes=[],knownAt=null)=>{const when=at(day,time);s.events.push({id,type,data,causes,occurredAt:when,knownAt:knownAt??when,effectiveAt:when,businessDate:'2026-11-'+day,source:'SIM900-R1 / engineering fixture'});};
  const receipt=(purchaseId,lotId,quantity)=>({purchaseId,lotId,quantity,expiresAt:at('30','00:00'),location:'L01',environment:'冷藏',lineage:'FIXTURE-'+lotId});
  const output=(taskId,lotId,quantity)=>({taskId,lotId,quantity,expiresAt:at('30','00:00'),location:'FG01',environment:'冷藏',lineage:'FIXTURE-'+lotId});
  const release=(lotId,quantity)=>({lotId,quantity,from:'pending',to:'qualified',disposition:'显式仿真放行，不代表真实QA'});
  add('E01','01','09:00','CONSUME_CUMULATIVE',{taskId:'PB01',lotId:'RAW01',cumulative:30});
  add('E02','01','14:00','RECEIVE',receipt('PO01-1','RC01',40));
  add('E03-start','01','17:23','TASK_START',{taskId:'PB01'},['E01']);
  add('E03-progress','01','17:40','TASK_PROGRESS',{taskId:'PB01',processedMinutes:17,remainingMinutes:0},['E03-start']);
  add('E04','01','17:40','TASK_RESULT',{taskId:'PB01',cumulativeOutput:28,cumulativeScrap:2,final:true},['E03-progress']);
  add('E03','01','17:40','OUTPUT_RECEIVE',output('PB01','FGLOT01',28),['E04']);
  add('E05','02','08:00','QUALITY',release('RC01',40),['E02']);
  add('E06','02','08:30','QUALITY',release('FGLOT01',28),['E03']);
  add('E07','02','09:00','DEMAND',{id:'D02',materialId:'FG900',required:10,change:0,cancelled:0,shipped:0,signed:0,fulfillment:'SHIP',customer:'仿真客户',lineage:'FIXTURE-D02'});
  add('E08-start','02','10:00','TASK_START',{taskId:'PB02'});
  add('E08','02','10:00','CONSUME_CUMULATIVE',{taskId:'PB02',lotId:'RAW01',cumulative:50},['E08-start']);
  add('E09-progress','02','10:20','TASK_PROGRESS',{taskId:'PB02',processedMinutes:20,remainingMinutes:40},['E08']);
  add('E09','02','10:20','TASK_PAUSE',{taskId:'PB02',unreadyResources:['M01'],disposition:'保温待判，保留设备和工装'},['E09-progress']);
  add('E10','02','11:00','RESOURCE_READY',{resourceId:'M01'},['E09']);
  add('E10-people','02','11:00','RESOURCE_RELEASE',{taskId:'PB02',resourceId:'P01',disposition:'暂停期间显式释放人员'},['E09']);
  add('E11','02','12:00','SHIP',{demandId:'D01',allocations:[{lotId:'FGLOT01',quantity:20}]},['E06']);
  add('E12','03','00:00','LOT_EXPIRE',{lotId:'RAWX'},[],'2026-10-31T23:59:00+08:00');
  add('E13','03','08:00','TASK_RESUME',{taskId:'PB02',disposition:'显式允许继续，重新取得人员'},['E10','E10-people']);
  add('E14-progress','03','08:40','TASK_PROGRESS',{taskId:'PB02',processedMinutes:60,remainingMinutes:0},['E13']);
  add('E15','03','08:40','TASK_RESULT',{taskId:'PB02',cumulativeOutput:48,cumulativeScrap:2,final:true},['E14-progress']);
  add('E14','03','08:40','OUTPUT_RECEIVE',output('PB02','FGLOT02',48),['E15']);
  add('E14-machine','03','08:40','RESOURCE_RELEASE',{taskId:'PB02',resourceId:'M01',disposition:'完工显式释放设备'},['E14']);
  add('E14-people','03','08:40','RESOURCE_RELEASE',{taskId:'PB02',resourceId:'P01',disposition:'完工显式释放人员'},['E14']);
  add('E16','03','08:45','RESOURCE_RELEASE',{taskId:'PB02',resourceId:'T01',disposition:'完工后延5分钟归还'},['E14']);
  add('E17','03','09:00','QUALITY',release('FGLOT02',48),['E14']);
  add('E18','03','09:00','RECEIVE',receipt('PO01-1','RC02',20),['E02']);
  add('E19','03','10:00','SHIP',{demandId:'D02',allocations:[{lotId:'FGLOT01',quantity:8},{lotId:'FGLOT02',quantity:2}]},['E07','E17']);
  add('E20','03','13:00','QUALITY',release('RC02',20),['E18']);
  add('E21','03','15:00','SCRAP_LOT',{lotId:'RAWX',quantity:10,from:'qualified',disposition:'到期批次实际报废出库'},['E12']);
  add('E22','03','16:00','SIGN',{demandId:'D01',quantity:20},['E11']);
  return s;
}
