# 基础默认 / CP-SAT 可选：实施中的独立源码

唯一卡 [#141](https://github.com/huiliangtao666/APS/issues/141)，本次合同
[6621274864](https://github.com/huiliangtao666/APS/issues/141#issuecomment-6621274864)。
原 delivery `dlv_592a29cf-12e3-40f5-b8d3-dfbb0db6ba0d`；唯一开发、自测、修复及串行整合 owner APS-Dev。

**当前不是源码Done或功能交付。** 独立kernel/服务适配和UI组件均未运行、未挂入用户入口、未合main。
所有 SOL01—24 功能断言 NOT_EXECUTED；包级 BLOCKED / NOT_READY。
没有以禁用CP-SAT满足本卡完成门，也没有将模型例子或状态注入当作产品证据。

## 原件及业务版本

`v0.3 + CR-SOLVER-CHOICE-20261103（已批准实施，产品未生效）`。
Dev自身upload原ZIP 17250 bytes，SHA256
`1d7ac2fe67274d136862af67bc5d93ac6a15559082457ce9846a0b39247cc5f4`。
CRC和06清单内五文件hash已核；设计原件保留，不将ZIP公开进仓库。
原第二P优先、分钟生产/按天需求供给、现有数量/批处理及事实保护语义保留。

## 已写入的独立实现

- `server/solver-choice/contract.mjs`：仅省略字段兼容基础；显式非法拒绝；预算来源、交付和checker预留必须明确；无损十进制缩放及溢出拒绝；原始状态、业务覆盖和检查分开；历史未知不补写；同条件比较。
- `model.mjs`：内部标准化分钟模型，冻结指纹、必排/有据部分策略、前序与等待、固定事实、联合资源/日历/释放尾段、批次投料、日投产量、有向清洗声明与保留区间。不是可直接替代工作簿输入的公共API。
- `cp_sat.py`：真实OR-Tools 9.15.6755，整数分钟域、可选设备、cumulative联合占用、有向清洗circuit、物料批次整数分配和制造供给前序、显式必排及总量。无minimize/maximize/隐藏权重，单native worker；只有真实solve返回原始状态及可靠候选。
- `checker.mjs`：从模型和返回assignment独立重建占用、物料余额、投料时点、前序、锁定、清洗及覆盖；不相信求解器缓存或状态。它不能代替现有工作簿独立业务checker。
- `runner.mjs`：仅在原运行槽owner中持有原生子进程；取消/总保护超时只信号本次child handle，close后才报0owned；未知退出/不完整结果不造FEASIBLE，不自动回退。
- `workbook-service.mjs`：冻结和执行接缝，基础实际调用原calculateWorkbook；CP只有内部compiler/decoder具备后执行；两路仍须原verifyWorkbookPlan通过。**尚无compiler/decoder实现，未注册router。**
- `src/SolverChoice.tsx`：受控选择及真实来源组件，不读写全局/缓存偏好；**尚未挂入A3或历史结果。**
- `qa/solver-choice*`：契约、独立人工例的反例检查及显式准入后的native测试源码；全部未执行，native例也不能代替肉食品主链。

## 同owner待收齐

1. 从现有工作簿BOM/FEFO/批处理/批准精度、P生效、WIP续作及插单保护提取共享准备层，产出可审计的数量/任务义务与完整CP模型；禁止以基础求解器先成功安排的任务集代替完整义务。工作簿结果decoder必须保工序、各类资源、投料、未排及来源。
2. 重量共享设备的并行与有向清洗组合、日内放行/效期、批处理/等待和执行事实必须同义接入；当前kernel的有向序列只覆盖独占资源，不能把共享资源强制独占或漏清洗。
3. A3本次状态/检查key和后台就绪token绑定选择/预算/配置来源；创建前重核真实可用性。独立模块不应直接接受用户模型或覆盖声明。
4. 原run槽/终态取消和actual engine对账；原保存/重开/原生导出/比较贯通；历史原hash不改。CP无解记录与执行异常分别留存。
5. 获窗口和精确依赖环境后，由同一Dev完成有界真实native检查、现有肉食品双引擎主路径、同一独立业务检查、页面/HTTP/持久化导出及影响自修。当前没有任何一项可以转签PASS。

依赖和安装协调方案见 [dependency-plan.md](dependency-plan.md)；逐条预期与实际见 [acceptance.csv](acceptance.csv)。
必要功能自测通过后才fresh核main/source/父/merge-base和精确交集，再按合同串行普通整合。
#147运行收口优先；本次不部署/发布、不改保护环境或Test simulator独立目录。

## 官方核实

引擎整数/五状态及Python接口来自 [CP-SAT官方指南](https://developers.google.com/optimization/cp/cp_solver)、
[v9.15官方Python源码](https://github.com/google/or-tools/blob/v9.15/ortools/sat/python/cp_model.py)。
[官方安装说明](https://developers.google.com/optimization/install/python/binary_linux)建议隔离venv。
Job-shop示例的最短工期目标不是本应用默认目标。
