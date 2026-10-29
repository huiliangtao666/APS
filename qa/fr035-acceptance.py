#!/usr/bin/env python3
"""Finite FR035 delivery check. Default/--check is read-only, offline, no installs.
Optional --run uses the existing integrated Docker entrypoint, never host npm.
"""
import argparse, hashlib, json, os, pathlib, re, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/fr035-acceptance'
PIN = 'cf6e76e23722f142a08c552aacb43c924fc62f19'
def require(ok, message):
    if not ok:
        raise ValueError(message)
def load(p):
    return json.loads(p.read_text())
def digest(data):
    return hashlib.sha256(data).hexdigest()
def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])
def tap_counts(directory):
    counts = {}
    for p in sorted(directory.glob('*.log')):
        text = p.read_text()
        n = re.findall(r'^# tests (\d+)$', text, re.M)
        if not n:
            continue
        for key in ['fail', 'cancelled', 'skipped', 'todo']:
            values = re.findall(r'^# '+key+r' (\d+)$', text, re.M)
            require(len(values) == len(n) and all(int(v) == 0 for v in values), 'Nonpassing TAP: '+str(p))
        passes = re.findall(r'^# pass (\d+)$', text, re.M)
        require(passes == n, 'Incomplete TAP: '+str(p))
        counts[p.stem] = sum(map(int,n))
    require(bool(counts), 'No TAP logs found')
    return counts
def check():
    m = load(BASE/'matrix.json')
    require(digest(pathlib.Path(__file__).read_bytes()) == m['validationEntrypoint']['sha256'], 'Validation entrypoint hash mismatch')
    require(m['productSourceSHA'] == PIN, 'Wrong matrix source pin')
    require(m['issue23']['status'] == 'round1 sourcefixed pending independent Test', 'Changed Test gate')
    manifest = load(BASE/'MANIFEST-SHA256.json')
    actual_files = {str(p.relative_to(BASE)) for p in BASE.rglob('*') if p.is_file() and p.name != 'MANIFEST-SHA256.json'}
    require(actual_files == set(manifest), 'Missing or unlisted acceptance evidence')
    for name, expected in manifest.items():
        path = (BASE/name).resolve()
        require(path.is_relative_to(BASE.resolve()), 'Unsafe evidence path')
        require(digest(path.read_bytes()) == expected, 'Evidence hash mismatch: '+name)
    git('merge-base', '--is-ancestor', PIN, 'HEAD')
    git('merge-base', '--is-ancestor', '8741bf0a597fa11838a514259d8ffe7980382ee2', PIN)
    hashes = load(BASE/'evidence/final-source-verification.json')
    require(hashes['sha'] == PIN, 'Wrong product evidence pin')
    for name, expected in hashes['files'].items():
        require(digest((ROOT/name).read_bytes()) == expected, 'Working product mismatch: '+name)
        require(digest(git('show', PIN+':'+name)) == expected, 'Pinned product mismatch: '+name)
    current = load(ROOT/'qa/fr038-source-sha256.json')['files']
    require(current == hashes['files'], 'Integrated source manifest mismatch')
    legacy = load(ROOT/'qa/fr035-source-sha256.json')['files']
    stale = [n for n,h in legacy.items() if digest((ROOT/n).read_bytes()) != h]
    require(bool(stale), 'Reassess legacy entrypoint documentation: manifest changed')
    scripts = ['qa/fr035-docker.sh','qa/fr035-checks.sh','qa/fr038-docker.sh','qa/fr038-checks.sh']
    for name in scripts:
        require((ROOT/name).read_bytes() == git('show', PIN+':'+name), 'Existing entrypoint changed: '+name)
        subprocess.run(['bash','-n',str(ROOT/name)],check=True)
    require('bash qa/fr038-checks.sh' in (ROOT/scripts[2]).read_text(), 'Wrong integrated entrypoint')
    require('FR034_SOURCE_MANIFEST=qa/fr038-source-sha256.json' in (ROOT/scripts[3]).read_text(), 'Wrong browser source manifest')
    require('FR034_SOURCE_MANIFEST=qa/fr035-source-sha256.json' in (ROOT/scripts[1]).read_text(), 'Reassess legacy warning')
    require({r['id'][5:] for r in m['rows'] if r['id'].startswith('kind-')} == {'orders','tasks','occupation','materials','unplanned','differences'}, 'Missing kind')
    for row in m['rows']:
        require(row['sourceSHA'] == PIN and row['commands'] and row['result'] and row['gap'], 'Incomplete row: '+row['id'])
        for name in row['evidence']:
            require(name in manifest, 'Broken evidence link: '+name)
        for name in row['source']:
            git('cat-file','-e',PIN+':'+name)
    require(m['commitURL'].endswith('/'+PIN) and m['issueURL'].endswith('/issues/23'), 'Incorrect remote reference')
    counts = tap_counts(BASE/'evidence/run3/tests')
    require(counts == load(BASE/'evidence/validation-summary.json')['tapBySuite'], 'Counts differ from retained summary')
    legacy_subtotal = sum(n for k,n in counts.items() if k not in ('run-panel','run-history'))
    require(sum(counts.values()) == m['counts']['repairObservedTAP'], 'Wrong observed count')
    require(legacy_subtotal == m['counts']['legacyCurrentScriptTAPSubtotal'], 'Wrong derived subtotal')
    for filename,key in [('fr035-browser-report.json','completed'),('fr038-browser-report.json','complete')]:
        report = load(BASE/'evidence/run3'/filename)
        require(report[key] and report['errors'] == [], 'Failed browser report')
        require(report['sourceHashes'] == current, 'Browser source hashes mismatch')
    report = load(BASE/'evidence/run3/fr035-browser-report.json')
    require(all(c['pass'] for c in report['checks']), 'Browser check failed')
    # Count actual saved CSV files, including filtered task export outside downloads[].
    csvs = list((BASE/'evidence/run3').glob('*.csv'))
    return {'mode':'check','result':'PASS','productSourceSHA':PIN,'productFiles':len(current),'hashedEvidenceFiles':len(manifest),'observedHistoricalTAP':sum(counts.values()),'tapBySuite':counts,'legacyTAPSubtotalDerivedOnly':legacy_subtotal,'legacyManifestMismatches':stale,'browserGroups':len(report['checks']),'downloadsArray':len(report['downloads']),'savedRunCSVFiles':len(csvs),'independentTest':'pending; Dev evidence only','freshProductSuiteRun':False}
