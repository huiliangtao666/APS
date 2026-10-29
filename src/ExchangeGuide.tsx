import {defs, type TableDef} from './data-defs';
const url=(file:string)=>`${import.meta.env.BASE_URL}fr036/${file}`;
export function ExchangeGuide({current}:{current:TableDef}){
 return <details className="panel" data-fr036-guide><summary>外部系统与 CSV 模拟说明（FR-036 · PG-01）</summary>
  <p>全部为离线模拟，无需 ERP / OMS / WMS / PLM / MES 账号。计划确认仅在本系统生效；不连接、不订阅、不向外部下发生产指令。</p>
  <table><caption>可能交换的数据及模拟责任来源</caption><thead><tr><th>系统</th><th>输入类别 / 来源</th><th>输出</th></tr></thead><tbody>
   <tr><td>ERP / OMS</td><td>产品、订单与需求，由主数据及订单维护方提供</td><td>保存方案的订单与任务计划文件</td></tr>
   <tr><td>WMS</td><td>物料、库存批次、独立占用、预计到料，由库存来源方提供</td><td>物料需求文件；不扣真实库存</td></tr>
   <tr><td>PLM</td><td>BOM版本、生效日期、路线、工时及依赖，由工艺维护方提供</td><td>本期无 PLM 写回契约</td></tr>
   <tr><td>MES</td><td>累计进度、累计耗料、来源映射及异常，由模拟执行来源方提供</td><td>任务、资源占用等报表文件；不是生产指令</td></tr>
  </tbody></table>
  <ol><li>先读说明，按日历资源→产品物料→BOM/路线/工时→依赖→库存到料→规则订单→进度事件准备数据。模板只有表头，填写后使用；示例所需关联数据见说明。</li>
   <li>填写操作原因，选择对应数据类别，再导入 CSV。当前主应用每次替换当前整表，服务器检查合并后的完整数据；错误拒绝此次写入。多个文件连续导入不是跨文件事务，也没有六表批次预览。</li>
   <li>重复编号须修正完整表后重导；相同集合替换不追加。不要给 CSV 添加来源、版本或模拟标记等未知列；这些说明保存在配套清单和系统输入版本中。</li>
   <li>分钟 0 = 2026-11-02 08:00 +08:00。预计到达/可用须带时区，例如 2026-11-02T08:00:00+08:00；有效期用 YYYY-MM-DD。kg、支、袋和物料单位不能混写。</li>
   <li>计算并保存后进入“查询报表与导出”，按方案和筛选查询，再填写原因导出。六类报表保留方案、运行、原输入、单位、日期及模拟说明；查询权限与导出权限分别检查。</li></ol>
  <p>当前类别：{current.label}。<a href={url('templates/'+current.file)} download>下载当前类别 CSV 表头模板</a></p>
  <p><a href={url('使用说明.txt')} download>下载中文说明与案例步骤</a> · <a href={url('matrix.json')} download>下载字段、唯一键与引用矩阵 JSON</a> · <a href={url('samples.json')} download>下载示例清单与上下文</a></p>
  <details><summary>全部类别模板与模拟示例下载</summary><ul>{defs.map(d=><li key={d.key}><a href={url('templates/'+d.file)} download>{d.file}（表头模板）</a></li>)}</ul>
   <p><a href={url('examples/orders.csv')} download>主应用订单示例</a> · <a href={url('examples/supplies.csv')} download>预计到料示例</a> · <a href={url('examples/duplicate-orders.csv')} download>重复订单反例</a> · <a href={url('examples/bad-unit-orders.csv')} download>错单位反例</a> · <a href={url('examples/bad-reference-supplies.csv')} download>错引用反例</a> · <a href={url('examples/bad-date-supplies.csv')} download>错日期反例</a></p>
   <ul>{['orders','tasks','occupation','materials','unplanned','differences'].map((k,i)=><li key={k}><a href={url('exports/'+k+'.csv')} download>{['订单计划','任务计划','资源占用','物料需求','未排原因','方案差异'][i]}导出示例（不可回导）</a></li>)}</ul>
   <ul>{defs.filter(d=>['orders','routes','times','machines','dependencies','rules'].includes(d.key)).map(d=><li key={d.key}><a href={url('prototype-six/'+d.file)} download>独立原型六表：{d.file}</a></li>)}</ul>
   <p>FR013 六表预览是独立原型，旧订单字段为“合格需求kg”，不可直接用于主应用。完整案例及六类导出文件链接见中文说明和示例清单。独立工厂表、箱换算、全规则业务验收和真实身份验收仍有限制。</p>
  </details>
 </details>;
}
