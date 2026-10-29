# FR027本卡责任验收r1：Design复核

2026-10-29T15:41:52+08:00；结果event_key `dlv_1971efcf-1545-475e-99ad-ae813c0314eb:r1`；通知delivery `dlv_98ca067e-9fcf-4871-8093-96b494a7566b`；原派发事件 `fr027:c8e16d40:card-responsibility-acceptance-r1`。

v0.3本卡22条适用责任断言22 PASS；Design复核接受固定产品SHA，无本卡阻断，Done。真实平台/部署/生产持久性及业务UAT未执行；Issue13其他FR/CR责任保留。

需求APS-BL-001 v0.3，无本FR直接生效CR；完整产品SHA `c8e16d408b2d0207cb9886b55f39a52ebc9c1665`，分支feat/fr-013-016-main-batch，直接父18c2f59761c9db69554f33a2870b68e15d092320。Test读取设计治理/main快照8d325f39ad56875c299aecbc1edb5abb04be2947，Design处理前main同SHA，均不是产品SHA或产品设计提交。

[唯一原卡](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHg7Y)；[Issue13](https://github.com/huiliangtao666/APS/issues/13)。仅归集本卡原两条及AC19/21责任：时间拖动或允许机器按原OR条文、预览/重检/提交和非法说明、未开始任务位置锁、冲突不静默解锁、已开始/完成保护，以及不可绕过当前事实、观测保护和已确认对象。其他FR的全部事件恢复/转移/冲销/质量义务不整体复制为FR027关闭条件。

## Design核验

- APS-Test原件的4项外部SHA256、ZIP CRC及111项内部hash核对通过；22行矩阵及引用路径核对，13份继承原报告/ZIP外部hash重新计算通过。Design副本在temp/fr027-test-r1/，原件仍在APS-Test根目录。
- GitHub完整固定产品提交/直接父、五个source/target祖先及79项源码新旧blob/SHA256映射核验；固定源码tar中1652个受跟踪文件逐一匹配GitHub blob。完整positions到commit路由段同源hash439b8fe546ef4b113e7fe4d30118ed336c18495f2a380fd49f391e05ae5e86e3核验相同，没有称整个business文件未变。
- TrialMovePanel、事实/事件及auth store/routes与旧证据相同；trial-positions向独立复核传冻结data/conditions的变化、planner/run-input/资源变化，已用本轮候选合法性、Worker/事实和真实React路径补证。12eed551/18c2f597相关实现相同，FR037/030同SHA按实际责任继承；不只凭祖先推PASS。
- 原固定源码仅9个相关用例定向执行9 PASS/0 FAIL/0 skipped：真实Worker/sync保锁、冲突不静默解锁、三类当前事实保护、事实变化token/verify/recompute拒绝、剩余物料不重复扣料、人员/工装/最大等待与不支持范围、完整候选和两任务重叠/停机来源。不是483全量重跑。
- token两组PASS：已有有效复核后降权，recheck/commit/cancel三次403；输入修订后recheck/commit两次409。逐次business存储bytes相同；成员准备及允许输入修订不冒充无写入。资源两组PASS：移动后G40窗口[85,127)、数量字符串1；FEFO转EARLY且精确需求守恒、不改库存/当前事实。
- 真实React三组PASS、pageerrors=[]：pointer拖A-FILL从30到90，未复核禁提交；复核取消整个business bytes不变；第二次真实拖动复核提交落盘90，完整原plan/state不变；真实表单非法0位置显示A-FILL与前序原因、禁提交且无写入。抽看非法候选截图/DOM与请求结果相符。Vite构建成功，正式完整构建按同SHA FR037继承。
- attempt1只移动30分钟实际60、脚本却预期90，是QA位移断言错误；原失败/截图/日志保留，修正位移后新库重做通过。产品未修，无新产品缺陷。D1越轨/D2完整候选两个历史实现问题各一轮修复最终PASS不重开，旧失败可执行快照缺失仍披露。

## 责任矩阵

|断言|本卡责任|结果|原SHA及证据|
|---|---|---|---|
|27-01|计划用户真实时间拖动满足时间或允许机器的OR条文|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;0aaa003dc85ff453bad3c958b14a94c44dadb0cf;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;browser-moved.json;inherited/FR-013-MAIN-RAW01-R1-INDEPENDENT-REPORT.txt|
|27-02|预览显示原与新位置，未复核禁止提交|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;browser.mjs|
|27-03|合法候选重新检查后显式提交并持久保存新位置|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;browser-moved.json;browser-persisted.json|
|27-04|合法预览复核后取消不写计划、事实、输入或审计|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;browser.mjs|
|27-05|非法位置保留完整候选任务和冲突任务ID与原因|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；targeted.log;qa/fr027.test.mjs@fixed-source.tar.gz;browser-invalid-dom.txt|
|27-06|非法候选不准提交有效计划且拒绝不写存储|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;targeted.log;inherited/FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt|
|27-07|机器仅按显式依赖授权，非法机器不被自动接受|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a；inherited/FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt;source-relevance.json|
|27-08|越轨释放不创建预览、不写入，D1最终PASS保留|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;0aaa003dc85ff453bad3c958b14a94c44dadb0cf；inherited/FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt;inherited/FR-013-MAIN-RAW01-R1-INDEPENDENT-REPORT.txt;source-relevance.json|
|27-09|支持未开始任务位置锁，真实Worker和同步重算保留位置|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；targeted.log;qa/fr027.test.mjs@fixed-source.tar.gz|
|27-10|锁定遇停机/工时/选单/不支持模式冲突明确说明且不静默解锁|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;12eed5514c702f730aae65a39a08747c532f8536;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；targeted.log;inherited/FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt;source-relevance.json|
|27-11|显式解锁、取消与恢复不改早期锁定历史|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a；inherited/FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt;source-relevance.json|
|27-12|当前及历史已开始、部分完成、已完成任务不能自由拖动或改锁|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；targeted.log;qa/fr027.test.mjs@fixed-source.tar.gz|
|27-13|已复核token在当前执行事实变化后不得重检提交或重算|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；targeted.log;qa/fr027.test.mjs@fixed-source.tar.gz|
|27-14|旧输入修订/方案hash/latest plan不能用旧token绕过|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；token-results.json;inherited/FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt;source-relevance.json|
|27-15|降权后旧已复核token也不可写，query/跨actor/过期/单次使用保护|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；token-results.json;inherited/FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt;inherited/fr037-card-evidence-ASSERTIONS.csv|
|27-16|请求体不能伪造actor/角色/工时/数量/事实/有效计划|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；inherited/FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt;inherited/fr037-card-evidence-ASSERTIONS.csv;source-relevance.json|
|27-17|观测及事件保护时段守卫保留，不把受保护事实当可移动工作|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;12eed5514c702f730aae65a39a08747c532f8536;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；inherited/FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt;inherited/FR018019024-12eed551-ACCEPTANCE-R1-FR024-REPORT.txt;source-relevance.json|
|27-18|试算不改原方案、当前事实及耗料，剩余需求不重复扣料|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-moved.json;targeted.log;resource-directed/fefo-reallocation.json|
|27-19|真实已确认副本与冻结输入不被后续试算/复制改写|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；inherited/FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt;inherited/FR037-c8e16d40-ACCEPTANCE-R1-REPORT.txt;inherited/FR030-c8e16d40-ACCEPTANCE-R1-REPORT.txt;source-relevance.json|
|27-20|新增资源复核确实参与候选检查；工装/人员非法候选不静默放行|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；targeted.log;resource-directed/report.json;resource-directed/tool-translated-reservation.json|
|27-21|合法移动重建资源与物料分配，精确需求守恒，不等同真实耗料|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；resource-directed/report.json;resource-directed/fefo-reallocation.json;resource-directed/tool-translated-reservation.json|
|27-22|不支持模式/最大等待及上游未检查范围明确披露，不伪造全规则可行|PASS|6857c1e569d8032a21a1ec4b32e9be7a024c791a;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；targeted.log;browser-results.json;inherited/FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt|

## 限制、分层与剩余

640px历史限制保留：被冲突重算省略的A-FILL无直接任意lock-clear控件；旧正例先API纠正停机并重算恢复任务，再真实键盘预览/复核/提交解锁，不能称全UI恢复。本卡条文要求锁保持且原因明确，不要求省略任务直接清锁入口；现有Worker/冲突证据覆盖本卡责任，该限制不冒充N/A或其他FR恢复通过。未新增机器白名单/替代政策/默认值。

- 程序契约：PASS；targeted.log;token-results.json;browser-results.json;source-relevance.json。
- 本地合成actor/正式SDK本地签名：PASS；新fixture合成actor；同SHA FR037正式SDK本地Ed25519签名证据继承，非平台发行。
- 真实平台发行签名：NOT_EXECUTED；未执行。
- GatewaySSO/部署/真实成员引导：NOT_EXECUTED；未执行。
- 生产持久性：NOT_EXECUTED；QA文件落盘不证明生产耐久性。
- 人类业务UAT：NOT_EXECUTED；无代签。

本卡权限/身份、即刻降权、token所有权/寿命/重放、旧输入/当前事实、执行保护、非法候选与确认历史不可变均有直接或源码关联独立证据；未发现必须依赖真实平台才能判定的本FR程序断言。离线D1/D2与平台层分开；业务UAT负责人huiliangtao666，未代签。QA落盘不外推生产耐久性，内部发布仅产品状态机。本卡最小剩余产品动作：无。责任验收1，本轮产品修复0/修复后复测0，无新产品缺陷。

Issue13继续open；其他FR/CR责任及Issue10/14/15/17已关闭状态不改变。旧483项、FR013七组、2352/S06及各原报告的结论/计数/版本保持，不将22责任拆项加为全项目唯一用例数。其他未开始backlog、DEC04/05/06应用实现、原01实体实现和实际paused巡检保持。无产品main合并、应用发布、团队/路由改动。

## 原件SHA256

- `FR027-c8e16d40-ACCEPTANCE-R1-REPORT.txt`：`ae1f624f447ca21d241cd3cad35feabfc4cebe3f3563349741f6e7be88388953`
- `FR027-c8e16d40-ACCEPTANCE-R1-ASSERTIONS.csv`：`536d25c96c639cdfc7caeab5b3614348d69bc2510a5222cca32da358f7a772fe`
- `FR027-c8e16d40-ACCEPTANCE-R1-LAYERS.json`：`8e169a1c59bb74cebca2abb2be1b7d4785bf9ac40fc0b1f572a054f5403f8e25`
- `FR027-c8e16d40-ACCEPTANCE-R1-EVIDENCE.zip`：`bc0624eec949ed6be6287365db8942631f3c3c41d6644f84395c8489a3de883c`

本Inbox最终PROCESSED通过平台hook记录；不另派ACK/完成通知。后续仅可续派已有交付的不同范围独立验收/有限补证。
