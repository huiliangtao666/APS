"""Issue48 single authorized candidate, serial HTTP/Worker/browser selftest.

No old instance lifecycle, product patch, trial-fact bypass, or implicit retries.
"""
import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location('fixture', pathlib.Path(__file__).with_name('b15-runtime-execution-fixture.py'))
F = importlib.util.module_from_spec(spec)
spec.loader.exec_module(F)
ROOT = pathlib.Path(__file__).resolve().parents[3]
OWN = ROOT / 'temp/b15-uat18-execution-fixture-r1'
E = ROOT / 'temp/b15-execution-48'
E.mkdir(parents=True, exist_ok=True)


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save(name, value):
    (E / name).write_text(json.dumps(value, ensure_ascii=False, indent=2))


def command(args, timeout=30):
    return subprocess.check_output(args, timeout=timeout)


def inspect(name):
    return json.loads(command(['docker', 'inspect', name]))[0]


def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as s:
        for b in iter(lambda: s.read(65536), b''):
            h.update(b)
    return {'bytes': p.stat().st_size, 'sha256': h.hexdigest()}


def protected():
    paths = []
    for name in ['b15-runtime-state-15', 'b15-runtime-state-17', 'b15-runtime-state-18', 'b15-runtime-group-state']:
        paths.extend(p for p in (ROOT / 'temp' / name).rglob('*') if p.is_file())
    paths.extend((ROOT / 'temp/b15-runtime-evidence').glob('*native.csv'))
    return {str(p.relative_to(ROOT)): digest(p) for p in sorted(paths)}


