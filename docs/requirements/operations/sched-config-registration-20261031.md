<!-- pm:design:scheduling-config-cr:20261031:r1 -->
## CR-SCHED-CONFIG-20261031 正式登记关联
event_key=`design:scheduling-config-cr:20261031:r1`；治理入口 https://github.com/huiliangtao666/APS/issues/35；设计SHA `b481d2c860112213391a56fc14bd072fc8c3bffb`；新产品SHA=null。
仅批准可配置共同原则与遗漏项追踪；原有效CR身份保留，具体枚举/公式/默认值沿明确既有批准。69条为语义索引（保留原40项），不是69个新增已批字段或任务。历史Done/限定PASS留原范围和SHA，不重开、不重签，产品FAIL/修复轮次+0。
同一[参数索引](https://github.com/huiliangtao666/APS/blob/b481d2c860112213391a56fc14bd072fc8c3bffb/docs/requirements/proposals/CR-SCHED-CONFIG-20261031/parameter-inventory.csv)及[归属映射](https://github.com/huiliangtao666/APS/blob/b481d2c860112213391a56fc14bd072fc8c3bffb/docs/requirements/proposals/CR-SCHED-CONFIG-20261031/tracking-groups.csv)。
- **CFG-01 / 各业务包共同检查项，不另拆开发任务**：沿相应既有任务继续；未覆盖增量等待对应包开工。原归属 既有CR各自继承；无归属的增量纳本CR；边界：字段语义、类型、单位、范围、适用对象、覆盖冲突、生效版本、保存权限、模拟来源、历史冻结。新增未开工状态 **WAIT_START**。
- **CFG-02 / B2 / R2.2–R2.4**：已有继续；H-P04/N06不再等待旧裁决。原归属 CR-DEC02-03-20261029；边界：数量/容量、占用释放、岗位/物理池、共用和交接、人员参与窗、方向技能替代、窗外处理顺序。新增未开工状态 **WAIT_START**。
- **CFG-03 / B1 / R2.1；B2/B4复用**：原已通过模拟阶段证据保留；已有任务继续；新增配置增量待开工。原归属 CR-R21-UAT02-20261031及基线；新增未覆盖配置归本CR；边界：工作窗口、继承、停机/例外、班次、加班、跨班与可中断性；参数化不允许跨无效窗口排产。新增未开工状态 **WAIT_START**。
- **CFG-04 / B1 / R1、R2.1**：已有继续；六项已获裁决，不重复索批。原归属 CR-R21-UAT02-20261031；边界：A/B各自允许拆分、需求类型、状态，来源/版本及模拟标识；未来其他订单范围待对应包。新增未开工状态 **WAIT_START**。
- **CFG-05 / B3/B4 / R3、R4**：既有设计/mock继续；新增参数化应用实现等待开工。原归属 CR-DEC04-05-06-20261029 / DEC04；边界：复用13项DEC04候选参数，跟踪F01/F02；不批准默认值、非kg粒度或跨批取整语义。新增未开工状态 **WAIT_START**。
- **CFG-06 / B3 / R3**：基线既有任务继续；新增参数化设计/mock继续、应用待开工。原归属 CR-DEC04-05-06-20261029 / DEC05；边界：复用9项DEC05候选；QD01–04、F03/F04和真实事实分列；软件模拟结论保留。新增未开工状态 **WAIT_START**。
- **CFG-07 / B4 / R4**：已授权工程沿原任务；新增参数化设计/mock继续，应用等待开工。原归属 CR-DEC04-05-06-20261029 / DEC06；边界：复用13项DEC06候选；任意装载节点、尾批、通用重组不因本原则自动获批。新增未开工状态 **WAIT_START**。
- **CFG-08 / B1共享数据链**：已有继续；新增未覆盖策略作为本CR待开工项。原归属 CR-FR013-VALIDATION-20261029；R21已批准未用设备政策；边界：袋支整数、收率<=100%保留；单位/类别/业务字段显式配置；原件保真和阶段清单不被模拟改写。新增未开工状态 **WAIT_START**。
- **CFG-09 / B5 / R6、R7**：已有实现/证据保留；新策略细化等待对应包开工。原归属 基线＋本CR尚无归属的配置增量；边界：计划起止/范围、任务排序、保护时段、锁定、条件试算、部分确认策略；多目标优化仍后续。新增未开工状态 **WAIT_START**。
- **CFG-10 / B5 / FR038专项**：沿既有目标继续；工程参数候选和正式规格等待对应任务。原归属 CR-FR038-PERF-20261029；候选工程运行参数归本CR；边界：区分运行预算/取消与验收SLA；暂定30秒不可随意改参数后宣称达标。新增未开工状态 **WAIT_START**。
- **CFG-11 / F1冻结 / R8**：等待开工；不启动P1。原归属 基线P1＋本CR未来配置清单；边界：产线/产品适用、跨线共享许可与唯一物理容量；不扩展跨工厂运输。新增未开工状态 **WAIT_START**。
- **CFG-12 / B3/R7及未来共享**：既有变更提案待PM登记/批准及开工；不并入本次参数实现。原归属 沿用候选CR-FR010020-RESERVATION-20261029，不重复建CR；边界：实际账/承诺范围、投料释放冲销、WIP、并发和迁移是能力变更，不只是配置开关。新增未开工状态 **ORIGINAL_PROPOSAL_FLOW_WAIT_APPROVAL_AND_START**。
恢复条件：PM启动对应业务包；具备该组契约、字段/单位/合法组合、批准与待决边界、可复演模拟profile/独立预期和FR/AC/UAT映射；未批具体业务语义先明确裁决。无需重新索批已经允许的mock/六字段/HP04/N06。
H-P04/N06旧业务等待已解除；QA可自补可复演模拟数据/profile与独立预期，不编造现场事实/正式默认。性能目标和运行预算分开；B02账本能力沿原提案流转。
当前UAT06执行#33 Done；UAT07联合#34继续，UAT08+按序等待。本登记不新增派工、不改原卡Status/负责人/验收SHA。
<!-- /pm:design:scheduling-config-cr:20261031:r1 -->


## 核验与范围
8个固定设计文件取得，清单7项SHA256/字节一致；12组/69索引/47原卡影响/18专项断言核验，47项canonical URL与v0.3一致。R21受控记录从固定0b1de3256e7f0ec660ae1fb26cbfac0682768f24补入，其他原CR最新记录保留。原卡关联数量 51；状态不变；新增派工0。

## 原B02提案登记
沿原编号CR-FR010020-RESERVATION-20261029登记PROPOSED / WAIT_APPROVAL / WAIT_START，effective=false、implementation_authorized=false；原设计报告与ZIP的SHA256均核原Issue9记录一致，ZIP CRC通过。RD01–05沿原来源等待具体业务批准和实施授权，本次不新增同义CR或Issue。

## 当前执行与验收保护
UAT07 Dev dlv_e18bc633-e1cc-497c-9775-bbface55f331、APS-Test dlv_a1ccdb55-d45a-428e-bb9c-a4dfd93fcae3均为executing；本次只登记关联，不新增派工。51张原卡Status逐项前后相同。受控原CR已有所有字段值保持不变，仅追加cross_references；当前61条需求快照重新从Project2导出，B02不进入applied_changes。
