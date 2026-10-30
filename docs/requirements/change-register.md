# 已纳入的需求变更

当前登记4项CR；逐项记录批准边界、设计/实现/验收阶段。缺陷修复、交付故障、验收缺口和调度政策不计作产品需求变更。

| CR | 名称 | 批准状态 | 影响FR/BR | 实施状态 | 验收结论 |
| --- | --- | --- | --- | --- | --- |
| CR-DEC02-03-20261029 | 工装、人员、技能业务选择的前台参数化维护及排程生效 | 已批准能力方向并授权开发；具体默认参数值未批准 | FR-006、FR-007、FR-017、FR-022、BR-06、BR-07 | 116eb5d4 FR006/FR013/R2.1 three-slice candidate Dev self-test limited PASS; P10 fixed42a35d07 H-P08/10 and H-P06 independent PASS, H-P04 personnel outside-window PARTIAL; N06/customer facts and full CR/UAT NOT_READY | Dev 116eb5d4 task-level integration PASS within assigned approved slice; QA a786ee30 capacity1/2 API chains PASS only on older SHA; H-P04 personnel early/late business rule and N06 source ledger remain open. Full CR/UAT NOT_READY; 0 new product FAIL, +0 repair round. |
| CR-DEC04-05-06-20261029 | DEC-04/05/06数量、质量可用性与工艺参数的需求设计深化及mock | 已批准需求设计深化、参数化及mock准备；应用实现未派发，具体业务值未批准 | FR-002、FR-003、FR-004、FR-005、FR-010、FR-011、FR-017、FR-020、FR-021、FR-022、FR-023、BR-02、BR-04、BR-08、BR-09、BR-10、BR-11、BR-12、BR-13、BR-14、BR-18 | 独立设计/mock审查完成，F01-F04待Design补齐；应用实现未派发 | 独立Test认可为需求深化/mock评审输入；76原CSV、38派生CSV及38项有限预期核对成立。F01物理粒度分摊、F02基准/收率/损失组合、F03预计来源独立门控、F04覆盖/去重/余保/追踪契约待补齐。非完整设计签收，产品与业务UAT未执行。 |
| CR-FR013-VALIDATION-20261029 | FR013袋支/收率及字段可配置校验 | 已批准具体校验与可配置方向；具体其他业务默认值未批准 | FR-013 | 116eb5d4 FR013 integrated candidate Dev task-level self-test limited PASS; QA a786ee30 v1 legacy migration/frozen history 18 groups PASS at older SHA; APS-Test v1 development/self-test on 116eb5d4 in progress; original09/B09/R-C03 and full FR013/CR NOT_READY | a49edb1d DEF-V1-NOOP-01 round1 independent PASS remains at old SHA; QA a786ee30 v1 migration/frozen history 18 independent groups PASS plus 7 overlapping repo tests, not full UAT; Dev 116eb5d4 limited integrated self-test PASS; full FR013/CR/UAT NOT_READY. 0 new product FAIL, +0 repair round. |
| CR-FR038-PERF-20261029 | FR038排程时间暂定目标 | 已批准暂定30秒目标；AC27规模/规则/环境仍待确认 | FR-038 | 8741bf0a exploratory Test2 18 tiers/62 Worker runs and C2 count correction; Test1 React full-chain 8/128 orders <1.3s and 512 cancellation, fixed SHA; formal spec pending | Exploration only: no formal AC27 30s PASS/FAIL; C1 task-count wording corrected by C2, 4096=3993+53+50; formal scale/rules/environment/timing boundary pending |

## CR-DEC02-03-20261029

**授权原话**：好。请把这些业务选择做成可配置参数，前台可以进行维护，而不是固化的逻辑。

**变更前**：FR006/BR06已有数量、占用起止及提前/后延释放要求；FR007/BR07已有人员组、人数、技能、班次、参与阶段及未经配置不得替代要求。DEC02/03具体业务选择仍待决。原有要求不重复计为新增。

**批准增量**：将DEC02/03涉及的业务选择统一明确为前台可维护、可保存并实际作用于新试算的参数：工装占用/归还策略，人员参与阶段/窗口、人数与释放，显式技能替代关系及禁止替代；保留基线既有权限、历史输入/方案保护和结果可追溯要求。
用户补充：相关资源可共用；是否共用、交接容量和占用方式均应为可维护配置，实际共享仍受实体身份、容量、时间窗口与历史保护约束。

**专项验收**：实际前台修改→保存→刷新读回→新试算行为变化；占用/释放边界、有向替代与共享人数容量正确；非法/越权原子拒绝、历史方案不变。原AC继续有效，新增检查为CR专项验收，不篡改基线AC条文。
补充：验证共用开/关、交接容量/占用参数调整后新试算结果变化，非法组合拒绝且原确认/执行事实不变。

**设计细化与默认值**：用户批准共享及交接参数化方向；默认值、具体配置枚举与跨组同物理池/N06契约待细化

**影响**：主数据/规则配置、前台表单、服务端校验持久化、运行输入版本、Worker及独立复核、资源人数容量与历史兼容；不包含人员考勤或恢复其他新backlog

**计划影响**：原R2.2/R2.3/R2.4及相关联合资源验收；未另承诺完成日期

**工作量评估**：未正式登记工时/成本评估，不推定已批准预算

**交付限制**：Dev交付声明：工装仅单连续窗口；缺原始资源账的已有执行任务组合明确阻断；由独立Test判断是否满足批准范围，不静默缩小范围

**主跟踪记录**：https://github.com/huiliangtao666/APS/issues/3

