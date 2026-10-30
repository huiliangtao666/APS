FR029 synthetic offline event samples — NOT original UAT15 mappings or MES facts

CSV schema: 28_模拟异常事件.csv. Import one sample against a compatible current synthetic dataset, not all five as unrelated overwrites. The table is the full append-only event set. Existing accepted rows must accompany later imports, exactly unchanged and in order. 需处理事实JSON is blank on new input; the server computes it. Reimport the server-returned complete set for idempotence.

Use qa/execution-fixture.mjs for the baseline fixture (seed, order A/HC40, MIX01, FILL01, EX-LOT, partial F-A-MIX at minute30, consumed40kg). Additional sample prerequisites, all explicit synthetic declarations:
- rush.csv: HC40 route/times, MIX02/FILL02, enough eligible LEAN stock (tests use300kg), dependencies in JSON. A new active formal order only; no prior order override or inferred machine.
- fault.csv: existing MIX01; fault [30,60). The partial task requires handling; its machine occupancy remains protected indefinitely until a supported reconciliation policy exists.
- absence.csv: explicit existing G personnel group. Test fixture uses one person, skill mix, shift day, availability [0,480). Entire group absent [30,90); partial absence and in-flight participation rebasing are undecided. Unstarted personnel demand can start at90; in-flight demand is blocked for reconciliation.
- material.csv: existing EX-LOT containing consumed material. Declares simulated frozen status. Completed/started facts and pre-consumption stock remain; affected task never becomes quality-passed or automatically recovered even after a later simulated good-status declaration.
- delay.csv: explicit S1/LEAN/FUTURE expected supply100kg, initial arrival/availability08:30+08, expected status预计可用, expiry2026-12-31; permit expected supply in MATERIAL and explicitly earmark100kg via supplyUses for A/MIX. Moves arrival09:00, availability09:10. Does not create inventory/receipt. Unstarted work waits until minute70; in-flight shortage blocks automatic resume.

All samples event minute30, protection cutoff45. Before importing/editing an event, explicitly update ALL in-flight facts to observed minute30, supply current usable output/scrap/remainder/cumulative material use without guessing. Completed observations must be <=30. UI CSV save submits the current full executionFacts alongside events; multi-table DataEditor drafts may update both together. API /inputs accepts both in one transaction. Missing/stale/future facts, invalid effect, unknown JSON policy/resource, invalid transition or stock overuse rejects the entire batch before revision/audit/input-version changes. Multi-event transactions must have one event time. Later event times require a separate fresh fact snapshot. Original cumulative fact guards remain in force.

Clock: minute0=2026-11-02T08:00:00+08:00; intervals [start,end). Explicit protection policy must equal 禁止未开始任务开工. Through the maximum declared cutoff, previously unstarted work cannot begin; unaffected in-flight work may continue at its declared observation/remainder. Zero-length protection is allowed at an explicit cutoff equal to event time. This conservative admission window does not freeze positions of unexecuted tasks in an older plan. Fixed-plan locks, interruption/resume/transfer/cancellation, releases and universal recovery semantics remain unsupported. Selection cannot bypass CALENDAR/full supported mode; status/delay events require effective MATERIAL. Existing execution/batch/joint/delivery restrictions remain.

Allowed JSON fields, exactly:
 插单: order (new normalized order row), dependencies (explicit normalized rows belonging only to that order).
 设备故障: machineId (existing string), endMinute (number > event).
 人员缺勤: groupId (existing string), endMinute (number > event).
 到料延期: supplyId, arrival, available (explicit timezone ISO strings; cannot move arrivals/readiness earlier or arrivals before event).
 物料状态变化: lotId (existing on-hand lot), status (待检/冻结/不合格/合格; a user-declared simulation, not QA release).
Unknown policies/keys, retroactive events, multiple event times in one batch and direct effect deletion/rewrites fail closed. Existing orders may be maintained using original APIs subject to immutable facts; event ledger removal/correction/recovery is not implemented. The historical event retains its handling implications rather than silently declaring resolution.
