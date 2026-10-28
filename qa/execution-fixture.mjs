export function executionFixture(seed,state='部分完成'){
 const d=structuredClone(seed);d.orders=d.orders.slice(0,1);d.dependencies=d.dependencies.filter(x=>x['订单编号']==='A');d.products[0]['总收率']='1';d.orders[0]['合格需求']='100';
 d.bom=[{'版本编号':'EX-B1','产品编号':'HC40','生效日期':'2026-01-01','投料工序编号':'MIX','用量类型':'BOM物料','物料编号':'LEAN','配置用量':'1000','用量单位':'kg','用量基准':'每1000kg投入','收率/损耗口径备注':'','损坏比例':'0'}];
 d.inventory=[{'批次编号':'EX-LOT','物料编号':'LEAN','账面数量':'120','已占用数量':'10','有效期':'2026-12-31','位置':'模拟','质量状态':'合格','预计可用时间':''}];
 const f={'事实编号':'F-A-MIX','订单编号':'A','工序编号':'MIX','状态':state,'开始分钟':'0','完成分钟':state==='已完成'?'30':'','观测分钟':'30','工序完成数量':state==='已开始'?'0':state==='已完成'?'100':'40','数量单位':'kg','剩余工时分钟':state==='已完成'?'0':'20','当前设备':'MIX01','暂停原因':state==='暂停'?'模拟设备异常待核对':''};
 d.executionFacts=[f];d.executionMaterials=[{'记录编号':'C1','事实编号':'F-A-MIX','批次编号':'EX-LOT','物料编号':'LEAN','累计已用数量':state==='已完成'?'100':'40','单位':'kg'}];
 Object.assign(d.rules.find(r=>r['规则编号']==='MATERIAL'),{'是否启用':'是','参数JSON':JSON.stringify({'允许预计供给':false,'可用状态':['合格'],'预计状态':['预计可用'],'不可用状态':['待检','冻结','不合格']})});
 return d;
}
