# APS-Dev原始交付报告（非独立Test）

```text
FR034 / Issue13 — RESOURCE-EXPLAIN-01首次限定修复
原delivery: dlv_870a893a-a332-4eac-a209-719af311d3e8；修订r1；event_key: dlv_870a893a-a332-4eac-a209-719af311d3e8:r1
原Test delivery: dlv_40ab364a-e651-424a-b211-5fcf85cbd17e；失败pin: 24ba6884b3a5f07425a728b7733a677563c6aa44
分支: feat/fr-013-016-main-batch；最终产品SHA: 12eed5514c702f730aae65a39a08747c532f8536
https://github.com/huiliangtao666/APS/commit/12eed5514c702f730aae65a39a08747c532f8536
需求: APS-BL-001 v0.3，FR034第二条/AC17，无直接CR；规则来源Issue3/16。
唯一原卡: https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHhDI
原Issue: https://github.com/huiliangtao666/APS/issues/13
修复轮次: 首次round1；独立修复后复测0。Dev结果PASS（本有限修复）；整卡NOT_READY，待Test与Design判断。不是D01-D03 round2，不关闭原卡/Issue或补造UAT。

根因和改动
既有检查器只有超容量文字且泛关联全部任务；FR034只支持机器/前后序几何。本次保留原检测和调度，新增固定输出窗口扫线：按真实工装/人员/空间资源账生成resource type/ID、实际冲突taskIds、半开区间、合计需求/有效容量/配置总量/单位、规则时点及冻结版本、配置/声明/占用引用。多任务链接的同一账只计一次；未知来源只保留普通问题，不造区间。前台从同保存方案冻结输入重新核对结构后才显示资源区间，提供人数/容量/余额与扣减口径，甘特绘制真实资源窗口，保留原历史输入联动。当前独立检查范围文案同步说明资源约束；不宣称全部策略验证。
修复代码及契约: docs/FR034-RESOURCE-EXPLAIN-01.md；src/lib/resource-conflicts.mjs、verify-resource-policies.mjs、independent-verification.mjs、task-linkage.mjs及TaskLinkage.tsx。S06候选checkpoint是此前已保存的独立提交，本修复未顺带扩展人员分配业务。

逐条结果（Dev）
T01 PASS：真实Worker工装任务0..30/40..70、账0..40/40..80合法相邻。既有copy→move-preview→recheck拒绝冲突候选。只在隔离临时业务库同步移动任务/账的标名FR034-ILLEGAL-tool副本，主前台主动verify→点问题显示[0,40)、合计需求2套/有效容量1套，包含30..40后延；选中同A/B两任务、筛选、甘特区间及同保存方案冻结原输入均正确。
P01 PASS：真实Worker任务0..30/5..35、参与窗5..10/10..15合法相邻。标名非法副本才产生[5,10)需2/容量1人；前台显示及参与/释放依据一致，不把整个任务重叠当人员冲突。
R03 PASS（这两个代表例）：结构化窗口显示规则采用时点、resourcePolicyVersion、冻结配置/声明/真实占用、有效容量与余额公式；无需导出。不存在/未知来源、伪造区间/数量/容量/资源/任务集合不显示几何。
R01/R02 PASS：异常检出、同两任务选择/筛选、同方案冻结输入定位保留。额外无关任务控制只在新单元夹具中验证不进入冲突taskIds；这是额外保护，不改写原Test未测结论或另计第二缺陷。
M01 PASS：真实Worker和前台325kg需求/可用0/缺口325，投料/BOM/质量与同源原输入保持；未排物料没有伪造甘特窗口。
H01 PASS：两个真实submit/主管confirm的完整原plan及confirmation在新配置/Worker/预览/非法副本复核后全量相等；原在线历史从未写入。

验证与限制
最终修复/任务联动/UNKNOWN相关单元12/12；其中新修复4组。S06专项12/12，相关140/140，库90/90、权限业务124/124、编辑器10/10、资源面板1/1、原参数化浏览器12检查均通过；这些与其他suite交叠，不累计唯一验收。
真实修复浏览器工具/人员/物料3场景PASS、complete=true、browserErrors=[]，保存完整API请求响应、冻结输入、正常Worker/非法副本区别、截图/DOM和完整历史对象。
旧键盘脚本完成20结果行（18 pass断言+2滚动量测），另8 audit观察原样保留，未把它们全称可访问性认证；最新boundary脚本14断言组通过，UNKNOWN24组、history4组/19响应通过。当前源另建有限manifest，没有改原历史证书来掩盖差异。
最终干净容器npm ci+tsc/Vite/server/Worker构建exit0；隔离准备依赖QA build通过；34保护文件与24ba688及原Test manifest全部一致。合成成员/真实业务权限中间件+runtime alias，不是签名Portal/SSO或人类UAT。没有发布、main合并、在线库/历史篡改、GitHub状态改动或backlog启动。
证据包: FR034-RESOURCE-EXPLAIN-01-EVIDENCE-2026-10-29.zip；含原Test probe/results/report、adapted probe、最终fix/results.json及problem-detail/timeline截图、keyboard/UNKNOWN/history/boundary、相关回归日志、源hash/构建/push证据。原Test FAIL证据不改；新PASS是Dev有限自测，待独立Test固定新SHA复测T01/P01/R03及保护。
下一步APS-Design负责收妥、去重、维护原Issue13/FR034卡并派/复用独立APS-Test。本任务保持NOT_READY；完整FR034其他责任范围及其独立验收由Design判断，不以此Dev报告直接Done。通知状态另附，未收PROCESSED只记已发送待回执。

```
