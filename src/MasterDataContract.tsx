import {originalResourceKeys,originalResourceNote} from './lib/original-resources.mjs';
export function MasterDataContract({table}:{table:string}){
 if(originalResourceKeys.includes(table))return <p data-original-resource-contract>{originalResourceNote}</p>;
 if(!['products','materials','batch'].includes(table))return null;
 return <p data-master-contract>
  {table!=='materials'&&'产品配置：单支净重须大于0（kg/支）；每袋支数须为正整数（支/袋），不自动取整；总收率须为比例 0＜值≤1（0.96 = 96%，1 = 100%），不填写百分号；模拟交付等待分钟须显式填写非负数。'}
  {table!=='products'&&'物料配置：单位与类别均为必填文本，可维护自定义值；不预设枚举或自动换算。修改单位时须一并核对 BOM、库存、到料及耗料的同单位约束。'}
  {' 所有业务值须显式填写，缺值阻断。planner / supervisor 可保存，query 只读；保存记录原因、前后值及输入版本，刷新后读回，新运行冻结采用新配置，历史方案保留原值。'}
 </p>;
}
