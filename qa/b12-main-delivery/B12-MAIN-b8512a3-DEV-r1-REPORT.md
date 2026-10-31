# B12 main整合与冻结来源接缝交付 r1

main串行整合与本次产品接缝 **PASS**；完整原始输入链及Issue39整包 **PARTIAL / NOT_READY**；QA **NOT_EXECUTED**。已普通push `b8512a3853160fca8deaf374cb1c5da3ea9e771c`，GitHub API与ls-remote读回一致。没有force/reset/revert、应用发布、部署覆盖或代签QA。

原main任务 `dlv_4c01a1e7-3520-4764-81a6-b7438c2b41f1`，结果修订r1，event_key `dlv_4c01a1e7-3520-4764-81a6-b7438c2b41f1:r1`；源接入delivery `dlv_095eca3c-c1c4-4882-97cb-3cdf82e8f2b8`，dispatch `b12:verified-domain:dev-main-handoff:20261031:r1`。B12原源event `dlv_eccbf433-46fc-4696-ab37-76817c015055:r1`保持原样。唯一原Issue https://github.com/huiliangtao666/APS/issues/39 及Project #2；未创建重复任务/原卡。

需求依据为APS-BL-001 v0.3、适用已生效CR-DEC02-03及原Issue39清单；CR-R21的显式订单选项仅沿现有合同。FR005原文要求按产品及适用单位配置加工速度；BR13原文包括前后产品方向、资源、时长、人员、验证等待和禁止组合。二者未由固定程序测试冒称完整实现。DEC04–06仍仅设计/mock，B02预占提案effective=false。

源及main关系：

- 实时起始main `a0b846e5b7aba5ee165b8d12fabfe8896fbc4ff2`，B12产品源 `e8e2081ac7ba5e503ee9ddb2df41bb5d07a21f75`，源直接父 `ca0837d5cb9b896ca4ad60973aac323d793d0e41`，merge-base `12d453d7cb03829dc609115e48c5e4c19af4a6ec`。12个源增量文件与main后续1327个文件无交集。
- 首次合并 `0d0adc1dba20161af3dcd82efeb831f0730c53ac`，双父a0b846e/e8e2081；新增接缝 `fc85fa60f0c772ee4922a477118a90b6524adba9`。B12六个src文件与源逐字相同，B09物料实现/历史产品链保留。
- 推送前实时fetch并保留PM治理main `7626e7e980a2d5d86d4006079eeddfe821ae8381`，形成 `00ffc1adda4f77ccadba3b666c460de427155a77`，双父 `883089f44065a7fc3632afeaff3eb214dfb7de79` / 7626e7e。最终b8512a3直接父00ffc1a，仅补候选夹具原CSV字节保留。
- 两次merge均无文本冲突。最终src/server/public/package/lock/build配置树与fc85fa6完全一致，73个前端资产hash全部一致；最终3352个受控文件已在实际运行镜像校验。没有吸收Test #40在途独占文件、保护分支d462fb0或待定UIUX。产品SHA、PM治理SHA和B12证据SHA分别记录。

产品接缝：

- planner和独立校验优先消费checker.findings，保留原problems兼容诊断，不丢弃只有旧字符串的错误；缺工序仍逐任务解释。context从生产者/真实任务/唯一冻结设备依赖取得orderId、productionBatchId、operation、machineId及taskIds，不解析翻译消息或猜身份。
- makePlan将task.processSources经现有bindProblemSource绑定冻结inputVersion/sourceMap/csvSources；资源工作台读取这些已绑定来源。子集重排、当前输入被改或缺失CSV证据时，仅保留可证明的位置，不伪造原行。未排任务同样能导航冻结设备/依赖与生产者来源。
- 冷却提案保持integrated=false，exactLoadKg为合格产出240；热投入250。正式联合任务继续由冻结订单和生产记录生成；两个生产身份合炉热投入500，对应冷却480，400空间反向拆炉；不缩短120程序、不补尾超产。

实际验证及证据边界：

