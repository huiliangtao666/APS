# APS需求设计范围基线、变更与实施跟踪

**当前需求设计范围基线：APS-BL-002 / V2，用户已于2026-11-04明确确认。**

用户原话：“请以此版本作为新的需求设计范围基线，并在github上更新”。V2为当前完整需求设计入口，后续按明确批准的增量变更管理；v0.3与历史CR继续保留追溯。

## 当前入口

| 内容 | 权威入口与用途 |
| --- | --- |
| V2基线说明、批准依据及下载 | [APS-BL-002 / V2](baselines/APS-BL-002-V2/README.md) |
| 完整需求设计正文 | [16章完整正文](baselines/APS-BL-002-V2/requirements-design.md)，含UI/UX专章 |
| 当前基线指针 | [active-baseline.json](active-baseline.json) |
| V2结构化范围 | [APS-BL-002-V2.json](baselines/APS-BL-002-V2.json)，保留61项原编号、20项CR及143项Issue采纳 |
| 追溯与参数字典 | [V2追溯与字典xlsx](baselines/APS-BL-002-V2/APS需求设计V2_追溯与字典_20261104.xlsx)，181项参数目录、492源字段及AC/UAT/新增断言 |
| 后续需求变更 | [受控CR记录](changes/change-register.json)，历史增量已物化到V2的部分不得机械重复叠加 |
| 实时实施及证据 | [GitHub Project2](https://github.com/users/huiliangtao666/projects/2)，唯一实施主账，复用原卡 |
| UAT责任 | [责任授权](uat-ownership.json)与[交接规则](operations/handoff-policy.md)：QA主责，用户配合，PM按依赖就绪调度 |

## 基线生效与历史保护

- V2取代v0.3加历史CR拼接口径作为**当前设计范围**。V2中待决、候选、仅设计、不启用等明确限定仍按文内管理，不能用“成为基线”补造未知公式、现场默认值或联动准入。
- 已确认的Word/HTML/Excel/ZIP原件不改写，本次批准记录单独追加，hash见V2目录。原始用户上传数据不因本次登记上传或覆盖。
- [APS-BL-001 v0.3](baselines/APS-BL-001-v0.3.json)保留只读；[原61项基线表](baseline-register.md)仅为v0.3历史，不代表V2当前条文。
- 需求范围批准、代码实现、任务级验证、QA/UAT和发布分别记录。旧卡Done和历史通过继续只对应原版本/原范围，不自动转为V2已验收。
- 后续批准CR对V2的增量逐项叠加；历史CR中尚未获批/未采纳部分在后来获得明确批准时再按适用范围纳入。

## 旧派生表的口径

[旧需求跟踪表](requirements-register.md)、[CSV](requirements-register.csv)、[current-register.json](current-register.json)保存旧v0.3+CR口径的实施快照；其中旧“current_text/current_version”不是V2当前范围。其数据与验收内容本次不改写，当前范围请读取active-baseline.json指向的V2，实时状态读Project2。

旧导出/同步工具仍沿历史基线组织字段。PM后续维护派生清单时应先支持当前基线指针和历史增量去重，再刷新范围字段；不能运行旧逻辑将V2入口退回v0.3，不能以刷新清单改变Status或迁签证据。

## 职责与后续流转

Design维护业务设计及原型/场景/mock；PM维护CR、实施原卡、调度及同源清单。Dev在既有授权范围整包实现和自测；Test/QA按适用阶段及PM调度提供独立证据。最新各原卡授权优先，不因本次范围登记启动新的backlog、恢复巡检或发布应用。

本次GitHub更新仅需求设计资产、基线批准和导航元数据，没有改产品程序、原始仿真文件、实施Status或历史验收结论。

## 最新综合设计修订：V2.1（2026.11.07）

[V2.1完整需求与设计说明](revisions/APS-V2.1-20261107/README.md)综合后续CR及最新UI/UX；[UI/UX专章](../ui/aps-ui-ux-v2.1.md)可单独查阅，新增页面核对见该修订UI21验收表。

该修订保留正式范围基线APS-BL-002/V2及active-baseline.json不变；最新用户优化日志含本地提交，未自动当作已合main/部署或完整UAT。实时实施仍读Project2，详细来源和差异见V2.1第15—16章。
