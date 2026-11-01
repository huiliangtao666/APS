# BR13 独立政策/占用域接入契约

唯一原包 #39；dispatch_event_key=b12:br13-domain-reassignment:20261031:r1:APS-Test。
结果 event_key=dlv_62a68abb-93cf-43f9-bf95-9bdd59fcd1e1:r1。
依据 APS-BL-001 v0.3 BR-13 第7章第512段，以及本次原包移交授权。没有实现 DEC04–06 新增应用范围。

## 可调用接口

`checkChangeovers(input)` / `CHANGEOVER_CONTRACT`，见 `src/lib/b12-changeover.mjs` 与 `.d.mts`。
仅依赖既有只读 `working-windows.mjs::windowFit`，复用单个连续窗口适配检查；不调用排程、分配、数据库或网络。
这是对显式候选时段的检查，不搜索时间、不选择顺序、不修改生产任务。接受结果也是待应用整体验证的占用提案。

所有时间为同一显式 origin 下的非负安全整数分钟，[start,end)；所有容量/用量为显式独立计数的正安全整数。
不转换 kg/小时、人数小数、计量单位或实际日期；不能精确表示时由适配层明确报缺口，禁止静默取整。
`capacityScope: independent` 是调用者明确承诺的前提，不是本模块对现场资源独立性的推断。
同一物理资源不能换几个 ID 逃避总容量；人员共享池、跨组物理成员去重、技能替代继续使用应用既有检查。

### 输入必须显式提供

| 部分 | 必填内容及语义 |
| --- | --- |
| config | contract、source{id,version}、timebase{unit:minute,origin}、products、resources、personnel、policies |
| registry | id、capacity、capacityScope、windows、unavailable、source；personnel另需skills。windows=[]表示无可用窗口；unavailable=[]表示明确无例外。适配层先解析工厂继承并保留来源，不能只送设备空闲窗 |
| policy | id、from、to、resourceIds、prohibited布尔值、durationMinutes、resources、personnel、validation、source。方向+适用资源只能有一项政策；反向绝不借用 |
| resources/personnel需求 | 数组；每项id、quantity，人员另需skill。[]是明确无需占用；缺字段不等于无人/无资源。适用资源resourceIds与实际占用resources分列，不暗中补占用 |
| validation | waitMinutes、clock:elapsed-minutes、resources、personnel。[]为显式不保留该类资源；非零等待仍约束后序。占用等待须完整可用；无占用的自然等待可以跨非工作窗。其他计时语义精确报WAIT_CLOCK，不自行定义 |
| transition | id、from、to、resourceId、fromTaskId、toTaskId、predecessorEnd、start、successorStart、source。顺序与任务关联由调用者明确给出；本域不猜当前机器前一产品 |
| snapshot | source{id,version}、horizon、existingOccupations显式数组；每条占用id/kind/resourceId/start/end/quantity/source。必须包含全部相关实际/已确认/候选生产和辅助占用 |

0分钟换型、0等待、空人员需求可以明确配置并保存来源；缺值、数字字符串、负值、小数、NaN、冲突、未知对象均拒绝。
禁止组合仍需完整政策字段，避免一条不完整规则掩盖其他缺口。
所有配置/账本先做原子校验，任一无效不运行部分配置；多个转换中任一不通过，acceptedOccupations=[]。
requiredOccupations只解释已能确定的需求，不能消费为成功账本。缺政策会保留具体direction/resource/path；原输入中的每个转换身份仍在snapshot。

### 输出边界与冻结

`domainValid`只说明本次输入下的域检查结果；`overallSchedulable`固定null。
`inspections`说明精确方向政策、end/readyAt、显式零值和来源；`findings`有code/path以及适用的taskIds/区间/容量/需求/来源。
`requiredOccupations`说明换型及验证等待的资源/人员占用；0长度不生成占用，也不生成额外产出。
`notChecked`明确整体顺序、真实源完整性、生产/用料/交期、共享池、现场质量事实和应用接缝均尚未检查。
每次返回深复制snapshot，含配置、日历、既有账本、明确顺序与来源版本；保存者再计算内容hash并同计划冻结。
新输入版本只能形成新检查；旧计划复核从旧snapshot读取，不能换入当前配置。版本标签的真实性仍需上游源验证。

## Dev 实际应用接入的先后约束

1. 配置/CSV/API原子导入：维护完整方向政策与字段单位、来源物理行/版本；无真实值时只能使用标识明确且可替换的mock。fixture内所有数值仅自测，不登记业务默认。
2. 候选生产顺序明确后，对每个受影响资源列出真正相邻的前后任务/产品。把生产占用、保护执行事实、冻结位置、其他辅助占用和工厂/例外日历一并传入；禁止用任意pair代表实际顺序。
3. 满足 predecessor.end <= changeover.start；successor.start >= changeover.start + duration + elapsed wait。正长度所需占用全部检查日历和容量，不压缩固定生产时长、不把辅助占用计产、不删除未排订单/任务。
4. 如需要移动生产候选，由原应用排程owner整体重算并重建全部相关BR13转换。这里不重建替代排程或替上游放宽约束。
5. 只有本域domainValid且应用全部已启用物料、资源、人员共享池、路线、交期等条件同时通过，才原子提交候选。避免把本域占用再次重复加入existingOccupations。
6. 保存计划时绑定冻结来源物理行/版本和内容hash，保留required/accepted解释、明确未检查项；独立保存方案检查器直接读保存的真实顺序和实际占用，按原政策复核并定位问题，不能仅重播一个合法提案代替实际账本复核。
7. Dev继续补真实React/API/应用Worker/保存重开/CSV导出及全路线自测；明确区分任务状态、质量审批事实和纯时间最早可用值。

本次不改任何共享配置/Worker/React/API/schema/生产/批次/物料/R7/B16文件。Dev按#39接缝增量实施；需合源前再次fetch核main及文件交集。

## 本域自测与复演

容器执行：`node --test qa/b12-changeover-selftest.mjs`；`node qa/b12-changeover-capture.mjs`。
独立oracle：`python3 qa/b12-changeover-oracle.py`，要求同一环境有Python标准库与Node。
本工作区容器无Python，所以宿主只准备/比较数据，环境变量B12_APP_EXEC指向工作区的app-exec.sh，由它执行容器中的Node；无安装、预览、发布、QA覆盖。
oracle输入/独立预期先写盘，160个固定seed案例；逐整数分钟枚举占用，与被测扫描端点算法不同。比较精确需求、readyAt、问题集合、原子拒绝和冻结上下文。
生产context只用于证明不改订单/任务/数量和固定时长，不验证现场业务关联正确性。
JSON保存重开、standalone Node worker只验证本域传输/冻结等价；不是应用持久化、真实应用Worker/UI或QA UAT证据。

## 完成与剩余责任

- [x] APS-Test：独立域、类型契约、核心/边界/负面、独立区间/守恒预期、保存重开/独立Worker自测、固定源和可访问原件。
- [ ] APS-Dev：普通串行main整合；配置输入/真实顺序/共享账本/独立实际计划复核/问题定位/全应用链路。
- [ ] APS-PM：核原event_key与证据后维护#39/唯一原卡、既有A01/A02及后续任务；本独立任务完成不将#39整包Done。
- [ ] APS-QA：仅PM核具体完整入口后调度UAT12/13/14；本交付不提供UAT结论。

没有新增需用户裁决才能完成本域实现的问题。实际政策数值、真实顺序/账本及无法精确映射的计时/共享资源语义由Dev接入时逐项显式提供或报具体缺口；不会把A01/A02扩成整个BR13不可做。
