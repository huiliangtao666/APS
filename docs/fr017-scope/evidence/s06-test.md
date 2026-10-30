<!-- s06-test-12eed551-r1 -->
## S06独立验收 r1：有限检查点PASS，三原卡NOT_READY

TEST_VERDICT `dlv_f4ebcde5-67f6-4898-a740-535c299548de:r1`；通知 `dlv_67474553-92d4-4155-848f-f6b32a324b5a`。APS-Test原delivery `dlv_f4ebcde5-67f6-4898-a740-535c299548de`；上游Dev `dlv_3a49b951-ccd7-4575-b44e-45d70684be50:r1`。

需求 `v0.3+CR-DEC02-03-20261029`，C05/C06、S06/S07。产品分支 `feat/fr-013-016-main-batch`，固定产品SHA `12eed5514c702f730aae65a39a08747c532f8536`。设计文档SHA `730556fd18bd1b15d6c37005bf5ac4c09356cc93` 单列，不能替代产品版本。

Design已通过File API取得报告、断言、48项矩阵、证据ZIP及hash清单；4项SHA256、80归档条目CRC及79内部hash核对成功；固定GitHub源码3项hash一致。A01–A24 PASS；S06候选联合分配及S07真实不足PASS。Test真实React/Worker八种置换、320小例独立穷举、14类检查器篡改、14组冻结身份/人员峰值与完整已确认历史保护有独立证据。Design核对证据，不重复产品执行；计数有交叠，不累计唯一覆盖。

额外L01强制运行时栈耗尽未执行，仅源码保护审查；已实测256窗口/50000状态边界，搜索受限不等于数学不可行或全局最优。L02完整CR剩余未扩测。两项如实保留，不能将其泛化为本检查点必测失败。

FR007/017/022整体NOT_READY，状态In progress；本次没有新产品失败/缺陷编号。FR007历史原范围Done保持；D01–D03各自修复/复测round1 PASS保持，本次八组为回归，非第二轮；RAW01不重开。48行原16列及Dev三列逐单元格保留，仅追加Test五列；旧25 PASS/19 PARTIAL/2 FAIL_SCOPE/2 NOT_EXECUTABLE不篡改，S06新PASS不升级完整48/CR/UAT。

| 唯一原卡 | 本卡未闭合条件 | 最小下一步与负责人 |
|---|---|---|
| [FR-007](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHgjs) | P08/P09：独立同技能岗位身份及人数累加；P10：跨组同物理池身份、容量与禁止说明；P06：多班/交接表达或明确阻断。原P02等PARTIAL保持。 | APS-Design先在Issue3细化本卡兼容表达/禁止契约；APS-Dev仅补既有授权缺项，push后APS-Test固定SHA定向验证P06/P08/P09/P10及必要回归。 |
| [FR-017](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHgv4) | T08/T10/U01：全参数适用范围/继承及中文预览；U05：未启用、待生效、未支持与缺项状态；H02：升级/回滚/缺旧snapshot迁移保留。岗位/物理池/多班未支持组合须前台说明并守卫，不以字段可保存声称采用。 | APS-Design按维护/启用/状态逐条映射本卡责任；APS-Dev补已授权具体缺项；APS-Test固定SHA补相应预览、状态和迁移证据。 |
| [FR-022](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHg1o) | 独立岗位/跨组物理池/多班容量语义；N06：已执行且采用资源任务的原始资源事实账；同工装多不连续窗口；R01：多成员工具+人员联合Worker；R02：全部已启用物料/资源联合回退。 | APS-Design在Issue3/13/16列本卡同时满足条件；APS-Dev在既有授权内补模型/守卫/计算链路；APS-Test固定SHA验证原始账、多窗口、联合Worker/回退。 |


这是已有需求的责任/证据缺口，不新建产品缺陷或新backlog，不以临时阻断视为批准缩小范围。上述下一步是待处理责任记录，本事件未新增执行投递；不得重复派发已通过S06。

关联 https://github.com/huiliangtao666/APS/issues/3 、https://github.com/huiliangtao666/APS/issues/13 、https://github.com/huiliangtao666/APS/issues/16 。Issue16仍保留FR021原归属，只作依赖交叉引用。FR006状态不改；FR034独立r1已由另一事件处理为Done，不能混入本轮。

FR017/022的CR-DEC04-05-06设计/F01–F04记录并列保留，其应用实现未派；其他未开始backlog继续暂停。巡检仍paused；未合并产品main、未发布。UAT业务负责人huiliangtao666，未代签。

完整报告、断言、矩阵与校验清单见 [Design处理记录](https://github.com/huiliangtao666/APS/blob/main/docs/requirements/operations/s06-candidate-12eed551-test-r1.md)；原Test证据APS-Test/S06-CANDIDATE-12eed551-INDEPENDENT-EVIDENCE.zip，SHA256 d9fd514dcb14268b9449b7fd27d0a5f2dd3eb33276ff0d3e6824bc3cbe5c9c00。
<!-- /s06-test-12eed551-r1 -->

## 证据核对与责任边界

APS-Test原始报告内容按字节保存在[REPORT.md](s06-candidate-12eed551-test-r1/REPORT.md)，扩展名用于GitHub文档呈现，不改报告字节。报告中FR034通知SENT为Test交付当时状态；Design已在另一事件处理为Done，参见原交接台账，不重开轮次。

- [26条断言：A01–A24 PASS，L01/L02未执行](s06-candidate-12eed551-test-r1/ASSERTIONS.csv)
- [48行保留原列并追加本次Test切片结果](s06-candidate-12eed551-test-r1/48-RESULTS.csv)
- [原Test文件SHA256清单](s06-candidate-12eed551-test-r1/SHA256.json)
- [Design核对结果](s06-candidate-12eed551-test-r1/design-verification.json)

完整ZIP保留在APS-Test根目录S06-CANDIDATE-12eed551-INDEPENDENT-EVIDENCE.zip，可经File API下载；Design已下载并校验，无需重复产品执行。证据归档含原Dev参考材料，独立结果位于independent/、d01-d03/、regression/等，不将Dev材料当作独立测试。

Design已核对独立执行结果的complete/errors、320穷举例、14类坏账、八组真实Worker置换、14组冻结身份hash、完整confirmed plan/confirmation/plan inputs/run inputs前后相等、34保护文件审计和D01–D03八组回归。Test负责运行和峰值/字节独立重算，Design负责核对交付证据及卡级判定，不冒称本次重跑、npm ci、Portal SSO或人类UAT。

原始48行含历史缺口和旧pin结论。Test_S06_未关闭范围列按旧说明保留，不代表每个旧失败在新产品SHA仍复现；本次新S06 PASS与旧24ba688 FAIL_SCOPE分开阅读。其他PARTIAL/NOT_EXECUTABLE不能从有限PASS推定已关闭。

前台禁止不支持组合是兼容/安全条件；未经用户批准不得将其当作原已批准核心能力的永久范围删减。具体参数/业务默认值仍未批准。Issue16保持原FR021归属，关联不复制其整卡义务。

下一步负责人APS-Design，先按上表细化唯一原卡责任和既有契约；当前没有新Dev/Test执行delivery。后续实现须在既有授权内普通push，独立Test固定完整SHA仅补相应责任证据。通知/回执不再触发完成通知。
