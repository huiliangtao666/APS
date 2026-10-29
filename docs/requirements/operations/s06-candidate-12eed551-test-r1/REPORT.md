FR007/017/022 / Issue #3 — S06候选联合分配独立验收 r1

结论：本次已授权S06/C05/C06有限检查点 PASS，S07不足对照 PASS。FR007、FR017、FR022当前整卡分别建议 NOT_READY；保留原范围通过记录和具体剩余范围。没有新发现的本检查点产品失败，不创建缺陷编号，不增加D01–D03或RAW01修复/复测轮次。本结果不能升级完整48项、完整CR或业务UAT。

交接与版本
原Test delivery：dlv_f4ebcde5-67f6-4898-a740-535c299548de；结果r1；event_key：dlv_f4ebcde5-67f6-4898-a740-535c299548de:r1；类型 TEST_VERDICT。
派发event_key：s06-candidate:12eed551:independent-acceptance-r1。
上游Dev：dlv_3a49b951-ccd7-4575-b44e-45d70684be50:r1；通知dlv_12bd1b32-b929-4c2e-9a92-a190bd36d6e4。
产品分支：feat/fr-013-016-main-batch；固定GitHub产品SHA：12eed5514c702f730aae65a39a08747c532f8536。独立网络clone、fetch完整SHA、detached checkout；远端ref读取也指向本SHA，不追移动HEAD。最终git status为空。
需求：v0.3+CR-DEC02-03-20261029，FR007/017/022，C05/C06、S06/S07。
设计台账SHA（单列）：730556fd18bd1b15d6c37005bf5ac4c09356cc93。已从GitHub读取该commit及requirements-register.csv；不是产品SHA。当前原Issue3及技术评论6488100895、main handoff-policy均独立读取并存证。
主Issue：https://github.com/huiliangtao666/APS/issues/3；技术契约：https://github.com/huiliangtao666/APS/issues/3#issuecomment-6488100895；关联Issue13/16。Issue16原归属FR021，不伪造FR022专属缺陷。
唯一原卡：
FR007 https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHgjs
FR017 https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHgv4
FR022 https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHg1o

先行事件
已核对FR034原delivery dlv_0f7e77e1-2dde-492c-9dd8-b6e35f5a742d的独立报告、逐条结果及通知：RESOURCE-EXPLAIN-01修复round1、复测round1 PASS；建议READY_DONE。通知dlv_ad222071-d602-411c-83ea-d2c9f1e0b50d为SENT、待回执。本轮没有重跑/混写该缺陷轮次，不以本S06结论替代该独立事件。

获取与执行
按要求尝试praetor workspaces download-file取得APS-Dev四个指定文件，每个HTTP403。未更改平台权限；只读复制来信明确指定的同机APS-Dev交付文件，保留来源限制和原错误。报告、剩余矩阵、ZIP的SHA256逐字匹配Dev清单；取得成功不冒称File API下载成功。Dev ZIP仅作对照，不作为独立执行结果。
应用源来自temp/s06-candidate-independent全新GitHub checkout；在一次性QA Docker应用容器内构建、执行Node/React/Express/Worker/Chromium，源码只读挂载，不触碰在线库。复用既有QA依赖镜像sha256:0d45a31aa25c4cca1eaacbfd1ba4ee6d5028d899b329e49a6036a66fd0c35da8；没有在宿主安装依赖或启动应用，没有声称本次npm ci。按workspace-app-builder隔离构建规则核对，不绑定、不发布或重启在线应用。
独立新建fixture/probe及穷举oracle；前台runner基于已交付s06-browser结构适配，替换为Test自建输入，增加八组真实Worker置换和DOM存证。辅助重新执行源内12项专项及既有相关回归，明确不是照抄Dev日志。身份为QA合成用户，使用真实会员/权限中间件及runtime alias，非Portal签名SSO或人类UAT。