- `00ffc1a`固定源56项核心/边界/负面/接缝检查、113库检查、126 API/权限/Worker/恢复/共享访问检查通过。适用B09/B08/原整合接缝15项通过，补齐UAT07录制fixture后5项通过。上述旧执行记录保留实际SHA，以最终产品树/73资产一致分析复用；不迁签成在b8512a3重跑全部。
- 最终b8512a3重新执行6项受影响profile/来源/API/Worker/保存/重开/私有进程重启检查通过；最终真实React三场景各经多CSV导入、完整订单、全部11条启用约束、正式应用Worker、独立校验、保存重开与native CSV，分别5/10/10任务。工具/人员/物料负面、239空间未排及当前修改不反算旧480方案通过。查询员可重开只读、不可编辑/导入/新算。
- 最终UI三场景独立CSV/Fraction/事件扫描与nativeCSV核验3/3通过；主产品的域23条与R4独立23条核验另存。检查标准从冻结输入/数量/区间与独立算术取得，不依赖排程器PASS字段。
- 78份原件与根ZIP及e3e17b2固定源逐bytes/hash一致。最终每场景9类兼容CSV共27份直接使用根原件bytes（01/02/03/04/07/08/09/10/15），包括UTF8 BOM；原09字面独立保存，不作为BOM计算。其余配置为显式可替换模拟：订单附加状态、PACK固定50、规范化BOM版本/日期/单位、库存日期/状态/位置、班次/参与窗/物理池、240kg空间声明及交付条件，逐文件profile与原件分开。
- 最终真实容器重启后API/UI重开、冻结来源及native CSV原始bytes/hash一致。首次过早探测被连接重启打断，ready后通过。初期自测缺store/缺UAT17或UAT07 fixture、独立校验测试调用参数、浏览器选择器/BOM比较口径均已修正并保留准备记录；无新QA产品FAIL/修复轮次，未更改验收预期。

当前入口 `http://host.docker.internal:18178/`（VM `http://127.0.0.1:18178/`），独立容器 `aps-b12-qa-main-b8512a3`。这是工程候选入口，**不是整体QA入口已获PM批准**。模拟planner/supervisor/query从`/__qa/role/<role>`进入，无需正式账号。`/api/uat-build`回读完整SHA、workBuild=false、3352源校验及配置/资产指纹；551个HTTP对象与跨容器回读通过。全新私有数据仅初始化UAT12显式profile：revision1、plans0/runs0；没有替QA计算或验收。每场景`/fixtures/UAT-12/PROFILE.json`、`IMPORT-REQUEST.json`及UAT13/14同路径可直接取得。

B09 QA仍固定66d4d43、18169及其原任务；未覆盖环境或迁签UAT09。PM新增UAT09治理记录已保留，旧PASS仍只绑定原SHA。没有另派B12 Test或QA；Test #40独占execution-facts/simulation-events/plan-comparison/downtime-shift-reason和b15/qa域未改。

剩余关闭条件与负责人：

- **完整原19类输入映射：PARTIAL，Dev/PM。** 未补订单选项时UAT12/13/14分别3/6/6项；显式补原17后继续显露原05/06 READY绑定、原12物料“由BOM计算”与动态空间口径、原13库存映射、规则/速度/BOM等缺口。再显式替换固定PACK及既有规则合同后仍分别25/24/24项。三层逐条原件位于admission目录，均零写入；不能把profile通过冒充原19完整导入PASS。已批准且可直接补的原05/06配置与原17选项由Dev沿本Issue继续，不需新增授权；涉及以下未决语义由PM归集后通知用户。
- **A01 WAIT_APPROVAL，PM→用户：** 保留原矩阵的PACK按支数产品有效速度/效率/适用单位映射。当前固定50是明确模拟；FR005完整速度责任未完成，不套通用重量速度。
- **A02 WAIT_APPROVAL，PM→用户：** 保留跨批包材取整、非kg生产粒度、任意装载节点、通用重组、新尾批语义等原未决项，不新造公式/默认值。当前合法kg固定模型继续可运行。
- **BR13 / A03 NOT_EXECUTED，Dev/PM：** 前后产品方向、换型/清洗资源、时长、人员、验证等待和禁止组合仍为原14行责任中的剩余项；固定pair不替代此要求，不将其误记成第三个WAIT_APPROVAL。
- **整体UAT：NOT_EXECUTED，PM/QA。** PM先核原14行收口和上述映射/业务残余、B09前序UAT影响，再决定何时具备完整入口并按12→13→14派QA。Dev任务自测PASS、普通合main及已存在工程入口均不等于整FR/CR或Issue39 Done，不关闭QA Log。

附逐项矩阵、原14行责任扩展收口、输入来源审计、环境/完整源与资产清单、原件与内部hash及可复演源码/配方。固定产品可从GitHub main完整SHA独立取得。portable配方需Docker与registry/npm网络，包含SDK包及受控源码子集；本修订未另行从公开基础镜像独立重建，不宣称离线镜像。实际候选已按完整固定源构建并运行。

交接仅按本event_key一次DEV_DELIVERED/PARTIAL发送APS-PM；SENT不等于PROCESSED，PM回执前只记录“已发送，待回执”。完整业务结果由PM维护原卡/Issue，不形成普通ACK循环。
