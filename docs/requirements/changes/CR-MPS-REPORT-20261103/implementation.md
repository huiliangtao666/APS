# 生产主计划综合报表

唯一执行记录为 [#140](https://github.com/huiliangtao666/APS/issues/140)，实施授权及资源门见 [6609486134](https://github.com/huiliangtao666/APS/issues/140#issuecomment-6609486134)。原始 v0.3 基线与既有 FR-035 Done 证据保持原版本。本目录描述实现及责任边界，不替代 Project2 的实时状态。

报表从现有工作台采用明确的数据集版本或冻结 run，通过既有 `workbookQueryContext` / `workbookQueryBoundContext` 校验输入、参数、映射和结果指纹。入口接缝为 `server/workbook-router.mjs` 与 `src/InputData.tsx`，必须在 #147 writer 冻结确认后串行接入。新增域不修改查询缓存、运行时或求解器。

`server/mps-report.mjs` 只读聚合五类来源，提供每件物料的 16 项日历指标。已保存的成功分配作为投料证据；它不能证明未排任务的全量相关需求。新增制造按明确末道任务产出计量一次，既有在制不重复归入新增主计划。未下达建议单独展示；到货与可用、完工与合格放行分别展示。

当前数据没有提供的净未收、发运执行净余、入库净余、合格放行、批次投影剩余量和占用归属均保留待核对。只在明确存在完整来源集合且确无记录时显示真实 0；采购物料的制造指标显示不适用；未成功或窗外运行显示未计算/未覆盖。原快照自由量与查询起点库存分列，不把旧库存当后续日期实物。拟议 PAB 公式没有裁决，PAB、派生需求缺口及安全库存不足均不自动启用；不新增预占事务账、ATP、预测冲减或成本优化。

`server/mps-report-domain.mjs` 提供同指纹的总览、单物料矩阵、来源、候选及导出。响应限制 256 KiB，前端组装完整 100/200/500 条逻辑页；矩阵按最多 31 天分块，独立于总览页码。候选内搜索只改变显示，完整全选、清空、隐藏排除与重置分别保持明确语义。有效 BOM 递归展开只扩展示范围，不生成新需求，保留根物料与有效关系来源。

CSV 与 Excel 2003 SpreadsheetML XML 都导出全量筛选物料、完整日矩阵及源字段，不受当前页限制。导出保留数据、run、参数、单位、日期、查询指纹及源行。Excel XML 可由 Excel 直接打开，不将 XML 伪称 XLSX。时点指标只取指定时点，不按天累计，也不跨 SKU/异单位加总。超长源字段分段保留，避免单个 Excel 单元格超限。

前端 `src/MpsReport*` 提供来源选择、筛选、总览、单物料矩阵、逐表栏位和明细抽屉。尚无准确上下文入口的维护跳转明确标“未接入”，不构造伪链接。已有 API 客户端及 read/export 控制保持；用户权限测试依合同记 OUT_OF_SCOPE_BY_USER，不据此签 PASS。

自测入口：`qa/mps-report.test.mjs`、`qa/mps-report-routes.test.mjs`、`qa/mps-report-ui.test.tsx`。`qa/mps-report-real-source.mjs <保存的workbooks目录>` 只读消费已有成功 run，禁止重算或回退当前输入。合成边界测试、真实保存来源模块、注册路由 transport、自测页面及独立 QA/UAT 的证据性质分别标识；未执行项不得迁签。

本 CR 初始有限负载累计不超过 600 秒、每命令不超过 180 秒，必须等 #147 final RELEASED/owned0/pending0 及 PM 窗口，再 fresh 核容量和保护。持久候选、preview、浏览器、实际主求解、install、pull、旧实例操作和发布的新增授权均为 0。公开发布及用户 UAT 不属于本实现结论。

恢复：本报表只读，不需要库存/方案数据回滚。临时编译产物写独立 temp 路径；不覆盖旧 dist、state、native 或冻结输入。唯一 main writer APS-Dev 精确串行整合 source 差分；现有分支普通 push，不 force/reset/revert。新受控 register 项见本目录 `register-entry.json`，与真实接入同时串行登记；该准备文件本身不等于共享 change-register 已更新。

## 2026-11-04 连续功能自测修订

原产品 event `dlv_213b9093-b08d-4604-a8f5-f220059a06ce:r4`；接续合同为 #140 评论 6623078955。模块/注册路由 14 项及页面 SSR/分页助手 4 项通过；真实既有 v2/v3 各 140 件物料，冻结来源、只读 HTTP、全筛选导出及关闭重开已执行。这里只记录开发自测，不代签独立 QA、UAT 或发布。

真实完整导出发现 SpreadsheetML 2003 单表超过行数上限；已改为每表最多 60000 行、连续多工作表，不改变 CSV、筛选、来源或业务数值。65537 行边界自测与实际 67928 行导出解析均通过，后者拆为 60000/7928 两表，140 件物料、2240 条矩阵行和 65535 条来源字段行完整一致。安全库存查询按有效日期建立物料索引；保留冻结/参考、真实零与未知含义，不引入 PAB 或占用默认。

构建基于 Dev 后继 `5ec346bd67f411bbb0fe0904b16bca294425999b` 的独立源码、依赖及 state 副本，叠加本修订 MPS 窄差分；Dev 后继自身 `UrgentOrders.tsx` 的 TS6133 另有单字符 `_a` 窄修正，仅在隔离候选验证，交唯一 writer 精确应用，未改公共产品文件。该组合完整 build 通过，不能将未修正 Dev 原 SHA 或当前分支整树冒签为相同已构建树。

最后补工作台父入口 SSR 前，原受保护 exited 容器 `5af6de07197021e432e08c7d37d6a6ad79e7dcc2fb4220fdd53887c8a0cbb8ca` 消失，并出现新 APS-Test2-dev `14e331a8f1d8830a58adf755a790c59cb5d988815fc2aec15f2b079818fe43c5`。已 STOP，补测未启动；此前最后一次 XML/build 结束保护全等。保留已通过结果，后续运行由 PM 协调当前 owner/保护事实。

权限仍 OUT_OF_SCOPE_BY_USER；PAB、占用归属/批次投影/执行衔接数值及浏览器交互未升签。XML 非 XLSX，精确维护上下文链接仍未接入。原件在 APS-Test 的 `APS-ISSUE140-Test-r4-REPORT.txt`、`-RESULT.json`、`-MATRIX.csv` 与 `-EVIDENCE.zip`。main/公共文件仅 Dev 串行精确整合，不盲合整个源分支。
