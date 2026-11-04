# #146 真实输入转换与 Dev 公共接缝合同

原 event `dlv_222ab280-ee1e-41c1-9b62-45ff7eb52485`，本次接续 `dlv_9406df41-9be2-49d5-8253-5012a50f29be`。执行依据 [6620567653](https://github.com/huiliangtao666/APS/issues/146#issuecomment-6620567653)。本文件描述未运行源码；A 未通过，B 关闭，预算仍为原 600 秒未使用。

## 一次明确的模块边界

Test 拥有 `server/simulator/`、`src/simulator/`、`qa/simulator/`、`docs/simulator/`。Dev 保持唯一公共接缝 owner：`server/workbook-router.mjs`、`src/InputData.tsx`、`docs/requirements/changes/change-register.json`。转换业务由 Test 实现并负责自测修复；Dev 无需再实现字段转换，不并改上述 Test 文件。

入口保持 `registerSimulatorRoutes(router, {root, permission, actorKey, writeGuard, workbookSchema, csvDefs})` 和 `<SimulatorView api={api} canWrite={canWrite} canExport={canExport}/>`。没有新增 context 参数。现有真实 schema/defs、会话 actor/permission/writeGuard 和专属 `independent-simulator` 根目录仍必须由公共 router 注入。UI 调用既有 API helper；只在明确点击时转换、创建、推进，没有自动取当前数据集或自动采用计划。

新增 POST `/api/workbooks/simulator/imports/preview`，沿既有 edit/writeGuard，输入 `{source: request, reason?: 既有写入理由}`。preview 不创建分支、不写源表或任何实账。整体 JSON 上限 8MiB，原件 UI 合计上限 5MiB；原生解析器单件 12MiB 限制继续生效。现有 `server/index.mjs` 的 20MiB JSON parser 可容纳，不需修改公共 parser。场景创建仍走原 `/simulator/branches`，上限 2MiB；转换输出超上限须报具体错误，不能截断 P/来源。存储完整文档 32MiB 门保持。

Dev 在原公共入口接入上述两个模块即可获得文件选择及转换预览。不要从 live dataset 拼出“冻结”对象，不要新增会调用求解器的取源端点。用户显式取件可沿已有 `/runs/:id` 与 `/runs/:id/inputs` 得到所选 run 和 inputRef 副本；必须保留 JSON 属性顺序以复核原生 SHA256。现有 `/runs/:id/export` 是 CSV，不是这个冻结 JSON 合同。

纯模块调用：`convertNative(request, workbookSchema)`。其中 `kind=FROZEN_RUN_COPY` 消费 `frozen:{input,run}`；`kind=WORKBOOK_BYTES_COPY` 消费 `workbooks:{business:{name,hash,bytes:Buffer},parameters:{name,hash,bytes:Buffer},identity:{id,version,capturedAt,mapping?}}`。HTTP 时把 bytes 替换为原件 `base64`；UI 用实际文件字节计算 SHA256，服务端再核。capturedAt 是明确来源快照元数据，整数分钟含时区；同一输入重复转换不生成新当前时间进入业务指纹。

返回 `{status,source,diagnostics,references,mapped,spec,contentHash,mode:'INDEPENDENT',linked:false,mainProgramReady:false}`。`spec=null` 时按钮禁止载入/创建，不把部分数组当完整输入。`READY_FOR_SELFTEST` 只是转换结构就绪；`READY_WITH_UNCOVERED_NON_PRODUCTION` 留真实在制未覆盖项，仅可推进明确非生产脚本。二者都不是功能 PASS 或 A Done。原生解析/身份错误是 422/409，`error/path/message` 明确定位并保留 UI 草稿。

## 共用 request 字段

request 还须显式包含以下内容；不是预先写好的模拟 spec，转换器读取原中文业务字段并生成 spec。

- `calendar:{dayZero,minuteOrigin,startDate,endDate,coverageEnd}`：当前 Excel 日序原点只能 `2026-10-31`；分钟原点与冻结 provenance/result/P 的分钟原点核对。模拟及覆盖范围须落在实际原生工厂日历逐日连续资料内。Excel 与 CSV 原点分列，负偏移不截零。
- `opening:{asOf,version,source,inventoryBasis:'AFTER_CONSUMPTION',materialScales,lots?,purchases,demands,taskFacts?}`：asOf 等于 startDate 零点 +08:00。materialScales 按物料明确十进制精度，不从观察数量猜精度。库存已扣耗后实物只作独立期初，不再减历史累计耗料。
- `opening.purchases[在途记录编号]:{asOf,source,issued:true,received,cancelled}`：原订购量取原表，不把净未收改写为订购量。缺累计实收/取消/下达事实拒绝；在途状态和预计供给不证明这些值为零。
- `opening.demands[需求编号]:{asOf,source,change,cancelled,shipped,signed,fulfillment:'SHIP'|'SIGN'}`：原量取需求千克，累计变更/取消/发运/签收及履约口径均必须明确；计划排成不当成交付事实。
- `opening.lots[库存批次编号]:{asOf,source,quantity,externalReserved,quality}`：原快照日期不同于模拟期初时必须提供；同日期直接消费原实物、明确已占用量和质量状态。只有原明确单一质量分类才能导出其余分类为零，未知质量拒绝。分拆质量批须另行提供可核来源，不能猜比例。
- `script:{rules:{version,hash},events:[]}`：明确作者事件脚本；空数组表示明确没有新增事件，不能推导自动收货/放行/生产。基准无随机。每个事件沿现有整数分钟/发生/可知/生效/因果/累计载荷合同。
- `production:{mode:'NON_PRODUCTION',taskIds:[]}` 或 `{mode:'FROZEN_TASKS',taskIds:[真实task.id],planUse:'EXPLICIT_COPY'}`。前者不创造生产；后者只接实际 frozen minute plan，保 run/input/result/conditions/mapping/P 原 hash。日粒度 plan 不换算或猜分钟。

选定作业须额外 `opening.taskFacts[taskId]:{source,totalProcessingMinutes,confirmAllocationsComplete:true}`，显式加工分钟不能以跨班/等待历时猜剩余。机器、人员和实体工装取冻结 task 与实际主数据；原 task.start/end 原样转日历时刻，工具释放仍靠明确脚本。投料只接所选 task 对真实 `inventory:<库存批次编号>` 的完整开工投料分配，按批次聚合累计需求，不再除标准收率。条件采购/制造/在制供给、非开工投料、重量共享资源或已开始任务具名阻断，不能强行变实体容量或重置历史。

## P、BOM 与保留规则

原件解析复用 `parseWorkbook`、`prepareBusinessImport`、`integrateParameterImport`；有效配置复用原 `effectiveParameters/applyParameters` 和原定义边界校验，不造第二套优先级。P 覆盖 B，已有明确在线 EDIT 覆盖按既有合同保留，trial 冻结尚未适配则拒绝。P 明确待补不回退 B。完整 definitions/categories/annotations、全层实例、候选定义/实例、pending、采用值、来源和半开有效期进入 reference.parameters 并有独立 hash；未知执行规则只保留资料性质。

BOM 从原 `物料清单` 生成父子/关系/版本/生效失效/定额/单位/收率及 raw/lineage；校验引用、循环、重复关系、同日多版本及量纲。snapshot 按业务日期选择生效边，UI 递归去重只影响显示。当前适配限定 `excel-qualified-output-202611-r1`：原定额已含本层收率，保标准收率元数据，不再除收率、不生成第二次损耗。标准投入 kg 另 profile 拒绝，原 bomLossProfiles 保留引用、不擅启未映射公式。实际工艺报废继续由显式事件单记。

原在制及剩余映射缺完整累计执行和持有事实，保留原行及 G01。NON_PRODUCTION 下作为未覆盖问题进入持久日结，不转成未开工作业；有生产时阻断，不能在无历史账时重新扣料。其他原生配套表按 reference/nativeCoverage 如实标 `REFERENCE_ONLY`，不称已执行。完整 P、BOM 和配套来源随独立检查包导出，source/参数 hash 与展示边同一谱系；G01—G09、真实目标接纳和联动未验继续保留。

## 待窗口的验证与实际原件

域/store 原测试留原未验结论。新增 `qa/simulator/import.test.mjs` 是显式工程夹具的正常/负面源码；`real-import.test.mjs` 需在授权容器显式设置 `SIMULATOR_REAL_SOURCE_DIR`，读取实际两份 V2 原件。没有目录会标 skip/NOT_EXECUTED，不回退工程数据。这些测试本次均未执行，真实转换成功、源隔离、创建保存重开、UI、构建均不能签 PASS。

已核字节的来源：本工作区 Git 受控原 Excel `docs/requirements/proposals/CR-INPUT-DATA-20261031/r1/肉食品仿真数据_202611_合并图示版.xlsx`，1672626 bytes，SHA256 `c4c2d40b82fd63a60b7ebbe269aecd4208e49f1f612ee0164b963b948a8b56d0`。自身 upload `APS肉食品仿真数据_完整V2.0_20261102.zip/dataset.zip` 内完整 B 2202570 bytes / `247423ea73d441e8ef6d03f538f393973287e17acb93d81ec1353abc4283d247`，P 356351 bytes / `f9a4fea37b2c50038cc7c7bd9ad513d2c73b981d8ef0cd1cc2d8f47a775b176e`，与包内版本清单逐一匹配。只验字节，未执行产品导入。V2 是明确仿真数据来源，非现场默认，不冒称设计所读旧 R2/P。

还缺设计引用的精确原件：`肉食品仿真数据_202611_第二用户场景_合并图示版_R2.xlsx` / `4eaf9a21c183b7a2453aa38d07fc9ac2d5273d7ad4c985a177e72de350d02bfc`，`APS配置参数梳理_20261101.xlsx` 247518 bytes / `e8b73e882e66b2e19ab7cb639c7a17e8830d08c0f485667484141837794f4d24`。`praetor workspaces files APS-PM --path upload` 实际返回 403 “Workspace token cannot act for another workspace”，未借身份、改权限或继续探测。PM 如需按这套旧设计来源验收，请把原件转到 Test 自身可读 upload，不能用 V2 证明旧源已转成功。

还需选定真实 `run-<id>.json` 与其 `inputRef-<inputHash>.json` 副本（两个内容来自现有 `/runs/:id`、`/runs/:id/inputs`，并保 datasetId/version/inputHash/resultHash/selection/provenance/result），不能预编实际未知 run ID。补件 `simulator-opening-<runId>-<asOf>.json` 必须含上述逐物料精度、逐采购/逐需求累计、真实期初/在制/作业事实及来源。原 Excel 没有这些执行事实，不能要求原件本身凭空具备。当前没有选定 run 和事实件，故不声称完成真实场景实例。

PM 先续 Dev #147 窗口，再明确交 Test 原有界窗口；届时 fresh 核容量、保护、实际 owner/pending，按原 600 秒累计、单命令不超过 180 秒连续自测及普通失败自修。当前源码进展不占运行窗、不增加预算；不创建/发布应用、不重启或停止任何旧实例或平台 daemon。
