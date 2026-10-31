# B09 BOM损耗配置与精确计算 — DEV_DELIVERED

受派独立组件/域范围 **PASS**：48/48核心/边界/负面自测、11/11实际浏览器操作、独立Fraction公式核验、严格组件类型检查及48/48当前main只读算术依赖兼容检查通过。主应用集成/QA UAT未执行；整Issue/FR不据此关闭。

- event_key：`dlv_8e6606f9-96c4-468f-b6f2-746954b681fa:r1`
- dispatch_event_key：`b09:bom-loss-implementation:20261031:r1:APS-Test`
- 产品源SHA：`fa4b206090524538934ccc796c125f44bfe8dcad`
- 父SHA：`172b415122472b933fc9935b5537697ebc03ccfc`
- 分支：`test/b09-bom-loss-config-20261031`
- 设计SHA：`88be84f4bf4cffab76c53df5aedb331383eb32aa`
- 结束fetch main：`4bd4972efb45a2c5892107fdc6011203ace4a14e`；merge-base `172b415122472b933fc9935b5537697ebc03ccfc`；10个新增文件与main写入交集0。src/lib/material-allocation.mjs只读算术依赖的新main变动已比对：精确函数保持；以新main库加本模块进行48项新增断言检查通过。未合main，由Dev串行整合。

交付实际组件：统一原料/生产/运输值、各物料各项覆盖/继承、显式0、取消覆盖、生效值/来源、基准及目标投入产出预览。非法输入保持草稿并禁止保存；保存调用受控props/callback，不自建服务。三项初始0%，示例2/4/10/0不是默认。source/version/kg/%明确；精确分数JSON可序列化，冻结拷贝隔离当前编辑。

批准示例Q1000，逐项产出637/144/135/50，O966，Y483/500=96.6%。目标240kg：投入26000/161、6000/161、6000/161、2000/161 kg；产出25480/161、5760/161、5400/161、2000/161 kg，总投入40000/161，总产出240。独立Python Fraction不导入APS代码，并逐项核对域结果和浏览器冻结JSON。小数0.1/0.2配方及0.1%/0.2%损耗精确O599/2000、Y599/600另有具名断言。

边界/负面覆盖0/100%、单项全损耗/全配方O0、目标0、超100%、负值/NaN/Infinity/指数/空值、缺配方/来源、单位不一致、重复/未知物料、基准不完整、模型版本、JSON损坏、配置不变。全损耗配置合法，O0时任何目标反算NO_PRODUCIBLE_OUTPUT；取消目标可保存配置。不叠旧总收率、不从显示值反算、不变更原定额。

浏览器实际填写→保存回调→本地JSON存储→reload读取；冻结已保存配置→修改三项→再次保存→reload，旧快照bytes不变。此处本地存储只属QA适配器，未声称应用API/真实Worker/原生导出已通过。前两次Chromium资源中断和共享runtime类型检查进程终止原日志保留；成功运行使用独立受限容器、单进程浏览器和有限截图，0产品FAIL，旧修复轮次+0。

Dev下一步：按INTEGRATION合同接现有持久化/schema/API、运行输入、真实Worker/分配、导出及旧新model兼容。新标准投入kg profile只派生一次收率；旧run/plan保持原模型/输入/收率/证据，其他已含收率来源profile不可再次扣损。FR011完整预计供给、AC22部分方案链沿原owner继续。逐FR/AC/CR剩余见CLOSURE.csv。Test2/巡检paused，不发布、不覆盖QA环境、不联系Design；原09/10/11 PASS留原SHA。

原件在APS-Test根目录 `B09-BOM-LOSS-Test-r1-{REPORT.md,VERSION.json,MATRIX.csv,CLOSURE.csv,INTEGRATION.md,EVIDENCE.zip,SHA256.json}`。接收人可用 `praetor workspaces download-file APS-Test --path FILE --out LOCAL` 取得bytes；ZIP含固定源归档、源码manifest、GitHub原件、日志、计算JSON、独立预期、浏览器截图。完整hash/bytes见SHA256.json，ZIP内部hash见internal-hashes.json。固定源/报告另普通push至原分支下qa/bom-loss-delivery供GitHub读回。
