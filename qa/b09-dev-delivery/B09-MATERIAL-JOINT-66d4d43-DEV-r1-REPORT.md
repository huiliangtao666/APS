# B09物料联合包：Dev开发、整合与自测交付

Dev授权范围结果 **PASS / DONE**。Issue38整包 **NOT_READY**，未给QA UAT结论。建议PM核原件和入口后先派 **UAT09**；其结论前不派UAT10/11，也不启动39+。

- 原delivery：`dlv_ddea429a-af36-46f2-be80-25c6c26f9da4`；结果修订r1；event_key `dlv_ddea429a-af36-46f2-be80-25c6c26f9da4:r1`。
- 唯一Issue：https://github.com/huiliangtao666/APS/issues/38 。Project2 item `PVTI_lAHOFM9WU84BpE1czhE8kKE`，核验时In progress；PM负责状态回写。
- 产品SHA `66d4d43e4b1cc566a47d96a93671d179d8921434`；分支 `dev/b09-material-joint-20261031`；直接父 `d0eedb9b101c7b1dad44fb0b83a6f993bd8b7560`；普通push、GitHub API与ls-remote一致。
- 固定基线12d453d7cb03829dc609115e48c5e4c19af4a6ec；整合a4df05a93fcc5e25fd97015764eb5625cdc41b07，双父69027caa82119df82ede11278f79b95374bc3e1d / 579fe0589757154857c519e4968dee1e288ca9a0，冲突0。
- Test源579fe0589757154857c519e4968dee1e288ca9a0的10文件全部逐字保留。Test证据头f1af34d4c8316abc24afd84ee0d82986dba0155a单列，4个外层原件及ZIP内28项hash已核，不把其域自测当QA验收。
- 需求来源/设计文档SHA `c48d214f8197d1346eccbb8886bb7138eb263d56` 单列；依据APS-BL-001 v0.3及适用已生效CR-DEC02-03，未实施DEC04/05/06新增应用能力。

产品变更和用户操作链：

物料/订单/产品/BOM/库存/到料类别进入既有联合工作台。零写入预览返回同一次计算的materialChecked/materialDemands；正式运行使用真实Worker和冻结输入。保存重开同时展示需求、精确缺口、候选/已排分配、排除批次、已有占用及条件供给；按明确投料分钟查看冻结库存资格。点击已排或未排任务可看冻结BOM/物料/库存/规则/供给来源，物理行必须匹配canonicalRows和CSV hash；编辑后没有原CSV证明时显示规范化行，绝不猜旧物理行。原生导出沿现有权限、原因和审计API，不另建主账。单表CSV使用arrayBuffer读取，BOM/CRLF原文保留。

Dev生产改动仅business预览返回字段、DataEditor、MaterialPanel、ResourceWorkbench、SingleCsvPanel、csv-contract和inventory-view（含声明）。Test生产改动为inventory/material-allocation/expected-supply/bom-config；其域函数签名未改。没有修改main、保护分支、已有QA环境或Portal发布配置。

固定候选验证：

- 11组实际UI链路PASS：批CSV导入→预览→真实Worker→来源/任务→保存/重开→原生导出；162.5kg=100+62.5，冻结/过期排除并扣37.5既有占用；改晚批62.4后差0.1kg，全部未排任务保留且无负库存。
- 原09六列按原字面和BOM保存；规范化BOM独立且仅计算一次。单表实际替换用明确派生650.0字面检验BOM/CRLF保真；原始CSV从未被改写。平衡规范化配方650/150→640/160后新需求160，原09仍650，旧运行保持原值。
- 四错误在批导、逐项保存及Worker入场前拒绝；确认禁用、定位文件/物理行/字段、状态原始bytes不变，修正草稿重新预览后才可成功。另附真正日历60→0倒置与其余三错同现的UI/API零写入证据；不把零长度区间伪称倒置。
- 显式可修改AC10组合325需求/400库存/占用100给出25缺口。到达120分钟不能当可用180；UI改可用时间至240后只影响新运行，仍显示未确认到货条件。这只补旧UAT05的物料影响。
- query模拟角色只读；旧运行、输入快照、CSV来源、旧原生导出不被当前库存/BOM/profile反算。实际重启私有测试容器后API及UI重开、CSV原始bytes/hash一致，包含UTF8 BOM。
- 27项独立Fraction断言PASS（未导入产品算法）；最终4组接缝、类型检查/Vite/API/calculation Worker构建PASS。
- 回归113库+124 API/权限/Worker+5查询UI+3旧资源来源检查，在fd6607fb0e088b7841a494072ec0fe7b2d25b37b通过。之后仅自测脚本变化；最终src/server/public树及全部静态资产逐字一致，证据保留原SHA，不迁签。新候选执行上述实际整合UI/原生导出/重启检查。
- Test域54测试、23独立断言、4材料影响回归保留其579fe05源与原件；不重复同SHA同断言整套。

