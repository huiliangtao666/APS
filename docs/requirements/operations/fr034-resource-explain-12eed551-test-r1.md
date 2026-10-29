# Design复核：FR034 v0.3整卡验收

## FR034资源解释独立复测收妥与整卡验收（2026-10-29T13:03:32+08:00）

event_key: `dlv_0f7e77e1-2dde-492c-9dd8-b6e35f5a742d:r1`；本通知delivery `dlv_ad222071-d602-411c-83ea-d2c9f1e0b50d`；原Test delivery `dlv_0f7e77e1-2dde-492c-9dd8-b6e35f5a742d`。
派发event_key `fr034-resource-explain-01:12eed551:independent-retest-r1`；上游修复 `dlv_870a893a-a332-4eac-a209-719af311d3e8:r1`。

**PROCESSED / PASS；Design接受APS-BL-001 v0.3，唯一FR034原卡 In review → Done。**
接受完整GitHub产品SHA `12eed5514c702f730aae65a39a08747c532f8536`，分支 `feat/fr-013-016-main-batch`。无直接生效CR。
FR034-RESOURCE-EXPLAIN-01修复round1、独立修复后复测round1 PASS，本缺口关闭；原失败Test `dlv_40ab364a-e651-424a-b211-5fcf85cbd17e` / `24ba6884b3a5f07425a728b7733a677563c6aa44`及所有原通过证据保留。D01-D03既有round1 PASS沿用，未重跑或重开。

| 本轮责任断言 | 结果及证据 |
|---|---|
| T01工装 | PASS：[0,40)需求2/有效容量1套，余额−1；包含[30,40)后延归还 |
| P01人员 | PASS：[5,10)需求2/有效容量1人，窗口外释放；整任务重叠不冒充参与冲突 |
| R01/R02/R03 | PASS：主动检查/同实际两任务筛选→半开甘特资源窗口→同保存方案冻结原输入；配置/声明/真实资源账、规则采用时点/resourcePolicyVersion及公式/单位/来源一致，无需导出 |
| N01新增控制 | PASS：工装/人员各11项浏览器控制；伪区间/数量/容量/资源/单位/任务集及未知/缺失来源不造几何；第三任务排除。本轮新验证不倒写旧未测结论 |
| M01/H01 | PASS：真实Worker物料325/0/325kg及投料/质量/BOM/冻结输入；未排任务不造几何；2个原plan及2个confirmation全量不变 |
| B01相关保护 | PASS：12/12 targeted、任务联动组件、build exit0；UNKNOWN24组、history4组/19响应；boundary14pass+6量测。新键盘24行=22pass+2量测、6键盘断言、8audit；旧18pass+2量测和8audit保留，不泛称全AC31/a11y认证 |

