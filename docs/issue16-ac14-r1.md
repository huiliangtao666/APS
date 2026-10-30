# FR021 Issue16: AC14 first repair

Authority: APS-BL-001 v0.3 FR021/AC14, UAT13/14; PM delivery
`dlv_d4794107-dad6-47d0-87af-507344a32f5f`, original Issue16. Parent product
`e0be9b6dfbf9be7ce404edc1b80d8c50858ed3dc` remains immutable.

Supported-mode scheduling reports a concrete `CONSTRAINT / MAX_LAG` when a
successor's start minus its predecessor's finish exceeds the explicit route
limit. A blank value supplies no limit; zero is an explicit zero. This intrinsic
check applies even when the optional MAX_LAG switch is off. Enabling MAX_LAG
accepts an empty parameter object; the limit comes from the route, with no new
business default. The planner preserves the draft schedule and reports the
measured gap rather than promising that upstream movement is feasible.
Independent verification recalculates the gap and returns `problem`; confirmation
keeps its conservative refusal for routes declaring maximum waits.

Device rows may explicitly choose `BOM总投入` or `合格产出`. The exact
input-weight ledger remains the common basis for conserving material; output
limits are converted using the declared total yield before splitting/grouping.
Task and resource-batch ledgers expose their device's actual node and weight.
Existing CAPACITY parameter objects remain compatible; the machine's explicit
node is preserved in the frozen input and result ledger, never inferred from its
operation name. Intermediate weight nodes remain unsupported.

Before merging compatible production batches into one furnace, the planner
checks their jointly declared storage windows at that operation. A combination
that exceeds storage capacity remains separate furnaces. Scheduling then checks
actual windows against existing reservations, calendars, tools and personnel.
The original fixed program duration, per-production-batch claim quantities,
minimum-load refusal and no-overproduction behavior remain enforced. Claims are
not automatically scaled when an individual production batch is too large;
undeclared physical split/rounding rules remain outside this repair. Tool shortage
behavior is unchanged by this storage-specific grouping check.

`verify-batch-wait.mjs` is a fixed-output checker. It derives order conservation,
yield, device nodes, resource-batch capacity and waiting directly from frozen
rows without invoking grouping, planning or allocation. Existing R1 checks keep
their original output shape when frozen input is absent or minimal mode is used.

Regression command (in the application container):

```
npm test
npm run build
node --experimental-strip-types --test qa/ac14.test.mjs qa/production-batches.test.mjs qa/joint-resources.test.mjs qa/confirmation.test.mjs qa/execution-facts.test.mjs qa/dec0203-repair-r1.test.mjs qa/p08.test.mjs qa/run-history.test.mjs
```

The AC14 fixtures reproduce Test2's isolated two-operation inputs. They do not
claim the original five-stage CSV UAT, a real platform actor, release approval or
DEC04/05/06 candidate implementation. Existing historical PASS evidence stays
attached to its original SHA; independent Test must assess this new revision.
