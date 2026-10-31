# APS branch consolidation — 2026-10-31

User requested GitHub branch consolidation and PR review/merge. The prior open-PR queue was empty at both live checks.

All 160 original non-main branch heads are preserved by merge ancestry. The manifest records each original name and complete SHA, including the newer PM BOM/PACK clarification fetched during consolidation. Only merged heads will be removed remotely after main is updated and verified. Source commit links and previous PASS evidence retain their original SHAs.

The only newly integrated product change is the previously reviewed QA request/run snapshot protection. Conflicts preserve the newer main trial refresh behavior, frozen source diagnostics, and both resource and material exports. Build, component, library, business/API and MAX_LAG impact tests passed; the initial concurrent backend process SIGKILL is disclosed alongside the passing serial rerun.

Governance merges retain keyed historical events and the newer consolidated scalar values on conflict. The v0.3 baseline is unchanged. Generated status snapshots remain byte-identical to the previous main rather than importing stale branch snapshots: the existing exporter omits archived items and expects a legacy CR schema, so a fresh full export could not complete. Live Project2 and all 61 archived original IDs were independently read without any Project writes. The merged change-register JSON, operation records and current GitHub original issues remain authoritative; PM should update the renderer separately before refreshing derived views.

No deployment, release, UAT sign-off or new business implementation is included. Restore any removed name with `git push origin <saved-sha>:refs/heads/<original-name>` using the manifest.


The final candidate also incorporates concurrent main e603e8f, preserving its B15 lossless input binding implementation. Its new original-data tests were initially blocked by missing local fixture files; all 114 CSVs and six scene JSONs were recovered from the exact uploaded v0.3 ZIP, with byte/hash provenance recorded. The final lossless run passes35/35; all201 backend/impact case identities pass across the same-source runs. Library115/115 and UI6/6 pass, and final TypeScript/Vite/API/Worker build completes.

One existing FR026 regression compared current canonical inventory rows to pre-import rows without the newly added optional columns. It now first verifies every raw inventory fact after import, then freezes the complete accepted inventory and requires byte-equivalent data after both trial paths. Material shortage325/25, allocation equality, 425-stock improvement, and current-stock preservation assertions remain intact. No product behavior was relaxed to satisfy the test.
