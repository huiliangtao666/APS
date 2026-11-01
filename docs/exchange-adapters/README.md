# #44 显式本地 mock 交换适配器

本包实现可调用的离线适配边界。`MOCK` 是运行模式；不是 ERP/MES 联调、D3 整体完成或用户 UAT。真实连接 `NOT_CONFIGURED`、`enabled=false`、`productionWrites=false`。源码没有真实 endpoint、凭据、外发连接、订阅或生产指令。

依据：v0.3 FR-036 / AC-23；#44 批准派工 comment6560051618 与 #36 comment6560047620。原 `public/fr036/matrix.json` / `samples.json` / 模板及 FR036 历史 PASS 原 SHA 保留。FR036-v2 中 ERP/OMS/WMS/PLM/MES 是潜在交换责任说明，不能据此认定现场系统或字段。此处不重做 CSV 本体，不新增业务字段、默认值、导入账本或计划状态。

## 运行

使用已有应用容器与依赖，Node 22，工作目录为该仓库根目录；不安装、不构建、不启动服务：

```sh
node --max-old-space-size=128 --experimental-strip-types --test --test-concurrency=1 qa/exchange-adapter-selftest.mjs
node --max-old-space-size=128 --experimental-strip-types qa/exchange-adapter-example.mjs
```

在 APS-Test 宿主通过官方入口执行（路径为容器视角）：

```sh
.codex/skills/workspace-app-builder/scripts/app-exec.sh --cwd /workspace/apps/b09-bom-loss-config --mode standalone 'node --max-old-space-size=128 --experimental-strip-types --test --test-concurrency=1 qa/exchange-adapter-selftest.mjs'
.codex/skills/workspace-app-builder/scripts/app-exec.sh --cwd /workspace/apps/b09-bom-loss-config --mode standalone 'node --max-old-space-size=128 --experimental-strip-types qa/exchange-adapter-example.mjs'
```

例子从现有 `defs` 和 `seed` 获取真实 schema，只修改合成订单的现有“合格需求”字段；打印输入信封、提交/重复回执、CSV 导出 mock 回执及调用记录。临时 `business.json` / auth fixture 仅在系统临时目录创建，finally 删除；无浏览器、Worker、监听或 HTTP 请求。QA 模块显式封禁 net connect/listen、UDP 和 fetch；activity 计数与峰值 RSS 写入日志，256MiB 为停止阈值。合成 actor 只在 QA fixture 注入，不是平台身份验证证据，禁止接入产品。

## 可调用合同与 Dev 整合接缝

唯一业务入口 export 为 `server/exchange-adapters/index.mjs`：`makeEnvelope`、`createExchangeAdapter`、`exchangeContract`、`realConnection`；显式 transport export 位于 `mock-transport.mjs`。无共享 router/schema/import/Worker 变更，也无自动路由注册或外部可访问管理入口。

```js
const transport = createMockTransport({
  dispatch, // trusted local function (method, path, body) -> {status, body}
  retry: {maxReadAttempts: 1, source: 'explicit mock fixture policy reference'}
});
const adapter = createExchangeAdapter({transport, scope: trustedSessionScope});
const envelope = makeEnvelope({
  source: 'explicit-local-fixture', sourceVersion: 'mock-fixture-v1',
  idempotencyKey: 'example-import-1', correlationId: 'example-correlation-1',
  direction: 'import',
  payload: {files: [{name: approvedFilename, text: approvedCsv}],
            table: approvedTableKey, revision: currentRevision,
            reason: 'Explicit offline mock import'}
});
const receipt = await adapter.execute(envelope);
```

`dispatch` 必须到现有、已执行身份/成员/权限/CSRF 中间件的同一业务 Router；`scope` 必须由可信调用方绑定该会话，不能来自导入文件/请求 actor 或 role。每次执行包括重复回执均先检查当前 `/session`，导入须 canWrite，导出须 canExport。不得注册 QA fixture，不可将它当作生产授权实现。主应用注册若需要，由 Dev 在同 #44 整合；本包不架空原 middleware。当前只能显式 mock transport，其他 kind 拒绝构造。未来真实 transport 的实现须按现场合同完成，不是把 kind 改成 mock 即可上线。

| 步骤 | 复用入口与责任 |
| --- | --- |
| 规范输入 | `files/name/text` 沿现有 CSV schema，保原中文文件名与字面值；不做 SAP/用友字段猜映射 |
| 预览 | `POST /imports/preview`，沿现有 `inspectSingleCsv` / `inspectCsvBatch`、完整字段/关联/执行/冻结保护；valid=false 不提交 |
| 原子提交 | `POST /imports/commit`，只传服务端 previewId 与 reason，API 重读原文件并重检 owner、时效、revision、stateHash；版本、审计、来源和历史快照由原单次 rename 写入 |
| 导出 | `POST /export`，保原导出权限、reason、审计及已有 CSV 序列化；本包不改变表格、报表或分钟基准 |
| mock 目标 | 纯内存 Map 接收已有 CSV 内容 hash，返回 `ACKNOWLEDGED` / receiptId / bytes / correlationId；不是业务状态、指令或真实目标应答 |

