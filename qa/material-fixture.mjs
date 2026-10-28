// Canonical v0.3 AC08/09 ratios represented in the integrated FR003 schema.
export function materialFixture(seed){
 const d=structuredClone(seed);d.orders=[{...d.orders[0],'合格需求':'480'}];
 d.dependencies=(d.dependencies||[]).filter(r=>r['订单编号']==='A');
 d.bom=[...['LEAN','FAT','WATER','PREMIX'].map((id,i)=>({'版本编号':'V1','产品编号':'HC40','生效日期':'2026-01-01','投料工序编号':'MIX','用量类型':'BOM物料','物料编号':id,'配置用量':['650','150','150','50'][i],'用量单位':'kg','用量基准':'每1000kg投入','收率/损耗口径备注':''})),{'版本编号':'V1','产品编号':'HC40','生效日期':'2026-01-01','投料工序编号':'FILL','用量类型':'包装物料','物料编号':'BAG','配置用量':'1','用量单位':'个','用量基准':'每袋','损坏比例':'0.01','收率/损耗口径备注':''}];
 d.inventory=d.materials.map(m=>({'批次编号':m['物料编号']+'-LOT','物料编号':m['物料编号'],'账面数量':'10000','已占用数量':'0','有效期':'2026-12-31','位置':'模拟库','质量状态':'合格','预计可用时间':''}));
 d.rules.find(r=>r['规则编号']==='MATERIAL')['是否启用']='是';d.rules.find(r=>r['规则编号']==='MATERIAL')['参数JSON']=JSON.stringify({'允许预计供给':false,'可用状态':['合格'],'预计状态':['预计可用'],'不可用状态':['待检','冻结','不合格']});
 return d;
}
