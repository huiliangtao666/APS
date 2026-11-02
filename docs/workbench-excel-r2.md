# 默认 Excel 排程工作台 r2

本实现沿 #45 同一 CR。实施依据是 [PM 合同 6561364141](https://github.com/huiliangtao666/APS/issues/45#issuecomment-6561364141)，设计固定 [3efbcce390b48104eaa2e6d46f984baa3ce08756 的 r2](https://github.com/huiliangtao666/APS/tree/3efbcce390b48104eaa2e6d46f984baa3ce08756/docs/requirements/proposals/CR-INPUT-SCHED-UX-20261102/r2)。04 切片、05 的 32 条断言和 09 的 14 断点为本次验收依据；r1 的并列主线方案已被替代。私有用户原件不进 Git。

## 使用

默认页面是工作簿日语义工作台。A1 分别选择业务 Excel 和参数 Excel；各自预览并核对逐字段原值/拟值后提交。业务文件可新建或替代已有数据集，严格业务入口完整替代业务表，删除也必须先在差异中查看。旧不带 importKind 的 API 继续原有混合工作簿/保留缺行行为。参数文件必须指定已存在数据集；主路径明确“导入并采用可用参数（第二份优先）”，也可选择仅存候选，预览后仍须确认才生效。B/P/在线EDIT、CAL、渐进维护及当前验证边界以[双原件纠偏说明](workbench-two-file-precedence.md)为准。参数模板使用原 CP/SP/PA 分层；空白业务模板按当前 schema 导出，不注入现场值。

A2 检查当前范围并补缺。A3 核对窗口、需求、scope、开始日、双文件、在线 overlay、实际采用参数指纹及映射。A4 创建运行并冻结；服务端复查当前版本与就绪 token，旧摘要不能悄悄使用新版本。A5 显示同 run 的结果、真实 tasks 日轴甘特、问题、冻结来源、冻结查询。A6 按原 run 导出。运行本身已经持久化，不另造“保存方案”的假动作；从历史选择重开原 run。

统一参数页与步骤页使用既有同源参数对象。参数浏览有效日与运行开始日明确分开；运行只按开始日解析，不推定跨期自动换值。批量 trial 导入禁用；已有逐项试算能力保留。查询只读，工装维护仍写所选 workbook 数据集；子视图保存后 newRef 升级并重查，保留需求/窗口/范围，查询/取消/兼容往返不改数据。409 保留编辑草稿；浏览器刷新恢复 dataset/run 身份和选择，并明确未提交的记录草稿须重新核对，不伪装保存。

CSV/分钟能力从显式兼容入口打开，不写 Excel 数据集。`?mode=native` 可显式打开兼容排程；兼容页提供返回原工作台按钮，组件不卸载。原生 `/api/state`、`/api/inputs`、`/api/runs`、plans 未改写；不拿它们的内容当 Excel 查询或甘特。

## 新增 API 约束

- `POST /api/workbooks/preview`：新入口带 `importKind=business|parameter`、`datasetId`、`expectedVersion`、`mode=candidate|dataset`、`scope=dataset`、`adoptParameters`、`fileBase64`、`fileName`。错卡、目标不存在、非法 scope/用途或版本不符拒绝。业务卡不允许顺带采用参数；不带 kind 保留旧调用。
- 预览产生 `previewFingerprint`、`snapshotHash`、`detectedKind`、逐字段 `changeSet`。指纹绑定预览 ID、来源、目标版本、kind、mode、scope、owner、快照和差异。有效输入尚未提交。
- `POST /commit`：除原字段外，严格入口须原样回传 fingerprint/kind/dataset/mode/scope。服务端逐项核对；旧预览按原 importKey 幂等返回，同一次响应丢失后先 `GET /previews/:id` 查询结果。新去重键包含目标、预览基版和作用域。提交前核快照 hash、ID/版本及行错误；只有原子 state 发布使版本生效。
- `POST /datasets/:id/readiness`：带 version、selection、parameterScope。返回 checkedRef、token、issues、ready。检查包含当前源快照、选择、scope、开始日、业务/参数来源、overlay/映射及实际采用值。结构/类型/同源冲突仍严格检查；合法不完整资料可保存，运行门槛按选定需求及共享依赖检查，全库问题单独显示，不把 168CP 变成全局必填。
- `POST /datasets/:id/run`：新工作台带 `currentVersion:true` 和 `readinessToken`；当前版本变化 `409 INPUT_CHANGED`，范围/参数摘要不匹配 `409 READINESS_CHANGED`，阻塞 `422`。都在创建运行和 Worker 前返回。旧 API 显式历史 version 的行为保留。
- 新运行 provenance 增加 workbook model/engine、双来源、overlay、selectionHash、actualRecordsHash、effectiveAt。原文件 hash 不因在线修改而伪造重导。历史不补写元数据。既有计算 Worker、独立复核和冻结结果校验继续使用。
- `GET /runs/:id/rows?table=...&q=...&offset=...`：从该 run 的冻结 inputs 分页读取，回传同 runId/inputHash/resultHash；损坏或来源不符 `409`，不回退当前数据。
- `GET /business/template`：沿导出权限返回当前 profile 的空白 OOXML。参数模板继续 `/parameters/template`。

