# B12 / #39 BR13 独立域开发自测交付 r1

type=DEV_DELIVERED
event_key=dlv_62a68abb-93cf-43f9-bf95-9bdd59fcd1e1:r1
dispatch_event_key=b12:br13-domain-reassignment:20261031:r1:APS-Test

授权独立域开发 DONE；任务级自测 PASS。#39 整包仍 In progress / PARTIAL，main整合及真实应用接缝待APS-Dev；QA UAT未派、未执行。本次不重做旧B12/B16通过范围，新增QA产品FAIL=0、原修复轮次+0、QA Log关闭0。

## 固定版本与写范围

| 项目 | 完整值 |
| --- | --- |
| 产品源SHA | c773572aa53da2235ef29233bffa3d5656ce191c |
| 直接父/起点main | 7fd9683291607b65e8fbf52f633fcbc9d88254e7 |
| 起点main直接父 | 70f5811559c7b8767b85666f3e8592215abfb7b7 |
| 分支 | test/b12-br13-changeover-20261031 |
| 收尾fetch main | 7fd9683291607b65e8fbf52f633fcbc9d88254e7 |
| merge-base | 7fd9683291607b65e8fbf52f633fcbc9d88254e7 |
| 与起点以来main新增文件交集 | []；收尾未发现main新增提交，合入前Dev仍须重核 |
| 新设计SHA | null；依据v0.3 BR-13原文与本次#39授权，未扩DEC04–06 |

新增2个src域/类型文件与7个qa契约/自测支持文件；只读复用working-windows.mjs::windowFit。
所有既有生产/批次/物料/资源/React/API/CSV/schema/Worker/R7/B16入口未改。
后续证据提交仅qa/b12-changeover-*，不改变上述固定产品源。
已核源文件及只读依赖在宿主、容器实际读取与固定Git blob逐字节相同，见source-manifest.json与container-source-manifest.json。

## 行为及输入/输出

实现显式产品方向+适用资源的唯一政策，支持A→B与B→A不同换型/等待/人员/资源需求。
缺政策、重复方向、禁配、未知引用、非法数值和必要含义遗漏精确报code/path，绝不补0、允许或反向规则。
显式durationMinutes=0、waitMinutes=0、personnel=[]均保留政策来源并有专门断言。
完整占用在一个连续可用窗内检查，并排除例外；换型和验证等待的所有显式必要占用一起核总容量。
开始早于前序结束、后序早于验证等待完成、越过声明计划范围均拒绝；相邻端点允许。
配置/账本或任一转换失败时acceptedOccupations=[]；保留已知requiredOccupations、问题解释与完整输入身份。

输出domainValid只表示域检查，overallSchedulable固定null；notChecked逐项保留实际顺序/账本权威性、物料/产量/固定工时/交期、人员共享池、质量事实与应用集成。
输入冻结深复制保存配置、日历、账本、明确顺序和来源；修改当前配置不会改旧快照。
自然等待的最早后序时点不代表现场质量审批或可交付时间。
整数分钟/独立计数是本接口的明确表示边界，不能精确适配时返回具体缺口，不进行未知单位/公式/默认值换算。

完整字段、零值/空数组语义、原子消费边界、Dev接入先后与冻结规则见[接入契约](b12-changeover-INTEGRATION.md)。

## 固定源自测与证据

