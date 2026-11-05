# Exact integer v3 candidate — #141 r5

Status: unmerged engineering candidate. Base main is
23216f50684d774159a328d5383ff44674d2263c. Complete frozen V2 compilation
hit a new V8 192 MiB heap OOM (exit 134); STOP remains latched. No native
CP-SAT, integration, deployment, QA or UAT success is asserted.

## Representation and two-way arithmetic argument

For a nonnegative integer X bounded by U, use base B=1000 and exactly
L=max(1,ceil(log_B(U+1))) digits. X=sum(d_i*B^i), 0<=d_i<B, with the
most significant digit bounded by floor(U/B^(L-1)). The native adapter
also enforces X<=U through X+S=U with a nonnegative slack. This removes
the rectangular-digit overhang. Repeated Euclidean division by B gives
one and only one digit sequence for every X in [0,U]; positional
reconstruction recovers X exactly. Zero uses a zero digit. A negative
linear coefficient is split into negative coefficient digits; negative
business quantities are rejected, not made positive or rounded.

For sum(a_j*X_j)+k=0, expand each signed coefficient in base B. Column i
is c_i+k_i+sum(a_ji*d_j)-B*c_(i+1)=0, c_0=0 and final carry zero.
Each carry domain comes from floor(column_min/B)..floor(column_max/B)
over independent digit domains, including negative terms and carries.
Multiplying columns by B^i telescopes to the original equation. Conversely
an original exact equality fixes every successive carry to column/B;
it is an integer in the computed domain and ends at zero. Thus no modular
alias, ignored high limb, dropped sign or relaxed equality is accepted.

Inequality E<=0 uses E+S=0, S>=0 bounded by -min(E). For a nonnegative
numerator N and positive D, quotient/remainder use N=D*Q+R,
0<=R<D. Existing whole-minute ceil and group package ceil retain
(N+D-1)//D, without changing source quantities. All source six-place
BOM strings, qualified-output ratios, losses, source P and original
quantity lattices remain unchanged.

Every emitted primitive native variable, coefficient and full independent
linear activity must pass signed int64 bounds in the Python adapter.
Big integers remain in adapter arithmetic; native variables are digits,
small carries, times or flags. This source guard is not a claim that
native model validation has run. The JS certificate is reproducible from
quantity terms and column/domain bounds, with hashes of expanded rows.
The final streaming verifier changes were not rerun after STOP and the
full native variable/row census remains unverified.

## Shared weight resources

Independent cumulatives on individual digits are invalid: active-set
carries change the total. The candidate instead checks the entire exact
sum at each active interval start using flags for presence and
start_j<=start_i<end_j. Optional intervals and half-open endpoints remain.
With nonnegative weights, an occupancy increase occurs only at a start,
so these event checks and the original capacity condition are equivalent.
Zero duration contributes no active weight. This reference argument does
not assert native build/runtime validation or performance.

## Versioned protocol and compatibility

Safe nonnegative integers remain JSON numbers. A value above 2^53-1 is
{"contract":"aps-exact-integer:v1","value":"canonical decimal integer"}.
The implementation has an explicit 256-decimal-digit structural limit;
exceeding it is an unsupported representation, never precision reduction.
Bare strings, noncanonical/negative/unsafe numeric carriers, extra fields
and unknown versions are rejected. Only enumerated quantity fields accept
the carrier; time fields retain safe-number semantics.

Workbook v3 declares integerProtocol (base 1000). Candidate v3 has its own
contract; the adapter reconstructs exact integers from native digits before
encoding a candidate. JS compiler -> JSON -> Python decode_model/ExactModel
-> candidate encoding -> JS decoder -> exact independent checker and existing
business checker are wired in source. v2 safe-number models stay supported.
Input rows and historical runs are not migrated. Output business quantities
retain their existing numeric display plus exactQuantity rational fields;
new plan metadata records protocol/model identity. Persisted manual v3
model/candidate/plan round trips were checked, without claiming a solver
produced the manually constructed candidate.

## Evidence and limits

The finite reference enumerated 6480 signed small-domain equation cases
at bases 2,3,10 against direct integer arithmetic. Safe/int64 boundaries,
wire damage and negative carriers were checked. Twenty legacy directed
checks and the v2 manual decoder/business checker passed. The v3 manual
candidate passed its model/business checker, JSON persistence and twelve
negative cases. Python changes have AST-only validation; target Python,
OR-Tools adapter construction, validate, solving, original statuses,
stop/cancel and fair two-engine comparison have NOT_EXECUTED status.

The complete frozen original input hash is
5a4a72eb97b907b52900f7a67c019def7c743220807c19f2cb72a8d235aa927e.
The unchanged source retains 140 materials, 317 BOM, original 2150 demand
rows and 9292 parameters; selection [day1,day2) resolves 50 demands and
8736 selected configuration rows. A precompile structural estimate found
150 demand manufacturing groups, <=635 demand tasks, eight extra WIP groups
and up to ten quantity limbs. This estimate omitted the retained certificate
and validation copies and did not prevent the real full-compile heap OOM.
No complete v3 model was emitted; no complete readiness call followed STOP.

