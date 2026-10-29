# FR027已有交付责任验收续派

2026-10-29T15:31:14+08:00；实际delivery `dlv_1971efcf-1545-475e-99ad-ae813c0314eb`，返回queued/waiting只记SENT，不声称开始/通过。触发事件 `dlv_c198f365-2f80-42a8-b54b-bd6688609317:r1` 已PROCESSED。

event_key: fr027:c8e16d40:card-responsibility-acceptance-r1
类型：已有交付的本卡责任验收/有限补证；不是新功能、应用实现或产品修复。
触发：Design已处理FR030 dlv_c198f365-2f80-42a8-b54b-bd6688609317:r1，20/20适用断言PASS，原卡Done，Issue13仅归集FR030并保留其他责任。依收到Test反馈可直接续派的持续授权执行。

唯一原FR027卡 https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHg7Y；原跟踪Issue13 https://github.com/huiliangtao666/APS/issues/13 。Issue14/15保留各原责任及历史，不因本任务重开已关闭Issue10/14/15/17或改变其他卡状态。若发现真实本卡问题，给最小复现和证据，由Design按现有Issue归集，不能先伪造产品缺陷。
固定完整产品SHA c8e16d408b2d0207cb9886b55f39a52ebc9c1665，分支feat/fr-013-016-main-batch，直接父18c2f59761c9db69554f33a2870b68e15d092320。GitHub独立取源/detached pin，分支tip变动也不换pin，不使用Dev副本。需求APS-BL-001 v0.3；先读当前baseline/受控CR/handoff-policy、原FR027卡及Issue13最新记录，确认无本FR直接生效CR；设计治理SHA与产品SHA分列，不补造产品设计提交。

本卡原责任（以受控原文为准）：
1. 计划用户可在试算方案拖动任务时间或改到允许机器，显示预览并重新检查；非法位置指出冲突，不直接成为有效计划。
2. 支持锁定未开始任务；锁定与其他条件冲突报告原因、不静默解除；已开始/已完成任务不能自由拖动。
映射AC19/21给本FR的实际责任，逐条PASS/FAIL/PARTIAL/BLOCKED/NOT_EXECUTED，不把AC21所有FR029事件恢复/转移/质量义务复制给FR027，不要求全部前置卡先Done。时间或允许机器按原OR条文判断，不创造未批准机器白名单或业务默认值。对确属本卡的当前事实/锁定/合法性守卫不得因共享AC而漏掉。

先复用、再找最小缺口：
- 原FR027 6857c1e569d8032a21a1ec4b32e9be7a024c791a，APS-Test根目录FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt / FR-027-INDEPENDENT-EVIDENCE.zip。独立8API/5browser及原7组的实际拖动、预览/复核/取消/提交、锁定Worker/sync、当前已开始/已完成保护、真正确认历史、材料账及非法预览的证据按原SHA保留。原483/483不重跑整组。
- D1越轨释放/D2完整候选检查为两个不同历史实现问题，各已有最终独立PASS。旧失败可执行快照缺失保持披露，不补造旧复现，不合成“一缺陷两轮失败”或重开修复轮次。
- 后续FR013主前台/RAW01原验证含FR027真实页面回归；FR018/019/024在12eed551/18c2f597的当前事实/Worker/冻结输入证据可按源码相关性继承；FR037及FR030当前同SHA的权限/撤权/签名、已确认冻结和历史证据优先继承，不重复同版本同范围。
每项继承列source/target完整SHA、祖先、相关源码同异与原报告/证据hash；变化的源码不能仅凭祖先推PASS。不得改签旧PASS或抹掉旧FAIL。仅真正缺口做有限定向API/实际React补证，应用/构建/浏览器在独立QA容器，禁止宿主npm install/dev。

重点核清本卡：合法时间拖动→预览/重新检查→实际提交与取消无写入；非法候选保留冲突任务与原因、不能提交有效计划；预览token旧输入/当前事实/角色等绕过保护；真实Worker重新计算保留未开始任务位置锁、冲突明确且不静默解锁；输入事实已开始/完成后不能自由拖动；原方案/当前事实/真实确认副本不被试算改写。原报告640px UI解锁及恢复先API纠正的限制保持，按本卡条文明确有无具体剩余断言，不笼统以“全R6.3未验”阻断，也不能把API纠正冒充全流程UI正例。

分列程序契约、本地合成actor/SDK签名、真实平台签名、GatewaySSO/部署/真实成员、生产持久性及人类UAT。未做层次保留NOT_EXECUTED，不外推签收；第3章离线D1/D2与平台层分开；本卡安全断言仍需证据。业务UAT负责人huiliangtao666，不代签；内部发布仅产品状态机。

交付：本卡逐条矩阵、原/新SHA及源码相关性、路径/hash、报告/证据ZIP、完整分层、最小剩余产品动作和READY_DONE/NOT_READY建议；由Design决定原卡，Test不写GitHub。责任验收r1，本轮产品修复0/修复后复测0；若只需证据映射也不重跑已PASS范围。结果单次完成通知携带原delivery:r1，queued仅SENT，普通ACK不循环通知。
其他未开始backlog、DEC04/05/06应用实现、原01实体实现与巡检实际paused保持；不main合并/应用发布/建团队/改路由/取线上凭据。

