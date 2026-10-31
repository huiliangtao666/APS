# APS branch consolidation — 2026-10-31

User requested GitHub branch consolidation and PR review/merge. The prior open-PR queue was empty at both live checks.

All 160 original non-main branch heads are preserved by merge ancestry. The manifest records each original name and complete SHA, including the newer PM BOM/PACK clarification fetched during consolidation. Only merged heads will be removed remotely after main is updated and verified. Source commit links and previous PASS evidence retain their original SHAs.

The only newly integrated product change is the previously reviewed QA request/run snapshot protection. Conflicts preserve the newer main trial refresh behavior, frozen source diagnostics, and both resource and material exports. Build, component, library, business/API and MAX_LAG impact tests passed; the initial concurrent backend process SIGKILL is disclosed alongside the passing serial rerun.

Governance merges retain keyed historical events and the newer consolidated scalar values on conflict. The v0.3 baseline is unchanged. Generated status snapshots remain byte-identical to the previous main rather than importing stale branch snapshots: the existing exporter omits archived items and expects a legacy CR schema, so a fresh full export could not complete. Live Project2 and all 61 archived original IDs were independently read without any Project writes. The merged change-register JSON, operation records and current GitHub original issues remain authoritative; PM should update the renderer separately before refreshing derived views.

No deployment, release, UAT sign-off or new business implementation is included. Restore any removed name with `git push origin <saved-sha>:refs/heads/<original-name>` using the manifest.
