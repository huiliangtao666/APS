# 2026-11-04 交互 Issue Log

每次对话单独记录，附原始截图、解决方式及实际验证范围。跨日后另建日期目录，11月3日81条记录保留原截点。

| Issue | 问题 | 状态 | 交付 |
| --- | --- | --- | --- |
| [#145](https://github.com/huiliangtao666/APS/issues/145) | 排程结果页标题、顶部运行选择、紧凑指标及六视图单行筛选 | Closed / completed | main产品提交121a72b；18项任务级检查通过并重新构建 |

核对时间（UTC）：2026-11-03T16:12:18.450249+00:00。合成页面检查不代表真实业务UAT通过。待批准或未实施的其他CR保留原状态。

## 后续追加

- [#148 生产排程Ontology三层HTML示例](https://github.com/huiliangtao666/APS/issues/148) — Closed / completed；独立HTML生成，结构、算术、浏览器及保存/导出检查通过。交付范围为示例文件，不是应用引擎改造。

本日索引累计7条；原始参考HTML与交付HTML均未上传公开仓库。

- [#149 APS Ontology v2完整实体与实际字段](https://github.com/huiliangtao666/APS/issues/149) — Closed / completed；[说明与五张原图](ontology-v2/README.md)，48类实体、594项条目、70项行动、789条关系；22张实际输入表337字段全绑定，11项结构/字段/导出检查及浏览器核对通过。仅独立HTML示例，非新增引擎功能或真实UAT。

- [#150 APS Ontology v3业务实体与关系重构](https://github.com/huiliangtao666/APS/issues/150) — Closed / completed；[详细记录](ontology-v3/README.md)。17类业务实体、52条详细关系、22张输入表337字段保持追溯；六列全名、逐项参考对照和22项检查。仅独立HTML示例。

- [#151 APS Ontology v4 OWL关联与字段依赖](https://github.com/huiliangtao666/APS/issues/151) — Closed / completed；[详细记录](ontology-v4/README.md)。48个共享定义、52个应用、225条明确字段依赖；完整保留793条参考定义对照，31项检查及浏览器核对。仅独立HTML示例。

- [#152 APS Ontology v5五类关联](https://github.com/huiliangtao666/APS/issues/152) — Closed / completed；[本次截图与解决](ontology-v5/README.md)。逻辑止于实体，计算/日期分开，行动前提和各类边界统一列为约束；15项检查及浏览器核对。

- [#153 APS Ontology v6流程与关系连线](https://github.com/huiliangtao666/APS/issues/153) — Closed / completed；[本次截图与解决](ontology-v6/README.md)。保留17类实体及全部字段，默认字段连线，12步实际排程流程含失败/递归/重编制；18项检查及浏览器鼠标交互、保存/导出核对。
