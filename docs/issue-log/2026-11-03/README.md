# APS 今日问题日志 · 2026-11-03

按 **Asia/Singapore** 日期，从 APS-Test2 当前会话逐条核对；每条用户对话一个独立 Issue，多点列表不拆单。“继续”、范围澄清及处理去向也分别登记；首次登记的最后一条为登记任务自身；后续对话在文末追加。

- **首次登记：77 条对话 → 77 条 Issue，全部 Closed / completed（已完成）。**
- **首次登记74 张原始截图**已直接嵌入对应 Issue；原图字节与远端 Git blob 逐一一致。
- 两个参考 HTML 的文件名、原路径、SHA256、大小及受控设计链接保留在对应 Issue；其内嵌完整数据未公开。
- 每条包含原问题、时间、解决方式、代码/验证依据及限制。[结构化记录](issues.json) · [附件清单](attachments.json) · [读回核对](verification.json)。

## 状态含义

**“已完成”按每条实际处理范围记录。** 已实现的修改关联固定代码提交；咨询类以答复完成关闭。容量共享＋准备/运行两阶段是已确认并记录的设计决定，尚未实现新模型；统一图上风险标记是已答复的展示建议，尚未实现该增量。演示数据和开发自测不替代真实业务验收，不因本日志关闭既有需求/CR主卡或代签 QA/UAT。当天后续调整入口、取消必填说明等以各条时间顺序理解，不把早期操作说明当作最新界面。

## 逐条索引