技术信封 `aps-existing-csv-api@1` 是适配协议版本，不是业务 schema 新版本。强制 source/sourceVersion/key/correlationId/direction/reason；内容 SHA256 对 contract/source/sourceVersion/direction/payload 做键排序 JSON 计算。数组顺序、CSV 文本及字面值保留。幂等键与 correlationId 不进入内容 hash，同请求可用新 correlationId 查原回执。单信封 4MiB 工程限制，现有 API 的类别、文件大小和行数限制继续生效。CSV业务字段、单位和含义由当前 defs/校验承担；版本不匹配交原 API 拒绝。

幂等 namespace 为可信 session scope + source + direction + key。同 key 同 hash 并发/顺序调用只执行一次，重取回执标 duplicate=true；同 key 不同内容或 sourceVersion 明确409 CONFLICT，不调用 preview/commit/export/mock-target。修改请求须使用新 key。校验拒绝、超时及断连回执也保留，不能隐式变成新的写请求。scope 切换不是重试手段。

`journal` 只保存技术 hash/Promise/回执，默认 Map；可显式共享给同一 mock session 的适配器重建。业务数据仍只存原业务文件。这是单进程模拟幂等保证；不承诺进程崩溃后或多进程 exactly-once。真实接入前必须落实现场系统幂等/查询对账与原原子事务整合，不能靠第二套业务账本补洞。

## 错误、重试与副作用

mock `retry` 必须显式声明来源，maxReadAttempts 为1至3；仅重试 GET `/session` 的合成 disconnect/timeout。preview、commit、export 和 mock 目标均一次调用，自动写重试恒为0。真实策略未配置，不使用任何现场重试默认。

`faults: [{step:'/imports/commit',phase:'after',code:'timeout'}]` 显式模拟“业务已写、应答丢失”；code 可为 disconnect/timeout，phase 为 before/after。回执含 correlationId、contentHash、失败 step/phase/source、已完成调用 trace。任何变更调用不确定结果（含5xx应答）保留 `UNKNOWN/requiresReconciliation`，重复请求只取 UNKNOWN，绝不再次写入。写之前的可判定 API 拒绝保留 REJECTED/实际 HTTP 状态和原错误；整批格式/映射错误无部分写入。模拟时序错误是 fault 注入，不宣称测过真实网络超时/取消或对方重试。导出只接受现有CSV选项，含 ruleSettings；confirmationId 的 JSON 导出不属于此CSV边界。mock目标保留原CSV及回执便于离线核对。

成功导入预期改变自有 fixture 的当前输入、revision、CSV provenance、inputVersions 与 import audit。导出预期追加现有 export audit，输入与冻结版本不变。除这些明确合成副作用外，旧实例/state/native/frozen/history/用户副本和外部系统没有调用。断连后的 UNKNOWN 可能已有一次合法 mock 写入，此事实明确保留，不谎称全部错误零写入。

## 真实系统剩余资料（同 #44，owner APS-PM / 用户）

| 缺口 | 下一接入条件 |
| --- | --- |
| 第一个真实系统/版本与有权系统 owner | 用户指定实际系统与联系人；现有潜在系统名不是现场选择 |
| 对象及读写方向 | 确认订单/物料/库存/进度/计划等实际对象、读/写/回执及允许副作用；不假定生产下发 |
| 接口文档和脱敏样例 | 路径/方法、schema/字段/唯一编号、单位/时区、分页/增量/删除/错误语义；映射到已批准 APS defs，未知业务含义由用户确认 |
| 认证与权限 | 官方支持的认证、最小权限及密钥供给方式；本包没有默认凭据或 endpoint |
| 沙箱及测试访问 | 明确测试地址、可用账号/网络白名单、合成对象和可回滚写范围；不连生产试探 |
| 幂等、超时与对账 | 确认对端 key 保留期、重复/冲突应答、限流、超时查询/取消及允许重试；落地跨重启/多进程保护后才启用真实写入 |
| 字段映射/验收 | 样例映射期望、正常/边界/负面结果与数据责任；固定源码与受控 sandbox 验证后交 QA/用户最终 UAT |

真实接口实施授权已经取得；以上是事实/技术资料和可测条件缺口，不是重复等待实施授权。资料到位沿原 #44 替换 transport/明确字段映射并补受影响自测；不按入口新建任务，不回签旧 FR/CR PASS，也不代用户最终 UAT。