QA入口：http://host.docker.internal:18169/ ，容器 `aps-b09-qa-66d4d43`。`/api/uat-build`必须显示本产品SHA、workBuild=false、2086份源校验及资产/profile指纹。新QA私有状态初始化revision1，plans/runs均0；仅预装明确UAT09模拟，不冒充QA执行。角色链接 `/__qa/role/planner`、`supervisor`、`query`，均为明确模拟，不依赖正式账号。

环境与原件：

容器运行实际应用，宿主仅使用已安装Chrome和从隔离镜像复制的纯JS Playwright驱动；没有在宿主安装应用依赖或启动应用。共享Linux运行环境曾发生OOM、浏览器退出及受限堆失败，原日志保留；这些不记产品缺陷轮次。原生CSV比较必须读取原始bytes，Fetch.text默认剥BOM的自测比较问题已修正。逐检查步骤/预期/实际、数据/配置/版本指纹、HTTP轨迹和截图在闭包内。

闭包包含75份原UAT09/10/11场景文件及原始hash、5份可替换规范化CSV/profile、额外真正倒置负面profile、映射来源、Test原件、源/资产指纹、可运行最小源码与SDK tarballs及Docker构建配方。最小重建需容器和npm依赖网络；不打包容器引擎或伪称离线镜像。公开固定Node基础镜像已按闭包重新安装锁定依赖、构建并启动真实Worker，100+62.5齐套通过；598文件子集计数与当前QA全2086计数明确区分。当前QA镜像/入口已独立HTTP及跨容器回读。外层及内部bytes/hash在索引中。

剩余范围与下一步：

原09→版本/单位/基准/收率/损失映射、未知单位换算或新公式仍WAIT_APPROVAL，由APS-PM→用户处理，原Issue25仅设计/mock。原13/14未被偷偷推成现场单位/绝对时间；规范化模拟是独立显式输入。CR-FR010020-RESERVATION effective=false，未实施全局预占；未作真实扣库存、到货登记、QA质量审批。未把MATERIAL关闭当通过。

UAT05 96a9dae3ff13d3254c091567fa57cad5d8f37279 #30；UAT07 80841247ac91cae193a452325097234f31e6609e #34；UAT08 12d453d7cb03829dc609115e48c5e4c19af4a6ec #37；保留各原结论，不迁签。本轮只补物料影响，不重开旧全套UAT，不关闭任何QA Log，不产生新的真实产品修复轮次。逐FR/BR/Issue批准范围、旧/新证据及剩余断言见CLOSURE.csv；Dev DONE不代表这些FR或Issue38全部Done。下一负责人APS-PM核验并调度APS-QA先UAT09；10/11继续等待09结论。

直接上传APS-PM ROOT返回403（Workspace token cannot act for another workspace），仅尝试一次，未上传成功，不借用身份或改权限。原件改以同Issue通知列示的固定GitHub证据提交回读校验，并提供APS-Dev ROOT最终附件；本工作区ROOT不冒称PM ROOT。交接状态仅在通知发出后记SENT；未收到PM PROCESSED时不宣称闭环。