Required remaining work belongs to the same #141 owner: bound memory for
certificate generation/validation/serialization (stream or avoid retained
copies), verify the full compiler and all affected protocol consumers in
an authorized fresh window, review the complete native row/cumulative
certificate against the actual adapter, then integrate only after every
applicable gate passes. No new business precision or user default is needed.

## Incremental certificate and JSON transport

`aps-limb-bounds:v2` retains the same base1000 lowering and expression order as
v1. The model carries `expressionCount`, complete row/domain counts and the
SHA256 commitment of the JSON array of **every** v1 expression entry, rather
than retaining that full array in the process heap. Validation regenerates all
expressions and compares every count and the rolling commitment; a missing,
unknown, changed or truncated certificate fails. Existing v1 certificates are
still checked entry by entry. `certificateSink` receives each complete entry
and its full digit variables and expanded rows before it is released. The
finite evidence producer writes all of them, and an independent reader checks
all coefficients, rectangular domains, signed carries, constants and int64
activities and hashes; there is no proof-row sampling. This is a certificate
of this JS arithmetic expansion, not a claim that target OR-Tools emitted or
validated a model. The real Python adapter still checks every row and variable
it actually emits; its target runtime remains NOT_EXECUTED until provisioned.

Hashing preserves JSON.stringify property order and bytes using bounded small
subtrees and incremental updates. Bounded file serialization uses the same
order. The ordinary JSON model and quantity carriers remain supported by the
Python consumer; no numeric strings replace declared minute/identity fields.
A CP-specific private copy shares immutable strings while detaching every
mutable object/array. The selected projection is checked directly rather than
selecting/copying that projection a second time. Original B/P source, parameter
semantics, full WIP closure, precision and the business checker are unchanged.
Optional synchronous diagnostics run before large allocation boundaries and
sparse expression expansions; production compilation does not install hooks
or force GC. Finite frozen-model evidence is distinct from native feasibility,
solution statuses, stop/cancel and fair engine comparison, which remain untested.


## 2026-11-05 用户自测交版：小域原生资格与紧凑清洗

沿原 #141 / `dlv_592a29cf-12e3-40f5-b8d3-dfbb0db6ba0d:r8`，最新用户合同为 #141 comment 6647481206；基础求解器默认及已有访问控制不变。本提交只吸收已受测的紧凑有向清洗实现，按设备对每个任务的结束/开始事件建立 inverse/element 排序簿记，不串行化重量共享生产。保最近已结束前驱、同 end 原成员优先、可选/多 option、seed、清洗分钟/前 crew/日历/stop 与原清洗结果身份。

官方 standalone 独立容器真实导入 CPython 3.11.18 / OR-Tools 9.15.6755，解释器资产 SHA256 `ecf28575cd67fa7a53c7bf2355bae5cff2c496efeb51780d50a8b54441cdce74`，沿原 11-wheel 锁 `ac80eae45c3b15a60dbf4acc900bf0a9ceed9be728227a19eb370670eaded533`；私有 prefix/venv 不是现有应用或系统安装。7 个真实小域前驱用例、17 分钟/10kg native OPTIMAL、61 分钟任务在 60 分钟窗 native INFEASIBLE，以及工作簿 v2/v3 实际构模、validate、发射域/线性行 int64、decoder/独立业务 checker、保存导出均通过。v3 正向受控用例固定三组数量，原生给出 P1→P2 三分钟清洗及三条完整需求覆盖。未固定数量用例允许真实部分排程；OPTIMAL 仅表示声明的可行性目标，不表示最大覆盖。

这些检查只证明上述小域资格。完整冻结 V2 的 native 构造、validate 和求解仍 NOT_EXECUTED；旧 11b 保守变量界不构成全量放行，未启动完整 V2 native。私有环境未接入应用级 environment receipt，当前部署及其可选求解器可用状态没有因此变化；缺少真实环境回执时仍由现有功能明确报不可用，不暗回退。浏览器、发布、旧实例生命周期及真实现场联动未执行。原冻结 V2 JavaScript 编译/证书证据保原 SHA，不迁签为 native 全量 PASS。

同次串行交付的 #67/#146 保既有路径：#67 样本 CP137=0、CP047 小数字优先仅限用户批准样本，原 P/全局默认不改；其 43 天全剩余工作短重排在工具调用时限内未交付结果，状态是工具超时/结果未可靠交付，不是业务无解。#146 A 工程 Done 保留，现场事实及 B 继续分列。详细源→main 身份、每卡独立耗时与可读原件由本次根目录交付报告给出。
