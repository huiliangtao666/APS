<!-- fr037:c8e16d40:card-responsibility-acceptance-r1 -->
## FR037已有交付本卡责任验收续派（2026-10-29T14:59:29+08:00）
收到FR014 Test事件 `dlv_65bd029a-fb90-4808-ab0d-c7be761e3cfc:r1` 并完成Issue12/原卡处理后，按用户持续授权续派APS-Test `dlv_88a6254b-a3ac-4e5c-a218-7db64b5580fa`；派发event_key `fr037:c8e16d40:card-responsibility-acceptance-r1`，实际返回queued/waiting仅记SENT，不声称开始/通过。原卡In progress→In review，原Issue10保持open，未认定完整验收。

需求APS-BL-001 v0.3，本卡无直接CR；固定产品 `c8e16d408b2d0207cb9886b55f39a52ebc9c1665`，feat/fr-013-016-main-batch，设计治理提交另列。早期51e1e7ed1c7fe6c658e16337da97979fad344a30的78+9通过记录/证据保留；当时confirm/return/release501是旧版本缺口，后续FR030真实流程已交付。本轮按当前代码核实FR037两条与AC03/22/24本卡责任，不把其他卡PASS或旧501直接变成当前整卡结论。

只补角色/每请求服务端权限、query按授权导出、正常模拟质量维护、导入/编辑/计算/确认/退回/导出六类操作者/时间/原因记录；先复用FR030真实确认、HISTORY01 round1及FR014015原证据并核对源码相关性，缺口才做有限API/真实React补证。不重跑旧501/514、全类别/全算法，不扩大共享AC为全部其他FR义务。真实签名/网关SSO与合成QA层次分列；必测身份安全缺口仍须具体记录，业务UAT负责人huiliangtao666未代签。

