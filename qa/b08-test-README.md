# B08 personnel domain development and task selftest

Issue37, event dlv_0f5baaf3-a8c1-45fa-b5fe-3c26a771cee1:r1. Base80841247ac91cae193a452325097234f31e6609e. APS-Test owns personnel-occupation/resource-conflicts/resource-workbench and qa/b08-test-*; APS-Dev owns configuration/UI/API and final nonmain integration. No main merge/publication/UAT signoff.

Product changes expose independent full actual personnel-window findings with task/config/interval references and physical pool membership. Both H-P04 processing orders still require final actual window availability, single shift and stop checks. Task sources follow explicit original06 mappings to pool/group/skill/calendar/stops/MOCK ledger; structured failure context supports unscheduled tasks without invented geometry. CSV physical row/hash is shown only when frozen canonical row matches. No business default or new schema.

Use controlled B2 UAT08 original25 files retrieved via authorized APS-Test Files API, not the older root stage-only ZIP (08/09/12/13/15 differ). Raw06 SHA256 fb1a1a5c07ab5adeab29c06afcc0502e9d1b01504ad75b77bbd5cd61e517178a; raw12 ec6703aee5197dbaef1b3f45071d7e768a8c53af7df3b6f520bc1024c97c81ce. Put originals under $B2_INPUTS/UAT-08. No originals uploaded to GitHub. Final delivery ZIP includes source originals and per-file manifest.

Run within an isolated application container, never install/start the app on the VM host. Node22.23.2, committed npm lockfile and local Praetor SDK tarballs required. Configure B2_INPUTS and absolute private B08_OUT.

```
npm ci --no-audit --no-fund
npm run build
B2_INPUTS=... node --experimental-strip-types --test qa/b08-test-core.test.mjs
B2_INPUTS=... B08_OUT=... node --experimental-strip-types qa/b08-test-api.mjs
python3 qa/b08-test-oracle.py .../UAT-08 .../api
```

14 real API/Worker variants: core,arrival60,aux-denied,aux-directed,aux-disabled,pool1,hp04-expand,hp04-availability,phase,whole,shift,stop,horizon59,n06. Four atomic input-rejection guards plus reopen and native export. Core tests independently exercise demand2 at2, combined3>2,1+1 at2,release30/29,one-way substitution/exact disabled,shared pool,full vs participation, H-P04 early/late and two orders,availability/shift/stops,missing mandatory fields,original06 and failure source linkage. Python uses only stdlib CSV and arithmetic, not product allocation/scheduler modules; accepts complete legal schedules, does not require the reference permutation.

Fixtures derive orders/machine/tool/personnel/duration/calendar from literal UAT08. Explicit replaceable mock choices: order split/type/status, kg normalization, group name, QA整窗 shift, pool identity/policy, post/full phase/offset0/release yes, approved CR tool contract. H-P04 variants are5/10 with explicit source/version. N06 is a new UAT08 MOCK original A-MIX acquired0/released40 with historical count2; completed task30 does not infer resource release30. No real account, attendance system or physical ledger gate.

Regression only for affected source/resource/checker paths: existing staffing6, H-P04, joint resources and UAT07 resource view5; reuse original UAT07 evidence at original SHA, no UAT07 verdict migration. Dev owns full browser/import/config persistence matrix. Final integrated candidate only needs affected source/navigation/config-to-Worker seams. QA NOT_DISPATCHED until PM checks runnable combined entry and originals. FR007/BR07 close only this package's applicable assertions; whole FRs/CR and future #38/#39/#40/#41 responsibilities remain separately listed in delivery closure table.
