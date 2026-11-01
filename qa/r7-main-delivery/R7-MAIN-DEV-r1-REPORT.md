# R7 main 接续、FR036 静态修复与真实应用接缝

本次串行整合、FR036 静态/PG01 下载和 R7 查询/确认事务接缝 **Dev PASS**；完整 Issue41 / AC25 **PARTIAL、NOT_READY**；R7 QA UAT **NOT_EXECUTED**。产品已普通推送 main `7fd9683291607b65e8fbf52f633fcbc9d88254e7`，直接父 `70f5811559c7b8767b85666f3e8592215abfb7b7`，GitHub API 与 ls-remote 回读一致。

原 delivery `dlv_16b0f1de-32f3-4ce0-a436-df42b8d25d43`，结果 r1，event_key `dlv_16b0f1de-32f3-4ce0-a436-df42b8d25d43:r1`；dispatch `r7:verified-domain:dev-main-handoff:20261031:r1`；源 event `dlv_e35a72db-7415-42e8-969e-268408d33a15:r1`。唯一原包 [Issue41](https://github.com/huiliangtao666/APS/issues/41)，沿 Project2、APS-BL-001 v0.3 与适用生效 CR，不另建需求或角色微卡。设计 SHA=null。

B15 已在 `19e43ef7db177d750a5eb7e8754692a7362b3332` 交付，本次从该实时 main 接续。R7 核定源 `3b26b5cce5e4a7118337cad06f33899e7b2b0dc0`，父 `2b2a5eaed050ca86280a54d32e06cadc16363825`；merge-base `b8512a3853160fca8deaf374cb1c5da3ea9e771c`。整合 merge `a8d8ebb520c1a36eb41bf39d8ac1c9d716a4f77d` 双父为 B15 main 和核定源；双方文件交集为空，无文本冲突。R7 产品域 blob 与源一致，B15/较新 restoreBlockers、B12 process/batch、line-scope 及治理内容未覆盖。没有写 B16 新域、force/reset/revert、应用发布或修改既有 QA 环境。

FR036 沿原静态缺口修复，修复轮次不另加。父版用未修改的原完整套件复现 8 PASS / 1 FAIL（36!=38）。当前 public 矩阵及模板补 originalResourceEvents 五列事件账、originalDependencies 八列原12资料，规范化 dependencies 增加人员占用基准、人员检查顺序、人员配置来源、人员配置版本。同步 samples 下载哈希；原套件越过首断言后显露的人员组旧哈希也已刷新，人员组模板数据本身不改写。原第9章19类对象、原样例与旧六类导出示例保持字节/身份。当前38表字段、唯一键、模板、来源方向及所有索引样例原完整 parity 为9/9 PASS；真实 PG01 页面逐一完成38次原生下载并核HTTP字节。原测试文件保持原 blob，没有通过改测试规避静态失败。

真实报表 GET /reports 使用 querySavedReport；页面将当前显示的同一完整 report 对象、query 与 viewId 交给原生导出。服务端先校验对象摘要，再核当前保存视图，调用 savedReportCsv；篡改、重新计算摘要的伪造、过期 viewId、缺失/损坏来源均拒绝且不写业务/审计。六类视图及空筛选保留冻结方案、输入/运行版本、产线、单位、日期、模拟说明和 coverage。空结果不解释为资源充足。Node/server r7-handoff 没有进入 React 浏览器依赖。

真实提交/确认继续先做当前 revision 的 reviewPlan，包括冻结源、运行重放、独立资源/物料/日历/顺序复核，以及既有权限、CSRF、操作原因、审计、并发和 submission 约束；再加入 assessHandoff 保存记录数据门。现有 acceptPartial 映射 allowPartial，未新增角色或审批步骤。完整未排名单、明确接受部分、预计供给告知与范围确认均保留，输入或结果变化须重交。数据门 finalIndependentReviewRequired=true、workflowActionPerformed=false，不取代最终事务。提交保存接受决定和数据门证据；确认副本保留冻结原输入、运行、复核和决定。退回保持可用，确认/归档历史不会被新输入重算改写。

固定版本证据分开记录，旧日志没有迁签：

- `70f5811559c7b8767b85666f3e8592215abfb7b7`：原FR036套件9项、应用与源域/确认/报表/交付/B15接缝/构建Worker/查询87项、基础库113项、API/权限124项、确认面板4项通过；另有实际构建Worker→JSON重开检查。canonical 的 UAT12/13/14/17 原件须完整只读接入，单独三场景覆盖目录不够；环境失败日志保留。renderer 测试依赖只在一次性容器 /tmp 安装，不改产品package/lock。
- 最终 `7fd9683291607b65e8fbf52f633fcbc9d88254e7`：相对70f只改 QA 辅助页的初始零运行计数，server/src/public/package/lock与产品测试输入逐blob一致。最终 tsc/Vite/server/实际Worker构建通过；真实页面重新执行7组检查，含38模板、联合配置导入、Worker、独立复核、计划员提交、主管退回/重提/确认/内部归档、六类同对象原生CSV、空结果、query角色与重新打开。浏览器零页面错误。初始零运行元数据也以最终全新候选实际验证。
- 最终30项独立 Python CSV/Fraction/区间检查通过：240/0.96×650/1000=162.5kg；137.5−37.5=100，加62.5守恒；包装按现有显式配置向上取整607；记录精确值、前序与时间、页面/API/CSV一致。实际容器进程重启后 business.json、冻结报表响应和确认副本一致。性能仅报告显式1线1单6设备100次HTTP查询的环境/耗时，不签AC27。

工程候选入口为 `http://host.docker.internal:18224/`，VM可用 `http://127.0.0.1:18224/`。`/__qa/role/planner|supervisor|query` 为明确模拟的既有角色；不声称正式SSO验证。`/api/uat-build`、`/__qa/source-manifest.json`、`/fixtures/PROFILE.json` 可取完整SHA、3385受控文件、资产与配置指纹。跨容器HTTP200；仅导入可替换B3-v1规范化联合人料profile，revision1/plans0/runs0，没有替QA计算或签收。本候选是可复演工程入口，PM仍按具体场景依赖决定QA入口；不自动声明完整R7 READY_FOR_UAT。原18173、18178、B15 18210/11/12及旧PASS原SHA保留。

20行矩阵及29行收口表保留逐FR/AC/原Issue的当前责任、历史证据与下一动作。具体剩余：

- **Issue39/B12，Dev/PM沿原清单。** PACK速度/效率/单位(A01)、跨批包材取整/非kg粒度/通用重组及新尾批语义(A02)仍由PM汇总既有依据向用户决策；BR13完整方向/资源/工时/人员/等待/禁配责任仍未由本R7简单profile闭合。
- **Issue40/B15与完整原19，Dev/PM。** 保留原05唯一READY映射、原06物理池/班次/参与窗、原12“由BOM计算”运行绑定、原09未知映射及资源/规则合同的既有残余；已批准配置仍归Dev，未知含义归PM→用户，不增公式。普通未开始任务位置/锁定通过不能代生产批/合批移动。
- **FR025/030完整约束，Dev。** 本次简单路线的最新独立复核与确认链通过；包含最大等待的路线当前确认仍明确阻断，不能以查看到报告或本profile确认通过替代该受支持工艺/批处理的完整责任。沿39/40实际输入和既有边界完成最终检查及确认接缝，不静默放开。
- **AC25/整体BP01–07，Dev/PM。** 已实际贯通明确规范化profile的导入→Worker→复核→退回/重提→确认/归档→查询/原生导出；完整批准P0、原19与B12/B15责任尚未全部具备，整包保持PARTIAL/NOT_READY。不是仅剩“QA未做”。AC27还缺事先约定的规模/设备/规则组合及目标，由PM/用户明确后再执行。
- **整体QA，APS-PM/APS-QA。** PM核原件/范围及上述具体剩余后决定独立UAT派工。没有关闭QA Issue Log或迁签UAT11；Test2暂停、巡检paused、DEC04–06新增应用/B02未批预占/P1未实施，不联系Design。

上游9556b2d六原件、5项外层索引、ZIP CRC和55内部hash再次核验。交付ZIP含最终构建/执行/下载原件、固定源清单、619文件源码审阅子集、SDK、重演说明和独立检查；完整3385文件源码从GitHub固定产品取得。clean Node基础镜像配方需要registry/npm网络，本轮未另外从公开基础镜像独立重建；实际候选使用隔离B15依赖缓存，直接依赖版本与lock核对，没有从已部署服务或宿主安装依赖。

本结果按原delivery:r1一次发送APS-PM，发送与远端证据回读记录见HANDOFF。SENT不代表PM已处理；未获PROCESSED只记“已发送，待回执”，不发ACK循环。
