# 首版大批量预览接线

批准范围为 [#45 首版合同](https://github.com/huiliangtao666/APS/issues/45#issuecomment-6569968703)，接续 [整合合同](https://github.com/huiliangtao666/APS/issues/45#issuecomment-6570898699)。设计参考 `5ec83a3185926db332178288b92954f536d7f549` 仅适用批准子集；不扩展在线映射、审批、默认值或 P>B 语义。

Test 模块固定源 `9cc4719d53c7da1edb50d9155bdff6cd6e89d686`，父 `84225dfc69bc55c375eb44f80c3abaaa40996c2d`，基点 `38375ed8f93fe4431305bc9b7fd9674d10f8dc48`。只吸收相对基点的七个新增文件，不合 Test 历史。原单次模块 17/17 PASS 留在其 SHA。Dev 在 routes 模块仅增加将服务端 request 传给同步 applyImport 的接缝，以保留原 actor/requestId/reason 审计；其余模块实现保持源字节。

## 服务端

`POST /api/workbooks/preview` 在现有解析完成、snapshotHash 和 bindPreview 后，基于 dataRef 和精确旧版本快照构造 previewModule，与原 preview 同一次持久化。POST 响应和旧 GET `/previews/:id` 都返回有界摘要；无模块的历史预览要求重传，不暴露旧全量数组。新增 summary/records/fields/value/issues/locations/anchors/export/commit-status/confirm 路由注册在现有 workbook router。

权限继续由 business 的既有成员与 permission 中间件裁决；access 取服务端 member 和 isTrustedWrite，不读取客户端声明。query 的导出策略、owner、到期、完整范围、版本/指纹、ack 和幂等校验保留。旧 `/commit` 对模块预览明确返回 `module_confirmation_required`，不能只凭旧 fileHash 提交。

确认先校验完整投影，再对原状态的 clone 调用同步 applyImport：重读原 dataRef，核 hash/id/version 和采购在途身份，追加原 datasets[].versions/imports[] 与原审计。全部成功后只执行原 write 的一次原子 rename。异常丢弃 clone，不写部分 receipt/version。幂等信息扩展原 imports 回执，无第二主账。所有 workbook 写入口均在单进程同步事件循环内完成 read/validate/write，无跨 await 的确认事务；多进程共享 dataDir 必须另有共同锁/CAS，不能声称分布式 exactly-once。

ALL/FILTERED 导出沿服务端完整快照流式 NDJSON；FILTERED 不改变确认范围。浏览器使用同源鉴权下载链接，将响应交浏览器下载器，不将完整导出加载进 React blob。下载发起不等于已验证完成；接收方检查 completion trailer、数量、bytes 和 SHA256，缺失 trailer 视为不完整。

## 前台和维护边界

两张导入卡各自保留目标、文件、用途、overlay 决定和 previewId。工作台层保存分页/筛选/返回栈/草稿/pendingCommit，避免切换步骤时丢失。确认请求期间锁住导入/数据集选择；未知状态使用原键查询或重试，API 保留确认 payload 的原 reason。服务端确认后刷新权威版本、使本次 ready 过期，保留需求/范围及历史冻结运行。

G01 产线资源映射、G03 投料/物理池/WIP 仍禁用，提示原 Excel 更正重传。G02 已接既有 A1/生产/工艺路线编辑视图，行查询增加 `exactField=成品编号&exactValue=SF...`，避免 SF1 命中 SF10；返回恢复旧筛选、步骤及分页。注册表真实入口标记 `SOURCE_WIRED_NOT_RUNTIME_VERIFIED`，因此模块保持禁用，直到受准真实运行验证；源码或进程内夹具不冒充浏览器维护闭环。没有猜 URL、新增映射审批或制造属性替代。

## 验证、恢复和未验

新增 `qa/workbench-preview-integration.test.mjs` 仅在私有合成状态中调用实际注册的 business/workbook handlers，覆盖摘要/分页/导出策略、旧 commit 拒绝、真实权限/CSRF、事务保存重开/幂等、审计、目标竞争、原快照损坏及 SF 精确查询。身份由明确 mock 提供，不验证 SDK 签名或真实 HTTP。与原 Test 的模块规模/公式/投影测试分开，不重跑 17 项。

本次接缝入口一次，heap≤128MiB、120秒；必要标准 `npm run build` 一次，heap≤640MiB，使用已有 Linux 依赖，禁止 npx 网络 fallback。固定 38375ed8 的独立工程结果与新集成结果分列在根交付原件，不迁签。标准构建只编译 Worker 资产，不启动 Worker。真实新 application start/restart/browser/HTTP/Worker/import/calc 额度均为0，部署、独立 smoke、用户 UAT、G02 真实保存返回均未执行。原刷新缺陷及真实两文件路径不得用工程 PASS 关闭。

仿真样例沿既有 `CR-INPUT-SCHED-UX-r2-Dev-r1-SAMPLE.zip`，原 hash 和私有客户原件保持不变。未来隔离运行窗应新 dataDir/空闲私有端口，先业务卡、再参数卡分别预览确认，从服务端版本重查；未知确认先查 commit-status，避免重复导入。旧0afa/18302、旧 source/dist/state、native、frozen、history、config 不切换、不恢复覆盖。精确 source→main、实际构建 manifest、实际断言/未验、cleanup 和 RELEASED 见该次根结果。CR effective=false，工程通过不签 QA 或最终用户 UAT。
