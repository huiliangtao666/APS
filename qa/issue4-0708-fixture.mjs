import {calendarBatch,nineKeys,originalKeys} from './issue4-0204-fixture.mjs';
export {originalKeys};
export const masterKeys=['products','materials'];
export const allKeys=[...nineKeys,...masterKeys];
export function masterBatch(){
 const d=calendarBatch();
 Object.assign(d.products[0],{'产品名称':'合成产品第一行\n第二物理行','单支净重kg':'0.05','每袋支数':'12','总收率':'0.9','模拟交付等待分钟':'0'});
 Object.assign(d.materials[0],{'物料名称':'合成物料第一行\n第二物理行','类别':'原料'});
 d.products.push({'产品编号':'SYN-P07','产品名称':'显式合成新增产品','单支净重kg':'0.02','每袋支数':'8','总收率':'1','模拟交付等待分钟':'15'});
 d.materials.push({'物料编号':'SYN-M08','物料名称':'显式合成新增物料','单位':'kg','类别':'辅料'});
 return d;
}
