# Issue4 / FR013 bounded v1 migration self-test

Dispatch: dlv_deda4264-6544-428f-8f1f-6122d5d01826.
Base: 116eb5d4df2b9e857fa035ea9b3f0742fe3f49e7.
Legacy generator: bd6f9fabe8354432e9c67b52219dc26989c2761d.
Requirements: v0.3 FR013 / applicable AC02,03,26 and effective CR-FR013-VALIDATION-20261029.

The runner creates parent stores through real Express, asynchronous Worker and confirmation APIs. It starts a fresh current router over the exact parent bytes, verifies no-op imports, permissions and atomic rejection, advances explicit configuration, and compares old run/plan/input-version/confirmation history. Explicit independent task/occupancy expectations cover minute11, half-open boundaries and personnel pool capacity1. React uses a QA runtime alias and trusted synthetic members; no production login or platform identity is required. All data and ports are isolated. It never contacts customer services.

Run inside the application container, in this isolated checkout. Dependencies are installed here only; do not run on the VM host. Prepare an isolated checkout of the exact parent with the same compatible dependencies. The native UI checks additionally require Playwright 1.64.1 and Chromium's system libraries/fonts. Install Playwright without changing the product manifest/lockfile. If the container has no root access, extract OS library packages into a task scratch directory and set LD_LIBRARY_PATH/FONTCONFIG_FILE; do not change platform services.

```sh
PARENT_ROOT=/workspace/apps/test-fr013-parent-bd6 \
EVIDENCE_DIR=/workspace/temp/fr013-v1-evidence \
node --experimental-strip-types qa/fr013-v1-migration-selftest.mjs
python3 qa/fr013-v1-migration-exports.py /workspace/temp/fr013-v1-evidence
```

Optional API_ONLY=1 or UI_ONLY=1 supports targeted environment diagnosis. A complete run executes 28 assertion groups (14 per resource class); the independent Python verifier parses eight API/native UI CSV outputs. The output contains synthetic full stores, requests/responses, hashes and browser screenshots. INVES­TIGATE is a harness execution failure pending classification, never an automatic product defect.

This task adds only QA files. It does not change product behavior, repeat prior QA 27/27 or CAP-1/2, confer FR013/Issue4 acceptance, perform UAT, merge main, or publish.
