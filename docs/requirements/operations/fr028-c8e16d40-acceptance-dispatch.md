# FR028已有交付责任验收续派

2026-10-29T15:43:43+08:00；实际delivery `dlv_8d3a7593-26f1-4bf5-aa22-ffc0939d96f4`，queued/waiting仅SENT，不声称开始/通过。触发FR027结果 `dlv_1971efcf-1545-475e-99ad-ae813c0314eb:r1` 已PROCESSED。

event_key: fr028:c8e16d40:card-responsibility-acceptance-r1
类型：已有交付本卡责任验收/有限补证；不是新功能、应用实现或产品修复。
触发：Design已处理FR027结果dlv_1971efcf-1545-475e-99ad-ae813c0314eb:r1，22/22适用断言PASS，原卡Done，Issue13其他责任保留。按用户“收到Test反馈可继续给Test分配任务”的持续授权续派，不等待普通ACK。

唯一原FR028卡 https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHg8s 。原证据归集Issue14 https://github.com/huiliangtao666/APS/issues/14 ，其FR018关闭结论保留；本任务仅维护FR028责任，禁止重开Issue14或复制Issue/Project卡。Issue13/3现有FR/CR责任和Issue10/15/17已关闭状态同样保留。
固定完整产品SHA c8e16d408b2d0207cb9886b55f39a52ebc9c1665，分支feat/fr-013-016-main-batch，直接父18c2f59761c9db69554f33a2870b68e15d092320。独立GitHub取源/detached pin，tip变化不得换pin，不使用Dev副本。需求APS-BL-001 v0.3；先读GitHub最新baseline/受控CR两项/handoff-policy、原FR028卡和Issue14/13/3最新记录，确认本FR无直接生效CR；治理/main读取SHA单列，不能冒充产品设计提交。

本卡原两条，以受控原文核定：
1. 复制方案后修改订单、日历、模具、人员或物料等模拟条件，再计算并比较。页面采用“条件试算”，可在帮助中说明What-if含义。
2. 清楚列出改了哪些条件、影响哪些任务和交期；可保留或放弃。增加资源但交期没有改善时如实说明。
逐条映射AC20/32给本FR的责任：条件变化→冻结新输入→重算→明确任务/交期影响，旧配置可追溯、不重复用料/不改原计划和真实已确认历史；保留不是确认/采用，放弃不得影响原对象。AC32“恢复模拟数据”的责任按原文及各FR实际职责判断，不能把FR026旧方案恢复、FR029全部异常恢复或所有资源算法义务整包复制给FR028；也不能将本FR实际守卫责任漏掉。当前/历史执行事实不同版本、重算旧输入/保留旧结果与越权安全应有证据。不以其他卡全部Done、全项目UAT/部署/main合并作通用门槛。

先继承再补最小缺口，避免重复已通过同版本同范围验证：
- 原FR028产品7465159d98fbc63f7e6b9413c71466b31d9bad82；Test dlv_5390c34a-812f-4ca4-83c0-c13a0f862c9a，APS-Test根目录FR-028-independent-regression-report.txt / FR-028-independent-evidence.zip。原280 canonical+17 independent/构建按原SHA保留，不重跑整组。原初次affectedTaskIds期望错误14/15、修正后17/17保留，不计产品缺陷/修复。
- 原17覆盖字段级diff及重复身份、多种条件/任务交期变化、增人不解物料瓶颈、延迟到料87、无收益诚实显示、未重算禁保留、真实Worker冻结、最新own result/修订/历史损坏拒绝、retain/discard和审计。旧资源reservation人工projection只证明比较保真，不能冒充新资源求解正例。
- FR026旧e93fadce55d3f1deef0a602d3a01ebfe561a01b4报告/ZIP用于独立copy/比较/放弃证据；FR018/019/024的12eed551/18c2f597当前事实/冻结Worker/历史证据可按源码关联继承。FR037、FR030以及刚收妥FR027均同固定SHA，优先继承权限/即刻撤权/签名、真实确认冻结历史和试算当前事实/取消/提交保护，不复跑已通过完整权限矩阵或FR027拖动三场景。
每项继承必须列完整source/target SHA、祖先、相关文件/路由/依赖同异、原报告/ZIP hash。变化处不能只凭祖先推PASS；旧PASS/FAIL/限制保留其原时点，只有新缺口有限定向补证。

重点核清真实React“条件试算”工作流和变化集成：真实页面复制、修改现有条件、重算、查看字段/任务/交期变化、保留/放弃及刷新后记录；不能API写入冒充UI正例。原17已有的精确数字不用无理由全部重跑；选择最少代表场景覆盖有改善/无改善（尤其物料瓶颈不随增人消失）及新资源/当前事实相关变化，保留或放弃不改当前库存/事实/原方案/真实确认副本。原条件类别按已支持的输入契约审查，不虚构模具/人员岗位/物理池/多班/多窗口能力或业务默认值；CR1未闭合范围和DEC04/05/06设计阶段保留，不用后者阻断无关本卡，也不替CR验收。
若当前旧方案restore仍409，明确它是否构成本FR原条款的具体缺口；拒绝只证明安全，不能冒充成功恢复。FR026成功恢复需求仍归FR026，不能在本任务偷关或伪记N/A；发现真实本卡缺口给最小证据/负责人，由Design按原Issue和唯一原卡归集，Test不写GitHub、不自动派Dev或扩展实现。

测试/构建/浏览器/Worker均用独立一次性QA Docker容器，不在宿主npm install/ci/dev/start，不动已发布应用或真实业务库。分列程序契约、本地合成actor/正式SDK本地合成签名、真实平台签名、GatewaySSO/部署/真实成员、生产持久性、人类业务UAT；未做层次NOT_EXECUTED，不以QA落盘/本地签名外推生产或平台。业务UAT负责人huiliangtao666，不代签；内部发布仅产品状态机。

交付本卡逐条断言矩阵(PASS/FAIL/PARTIAL/BLOCKED/NOT_EXECUTED)、需求版本/完整SHA、源码继承关联、证据路径/hash、报告/ZIP/分层和最小剩余产品动作、READY_DONE/NOT_READY建议。责任验收r1，产品修复0/修复后复测0；由Design决定唯一原卡，不将责任拆项累加为全项目唯一用例数。完成保存后单次主动通知APS-Design，结果event_key为本delivery:r1，带逐条结论与完整SHA/hash；queued仅SENT，普通ACK不触发通知循环。
其他未开始backlog、DEC04/05/06应用实现、原01实体实现继续暂停；巡检保持实际paused。不main合并、应用发布、建团队、改路由、取线上凭据。