逐条实际结论（详见ASSERTIONS.csv A01–A24）
1 PASS：真实React把R1从单组A改候选B,A，保存200→reload中文字段及GET读回→真实异步Worker。R2需要A由A供给、R1需要B由B供给。新Test输入另做需求顺序×候选顺序×组顺序八种真实Worker及八种allocator置换，全部成功。等候选集合A,B / A,C / A,C的三独立source回退例必须把B留给首需求，实际成功，不只是按候选数排序。
2 PASS：候选仅显式1–32组，与单组互斥；空/重复/未知/双来源/删引用组拒绝。32组合法保存，33组拒绝；旧CSV省略候选字段仍只绑定原A，不扩成任意组。新迁移没有生成候选默认；初始值不因此成为业务批准值。
3 PASS：S07通过真实前台限制候选A并删除B，保留同窗R1/B与R2/A两需求，Worker零已排任务、无人员账，明确UNPLANNED/PERSONNEL。恢复B但候选仍A同样未排，不能偷用未接受B；关闭A→B后不匹配。每次Worker冻结输入、完整plan、检查器输出已归档。
4 PASS：旧24ba688基准独立重放空组allocator诊断，B需求在前失败、反序成功；同旧源码候选API400，合法显式A单组的真实Worker未排且无人员账。空组诊断不称合法前台失败。原48中S06的FAIL_SCOPE、说明和SHA原样保留，新列只记录本检查点PASS。
5 PASS：直接同技能、显式有向一跳；精确MIX禁止覆盖*允许（两种边排列均拒绝），不反向、不传递；不使用未接受组。单班、真实参与窗口及可用期约束通过。既有占用[0,10)与新[10,40)相邻合法，新[9,39)冲突拒绝。
6 PASS：独立穷举oracle不导入产品匹配/窗口/allocator/检查器，使用逐人分配枚举320组小例，含候选子集、数量1/2、异窗、容量、既有占用，全部与allocator可行性一致；每例保存完整输入、期望、实际，原对象不变。只认证这些小规模有限情形，不推导全局最优或所有大规模可行性。
7 PASS：同池跨技能统一容量，整数拆分与有限回退专项通过；未排无分配返回、不改变caller reservations。实际257派生窗口与19个需求竞争18人触发50000状态边界，均searchStatus=limit、无allocations，诊断“不代表数学不可行”。运行时RangeError递归保护已源码审查；没有强行触发真实栈耗尽（L01 NOT_EXECUTED，非本派发要求的额外强制故障注入）。不会重排caller中既有已提交占用，不承诺全局最优。
8 PASS：检查器从冻结需求重建候选、role需求、人数覆盖及共享峰值；递归导入闭包仅资源冲突/数量/策略等模块，无scheduler/planner/staffing/allocator导入、无替代排程搜索。独立构造14类篡改：demandKey、未知组、未接受候选、requiredSkill、providedSkill、relation、缺账、短覆盖、超量、非整数、孤儿账、班次、可用期、禁用关系，全部problem；保存完整坏plan/冻结data/诊断。旧显式单组没有新demandKey的账仍pass。
9 PASS：非法及混合表请求400、query/非成员绕UI403、stale409，逐请求完整business.json字节不变。前台非法候选草稿保留而存储不变。CSV新header候选preview→commit→GET、坏候选preview不提交、旧header兼容均通过；审计actor=test#planner、服务端时间、reason、fromVersion/toVersion有效。
10 PASS：14个真实Worker场景由独立Python重算冻结snapshotHash，对比run/plan/input身份；同时按事件端点独立核算人员峰值，全部一致。真实submit→主管confirm后，原完整plan、完整confirmation、plan inputs、run inputs在全部置换/配置变更/新Worker/非法请求后全量相等；historyBefore/After完整对象及hash保留，不只比较ID或局部字段。
11 PASS：34/34 FR016/RAW01/CsvBatchPanel/csv-draft等保护文件逐字节对比24ba688，且hash与原Test清单全等。源树manifest/provenance归档，不改旧验收证书。
12 PASS：D01–D03旧独立round1 runner适配固定本SHA重新执行八组全部PASS，含D01冻结范围篡改、D02真实起止空草稿/0保存刷新Worker、D03未来规则前台/生效边界/内在人员保护。仅回归，不创建第二修复轮次。RAW01既有关闭保持；相关raw01测试作为140项一部分执行，不重新认证其完整整卡。

辅助执行计数与诊断
独立probe七组PASS（其中一组320个oracle子例、另一组14类篡改），实际前台14个Worker场景，八组D01–D03回归。源内S06专项12/12、DEC政策8/8、相关140/140、npm test库90/90及权限业务124/124、编辑器10/10、资源面板1/1、原参数化浏览器12组通过，完整tsc/Vite/Express/Worker build exit0。以上有交叠，不相加为唯一覆盖数或整卡用例数。
首次Test自建32组边界fixture误保留引用A技能的替代关系，而32组都只声明B；服务端正确拒绝悬空技能。修正测试fixture移除无关关系后通过，旧脚本/日志/results在diagnostics-attempt1保留。此为测试夹具适配，不是产品缺陷或修复轮次。最终独立probe全PASS、前台complete=true/errors=[]、旧回归complete=true。

