# FR-010 修复轮次 1

依据 canonical FR-010 原卡 Test Issue Log 与 GitHub issue #8（https://github.com/huiliangtao666/APS/issues/8），从失败版本 `753b940cc80ee17379745dab7af57c77172f8c67` 修复：

- D1：移除物料集合非空才校验的前提。已有物料引用在空主表和未知主表中均报 `INVENTORY_MATERIAL`；只有存在对应物料时合法。
- D2：有效期使用严格 `YYYY-MM-DD` 与 UTC 日期往返比对，拒绝 Date.parse 自动归一化的不可能日期；覆盖 1900 非闰年、2000/2024 闰年和月末。查询也将不可能有效期的批次可用量归零。

新增三项回归，不变更库存分配/扣减、权限或 QA 流程。普通 GitHub push 后交独立 Test 复测；开发测试通过不代表完整 AC-10/11/24 或 UAT 已验收。

验证必须在 `workspace-app-builder` 的 `app-exec.sh --validate --mode standalone --cwd /workspace/apps/aps-fr010-repair` 一次性应用容器内运行 `npm ci && npm test && npm run build`。仅在副本中将 SDK 相对路径换为工作区现有 tarball 的绝对路径，保留 integrity，不改源 manifest。
