# CR-QUERY-REPORTS-20261102 实施与验证边界

唯一入口 [Issue49](https://github.com/huiliangtao666/APS/issues/49)，原 Dev delivery `dlv_ce6cdb17-16ed-48a8-a8a2-8f2aa52fccff`，本次实际接续 `dlv_01440ef9-c11d-436a-86c8-ab8941851c6c`。[批准合同](https://github.com/huiliangtao666/APS/issues/49#issuecomment-6572536786)、[完整范围](https://github.com/huiliangtao666/APS/issues/49#issuecomment-6572747132)、[工程交窗](https://github.com/huiliangtao666/APS/issues/49#issuecomment-6574320876)共同适用。设计 `4c56e27249eaa9c73c6708fd9c72eccd8b9697aa`，canonical 域源 `f33814d1592451d09997c9f8951b990fa42f668c`，本次整合基线 `3705c76ed8696b8754553723b0fc11e0e1a5d4a0` 分开记录。域源已在基线可达，没有重复合历史。

## 实际接线

`InputData → QueryReports → 既有 /api/workbooks router → permission(read/export) → 显式 dataset/version 或 snapshot(run.inputRef) → workbook-query-report-adapter → server/query-reports/index.mjs`。没有新的结果存储、计算、导入、采购写入或权限体系。Test 的八个域文件及原25项测试保持原blob，Dev没有重写或重跑域测试。

新增传输为 `query-reports/context|options|query|detail|value|export`。逐请求校验来源指纹，拒绝 latest 回退、混版本、输入/结果/参数/映射/条件损坏。actor来自现有认证；冻结试算依据run.actor和冻结parameterContext/provenance检查归属，不借当前试算目录回填历史。当前输入按dataset scope读取。请求客户端提供的access不参与授权。

ALL/NONE/VALUES/MATCH及搜索动作直接使用canonical令牌；类别使用原主数据，不猜编码。每视图保留独立条件；日窗、BOM开关、单位变化重置有上下文依赖的业务令牌，保留仍有效物料选择。来源跨页保留同身份、日期、物料范围及适用业务条件，并为目标视图重新绑定业务令牌，不夹带隐藏条件。

全量先筛选、排序、计数和分物料/单位汇总再分页。UI按同指纹组装100/200/500逻辑页，有界传输仍不超过256KiB。长值经value分块完整读取，未截断冒充原值。逐主表/抽屉表及用户保存栏位偏好，id固定；导出先校验已显示查询，再将可见列绑定为导出投影，canonical manifest保留该投影完整身份、计数/字节/hash completion。所选导出验证业务键属于原匹配结果；流式输出处理背压，不将当前页当全量。

组成、源行、关联物料、参数、冻结run和mapping均沿canonical detail节；可从原始记录定位关联报表。仅当前同版本输入、且有编辑角色时开放既有原表维护入口；冻结/过期版本不开放修改。返回保留工作台React子树、步骤、选择、预览及草稿，保存仍由现有API形成新版本。

## 完整包清单及实际证据

[coverage.csv](coverage.csv)保留原27行：18子视图及G01—09，不删除QR-B。五类目录为BOM3、需求3、库存4、产能4、补料4。开发自测覆盖显式历史/冻结隔离、损坏拒绝、read/export权限、canonical完整候选及空集/搜索、分页/导出/来源、长值、18视图传输及冻结试算owner；UI检查日历/17分钟端点、默认完整ALL/100/BOM关、固定栏位/转义、身份拒绝和逻辑页组装。夹具与SSR不能替代真实UI、原Excel或独立QA。精确命令、最终固定SHA、build产物/hash和保护门以正式交付原件为准。

当前可结束的是已批准源码接线、任务级合成自测与标准构建阶段。真实入口、原件采用和QA仍未执行；不得据本文件将整卡标Done。有效BOM有向关系图与代表关键路径时序直接显示当前查询页的真实关系/历时，标当前页与全量计数、同版本来源和非实际开工；时序保留原小数日，不另算一套BOM。关系/路径表及抽屉保留完整原值。按日需求采用canonical批准的物料/日/单位长表，非预先截断的透视样例。

## V2、分钟依赖与恢复

后续数据依据 **APS-MEAT-202611-V2.0**，固定设计 `55a063fcd9daf6d3d5fdf9b25147b32ae57ee5c0`。B原件SHA256 `247423ea73d441e8ef6d03f538f393973287e17acb93d81ec1353abc4283d247`，P原件 `f9a4fea37b2c50038cc7c7bd9ad513d2c73b981d8ef0cd1cc2d8f47a775b176e`。本窗没有导入或run采用，不填写虚构的有效P/映射/run身份；V2适用断言仍NOT_EXECUTED。相关DV02/03/06/08/11/12/13/14/15/17/16需后续在真实版本和run上逐项记录。

需求、库存、补料保持天。已有真实分钟字段、各自原点和17分钟区间保留，不按30分钟取整；缺余额、实际交付、日内分摊、可用分钟分母、待料损失明确未提供。完整分钟schema/模型、任务/WIP/人员工具分钟冻结及日内边界属[Issue50](https://github.com/huiliangtao666/APS/issues/50)，本包不偷做solver/parser，也不以该依赖停止独立输入查询。

恢复时复用正式build包，在PM给出的最小隔离运行方案中配置现有SDK端口与独立数据目录，使用已批准且实际支持的B/P版本或明确V2拒绝报告；核对product/build、角色和dataset/version，随后验证QR-A及真实冻结QR-B。旧V1参考MP/MR/NC/DP不充V2 run；旧0afa/45/47环境、输入与证据保留。当前没有新增应用start/restart/preview/browser/HTTP/真实导入/Worker/calc/install/pull/发布授权，尚无新部署指纹/URL。独立smoke和用户UAT由后续具体准入安排。
