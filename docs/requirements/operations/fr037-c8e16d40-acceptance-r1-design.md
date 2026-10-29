# FR037本卡责任验收r1：Design复核

2026-10-29T15:12:47+08:00；event_key `dlv_88a6254b-a3ac-4e5c-a218-7db64b5580fa:r1`。通知delivery `dlv_b9437236-1f5e-4866-929a-49a6de68dc5d`。

v0.3本卡25条适用责任断言25 PASS；Design复核接受固定产品SHA，无本卡阻断，Done。部署/平台四层与业务UAT未签收，历史范围及原SHA保留。

接受需求APS-BL-001 v0.3、产品分支feat/fr-013-016-main-batch、完整产品SHA `c8e16d408b2d0207cb9886b55f39a52ebc9c1665`；直接父18c2f59761c9db69554f33a2870b68e15d092320。设计治理/main取证快照5c7e27df3b413b960b7abdcf773a1e68a09cf9f0单列，非产品版本。

[唯一原卡](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHhGM)；[原Issue10](https://github.com/huiliangtao666/APS/issues/10)。本轮覆盖FR037两条及AC03/22/24分配给本卡的责任；不复制其他FR全部验收义务。

## 复核依据

- File API取回报告、25行矩阵、六类记录、分层表及证据ZIP；5个外部hash及包内78个hash全匹配。
- 独立核对GitHub固定提交及直接父、五个旧SHA祖先关系；auth/store、routes、index等标为相同的blob均与GitHub产品树一致；18c2到本SHA的business/confirmation相同。Test保留127文件运行源匹配与tracked clean、TypeScript/Vite/server/Worker构建日志。
- 本轮正式SDK+本地合成Ed25519签名：60个定向请求、签名/目标/代次拒绝、每请求当前角色、撤权、query写入与导出授权；六类成功操作落盘服务端身份/角色/时间/原因/requestId，客户端伪造无效。
- 真实React：计算/复核/提交→退回→重提→确认/内部发布；query仅授权时可下载CSV；错误列表为空。试算调整、正常模拟质量维护及query拒绝有定向HTTP证据。
- stale及已确认保护和原字节保留有直接证据；旧FR037 78+9、FR030有效切片、HISTORY01 round1、FR014/015引用保护分别按原SHA继承。旧I14 FAIL与旧501只说明当时版本，不改签、不纳入当前PASS依据。

## 责任映射

|断言|责任|结果|来源SHA/证据|
|---|---|---|---|
|37-01|服务端正式SDK签名验证；无签名/坏签名/错误target/generation拒绝且无写入|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；signed.test.mjs;signed.log;signed-result.json|
|37-02|非成员/admin/member无业务权限；所有业务路由每请求核验当前成员角色|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；signed-requests.json;provenance.json|
|37-03|query伪造body actor/role/canExport不能编辑、计算、运行、提交、确认、退回、发布或导出|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；signed-requests.json;signed.log|
|37-04|planner无主管确认/退回/发布权限；supervisor有真实状态机正例|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；signed-requests.json;supervisor-released-dom.txt;browser-results.json|
|37-05|planner和supervisor均可维护、计算及调整独立试算；query不能改试算|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；adjustment-results.json;adjustments.mjs|
|37-06|撤权下一请求生效；主管降级禁止计算、移除禁止读取|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；signed-requests.json;signed.log|
|37-07|canExport显式grant允许query导出，撤回立即API403且无成功记录|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；signed-requests.json;six-actions.json|
|37-08|真实React三角色说明/禁用/提交/退回/确认/发布与授权CSV下载|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;planner-submitted.png;supervisor-returned.png;supervisor-released.png;query-export-denied.png;query-export-authorized.png;query-authorized.csv|
|37-09|模拟质量可由计划员/主管正常维护；query403；前台明确模拟数据、无QA在线审批|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；quality-results.json;query-export-denied-dom.txt|
|37-RECORD-import|导入实际成功请求落盘服务端签名身份/存储角色/时间/原因/requestId；客户端伪造不覆盖|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；six-actions.json;signed-persisted-business.json;signed-requests.json|
|37-RECORD-edit|编辑实际成功请求落盘服务端签名身份/存储角色/时间/原因/requestId；客户端伪造不覆盖|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；six-actions.json;signed-persisted-business.json;signed-requests.json|
|37-RECORD-calculate|计算实际成功请求落盘服务端签名身份/存储角色/时间/原因/requestId；客户端伪造不覆盖|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；six-actions.json;signed-persisted-business.json;signed-requests.json|
|37-RECORD-confirm|确认实际成功请求落盘服务端签名身份/存储角色/时间/原因/requestId；客户端伪造不覆盖|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；six-actions.json;signed-persisted-business.json;signed-requests.json|
|37-RECORD-return|退回实际成功请求落盘服务端签名身份/存储角色/时间/原因/requestId；客户端伪造不覆盖|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；six-actions.json;signed-persisted-business.json;signed-requests.json|
|37-RECORD-export|导出实际成功请求落盘服务端签名身份/存储角色/时间/原因/requestId；客户端伪造不覆盖|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；six-actions.json;signed-persisted-business.json;signed-requests.json|
|37-16|真实确认/退回工作流事件及前台操作者/时间/原因；不是伪造confirmed fixture|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-persisted-business.json;supervisor-released-dom.txt;signed-persisted-business.json|
|37-17|真实计算→复核→提交→退回→重提→主管确认/内部发布权限链|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;signed-requests.json|
|37-18|输入变化使旧token和重新review的旧方案均不能确认，须新算/复核/提交|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；signed-requests.json;signed.test.mjs|
|37-19|已确认不可经save/verify/submit/return/confirm直接改写；release及query export不改确认副本和输入|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；signed-persisted-business.json;signed-result.json|
|37-20|授权不能绕过stale旧值门槛；拒绝请求业务/成功记录字节不变；调整不覆盖原输入|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；signed.test.mjs;adjustment-results.json|
|37-INH-01|原签名完整拒绝矩阵、CSRF、成员变更、canExport及操作日志无任意改写入口|PASS|51e1e7ed1c7fe6c658e16337da97979fad344a30；inherited/FR-037-INDEPENDENT-REGRESSION.md;provenance.json;security-segment-relevance.json|
|37-INH-02|旧FR030 I01/I04/I07/I08/I13/I15真实流程/权限/冻结保护切片；旧I14 FAIL保留，不作当前PASS依据|PASS|b09b3e2f50996aa01b6ec48f915c5f4e7d8f90e8；inherited/FR-030-INDEPENDENT-REGRESSION.txt;history-business-diff.txt|
|37-INH-03|HISTORY01 round1修复后历史完整性保护PASS；不重开缺陷或重跑全组|PASS|3290634c28f58da0d4324fc1de90d04a2ad1eaa7；inherited/FR-030-HISTORY01-ROUND1-INDEPENDENT-REPORT.txt;history-business-diff.txt|
|37-INH-04|旧真实主管确认/编辑引用保护；全plan/input/confirmation原字节保存|PASS|f00e705572c6f034f3982ca236060fae2750b801;18c2f59761c9db69554f33a2870b68e15d092320；inherited/FR-014-015-MAIN-INDEPENDENT-REPORT.txt;inherited/independent-confirmation-proof.json;provenance.json|
|37-25|独立GitHub detached/source127一致/tracked clean；TypeScript/Vite/server/Worker build|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；provenance.json;runtime-verification.json;build.log;tracked-status-final.txt|

## 独立未执行层次

- 真实平台发行签名：NOT_EXECUTED；本轮正式SDK仅本地合成签名。
- GatewaySSO/部署/成员引导：NOT_EXECUTED；无在线身份/成员/部署操作。
- 生产数据卷及重启持久性：NOT_EXECUTED；仅临时QA落盘；非生产证明。
- 业务UAT：NOT_EXECUTED；负责人huiliangtao666，未代签。

程序权限契约PASS不等于实际网关/SSO开通。原第3章D1/D2离线仿真职责及本卡基本权限/操作记录要求已覆盖；未识别须依赖真实平台的本卡必测断言。撤销Issue10旧body将部署/UAT和其他FR完整验收笼统作为FR037关闭条件的判定；原body保留为历史。本Issue按FR037缺口完成关闭，其他卡/Issue不自动关闭。平台部署层待后续部署负责人安排，业务UAT负责人仍huiliangtao666，未代签。

## 证据及后续

APS-Test根目录以下原件保留，Design核验副本位于temp/fr037-test-r1/（报告位于temp/）；不把QA脚本失败计产品缺陷，责任验收1、产品修复0/修复后复测0。

- `FR037-c8e16d40-ACCEPTANCE-R1-REPORT.txt`：`5960bc8c6b16a9efa2a16830f4bcbd6015804437122edde5c1d8c743a144de26`
- `FR037-c8e16d40-ACCEPTANCE-R1-ASSERTIONS.csv`：`1c22176a71281d50c243a1fed0c35807aad37b5131ebc2d9c92b99a1efab78b2`
- `FR037-c8e16d40-ACCEPTANCE-R1-LAYERS.json`：`68df15a2f79cae3504fddc9f438e7e3b0a966c672a01be9347fd61b66920337a`
- `FR037-c8e16d40-ACCEPTANCE-R1-SIX-ACTIONS.json`：`c739068f06540227699e736859a188ad99df1ec926e4545e29b3a3680c5e7d66`
- `FR037-c8e16d40-ACCEPTANCE-R1-EVIDENCE.zip`：`a13eb936835c3950cf7cbee821355a1fc9b2e43f11b0a092178deea56003ee2e`

FR037最小剩余产品动作：无。其他未开始backlog、DEC04/05/06应用实现、原01实体实现仍暂停；巡检保持paused。本轮无应用合并/发布/成员或路由变更；后续仅可续派已有交付且未重复的存量验收。PROCESSED由Inbox结果hook记录，不另派ACK/完成通知。