| 范围 | 预期与实际 | 证据 |
| --- | --- | --- |
| 53项核心/边界/负面/保存/Worker测试 | 53 PASS / 0 FAIL / 0 skipped | selftest-fixed-source.log、selftest-matrix.csv |
| A→B手算 | 30+10=40，40+5=45；M[30,40)、P[30,40)、M[40,45)，来源A-B | CORE-01；sample-*.json |
| B→A不对称手算 | 30+20=50，50+7=57，来源B-A | CORE-02 |
| 显式零值与缺项 | 零值可追溯、无假占用；缺duration/personnel/wait/prohibited均拒绝 | CORE-03、NEG-08/11/12/13 |
| 总量/日历/等待边界 | 需求=容量通过，+1拒绝；完整窗、例外、邻接和早1分钟/越界结果准确 | BOUND-01–08、NEG-17–24 |
| 原子负面 | 缺政策、重复、未知资源/人员/技能、非法时长、错误源与未知语义拒绝；合法转换不部分落账 | NEG-01–39 |
| 独立预期160例 | 固定seed=131320261031；27合法+133预期拒绝，全160 PASS；问题集合、精确区间、readyAt一致 | oracle-inputs/expected/actual.json、oracle-matrix.csv |
| 守恒与生产保护 | 冻结上下文保留2任务/2订单、250+250=500；两固定程序均30分钟；新增占用无生产输出 | CORE-04；oracle上下文核对 |
| JSON磁盘保存重开 | 保存结果实际读回、从旧snapshot重查与原结果全等；新政策版本不改旧结果 | SAVE-01；sample-saved/reopened-result.json |
| standalone Node Worker | 实际worker_threads计算与直接结果全等 | WORKER-01；sample-worker-result.json |

独立oracle先保存输入和预期，再运行域实现。预期用Python逐整数分钟枚举，未导入被测域或fixture；实现用端点扫描。预期拒绝133例是负面断言成功，不是133个产品缺陷。
守恒检查只证明本域不会改写传入的不透明生产上下文；不冒充已检查实际生产任务链接、数量计算或完整排程。

环境：应用容器Linux aarch64，Node v22.23.2；宿主Python标准库仅处理预期与文件，Node被测代码通过app-exec在容器运行。
首次发现容器缺Python，是已解决的执行环境限制，不计产品FAIL；大JSON通过文件传输，未截断取证。
未安装依赖、未启动应用服务、未发布/部署、未覆盖QA环境，未改平台daemon。
本次无React/API/schema/应用Worker改动，因此未执行整应用构建及真实UI/API/Worker/CSV/数据库回归；均列Dev接入责任。
这里的JSON重开与独立Worker不等于应用持久化或真实应用Worker自测。

## 逐BR13/FR/AC责任与后续

逐条责任见b12-changeover-CLOSURE.csv。BR13本次独立域范围PASS/DONE；所有相关FR/AC仅对表中子断言给结果，不整体签收。
历史B12域源e8e2081ac7ba5e503ee9ddb2df41bb5d07a21f75及main b8512a3853160fca8deaf374cb1c5da3ea9e771c证据保留原结论；B16旧派工dlv_991020e0-9d19-4116-8a2d-68ac98573d8d已PROCESSED，不重新验收。

- [x] APS-Test：BR13独立实现、核心/边界/负面、独立区间/守恒预期、保存重开与standalone Worker、类型/接口契约及原件整理。
- [ ] APS-Dev：普通串行整合main并记映射；明确实际顺序/配置来源/完整联合账本；接真实排程及独立实际计划复核；补应用链路自测与问题定位。
- [ ] APS-PM：核原件/hash/逐项结论后按原event_key一次PROCESSED；更新#39和同源清单，保留整包残余与原A01/A02，不把本结果当整包Done。
- [ ] APS-QA：具体完整入口由PM核就绪后才调度UAT12–14；当前NOT_DISPATCHED/NOT_EXECUTED。

没有阻断本独立域完成的新业务问题。真实参数、方向顺序、权威资源映射、共享池或其他计时语义在接入时须明确；缺什么报什么，不推未知现场数据，不泛化BR13 NOT_READY。

## 原件取得及复演

工作区APS-Test根目录提供同字节报告、逐项责任表、测试矩阵、版本信息、ZIP与SHA256清单，最终通知提供固定40位证据提交URL及每件bytes/hash。
ZIP含固定源副本（包括只读windowFit）、测试/预期/实际原件、GitHub #39和Project #2读取、版本/源manifest及内部SHA256。
核ZIP CRC和内部hash后，可在独立Node环境从source/运行node --test qa/b12-changeover-selftest.mjs；oracle另需Python标准库。实际应用集成仍须Dev在自己的最终main候选验证。
