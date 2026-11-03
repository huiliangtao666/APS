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
