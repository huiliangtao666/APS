FR018 / Issue14 / FR018-SCOPE-NOTE01 固定SHA独立复测round1
日期：2026-10-29 Asia/Singapore
结论：A1–A5全部PASS；18-06关闭建议；FR018整卡建议READY_DONE。
产品修复round1 / 修复后独立复测round1；仅本缺陷，未重开FR019/024或其他已通过轮次。
原delivery：dlv_746c521a-23b2-405f-8574-1dc7bf4b3769；结果修订r1；event_key：dlv_746c521a-23b2-405f-8574-1dc7bf4b3769:r1。
派工event_key：fr018-scope-note01:18c2f597:independent-retest-r1。
Dev来源：dlv_feadb3b5-bb46-4433-ab5a-f89d4f76a7e0:r1；Dev通知dlv_c4ad1508-6c8c-42cf-842f-be0eeac383a7。
产品分支：feat/fr-013-016-main-batch；固定完整产品SHA：18c2f59761c9db69554f33a2870b68e15d092320；产品基点：12eed5514c702f730aae65a39a08747c532f8536。
需求：APS-BL-001 v0.3；本卡无生效CR，GitHub current-register的applied_changes/pending_changes为空。
设计/需求/流程文档GitHub读取版本（与产品分列）：10c839cd5609b94a49a21d1f856135f27ff3dc3d。已读取该SHA的v0.3原FR018、AC12、current-register及handoff-policy。
Issue14最新Design回写独立读取至6489089900：确认18-06归属FR018第一条“本次使用的数据、规则和计算条件”呈现真实性，关联R5/AC12，非AC逐字新增中文文案。该评论不是产品commit。
最新scope-note01设计交付文档URL在上述GitHub文档版本返回404；不虚构其文档SHA。当前派工及Issue14回写完整提供已授权复测范围，本限制不影响已完成的产品独立检查。受控清单是13:35快照，较最新Issue回写早，不用它冒称实时卡状态。
唯一原卡：https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHgxI
原Issue：https://github.com/huiliangtao666/APS/issues/14

来源、隔离和有限范围
从GitHub全新clone、detached checkout固定完整SHA，不追随HEAD；首尾源码clean，远端分支查询同指定SHA。单文件差异仅src/RunPanel.tsx 7增2删，未改调度器/耗料/恢复模型、算法或默认值。完整源码tracked文件SHA256见source-sha256.json。
全部构建及应用运行在既有aps-fr038-qa-runtime镜像的一次性隔离容器。源只读挂载并复制至容器应用目录，复用既有依赖；宿主没有安装依赖或运行应用。该容器不是平台绑定应用，无改在线服务、发布、main合并或产品代码。镜像ID见source-state.json。npm run build通过，含TypeScript、Vite、Express及生产calculation-worker bundle。
真实React控件发起POST /runs→真实Express成员中间件和隔离持久化→真实生产Worker模块→前台历史/原始输入。QA synthetic成员及浏览器runtime alias只替代平台登录，不声称真实Gateway身份或业务UAT。通过采集脚本页面错误为空。两条无遮挡补充截图亦来自真实前台运行，截图瞬时隐藏吸顶导航以避免遮挡范围文案；未改变产品内容或持久数据。
Dev三外部副本hash均匹配来信、ZIP CRC有效；仅核对来源，不拿Dev截图/PASS代替本轮结论。Dev未取得原Test材料的403保留为Dev限制，本轮使用自己原独立材料。

逐项独立判定

A1 / 18-06 PASS — 固定能力、当前预览、历史保存范围一致
已清楚分列固定支持能力、尚未冻结配置预览、历史保存scope/原输入；不再错误否认模拟累计事实、原始保护与显式剩余分钟。
证据：partial-history / fault-history DOM；clear-partial-scope.png、clear-fault-scope.png；results.json；各chain.json

A2 PASS — 部分事实20分钟及冻结历史保留
真实React发起Worker：A-MIX30..50/duration20，A-FILL50..80；原始40kg累计事实及显式20分钟保留。对照旧12eed551独立保存计划同样30..50/50..80；旧运行/旧输入未重写。当前规则及事实源后续变化不改本轮已保存plan/input。
证据：partial-chain.json；frozen-after.json；references/old-r5/r5-ui.json；independent-hash-checks.json

A3 PASS — E1原始保护及阻断
E1事件30、保护截止45，原始开始0/观测30/部分40及显式20分钟保留；服务端规范化需处理事实为F-A-MIX，Worker冻结值与发起前一致。partial/0任务，EXECUTION_EVENT_REVIEW及E1原因保留，未自动恢复/转机/冲销/认定质量合格。
证据：fault-chain.json；fault-before-worker-events.json；fault-history；clear-fault-scope.png

A4 PASS — minimal事实拒绝/无事实/物料关闭和待生效
有事实minimal前台真实提交及独立API均拒绝，未新增运行且business.json字节不变；预览未列事实为minimal已检查。无事实独立新存储的supported不声称已采用事实/剩余工时，minimal只认明确范围且真实Worker完成。MATERIAL关闭或2099待生效均未列入当前已采用检查，旧历史仍保留原已采用物料范围。有限assessRules active/disabled/future三条件与UI一致。
证据：minimal-facts-rejected.json/txt/png；material-off；material-future-history；no-facts-supported/minimal；results.json assessRules三条件

