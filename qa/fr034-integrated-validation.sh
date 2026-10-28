#!/usr/bin/env bash
# Reconcile the existing FR034 product pin; --run replays existing finite suites.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
PIN=4e11da6c768e6eeb026f38e1d247191cbe3c2cf8
MODE=${1:---check}
[[ "$MODE" == --check || "$MODE" == --run ]] || { echo 'Usage: bash qa/fr034-integrated-validation.sh [--check|--run]' >&2; exit 2; }
python3 - "$REPO" "$PIN" <<'PY'
import sys,pathlib,json,hashlib,subprocess
r=pathlib.Path(sys.argv[1]); pin=sys.argv[2]
def git(*args): return subprocess.check_output(['git','-C',str(r),*args])
subprocess.run(['git','-C',str(r),'merge-base','--is-ancestor',pin,'HEAD'],check=True)
m=json.loads((r/'docs/FR-034-acceptance-matrix.json').read_text())
assert m['product_sha']==pin
assert set(m['original_source']['ac'])=={'AC-04','AC-15','AC-17','AC-31'}
for row in m['requirements']:
 assert row['integrated_sha']==pin and row['remaining']
 assert all(k in m['evidence'] for k in row['evidence_ids'])
for e in m['evidence'].values():
 assert len(e['executed_product_sha'])==40 and e['executed_commands'] and len(e['sha256'])==64
 subprocess.run(['git','-C',str(r),'merge-base','--is-ancestor',e['executed_product_sha'],pin],check=True)
manifest=json.loads((r/'qa/fr034-boundary-source-sha256.json').read_text())['files']
for name,want in manifest.items():
 assert hashlib.sha256((r/name).read_bytes()).hexdigest()==want, name
 assert hashlib.sha256(git('show',pin+':'+name)).hexdigest()==want, name
# All other tracked product/harness files must also retain the integrated pin.
changed=git('diff','--name-only',pin,'--','.',':(exclude)docs/**',':(exclude)qa/fr034-integrated-validation.sh').decode().splitlines()
assert not changed, 'Product or historical harness changed: '+str(changed)
snapshot=json.loads((r/'docs/FR-034-acceptance-live.json').read_text())
assert next(i for i in snapshot['issues'] if i['number']==22)['state']=='open'
final=json.loads((r/'qa/evidence/fr034-boundary/final-report.json').read_text())
assert final['allPassed'] is True and final['completed'] is True
print(json.dumps({'mode':'provenance-and-document-check','product_sha':pin,'manifest_files':len(manifest),'requirements':len(m['requirements']),'historical_reports':len(m['evidence']),'stored_boundary_allPassed':True,'new_product_execution':False,'issue_snapshot_at':snapshot['observed_at_utc']}))
PY
[[ "$MODE" == --run ]] || exit 0
: "${FR034_SDK:?Absolute directory of existing authorized SDK archives required}"
: "${FR034_OUT:?New empty absolute output directory required}"
[[ "$FR034_SDK" == /* && -d "$FR034_SDK" && "$FR034_OUT" == /* && -d "$FR034_OUT" && -z $(ls -A "$FR034_OUT") ]] || { echo 'SDK/output must be absolute existing directories; output must be empty' >&2; exit 2; }
mkdir "$FR034_OUT/regression" "$FR034_OUT/boundary"
export FR034_REPO="$REPO" FR034_SOURCE_MANIFEST=qa/fr034-boundary-source-sha256.json
export FR034_PRODUCT_SHA="$PIN" FR034_KBD_MODE=fixed
# The existing runner compares this label byte-for-byte with the pinned manifest.
# The exact commit remains FR034_PRODUCT_SHA; a display label is not a new pin.
export FR034_PRODUCT_LABEL
FR034_PRODUCT_LABEL=$(python3 - "$REPO/$FR034_SOURCE_MANIFEST" <<'PYLABEL'
import json,sys
print(json.load(open(sys.argv[1]))['productSourceSHA'])
PYLABEL
)
OUT_ROOT=$FR034_OUT
FR034_OUT="$OUT_ROOT/regression" bash "$REPO/qa/fr034-keyboard-r1-docker.sh" > "$OUT_ROOT/regression.log" 2>&1
FR034_OUT="$OUT_ROOT/boundary" bash "$REPO/qa/fr034-boundary-docker.sh" > "$OUT_ROOT/boundary.log" 2>&1
# Historical runners can record failed invariants even with process exit0.
python3 - "$OUT_ROOT" <<'PY'
import pathlib,json,sys
p=pathlib.Path(sys.argv[1]); b=json.loads((p/'boundary/boundary-report.json').read_text())
assert b['allPassed'] is True and b['completed'] is True
assert not b['errors']
assert len([x for x in b['results'] if x.get('pass') is True])==14
k=json.loads((p/'regression/keyboard-report.json').read_text())
assert k['completed'] is True and not k['errors']
assert all(x['pass'] for x in k['keyboard']) and len(k['keyboard'])==6
assert all(x.get('pass') is not False for x in k['results'])
u=json.loads((p/'regression/unknown-browser-report.json').read_text())
assert not u['errors'] and len(u['results'])==24 and all(x['passed'] for x in u['results'])
h=json.loads((p/'regression/confirmed-api-report.json').read_text())
assert len(h['checks'])==4 and len(h['requests'])==19
print('PASS existing integrated regression and boundary replay; inspect separate JSON/logs and checklist. This is Dev reproduction, not independent Test or full UAT.')
PY
