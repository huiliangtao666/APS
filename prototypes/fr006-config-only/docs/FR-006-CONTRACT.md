# FR-006 工装配置字段与接口契约（基础版）

状态：配置 CRUD 已在独立副本实现；占用计算、服务端 API 和跨用户数据尚未实现。DEC-02 未批准前，本契约不得被解释为排程资源约束。

## 记录字段

CSV 表名：`18_工装配置.csv`。字符编码 UTF-8（可含 BOM），首行为字段名；逗号分隔，带逗号或双引号的文本按 RFC 风格双引号转义。

| 字段 | 类型 / 约束 | 含义 |
|---|---|---|
| 工装编码 | 字符串，必填，表内唯一 | 工装稳定业务编码；保留大小写，比较时去首尾空格 |
| 工装名称 | 字符串，必填 | 展示名称 |
| 适用任务 | 字符串，必填 | 当前约定填写工序编号；多个编号用 `|` 分隔，如 `MIX|FILL` |
| 可用数量 | 正整数 | 配置可用的工装数量 |
| 每任务需求数量 | 正整数 | 一个适用工序任务所需数量 |
| 提前占用分钟 | 非负整数 | 仅原样存储与展示；基于何种任务边界的提前量待 DEC-02 |
| 后延占用分钟 | 非负整数 | 仅原样存储与展示；“归还”语义及边界待 DEC-02 |
| 是否启用 | `是` 或 `否` | 配置生命周期标记；“是”当前也不意味着排程启用 |
| 说明 | 字符串，可空 | 人工备注 |

区间边界、同任务多工装、适用任务的稳定主键（工序编号或订单-工序实例）、冲突处理与“可用数量”作用域仍待 DEC-02 / 产品决策。

## 当前 UI 行为

- 查询：对当前表所有字段作不区分大小写的子串查询。
- 新增、编辑、删除：前端表格操作，保存在 `localStorage` 的 `aps-fr006-foundation-data-v1` 键中。
- 导入：字段表头必须齐全；工装表额外验证必填值、唯一编码、正整数数量、非负整数偏移和启用值。工装表任一行失败则拒绝整批，保留现有数据。
- 导出：当前表全部数据按 CSV 转义规则下载，首字段带 UTF-8 BOM。
- 非工装表保留现有原型导入行为；不代表它们具有同样严格的校验或持久化保证。

## 后续服务 API 建议（尚未实现）

待确认后可由服务端提供：

- `GET /api/tooling?code=&task=`：分页查询工装及适用任务。
- `GET /api/tooling/{toolCode}`：读取单条。
- `POST /api/tooling`：创建；重复编码返回 `409 TOOL_CODE_EXISTS`。
- `PUT /api/tooling/{toolCode}`：更新；变更编码建议通过显式迁移操作，不复用 PUT 隐式改主键。
- `DELETE /api/tooling/{toolCode}`：删除；未来若有排程引用，应返回 `409 TOOL_IN_USE`，具体保留策略待定。
- `POST /api/tooling/import?mode=validate|commit`：预检返回行号、字段、错误码；commit 采用整批原子写入。现有前端只做本地校验，未实现此 endpoint。

建议 JSON 字段为 lowerCamelCase：`toolCode`, `toolName`, `applicableTasks: string[]`, `availableQuantity: integer`, `requiredQuantityPerTask: integer`, `preOccupancyMinutes: integer`, `postReturnMinutes: integer`, `enabled: boolean`, `notes?: string`。接口应另带 `version` / `updatedAt` 以处理并发编辑；版本策略待决。

## 安全边界

R2.1 排程读取 `orders/routes/times/machines/calendars/downtime/dependencies/rules`；本功能新表 key 为 `tools`，目前没有任何排程函数引用它。提前占用与后延归还不得用于任务开始、结束、资源冲突、可行性或目标值计算。数据未配置、未通过校验或 `是否启用=否` 时，显示“未启用 / 未检查”，不得显示“工装约束通过”。