48项与未执行明细
48-RESULTS.csv保留原16列及旧结论/说明/SHA全部单元格，也保留Dev追加三列；仅追加Test五列。matrix-integrity.json校验48行原值全等。Test新列PASS仅指该行注明的S06切片。例如U01不因此成为全参数中文说明覆盖，H02不因此完成升级回滚/缺旧snapshot矩阵，R02不因此完成所有物料联合回退。
本次没有执行完整48项新验收；不相关或未扩展行的新列为NOT_EXECUTED，旧25 PASS/19 PARTIAL/2 FAIL_SCOPE/2 NOT_EXECUTABLE等历史统计保持。P08独立同技能岗位FAIL_SCOPE、P06多班同池/P10跨组同物理池NOT_EXECUTABLE及所有原PARTIAL未被隐去。新S06 PASS不涂改旧pin失败。
本次派发的有限检查点没有被平台403阻断的必测项；取得本机指定交付文件及独立GitHub源后已完成上述验证。额外强制真实栈耗尽未执行，仅审查保护；完整CR剩余实施、原48其他扩展、完整生产规模、真实Portal签名身份及人类业务UAT未执行，不将这些统称为本卡通用阻断。

逐FR建议、真实剩余条件及负责人
FR007 NOT_READY（当前v0.3+CR02/03）：历史原配置范围Done及已通过记录保留。候选前台、单班实际窗口、共享跨技能人数和一跳替代本检查点通过；独立同技能岗位需求身份/累加(P08/P09)、跨组同物理池身份与拒绝/说明(P10)、多班/交接表达或明确阻断(P06)仍未解决；原多窗口保存后Worker、全部范围说明等PARTIAL仍按48矩阵保留。最小下一步：Design按原Issue3明确这些原人员条款的兼容表达/禁止契约，既有授权范围内由Dev补齐并交固定SHA，Test只验证相应责任断言。不是重开已通过S06或旧D缺陷。
FR017 NOT_READY：候选维护/保存/审计/冻结/禁用与精确范围、D01/D02/D03保护通过。原CR02/03全参数适用范围/继承预览(T08/T10/U01)、启用/未支持/缺项状态(U05)、迁移保留(H02)仍有原PARTIAL；未支持岗位/物理池/多班组合须有明确前台禁止及说明，不能仅字段可保存即宣称采用。最小下一步：Design逐条映射本FR的维护/启用/状态责任，Dev仅补已授权的具体缺项，Test固定版本补证。CR04/05/06设计F01–F04及未派应用实现单列保留，不把未派CR作本次S06通用关闭门槛或启动授权。
FR022 NOT_READY：本S06联合候选分配、真实不足、有限回退及冻结独立校验通过。所有已启用资源在实际窗口同时满足仍是本FR义务：独立岗位/跨组池/多班的容量语义、原始执行资源事实账(N06)、同工装多不连续窗口及原R01多成员联合Worker/R02全物料回退等未完范围继续保留。最小下一步：Design在Issue3/关联Issue13/16列出具体本卡条件和负责人；Dev只按既有授权补兼容模型/阻断与计算链路，Test针对固定SHA补必要验证，不因单点PASS认定整卡全部启用资源通过。
FR006状态保持由Design掌握。本次不审其整卡、不直接改GitHub卡或Issue，不main合并、不发布、不恢复未开始backlog/巡检，不创建或应用Agent Team、不改路由。业务UAT负责人huiliangtao666，未代签。

交付与复现
同前缀REPORT.txt、ASSERTIONS.csv、48-RESULTS.csv、EVIDENCE.zip、SHA256.json。ZIP含来源403/hash记录、GitHub原Issue/评论/设计版本、源码manifest、34保护对照、独立新fixture/probe/oracle全部样本及坏账、14真实Worker完整冻结/plan/verification、确认前后全量对象、截图/DOM、D01–D03八组回归、构建和辅助日志、原48及旧报告。原Dev ZIP也作为标记来源材料保留，不能混作独立执行。
从工作区根运行bash temp/s06-candidate-evidence/run-independent.sh / run-d01-d03.sh；run-baseline.sh重放旧SHA诊断，regression用DEC0203_REPO/OUT调用固定源qa/dec0203-docker.sh（OUT须为空）。依赖上述QA镜像及Chromium网络，可在隔离副本复现；不需要在线应用。
结果先完整保存及hash后，按同event_key主动通知APS-Design一次；具体delivery ID及SENT/RECEIVED/PROCESSED见同前缀NOTIFICATION.json。queued仅SENT，未收到PROCESSED只能写“已发送，待回执”。通知与普通ACK不产生下一条完成通知。