Test给逐条PASS/FAIL/PARTIAL/NOT_EXECUTED、原/新SHA/证据/最小剩余及READY_DONE/NOT_READY建议，Design再判状态；本轮为已有交付验收，产品修复0/修复后复测0，不造产品缺陷/修复轮次。其他未开始backlog及DEC04/05/06实现暂停，原01未交付不派测试/不派实体实现，巡检paused；无main合并或发布。完整边界：[派工记录](https://github.com/huiliangtao666/APS/blob/main/docs/requirements/operations/fr037-c8e16d40-acceptance-dispatch.md)。
<!-- /fr037-card-acceptance-dispatch -->

## 完整限定任务

event_key: fr037:c8e16d40:card-responsibility-acceptance-r1
类型：已有交付的原卡责任独立验收/有限补证，不是新功能，不是产品修复复测。
来源：Design已PROCESSED Test dlv_65bd029a-fb90-4808-ab0d-c7be761e3cfc:r1；Issue12 https://github.com/huiliangtao666/APS/issues/12#issuecomment-6490140868 。FR014-SKILL-REL01已关闭修复1/复测1，整卡50 PASS/1 PARTIAL仍In progress，原01应用实现未派，不能派无交付的类别测试。按用户“一旦接收到test的反馈就可以继续给test分配任务”授权，转下一项已有代码责任验收，不等待普通ACK。

唯一原卡FR037 https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHhGM ，唯一原Issue https://github.com/huiliangtao666/APS/issues/10 。需求APS-BL-001 v0.3，FR037无直接生效CR。固定产品分支feat/fr-013-016-main-batch，完整SHA c8e16d408b2d0207cb9886b55f39a52ebc9c1665，直接父18c2f59761c9db69554f33a2870b68e15d092320。独立GitHub clone/detached pin，核实完整来源与tracked clean；分支前进不换pin。当前受控基线及原卡/Issue为责任依据，设计治理SHA与产品分列，不补造不存在的文档SHA。

FR037原独立Test dlv_e9fa38ee-ebc2-438c-a039-c8b5ef0ac414在51e1e7ed1c7fe6c658e16337da97979fad344a30的78/78+独立9/9及build PASS保留原SHA。其当时confirm/return/release501属于旧版本未交付；后续FR030已交付真实流程，当前server/business.mjs具备permission(action)、workflow事件、confirm/return/release和record()。本轮是审查更新后的实际本卡覆盖，不能继续直接沿用早期501结论，也不能把其他卡PASS自动变成本卡全部PASS。
既有可复用：FR030 Test dlv_138722b3-0763-4d59-a709-e12745a7abbe（b09b3e2f50996aa01b6ec48f915c5f4e7d8f90e8），HISTORY01 round1 dlv_d69969cb-3527-4657-a004-2a28d432b3cd（3290634c28f58da0d4324fc1de90d04a2ad1eaa7）；FR014015真实主管确认链Test dlv_0058d1bd-415d-4785-b2cc-e52bf952a6e8（f00e705572c6f034f3982ca236060fae2750b801）；FR014015原责任验收dlv_5962eb4d-0906-4760-8426-2b8cb124f919（18c2f59761c9db69554f33a2870b68e15d092320）。证据均在Test自身根目录及原任务。先读并映射已通过断言、代码相关性与原SHA，保留旧失败和修复记录；只补下列本卡缺口，不重跑旧501/514、所有类别、全调度组合/全确认链。

本卡责任：
1. FR037两条+第3章既有角色；AC24：计划员/主管维护模拟数据、计算/调整；只有主管确认/退回/发布；query只读及canExport显式授权边界。服务端每请求执行角色/成员权限，拒绝前端隐藏按钮绕过、body伪造actor/role；检查撤权/非成员等已存在守卫，不新建角色/质量审批流程。模拟质量状态由正常维护标明。采用必要独立API负例及最少真实React正向角色/禁用说明/按权限导出证据。
2. 记录导入、编辑、计算、确认、退回、导出的实际操作者、时间、原因。按本卡六类动作建责任矩阵，若旧证据已充分则准确继承；缺少的使用实际成功请求与落盘records/workflow证据补齐。确认/退回用真实计算、复核、提交状态机，不能伪造confirmed fixture。记录的身份应来自服务端验证身份而非客户端body；拒绝操作不得产生成功记录或业务变更。记录实际字段/界面，缺少明确条款需给具体证据，不因为未呈现某种自拟UI就报缺陷。
3. AC22在本FR只验提交/主管确认退回权限、过期输入重新核对、已确认不可直接改写及操作者记录；共享独立复核算法/全部冲突组合由对应FR负责，本轮不重测全算法。AC03只验角色授权不绕过原引用/旧值/冻结保护，不将FR015所有类别维护复制为本FR义务。对旧真实确认/历史保护先做来源相关性映射，补必要的新权限断言即可，不重开已Done/已关闭HISTORY01。
4. 真实平台签名、实际GatewaySSO、部署/成员引导、业务UAT逐层分列。隔离QA可使用既有合成actor或本地签名fixture验证程序契约，必须清晰标注，不能称真实网关或业务UAT。若本卡确有必须未验证的身份安全责任，列具体原文/攻击面/证据和最小下一步，保持NOT_READY；全项目发布/UAT、其他FR未Done、未派CR设计不是通用卡级门槛。禁止操作在线成员/授予权限/取用凭据/伪造用户UAT；UAT业务负责人huiliangtao666。

交付逐条断言/继承SHA/本轮新测与证据层次，区分PASS/FAIL/PARTIAL/NOT_EXECUTED和整卡READY_DONE/NOT_READY；若有本卡缺口，按最小动作、负责人、原Issue列出。对真实产品FAIL必须给预期/实际/最小复现/影响/完整SHA，不把覆盖缺口或runner/环境错误算缺陷。不强制结论Done；Test仅建议，Design核对后写原卡。没有实际产品修复，本轮修复0/修复后复测0，责任验收轮次另记。

所有安装/构建/应用/浏览器必须在隔离QA应用容器；禁止宿主npm/pip安装或运行应用，禁止改产品/在线/历史数据以通过。固定版本来源核对，选择必要相关检查/build即可，无需全套旧测试。遇跨工作区File API403，只按既有授权读Dev对应本地副本并复算hash，标注非共享挂载；Test自身旧证据可直接读取。
保存报告/逐条矩阵/原始证据/hash至Test根目录；GitHub只读，不写原卡/Issue、不合并main/发布、不建团队、不恢复巡检。其他未开始backlog、DEC04/05/06应用实现暂停；不扩原01实体实现。完成后主动发一次TEST_VERDICT至APS-Design，event_key=本delivery:r1，带本原delivery/完整SHA/逐条结果/整卡建议/证据/下一步。普通ACK和通知不触发新完成通知；queued仅SENT，待Design PROCESSED。
