# FR-034 / Issue #13：资源异常联动有限验收

**整卡建议：NOT_READY。工装和人员代表性异常均 FAIL；物料325/0/325、同源输入定位及原方案/确认保护 PASS。** 本轮确认的是问题解释与区间显示缺口，不是Worker超容量排程缺陷，不依赖Dev尚未交付的S06。原唯一卡保持In progress，由Design维护，不新建平行卡。

- 原delivery：`dlv_40ab364a-e651-424a-b211-5fcf85cbd17e`；结果修订1。
- event_key：`dlv_40ab364a-e651-424a-b211-5fcf85cbd17e:r1`；类型：TEST_VERDICT。
- 唯一原卡：[FR-034](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHhDI)；跟踪[Issue13](https://github.com/huiliangtao666/APS/issues/13)，规则来源Issue3/16。
- 产品分支：`feat/fr-013-016-main-batch`；独立固定产品SHA：`24ba6884b3a5f07425a728b7733a677563c6aa44`。
- 需求：APS-BL-001 v0.3；FR034无直接生效CR。原DOCX SHA256：`4eb29f7cfaf4fe30f76329775d32930b806da941282098b7de163591807bc7d4`。本轮重新从Design原DOCX读取FR034/AC17，非新增要求。
- 设计/流程文档提交：`3267e6b9fd93d1d3772811729e6930a4f04c6c6e`（GitHub API核验handoff-policy路径最新提交）；不是产品SHA。DEC04/05/06设计引用`4db95a4c4bfb4ec2fe9178b6dc787e69630c9005`不作为本卡实现前提。
- 报告日期：2026-10-29，Asia/Singapore。逐条结果见同前缀ASSERTIONS.csv；完整原始证据见同前缀EVIDENCE.zip。

## 判定与证据来源

先读取APS-TEST-HANDOFF.md、Done资格报告第6节、原需求第二条/AC17及最新Issue13正文和7条评论；最新评论2026-10-29T04:33:45Z即本次派发。Issue13是验收跟踪项，其open状态不是本卡失败理由。FR034明确要求后续模具/人员/物料问题显示需求、可用量及判断依据，并定位同一任务、区间和原输入，无需先导出。

从GitHub全新clone到`temp/fr034-resource-independent`，fetch指定完整SHA并detached checkout；最终git status为空。未跟随分支变化或使用Dev工作树。应用源码只读挂载到一次性Docker，复用QA镜像`sha256:0d45a31aa25c4cca1eaacbfd1ba4ee6d5028d899b329e49a6036a66fd0c35da8`的依赖，真实Vite构建、Express业务路由、计算Worker与Chromium执行；未声称重新npm ci。使用既有`qa/fr027-fixture.mjs`合成成员和runtime别名，不是Portal签名身份或业务UAT。

正常数据均经POST /api/inputs验证保存，再POST /api/runs运行真实Worker，GET /api/runs/:id/inputs取冻结输入。Worker成功避开资源占用冲突。随后经已有copy→positions→move-preview→recheck产生明确冲突候选，均返回valid=false。为检查完整FR034主前台显示，沿用既有FR034 QA方式，在**仅本次临时业务库**注入标名`FR034-ILLEGAL-tool/person`的非法保存结果副本；任务和其资源账同步移动，保留真实冻结输入。副本不是Worker结果、不是可由产品导入的计划，也未触碰在线历史。没有扩建新测试框架。

证据`results.json`包含每个真实API路径、请求/响应、3次Worker完整run、输入和结果；`probe.mjs`是可复查步骤。脚本退出0表示完成证据采集，**不表示产品全部通过**：业务结果明确为FAIL、FAIL、PASS。没有执行异常或浏览器pageerror。

## 三个代表性场景

### 工装：FAIL

QA-T容量1套，A-MIX/B-MIX各需1套，每任务30分钟，逐项声明后延10分钟，无提前占用。真实Worker为A[0,30)、B[40,70)，工装账[0,40)、[40,80)，合法相邻释放；机器分别MIX01/MIX02，无机器冲突。

将B候选移到0后，已有预览复核拒绝，并有文字“累计需求2套>容量1套；占用[0,40)，含提前/后延释放”。它没有生成已保存冲突计划。手工非法副本同步将B任务及其账移到0，真实应检区间[0,40)，需求2/有效容量1；[30,40)仍因真实后延声明占用，不可缩成任务运行区间。

主前台选副本→主动运行独立检查→点击超容量问题：真实POST /plans/:id/verify检测到`QA-T 在分钟0超容量1`；A/B均选中，问题筛选和历史orders输入定位成功。但问题详情明确显示“没有可验证的已排问题区间”，甘特没有资源冲突窗口；资源表分别显示“需求1套·配置总量1”，没有窗口合计需求2、有效容量/已占用余额的计算说明。配置JSON可展开不等于完成问题窗口解释。证据：`tool-problem.png/html`、`tool-input.png`、results.cases[kind=tool]。

### 人员：FAIL

同一QA-G池1人、技能mix、班次D，A/B各需1人；显式开始偏移5、结束偏移20，窗口外释放=是。30分钟任务的真实参与窗为[start+5,end−20)。人员依赖为实际采用条件，未使用待生效或禁用规则。

真实Worker任务A[0,30)、B[5,35)，人员窗[5,10)、[10,15)，**任务重叠而人员窗合法相邻**，不得称Worker应报超容量。将B移到0的候选被现有预览拒绝；手工非法副本两任务[0,30)、人员窗均[5,10)，合计需2人/有效容量1人。真实检查器报`QA-G 在分钟5超容量1`，点击同时选中A/B并可到同源历史输入。页面仍没有[5,10)问题区间，也没有合计需求2人和有效可用量依据，只列每任务需求1人/配置总量1。证据：`person-problem.png/html`、`person-input.png`、results.cases[kind=person]。

### 物料：PASS（本代表性样例）

重新运行真实Worker，而非仅复用旧截图：A-MIX / LEAN，需求325kg、分配可用0、缺口325kg，投料分钟0（2026-11-02T00:00:00Z）。BOM版本V1、生效2026-01-01，保存公式及exactQuantity=325/1；LEAN-LOT账面0、占用0、合格、有效期2026-12-31。冻结MATERIAL规则启用，允许预计供给=false、可用状态仅合格，排除待检/冻结/不合格，未使用预计供给凑数。

真实问题点击定位未排A-MIX、中文需求/可用/缺口/投料时点，展开BOM依据，进入同保存方案历史orders输入；原输入中BOM、inventory、rules可复查。任务未排，页面不伪造甘特区间，候选检查/未提交状态正确。三个方案的runId/inputVersionId/snapshotHash及输入快照均经独立JSON全量一致性审计，见`identity-audit.json`。这是一个真实零库存样例，没有声称本轮重跑全部质量筛选矩阵。证据：`material-problem.png/html`及results.cases[kind=material]。

## 逐条结论与保护

| 责任断言 | 状态 | 证据与边界 |
|---|---|---|
| 工装问题需求/窗口有效容量/后延依据 | FAIL | 应为[0,40)、2/1套；预览有文字，FR034已保存结果问题缺窗口与合计量 |
| 人员问题需求/窗口有效容量/释放依据 | FAIL | 应为[5,10)、2/1人；合法Worker相邻释放，非法副本才冲突；FR034缺问题窗口与合计量 |
| 工装/人员异常检测、相关任务选择、筛选 | PASS | 两次真实verify为resourcePolicies.problem；选中2任务，未混成机器冲突 |
| 工装/人员问题→同一冻结输入与方案 | PASS | 两个真实历史输入页面及API、inputVersion/snapshot一致；不使用当前数据补写 |
| 资源规则/配置版本及判断依据完整显示 | PARTIAL | 原运行/输入hash、冻结时点/规则和配置JSON可查；问题无结构化窗口聚合与容量推导，不能整条PASS |
| 物料325/0/325、投料/质量/BOM及未排定位 | PASS | 真实Worker与前台、历史输入一致；不虚造已排区间 |
| 原方案、确认快照不变 | PASS | 两次真实submit/主管confirm；之后新输入、Worker、预览及非法副本检查后，2份完整原plan与2份完整confirmation全量相等 |
| 原AC04机器/前后序、UNKNOWN/键盘/history | PASS（沿用） | 既有集成报告及208项归档；本轮不冒称重跑全部441/键盘/边界组 |
| Dev D01–D03 round1 | PASS（沿用） | DEC02-03-24ba688-ROUND1报告；不重开修复轮次 |
| 本轮有限验收整体 | PARTIAL | 已完成三个样例；有明确FAIL，故整卡NOT_READY |

## 最小复现、影响与修复范围

记录一个新观察编号 **FR034-RESOURCE-EXPLAIN-01**（挂现有Issue13，无新GitHub Issue）：初次独立复现，修复轮次0、修复后复测0；不是D01–D03 round2，不消耗未执行/模型缺口的修复轮次。工装、人员是该同一展示契约缺口的两种真实观察。检查器均正确拒绝非法候选，不记录“Worker超容量”缺陷。

最小复现入口为`bash temp/fr034-resource-evidence/run.sh`，具体行为由`probe.mjs`保存：导入两任务共池容量1→真实Worker→冻结输入→copy/move-preview/recheck拒绝→本地非法副本→实际App主动检查/点问题/历史输入。证据归档解压到同目录并准备固定SHA独立clone即可重放；容器需Docker及下载Chromium的网络，使用指定镜像，不在宿主安装或启动应用。

根因定位（指定SHA）：`src/lib/verify-resource-policies.mjs`只返回超容量文字details；`src/lib/independent-verification.mjs`将资源details统一映射为RESOURCE_POLICY并关联全部已排任务，没有resourceId/quantity/unit/interval结构；`src/lib/task-linkage.mjs::problemInterval`只支持MACHINE_OVERLAP/PRECEDENCE，资源问题必返回null；`taskEvidence`只投影各任务静态配置总量；`src/TaskLinkage.tsx`因此显示无区间和配置总量。源码hash及全部响应保留。预览本身已有部分合计文字，不得将此结论误写为所有产品接口都不能产生问题。

影响：用户可知道资源在某分钟超量并查输入，但不能从FR034问题直接核对同一窗口总需求、有效容量、后延/释放造成的冲突区间。两任务时taskIds碰巧正确；源码统一关联全部任务的行为对更大计划可能扩大定位，本轮未另造第三任务，**不将此推断另算已复现缺陷**。

可执行最小范围由Design记录Issue13、交Dev：让已有资源复核输出冻结来源下的结构化resourceId/type、实际冲突任务集合、半开区间、合计需求、有效容量/占用扣减口径、单位、规则采用时点及配置/声明引用；FR034消费这些字段，正确绘制[0,40)工装后延区间和[5,10)人员参与区间，展示2/1与依据并保留历史输入定位。同步更新“仅机器/顺序”的旧检查范围说明；资源问题按窗口去重。无需实现所有资源策略、候选分配S06或新登录系统，也无需更改Worker合法串行行为。

最小下一步：Design复核本报告并将本编号、两场景及NOT_READY记录到FR034原卡/Issue13，再由Dev修复上述既有显示契约；Test仅对交付固定SHA复测这两个FAIL和相关保护。物料PASS、D01–D03 PASS及旧基础PASS保留。其余未开始backlog、DEC04/05/06应用实现保持暂停；不合并main、不发布、不签huiliangtao666业务UAT。

通知状态单独见同前缀NOTIFICATION.json。入队只记SENT；尚无PROCESSED时仅为“已发送，待回执”，不宣称卡已处理或闭环。
