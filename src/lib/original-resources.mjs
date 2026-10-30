// Original v0.3 CSV fields. These source records deliberately do not create
// runtime tools, personnel groups, shifts, claims or default business values.
export const originalResourceDefs=[
 {key:'originalTools',label:'原05 模具与工具资料（待运行映射）',file:'05_模具与工具配置.csv',fields:['资源编号','资源名称','资源类型','可用数量','最早可用分钟','最晚可用分钟','共享范围']},
 {key:'originalPersonnel',label:'原06 人员技能资料（待运行映射）',file:'06_人员技能与班次.csv',fields:['人员组编号','技能','可用人数','起始分钟','结束分钟','共享范围']}
];
export const originalResourceKeys=originalResourceDefs.map(d=>d.key);
export const originalResourceNote='原05/06按原列保存和查询。数量为资源套/件数或人数，时间为分钟 0 = 2026-11-02 08:00（Asia/Shanghai）的偏移，不能填日期或小时单位。共享范围和资源类型按原文本保留；尚未确定的共享池、任务占用、组名与班次映射未接入排程。同编号关联只供核对，不表示已经采用这些容量。';
export function validateOriginalResources(data){
 const issues=[];
 for(const def of originalResourceDefs){
  const tool=def.key==='originalTools',count=tool?'可用数量':'可用人数',start=tool?'最早可用分钟':'起始分钟',end=tool?'最晚可用分钟':'结束分钟';
  (data[def.key]||[]).forEach((row,index)=>{
   const add=(field,message)=>issues.push({table:def.key,file:def.file,row:index+2,field,message});
   for(const f of def.fields)if(!row[f]?.trim())add(f,'必填；须显式填写，不自动补值');
   const n=row[count]?.trim();
   if(n&&(!/^\d+$/.test(n)||!Number.isSafeInteger(Number(n))))add(count,'须为非负安全整数；不取整或自动换算');
   const valid=f=>!!row[f]?.trim()&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(row[f].trim())&&Number.isFinite(Number(row[f]))&&Number(row[f])<=Number.MAX_SAFE_INTEGER;
   for(const f of [start,end])if(row[f]?.trim()&&!valid(f))add(f,'须为非负安全分钟数；不接受日期、小时单位、指数或无穷值');
   if(valid(start)&&valid(end)&&Number(row[end])<=Number(row[start]))add(end,'结束分钟须大于起始分钟');
  });
 }
 return issues;
}
