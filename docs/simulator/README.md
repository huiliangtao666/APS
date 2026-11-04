# 每日数据模拟器：独立源码及接入合同

唯一原卡 [#146](https://github.com/huiliangtao666/APS/issues/146)，当前实施合同 [6620567653](https://github.com/huiliangtao666/APS/issues/146#issuecomment-6620567653)。原任务 `dlv_222ab280-ee1e-41c1-9b62-45ff7eb52485`，本次续行 `dlv_9406df41-9be2-49d5-8253-5012a50f29be`。Test负责独立模块开发、自测及修复，Dev是唯一main整合者。

这是零应用负载下提交的源码。Dev 公共接缝已固定为 `98aea09775ebf03bd67b1522ab712b772b046a3c` 并由PM核收；本轮在独立目录消费其冻结来源回调及GET。尚未构建、运行自测、验证页面或实际整合本转换版本；不能据此关闭A或整CR。阶段B在协议和路由均未提供启用操作。

## 来源与范围

设计原件是本工作区自身 `upload/APS每日数据模拟器设计_20261104_R1.zip`，29326 bytes，SHA256 `2473a997c2338f9a80d9205b2a817c43ba6ff0fba9513c7c010d1c03749c1645`。ZIP CRC及08中实际声明的7件内部SHA256已核对。八件均已读取，原件不入Git；设计的人工核验不作为产品通过证据。`design_git_sha=null`。

基线FR-012/031及批准独立阶段按01全文、05 SIM-01—28执行。源码不加载主程序state、不写Excel、不调用求解器或exchange、不注册定时、不创建或发布应用。新增真实 B/P 原件及选定冻结 input/run 副本转换源码，复用原生解析和P优先规则；字段、缺项、文件选择和 Dev 一次接缝合同见 [native-import.md](native-import.md)。仍未在运行窗口验证转换，当前没有选定真实run/期初事实件，不能把工程夹具冒充真实场景。

## 文件边界与公共接缝

- `server/simulator/source.mjs`、`import.mjs`、`src/simulator/SimulatorImport.tsx`：原件字节/冻结身份核对、完整P归档与原生转换、明确缺项、BOM及独立预览，详见native-import.md；本次未运行。
- `server/simulator/contract.mjs`：协议、来源/数量/时间验证及业务指纹。
- `server/simulator/model.mjs`：纯事件归账、整数分钟加工、分批累计投料、库存/采购/履约/生产/实体资源校验、日结及零点开工快照。
- `server/simulator/store.mjs`：独立文件持久化、跨进程排他锁、完整日结原子替换、操作回执、暂停、历史分支与日间比较。
- `server/simulator/export.mjs`：注入原schema/CSV defs后读取表头、累计耗料候选、两套原点及库存口径检查、带扩展账的独立JSON包。
- `server/simulator/example.mjs`：显式三日工程样例，由用户主动载入，不作为现场默认或真实来源。
- `server/simulator/routes.mjs`：导出 `registerSimulatorRoutes(router, context)`，不自行监听HTTP。复用现有 `permission` / `actorKey` / `writeGuard`，按actor隔离模拟账，公共权限规则不改。
- `src/simulator/SimulatorView.tsx`、`SimulatorTable.tsx`、`simulator.css`：独立中文操作界面，沿现有 `api(path, body?)`，默认base `/workbooks/simulator`。搜索、多选、清空/重置、独立栏位、100/200/500分页、日历日期、来源抽屉；BOM递归去重辅助支持显式edges，从转换场景冻结的真实BOM关系按日期提供展示；尚未运行验证。
- `qa/simulator/*`：手写三日工程夹具及定向测试源码，尚未执行。

公共文件本轮均未修改，Dev固定接缝已提供以下上下文，本轮只更新专属模块：

1. `server/workbook-router.mjs`：在既有会话/权限和写入原因校验之后注册上述路由；注入 `root`（专属绝对路径，末段必须为 `independent-simulator`）、现有 `permission`、实际会话 `actorKey`、既有可信写入/原因 `writeGuard`、当前 `workbookSchema` 与真实CSV `defs`、只读 `readFrozenSource({runId,expectedInputHash?})`。模块内部路径为 `/simulator/*`，外层仍是 `/api/workbooks`。不得用无条件next作为写入控制。
2. `src/InputData.tsx`：既有导航中提供独立模拟器入口，使用同一API helper并传入既有canWrite/canExport。不得把当前用户数据集自动选为写入目标。真实冻结副本/第二P转换和BOM均由Test专属模块承担，Dev只挂既有模块入口，无需并写转换代码；完整I/O见native-import.md。
3. `docs/requirements/changes/change-register.json`：Dev随真实整合记录本CR最新实施授权、A源码未验/B关闭和原卡引用；本轮未触碰此公共登记文件，避免与#147并写。不修改历史FR Done或基线条文。

Test继续承担上述模块自测与修复；公共接缝源码及独立转换源码不等于整合或整包可用。GET仍原样交 `NOT_CONVERTED`，只有显式转换后才能载入场景草稿。

## 独立场景输入

协议 `aps-independent-simulator@1`，`mode=INDEPENDENT`。明确填写 `startDate`、`endDate`、`coverageEnd`、`timeZone=Asia/Shanghai`、`offset=+08:00`、`planningWindowDays`；本版其他时区拒绝并具名待适配，不猜夏令时。所有事件使用完整带时区的整数分钟时刻；生效不能早于发生或可知时刻。迟报需明确新的生效/归账时点，保留原发生时刻。

`source.baseline/parameters/rules` 各需 `version/hash`；参数必须已显式按第二份P优先解析并声明 `precedence=SECOND_P`。有生产任务还须 `source.plan.version/hash`，可以是显式作业脚本副本，不要求先运行主程序求解。没有计划可使用空tasks及仅非生产脚本。来源声明不会被模块自动升级为已验证真实来源。

`materials` 显式ID、单位、scale（1至1000000的十进制精度）；`lots` 显式实物、待检、合格、冻结、外部占用、失效时刻、库位、环境及谱系；`purchases` 显式原订购、累计已收、取消、已下达与谱系；`demands` 显式原量、变更、取消、发运、签收及SHIP/SIGN履约口径。空表要给数组，缺数量不补0。独立账不是新增真实预占账。

每个task显式 `totalMinutes`、`outputLimit`、同量纲 `balanceUnit`、`startRequirements[{lotId,cumulative}]`、`resources[{id,quantity}]` 和lineage。累计投料按task/lot只扣增量；同一累计值重报不再扣料。`TASK_PROGRESS` 给累计加工与显式剩余分钟；暂停/修复/恢复和每项资源释放分开。`TASK_RESULT` 显式 `final`、累计产出与工艺报废；`OUTPUT_RECEIVE` 才增加待检库存，`QUALITY` 放行不再增加实物。

`events` 显式id/type、occurredAt/knownAt/effectiveAt、businessDate、source、causes及data。causes定义因果，在时间合法范围内先于结果处理；循环/前因晚于结果拒绝。同一分钟释放先于取得，到期即时不可用；不能靠数组偶然顺序处理冲突。原子日失败保留原成功检查点；待料/资源不强行开工，待处置不能标主程序就绪。

随机基准必须明确 `enabled=false`。可选模式只接收已物化事件，须seed、规则/生成器版本、对象/概率/范围/时段；本版不暗中生成随机故障。规则修改在新分支保存，已处理事件内容不可重写。

完整格式和各事件载荷可见 `server/simulator/example.mjs`，`qa/simulator/three-day.mjs`另存独立预期常量。该夹具沿R1三日数量，额外声明PB01为17:23至17:40的17分钟测试工序；这是SIM-05工程测试条件，不是Design原文的PB01工时，也不是现场默认。PB02沿原文10:00开始、10:20暂停剩40、次日08:00显式恢复及08:45工装后延释放。

## 持久化与恢复

每actor每场景/分支有独立JSON文档，含冻结spec/hash、当前状态、每日日结、事件指纹与操作回执。temp文件与目标同目录，先fsync，再原子替换并同步目录；创建用排他硬链接，已有分支不覆盖。文档另有checksum，损坏拒绝，不静默初始化空账。单文件上限32MiB，超限保留最后可用版本，后续需要归档设计。

每分支mkdir锁跨进程排他。崩溃遗留锁不按超时自动抢占；先由实际环境owner核实无活跃推进者和待确认写入，再处理精确锁路径。模块不删除其他资源，不自行恢复服务。I/O错误是未知提交结果，先重新读取文档与 `/operations/:requestId`，不自动重新发送。

操作需稳定requestId及expectedRevision；相同身份同内容返回已持久回执，异内容409。同批连续N日逐日保存成功检查点，失败保留最后成功日与诊断。暂停标记在日边界检查，独立HTTP暂停可在长请求未结束时提交；不公布半日状态。解除暂停后用新requestId继续，不能把旧PAUSED回执当新操作。

恢复到检查点原子创建新分支，保留父/检查点/指纹谱系。改已处理历史须从更早检查点或初始基线另起分支；不得改当前分支历史。操作时间/请求号不进入业务快照hash，同源规则和事件重放可比较业务结果。

## 接口边界与未验项

当前19类接口表头直接来自注入的真实schema/defs，不复制私有设计附件或维护第二权威schema。扩展模拟账留JSON。累计耗料有候选行，但不代表配套executionFacts、订单、资源、完整日批已被目标接受。CSV负分钟保留-1920并报G02；扣后50/累计30仅在明确同批次/谱系/范围及收发证明下报告扣前等价80，仍不是目标对账通过。

G01—G09保留：Excel累计执行、双时间轴、部分收货、履约、扣耗前后、质量/恢复、多时点原子批、真实连接/持久回执、迟报。无发送、联动、求解或后台自动循环端点。SIM-27/28属于B，不执行、不签通过。权限测试OUT_OF_SCOPE_BY_USER，既有控制仅按原入口复用。

以下仍需原责任续行：PM交有界自测窗、fresh运行保护核验、编译/测试及范围内自修、真实原件/冻结副本转换实测及缺项补齐、公共入口串行接入及页面功能核验。UI多选/分页及来源完整性、BOM数据接入、真实用户可达入口尚未实测。

## 运行预算

本次应用exec/build/test/HTTP/browser/service/solver/install/pull/restart/preview/publish全部0，原600秒自测预算未使用、不增加。没有取得#147单窗，不能称全节点RELEASED。后续由PM沿原卡明确交窗，fresh核>=2GiB、实际cgroup/进程身份/保护和pending，首异常即停；官方有限app-exec单命令<=180秒、累计<=600秒。域/store测试源码为 `node --test qa/simulator/model.test.mjs qa/simulator/store.test.mjs`，只能在交窗后通过官方容器执行，不在宿主运行。UI构建仍使用原工程工具链，不安装依赖、不操作旧实例。
