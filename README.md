# APS R1 单线最小排程原型

## 启动与预览

本项目位于轻应用工作区的 `apps/aps-r1`，使用 Vite + React + Express。当前已绑定 Workbench 预览，开发服务由平台启动；不要在其绑定端口手工再起一份服务。

- 开发入口：`npm run dev`（由已绑定应用的监督进程/平台 dev preview 调用）
- API 健康检查：`GET /api/health`
- 排程快照：`GET/POST /api/plans`
- 预览绑定：由 APS-Dev Workbench 轻应用面板打开 APS R1；应用未发布到 Portal/App Center。
- 预览容器路径：`/workspace/apps/aps-r1`；开发端口 `3000`，API 端口 `3001`。

remote-VM 工作区的依赖安装/构建等有限命令使用 `workspace-app-builder/scripts/app-exec.sh --cwd /workspace/apps/aps-r1 '<command>'`；不要在 VM 宿主安装依赖或启动应用。已绑定的 Vite 预览用 `lite-app-scaffold/scripts/dev-preview.sh`（无端口参数）请求平台起独立预览容器；不手动占用绑定端口。服务代码/环境变化需重启时按 WAB skill 使用 `app-restart.sh --dev`。

## 当前访问方式（2026-10-31）

浏览器 JSON 写入携带 `X-APS-Request: workbench`，以兼容平台/Vite 改写内部 Host 的代理链。该自定义头不是身份凭据；应用不开放跨域 CORS 写入，跨站 Fetch Metadata、无标记的异源 Origin、非法 Origin 仍拒绝。禁止在此基础上开放任意来源的 CORS。

计算结果刷新先读取运行状态，再读取方案，避免快速运行完成时状态与方案快照错位。计算按钮旁直接显示提交、完成或失败信息。

当前应用采用共享工作台，不要求应用账号、托管登录或业务成员审批。前端不显示登录/退出入口，服务端不挂载 `/api/auth/*`；应用启动直接使用共享业务权限。

所有可访问此应用的人共用数据，可编辑、计算、保存、导出及执行支持范围内的确认动作。操作记录统一标记 `shared-workbench`，不能作为个人身份、职责分离或独立审批的证明。操作原因、跨站写入防护、版本冲突和业务校验仍保留。历史成员文件不删除、不参与当前运行。

这不自动改变 Praetor 平台自身的访问级别；平台入口仍按发布面板控制。不要把未审查的生产数据或此共享入口开放到公网。

验证：`npm run test:shared`；生产计算线程验证：构建后执行 `node --experimental-strip-types --test qa/production-worker.test.mjs`。Vite 构建同时打包该线程，适用于平台标准发布流程。

## R1 已实现

- 订单、工艺路线、工序工时、设备、工序设备依赖、规则配置及 R2.1 工厂日历/停机例外共 8 类 CSV 导入/导出和单表查询、编辑、新增、删除。
- 按优先顺序生成订单工序任务；输入固定工时、设备依赖及前序工序驱动计算。
- 对同一设备按半开区间 `[start,end)` 避让；后序开始不早于前序完成。
- 单线归属校验：订单和已登记设备资源必须都归属唯一同一条产线，否则提示问题并阻止计算（结果为 0 个任务）。设备资源表中的工序编号表示其适用工位/工序；同一产线支持多个工序和同工序多台设备，不把设备当作产线。
- 甘特、任务明细、问题关联任务定位；显示来源表编号。
- 独立结果复核：单线约束、机器不重叠、前序关系分别报告“通过 / 问题 / 未检查”；复核记录带时间和订单/规则输入标识，输入变化后标记过期，主管确认前需重做复核。当前应用没有主管确认动作。
- 排程快照在服务端保存；输入表暂存在当前浏览器 localStorage。
- 页面列出范围、需求追溯、规则约定、未决决策与不支持能力。

## FR-002 产品、物料与单位配置

- 数据页新增 v0.3 `07_产品与包装规格.csv` 和 `08_物料主数据.csv` 两张表，可编辑、新增、删除、导入和导出。
- 计算前检查产品/物料必填字段及重复编号、产品规格数值，并检查订单/工艺路线引用的产品、工序物料依赖引用的物料。主数据或引用错误会阻止生成任务并列出问题。
- 单支净重、每袋支数和物料单位作为配置保存；产品名称不参与规则判断。当前不执行单位换算、包装/BOM数量计算或物料需求计算。
- v0.3 BR-18 的精度、支/袋/箱取整和误差范围仍待确认；换算方向/链、精度、取整时点及误差处理不作默认。物料 BOM、库存批次和可用性属于后续能力。

## FR-004 工序与工艺路线配置

- 工艺路线、工序工时和工序资源依赖继续由 `10_工艺路线配置.csv`、`11_工序工时配置.csv`、`12_工序资源与物料依赖.csv` 维护。路线编号、工序数、名称和 CSV 行顺序均可配置；顺序由“前序工序”关系决定，合法路线按依赖拓扑排入，独立工序保持输入行顺序。
- 计算前及数据页检查路线产品/工序/名称、重复工序、前序引用与循环；每个路线工序必须有唯一正数“固定”分钟工时；资源依赖检查订单、工序、支持类型和资源编号，设备及兼容旧类型“物料”检查主数据引用。无效时阻止排程并显示可定位的问题。
- 设备依赖仍被当前单线排程器使用。FR-007 人员技能依赖可配置人数、技能、班次、参与阶段及相对工序起止偏移，并按人员组容量和分钟可用窗口检查；机器自动运行时间不额外占用人员。模具、工具、空间及投料/物料只做基础标识检查。速度工时不参与计算。
- 可复现用例：`src/lib/process-config.test.mjs` 覆盖可配置编号与路线顺序、路线重复/缺前序/循环、固定工时完整性，以及六类依赖标识和无语义推断。容器验证命令：`$WAB_DIR/scripts/app-exec.sh --validate --app-id aps-r1 'npm ci && npm test && npm run build'`。
- 容器内可复现用例：`npm test`，新增 `src/lib/master-data.test.mjs` 覆盖有效配置、必填/重复/数值校验、产品/物料引用错误和不执行换算。隔离验证命令：`$WAB_DIR/scripts/app-exec.sh --validate --app-id aps-r1 'npm ci && npm test && npm run build'`。

