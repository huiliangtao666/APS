# APS 原需求逐卡 Done 资格审查（2026-10-29）

**建议 Design 复核后关闭原卡：FR-036、FR-032、FR-033、FR-035（READY_DONE）。FR-034、FR-038 为 NOT_READY，最小剩余项见下。** 这是六张原卡的完整责任范围审查建议，不是新建切片卡或宣告全项目验收完成。GitHub 状态由 APS-Design 独占维护，本轮没有写卡、关 Issue、合并、发布或实现功能，也没有重跑产品测试。

## 1. 判定口径及审查来源

任务 completed 仅表示执行结束；修复 PASS 只关闭对应缺陷；部分 PASS 不能自动变成原卡 Done。本卡全部适用的已批准要求及 AC **责任断言**有独立 PASS、主流程及相关回归通过、无本范围阻断缺陷/未验证项、版本和命令可追溯，才建议 READY_DONE。原文的前置功能保留，但“依赖其数据/结果”不自动变成“其原卡必须先全量 Done”。共享 AC 也不将其他 FR 的所有操作复制给本卡。

本轮直接打开原 DOCX 的 XML 段落及表格，不以历史派发的 fullR7/allrules/realidentity/UAT 措辞替代原句；读取受控基线、当前台账、两项 CR、六卡 Project 快照、原独立报告及固定 SHA 源码。历史报告不改写，本报告明确修正其中过宽的关闭门槛。状态枚举：PASS / FAIL / PARTIAL / BLOCKED / NOT_EXECUTED；READY_DONE 是独立的整卡建议，不是某一测试状态。

| 来源 | 版本及定位 |
|---|---|
| 主需求 | APS-Design/upload/APS需求分析与设计说明书_v0.3.docx，第6章六项 FR、第9–11章、第14章 AC、第15章 DEC；SHA256 `4eb29f7cfaf4fe30f76329775d32930b806da941282098b7de163591807bc7d4` |
| 基线 | APS-BL-001 v0.3；原始材料仍保留评审稿/未找到正式冻结签批的历史事实；本轮按用户指定的受控原需求审查，不补造签批 |
| 受控台账 | APS-Design/requirements-management/docs/requirements/current-register.json，snapshot_at `2026-10-29T12:03:51+08:00`；project-snapshot.json 是只读本地 Project 快照，不声称本轮实时重新导出全 Project |
| CR | 同目录 changes/change-register.json、change-register.csv；六卡 applied_changes 均为空，当前要求均为 **v0.3，无直接生效 CR** |
| CR-DEC02-03-20261029 | 直接影响 FR006/007/017/022；能力方向及开发已授权，具体默认值未批准。Issue3 `24ba6884b3a5f07425a728b7733a677563c6aa44` D01–D03 round1 PASS；完整48矩阵保留25 PASS /19 PARTIAL /2 FAIL_SCOPE /2 NOT_EXECUTABLE。不能据此抹掉旧基线通过，也不能将此矩阵整体复制到六卡 |
| CR-DEC04-05-06-20261029 | 直接影响 FR002/003/004/005/010/011/017/020/021/022/023；仅需求设计深化/mock授权，应用实现未派发。设计提交 `4db95a4c4bfb4ec2fe9178b6dc787e69630c9005`；Issue25 F01–F04待Design修正，不计产品修复轮次。与上一CR在FR017/022重叠，各自结果独立保留 |
| UAT负责人 | uat-ownership.json/uat-register：全部为 huiliangtao666；没有新业务签收。本轮的范围验收不冒充该业务负责人签字 |

实时只读 GitHub REST 核对：Issue18/19/20/21/22/23 均 **closed**；Issue3/4/10/12/13/14/16/25 为 open。快照和读取结果留在 `temp/done-audit/issue-*.json`。open 的通用验收跟踪 Issue 不自动阻断每个被引用 FR；须有具体条款影响。没有新缺陷、重复 Issue 或新修复轮次。

长期无 Done 的主要原因是把已通过的独立切片长期停留在“非全项目UAT”结论，后续没有按原需求重新归集；共享AC、前置FR及历史open/pending记录又被叠加为通用关闭门槛。仍有真实产品/证据缺口，尤其 FR034 的后续问题联动，以及 FR038 的 AC27前置约定；不能为了数量消除这些缺口。

## 2. 六卡建议总览

| FR | 适用断言结论 | 原卡建议 | 最小剩余动作 / 负责人 |
|---|---|---|---|
| FR-036 | 两条原需求及AC02/23本卡契约、文件及无外部依赖断言 PASS | READY_DONE | Design复核本报告后回写原卡；不等待全部CRUD |
| FR-032 | 当前支持范围的负荷/缺口/提醒/溯源和AC26 PASS | READY_DONE | Design回写已验收范围及明确未知边界；不等待全部资源策略 |
| FR-033 | 甘特/时间表、基础交互、分阶段显示、文字解释 PASS；历史缺陷修复已独立通过 | READY_DONE | Design归集旧报告和实际App补充报告后回写原卡 |
| FR-034 | AC04及基础联动 PASS；后续资源/物料问题的AC17证据 PARTIAL | NOT_READY | Design界定已有启用规则的最小问题样例；Test有限验证；若判断依据/可用量产品缺失则Dev补既有需求 |
| FR-035 | 六类查询/范围/权限/标识/导出/中文流程 PASS，Issue23 round1 PASS且closed | READY_DONE | Design以修复SHA及完成报告覆盖旧pending状态并回写原卡 |
| FR-038 | 功能、保护和本卡中文操作 PASS；AC27性能约定 BLOCKED | NOT_READY | 产品/计划主管/Dev/Test确认规模、环境、规则和目标；Test只测所确认目标，不重跑全套 |

