# Workbook preview capacity

The preview projection has a bounded 128 MiB ceiling (previously 32 MiB).
Record and field count limits, 12 MiB workbook upload limit, paged response
limits, permissions, validation, fingerprints, atomic whole-batch confirmation
and import idempotency remain enforced.

Each changed row stores its source identities once. Field storage retains the
cell coordinate and absence reason for each source. Fields pages and NDJSON
export reconstruct the original source reference shape. Existing stored
projections with full field sources remain readable and confirmable.

The production and development Node heap ceilings are 512 MiB, rather than
192 MiB. This is a ceiling, not a reservation. Raising the projection ceiling
alone would leave confirmation and persistence vulnerable to memory exhaustion.
The parsing subprocess retains its separate 180 MiB limit and 60-second timeout.

Task verification includes lossless source reconstruction after persistence,
create/replace/delete and online provenance, old projection compatibility,
complete exports, a batch above the previous 32 MiB limit with confirmation and
reopen/replay, negative validation/permission/stale-version cases, and a build.

The actual reported replacement produced 13,674 changed records / 149,331
fields. Compact storage reduced its projection from 119,008,141 to 59,686,951
bytes in a read-only measurement without validation reports. The full live
preview also completed. Its separate content validation found 46 import
blockers: six demand dates outside the current source profile's day 1–43
range, and forty maximum-wait parameters whose unit is `整数` instead of `天`.
No validation was bypassed and the replacement was not committed. Supporting
a later scheduling window requires checking the planner, queries and parameter
maintenance together; changing this import guard alone would not make that
window executable. Source files, prior dataset versions and frozen runs remain
preserved. These checks are task verification, not a real UAT acceptance result.

Verification: 25 relevant checks passed. The 18,000-record mock confirmed and
reopened a 45,130,374-byte projection under a 512 MiB heap (peak RSS 454,264
KiB). The full live preview was 59,789,664 bytes, with 46 blockers. All prior
dataset version arrays and frozen run metadata matched their pre-operation
hashes; only the normal `workbook_preview` audit action was added. Build and
published HTML/assets checks passed, and production remained healthy.

Cleanup: the task-only `temp/import-december-capacity` comparison and response
copies were removed after confirming no open handles. Disposable validation
copies were removed by the platform. Original Excel, production preview/audit,
dataset history, frozen results and unrelated task files were retained.