## 限制

- 当前是按订单优先顺序的贪心排程参考实现，不保证全局最优。
- 设备依赖按订单和工序指定单一设备；没有依赖时提示错误，不猜选兼容机。
- 仅固定分钟工时参与计算；速度换算、工装、BOM/库存、批处理、最大等待、空间、考勤和执行事实不参与。人员按 FR-007 配置参与可用性判定。
- 甘特和排程问题只检查机器重叠、工序先后及核心输入引用完整性。没有独立编辑任务时间/资源的排程操作。
- 保存快照保存任务与已启用规则，但没有保存完整输入表快照；输入数据不跨用户共享。
- 交期显示为输入，当前不计算/拦截迟交；不实现主管确认、权限、外部系统集成或真实生产数据。
- 外部字体和第三方服务无依赖；示例数据仅为模拟。

## 示例数据

`sample-data/UAT-01/` 下的阶段 CSV 以 APS v0.3 测试包的虚构业务值为基础；FR-009 订单 CSV 已映射到当前数量/单位/预测/状态字段契约。不是完整 19 类配置，也不应将其中产品、工时、设备或数量当成真实工艺标准。页面初始数据依照这 6 份 CSV 内容提供，用户可重新导入。

更完整的需求追溯、测试字段契约、UAT 缺口和待决业务语义见 `docs/APS-TEST-HANDOFF.md` 与工作区根目录 `APS-R1-DEV-HANDOFF.md`。

## FR-025 独立结果复核：复现与验证

在 APS R1 单线工作台选取或计算方案，点击 **独立复核**。核对三个检查卡片的状态和明细；改动订单或规则输入后，旧报告应标记过期，重新复核后记录当前输入标识。没有任务/关系可检查时对应项应显示“未检查”。复核记录随保存方案保存；此功能不提供主管确认。

代码验证步骤（在应用运行容器中执行）：

```bash
cd /workspace/apps/aps-r1
npm run test:verification
npm run build
```

独立复核器的边界和半开区间行为由 Node 内置测试覆盖。平台安全构建可从工作区宿主运行：

```bash
WAB_DIR=/workspace/.codex/skills/workspace-app-builder
"$WAB_DIR/scripts/app-exec.sh" --validate --app-id aps-r1 'npm ci && npm run test:verification && npm run build'
```

## FR-001 单线、工位与资源归属：复现与验证

在“数据与 CSV”中维护订单产线编号，以及设备资源的产线编号、工序编号（工位/工序归属）和设备编号。计算前统一校验：订单缺少产线、订单包含多条线、设备资源缺少产线，或已登记设备资源配置了不同/多条产线，都会显示对应问题并生成 0 个任务。将订单与资源统一到同一条产线后即可继续计算；可在该线上维护多个工序和每个工序的多台设备。设备仍按资源编号独立避让，不代表独立产线。

可复现自动用例（应用容器内）：

```bash
cd /workspace/apps/aps-r1
npm test
npm run build
```

测试覆盖同线多工序/多设备放行、订单跨线阻止、资源跨线及资源-订单产线不一致阻止、设备缺少产线归属阻止、订单缺线阻止。当前不提供独立“产线主数据/工位主数据”表；FR-001 在现有订单与设备资源 CSV 中维护产线归属，并以工序编号表达设备适用工位/工序。多产线 P1 未实现。

## FR-011 预计到料

预计到达、预计可用及延期模拟独立维护；计划可显式引用预计供给并按可用时点等待，方案与 CSV 始终显示使用条件。完整字段、样例、复测步骤及边界见 [FR-011-HANDOFF](docs/FR-011-HANDOFF.md)。不确认真实到货或创建采购单。
## FR-009 订单与需求数据

订单支持订单号、产品、合格需求数量/单位、分钟轴交期、优先级、可拆分标识、需求类型和状态；旧版浏览器数据迁移为 kg/正式订单/有效。数量、单位和交期编辑追加本地变更记录。预测订单与正式订单分开，预测不进入正式订单排程；已取消订单不进入之后的计算，已有方案快照保留。单线 P0 校验与字段约定见 `docs/APS-TEST-HANDOFF.md`。当前不执行单位换算、订单拆分执行或执行进度/数量核销。

复现：应用容器内运行 `npm test && npm run build`；FR-009 用例在 `src/lib/orders.test.mjs`。

## FR-037 permissions slice

[FR-037 implementation and limits](docs/FR-037.md) supersedes older descriptions
of localStorage authority and anonymous snapshot APIs. Main application business
APIs now require verified Managed identity + active planner/supervisor/query
membership. Data and operation history are stored together server-side; all
writes/exports require a reason. Existing prototypes remain isolated source.
Supervisor confirmation/return/release deliberately report unsupported until
FR-025/030 exist; this is not full R7. Do not activate without the documented
operator-owned Managed identity and membership provisioning steps.