日轴直接绘制该 run 的 tasks：[start,end)、原 dayZero、资源 ID、数量及需求/工装/source 不重新求解、不转入 native store。任务详情可返回甘特、打开冻结来源；问题中的合法 taskIds 可定位同 run。所有任务绘制，不以未排需求造条。UI 也验证 dataset/version/file/parameter/mapping/time 单位身份，整块结果拒绝混用；服务端仍是 hash/权限最终裁决者。日容量不含日内分钟开工或班次事实。

日调度器在已采用参数合同下过滤数量 0 的设备/物理工装；独立复核同样拒绝在数量 0/未知的工装上排任务。候选 0 不改变有效配置；沿既有物理池 ID 和能力公式，未增加资源倍增/新求解策略。旧无参数合同 profile 保持原行为。

## 显式转换边界

高级区仅预览所选 dataset 的转换。日→分钟返回字段级 D01/D02/D03/D04/D05/D06 不足和 `mayCommit=false`，确认入口拒绝；拒绝无写入。不假设 08:00、8小时、损耗、现场池、跨线或跨源身份。

唯一可确认的新转换是同 profile 的隔离副本：来源全快照 hash、mappingVersion、targetPreviewHash 必须一致；产生一个新目标 dataset/version，记录 sourceRef→targetRef，原 dataset 和 native 不写，重复同 conversionId 不再创建。含私有 trial 的数据集不复制，避免把他人 trial 归入新身份。跨模型 CSV→Excel 和 native→Excel 尚无批准无损字段映射，维持明确兼容入口及局部转换拒绝，不声称已提供这类确认能力。

## 工程验证与运行窗口

在官方 `app-exec.sh --validate --mode standalone --cwd /workspace/apps/aps-b12-pack-batch` 中运行 `sh qa/workbench-r2-validation.sh`。脚本先检查 MemAvailable≥2GiB，复制既有 Linux 依赖至一次性目录，标准构建 heap≤640MiB，其后测试串行 heap≤128MiB，不安装依赖，不写在线 dist/state，不监听 HTTP，不创建 Worker/浏览器。所有夹具均由仓库明确仿真字面值生成；`qa/workbench-r2-fixtures.mjs` 仅为无 Python runtime 的等价夹具载体。

新增纯计算测试演示 180→200kg、参数 1→候选0→采用0 和旧对象不变；注册路由测试覆盖版本竞争、403、快照损坏、零部分写、幂等、转换和冻结查询/导出。冻结路由正例**手工放入纯计算产物**，不是实际 Worker 证据。SSR 只验证初始文案、disabled 原因、真实 task 数值投影和拒绝串用，不是浏览器操作通过。

本次预算：应用启动/重启/真实 Worker/浏览器=0。14 个真实数据流断点和 32 条完整用户路径均须另获隔离运行窗口才能签实际通过；工程支持断言逐项在交付矩阵列示，不能迁签成 UAT。整个 CR `effective=false` 保留，当前授权切片为源码实施依据；本说明不宣称产品已部署、QA或最终用户UAT通过。main 未合并或推送，旧 0afa/18302 及历史 PASS 保留原 SHA。

## 2026-11-02 双原件纠偏接续

本文件前述工程 PASS 是原 e1828ced 等历史固定源码的记录，不适用于新来源层候选。当前纠偏仅完成源码准备与静态核验；采用范围/来源、目录和CAL、scope依赖及在线覆盖详见[最新工程说明](workbench-two-file-precedence.md)。新源的构建、产品测试和真实UI/Worker均NOT_EXECUTED，main整合/部署未授权，CR effective=false。

## 2026-11-02 首版大预览接线

后续首版范围与main精确整合已由 #45 comment6570898699 授权，覆盖上文此范围的旧“main未授权”快照。新预览用不可变摘要、服务端分页/全文筛选、完整导出及同事务整批确认；工程结果按最终完整SHA单列，不迁签原源或真实运行。详见 [首版接线及未验边界](workbench-large-preview-first-stage.md)。CR effective=false、旧0afa/18302及原SHA证据保留。
