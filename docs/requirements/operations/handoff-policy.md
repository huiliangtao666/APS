# APS 交接与状态回写规则

适用现有 APS-Design、APS-Dev、APS-Test 工作区。GitHub Project2 唯一原卡是实施状态主账；本规则及交接回执只记录流程，不新增需求或平行 backlog。其他尚未开始的新功能继续暂停。

## 1. 交接须有发送、接收和处理记录

`praetor agent send` 的 queued 只表示任务入队；原任务 completed 只表示执行结束。不能以“结果已保存”或“应该有 hook”代替 Design 已收到并处理。现有 hook 未完成端到端回执核验，不宣称自动回传可靠。

Dev/Test 完成业务交付时：先保存报告和证据；Dev 先普通 push 至 GitHub。然后向 APS-Design 发送一条完成通知，原 delivery ID 和完整 SHA 必须保持一致。通知是同一原任务的交接事件，不是新需求/重复执行分支。

通知至少包含：

- event_key：原 delivery ID + 结果修订号；相同结果重送不换 event_key。
- 类型：DEV_DELIVERED / TEST_VERDICT / DESIGN_REVIEW；原 FR、CR、Issue、唯一原卡。
- GitHub 分支、40位代码 SHA；设计文档 SHA 与产品 SHA 分开。
- 结果：PASS / FAIL / PARTIAL / BLOCKED / NOT_EXECUTED；整卡建议另列 READY_DONE / NOT_READY。
- 需求版本、逐条适用验收断言、报告/证据位置、缺陷编号和每缺陷修复轮次。
- 下一步及负责人；不以含糊的“完整UAT尚未做”代替具体阻断条款。

普通流程通知、回执、ACK、重复结果不再触发新的完成通知，避免相互回信循环。

## 2. Design 收妥并处理

Design 收到通知后核对原任务、最新卡及证据，以 event_key 去重；不重新派发已经在执行/已完成的同一验证。先写原卡/原Issue，再刷新同源清单，随后发一条简短处理回执：原 event_key、实际状态、GitHub原卡或Issue链接、已派/复用任务ID或明确等待事项。

交接分为 SENT（入队）、RECEIVED（Design已读到）、PROCESSED（证据与状态已处理）。PROCESSED 不等于需求 Done；失败、缺口和等待也应有明确处理回执。若回执尚未收到，发送方只能写“已发送，待回执”，不能写“已完成闭环”。

## 3. GitHub 状态与验收范围

| 事件 | 原卡状态及动作 |
|---|---|
| Dev 实际开始既有授权任务 | In progress |
| 已 push 且派发独立 Test | In review；并列保留其他未闭合范围 |
| Test 确认本卡适用要求全部通过，无本范围阻断/必测未执行项 | Design复核后立即 Done，记录接受需求版本和代码 SHA |
| Test FAIL / PARTIAL / BLOCKED，仍有本卡条件未满足 | In progress；列最小剩余动作、负责人和原Issue |
| 一个缺陷复测通过 | 关闭该缺陷；逐卡判断是否满足 Done，不重开其修复轮次 |

共享 AC 只映射本 FR 的责任断言；依赖别卡的数据不等于必须等所有前置卡全部 Done。全项目UAT、未派实施的设计CR、发布及main合并不是每张卡的通用关闭门槛。确属本卡的安全、性能或业务条款仍必须完成。部分切片通过不得冒充完整原卡通过。全部业务UAT负责人仍为 huiliangtao666，不补造签收。

## 4. 断点兜底与时效

完成通知事件驱动处理为主。5分钟巡检仅核对“终态 delivery 已有结果，但原卡/交接回执未处理”的漏项，不为轮询时间戳制造commit，不重复派工。

2026-10-29核查时原巡检 task-1793200034897-0ssp1u 为 paused，本次未恢复；此前停止原因及恢复意图尚未在当前交接中澄清，不能声称兜底启用。建议恢复后将5分钟作为发现漏项的目标时间；平台排队/容量影响时应如实记录，不能保证绝对实时。

## 5. 长期使用平台 Agent Team

当前组查询没有已建 Agent Team。长期应将现有三个工作区绑定为团队成员，由平台声明 Design→Dev→Test→Design 阶段路由、证据字段和门槛。保留原工作区、内容及GitHub唯一卡；不手工拼接多条link-worker，不使用持久新密钥模拟团队。

团队应用、发布及触发配置属于平台保留的人类确认步骤；按 group-admin 技能由团队构建台准备可审阅草稿，再由用户点击 Apply changes。当前仅给出方案，未创建或应用团队，也未宣称回调已验证。
