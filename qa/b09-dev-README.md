# B09 input, material workbench and persistence integration

Delivery `dlv_ddea429a-af36-46f2-be80-25c6c26f9da4`; result key is that ID plus `:r1`.
Issue38 is the single joint package. Base12d453d7cb03829dc609115e48c5e4c19af4a6ec;
Dev parent69027caa82119df82ede11278f79b95374bc3e1d and Test owner source
579fe0589757154857c519e4968dee1e288ca9a0 merged without conflicts at
a4df05a93fcc5e25fd97015764eb5625cdc41b07. Test's ten files retain their source bytes.

The material table links enter the existing workbench. The existing authenticated
zero-write preview additionally returns `materialChecked/materialDemands` from
the same calculation. A real Worker freezes inputs and produces saved demand,
exact shortage, allocations, exclusions and supply conditions. Reopen adds a
read-only frozen inventory projection at an explicitly selected minute, material
source links for scheduled and unplanned tasks, and native plan/material export.
CSV source physical rows require matching frozen canonical records plus file/hash;
edited rows without that proof show their canonical position instead. Original09
is independent, literal and unmapped. Single-file browser reading preserves BOM.

Use an isolated application container. Never install/run the app on the VM host,
change a published app/old QA environment, merge main or publish this candidate.
`b09-dev-runtime/build.mjs` consumes `/source-manifest.json` and original files
at `/fixtures/originals/UAT-{09,10,11}`. It generates editable normalized CSV
profiles, imports literal original09 separately, builds the actual React app and
records source/asset/fixture hashes. The simulation SDK alias and simulated
planner/supervisor/query are QA harness inputs, not customer identity. The runtime
starts port4317 with private `/state`; `B09_SKIP_INIT=1` is only for disposable
browser selftests. Otherwise the runtime initializes UAT09 once, with no Worker
run, and refuses to replace nonempty unmarked state. Final delivery supplies the
generated Dockerfile, fixed-source archive, SDK tarballs, fixtures and manifest.

Inside that isolated container:

```sh
NODE_OPTIONS=--max-old-space-size=256 npm run build
EVIDENCE_DIR=/evidence/seams node --experimental-strip-types --test qa/b09-dev-seams.test.mjs
EVIDENCE_DIR=/evidence/browser node qa/b09-dev-browser.cjs
# Restart only this disposable test container, retaining its private /state.
EVIDENCE_DIR=/evidence/browser node qa/b09-dev-reopen.cjs
node --test --test-concurrency=1 src/lib/*.test.mjs
node --experimental-strip-types --test --test-concurrency=1 server/auth/auth.test.mjs server/business.test.mjs
```

The file-only independent oracle may run on the host:
`python3 qa/b09-dev-oracle.py /local/evidence/browser`.
It imports no APS code. Browser contexts are recycled between scenario groups to
limit memory on the shared node. Runtime/resource failures remain distinct from
product assertions; incomplete executions are never PASS.

162.5kg and162.4kg are distinct scenarios. AC10's325/400/100 variant is a named
replaceable simulation. Expected supply tests supplement only the material impact
of old UAT05; old full UAT05/07/08 verdicts retain their original SHAs. Domain
54-test/23-oracle assertions remain Test-owner evidence at579fe05; Dev does not
repeat that same domain suite. Unknown conversions, original09-to-normalized
mapping and new yield/loss semantics remain WAIT_APPROVAL via PM/user. No
DEC04/05/06 implementation, global reservation, real receipt, quality approval or
physical stock write is included. QA UAT09 must be dispatched by PM before10/11;
Dev selftest completion does not close Issue38 or any QA Log.
