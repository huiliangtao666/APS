# 基础默认 / CP-SAT 可选：源码候选待原窗功能验证

唯一卡 [#141](https://github.com/huiliangtao666/APS/issues/141)，原 delivery
`dlv_592a29cf-12e3-40f5-b8d3-dfbb0db6ba0d`，本次续行
`dlv_6d61fe25-0f89-44b9-ac38-d47de288fd9e`，结果沿原 event 修订 r2。
有效合同 [6622191393](https://github.com/huiliangtao666/APS/issues/141#issuecomment-6622191393)。
Dev 保唯一整包开发、自测、自修及 main 串行整合责任；一个原分支 `dev/aps-current`、原 worktree。

**当前为未验证源码候选，source_done=false / functional_done=false，BLOCKED / NOT_READY。**
本轮只做源码、静态语法/路径/差分核证；SOL01—24 功能断言全部 NOT_EXECUTED。
没有把 AST、人工例或依赖回执 schema 当功能证据。没有合 main、build、类型检查、HTTP、browser、
solver、Worker、install、pull、preview、部署或发布。#140 的 Test 重窗保持；#147 Done 和旧 PASS 留原 SHA。

## 冻结输入、数量义务与真实求解

`workbook-compiler.mjs` 从现有冻结数据及 `refreshDerived / selectionDataset / supplyReadiness` 准备所选范围。
使用第二 P/在线/trial 同源有效参数投影、完整需求及递归 BOM、质量/效期批次、既有在途/采用草稿、
WIP 原物理保留及剩余待投、插单已耗/锁定/执行事实。它没有调用基础排程器，也没有先筛出能排成功的任务。
工序/资源候选、日历、停机、实体工具组合、首尾人员、工装后延、重量共享、日投产量和有向清洗均来自源行。

`exact.mjs` 使用原有有理数算法；从同量纲源数值及 BOM 比例构造可追溯的整数表示，拒绝不能安全表达的数量/系数。
不截断 kg、不改变原值或补量。包材仅按既有逐工序组规则向上取整，不按任意分批重复取整。
`workbook-model.mjs` 对身份、来源、量纲、数量上界、系数、候选及引用做内部校验；客户端不能提交模型或覆盖声明。
当前独立日模型/日粒度仿真补充路线拒绝 CP-SAT，并定位实际 profile；不能静默转换成粗时间模型。

`workbook_cp_sat.py` 是真实 OR-Tools 9.15.6755 的分钟工作簿内核：

- 原生决定生产量、批次数量分配、候选设备/工具、分钟时点、批次物料流和部分未排；不先运行基础引擎。
- 各工序组数量相等，制造产出只覆盖实际分配及保护量，不超产凑批；非插单沿逐需求整条保留/撤销，插单保净量部分结果。
- 前序、最小/最大等待、固定连续工时/按量整数分钟、班次、已知停机、人员峰值、实体工具及后延、设备共享重量和日量为硬约束。
- 物料按实际投料分钟检查放行/质量/效期/交付余保、累计余额及 FEFO；原已投/锁定数量不按比例推测或重复扣料。
- 清洗取同设备最近已结束前序的有向源规则；共享设备保留现有零产品重量清洗口径，同时约束清洗时段、班次、停机及前序班组人员，不强改独占。
- 单 native search worker，按冻结的既有需求/插单优先次序选择搜索分支；完整覆盖剩余变量，排序不变成工序先后硬条件。无 minimize/maximize、业务权重、最短工期默认或自动回退。完整请求/原始状态/候选/版本须对账。

上述是源码内容，未证明其在真实肉食品数据上正确或容量可用；须原 owner 获准后执行并自修。

## 结果解码与双重检查

`workbook-checker.mjs` 从 assignment 重建需求净量、工序组数量、BOM、批次余额、FEFO、保护事实、
日容量和有向清洗，不相信原生返回的组汇总/可行标记。`workbook-decoder.mjs` 输出现有任务、工序谱系、
资源、投料、需求、具体未排和来源结构；随后仍调用原 `verifyWorkbookPlan`。
检查失败、关键未验或交付/检查超过总预算均拒绝采用，不因原始 FEASIBLE/OPTIMAL 绕过。
原 checker 对无后续工序 WIP 的效期计算补入其显式 `completeMinute`，避免空 finals 产生负无穷；未运行复验。

## 既有入口与生命周期接缝

`run-service.mjs` 复用原工作簿 `workers` Map/容量门。CP 由应用进程持有本次 native child，
不放进可被直接终止的 JS Worker；只信号该 child handle，close 后释放槽。取消记录与实际释放分开，取消后不采用晚到候选。
基础路径仍运行原 Worker；新记录增加真实求解来源，旧 run 不回填版本/hash。

A3 `InputData / SolverChoice` 的本次选择只保存在当前 React 试算状态，新建为基础；步骤往返保留，
修改引擎、时长、范围或配置使 token 失效。后台 token 再核同版数据、参数、选择、预算、环境和编译模型；
显式非法值拒绝，省略兼容基础。插单入口补同一选择/就绪及实际执行接缝，不改其事实/批次原流程。
新运行保存 solverConditions、实际 solver、原始状态/停止原因和独立检查；运行列表/重开展示真实来源。
原 CSV 导出增加同源求解记录，`solver-export` 可导出无候选/异常的冻结来源；比较按冻结条件指出差异，
保留每需求数量/未排/交付、任务/资源、分配和耗时，不承诺 CP 更快更优。

## 平台依赖和构建资产

`environment.mjs` 仅读取应用侧 `APS_SOLVER141_ENVIRONMENT_RECEIPT` 指向的已核供给回执。
未提供时明确不可用；不尝试 Python/apt/pip、拉镜像、探测他人应用或借 SDK。
回执须有原生导入核验、环境 hash、解释器绝对路径、预算来源/版本、交付/检查预留及受控 IO/停止限额；
当前总上限来自原运行槽 90000ms，不能由客户端或回执提高。没有为预留猜数值。
预算扣除本次模型准备耗时；独立检查未在总预算内完成时不采用候选。
生产 build 脚本增加复制两个 Python 内核至 `dist/solver-choice`，source 与 bundle 的 runner 路径分别解析。
此处只是源码，不代表构建目标或平台依赖已经供给。

[dependency-plan.md](dependency-plan.md) 保原供给阻断。当前 retained app 无 Python 的历史核读不推成当前容量检查。
实际安装/原生调用仍未获本轮许可；原 600 秒未使用，不继承 #147 或 #140 余额。

## 文件归属与后续同 owner 闭环

Test 当前 #140 只持重窗；两共享入口已于 [6620959345](https://github.com/huiliangtao666/APS/issues/140#issuecomment-6620959345)
归还 Dev。本次独立目录和窄共享差分在原 Dev 分支串行编辑，未触 Test simulator 目录或改其实际 worktree。
保 #147 cache/reader/source-copy、#140 MPS、#146 simulator 和 #67 插单后继；共享 runtime/入口新增代码尚未影响复验，
相关旧 PASS 不迁签新 SHA。没有盲合 main、历史分支或覆盖旧整文件。

原 owner 在平台供给与 fresh 明确运行窗就绪后连续完成类型/build、真实 native、肉食品同范围双引擎、
页面/HTTP、取消/槽、保存重开/导出比较及必要影响自测，自修范围内实际问题；功能门满足后再 fresh 核源、
精确普通 main 整合。当前未派新 QA/权限测试，产品 FAIL/修复轮次新增 0。

官方 API 仅只读核查 [v9.15 Python 源码](https://github.com/google/or-tools/blob/v9.15/ortools/sat/python/cp_model.py)，
包括可变区间/cumulative、整数除法、min/max equality 和 hint；不是安装或引擎执行证据。