整卡归集：[原资格审查第6节](https://github.com/huiliangtao666/APS/blob/main/docs/requirements/operations/test-done-eligibility-20261029.md)的AC04基础机器/前后序及输入、AC15本卡来源/支持边界、AC17基础/物料、AC31本卡中文/键盘/无需导出及既有修复均PASS；其中唯一具体剩余为第二条/AC17资源解释定位。本轮T01/P01/R03补齐并回归相关保护，Design按原文复核后无已识别本范围阻断或必测未执行项，满足整卡Done。本记录取代旧NOT_READY/等待复测的当前状态，历史记录保留。

Design核验：报告/11条断言/27,846,619字节ZIP三项SHA256匹配；ZIP195条目CRC及内部192项hash全部匹配；固定GitHub源码3项hash与独立provenance一致；34个保护文件逐项通过，3场景冻结身份/原输入核验全true；实际截图/结果/运行日志及独立clean detached来源已核对。Design未重新运行产品测试或累计重叠suite覆盖数。合法Worker相邻，非法保存副本仅隔离临时库同步移动任务和账制造负例，未修改在线历史。

Issue #13仅关闭本FR资源解释缺口，FR017/其他FR/CR及其原有跟踪责任仍保留，Issue保持open。S06为同SHA独立事件，本次不认定完整CR专项；没有改CR1/CR2当前状态。全项目UAT/其他FR/未派设计CR/main合并/发布不构成本卡通用门槛。合成成员与真实权限中间件不代表PortalSSO或业务UAT；业务UAT负责人仍huiliangtao666。

下一步：本FR无待执行修复/复测；Issue13其余责任沿原卡及各自event_key处理。不派新backlog；DEC04/05/06应用实现继续暂停；巡检仍paused。

证据原件：APS-Test根目录 `FR-034-RESOURCE-EXPLAIN-01-12eed551-ROUND1-REPORT.txt` / `ASSERTIONS.csv` / `EVIDENCE.zip`（均同完整前缀）及 `SHA256.json`；可读目录 `APS-Test/temp/fr034-resource-r1-evidence/`。
报告SHA256 `01be5ae242e8f76de43c82d143a1369aa7357189ec325b599aa7e9246d07ee79`；断言 `cf0062cb10e21284da14322d483a49e3b5232d0e809425eca3ce47ce3b91ba5e`；ZIP `a0bc387aef3e7e4250e2df1a1d87af5d34833bffac6f40b32fa4c931123cd184`。
设计/流程文档SHA单列：handoff-policy `3267e6b9fd93d1d3772811729e6930a4f04c6c6e`；前Design台账 `730556fd18bd1b15d6c37005bf5ac4c09356cc93`，均非产品SHA。
Design收妥审查：https://github.com/huiliangtao666/APS/blob/main/docs/requirements/operations/fr034-resource-explain-12eed551-test-r1.md；唯一原卡：https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHhDI。

## APS-Test原始报告

```text
FR034 / Issue #13 — RESOURCE-EXPLAIN-01 独立修复后复测 round1

结论：PASS；FR034原卡建议 READY_DONE，交Design复核后记录接受v0.3及完整产品SHA。FR034-RESOURCE-EXPLAIN-01修复round1、独立修复后复测round1通过。没有发现本FR责任内剩余阻断或必测未执行项。此建议依据此前整卡责任归集及本次指定补缺，不将单缺陷PASS自动等同整卡PASS。

交接与版本
原Test delivery: dlv_0f7e77e1-2dde-492c-9dd8-b6e35f5a742d；结果修订r1。
event_key: dlv_0f7e77e1-2dde-492c-9dd8-b6e35f5a742d:r1；类型 TEST_VERDICT。
派发event_key: fr034-resource-explain-01:12eed551:independent-retest-r1。
上游DEV_DELIVERED及修复原delivery: dlv_870a893a-a332-4eac-a209-719af311d3e8:r1。
原失败Test: dlv_40ab364a-e651-424a-b211-5fcf85cbd17e，产品pin 24ba6884b3a5f07425a728b7733a677563c6aa44，原FAIL档全部保留。
产品分支: feat/fr-013-016-main-batch；独立固定GitHub完整产品SHA: 12eed5514c702f730aae65a39a08747c532f8536。
唯一FR034原卡: https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHhDI
原Issue: https://github.com/huiliangtao666/APS/issues/13；来源规则Issue3/16；无新平行卡或Issue。
需求: APS-BL-001 v0.3，FR034第二条/AC17，无直接生效CR。原DOCX已从APS-Design独立读取核对，SHA256 4eb29f7cfaf4fe30f76329775d32930b806da941282098b7de163591807bc7d4。
设计/流程文档SHA单列: handoff-policy最新路径提交3267e6b9fd93d1d3772811729e6930a4f04c6c6e（GitHub API及指定文档读取）；Design台账SHA 730556fd18bd1b15d6c37005bf5ac4c09356cc93（Issue13收妥评论引用），均不冒充产品SHA。

独立来源与执行
读取根APS-TEST-HANDOFF.md、Done资格报告第6节、原REPORT/9条ASSERTIONS/EVIDENCE、GitHub main原报告、Issue13正文及评论、Dev交付报告与hash清单。APS-Dev文件API403，未绕过平台身份；同机APS-Dev明确指定交付文件只读读取。报告hash 1cb0115f48c281213fa9aa22cd21d31073e6940e95af522f33f5dcf1dc2d40d2、ZIP hash 5fbd995d832ce735b6ad2c90a566df0d15e784047cfaa1fab98f1a3fd7b3a6e5均逐字匹配。
全新GitHub clone至temp/fr034-resource-r1-independent，fetch完整SHA，detached checkout，git status为空；不读Dev工作树作为执行源，不跟移动HEAD。只读挂载源码到一次性Docker，复用既有QA镜像依赖，镜像sha256:0d45a31aa25c4cca1eaacbfd1ba4ee6d5028d899b329e49a6036a66fd0c35da8；真实tsc/Vite/Express/计算Worker/Chromium。没有声称本次重新npm ci。
沿用原probe、fr027-fixture、旧keyboard/UNKNOWN/boundary/history runner，仅在temp写最小测试适配。当前manifest独立新建，621项源码hash及执行provenance保留；旧110项证书不改。34个原保护文件分别对比24ba688和原独立Test清单全等。真实输入经业务API保存、真实Worker运行；合成成员与真实业务权限中间件及runtime alias，不代表Portal签名SSO或人类业务UAT。

逐条结果
T01 PASS：真实Worker工装任务A[0,30)、B[40,70)，账[0,40)、[40,80)，合法相邻。copy→move-preview→recheck拒绝冲突候选。只有本次隔离临时business.json中标名FR034-ILLEGAL-tool副本同步移动任务及账后才出现冲突。主前台主动检查→点超容量问题显示[0,40)、需求2套/有效容量1套、配置总量1、余额−1，含[30,40)后延归还；甘特两相关任务行绘制同半开资源窗口，选择2任务、筛选、同保存方案历史orders输入均通过。
P01 PASS：真实Worker任务A[0,30)、B[5,35)，人员参与窗[5,10)、[10,15)，合法相邻；整个任务重叠不算人员冲突。隔离FR034-ILLEGAL-person副本才显示[5,10)、需求2人/有效容量1人、余额−1；冻结声明准备阶段、偏移5/20、窗口外释放与资源账一致。问题→两任务/两甘特窗口→冻结输入通过。
R01 PASS：两真实verify检测正确，实际冲突taskIds精确为A-MIX/B-MIX；两类新第三任务控制均不进入资源冲突集合，筛选后只显示2任务。原Test未测第三任务结论保留，本次是新验证。
R02 PASS：三场景runId/inputVersionId/snapshotHash/conditions及历史原输入全量一致，浏览器同保存方案输入开关选中。见identity-audit.json。未用当前输入补写或要求导出。
R03 PASS：展示的配置、声明、实际资源账及规则采用时点/resourcePolicyVersion、输入版本/快照hash与真实冻结来源一致；账全量对比PASS，窗口需求合计/有效容量/余额−1及单位正确。页面显示有效容量=配置容量在可用期内扣冻结缺勤（整组缺勤为0），余额=有效容量−合计需求；本两例无缺勤，不冒称新增缺勤策略矩阵认证。
N01 PASS（新增控制）：两类各11个实际浏览器控制。分别篡改start/end/demand/effectiveCapacity/baseCapacity/resourceId/unit/taskIds，未知资源来源、缺失冻结inputVersionId均无伪造问题区间且甘特资源窗口数为0；额外第三任务主动复核仍只选实际两任务。另12个既有targeted测试通过，含未知来源、未来/禁用规则、共享账只计一次与相邻释放；这些是独立执行的新控制，不倒写旧未测结论。
M01 PASS：真实Worker物料LEAN需求325kg/本次分配可用0/缺口325kg，投料分钟0；真实冻结BOM V1/公式、库存账面0/占用0、合格及效期和MATERIAL规则依据保存于results，前台可展开查看并定位同历史orders。未排任务没有伪造问题几何。仅此代表例，不冒称全质量矩阵。
H01 PASS：2份真实submit/主管confirm后的完整原plan与2份完整confirmation，在后续输入/Worker/预览/非法副本/篡改控制后全量相等；原对象及hash归档。history真实中间件另4组/19响应通过，confirmed写入409、query伪角色403等保护保留。未改在线或原历史。
B01 PASS：旧基础及已通过范围保留；本次有限相关回归12/12 targeted、任务联动组件、完整构建exit0；机器/顺序与中文/键盘/UNKNOWN/边界/history真实App重跑通过。旧键盘20结果行=18pass+2量测、另8audit观察原样保留；本次相同源runner另有busy-repeat和去banner焦点检查，实际24结果行=22pass+2量测、6键盘断言、8audit观察，不能称24条pass或全AC31/a11y认证。boundary20结果行=14pass断言+6量测，completed/allPassed=true；UNKNOWN24组、history4组/19响应。各suite不累计唯一验收覆盖。
D01–D03 PASS沿用：既有各round1结论不改，本轮未重跑其专项，不重开修复或复测轮次；S06虽同SHA但独立事件，本次未认定S06专项/完整CR验收。

整卡归集与最小剩余项
按APS-TEST-DONE-ELIGIBILITY-20261029.md第6节：AC04机器/前后序/输入PASS；主动检查/筛选/任务资源明细及AC15本FR说明来源/支持边界PASS；AC17基本与物料PASS；AC31本FR中文/键盘/命名/焦点与无需导出PASS；既有修复PASS。原唯一具体阻断为FR034第二条/AC17的后续工装/人员/物料解释→任务/区间→冻结输入。本次T01/P01/R03已补齐，M01/R01/R02/H01及相关保护通过，所以建议整卡READY_DONE。
本FR实际条款剩余项：无已识别本范围阻断，无本范围必测未执行项。最小下一步为APS-Design核对本报告/逐条证据，按event_key去重，更新唯一原卡接受需求v0.3与产品完整SHA，记录RESOURCE-EXPLAIN-01 round1复测PASS并给PROCESSED回执。Test不直接写GitHub卡/Issue。
全项目AC15矩阵、其他FR、未派设计CR、PortalSSO、全流程UAT、S06独立专项、main合并/发布不作为本FR通用关闭门槛；不签业务UAT，负责人仍huiliangtao666。其他未开始backlog及DEC04/05/06实现继续暂停；未恢复巡检、未建或应用团队、未改路由。

执行诊断与限制
attempt1为测试脚本甘特CSS选择器错误，修正为真实.fr034-interval后通过；regression首次为manifest路径拼接适配错误，改容器内相对路径后通过。新增缺失来源控制初次仅改plan.inputSnapshot=null，但真实GET /plans会从有效inputVersion还原冻结来源，页面保留正确几何是产品正确行为；改为实际缺失inputVersionId后确认不画几何。日志及初次results独立保留，均非产品修复或新修复轮次。最终complete=true、browserErrors=[]，所有限定执行完成。

交付与复现
同前缀ASSERTIONS.csv逐条状态；EVIDENCE.zip含probe、run.sh/browser-controls.sh/regression.sh、当前manifest、provenance、34保护审计、真实完整API/Worker/输入/plan/confirmation、截图/DOM、旧回归JSON/ARIA/AX、构建/测试日志和诊断档。解压至temp/fr034-resource-r1-evidence，固定源码仍在同名-independent目录时可从根执行bash temp/fr034-resource-r1-evidence/browser-controls.sh及regression.sh；Docker镜像/浏览器网络为运行依赖，均不启动在线应用。
同前缀SHA256.json记录报告/CSV/ZIP哈希。通知详情与状态另见NOTIFICATION.json。queued只记SENT；尚无PROCESSED时只能表述“已发送，待回执”，不宣称Design已读/已处理或闭环。

```