def main():
    p = argparse.ArgumentParser(description=__doc__)
    mode = p.add_mutually_exclusive_group()
    mode.add_argument('--check',action='store_true',help='Read-only offline delivery validation (default)')
    mode.add_argument('--run',action='store_true',help='Explicit full replay through existing qa/fr038-docker.sh')
    p.add_argument('--sdk',type=pathlib.Path)
    p.add_argument('--out',type=pathlib.Path)
    a = p.parse_args()
    result = check()
    if a.run:
        require(a.sdk is not None and a.sdk.is_absolute() and a.sdk.is_dir(),'--sdk needs an existing absolute SDK directory')
        require(a.out is not None and a.out.is_absolute() and a.out.is_dir() and not any(a.out.iterdir()),'--out needs a new empty absolute directory')
        env = dict(os.environ,FR038_REPO=str(ROOT),FR038_SDK=str(a.sdk),FR038_OUT=str(a.out))
        subprocess.run(['bash',str(ROOT/'qa/fr038-docker.sh')],env=env,check=True)
        result = {'mode':'run','result':'PASS','actualTAPBySuite':tap_counts(a.out/'tests'),'output':str(a.out)}
        result['actualTAPTotal'] = sum(result['actualTAPBySuite'].values())
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__ == '__main__':
    try:
        main()
    except (ValueError,OSError,subprocess.CalledProcessError) as e:
        print(json.dumps({'result':'FAIL','error':str(e)},ensure_ascii=False),file=sys.stderr)
        sys.exit(1)
