# FR030本卡责任验收r1：Design复核

2026-10-29T15:28:47+08:00；event_key `dlv_c198f365-2f80-42a8-b54b-bd6688609317:r1`；通知delivery `dlv_d28ce851-d4be-4b42-b461-48afd1285c7b`。

v0.3本卡20条适用责任断言20 PASS；Design复核接受固定产品SHA，无本卡阻断，Done。真实平台/部署/生产持久性及业务UAT未执行；Issue13其他FR/CR责任保留。

需求APS-BL-001 v0.3，本FR无直接生效CR；完整产品SHA `c8e16d408b2d0207cb9886b55f39a52ebc9c1665`，分支feat/fr-013-016-main-batch，直接父18c2f59761c9db69554f33a2870b68e15d092320。Test读取设计治理快照ffee6a8013b2fce8a7303332b70ad3dd9dcff6ee，Design处理前main ffee6a8013b2fce8a7303332b70ad3dd9dcff6ee，均不作产品SHA或补造产品设计提交。

[唯一原卡](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHg-Y)；[Issue13](https://github.com/huiliangtao666/APS/issues/13)。仅归集本卡两条及AC22/23/24/32责任；共享AC、所有调度规则自身求解、其他FR历史恢复及CR1资源模型不整体复制为FR030义务。

## Design核验

- 读取APS-Test原件并取得本地核验副本；4项外部SHA256、91项包内hash、20行矩阵逐项引用hash、ZIP CRC匹配。16个继承原始报告/矩阵/ZIP hash再次核验。
- GitHub固定产品提交、直接父、五个原SHA祖先和逐文件新旧blob映射独立核验；9条源码段记录核验，HISTORY01的validConfirmation、历史读取及生命周期段与当前相同。18c2至pin业务/确认文件相同，FR037同SHA继承。
- 新14个确认/内部发布定向场景共28次409拒绝，刷新token不能绕过；每次存储字节不变。故障注入是隔离保存副本，不冒充Worker真实生成冲突或规则全量求解证书。
- 两个真实React场景：A-FILL/B-FILL各240kg未排逐项可见并显式接受；EXPECT/LOT/65预计来源/批次/时点/质量条件可见并明确接受。主管可见规则核对、调整原因和条件，确认→内部发布→归档200；冻结副本及inputVersions全等，授权query读取/导出与detail深等。
- 退回重提、签名权限、即刻撤权、可信六类操作记录、冻结保护按同SHA FR037继承。旧I14 FAIL原样保留，HISTORY01修复1/复测1 PASS沿用，不重新签旧证据或重开修复轮次。
- Test独立新clone/clean、隔离QA镜像及Vite两次构建证据保留；完整build按同SHA FR037继承；Design未重复执行已通过同版本同范围测试。

## 责任矩阵

|断言|本卡责任|结果|原SHA及证据|
|---|---|---|---|
|30-01|计划员真实计算/复核/提交，主管退回后计划员重提再确认|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；inherited/fr037-browser-results.json;inherited/fr037-browser-persisted-business.json|
|30-02|主管可查看采用规则、独立检查、支持范围与未检查项|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；partial-supervisor-before-confirm-dom.txt;conditional-supervisor-before-confirm-dom.txt|
|30-03|未排清单明示订单/工序、数量、单位和原因|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；partial-review.json;partial-supervisor-before-confirm-dom.txt|
|30-04|预计供给明确来源/批次/数量/时点/质量条件，不推定到货|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；conditional-review.json;conditional-supervisor-before-confirm-dom.txt|
|30-05|主管可看到调整及提交原因|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；partial-supervisor-before-confirm-dom.txt;conditional-supervisor-before-confirm-dom.txt;inherited/fr037-browser-persisted-business.json|
|30-06|部分未排需准确完整清单及显式接受；重复/遗漏/伪造清单拒绝|PASS|b09b3e2f50996aa01b6ec48f915c5f4e7d8f90e8;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；partial-persisted.json;partial-supervisor-before-confirm-dom.txt;inherited/FR-030-INDEPENDENT-REGRESSION.txt|
|30-07|两角色都需明确接受预计供给，truthy字符串不能冒充确认|PASS|b09b3e2f50996aa01b6ec48f915c5f4e7d8f90e8;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；conditional-persisted.json;inherited/FR-030-INDEPENDENT-REGRESSION.txt|
|30-08|已识别启用规则冲突不得确认或内部发布|PASS|b09b3e2f50996aa01b6ec48f915c5f4e7d8f90e8;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；gate-results.json;inherited/FR-030-INDEPENDENT-REGRESSION.txt|
|30-09|关键输入缺失、未核对规则或无有效运行不得确认发布|PASS|b09b3e2f50996aa01b6ec48f915c5f4e7d8f90e8;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；gate-results.json;inherited/FR-030-INDEPENDENT-REGRESSION.txt|
|30-10|当前输入或方案变化后旧复核/提交不可确认，刷新token也不能绕过|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；gate-results.json;inherited/fr037-signed-result.json;inherited/fr037-signed-requests.json|
|30-11|试算撤销/修改后旧提交不可确认|PASS|b09b3e2f50996aa01b6ec48f915c5f4e7d8f90e8;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；gate-results.json;inherited/FR-030-INDEPENDENT-REGRESSION.txt|
|30-12|确认保存原输入、运行、规则、提交与主管决定|PASS|f00e705572c6f034f3982ca236060fae2750b801;18c2f59761c9db69554f33a2870b68e15d092320;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；partial-persisted.json;conditional-persisted.json;inherited/FR-014-015-MAIN-INDEPENDENT-REPORT.txt|
|30-13|确认副本不可直接改写，发布归档与导出不改冻结内容|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;partial-query-export.json;conditional-query-export.json;inherited/fr037-signed-result.json|
|30-14|内部发布/归档有状态与记录，仅在系统内生效|PASS|b09b3e2f50996aa01b6ec48f915c5f4e7d8f90e8;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；partial-archived-dom.txt;conditional-archived-dom.txt;partial-persisted.json;inherited/FR-030-INDEPENDENT-REGRESSION.txt|
|30-15|三角色允许查询，授权查询用户可导出归档确认副本|PASS|3290634c28f58da0d4324fc1de90d04a2ad1eaa7;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；partial-query-export.json;conditional-query-export.json;inherited/FR-030-HISTORY01-ROUND1-INDEPENDENT-REPORT.txt;inherited/fr037-browser-results.json|
|30-16|损坏/缺失确认历史所有读取路径拒绝且不写存储，有效同伴可独立读导出|PASS|3290634c28f58da0d4324fc1de90d04a2ad1eaa7；inherited/FR-030-HISTORY01-ROUND1-INDEPENDENT-REPORT.txt;segment-relevance.json|
|30-17|计划员/主管/query操作边界、即刻撤权及导出授权不能伪造|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；inherited/fr037-ASSERTIONS.csv;inherited/fr037-signed-requests.json;inherited/fr037-signed-result.json|
|30-18|提交/确认/退回/导出记录可信操作者、服务器时间和原因|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；inherited/fr037-six-actions.json;inherited/fr037-signed-persisted-business.json|
|30-19|跨源/伪造授权/过期请求拒绝无成功业务或审计写入|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；gate-results.json;inherited/fr037-signed-requests.json;inherited/fr037-signed-result.json|
|30-20|无外部执行系统账号/服务亦可完成本卡确认归档查询导出|PASS|b09b3e2f50996aa01b6ec48f915c5f4e7d8f90e8;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;inherited/FR-030-INDEPENDENT-REGRESSION.txt|

## 分层和边界

- 程序契约/本卡业务确认边界：PASS；20适用断言；不外推所有规则算法。
- 本地合成actor/正式SDK本地合成签名：PASS；新React actor seam与同SHA FR037 SDK Ed25519证据；不是实际平台发行。
- 真实平台发行签名：NOT_EXECUTED；未取线上凭据；后续平台部署负责人。
- GatewaySSO/部署/真实成员引导：NOT_EXECUTED；未在线登录/bootstrap/邀请；后续部署负责人。
- 生产数据卷/重启/分布式持久性：NOT_EXECUTED；只证隔离JSON落盘；后续部署负责人。
- 人类业务UAT：NOT_EXECUTED；负责人huiliangtao666，未代签。

离线D1/D2与平台层分开；本卡具体权限、过期/跨源、当前输入、确认冻结和历史拒绝已有证据，无已识别本卡必测未执行项。业务UAT负责人huiliangtao666，未代签。内部发布仅产品状态机，不是应用上线。本卡最小剩余产品动作无。Issue13保持open并保留FR017/022及CR等责任；Issue10/17保持closed，不重开。

## 原始证据索引

APS-Test根目录保留以下原件；Design副本temp/fr030-test-r1/。责任验收1，本轮产品修复0/修复后复测0，无新产品缺陷。

- `FR030-c8e16d40-ACCEPTANCE-R1-REPORT.txt`：`6f9c7b1255f62c9b11856d5b9a81b0e84667d98d058c849cd321bc5d61c3f842`
- `FR030-c8e16d40-ACCEPTANCE-R1-ASSERTIONS.csv`：`ad527567501fcf2b357f661801ecd0a039ee7f5f194c8e398d89f1cba7200218`
- `FR030-c8e16d40-ACCEPTANCE-R1-LAYERS.json`：`d0a27fda7698b450e0f5b332743f1f402637b8041a54981c52c09eb7b3c86a0f`
- `FR030-c8e16d40-ACCEPTANCE-R1-EVIDENCE.zip`：`82a5b8d1c5f09bc0828f10e3108c087a9e6de3c4de8c506907933be4a8b323ef`

后续只可派已有交付的未重复独立验证/存量补证；其他未开始backlog、DEC04/05/06应用实现、原01实体实现仍暂停，巡检保持实际paused。无应用发布/main合并/团队路由改动。PROCESSED通过本Inbox结果hook返回，不另派ACK任务。