A5 PASS — 旧未知scope及历史/能力边界
浏览器只读GET响应模拟旧缺失checkScope的契约样本，页面保持未知，切换当前模式不补写；这不是服务器里发现的真实旧缺失样本，且未改持久历史。真实已保存输入/计划在规则未来生效、配置模式变更及后续运行后全量一致；输入hash独立复算。文案不泛化真实执行/完整耗料核销/质量确认/FR031恢复完成。
证据：legacy-unknown-scope DOM/PNG；frozen-after.json；probe.mjs；source.patch；references旧报告

本轮真实运行链（results.json）：
partial：fd015ff7-4a82-4a2a-a8a0-5f48cfac167e / completed / plan 04822e95-c304-4405-8f84-507251d5a030 / input 7ad695c6dcc5d1a362e5a5bceae8618ad62f3c6a9d3167764a8aec7099b2bb53 / snapshot 0bb9bb6d7cf35cf40bb61837c42e46adfa72c78228e18b460fde2ec286d3a66d
minimal-no-facts：c6c47a78-a32a-410d-a161-ced859e6f342 / completed / plan e2479e1d-b4fa-438f-a6b4-eb805f3bb814 / input 81ac701ef409b75e0bd51bfe63962da9ab04779311932c333bc37a37c4bc4f42 / snapshot be612c1bd1ebba6242b9348610cade6bca2a3d521c232d747b0a318edf94dd49
fault：b8ec293e-bf2c-4e95-97e5-3145e66f73b7 / partial / plan cbd5f93c-c21a-47c5-bb59-fb3d32c52c85 / input 9a4e2d69f644c038aa53f3baf3be9839e1a19cd247638dc80b9c0c50af534444 / snapshot 96bcdc385fb050015317978abbedd344090a66c4b99d53e39b9a38e66a6ded1b

旧证据与判定保留
原FR018 18-01/02/03/04/05/07六条PASS按12eed551及原更早SHA保留，见原报告、原CSV和本次CSV的provenance列。本轮不是六条全部重跑认证。旧18-06在旧SHA仍为FAIL，不改写；本轮新SHA修复后PASS解除此阻断。旧原始两路径为partial-fact运行81e9f5f6-8b1f-4076-a510-fbc6234dc50f和fault运行1dfd050d-99ba-4d4a-969b-11bf8e65989c，原r5-ui及DOM/截图副本见references/old-r5；根目录原报告/CSV/ZIP等5份外部hash重新核对全相等，旧ZIP CRC有效。原EVIDENCE.zip和temp/fr018019024-evidence保持不变。原六条PASS加本轮18-06 PASS，本卡无剩余FAIL/PARTIAL/BLOCKED或本范围必测未执行。FR019/024既有Done不重开。

工装尝试记录及局限
attempt1：预期输入没有计入服务端合法补齐的两个空字段，改为逐项核对原字段；attempt2：页面刷新清空操作原因，补填后才可合法提交；attempt3：复选框误用目录名称，改用真实配置名称；attempt4：事件服务端规范化需处理事实为F-A-MIX，改为Worker发起前持久值与冻结输入全量比较。全部失败原记录保存，没有产品改动或新增产品缺陷/轮次。最后正式脚本complete=true、无pageerror。旧未知范围是浏览器GET响应契约夹具，非真实历史旧记录迁移测试；其呈现分支及当前配置不补写均直接观察。没有用开发方结果补齐未执行断言。没有全套重跑2352/S06/FR034/D01-D03/其他backlog，这些不属于本次必测范围。无事实场景使用独立新存储，不删除有事实历史。业务UAT负责人huiliangtao666，未代签。

交付和下一步
逐项矩阵：FR018-SCOPE-NOTE01-18c2f597-INDEPENDENT-R1-ASSERTIONS.csv；原始证据包：FR018-SCOPE-NOTE01-18c2f597-INDEPENDENT-R1-EVIDENCE.zip；外部hash：FR018-SCOPE-NOTE01-18c2f597-INDEPENDENT-R1-SHA256.json；全部原始目录APS-Test/temp/fr018-scope-independent-evidence/。内部manifest覆盖脚本、完整运行/输入/plan、DOM/中文截图、源码差异/来源及旧证据引用。
最小剩余测试动作：无。APS-Test建议关闭FR018-SCOPE-NOTE01及18-06，FR018 READY_DONE；APS-Design按本event_key去重核对证据、回写唯一原卡/Issue，接受v0.3+完整产品SHA后自行判定Done并给PROCESSED。Test未写GitHub状态。普通通知/ACK不循环发信。未开始backlog及DEC04/05/06实现继续暂停；未恢复巡检、建立团队、main合并或发布。
通知状态以FR018-SCOPE-NOTE01-18c2f597-INDEPENDENT-R1-NOTIFICATION.json为准；queued只算SENT，尚无PROCESSED只能写“已发送，待回执”，不声称闭环。
