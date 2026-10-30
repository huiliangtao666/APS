# P10 explicit policy implementation contract

Authority: live Issue3 user authorization https://github.com/huiliangtao666/APS/issues/3#issuecomment-6517574515 ; v0.3 plus effective CR-DEC02-03-20261029. FR007 original card PVTI_lAHOFM9WU84BpE1czhEHgjs and FR022 PVTI_lAHOFM9WU84BpE1czhEHg1o in Project2 https://github.com/users/huiliangtao666/projects/2 . Live authority bytes accompany this delivery. Original delivery dlv_ecd21100-39b1-474a-961f-f47295eec254; platform continuation dlv_082bf2e1-8fff-432e-99b5-e5c13d6da46b, result r1. This is execution retry, repair round increment 0.

## Explicit schema and arithmetic

No production identities, headcounts or strategies are seeded. Synthetic fixtures are marked as such. New active physical pools require explicit P10-explicit-v2, policy source, capacity source and all enum choices. UI starts with an empty choice. Existing legacy P10 core stores require explicit completion before new runs; saved historical runs keep their original core interpretation.

| Field | Allowed value and meaning |
|---|---|
| poolId | stable 1–64 character identity; retired identity cannot be reused |
| 总人数 | positive safe integer people; one physical capacity, never inferred from group sums |
| 允许共用 / 互斥粒度 | 是 / 无互斥; 否 / 人员组互斥; 否 / 工序互斥 |
| 人员组互斥 | at most one group identity active per pool at any instant, including roles inside one operation; same group may serve concurrent tasks if capacity permits |
| 工序互斥 | at most one operation/resource-batch owner active per pool; distinct roles within that owner may use different groups subject to capacity |
| 交接模式 | 不设交接限制 requires three numeric fields blank; 窗口容量上限 requires explicit start/end/cap |
| 交接起始分钟 / 交接结束分钟 | integers 0–525600, start < end, fixed plan minute axis, [start,end) |
| 交接容量人数 | safe integer 0..总人数 people; replaces available capacity inside the window, never an extra demand |
| 占用策略 | 依赖声明 respects explicit per-demand windows and retain flag; 全工序保留 overrides release and retains [task.start,task.end) |
| 释放策略 | 半开端点释放 only; endpoint reuse legal |
| 策略来源 / 策略版本 | explicit explanation and P10-explicit-v2; actual actor/role/reason and before/after version recorded by trusted server audit |

At every demand, reservation and cap boundary t: sum of active claims mapped by frozen group→pool must be <= Cpool(t); each group separately obeys its qualification limit. Cpool(t)=explicit handover cap inside [a,b), pool total elsewhere. Skill, directional substitution, shift and available windows continue to constrain each group. No duplication of physical pool capacity. Different candidate pools with incompatible occupation policies reject at the dependency CSV/row/field.

Worker freezes current input, resource policy fingerprint, effective evaluation timestamp and P10-explicit-v2. Independent checker reconstructs windows, membership, demand coverage, capacity and mutex from that snapshot; it does not invoke allocator or trust ledger pool labels. Explicit snapshots cannot be downgraded to core contract. Forged overlapping claims and truncated full-operation occupation fail verification.

## Product paths and validation

Data & CSV → physical personnel pools/personnel groups → modify explicit fields → candidate personnel preview plus full joint schedule preview → save → reload/reopen → new calculation. Draft changes invalidate prior preview and require re-preview. The local personnel preview is labelled as one candidate operation with no reservations; server POST /api/inputs/resource-policy-preview supplies the complete before/candidate joint schedule, claims, fingerprint, role and independent resource verdict, with no persistence. It shares existing input validation, history transition, revision, trusted permissions and execution admission guards. It is a business preview endpoint, not an agent communication endpoint.

Planner can preview/save/run with reason; query role sees read-only fields. Missing/unknown/contradictory/range-invalid settings reject before writes including audit, with CSV/row/field. Stale input rejects 409; unauthorized role rejects 403. Legacy plan/confirmation/execution records are not migrated or reinterpreted. Revert to prior code only with compatible explicit input policy handling; do not delete or rewrite business stores to roll back.

## Unsupported modes and scope

UI visibly marks extra handover demand by sum/max, automatic shift anchoring, individual qualification intersections, cross-line joint scheduling, cross-run production reservations and mixed candidate occupation policies as not enabled; enum/API validation rejects unsupported input. One absolute handover window per pool is supported. No attendance or individual roster. Search limits retain prior truthful search-not-found semantics. Preview is bounded synchronous calculation and does not prove global optimality.

This delivers a bounded CR slice; FR007/FR022/full CR remain NOT_READY pending independent Test and other original outstanding assertions. Test1 S-P01..10 and Test2 H-P01..10 prep remain at original reference SHA; this Dev matrix does not map unknown external aliases or sign their conclusions. Reading their files returned 403 (workspace token cannot act for another workspace); PM retains those accessible originals and must map aliases to this exact schema before dispatch. No Test dispatch, QA signoff, main merge, release, DEC04–06 implementation or Design contact occurred.

## Reproduction and evidence

Fixed parent 7ae4ca827276c66b276c4cc32a4593825ee2623f, own branch feat/issue3-p10-explicit-config. Run P10_REPO=<absolute fixed checkout> P10_OUT=<new absolute evidence directory> bash qa/p10-explicit-container.sh. This uses an isolated aps-fr038-qa-runtime image (digest in evidence/runtime-image.json), copies source, uses isolated temporary business stores and parent archive; no host dependency install, live app start or release. The runtime image is local infrastructure, not a published product. Independent Test must obtain source from GitHub and prepare its own environment; dev fixture uses synthetic actor middleware, not live managed login.

Continuation verification: targeted 65/65; regression 59/59; npm test library phase 92/92 and auth/business phase 124/124; build successful; browser 4 real Worker cases, zero page errors; two exact-parent upgrade cases complete. Counts overlap and are not a unique acceptance total. Full logs, original JSON and screenshots accompany matrix.csv. 139 executed src/server SHA256 entries match delivered files; tested-change-sha256.json additionally binds all changed code/harness files. Old incomplete evidence is preserved in APS-Dev temp/p10-explicit; final continuation evidence supersedes it for this delivery.