def gh(path):
    req = urllib.request.Request('https://api.github.com/repos/huiliangtao666/APS/' + path,
                                 headers={'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'], 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def memory(name):
    raw = command(['docker', 'exec', name, 'cat', '/proc/meminfo', '/sys/fs/cgroup/memory.events']).decode()
    return int(next(r.split()[1] for r in raw.splitlines() if r.startswith('MemAvailable:'))), raw


def api(path, data=None, role='planner', expected=200):
    if (E / 'STOP').exists():
        raise RuntimeError((E / 'STOP').read_text())
    req = urllib.request.Request(F.BASE + '/api' + path,
          data=json.dumps({'reason': 'Issue48 explicit replaceable mock selftest', **data}, ensure_ascii=False).encode() if data is not None else None,
          headers={'Content-Type': 'application/json', 'test-sub': role})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            status, body = r.status, r.read()
    except urllib.error.HTTPError as r:
        status, body = r.code, r.read()
    try:
        value = json.loads(body)
    except ValueError:
        value = body.decode()
    with (E / 'http.jsonl').open('a') as s:
        s.write(json.dumps({'utc': utc(), 'path': path, 'role': role, 'method': req.get_method(),
                           'status': status, 'request': data, 'response': value}, ensure_ascii=False) + '\n')
    if status != expected:
        raise RuntimeError(f'{path} expected {expected}, got {status}: {str(value)[:1000]}')
    return value


def pending():
    return [r['id'] for r in api('/runs') if r['status'] not in F.TERMINAL]


def run_worker(state, selection, trial=None):
    if pending():
        raise RuntimeError('single Worker gate failed')
    run = api('/runs', {'revision': state['revision'], 'selection': selection,
                       **({'trialId': trial} if trial else {})}, expected=202)
    for _ in range(150):
        current = api('/runs/' + run['id'])
        if current['status'] in F.TERMINAL:
            if current['status'] != 'completed':
                raise RuntimeError('non-completed Worker ' + str(current.get('failure', current.get('status'))))
            return current
        time.sleep(.2)
    raise RuntimeError('Worker not terminal within bounded wait')


def main():
    resume_created = '--resume-created' in sys.argv
    if (E / 'ATTEMPT').exists():
        raise RuntimeError('one invocation only; no unchanged retry')
    # Re-read the actual QA17 round and all later comments before runtime access.
    comments = gh('issues/47/comments?per_page=100')
    release = next(c for c in reversed(comments) if 'dlv_0d4e85b3' in c['body'] and '"window": "RELEASED"' in c['body'])
    F.require_release(release)
    later = [c for c in comments if c['id'] > release['id']]
    if any(('窗口接手' in c['body'] or '唯一重窗口归QA17' in c['body']) and 'RELEASED' not in c['body'] for c in later):
        raise RuntimeError('newer window owner must release first')
    save('fresh-qa17-release.json', release)
    save('fresh47-comments.json', comments)
    auth = gh('issues/comments/6556235075')
    if F.CONTAINER not in auth['body'] or F.IMAGE.split(':')[1] not in auth['body']:
        raise RuntimeError('specific authority drift')
    save('fresh-authority.json', auth)
    old_names = ['aps-test-b15-runtime-48e0766-' + s for s in ['15', '17', '18']] + ['aps-test-b15-runtime-group-48e0766']
    old_id = {n: F.identity(inspect(n)) for n in old_names}
    save('old-identities-before.json', old_id)
    samples = []
    for _ in range(6):
        kib, raw = memory(old_names[0])
        samples.append({'utc': utc(), 'MemAvailableKiB': kib, 'raw': raw})
        F.require_capacity(kib, 'startup')
        time.sleep(1)
    save('startup-capacity.json', samples)
    if not resume_created:
        with socket.socket() as s:
            s.bind(('127.0.0.1', 18301))
    names = command(['docker', 'ps', '-a', '--format', '{{.Names}}']).decode().splitlines()
    if F.CONTAINER in names and not resume_created:
        raise RuntimeError('candidate already exists')
    image = json.loads(command(['docker', 'image', 'inspect', F.IMAGE]))[0]
    if image['Id'] != F.IMAGE:
        raise RuntimeError('fixed image mismatch')
    save('image.json', image)
    state = OWN / 'state'
    fixture_dir = OWN / 'fixtures'
    state.mkdir(parents=True, exist_ok=True)
    state.chmod(0o700)
    fixture_dir.mkdir(exist_ok=True)
    if list(state.iterdir()) and not resume_created:
        raise RuntimeError('new private state must be empty')
    if resume_created:
        # The only allowed recovery is a changed host tool following the initial
        # GET-only logger failure; no second container, lifecycle call or store edit.
        prior = json.loads((E / 'attempt1/window-release.json').read_text())
        previous = json.loads((E / 'attempt1/candidate-inspect-before.json').read_text())
        current = inspect(F.CONTAINER)
        if prior.get('error') != 'AttributeError("\'Request\' object has no attribute \'method\'")':
            raise RuntimeError('resume only addresses the observed logger exception')
        if prior.get('pending') or not prior.get('oldFilesUnchanged') or (state / 'business.json').exists():
            raise RuntimeError('resume requires previous zero business writes and terminal release')
        if F.identity(previous) != F.identity(current) or current['Image'] != F.IMAGE:
            raise RuntimeError('created candidate identity changed')
        if current['HostConfig']['Memory'] != 1024 ** 3 or current['HostConfig']['PortBindings']['4317/tcp'] != [{'HostIp': '127.0.0.1', 'HostPort': '18301'}]:
            raise RuntimeError('created candidate isolation drift')
        if sorted((m['Source'], m['Destination'], m['RW']) for m in current['Mounts']) != sorted([(str(state), '/state', True), (str(fixture_dir), '/fixtures/execution', False)]):
            raise RuntimeError('created candidate mount boundary changed')
        save('resume-created-admission.json', {'reason': 'changed logger get_method contract; no business writes on first attempt',
             'sameIdentity': True, 'noLifecycleCall': True, 'utc': utc()})
    else:
        save('empty-state.json', {'path': str(state), 'entries': [], 'mode': oct(state.stat().st_mode & 0o777), 'utc': utc()})
    before = protected()
    save('protected-before.json', before)
    (E / 'ATTEMPT').write_text(utc())
    argv = ['docker', 'run', '-d', '--name', F.CONTAINER, '--memory', '1g', '--memory-swap', '1g',
            '--restart', 'no', '-p', '127.0.0.1:18301:4317', '-e', 'B15_RUNTIME_ISOLATED=1',
            '-v', str(state) + ':/state', '-v', str(fixture_dir) + ':/fixtures/execution:ro',
            F.IMAGE, 'node', '--experimental-strip-types', 'qa/b15-runtime-server.mjs']
    if resume_created:
        container_id = current['Id']
    else:
        save('launch-command.json', {'argv': argv, 'utc': utc(), 'memoryLimitIsReservation': False})
        container_id = command(argv).decode().strip()
    first = inspect(F.CONTAINER)
    save('candidate-inspect-before.json', first)
    fatal = threading.Event()
    shutdown = threading.Event()
    events = subprocess.Popen(['docker', 'events', '--since', str(int(time.time()) - 2), '--filter', 'container=' + container_id,
                               '--format', '{{json .}}'], stdout=(E / 'docker-events.jsonl').open('w'), stderr=(E / 'docker-events.stderr').open('w'))

    def monitor():
        try:
            while not shutdown.is_set():
                current = inspect(F.CONTAINER)
                kib, raw = memory(F.CONTAINER)
                with (E / 'monitor.jsonl').open('a') as s:
                    s.write(json.dumps({'utc': utc(), 'identity': F.identity(current), 'MemAvailableKiB': kib, 'raw': raw}) + '\n')
                if F.identity(first) != F.identity(current):
                    raise RuntimeError('candidate identity drift')
                F.require_capacity(kib, 'running')
                if current['State']['OOMKilled'] or any(json.loads(line).get('Action') in ['oom', 'die', 'restart', 'kill', 'stop'] for line in (E / 'docker-events.jsonl').read_text().splitlines() if line):
                    raise RuntimeError('Docker fatal event')
                if events.poll() is not None:
                    raise RuntimeError('Docker event observer exited')
                shutdown.wait(.5)
        except Exception as e:
            (E / 'STOP').write_text(str(e))
            fatal.set()

    watcher = threading.Thread(target=monitor, daemon=True)
    watcher.start()
    child = None
    result = {'window': 'RELEASED', 'owned': [], 'pending': 'UNCONFIRMED', 'checks': [], 'started': utc()}
    try:
        # Single readiness wait, never a second start or request retry after exception.
        for _ in range(50):
            logs = command(['docker', 'logs', F.CONTAINER]).decode()
            if '"ready":true' in logs:
                break
            if fatal.is_set():
                raise RuntimeError('startup monitor stopped')
            time.sleep(.2)
        else:
            raise RuntimeError('candidate readiness deadline')
        with urllib.request.urlopen(F.BASE + '/__qa/source-manifest.json', timeout=20) as r:
            metadata_bytes = r.read()
        metadata = json.loads(metadata_bytes)
        (E / 'candidate-source-manifest.json').write_bytes(metadata_bytes)
        if metadata['productSha'] != F.PRODUCT or metadata['buildSource'] != F.PRODUCT:
            raise RuntimeError('source mismatch')
        audit_script = """import fs from 'node:fs';import{createHash}from'node:crypto';
const m=JSON.parse(fs.readFileSync('/build/metadata.json')),buf=Buffer.alloc(65536),counts={};
for(const[k,b,files]of[['source','',m.sourceFiles],['UI','/ui/',m.uiFiles],['profile','/fixtures/',m.profileFiles],['adapter','',m.adapters]]){
counts[k]=0;for(const[p,expected]of Object.entries(files||{})){const fd=fs.openSync(b+p,'r'),h=createHash('sha256');try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null)))h.update(buf.subarray(0,n));}finally{fs.closeSync(fd);}if(h.digest('hex')!==expected)throw Error(k+' drift '+p);counts[k]++;}}
console.log(JSON.stringify({allMatch:true,counts}));"""
        audit = subprocess.run(['docker', 'exec', '-i', F.CONTAINER, 'node', '--input-type=module', '-'],
                               input=audit_script.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
        (E / 'source-ui-profile-audit.json').write_bytes(audit.stdout)
        (E / 'source-ui-profile-audit.stderr').write_bytes(audit.stderr)
        if audit.returncode:
            raise RuntimeError('fixed source/UI/profile/adapter audit failed')
        with urllib.request.urlopen(F.BASE + '/fixtures/18/PROFILE.json', timeout=20) as r:
            (E / 'original18-PROFILE.json').write_bytes(r.read())
        if digest(E / 'original18-PROFILE.json')['sha256'] != metadata['profileFiles']['18/PROFILE.json']:
            raise RuntimeError('served original profile hash mismatch')
        seed = api('/state')
        fixture = F.make_fixture(seed['data'])
        (fixture_dir / 'PROFILE.json').write_text(json.dumps(fixture, ensure_ascii=False, indent=2))
        fixture_hash = digest(fixture_dir / 'PROFILE.json')
        save('fixture-fingerprint.json', fixture_hash)
        # Real /inputs gate performs full normalized validation and transition checks.
        saved = api('/inputs', {'revision': seed['revision'], 'operation': 'import', 'tables': fixture['data']})
        baseline_run = run_worker(saved, fixture['selection'])
        baseline_plan = next(p for p in api('/plans') if p['id'] == baseline_run['planId'])
        by_id = {t['id']: t for t in baseline_plan['tasks']}
        for task, expected in [('A-MIX', [30, 50]), ('B-MIX', [0, 30])]:
            if [by_id[task]['start'], by_id[task]['end']] != expected:
                raise RuntimeError('independent execution interval mismatch ' + task)
        demands = [r for r in baseline_plan['materialDemands'] if r['materialId'] == 'LEAN']
        if sum(r['quantity'] for r in demands) != 60:
            raise RuntimeError('independent remaining material mismatch')
        verified = api('/plans/' + baseline_plan['id'] + '/verify', {})
        if not verified['verification']['protection']['valid']:
            raise RuntimeError('baseline independent execution verification failed')
        save('baseline-independent-verification.json', verified['verification'])
        api('/plans', {'id': baseline_plan['id']}, expected=201)
        original_input = api('/runs/' + baseline_run['id'] + '/inputs')
        if original_input['originalInput']['executionFacts'] != saved['data']['executionFacts']:
            raise RuntimeError('facts not frozen exactly')
        trial = api('/plans/' + baseline_plan['id'] + '/copy', {}, expected=201)
        trial_run = run_worker(trial, fixture['selection'], trial['id'])
        plan = next(p for p in api('/plans') if p['id'] == trial_run['planId'])
        verified_trial = api('/plans/' + plan['id'] + '/verify', {})
        if not verified_trial['verification']['protection']['valid']:
            raise RuntimeError('trial independent execution verification failed')
        save('trial-independent-verification.json', verified_trial['verification'])
        positions = api('/trials/' + trial['id'] + '/positions')
        if positions['blocked'] is not None:
            raise RuntimeError('position entry is not usable: ' + str(positions['blocked']))
        result['checks'].append({'id': 'real_inputs_worker_save_copy_trial_worker_frozen', 'result': 'PASS'})
        for task_id in ['A-MIX', 'B-MIX']:
            task = next(t for t in positions['tasks'] if t['id'] == task_id)
            if task['movable']:
                raise RuntimeError('protected task exposed movable')
            for action, extra in [('move-preview', {'start': 40, 'machine': 'MIX01'}), ('lock-preview', {'locked': True})]:
                initial = {str(p.relative_to(state)): digest(p) for p in state.rglob('*') if p.is_file()}
                denial = api('/trials/' + trial['id'] + '/' + action,
                             {'revision': positions['revision'], 'planId': plan['id'], 'planHash': positions['planHash'],
                              'taskId': task_id, **extra}, expected=409)
                if denial.get('error') != 'task_execution_protected':
                    raise RuntimeError('wrong denial branch: ' + str(denial))
                after = {str(p.relative_to(state)): digest(p) for p in state.rglob('*') if p.is_file()}
                if initial != after:
                    raise RuntimeError('rejection wrote persistent state')
                result['checks'].append({'id': task_id + '_' + action + '_409_zero_write', 'result': 'PASS', 'before': initial, 'after': after})
        for role in ['planner', 'supervisor', 'query']:
            session = api('/session', role=role)
            result.setdefault('roles', {})[role] = session
        pre_negative = {str(p.relative_to(state)): digest(p) for p in state.rglob('*') if p.is_file()}
        rejected = api('/trials/' + trial['id'] + '/inputs', {'revision': trial['revision'], 'tables': {'executionFacts': []}}, expected=409)
        if rejected.get('error') != 'trial_execution_edit_forbidden':
            raise RuntimeError('trial fact prohibition bypassed')
        api('/trials/' + trial['id'] + '/lock-preview', {'revision': positions['revision'], 'planId': plan['id'],
            'planHash': positions['planHash'], 'taskId': 'A-MIX', 'locked': True}, role='query', expected=403)
        if pre_negative != {str(p.relative_to(state)): digest(p) for p in state.rglob('*') if p.is_file()}:
            raise RuntimeError('negative trial/role request wrote state')
        result['checks'].append({'id': 'trial_fact_409_and_query_forgery_403_zero_write', 'result': 'PASS'})
        (E / 'native.csv').write_text(api('/export', {'planId': baseline_plan['id']}))
        save('candidate-access.json', {'url': F.BASE, 'roles': ['planner', 'supervisor', 'query'],
            'roleURLs': {r: F.BASE + '/__qa/role/' + r for r in ['planner', 'supervisor', 'query']},
            'baselinePlanId': baseline_plan['id'], 'baselineRunId': baseline_run['id'],
            'trialId': trial['id'], 'trialPlanId': plan['id'], 'trialRunId': trial_run['id'],
            'positions': positions, 'fixture': fixture_hash, 'profileURL': F.BASE + '/fixtures/execution/PROFILE.json'})
        save('frozen-input.json', original_input)
        save('trial-frozen-input.json', api('/runs/' + trial_run['id'] + '/inputs'))
        kib, raw = memory(F.CONTAINER)
        F.require_capacity(kib, 'browser')
        save('browser-capacity.json', {'utc': utc(), 'MemAvailableKiB': kib, 'raw': raw})
        env = os.environ.copy()
        env['B15_EXECUTION_EVIDENCE'] = str(E)
        save('browser-admission.json', {'expires': time.time() + 60, 'allowed': True, 'identity': F.identity(first)})
        child = subprocess.Popen(['node', str(pathlib.Path(__file__).with_name('b15-runtime-execution-browser.cjs'))],
                                 env=env, stdout=(E / 'browser.stdout').open('w'), stderr=(E / 'browser.stderr').open('w'), start_new_session=True)
        while child.poll() is None:
            if fatal.is_set():
                os.killpg(child.pid, signal.SIGTERM)
                break
            time.sleep(.2)
        code = child.wait(timeout=15)
        if code:
            raise RuntimeError('browser selftest failed: ' + str(code))
        result['checks'].extend(json.loads((E / 'browser-result.json').read_text())['checks'])
        if original_input != api('/runs/' + baseline_run['id'] + '/inputs'):
            raise RuntimeError('history changed on reopen')
        if (E / 'native.csv').read_text() != api('/export', {'planId': baseline_plan['id']}):
            raise RuntimeError('native bytes changed')
        result['checks'].append({'id': 'history_frozen_and_native_after_reopen', 'result': 'PASS'})
        result['result'] = 'PASS'
    except Exception as e:
        result['result'] = 'BLOCKED_OR_FAILED'
        result['error'] = repr(e)
        raise
    finally:
        if child and child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            child.wait(timeout=15)
        shutdown.set()
        watcher.join(timeout=10)
        events.terminate()
        events.wait(timeout=10)
        result['candidateIdentityUnchanged'] = F.identity(first) == F.identity(inspect(F.CONTAINER))
        result['oldIdentitiesUnchanged'] = old_id == {n: F.identity(inspect(n)) for n in old_names}
        after = protected()
        save('protected-after.json', after)
        result['oldFilesUnchanged'] = before == after
        # Read terminal status directly even if STOP disables further HTTP.
        store = json.loads((state / 'business.json').read_text()) if (state / 'business.json').exists() else {}
        result['pending'] = [r['id'] for r in store.get('runs', []) if r['status'] not in F.TERMINAL]
        result['stateFiles'] = {str(p.relative_to(state)): digest(p) for p in state.rglob('*') if p.is_file()}
        result['finished'] = utc()
        result['eventMonitorReaped'] = events.poll() is not None
        result['nodeReaped'] = child is None or child.poll() is not None
        if (E / 'chrome-processes.json').exists():
            pids = [int(p['id']) for p in json.loads((E / 'chrome-processes.json').read_text())['processInfo']]
            live = set(int(line.strip()) for line in command(['ps', '-axo', 'pid=']).decode().splitlines())
            result['chromePIDsRemaining'] = sorted(set(pids) & live)
            if result['chromePIDsRemaining']:
                result['window'] = 'UNCONFIRMED'
        result['stopReason'] = (E / 'STOP').read_text() if (E / 'STOP').exists() else None
        save('window-release.json', result)
        if not all([result['candidateIdentityUnchanged'], result['oldIdentitiesUnchanged'], result['oldFilesUnchanged']]) or result['pending'] or result.get('chromePIDsRemaining'):
            raise RuntimeError('postflight protection/pending failed')


if __name__ == '__main__':
    main()
