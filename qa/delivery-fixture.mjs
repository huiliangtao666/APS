import {batchFixture} from './batch-fixture.mjs';
import {deliveryParameters} from '../src/lib/delivery-policy.mjs';
export function deliveryFixture(seed){
 const d=batchFixture(seed);d.products[0]['模拟交付等待分钟']='120';d.orders[0]['合格需求']='96';d.orders[0]['要求可交付分钟']='300';
 d.deliveryConditions=[{'订单编号':'A','模拟质量状态':'模拟合格','模拟质量可用时间':'','模拟有效期截止时间':'不适用','要求剩余有效分钟':'0'}];
 Object.assign(d.rules.find(r=>r['规则编号']==='DELIVERY'),{'是否启用':'是','参数JSON':JSON.stringify(deliveryParameters)});return d;
}
