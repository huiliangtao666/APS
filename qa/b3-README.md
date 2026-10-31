# B3 material scenario development/selftest package

Dispatch: `dlv_0c1d1eec-9195-4fa0-8e0c-1df9a0313fa5`; event `dlv_0c1d1eec-9195-4fa0-8e0c-1df9a0313fa5:r1`.
Direct parent: `98347f800c77c0468af3ae293d1dd852af5c207f` (B1).

Approved v0.3 UAT05/09/10/11 and applicable FR002/003/010/011/016/020/024/025.
The fixture generator cites the immutable baseline hash, uses seed `B3-v1`, and labels
all quantities, quality states and resource windows as synthetic software inputs.
No customer defaults or DEC04/05/06 application parameters are introduced.
The current normalized BOM/inventory/supply schemas are explicit inputs. Original09,
original13/14 and customer source mappings are not inferred by these fixtures.

Product changes are confined to BOM total validation and material allocation explanations:

- Exact total validation of an explicit `每1000kg投入` / `kg` raw-material version,
  across feeding operations, before import/save/run. Every implicated row has a source link.
  An invalid total is rejected without normalization; unrelated undefined BOM bases are unchanged.
- Saved material rows explain frozen/expired/pending/rejected lots, occupied amounts,
  exact allocation and remaining quantities. Old snapshots retain their recorded fields.
- The material panel shows those snapshot explanations and exact fractions. Existing CSV
  export carries the same data; no new import/run/App/DataEditor paths are introduced.

Reproduce in an isolated application container, never install/run on the VM host:

```sh
npm ci
npm run build
npm test
npm run test:query-ui
EVIDENCE_DIR=/evidence/targeted node --experimental-strip-types --test qa/b3-material.test.mjs
node --experimental-strip-types qa/b3-material-fixture.mjs /fixtures
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium
EVIDENCE_DIR=/evidence/browser bash qa/b3-browser-runtime.sh
python3 qa/b3-material-oracle.py /fixtures /evidence/targeted /evidence/browser
```

The workspace host invokes finite runtime commands with
`.codex/skills/workspace-app-builder/scripts/app-exec.sh --cwd /workspace/apps/aps-b3-material ...`.
`b3-browser-runtime.sh` downloads/extracts libraries into private scratch, without system package install.
The portable replay image may install browser libraries during its own image build.
All actor seams exist in QA fixtures only. Signed platform multi-member SSO is not covered.

B301–309 cover exact FEFO, 0.1 shortage, expected supply179/180 and delay, all four
configuration errors/zero-write/correction, production asynchronous Worker,
snapshot persistence, export, roles/stale/CSRF, recipe/specification and partial review.
BU301–307 cover the actual React chain. The independent Python oracle uses CSV,
Fraction and datetime without importing product arithmetic or allocation functions.

UAT09/10/11 have independently decidable material/validation evidence. UAT05 here is
only the material boundary plus explicitly simple legal tooling/staff windows.
Full UAT05 and the complete B3 candidate are **NOT_READY_FOR_UAT** until the PM-named
single integrator combines fixed B2+B3 on a new branch, records source SHAs/parents,
reviews conflicts, reruns affected checks and supplies the integrated runnable endpoint.
No B2 merge, main merge, publication or QA UAT verdict is performed here.
AC09 speed-derived100/80 minutes, arbitrary BOM bases, stage additions/loss combinations,
global adopted-plan reservations and physical stock deduction remain outside this package.