未完成发布、未合并main、其他FR未Done、全项目业务UAT未签收、未派发的新设计CR，不是六卡通用门槛。权限等真实跨范围要求仍须满足；下文采用实际成员/业务权限拒绝、撤销、审计等独立证据，不将synthetic actor说成真实Portal认证。真实gateway身份属于独立集成验收，没有在六卡条文中找到强制其先行的原句。

## 3. FR-036：READY_DONE

原卡：[FR-036](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHhFg)。需求 v0.3；无直接生效CR。前置原句为“数据分类和FR-013/035”。原文要求“说明对应类别、主要字段、唯一编号、来源和方向，并提供CSV模拟文件约定”，且明确“接入实现不作为P0或P1验收必需项”。

被测 GitHub SHA：[d8c8c3ef00d2358f4e6effc0bad0e089b73d95d8](https://github.com/huiliangtao666/APS/commit/d8c8c3ef00d2358f4e6effc0bad0e089b73d95d8)。主证据：`FR-036-INDEPENDENT-REGRESSION.txt` 第1–5节、`FR-036-INDEPENDENT-EVIDENCE.zip`，其中 inventory-audit / independent-report.json / fresh-summary.json / runtime/tests/*.log 可定位场景。

| 责任断言 | 状态 | 独立证据定位 |
|---|---|---|
| ERP/OMS/WMS/PLM/MES类别、字段、唯一编号、来源、方向完整说明 | PASS | 第2节：原第9章19类别对照23现有表，另1项APS扩展；24契约字段及recordKeys逐项核对，不冒充19类全实现 |
| CSV模拟约定、模板/示例及可取用说明；AC02在本卡负责字段/单位/引用/模拟文件的契约接口 | PASS | 24 BOM模板、42 CSV清单哈希相等；实际defs/recordKeys对照；46链接、8真实下载；第4节非法/纠正/重复替换及不变性 |
| PG01中文说明和文件可查；AC23无真实账号/服务仍可使用本卡模拟入口 | PASS | 3组实际App测试；独立 /qa-prefix/ Enter/Space/Tab 与46链接字节验证；历史真实导出样本与新FR035导出分开计证 |
| 无真实连接、订阅、生产指令或PLM写回；前置FR013/035有实际契约/输出来源 | PASS | 第1/2/5节：支持的导入与六类真实报告来源可追溯；无接入实现扩展；当前权限无导出 grant→403、空原因→400、授权后200且1条审计 |
| 主流程及相关回归 | PASS | 新执行466 TAP；构建/CSV；FR035 13、history5、FR038 6、FR036 3组；另8组独立补充，不相加扩数 |

阻断Issue：**无本卡阻断**。Issue4（FR013/016主UI批导/诊断）、Issue12（FR014/015查询编辑）仍有其自己范围，不能把AC02“逐类导入、筛选查询、详情、新增、编辑、复制和按规则删除”整体移交给接口说明卡。AC02原关联本来就是FR013至016；FR036引用它是要求文件约定与实际类别/字段相符。类别01未提供独立导入器已如实说明，没有把缺失导入器伪称存在。

AC23“完成P0流程”的本卡责任是**不引入外部系统依赖**及文件可查可导；完整P0执行属于AC25和各FR联合验收。未完成其他P0实现，不构成本卡文档/文件契约失败。旧报告第5节“AC02全类别CRUD及AC23整条流程不足所以不Done”的关闭门槛在本次审查中撤销，保留全部原始通过和真实上游缺口。

外部/后续：FR013全类别导入、FR014/015 CRUD、P0完整流程及业务UAT各归原卡；未来D3接口另行批准。最小动作仅Design复核并更新本原卡，不派新实现或全套补测。

## 4. FR-032：READY_DONE

原卡：[FR-032](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHhAY)。需求 v0.3，无直接生效CR。原文限定“**按当前已支持范围**显示设备忙闲、模具占用、人员需求、空间占用和物料缺口；从汇总转到任务和原始数据”；第二条要求订单延后/模拟到料未满足/输入缺失等具体数量与原因。前置FR020/022/024是已保存结果的来源，不是把其全部排程策略转嫁给展示卡。

独立被测 SHA：[28ed8f8e422173f9b83d8a974e26ea9af6f09c8e](https://github.com/huiliangtao666/APS/commit/28ed8f8e422173f9b83d8a974e26ea9af6f09c8e)。报告 `FR-032-INDEPENDENT-REGRESSION.txt` 的 MODEL / API / ACTUAL APP / KNOWN INHERITED DEFECT 各节；`FR-032-INDEPENDENT-EVIDENCE.zip` 中 independent-browser-report.json、独立API/模型脚本、plans-before/after.json、15次CSV精确比较及5实际下载。

| 责任断言/适用AC | 状态 | 场景 |
|---|---|---|
| 设备忙/未分配、未知不当作实时空闲；窗口与保存计划一致 | PASS | 324窗口×4排列的区间并集oracle；busy+unallocated=窗口，availableNow=null；非法端点保持unknown |
| AC06工装数量/后延占用的显示；AC07人数、参与窗口和来源显示；AC14空间重量/时间依据 | PASS | 工装延后归还10分钟、人员2只参与5..20、共享占用去重；600+600对1000空间串行，峰值600；独立400窗口比较 |
| AC10缺口、质量状态/模拟来源；不重复累计消耗 | PASS | 325需求/400库存/100占用→25缺口，待检/冻结/不合格不计；424.9/424.99/425边界；候选消耗0、提交标记按真实结果 |
| 延后/条件到料/缺输入具体数量、时间和原因 | PASS | 96kg/60分钟延后；65kg预计可用180→240；缺来源保持未知，不以墙钟推定实际到货 |
| 汇总→任务→原始输入，同一保存方案；AC26权限与导出一致 | PASS | 实际App定位A-MIX至FR034/FR033及历史输入；保存revision2与当前5区别；5类别×3窗口15次API CSV一致，5实际下载；成员/角色/撤销/CSRF/原因审计 |
| 主流程及相关回归 | PASS | 434 TAP、构建/CSV、14模型组、6API组、实际浏览器6+5组，4份保存计划JSON完整不变 |

阻断Issue：**无本卡阻断**。Issue16最大等待/完整联合、Issue3候选分配/人员策略不直接落入“按当前已支持范围”的投影责任；AC06/07/14在本卡负责保存数量/区间/来源/解释，求解正确性由FR006/007/021/022等承担。配置容量不冒充动态剩余可用值。

Issue20在28ed8f8旧pin仍复现FR034主动复核的未知值缺陷，已由该卡独立修复并关闭；FR032自己的未知负荷及导航断言通过，它不是FR032投影缺陷，不以该报告宣告整个旧应用可上线。后续d8c8c3e的LoadPanel.tsx/resource-load.mjs与此pin字节相同，但整棵源码有其他变化；这里只作为保留说明，不假称14组独立oracle在新pin重跑。

外部/后续：新资源引擎/CR增量接入时应验证新增保存结果在本卡的显示，不能静默扩大本次已验收版本。真实Portal身份及全项目UAT另归集。最小动作仅Design回写原卡及范围，撤销原报告将全部DEC/联合/R7/UAT作为本卡通用Done门槛的结论。

## 5. FR-033：READY_DONE

原卡：[FR-033](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHhB4)。需求v0.3，无直接生效CR。两条原文要求机器为行、时间为轴；基本缩放/滚动/筛选/详情，订单/工序/计划时间/状态；逐阶段加入停机背景、前后工序连线、模具/人员/空间占用和模拟进度；颜色有文字说明。前置FR018/019/024提供被显示的任务与状态。

最终实际App被测SHA：[799f0882e610fca0b6ee1dfe64c52de84a04350a](https://github.com/huiliangtao666/APS/commit/799f0882e610fca0b6ee1dfe64c52de84a04350a)。它只增加10个QA/文档/证据文件，105项产品源与父 `6e1cee732170c176c2a3f876e410be3ed7fc3792` 比对一致。产品轴标签修复 `a4dfa263f7cf8ca832243d153e39efaf771c6b2e`；早期ZOOM/WINDOW修复 `50a32ef716f4bcd3f72993a2f0125afac9fabce2`。各历史执行保留各自完整SHA，不把跨SHA测试数加成一次执行。

证据链：`FR-033-INDEPENDENT-REGRESSION.txt` I01–I16 → `FR-033-ISSUE18-ROUND1-INDEPENDENT-REPORT.txt` → `FR-033-ISSUE19-ROUND1-INDEPENDENT-REPORT.txt` → `FR-033-REAL-APP-INDEPENDENT-REPORT.txt`；对应同名前缀EVIDENCE.zip。最终场景定位 browser-final/report.json、independent-api-report.json、independent-axis-report.json、10张自有截图。

| 责任断言/适用AC | 状态 | 独立场景 |
|---|---|---|
| 机器行/时间轴/订单工序/时间状态/任务表详情、基本缩放筛选滚动 | PASS | I01–I06；最终浏览器9组：选择保存计划→表/详情→前序，机器筛选保留隐藏选择再恢复、搜索重置；24轴渲染矩阵1100/640、.25/1/3/8、负日/多日/长窗口；非法窗口保留可用视图 |
| AC04/17本卡任务/前后工序/原始数据身份与时间一致 | PASS | I06及最终实际App DataQueries历史orders回链；计划/任务ID一致，连线真实；更完整问题判断由FR034负责 |
| AC05停机背景和顺延理由 | PASS | I11真实日历30..60、B-MIX60..90；最终joint机器停机背景和前序路径可见，不跨停机不拆任务 |
| AC06/07本卡资源占用/人员需求及文字，空间占用 | PASS | I07/I14/I15保存工装G40、人员G、COLD；最后真实计划占用G40 0..40/60..100、人员5..10/65..70、空间0..60/60..120；数量/参与窗口不混同机器运行 |
| 模拟进度、保存/当前区别、颜色文字替代、AC31本卡操作可理解 | PASS | I08/I16与最终实际App保存40/当前50、中文任务/资源文本、滚动/筛选/导航和640视口；颜色不是唯一信息；完整保存/确认保护回归 |
| 主流程及修复/相关回归 | PASS | 早期431 canonical+53独立的各自报告；最终5组smoke、28API、9浏览器、24渲染轴案例；无页面异常，2保存计划和输入完整不变 |

阻断Issue：**无本卡阻断**。Issue18/19均closed，旧报告环境401/403、不能访问localhost及pending布局验收已由同容器真实App浏览器独立证据解除；不是仍缺一次同类补测。最终pin同时包含既有history修复；不能继续援引更早历史缺陷当本卡阻断。

原AC31：“计划用户按导入、计算、核对、提交流程操作”；预期“中文状态与错误可理解；任务和问题可定位；页面优先级与构建阶段一致。”本卡负责甘特/任务/定位环节，实际App相应交互已执行；该句未规定全项目UAT签字、真实Portal认证或所有页面无障碍认证。保留这些后续事项，不复制成此卡关闭条件。FR034后续资源问题的判断/解释缺口也不等于本卡未显示资源占用。最小动作由Design归集并回写原卡，不追加全项目流程或重复浏览器包装。

## 6. FR-034：NOT_READY

原卡：[FR-034](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHhDI)。需求v0.3，无直接生效CR。前置FR014/024/025/033。原文第二条明确“可主动运行检查并筛选问题任务。**新增模具、人员、物料等规则时，对应显示需求/可用值及判断依据，不要求用户先导出再核对**”。这项本卡义务不能用“未做全项目UAT”笼统替代，也不能被基础机器/顺序PASS消除。

最新独立入口SHA：[f3316991e4e2e5e4fce6b0a419fa1e4fc27f05ae](https://github.com/huiliangtao666/APS/commit/f3316991e4e2e5e4fce6b0a419fa1e4fc27f05ae)；确切产品SHA `4e11da6c768e6eeb026f38e1d247191cbe3c2cf8`（110源文件逐项一致，之后仅QA/文档改变）。证据 `FR-034-INTEGRATED-EXIT-INDEPENDENT-REVIEW.txt` 的 RESULTS / ORIGINAL ACCEPTANCE 各节及同前缀EVIDENCE.zip；早期 `FR-034-INDEPENDENT-REGRESSION.txt`、UNKNOWN01/KBD01–04各round1报告继续保留。

| 责任断言/适用AC | 状态 | 场景/未通过边界 |
|---|---|---|
| AC04机器交叠、前后序具体结束/开始/违反时长及输入定位 | PASS | 交叠[20,30)、priorEnd30/nextStart20/violation10；图/表/详情/冻结输入同任务；未知端点不伪造区间 |
| 主动检查、问题筛选、任务→输入/前后序/资源需求；AC15本卡说明检查来源和支持边界 | PASS | 独立核对line/machine/precedence明确；资源证据标为保存计算证据，不冒充新全规则复核；零问题筛选恢复 |
| AC17基本联动及已测物料短缺场景 | PASS | 保存工装/人员/空间声明及占用、物料325/0/325；无排程任务不造甘特条；保存40/当前50与历史输入清楚 |
| 原文第二条 + AC17：后续启用工装/人员/物料问题，需求/可用量/判断依据→相关任务区间→原输入完整链路 | PARTIAL | 原独立结论仍缺代表性后续问题样例。现有资源配置总量不是时点剩余可用量；仅正常占用和物料短缺个案不证明工装/人员冲突问题的完整判断依据及定位。全量跨规则求解不归本卡，但本卡的解释/定位不能免测 |
| AC31本卡中文、键盘、命名、焦点与无需导出 | PASS | 集成6键盘断言、UNKNOWN24组、boundary14组、1100/640；14/14恢复焦点及空态transition；不声称全面a11y |
| 已有修复及相关回归 | PASS | 441 TAP、构建/CSV；history4组/19响应；Issue20/21/22修复已独立通过并closed，不重开round2 |

阻断：**原FR034第二条/AC17对应的有限验收未闭环**。现有Issue13及Issue3/16是相关规则/资源来源跟踪，不能以它们整项open代替上述精确缺口，也未找到一个单独记录“FR034所有后续问题联动未完成”的专用缺陷Issue。本轮不新建平行卡或虚构产品FAIL。

最小剩余动作：Design先依据已启用且获批准的规则选定工装数量/后延、人员需求与有效可用量、物料短缺各一个代表性异常（已有物料例可复用），列出预期数量/区间/规则/原始输入。Test只补这组真实App问题点击链路，既有正常/键盘/history结果保留。若产品无法产生或显示必须的判断依据，Dev按本条既有需求补缺；不要求先实现所有资源策略或整个CR。当前不止一个已确定可执行且齐备的验证，故本轮未擅自运行补测。

外部/后续：全项目AC15规则开关矩阵、完整独立资源求解、Portal身份、全流程UAT属于各责任卡/项目；旧报告“完整AC31整条UI流程/真实身份/UAT”不再作为本卡通用阻断。本卡仍NOT_READY的原因只保留具体解释/定位责任缺口。

## 7. FR-035：READY_DONE

原卡：[FR-035](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHhEU)。需求v0.3，无直接生效CR。原文列出订单/任务计划、资源占用、物料需求、未排原因和方案差异六类查询，CSV **或** Excel，按页面当前范围和权限；导出标识产线、方案、输入记录、单位、日期和模拟说明，与页面数量/时间一致。前置FR014/024/026/032提供来源，不要求其全部业务策略先Done。

修复/完整功能独立被测SHA：[cf6e76e23722f142a08c552aacb43c924fc62f19](https://github.com/huiliangtao666/APS/commit/cf6e76e23722f142a08c552aacb43c924fc62f19)。验收矩阵/工具交付审核SHA：[9082e3d82a11f00947d82f1f672c51fb08f3536a](https://github.com/huiliangtao666/APS/commit/9082e3d82a11f00947d82f1f672c51fb08f3536a)，只新增117个文档/QA文件，113项产品源与cf6e76e一致；不冒充第二次产品执行。

证据：`FR-035-INDEPENDENT-REGRESSION.txt` 保留原缺陷FAIL；`FR-035-DIFFORDER01-ROUND1-INDEPENDENT-REPORT.txt` 修复及独立probe/B–F；`FR-035-ACCEPTANCE-INDEPENDENT-REPORT.txt` 的MATRIX AND EVIDENCE / DOC-01；各自EVIDENCE.zip。矩阵17行、31源引用、55证据引用，六类page-*.json/csv、真实浏览器DOM/download、确认history、独立side-probe均可定位。

| 责任断言/适用AC | 状态 | 场景 |
|---|---|---|
| 全部六类查询及来源完整；AC26当前页面筛选/范围 | PASS | orders2/tasks4/occupation9/materials5/unplanned2/differences46；窗口半开、整计划数量范围明确标识；任务/占用可裁剪但不伪造订单完成量 |
| 按订单筛选差异保留任务关联资源、前后方案归属正确 | PASS | 父版本独立重现缺4；修复forward/reverse A=17行/6资源，unknown=0/0、empty=46/11；共享行不分摊、不复制，当前输入不改历史归属 |
| AC26数量/单位/时间/产线/方案/输入/模拟说明与页面及CSV一致 | PASS | 12独立组、9新side-probe组；14文件独立CSV解析，精确小数/分数、空值、中文/引号/换行/formula保护；六类DOM/API/下载一致 |
| 页面权限及按范围导出，信任身份/原因/审计，不采纳前端伪造 | PASS | 存储成员grant/撤销/移除；伪actor/role、跨域、空原因、旧viewId/扩大范围分别拒绝；成功审计精确记录query/view/input/hash |
| AC23本卡无真实系统/发送消息依赖、文件可导；AC31中文查询/差异/导出可理解 | PASS | 真实App中文汇总/精确记录详情、窄视口与键盘筛选下载；actual export，不依赖外部账号；CSV已满足原“或Excel” |
| 历史保护及主流程/相关回归 | PASS | 修复pin458 TAP/构建/CSV，FR035浏览器13+history5、FR038保留6；原独立12及新side-probe9组；真实提交/主管确认/保护拒绝/归档/恢复后CSV不变 |

阻断Issue：**无本卡阻断**。Issue23 round1独立PASS且实时closed；验收矩阵/工具仍输出pending是旧快照，已由完成报告DOC-01明确覆盖，不要求再修复/再测一次。Issue10/13/14/16有其身份/求解/其他功能责任，未见本卡六类查询或导出缺失的剩余断言。页面/CSV一致不会单独证明求解可行，但本轮亦有独立完整性oracle，不靠同源一致性掩盖缺行。

外部/后续：全规则求解、真实身份、全项目UAT、性能、所有电子表格软件行为、后续CR新增数据各自处理；原文未将这些全部指定为本卡报告关闭门槛。旧报告把全部R7/前置FR全验收列成卡级阻断的结论修正为责任范围外事项。最小动作Design将cf6e76e修复及9082e3d证据追踪回写原卡，无需新功能/全套测试。

## 8. FR-038：NOT_READY（仅保留明确的AC27前置约定与量测缺口）

原卡：[FR-038](https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHhHk)。需求v0.3，无直接生效CR。原文要求保存每次计算输入/规则/耗时/状态/错误便于同数据复查，较长计算可取消，失败不破坏源数据/保存方案，技术信息可展开且普通用户无需理解算法。前置FR018/024提供运行及结果状态。

独立被测SHA：[8741bf0a597fa11838a514259d8ffe7980382ee2](https://github.com/huiliangtao666/APS/commit/8741bf0a597fa11838a514259d8ffe7980382ee2)。后续修复pin `cf6e76e23722f142a08c552aacb43c924fc62f19` 保留FR038产品字节并新跑6浏览器组；`d8c8c3ef00d2358f4e6effc0bad0e089b73d95d8` FR036独立执行亦保留6组，不能将旧独立10组说成后来又跑过。

证据 `FR-038-INDEPENDENT-REGRESSION.txt` / EVIDENCE.zip 的 B1–10、SUPPORTED BEHAVIOR、actual-App HTML/ARIA/PNG、history8及浏览器6；`FR-035-DIFFORDER01-ROUND1-INDEPENDENT-REPORT.txt` 的FR038 PRESERVATION，`FR-036-INDEPENDENT-REGRESSION.txt` 第3/5节。

| 责任断言/适用AC | 状态 | 场景 |
|---|---|---|
| 每次运行保存输入/规则/耗时/状态/错误、同条件复查；AC16/32 | PASS | inputVersion/hash/rules/ruleEvaluationAt持久化；retry新UUID+retryOf、不覆盖原运行；真实Worker跨规则生效时间与新输入区分 |
| 长任务取消、超时/部分/错误状态，不伪报可用或无解；AC16/27体验部分 | PASS | cancel/timeout/result/error/exit各先到、迟到事件不覆盖、一次terminal审计；1.1秒延迟终止确认期间stopping可见，之后cancelled；超时中文说明不是不可行证明 |
| 失败/取消/异常不改源数据/保存或确认方案；AC16/32相关断言 | PASS | 真实busy/crash Worker及history8；已确认完整JSON比较；真实执行事实40→50后旧retry409，不重复物料；备份恢复/电源故障不是这里凭空增加的生产级要求 |
| 中文状态/错误/下一步；展开技术信息；AC31本卡交互 | PASS | 实际App640视口、Enter展开、原输入/规则、CSV诊断下载、重载保留运行ID；隐藏原始私密stack，不要求算法名 |
| 权限与信任边界、相关回归 | PASS | query403、空原因400、跨站403、降级/成员移除403、伪actor/状态忽略；457 TAP/构建/CSV、6浏览器、另10独立事件/规则/事实组 |
| AC27：事先约定规模/设备/规则组合，以及第11章确认后目标的查询/计算量测 | BLOCKED | 未找到获批准的规模/设备/组合/时间目标。现有1218/50/42/2518ms来自特设QA延时，不能当批准规模性能PASS |

AC27原句：“数据：**事先约定的一条产线规模、设备和规则组合**”；“预期：**按第11章确认后的目标检查**；较长计算有状态可取消，不假报可用结果”。第11章NFR03建议95%查询2秒；NFR04建议简单5秒、完整单线争取60秒，随即说明“正式目标需确认设备、任务数及规则组合”“上述性能值为建议验收目标”。DEC01/DEC08也要求在R7前约定规模/性能/恢复要求。本轮查阅的原件、CR台账及证据未见该确认；不把建议值自动升级为生产SLA，不虚构p95负载、并发或大型工厂指标。

因此功能断言已通过，但不能将原AC27整条判PASS，也没有用户授权豁免/延期该验收。**NOT_READY的最小阻断是约定与对应有限量测，非生产级性能不达标，也非已发现产品缺陷。** 这个缺口不是只差一个现成可执行测试，本轮不自行设目标补测。

现有跟踪Issue14（运行/规模验收）、Issue13（规则/运行验收）可引用，但它们整项open不是本卡理由；Issue23已修复关闭且后续FR038回归通过，不再阻断。原报告所列signed identity、五阶段业务UAT、fsync/灾备/分布式锁、OS异常回收、引擎可执行文件归档/跨版本确定重放等，没有找到本卡要求的对应生产级原句，不作通用Done条件。legacy同步/calculate不可取消不等于当前已验证的用户长任务入口不可取消；若它后来被纳入用户长任务流程，应按实际入口另验，不能只凭遗留API存在新增失败。

最小动作：产品/计划主管联合Dev/Test确认一份含订单/任务/设备数、启用规则、运行环境、查询/计算目标的验收规格（业务目标确认责任由Design组织，huiliangtao666为业务验收负责人）；Test在固定完整SHA只执行所需规模的量测与取消检查。若确认的条件暴露失败，再建具体缺陷；当前不派实现扩展。全项目业务UAT与Portal身份另行验收，不补造签收。

## 9. 其他已测 In progress FR 简表

以下23项只做证据盘点，**未在本轮进行同等深度的整卡Done资格判定**。CSV以NOT_EXECUTED标识“本轮完整资格审查未执行”，NOT_READY仅指尚未形成新的可关闭建议，不是把旧报告所有限制再认定为有效阻断。每项保留原通过，下一次应先做责任断言归集，而不是默认全套重测；所有未开始Backlog继续暂停。

| FR / 当前要求版本 | 独立报告（其中固定SHA为被测版本） | 最小待归集/真实范围问题 |
|---|---|---|
| FR-006 / v0.3+CR-DEC02-03-20261029 | DEC02-03-24ba688-ROUND1-INDEPENDENT-REPORT.txt；`24ba6884b3a5f07425a728b7733a677563c6aa44` | CR02/03完整矩阵仍有候选/多窗口等原范围缺口；保留D01–D03 PASS，不再派同缺陷轮次 |
| FR-007 / v0.3+CR-DEC02-03-20261029 | DEC02-03-24ba688-ROUND1-INDEPENDENT-REPORT.txt；`24ba6884b3a5f07425a728b7733a677563c6aa44` | CR02/03独立岗位、跨组物理池、多班等未闭环；原配置与首轮修复PASS保留 |
| FR-010 / v0.3+CR-DEC04-05-06-20261029 | FR-010-REPAIR-R1-INDEPENDENT-RETEST.md；`c9fd687e49bea9135ae9a44d02c21b60f1048040` | 旧D1/D2修复PASS；需归集基线质量/时点/引用断言；CR04/05/06仅设计增量，不能抹掉旧通过 |
| FR-012 / v0.3 | FR-012-independent-regression.txt；`95332f111a07229a4fb9310e24e2b38e0a8ae721` | 累计事实/余量/防重PASS；原UAT15聚合耗料到来源批次映射未定；仅属本卡适用事实/耗料断言需明确，不复制全部恢复工作流 |
| FR-013 / v0.3 | FR-013-MAIN-RAW01-R1-INDEPENDENT-REPORT.txt；`0aaa003dc85ff453bad3c958b14a94c44dadb0cf` | 六类主UI及RAW01修复PASS；逐第9章类别模板/预览/导入/诊断范围仍需完整归集，不能把通用上传当全部类别实现 |
| FR-014 / v0.3 | FR-014-015-MAIN-INDEPENDENT-REPORT.txt；`f00e705572c6f034f3982ca236060fae2750b801` | 有限查询/关联/真实确认历史PASS；按每类已支持数据的列表/筛选/详情/关联断言归集，不复制全部CRUD给查询卡 |
| FR-015 / v0.3 | FR-014-015-MAIN-INDEPENDENT-REPORT.txt；`f00e705572c6f034f3982ca236060fae2750b801` | 有限编辑/引用保护/真实确认历史PASS；新增/编辑/复制/允许删除与查询用户拒绝的类别矩阵需归集 |
| FR-016 / v0.3 | FR-016-FINITE-INDEPENDENT-REPORT.txt；`500bdad0d70ba5f5cc2a9817b9d649a553e438e5` | 29检查/导航等有限PASS；字段诊断粒度与阻止/提醒分离未完整验收，不能把所有400当提醒流程通过 |
| FR-017 / v0.3+CR-DEC02-03-20261029+CR-DEC04-05-06-20261029 | DEC02-03-24ba688-ROUND1-INDEPENDENT-REPORT.txt；`24ba6884b3a5f07425a728b7733a677563c6aa44` | 两CR重叠分别保留；CR02/03完整48项未全PASS；CR04/05/06设计待F01–F04修正且产品未派 |
| FR-018 / v0.3 | FR-018-INDEPENDENT-REGRESSION.txt；`a9eb8f6d60e8adc523217c117e6152c96d7924c2` | 冻结输入/并行修改/取消PASS；后续FR038已补运行UI证据，需按本卡选择范围/同份快照断言归集；不沿用旧R5/UAT笼统门槛 |
| FR-019 / v0.3 | FR-019-Independent-Regression-Report-2026-10-29.md；`1a534991556131f4d29512dac271a73556ac1b9b` | 最小机器/前后序独立PASS；优先核对后续实际App证据是否补齐本卡展示断言；不得要求人料/全资源才关闭R1最小卡 |
| FR-020 / v0.3+CR-DEC04-05-06-20261029 | FR-020-INDEPENDENT-REGRESSION.txt；`a7d766614bbdfbb13c78217b516cae2730c11823` | 物料分配支持切片PASS；需按余量/BOM/投料日期/批次/可用供给归集原断言；后续设计CR未实施不反抹旧通过 |
| FR-021 / v0.3+CR-DEC04-05-06-20261029 | FR-021-INDEPENDENT-REGRESSION.txt；`e72c552fdd8eea189380d0bcc75c0265188d243b` | 支持拆批/容量/固定程序PASS；本卡兼容合批/尾批及数量分摊尚需映射，不把全部AC14空间调整归给拆批卡 |
| FR-022 / v0.3+CR-DEC02-03-20261029+CR-DEC04-05-06-20261029 | DEC02-03-24ba688-ROUND1-INDEPENDENT-REPORT.txt；`24ba6884b3a5f07425a728b7733a677563c6aa44` | 已启用全部资源同时满足是本卡真实义务；完整CR02/03范围和原始执行资源账仍有缺口，D01–D03已PASS不重开 |
| FR-023 / v0.3+CR-DEC04-05-06-20261029 | FR-023-independent-regression-report.txt；`675f6fd81555230260d2245aabed6dbb7e3f20d2` | 条件可交付/延后说明支持切片PASS；需对等待/依赖未验证项划定交付结论影响，不冒充全局最早或删除真实依赖 |
| FR-024 / v0.3 | FR-024-independent-regression-report.txt；`2375487b3d630190434fd4be4e3313de18d8df7a` | 状态/原因切片PASS；后续FR034/038已有实际App与保护补证，需归集本卡状态及具体任务/资源/日期/数量建议，不要求全项目UAT |
| FR-026 / v0.3 | FR-026-independent-regression-report.txt；`e93fadce55d3f1deef0a602d3a01ebfe561a01b4` | 保存/复制/比较/丢弃PASS；需核对恢复旧方案按当前事实重检的成功路径；拒绝过时恢复不等于成功恢复功能 |
| FR-027 / v0.3 | FR-027-INDEPENDENT-ACCEPTANCE-REPORT.txt；`6857c1e569d8032a21a1ec4b32e9be7a024c791a` | 时间拖动/预览/检查/提交/锁定及两缺陷PASS；需逐断言审计真实启用约束的有效性，不能只用机器/前序检查宣布完整有效；不凭AC21复制全部异常恢复 |
| FR-028 / v0.3 | FR-028-independent-regression-report.txt；`7465159d98fbc63f7e6b9413c71466b31d9bad82` | 支持条件试算/无改善/保留放弃PASS；各类指定可改条件及影响说明需按原条归集，不要求最优性或全部求解策略 |
| FR-029 / v0.3 | FR-029-independent-regression-report.txt；`a5fa26da552b7d8f4196eb93a6618652648cd50f` | 五类事件和防重复/事实保护PASS；保护时段仅no-new-start而非保留旧位置的边界须按原文核定，不自动加入恢复/调拨等未批准功能 |
| FR-030 / v0.3 | FR-030-HISTORY01-ROUND1-INDEPENDENT-REPORT.txt；`3290634c28f58da0d4324fc1de90d04a2ad1eaa7` | HISTORY01修复PASS；提交/主管确认退回/重提/启用冲突拒绝/部分未排须逐条归集；不得仅靠历史已修缺陷继续阻断 |
| FR-031 / v0.3 | FR-031-independent-regression-report.txt；`06895745273cde80ac681d2bb12bd388b297b04f` | 进度影响/累计量/耗料防重PASS；原UAT15来源映射待核；只审本卡余量及影响，不复制所有AC21恢复或真实MES接入 |
| FR-037 / v0.3 | FR-037-INDEPENDENT-REGRESSION.md；`51e1e7ed1c7fe6c658e16337da97979fad344a30` | 权限/审计早期切片PASS；FR030/035/038已提供后续真实业务路由与成员拒绝证据；需按操作矩阵归集，真实身份在本安全卡是否为必要验收应独立审，不转嫁六卡 |

## 10. 复查入口、证据完整性与交接

本轮执行的仅为标准库DOCX ZIP/XML读取、受控JSON/CSV读取、Git对象/源码比对、GitHub只读REST GET、证据ZIP CRC和哈希审计、交付CSV字段检查。没有新增产品测试SHA，也没有把本次静态审计说成新的产品PASS。上列每个产品PASS来自已完成独立执行；其运行命令、环境、失败控制、原始日志和脚本在对应报告/归档中。

可复查的既有入口（按报告对应固定SHA及授权SDK环境运行；本轮未再次执行）：

| FR | 既有命令/入口及定位 |
|---|---|
| FR036 | `python3 qa/fr036-check.py`；`FR036_REPO=... FR036_OUT=... bash qa/fr036-docker.sh`；另 independent/run.sh / probe.mjs |
| FR032 | 归档canonical-command.sh、independent-model.mjs、run-independent-runtime.sh；`qa/fr032-docker-browser.sh` |
| FR033 | 最终归档commands.sh、docker-browser-final.log、browser-final/；早期修复各自报告/入口保留，不将其旧运行混称最终执行 |
| FR034 | `FR034_SDK=... FR034_OUT=... bash qa/fr034-integrated-validation.sh --run`；归档reproduce.sh固定入口/产品SHA |
| FR035 | 修复归档parent-run.sh / independent-run.sh / side-probe.mjs；`qa/fr038-docker.sh`；文档pin `python3 qa/fr035-acceptance.py --check`；旧FR035入口硬编码旧manifest，不推荐冒充当前产品命令 |
| FR038 | `FR038_REPO=... FR038_SDK=... FR038_OUT=... bash qa/fr038-docker.sh`；归档independent-run.sh/independent.mjs |

所有可选执行仍应在隔离容器内完成，不在VM宿主安装依赖/启动应用；输出路径新建且为空，不修改现有应用。上述命令中的省略号是读者按报告替换的绝对路径，完整已执行命令在各原报告；不是声称本轮执行过的命令。

本轮核对下列归档CRC全部PASS，并计算整包SHA256以定位现有证据。这里只交付本次要求的.md/.csv；已有证据归档保留在APS-Test根目录，文件名和哈希足以供Design查取，不重复打包私有原需求附件。

| 现有证据文件 | 条目数 | SHA256 |
|---|---|---|
| FR-036-INDEPENDENT-EVIDENCE.zip | 87 | `8a96c7bab14d74625504c5849b1ca7955ead8c9eecaaa80bd778dfd7a470ff29` |
| FR-032-INDEPENDENT-EVIDENCE.zip | 34 | `d1799dfe103d6e750c7592bc9888ecb53fe2a4024c31e2f355b32ef3cc541e46` |
| FR-033-REAL-APP-INDEPENDENT-EVIDENCE.zip | 49 | `bb6edc15f04b6701a5edd1d00c9dd6a55fcf8ac1825b581549dfa954bd0f8e1d` |
| FR-034-INTEGRATED-EXIT-INDEPENDENT-EVIDENCE.zip | 208 | `2ec82ac9df29cad77eafa3e1879c152461c06d8c8ecdda6517c88bd14e6ebaec` |
| FR-035-DIFFORDER01-ROUND1-INDEPENDENT-EVIDENCE.zip | 131 | `98766e57162aa75251ff321748d4b6dfedb470053b90b664981e23c1fb178450` |
| FR-035-ACCEPTANCE-INDEPENDENT-EVIDENCE.zip | 36 | `ed20dfc6ddac3b3947c60f174b3e9f315523d67173c5b288ca08a6f4efc6344c` |
| FR-038-INDEPENDENT-EVIDENCE.zip | 90 | `f776d1641b61e123b4ef21772a62e4a4b3b610a2d527ea691f9bd286323f0364` |

CSV共有58条：六卡35条责任断言、其他23张已测In progress FR各1条简表。六卡全部写有原卡URL、v0.3/CR适用性、40位被测SHA、状态、报告/场景、阻断、后续事项、建议和最小责任动作。其他简表的NOT_EXECUTED只指本轮未做完整资格审查，并不否定既有产品PASS。Project快照中另有2张In progress BR，未在本次“其他FR简表”中冒充新增已审FR。

交接给Design：优先逐卡复核并将FR036/032/033/035的本卡断言PASS、版本/SHA及READY_DONE建议回写原卡；FR034只登记明确的后续问题解释/定位缺口，FR038只登记AC27规格确认及有限量测缺口。不要等待全项目测试完成，也不要以此报告关闭其他FR/BR或签署业务UAT。全部未开始Backlog仍暂停，Issue3/25各自结果和职责保留，本轮没有新的开发派发。
