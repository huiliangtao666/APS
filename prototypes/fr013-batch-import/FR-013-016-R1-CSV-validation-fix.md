# FR-013/016 R1 CSV 校验修复交接

日期：2026-10-28
范围：仅更新 FR-013/016 R1 隔离实现；未改动 R2.1 主预览、绑定或发布状态。

## 修复

- CSV-DEF-01：`合格需求kg` 为空或不大于 0 时，报告订单行 `合格需求kg` 并阻断批次。
- CSV-DEF-02：`计算方式` 为 `固定` 时，`固定分钟` 为空或不大于 0 时，报告工时行 `固定分钟` 并阻断批次。
- CSV-DEF-03：`是否启用` 为空或不是 `是` / `否` 时，报告规则行并阻断批次。
- CSV-DEF-04：CSV 解析保留每条记录的起始物理行号。带引号字段内换行后，后续记录的列数、字段、重复键和引用错误继续使用文件物理行号。

## 回归用例与容器验证

验证运行于 APS-Dev VM 所连接的应用容器，QA 项目路径为 `/workspace/qa/aps-r1-fr013-016`。容器内先安装依赖，再执行：

```sh
npm test && npm run build
```

结果：CSV 回归脚本通过，覆盖六表合法批次及 CSV-DEF-01..04 四项缺陷；TypeScript 检查通过；Vite 生产构建通过（39 个模块）；esbuild 服务端生产 bundle 成功。

验证副本中的 `--validate` 只读快照运行回归脚本通过。尝试在该快照运行 `npm install` 时，因快照不包含工作区 `.praetor/sdk`，项目 `file:../../.praetor/sdk/*.tgz` 本地依赖无法解析；生产构建因此改在隔离 QA 项目的应用容器运行时执行。没有在宿主机安装依赖或构建。

Build 有一条既有 CSS minifier 警告：`Expected identifier but found '-'`（生成输入片段 `-: .TZ;`）。Vite 和 esbuild 均以退出码 0 完成。npm install 报告 4 个依赖审计告警（3 moderate、1 high），未运行自动升级。

## 验收边界

本轮完成源码级回归与容器生产构建，不代表浏览器 UI 导入验收。APS-Test 仍需在 UI 验证问题展示、确认按钮阻断、失败批次原数据不变及有效批次导入。

## 交付文件

- `FR-013-016-r1-isolated.tar.gz`：更新后的隔离源码包，新增 `verify.mjs` 和 `npm test` 命令。
- `FR-013-016-CSV-CONTRACT.md`：补充三项空值强制规则和物理行号定义。

SHA-256（隔离 tar.gz）：`2c237bef04eb61de24ba3fff42da766871c75c328e50b53584a2e6c5e153dd04`