**交付与审查追踪**：Dev dlv_197f09db-af6a-4cbf-96cf-16ae535359c2；设计/契约审查 dlv_536b631b-bac0-40ca-a16c-1eeb6ce1a44f；产品Test dlv_f4ebcde5-67f6-4898-a740-535c299548de。代码SHA：12eed5514c702f730aae65a39a08747c532f8536；设计文档提交：见主Issue及受控目录。

## CR-DEC04-05-06-20261029

**授权原话**：DEC-04/05/06，参照以下原则完善设计与需求：1. 补充深入内容，计入需求变更。2. 参数尽量可配置化，不写死。3. 数据可以基于基线验证数据，提供mock数据。

**变更前**：基线已有BOM/收率/包装、质量状态/预计供给、路线/工时/容量/等待空间及规则配置。DEC04/05/06的详细口径及验证参数待明确；原有能力不重复计为新增。

**批准增量**：深入补充DEC04数量基准/收率损失与取整、DEC05质量映射/时点/预计供给、DEC06工时/容量/程序/等待空间的参数化需求设计；提供可追溯基线及派生mock和专项验收依据。
用户补充：BOM/质量可用性/工艺相关规则与参数均设计为可配置，不硬编码mock数值；可配置仍须定义合法组合、范围、单位、来源、版本及冲突拒绝。

**专项验收**：40项参数契约、38个数值/边界mock和6项后续工作流检查；前台保存刷新后新试算生效、非法原子拒绝、来源解释/导出及历史保护。原AC不覆盖，使用本CR专项编号。

**设计细化与默认值**：用户确认全部相关规则/参数可配置；F01-F04具体合法组合及追踪契约仍待细化；本CR仅设计/mock，应用实现未派发

**影响**：11项FR主影响、10条BR；BOM/单位/质量与库存/工艺及规则配置，前台校验、输入冻结、数量资源检查与导出受支持性影响。

**计划影响**：原R3/R4相关功能与验收；先独立设计审查，应用实现尚未安排，不恢复其他未开始backlog。

**工作量评估**：高影响点为数量守恒/迁移/生效时间/上下游空间联立；未正式登记工时、预算或承诺日期。

**交付限制**：现有应用扩展导入/执行接口尚无本CR交付证据；新策略文件为设计契约。基础样例及派生mock均非真实工艺/配方/放行参数。

**主跟踪记录**：https://github.com/huiliangtao666/APS/issues/25

**交付与审查追踪**：Dev 未派发应用实现；设计/契约审查 dlv_ca267537-fa49-42fb-bc46-22e19b565ab5；产品Test 未派发。代码SHA：无本CR应用交付；设计文档提交：4db95a4c4bfb4ec2fe9178b6dc787e69630c9005。

## CR-FR013-VALIDATION-20261029

**授权原话**：每袋支数不能为小数，总收率不超过100%；总收率、物料单位/类别可配置；如果不能从唯一需求确定，则也可配置修改。

**变更前**：v0.3未明确本项具体数值/可配置边界

**批准增量**：每袋支数只允许整数；总收率取值不得超过100%，具体值可由授权配置维护；其他有效范围沿原已批准校验或另行明确；物料单位/类别及唯一需求未确定的业务值设计为显式可配置项，不暗设默认，配置须有类型、单位、范围、版本、权限及新运行生效边界。

**专项验收**：CSV模板/预览/导入按批准配置校验：小数袋支拒绝，总收率>100%拒绝；合法配置保存刷新后生效，非法/越权整批零写入；保留旧确认/历史。

**设计细化与默认值**：配置字段枚举与旧CSV兼容迁移由实现前核定；不得静默将未知值设为0

**影响**：FR013 CSV字段校验、主数据配置、历史兼容及独立验收

**计划影响**：原Issue4/FR013优先于新Backlog

**工作量评估**：未登记工时/成本评估

**交付限制**：无默认值或测试规模推定；无产品FAIL或修复轮次

**主跟踪记录**：https://github.com/huiliangtao666/APS/issues/4#issuecomment-6500755006

**交付与审查追踪**：Dev dlv_d108b114-edb2-4041-a2e9-4ab6765b976b:r1；设计/契约审查 未派发；产品Test dlv_ef297db0-49eb-450a-b7f7-4b26b4ffec52:r1。代码SHA：a49edb1d4fefedabae53d7a15f09534da7da0f9e；设计文档提交：见主Issue及受控目录。

## CR-FR038-PERF-20261029

**授权原话**：FR038，暂定30秒内可排程。

**变更前**：v0.3未明确本项具体数值/可配置边界

**批准增量**：在AC27事先约定的单线数据规模、设备、启用规则组合及测量环境下，暂定排程计算30秒内完成；规模与环境未约定前不能判性能PASS/FAIL。

**专项验收**：固定输入/环境/版本后独立测量排程耗时≤30秒，并验证较长计算可取消、状态不假报及失败不破坏方案/源数据。

**设计细化与默认值**：单线订单、任务、设备数量及规则组合仍待业务确认；目标可能随正式场景调整

**影响**：计算耗时、运行状态与取消体验

**计划影响**：AC27测试规格待明确

**工作量评估**：未登记工时/成本评估

**交付限制**：无默认值或测试规模推定；无产品FAIL或修复轮次

**主跟踪记录**：

**交付与审查追踪**：Dev 未派发应用实现；设计/契约审查 未派发；产品Test 未派发。代码SHA：无本CR应用交付；设计文档提交：见主Issue及受控目录。
