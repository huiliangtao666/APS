// National dates are factual inputs. Explicit imported dates and online exceptions
// remain authoritative until the user chooses to restore the national default.
export const chinaCalendarSource={year:2026,title:'国务院办公厅2026年节假日安排（国办发明电〔2025〕7号）',url:'https://www.gov.cn/zhengce/content/202511/content_7047090.htm'};
const holidays=[['01-01','01-03','元旦'],['02-15','02-23','春节'],['04-04','04-06','清明节'],['05-01','05-05','劳动节'],['06-19','06-21','端午节'],['09-25','09-27','中秋节'],['10-01','10-07','国庆节']];
const workdays=new Set(['01-04','02-14','02-28','05-09','09-20','10-10']);
export const factoryCalendarFields=[
 {name:'是否开工',cp:'CP129',type:'enum',unit:'枚举',values:['按国家日历','开工','不开工'],table:'工厂日历',key:'日序'},
 {name:'工厂所在国家',cp:'CP129',type:'text',unit:'文字',calendarGlobal:true,sharedOnly:true,value:'中国'},
 ...[['工作日默认班次数',2],['周六默认班次数',1],['周日默认班次数',1],['法定节假日默认班次数',0]].map(([name,value])=>({name,cp:'CP129',type:'number',unit:'班/天',integer:true,min:0,inclusive:true,calendarGlobal:true,value:String(value)})),
];
export function factoryDate(d,day){return new Date(Date.parse((d.dayZero||'2026-10-31')+'T00:00:00Z')+Number(day)*86400000).toISOString().slice(0,10);}
export function nationalCalendarDate(date,country='中国'){
 const weekday=new Date(date+'T00:00:00Z').getUTCDay(),md=date.slice(5);
 if(!['中国','中国大陆','中华人民共和国','CN','cn'].includes(country.trim())||!date.startsWith('2026-'))return {supported:false,kind:'manual',label:'需维护当地法定日历',weekday};
 const holiday=holidays.find(([from,to])=>from<=md&&md<=to);
 return holiday?{supported:true,kind:'holiday',label:holiday[2]+'假期',weekday}:workdays.has(md)?{supported:true,kind:'workday',label:'调休工作日',weekday}:weekday===0||weekday===6?{supported:true,kind:'weekend',label:weekday===6?'周六':'周日',weekday}:{supported:true,kind:'workday',label:'工作日',weekday};
}
const number=value=>value!==''&&value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value):null;
export function resolveFactoryCalendar(d,row,active=[]){
 const day=Number(row['日序']),date=factoryDate(d,day),get=name=>active.find(p=>p['对象编号']==='CAL'&&p['参数名称']===name)?.['参数值'];
 const country=String(get('工厂所在国家')??'中国'),national=nationalCalendarDate(date,country);
 const defaults={workday:number(get('工作日默认班次数'))??2,saturday:number(get('周六默认班次数'))??1,sunday:number(get('周日默认班次数'))??1,holiday:number(get('法定节假日默认班次数'))??0};
 const defaultShifts=!national.supported?null:national.kind==='holiday'?defaults.holiday:national.kind==='weekend'?(national.weekday===6?defaults.saturday:defaults.sunday):defaults.workday;
 const own=active.find(p=>p['对象编号']===String(day)&&p['参数名称']==='是否开工'),mode=own?.['参数值'];
 const override=active.find(p=>p['对象编号']===String(day)&&p['参数名称']==='生产班次数'),literal=number(row['生产班次数']??row['日产能分子']);
 let shifts=number(override?.['参数值'])??(mode==='按国家日历'&&national.supported?defaultShifts:literal??defaultShifts),source=override?'CP132日期例外':mode==='按国家日历'||literal===null?'国家日历默认':'导入日历';
 if(!national.supported&&literal!==null&&source==='国家日历默认')source='导入日历（当地法定日历未载入）';
 if(mode==='不开工'){shifts=0;source='CP129手工停工';}
 if(mode==='开工'){shifts=shifts>0?shifts:(defaultShifts>0?defaultShifts:defaults.workday>0?defaults.workday:1);source='CP129手工开工'+(override?' / CP132班次':'');}
 return {date,country,...national,mode:mode??(literal===null?'按国家日历':literal>0?'开工':'不开工'),shifts,open:shifts===null?null:shifts>0,source,defaultShifts,defaults};
}
