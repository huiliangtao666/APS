# FR018范围说明修复独立验收与Design决定

## FR018独立复测收妥与卡级验收（2026-10-29T14:01:41+08:00）

event_key `dlv_746c521a-23b2-405f-8574-1dc7bf4b3769:r1`；通知delivery `dlv_c03c748a-efb2-4986-83f0-9fb77f2f4390`。
需求APS-BL-001 v0.3，本卡无生效CR。接受产品分支feat/fr-013-016-main-batch、完整SHA `18c2f59761c9db69554f33a2870b68e15d092320`；基点 `12eed5514c702f730aae65a39a08747c532f8536`。

**v0.3本卡适用责任断言全部独立PASS；原六条PASS按原SHA/来源保留，本轮18-06及A1–A5 PASS解除唯一阻断。Design接受完整产品SHA，FR018 Done。** 关闭18-06 / FR018-SCOPE-NOTE01，产品修复round1、修复后独立复测round1。无本范围FAIL/PARTIAL/BLOCKED或必测NOT_EXECUTED，最小剩余动作无；Issue14本FR018验收跟踪收口。

- A1 / 18-06：固定支持能力、未冻结配置预览及历史保存scope分列一致；不再否认模拟累计事实、原始保护和显式剩余分钟。
- A2：部分事实40kg，真实Worker A-MIX30..50（20分钟）/后序50..80；旧输入和plan保留，后续规则/事实变更不改保存结果。
- A3：E1事件30、保护45及原始事实保留；partial/0任务和EXECUTION_EVENT_REVIEW原因清楚，无自动恢复或质量推断。
- A4：minimal有事实UI/API均拒绝且存储字节不变；无事实新隔离存储、MATERIAL关闭/2099待生效和assessRules三条件一致。
- A5：旧缺失checkScope用浏览器只读GET响应契约样本验证未知呈现，非声称发现真实旧记录；未改持久历史。真实输入/plan全量相等，3/3输入及执行快照hash独立重算一致。

原18-01/02/03/04/05/07六条PASS沿用 `12eed5514c702f730aae65a39a08747c532f8536` 及更早原SHA、原报告和来源；旧18-06在旧SHA仍FAIL，不倒写为PASS。当前代码仅RunPanel.tsx 7增2删，未改调度/耗料/恢复算法或默认值；本轮不是旧六条全范围重跑。FR019/024 Done不重开，D01-D03等不增加轮次。

Design通过File API取得Test四份原件：3外部SHA256、ZIP103条目CRC、102内部hash全部匹配；RunPanel/server-run-input/scheduling-scope/execution-facts四项GitHub源码hash匹配。复核报告、11行断言CSV（5新PASS+6沿用PASS）、中文DOM/截图、正式complete=true/errors为空、两条保存输入及plan全量不变；不代Test重复产品执行。Test在一次性应用QA容器build PASS，四次工装尝试原记录保留，不算产品缺陷。

设计/需求/流程读取SHA `10c839cd5609b94a49a21d1f856135f27ff3dc3d` 单列，非产品SHA。Test在该版本读取scope-note01单篇设计交付文档404的限制保留，未补造文档SHA；完整派工/基线/Issue14回写足够支持此次限定复测。

[逐条报告](fr018-scope-note01-18c2f597-test-r1-report.md)、[11行断言](fr018-scope-note01-18c2f597-test-r1-assertions.csv)、[外部hash](fr018-scope-note01-18c2f597-test-r1-sha256.json)。完整原始归档APS-Test根目录 `FR018-SCOPE-NOTE01-18c2f597-INDEPENDENT-R1-EVIDENCE.zip`，SHA256 `46199f5d2bee5d1e7e526616a077a37bc75c74bb9a18e9ec3cb28a46a62ab60b`；原始目录APS-Test/temp/fr018-scope-independent-evidence/，Design核验副本在temp/fr018-close-r1/。归档和旧证据保留。

共享AC仅本FR责任；SSO/全项目UAT/他卡/发布/main合并不是通用关闭门槛。本结论未认证真实Gateway身份或业务UAT，业务负责人huiliangtao666未代签。其他未开始backlog和DEC04/05/06应用实现继续暂停；巡检仍paused，没有应用发布或产品main合并。后续Test仅续派已有交付的存量责任验收，另记唯一任务，不重复本轮。
