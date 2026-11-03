// Explicit executable fields for approved V2; free text remains metadata.
const spec=(name,cp,unit,extra={})=>({name,cp,unit,min:0,inclusive:true,type:'number',integer:true,...extra});
export const minuteAtomicFields=[
 ...['基准加工分钟','固定准备分钟','最短工艺分钟','最大等待分钟','开始参与分钟','结束参与分钟','工装后延释放分钟'].map(n=>spec(n,'CP172','分钟',{table:'工艺路线',key:'路线工序编号'})),
 spec('基准加工量千克','CP172','千克',{table:'工艺路线',key:'路线工序编号',integer:false,inclusive:false}),
 ...[['工时模型',['按量加工','固定连续历时']],['允许跨班连续',['是','否']],['人员参与方式',['全程参与','首尾参与']]].map(([name,values])=>spec(name,'CP172','枚举',{table:'工艺路线',key:'路线工序编号',type:'enum',values})),
 ...[['资源占用方式',['独占','重量共享','重量容量共享']],['生产日历方式',['连续日历','工厂班次']]].map(([name,values])=>spec(name,'CP179','枚举',{table:'设备与工装',key:'资源编号',type:'enum',values})),
 spec('生产计算精度分钟','CP169','分钟',{global:true,min:1,max:1}),spec('甘特显示刻度分钟','CP170','分钟',{global:true,min:30,max:30}),
 ...['第一班开始分钟','第一班结束分钟','第二班开始分钟','第二班结束分钟','日粒度放行时点分钟','日粒度到货时点分钟'].map(n=>spec(n,n.startsWith('日')?'CP175':'CP173','日内分钟',{calendarGlobal:true,max:1440})),
 spec('每班可用分钟','CP173','分钟',{calendarGlobal:true}),
 ...['最早交付日内时点分钟','最晚交付日内时点分钟','批次到期日内失效分钟'].map(n=>spec(n,'CP175','日内分钟',{global:true,max:1440})),
 ...['排程开始分钟偏移','排程结束分钟偏移'].map(n=>spec(n,'CP171','分钟',{global:true})),
 ...[['生产时间单位','CP169','枚举',['分钟']],['需求时间单位','CP175','枚举',['天']],['库存时间单位','CP175','枚举',['天']],['补料时间单位','CP175','枚举',['天']],['分钟原点','CP171','日期时刻',['2026-10-31T00:00:00+08:00']],['工厂时区','CP171','时区',['Asia/Shanghai']],['数据版本','CP181','版本',['APS-MEAT-202611-V2.0']],['新制物料保质起算点','CP175','枚举',['合格完工时刻']]].map(([name,cp,unit,values])=>spec(name,cp,unit,{global:true,type:'enum',values}))
];