| 序号 | 提出时间（新加坡） | GitHub Issue | 完成范围 | 附件 |
|---:|---|---|---|---:|
| 01 | 09:26:13 | [#60 再次检查分支并合并到 main](https://github.com/huiliangtao666/APS/issues/60) | 实现／处理交付完成 | 0 |
| 02 | 09:29:28 | [#61 拉取最新 main 并构建应用](https://github.com/huiliangtao666/APS/issues/61) | 实现／处理交付完成 | 0 |
| 03 | 09:31:22 | [#62 CR 的五类查询和六类设备视图没有体现](https://github.com/huiliangtao666/APS/issues/62) | 实现／处理交付完成 | 0 |
| 04 | 09:32:25 | [#63 继续核查查询与六视图的入口及线上版本](https://github.com/huiliangtao666/APS/issues/63) | 咨询／核查答复完成 | 0 |
| 05 | 09:37:13 | [#64 创建运行按钮无法点击的前提条件](https://github.com/huiliangtao666/APS/issues/64) | 咨询／核查答复完成 | 1 |
| 06 | 09:39:33 | [#65 如何配置并检查当前排程范围](https://github.com/huiliangtao666/APS/issues/65) | 咨询／核查答复完成 | 1 |
| 07 | 09:40:16 | [#66 DEMAND_CHANGED 报错如何修正](https://github.com/huiliangtao666/APS/issues/66) | 咨询／核查答复完成 | 1 |
| 08 | 09:42:25 | [#68 每日需求的查询入口在哪里](https://github.com/huiliangtao666/APS/issues/68) | 咨询／核查答复完成 | 0 |
| 09 | 09:46:16 | [#69 两套入口与工作台页面及交互逻辑梳理](https://github.com/huiliangtao666/APS/issues/69) | 咨询／核查答复完成 | 0 |
| 10 | 09:52:50 | [#70 同数据集的含义、实例与分类](https://github.com/huiliangtao666/APS/issues/70) | 咨询／核查答复完成 | 1 |
| 11 | 09:59:53 | [#71 独立功能页、步骤路标及仅保留 v4 数据入口](https://github.com/huiliangtao666/APS/issues/71) | 实现／处理交付完成 | 1 |
| 12 | 10:13:21 | [#72 应用 activate 超时](https://github.com/huiliangtao666/APS/issues/72) | 实现／处理交付完成 | 0 |
| 13 | 10:29:17 | [#73 旧 CSV／分钟模式入口的含义](https://github.com/huiliangtao666/APS/issues/73) | 咨询／核查答复完成 | 1 |
| 14 | 10:30:29 | [#74 隐藏旧版 CSV／分钟页面及入口](https://github.com/huiliangtao666/APS/issues/74) | 实现／处理交付完成 | 0 |
| 15 | 10:34:44 | [#75 Excel 上传、预览、确认及成功提示](https://github.com/huiliangtao666/APS/issues/75) | 实现／处理交付完成 | 1 |
| 16 | 10:39:02 | [#76 配置参数 Excel 采用方式及在线修改冲突策略](https://github.com/huiliangtao666/APS/issues/76) | 咨询／核查答复完成 | 2 |
| 17 | 10:50:50 | [#77 共享操作区与操作记录的用途](https://github.com/huiliangtao666/APS/issues/77) | 咨询／核查答复完成 | 1 |
| 18 | 10:51:54 | [#78 删除共享操作区及手填操作说明要求](https://github.com/huiliangtao666/APS/issues/78) | 实现／处理交付完成 | 0 |
| 19 | 10:53:42 | [#79 导入失败原因不可追踪](https://github.com/huiliangtao666/APS/issues/79) | 实现／处理交付完成 | 1 |
| 20 | 11:00:28 | [#80 修改日数据文件后 INPUT_TOO_LARGE 报错](https://github.com/huiliangtao666/APS/issues/80) | 实现／处理交付完成 | 1 |
| 21 | 11:04:08 | [#81 已导入 v4 历史版本没有显示](https://github.com/huiliangtao666/APS/issues/81) | 实现／处理交付完成 | 1 |
| 22 | 11:09:28 | [#82 用业务语言说明检查能力与可选操作](https://github.com/huiliangtao666/APS/issues/82) | 实现／处理交付完成 | 1 |
| 23 | 11:11:19 | [#83 设备甘特对照原型提高可读性](https://github.com/huiliangtao666/APS/issues/83) | 实现／处理交付完成 | 1 |
| 24 | 11:18:54 | [#84 参照五类查询原型整体压缩页面嵌套](https://github.com/huiliangtao666/APS/issues/84) | 实现／处理交付完成 | 1 |
| 25 | 11:20:10 | [#85 全应用参照 UI 样式调整且保持业务逻辑](https://github.com/huiliangtao666/APS/issues/85) | 实现／处理交付完成 | 0 |
| 26 | 11:24:44 | [#86 BOM 与提前期图对照设计稿修改](https://github.com/huiliangtao666/APS/issues/86) | 实现／处理交付完成 | 4 |
| 27 | 11:33:41 | [#87 筛选区多行分散、选择操作范围过大](https://github.com/huiliangtao666/APS/issues/87) | 实现／处理交付完成 | 4 |
| 28 | 11:34:28 | [#88 将紧凑设计要求覆盖应用所有页面](https://github.com/huiliangtao666/APS/issues/88) | 实现／处理交付完成 | 0 |
| 29 | 11:35:14 | [#89 能一行不多行、能一格不拆格](https://github.com/huiliangtao666/APS/issues/89) | 实现／处理交付完成 | 0 |
| 30 | 11:43:27 | [#90 设备甘特按原型实现紧凑清晰的一屏总览](https://github.com/huiliangtao666/APS/issues/90) | 实现／处理交付完成 | 2 |
| 31 | 11:49:32 | [#91 标题说明和数据来源控件同排减少高度](https://github.com/huiliangtao666/APS/issues/91) | 实现／处理交付完成 | 1 |
| 32 | 11:53:32 | [#92 合并结果表头、筛选、每页及翻页操作](https://github.com/huiliangtao666/APS/issues/92) | 实现／处理交付完成 | 1 |
| 33 | 11:58:17 | [#93 日期选择显示真实日历日期](https://github.com/huiliangtao666/APS/issues/93) | 实现／处理交付完成 | 1 |
| 34 | 13:43:55 | [#94 全应用筛选和分页控件字体与间距统一](https://github.com/huiliangtao666/APS/issues/94) | 实现／处理交付完成 | 1 |
| 35 | 13:56:18 | [#95 核查业务数据、参数、查询与工装的数据源和重叠](https://github.com/huiliangtao666/APS/issues/95) | 咨询／核查答复完成 | 1 |
| 36 | 14:03:20 | [#96 合并查询维护页面并删除工装及旧配置入口](https://github.com/huiliangtao666/APS/issues/96) | 实现／处理交付完成 | 0 |
| 37 | 14:28:15 | [#97 BOM 移除日期区间且下拉框同时只展开一个](https://github.com/huiliangtao666/APS/issues/97) | 实现／处理交付完成 | 2 |
| 38 | 14:34:48 | [#98 BOM 先表后图、紧凑图示及默认全选](https://github.com/huiliangtao666/APS/issues/98) | 实现／处理交付完成 | 1 |
| 39 | 14:41:52 | [#99 提前期路径先表后图、成品多选及默认全选](https://github.com/huiliangtao666/APS/issues/99) | 实现／处理交付完成 | 1 |
| 40 | 14:47:55 | [#100 删除重复标题、上移信息及固定导航](https://github.com/huiliangtao666/APS/issues/100) | 实现／处理交付完成 | 1 |
| 41 | 14:57:57 | [#101 需求明细移除非成品和客户等级筛选](https://github.com/huiliangtao666/APS/issues/101) | 实现／处理交付完成 | 1 |
| 42 | 15:02:22 | [#102 按日需求简化筛选及隐藏业务键](https://github.com/huiliangtao666/APS/issues/102) | 实现／处理交付完成 | 1 |
| 43 | 15:06:57 | [#103 库存按物料质量状态分行、日期横向显示](https://github.com/huiliangtao666/APS/issues/103) | 实现／处理交付完成 | 1 |
| 44 | 15:25:39 | [#104 工艺与班组简化筛选并增加路线编号](https://github.com/huiliangtao666/APS/issues/104) | 实现／处理交付完成 | 1 |
| 45 | 15:33:24 | [#105 停机安排仅保留资源、开始和结束筛选](https://github.com/huiliangtao666/APS/issues/105) | 实现／处理交付完成 | 1 |
| 46 | 15:38:14 | [#106 设备能力仅保留资源、资源组和资源类别](https://github.com/huiliangtao666/APS/issues/106) | 实现／处理交付完成 | 1 |
| 47 | 15:42:56 | [#107 人员工装增加逐日可视化图表](https://github.com/huiliangtao666/APS/issues/107) | 实现／处理交付完成 | 1 |
| 48 | 15:51:12 | [#108 配置参数基线、日志、筛选、当前值与对象化展示](https://github.com/huiliangtao666/APS/issues/108) | 实现／处理交付完成 | 4 |
| 49 | 16:41:44 | [#109 汇总排程问题、影响和计算说明](https://github.com/huiliangtao666/APS/issues/109) | 实现／处理交付完成 | 2 |
| 50 | 16:55:30 | [#110 核查已排任务与 WIP 保留的计算及明细缺口](https://github.com/huiliangtao666/APS/issues/110) | 咨询／核查答复完成 | 1 |
| 51 | 17:05:02 | [#111 删除已归集到结果及六视图的重复信息区域](https://github.com/huiliangtao666/APS/issues/111) | 实现／处理交付完成 | 1 |
| 52 | 17:13:45 | [#112 设备甘特节点打开计算分析悬浮窗](https://github.com/huiliangtao666/APS/issues/112) | 实现／处理交付完成 | 1 |
| 53 | 17:36:57 | [#113 DE620 为什么未排并计入结果问题](https://github.com/huiliangtao666/APS/issues/113) | 咨询／核查答复完成 | 1 |
| 54 | 17:49:27 | [#114 55kg、600kg 批量与 1440 分钟占用的区别](https://github.com/huiliangtao666/APS/issues/114) | 咨询／核查答复完成 | 1 |
| 55 | 17:52:31 | [#115 固定一天与机位独占规则在哪里维护](https://github.com/huiliangtao666/APS/issues/115) | 咨询／核查答复完成 | 0 |
| 56 | 18:02:34 | [#116 RT072 的 CP092 修改为 0.5 是否生效](https://github.com/huiliangtao666/APS/issues/116) | 咨询／核查答复完成 | 0 |
| 57 | 18:05:09 | [#117 非独占机位的通用准备及加工时间配置建议](https://github.com/huiliangtao666/APS/issues/117) | 咨询／核查答复完成 | 0 |
| 58 | 18:17:21 | [#118 确定容量共享及准备、运行两阶段配置方案](https://github.com/huiliangtao666/APS/issues/118) | 用户设计决定记录及答复完成；应用代码未实现该新增模型 | 0 |
| 59 | 18:19:54 | [#119 将 DE620 等处理规则写入明细说明](https://github.com/huiliangtao666/APS/issues/119) | 实现／处理交付完成 | 0 |
| 60 | 18:33:44 | [#120 每项配置参数补充含义、影响及取值维护提示](https://github.com/huiliangtao666/APS/issues/120) | 实现／处理交付完成 | 1 |
| 61 | 18:56:14 | [#121 提高大文件导入容量且不增加交互功能](https://github.com/huiliangtao666/APS/issues/121) | 实现／处理交付完成 | 1 |
| 62 | 19:07:11 | [#122 参数帮助提示去重并统一感叹号样式](https://github.com/huiliangtao666/APS/issues/122) | 实现／处理交付完成 | 3 |
| 63 | 19:19:50 | [#123 修复新导入文件的 WIP 映射并使其生效](https://github.com/huiliangtao666/APS/issues/123) | 实现／处理交付完成 | 1 |
| 64 | 19:22:43 | [#124 v8 导入后如何使排程计算生效](https://github.com/huiliangtao666/APS/issues/124) | 实现／处理交付完成 | 0 |
| 65 | 19:27:05 | [#125 整理导入问题并要求修复 Excel 的处理去向](https://github.com/huiliangtao666/APS/issues/125) | 按后续用户指令改为自行处理并完成 | 1 |
| 66 | 19:27:46 | [#126 继续导入校验和数据修复进程](https://github.com/huiliangtao666/APS/issues/126) | 实现／处理交付完成 | 1 |
| 67 | 19:28:59 | [#127 按最新要求自行修复并完成新排程运行](https://github.com/huiliangtao666/APS/issues/127) | 实现／处理交付完成 | 0 |
| 68 | 20:56:47 | [#128 需求交付增加甘特图及节点分析](https://github.com/huiliangtao666/APS/issues/128) | 实现／处理交付完成 | 1 |
| 69 | 21:12:22 | [#129 物料风险增加甘特图及节点分析](https://github.com/huiliangtao666/APS/issues/129) | 实现／处理交付完成 | 1 |
| 70 | 21:29:07 | [#130 人员工装按参考图改为紧凑资源日期矩阵](https://github.com/huiliangtao666/APS/issues/130) | 实现／处理交付完成 | 1 |
| 71 | 21:42:04 | [#131 需求交付悬停摘要及五页签悬浮窗](https://github.com/huiliangtao666/APS/issues/131) | 实现／处理交付完成 | 6 |
| 72 | 22:12:23 | [#132 设备负荷按参考图改为逐日矩阵](https://github.com/huiliangtao666/APS/issues/132) | 实现／处理交付完成 | 1 |
| 73 | 22:25:11 | [#133 设备甘特悬停摘要及统一五页签浮窗](https://github.com/huiliangtao666/APS/issues/133) | 实现／处理交付完成 | 1 |
| 74 | 22:37:07 | [#134 删除同 run 等重复描述](https://github.com/huiliangtao666/APS/issues/134) | 实现／处理交付完成 | 2 |
| 75 | 22:41:27 | [#135 结果主页面保留指标并以下划线数字打开明细弹窗](https://github.com/huiliangtao666/APS/issues/135) | 实现／处理交付完成 | 1 |
| 76 | 22:41:59 | [#136 四类图表如何直观显示排程问题与风险](https://github.com/huiliangtao666/APS/issues/136) | 风险展示建议答复完成；新增统一图上标记未实现 | 0 |
| 77 | 22:46:40 | [#137 逐条登记今日对话和截图为已完成 GitHub Issue](https://github.com/huiliangtao666/APS/issues/137) | 日志登记完成 | 0 |

核对时间（UTC）：2026-11-03T15:03:27.394567+00:00。74张截图固定于提交 `5a23d75f1e7c80114fc14e7c5a674c376e376e00`；处理记录中的产品SHA分别保留，不以文档提交替代产品实现版本。

## 后续追加

首次77条及其核对记录保留原截点；本次追加1条、2张原始截图，当前索引累计78条Issue。

- [#138 物料风险甘特浮窗：基本信息和受影响需求](https://github.com/huiliangtao666/APS/issues/138) — 已完成（Closed / completed）；13项任务级检查、构建及正式入口检查通过，非真实业务UAT。

- [#139 运行问题含义与WIP导入来源核对](https://github.com/huiliangtao666/APS/issues/139) — 已完成（咨询/只读核查答复），附原截图；本次未修改代码或运行。后续追加现为2条、3张截图，索引累计79条Issue。

- [#143 五类排程图表按字段分列并选择显示栏位](https://github.com/huiliangtao666/APS/issues/143) — 已完成（Closed / completed）；附原截图与实现提交，15项相关检查、构建和正式资源核查通过。

- [#144 继续登记新交互并关闭已完成事项](https://github.com/huiliangtao666/APS/issues/144) — 已完成（Closed / completed）；本次日志登记与状态核对。后续追加累计4条、4张原始截图，索引累计81条Issue。待批准/未实施CR保留原状态。

最新GitHub回读：索引81条均为 closed / completed（咨询、设计决定及代码实现仍分别保留各自完成口径）；#140、#141待批准CR保持open。核对时间（UTC）：2026-11-03T16:01:02.899570+00:00。
