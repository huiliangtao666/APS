# #50 production minute source — NOT READY

Authorization: https://github.com/huiliangtao666/APS/issues/50#issuecomment-6577598908
Event: dlv_13b4162c-9de4-447d-a5e5-c0f15ee0fe08:r1.
Base main: c5f01642b92ac765beed3d7c8caa0d2f28d33620. Source owner APS-Test; sole main writer APS-Dev.

This is an unverified source draft, not an integration or release candidate. The first authorized finite input check recognized both private V2 workbooks with no parser issues (181 definitions, 4862 instances; all V2 production tables). The subsequent dataset preparation/clone exhausted Node's 192MiB heap and exited134. The runtime was stopped under the first-OOM / one-round contract. No second execution, dependency install, build, candidate start, browser, actual run or QA occurred. Do not infer successful import or minute scheduling from parsing.

Source introduces optional V2 schema fields/tables while retaining historical day data, explicit minute parameters, a strategy in the existing planner, independent minute resource/supply verification, frozen read/export routes, and six view components. P-first can establish a parameter-only version; required production inputs must remain incomplete until B is imported. The existing CP016 expression-bound blocker discovered by #45 receives a source-level correction because #50 needs the same parsing path; this has not been functionally validated and does not close #45's issue log.

Remaining work: eliminate or bound full-dataset cloning/amplification during B/P preparation and re-evaluation; validate readiness, P priority/both orders and P-only updates; validate resources, material conservation, WIP, conversion identities and day history; typecheck/build the source; complete actual minute runs and same-candidate UI/reopen/export evidence. The E3 component currently exposes load rows but still requires the requested heatmap; chart metadata-column preferences and result query filters across all six views need runtime review. No assertion beyond the parser observation is marked PASS. Synthetic regression cases are supplied for the next explicitly scheduled execution; they were not run after the OOM.

Do not integrate this branch as a passed product. Preserve the fixed source so PM/Dev can arrange a single concrete continuation without losing the original failure or resetting budgets. No raw private workbook or complete dataset is committed. Old evidence and old runs remain associated with their original versions.
