# 紧急插单 R1 实现接续（#67）

业务依据：APS-BL-001 v0.3 + CR-URGENT-ORDER-20261103 R1，UO-01—24。最新执行合同：https://github.com/huiliangtao666/APS/issues/67#issuecomment-6620394577 ，生效合同6609485807。整包开发、自测、自修及最终串行main整合均由APS-Dev负责；不转Test修复链。

原任务dlv_b9f21c16-2e90-4e78-aef5-0be9145ff7e1，历史r1固定源36b8ff75edfaaec0c293688b4bba452a70f1ba61（未合main）。本次接续dlv_5e3ba523-86cb-425d-bada-ce74e1615302，结果沿原event的r2，不重置产品缺陷轮次。复用dev/aps-current及原worktree。

## 当前源码阶段

独立模块、主程序/checker/需求选页及参数导出已恢复接续；公共入口待串行交还，尚未实际挂载。当前阶段为INDEPENDENT_SOURCE_ENTRY_HANDOFF_PENDING，运行/类型检查/构建/HTTP/browser/Worker均NOT_EXECUTED，effective=false。源码不能当完整功能Done。

fresh main a89f6242dad939e868eaf2af72f67967ff225cde；原r1与main的merge-base为0e9d593bbcab756bd37b81c596a657c79efe66fb。逐路径核六个非冻结共享文件与r1基点字节相同后应用其精确增量；未合旧整分支。#147固定源2b9caa1fa1b4390a91797109b613daa5b1029e5e仍未验证，原PASS不迁签。后续只能按本次独立commit差分核源整合，不能因父链含#147而盲合整分支。

## 业务实现

目标计划绑定基准run、输入指纹、原需求集、窗口、执行事实及修订。17列每日需求增量预览仅消费该页，缓存不盖主数据/有效P；源页/行/字段定位、整批原子生效、批次重试幂等及ID冲突拒覆盖。原数据集、其他计划和旧run保持冻结。

执行事实逐任务明确状态、实际起止、合格量、人员/工装保留；逐分配明确实际耗用/锁定量与来源，不从计划猜投料。实际已完成交付与成品耗用一致；已执行和锁定不可回退。全部原单及全部生效插单按净量共同进入原分钟主程序，拒绝额外demandIds筛除。先硬约束，再插单、客户优先、交期、生效次序、ID；不承诺全局最优。未排量及有限候选搜索原因明示。

主程序和独立检查涵盖已有物理占用、供给累计量、生产批次资格、前序/人员/实体工装/日历/清洗/效期及净量。新增任务不早于观察/生效时刻。GLOBAL“重排保护时段”及“客户服务优先级排序方向”沿同一维护入口，须明确有效值；不猜默认或启用P候选。

四页签含插单、全部原订单、工序资源谱系、未排/WIP续作原因；直接原因须有资源证据，连锁原因须有关联任务。事实、参数和分配变化分列，普通订单去重统计，历史插单不混作原单。查询/完整筛选CSV共用冻结影响对象及指纹；搜索多选、逐表栏位、100/200/500与有效BOM只影响查询。

候选保存/放弃/采用保持版本校验和原工作台权限；保存不等于外部下达。计算失败、超时、取消均保留生效批次。取消/终态后共享busy门保持到exact worker实际终止或exit确认，未知完成状态不能被采用。

## 本次静态审查修正

空需求页不再回显原单；箱数×箱重溢出、需求日0在预览具名拒绝；忽略页不再经版本检测解码。checker拒绝非有限/负净量、假“全部已排”状态及缩小需求集合。连续插单统计区分旧插单和原单。Worker终止等待与畸形消息处理已补源码及回归用例，尚未运行证明。

## 公共入口交接（未应用）

server/workbook-router.mjs及src/InputData.tsx仍归#140已交接窗口，本次保持字节不动。所需增量只为registerUrgentOrders导入/注册（完整既有ctx含dataset）及UrgentOrders导入/工作台挂载（datasetId/run/version/parameterRevision/canWrite/canExport/onRun/onRefresh）。保#147读取cache与#140 MpsReport接入。精确待应用补丁见entry-seams.patch；该补丁仅作串行接缝输入，不能自动应用或宣称入口可用。GitHub写回403一次交PM代记，不能借身份绕过。

## 验证与后续

24条预期保持原合同，acceptance.csv实际全为NOT_EXECUTED；UO-23权限部分OUT_OF_SCOPE_BY_USER，必要profile仍在范围。15个定向用例已准备未执行，单工序09:17合成夹具不代真实900/600kg全路线。明确交窗后沿同一任务完成必要自测、自修、真实场景及精确普通main整合。运行限制见runtime-plan.md，发布/用户UAT另记。

原ZIP24590bytes/SHA256 55c25f21ce2c31df6594744ce146122e0504f7ece47206e9eb1fedcbb4db3cf1，CRC及7项内部hash核过；用户原件留upload，未提交私有数据。正式固定源/父/逐文件hash、原件与检查证据列根目录交付记录，不填自指SHA。
