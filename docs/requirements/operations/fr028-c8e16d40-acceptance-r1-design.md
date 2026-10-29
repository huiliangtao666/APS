# FR028本卡责任验收r1：Design复核

2026-10-29T15:59:03+08:00；event_key `dlv_8d3a7593-26f1-4bf5-aa22-ffc0939d96f4:r1`；通知delivery `dlv_b6f27fc0-c061-4f19-a72e-a09949c6f5f7`；派发event_key `fr028:c8e16d40:card-responsibility-acceptance-r1`。

v0.3本卡22条适用责任断言22 PASS；Design复核接受固定产品SHA，无本卡阻断，Done。FR026成功恢复仍未完成，FR031原责任保留；真实平台/部署/生产持久性及业务UAT未执行。

需求APS-BL-001 v0.3，无本FR直接生效CR；完整产品SHA `c8e16d408b2d0207cb9886b55f39a52ebc9c1665`，分支feat/fr-013-016-main-batch，直接父18c2f59761c9db69554f33a2870b68e15d092320。Test读取治理/main快照243edd403a684a92deea5604e1b5807910d3558c，Design处理前main 243edd403a684a92deea5604e1b5807910d3558c，均不冒充产品设计提交。

[唯一原卡](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHg8s)；[归集Issue14](https://github.com/huiliangtao666/APS/issues/14)。仅本卡原两条条件试算与AC20/32适用责任；成功恢复历史配置属于FR026等原责任，不整体转成本FR关闭门槛，409拒绝不代表成功恢复。本卡新输入冻结重算、旧配置追溯、原方案/事实/耗料/真实确认保护仍须核验。

## Design证据复核

- 从APS-Test原件取得副本temp/fr028-test-r1/；4项外部SHA256、ZIP CRC、139项内部hash、22行矩阵逐项引用hash和16份继承原件外部hash均通过。
- GitHub固定完整SHA/直接父、五个来源SHA祖先、89项源码与额外依赖source/target SHA256同异核验。fixed-source.tar.gz的1652受跟踪文件逐一匹配GitHub blob，并与QA容器1652文件hash逐一匹配。
- conditionChanges与完整comparePlans两个函数段从GitHub独立读取新旧原文核验字节及hash相同；业务/输入/资源/planner变化不凭祖先推PASS，由新有限场景补证。12eed551/18c2f597映射实现相同；FR037/030/027同SHA证据按责任继承。
- 真实React/Express三组complete=true且pageerror=[]：停机120→20后实际Worker附条件交付300→200，提前100；物料全零、人员1→101不消除短缺、交付未知；现有工装数→3实际求解，任务和资源占用变化可查。准备夹具API与真实页面复制/修改/保存/重算/保留/放弃操作分列。三组未重算保留409、重算后201；刷新已放弃禁重算，已保留快照仍在，完整原方案及当前/state对象不变。抽看calendar-improvement截图及DOM与网络结果相符。
- 新程序组：完成40/已耗40/剩余20后剩余物料需求60，余量10；四事实表试算编辑各409且逐次落盘字节不变。事实前进到完成50/观测35/剩余15后，同步算/Worker启动/retry/retain均409 current_execution_changed且逐次bytes不变；历史20分钟及保留快照不变，从新事实另开可重算保留。
- 新技能替代按关系编号给目标技能前后值；resourcePolicyVersion单独不造成设置不可比，实际需求/scope变化仍保守解释。五项旧探针定向与延期供给集成通过，不把原280+17整组改签当前版本。
- 已确认原件组：FR037正式SDK本地合成签名下真实主管确认的signed-persisted-business.json与本包夹具逐字节hash匹配（6724d05885e065214164d7cbbf5b69b7a3a53d24d20b4b1d87526aeafa40ce5b）。以捕获原件初始化隔离QA库后copy/改交期/重算/retain/discard通过，原plan/inputs/confirmation/inputVersions/current state全等；不声称本轮重做确认或真实平台发行签名。
- 独立QA Docker中TypeScript/Vite/server/production Worker build通过；产品源码未改。Design未重复运行已通过同版本同范围测试。

## 逐条责任矩阵

|断言|本卡责任|结果|来源SHA及证据|
|---|---|---|---|
|28-01|页面名称条件试算；真实页面从已存原方案复制独立试算|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;browser.mjs|
|28-02|字段级变化按业务身份保留前后值与重复组；新技能关系按关系编号识别|PASS|7465159d98fbc63f7e6b9413c71466b31d9bad82;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；directed.log;new-comparison-fields.json;segment-relevance.json|
|28-03|编辑现有停机条件并冻结新输入实际Worker重算，任务与附条件交期改善|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；calendar-improvement.json;calendar-improvement-dom.txt;browser-results.json|
|28-04|增人不能消除物料瓶颈，未知交付/无改善如实显示且需求不变|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；staff-material-shortage.json;staff-material-shortage-dom.txt|
|28-05|现有工装可用数修改实际参与新求解，任务和资源占用变化可查|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；tool-capacity.json;tool-capacity-dom.txt|
|28-06|延期预计供给在当前集成中保留批次/条件及较晚交期；旧87分钟证据保留原SHA|PASS|7465159d98fbc63f7e6b9413c71466b31d9bad82;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；delivery-directed.log;inherited/FR-028-independent-regression-report.txt|
|28-07|显示字段变化、受影响任务ID、交期前后值与变化分钟，不承诺真实交付|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；calendar-improvement-dom.txt;calendar-improvement.json;staff-material-shortage-dom.txt|
|28-08|修订后未重算旧结果保留409；三组UI请求真实捕获|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;browser.mjs|
|28-09|保留准确指定最近重算结果、输入/hash及比较证据；仍为draft且不采用|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；calendar-improvement.json;staff-material-shortage.json;tool-capacity.json|
|28-10|放弃后禁止再算，刷新保留历史和保留快照，原计划与当前输入完整对象不变|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;calendar-improvement.json;staff-material-shortage.json;tool-capacity.json|
|28-11|原方案/旧输入/冻结运行可追溯，试算采用新输入；Worker实际运行且保存独立run/hash|PASS|12eed5514c702f730aae65a39a08747c532f8536;18c2f59761c9db69554f33a2870b68e15d092320;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；browser-results.json;calendar-improvement.json;current-facts.json|
|28-12|当前有版本执行事实时试算重算/保留成功，不将已耗料再次算入可用库存|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；current-facts.json;directed.mjs;inherited/FR027-c8e16d40-ACCEPTANCE-R1-REPORT.txt|
|28-13|禁止通过试算改写四种事实/耗料/来源/事件表，409且完整落盘字节不变|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；current-facts.json;directed.log;directed.mjs|
|28-14|当前事实前进后旧试算同步算/Worker启动/旧运行复算/保留均409且字节不变|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；current-facts.json;directed.log|
|28-15|旧事实结果与已保留快照可读；放弃不改当前事实；从当前事实另开后可重新试算保留|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；current-facts.json;directed.log|
|28-16|错误修订/外部结果/原结果/同修订较旧结果/放弃后保留拒绝无写入|PASS|7465159d98fbc63f7e6b9413c71466b31d9bad82;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；retain-history.log;old-probe.mjs|
|28-17|原和结果各自输入/冻结run损坏共四种保留拒绝，不回退当前数据|PASS|7465159d98fbc63f7e6b9413c71466b31d9bad82;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；retain-history.log;old-probe.mjs|
|28-18|真实内部确认冻结副本及原输入不被后续copy/试算改写；非人工confirmed标签替代|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；confirmed-preservation.json;confirmed.log;inherited/FR037-signed-persisted-business.json;inherited/FR030-c8e16d40-ACCEPTANCE-R1-REPORT.txt;inheritance.json|
|28-19|权限/即时撤权/角色伪造/CSRF/原因守卫及正式SDK本地合成签名证据按同SHA继承|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；inherited/FR037-c8e16d40-ACCEPTANCE-R1-REPORT.txt;inheritance.json|
|28-20|restore409明确安全拒绝且版本可核；本FR不把拒绝充成功恢复，不越权恢复旧库存/事实|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；current-facts.json;directed.mjs|
|28-21|不以资源版本/运行时刻单独造成虚假不可比，实际需求与scope改变仍保留保守解释|PASS|7465159d98fbc63f7e6b9413c71466b31d9bad82;c8e16d408b2d0207cb9886b55f39a52ebc9c1665；new-comparison-fields.json;inherited/FR-028-independent-regression-report.txt;segment-relevance.json|
|28-22|可信审计记录保留actor/原因/原方案/独立运行关系；当前条件/任务保护沿同SHA保留|PASS|c8e16d408b2d0207cb9886b55f39a52ebc9c1665；calendar-improvement.json;current-facts.json;inherited/FR027-c8e16d40-ACCEPTANCE-R1-REPORT.txt|

## 限制与原责任保留

restore当前仍409且未写存储，仅证明安全拒绝；FR026成功恢复未完成，不记N/A、不以本报告关闭FR026或FR031。共用恢复帮助“当前缺少执行事实接口”及旧确认错误措辞已过时，当前事实实际已有版本；沿FR026/031原责任核对说明，不重开已关闭FR018-SCOPE-NOTE01、不新增产品派工。

原7465159d的280+17、旧14/15探针及修正17/17保留原SHA/原失败，不计产品修复。结束分钟属于复合主键的变化以删除/新增表示，不伪配字段。岗位/物理池/多班/多窗口及完整CR1验收未外推；CR2仅设计/mock，参数候选值未获业务批准。

QA attempt1子面板提示误读、attempt2简略/富化响应与diff枚举错误、attempt3 alert严格定位冲突、中文Git路径按行读取错误均有失败日志，最终仅修QA脚本通过，产品未修。责任验收1、产品修复0/修复后复测0，无新产品缺陷。各组和22责任拆项不累计为全项目唯一用例数。

- 程序契约/真实React与实际Worker：PASS；22本卡责任断言；3页面组+2新增程序组+5旧探针定向+1延期集成+1已确认原件续算组；非全项目唯一用例数。
- 本地合成actor：PASS；QA-only actor middleware；实际React/HTTP/业务持久化。
- 正式SDK本地合成签名：PASS；同c8e16d40 FR037独立Ed25519证据继承，本轮不复跑。
- 真实平台发行签名：NOT_EXECUTED；无线上凭据。
- GatewaySSO/部署/真实成员：NOT_EXECUTED；无在线登录/部署操作。
- 生产持久性/重启/分布式一致性：NOT_EXECUTED；只有QA临时JSON落盘与浏览器刷新，不外推生产。
- 人类业务UAT：NOT_EXECUTED；负责人huiliangtao666，未代签。

业务UAT负责人huiliangtao666，未代签。QA持久化/刷新不认证生产耐久性，内部确认/发布只指产品状态机。当前无本卡阻断/必测未执行项，最小剩余产品动作无。Issue14保持closed并保留FR018 Done；Issue13/3 open及Issue10/15/17 closed原责任保留。未开始backlog/DEC04-06应用实现/原01实体实现继续暂停，巡检实际paused；无产品main合并/应用发布/团队路由变更。

## 原始证据SHA256

- `FR028-c8e16d40-ACCEPTANCE-R1-REPORT.txt`：`c363172d7601444ca41f68c393f4f61291bcce2b1e0efb8740faeb3edd2dd92b`
- `FR028-c8e16d40-ACCEPTANCE-R1-ASSERTIONS.csv`：`b9499ff0f728d762130ac6fe2723a962855a76cf476a62ec1ee330471bfe7140`
- `FR028-c8e16d40-ACCEPTANCE-R1-LAYERS.json`：`c1c8b1c68cf3d907e1e2ff7514faa72ca65da0a3861765b01289f3ba667d37ae`
- `FR028-c8e16d40-ACCEPTANCE-R1-EVIDENCE.zip`：`c06e074c6c1efb391eead67c316174279c4d2244cb82dad70376bc64d294295f`

本Inbox最终PROCESSED由平台hook记录，不另派ACK/完成通知。后续只派已有交付不同范围的独立验收或补证。
