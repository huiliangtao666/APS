# R2 imported scenario readiness repair

The imported R2 workbook uses WP2001–WP2005; the adopted simulation template
still maps WP001–WP008. The repair uses the new workbook's explicit product,
current operation, occupied resource, quantity, start/completion/release dates,
the unique matching product route, that route's crew/tool fields, and existing
feed mappings. It preserves historical inputs as already netted and includes
only later operations' BOM feeds. The mapping remains explicitly simulation.
The three EQ024 lots retain 500 + 500 + 200 kg and their shared interval;
repairing input completeness does not resolve that intentional conflict.

Selected-scope readiness incorrectly required box weight for all manufactured
semifinished ingredients in the day model. Box weight is required for demanded
finished products, as in the minute model; bulk ingredients still require
their actual shelf life and the day model's production lead time.

Legacy day routes omit the minimum-wait field. Both the planner and parameter
pair validator already interpret that omission as no additional waiting lower
bound. Readiness now follows that existing contract, validates an explicit
minimum, and continues requiring maximum wait. Explicit P suspensions remain
blocking; no input blanks are filled or historical snapshots rewritten.

Task checks: day/minute required fields, negative bounds, missing demanded
weight, missing maximum wait, explicit suspended P, and frozen workflow core
checks (six tests) passed, as did the build. Before persistence, the actual R2
input with repaired mapping passed both overall and Nov 1–30 scope readiness.
This is task verification with simulation data, not real UAT acceptance.

## Actual calculation follow-up

The applied mapping also removes 40 obsolete supplementary semifinished route
steps that duplicate routes now supplied by Excel, and rebinds 162 feed points
to the matching Excel product/step identities. Source business table contents
and all previous version entries/frozen runs were compared by hash and preserved.

An actual v10 run was safely rejected by independent verification: two newly
manufactured SF005 supplies had expired before their parent operation's eventual
start. Actual-feed validation checked inventory/transit lots but skipped new
production supplies because those do not live in the inventory lot array.
The calculator now derives their availability/expiry from the final production
step and the material's existing shelf life. An invalid candidate is rolled back
with MATERIAL_AT_ACTUAL_FEED evidence; independent verification remains enforced.
No shelf life, stock amount, waiting limit or capacity was loosened.

The new manufactured-input regression checks rejection and full rollback,
unchanged inputs, successful scheduling with an independently valid expiry,
and passing independent verification. All 16 affected checks and the build passed.
Read-only full-month calculation against the actual repaired input returned
12 demand records, 9,982 kg, 3 scheduled / 9 unplanned, 65 tasks, and a passing
independent check. The original failed run remains recorded; new results require
a new frozen run and do not overwrite it.

Production confirmation on implementation d626baa: input v10, simulation mapping
SIM-INPUT-SC2-R2-20261103, new run
1205fb33-825f-40dd-a239-5377064201c7 returned `partial` with 3 scheduled / 9
unplanned demands, 65 tasks, and independent verification `pass`. Scope is
2026-11-01 through 2026-11-30 inclusive. Original business tables, prior version
entries and prior frozen runs matched their pre-repair hashes. No message or
request was sent to Design. Published HTML and assets passed verification after
the calculation had completed.

Cleanup: 6,068,642 bytes of task-only comparison, mapping and result copies in
temp/wip-import-repair were removed after checking open handles. Source Excel,
production mapping, saved run inputs/results, audit and unrelated files were
retained. The platform removed disposable validation copies.
