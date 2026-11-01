"""Read-only 18252 preflight and guardian for one native diagnostic process.

No container lifecycle calls, request substitutions, state writes, or retries.
The evidence directory must contain fresh owner release records, supplied only
after reading both original issue threads. A failed gate never starts Chrome.
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import signal
import subprocess
import threading
import time
import urllib.request

CONTAINER = 'aps-test-b15-runtime-48e0766-17'
PRODUCT = '48e0766d9733eff99f9bc3f0718639aab89fcf0e'
PARENT = '4bd4972efb45a2c5892107fdc6011203ace4a14e'
PROFILE = '01a2e0941761716b5f46d688ad06128fafc4fe896653d5ab294fc2b593d9aad3'
STORE = '2e8b91eadb8628671ea0bbbaafc1877758807f820757249ed3044c90fe27752d'
ROOT = pathlib.Path(__file__).resolve().parents[3]


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    h = hashlib.sha256()
    with pathlib.Path(path).open('rb') as stream:
        while chunk := stream.read(65536):
            h.update(chunk)
    return {'bytes': pathlib.Path(path).stat().st_size, 'sha256': h.hexdigest()}


def identity(inspect):
    state = inspect['State']
    return {key: inspect[key] for key in ['Id', 'RestartCount']} | {
        key: state[key] for key in ['Pid', 'StartedAt', 'Status', 'Running']
    }


def require_identity(before, after):
    if identity(before) != identity(after):
        raise RuntimeError('container identity/PID/Started/restart drift')


def require_terminal(store):
    expected = {'plans': 11, 'runs': 7, 'trials': 4, 'inputVersions': 5, 'records': 84}
    actual = {key: len(store[key]) for key in expected}
    if actual != expected:
        raise RuntimeError('original object counts drift: ' + str(actual))
    if any(run['status'] not in ['completed', 'partial', 'failed', 'cancelled', 'timed_out'] for run in store['runs']):
        raise RuntimeError('pending Worker')
    return actual


def descendant_pids(root_pid):
    """Track only this invocation's child tree, including a pending launch."""
    rows = subprocess.check_output(['ps', '-axo', 'pid=,ppid='], timeout=5).decode().splitlines()
    parents = {int(row.split()[0]): int(row.split()[1]) for row in rows if len(row.split()) == 2}
    found = {root_pid}
    while True:
        more = {pid for pid, parent in parents.items() if parent in found}
        if more.issubset(found):
            return found - {root_pid}
        found.update(more)


def run(args):
    evidence = pathlib.Path(args.evidence).resolve()
    evidence.mkdir(parents=True, exist_ok=True)

    def save(name, value):
        (evidence / name).write_text(json.dumps(value, ensure_ascii=False, indent=2))

    def command(argv, timeout=15):
        return subprocess.check_output(argv, timeout=timeout)

    def inspect():
        return json.loads(command(['docker', 'inspect', CONTAINER]))[0]

    def snapshot():
        state = ROOT / 'temp/b15-runtime-state-17'
        return [{'path': str(path.relative_to(ROOT)), **digest(path)} for path in sorted(state.rglob('*')) if path.is_file()]

    def get(path, expected_hash=None):
        with urllib.request.urlopen('http://127.0.0.1:18252' + path, timeout=15) as response:
            body = response.read()
            if response.status != 200 or 'json' not in response.headers.get('Content-Type', ''):
                raise RuntimeError('non-JSON endpoint ' + path)
        if expected_hash and hashlib.sha256(body).hexdigest() != expected_hash:
            raise RuntimeError('hash mismatch ' + path)
        (evidence / ('preflight-' + path.replace('/', '_') + '.json')).write_bytes(body)
        return json.loads(body)

    # These are original owner release facts, never inferred from an old QA pass.
    window = json.loads((evidence / 'window-authority.json').read_text())
    if not all(window.get(key) for key in ['dev45_final_released', 'qa48_this_round_released', 'no_owned_or_pending']):
        raise RuntimeError('serial predecessors have not released')
    if time.time() - window['readEpoch'] > 60:
        raise RuntimeError('release evidence must be freshly re-read')
    first = inspect()
    if not first['State']['Running']:
        raise RuntimeError('runtime not running')
    save('identity-before.json', identity(first))
    config_hash = hashlib.sha256(json.dumps({key: first[key] for key in ['Config', 'HostConfig', 'Mounts']}, sort_keys=True).encode()).hexdigest()
    save('config-fingerprint.json', {'sha256': config_hash, 'containerID': first['Id']})
    events = subprocess.Popen(['docker', 'events', '--since', str(int(time.time())), '--filter', 'container=' + first['Id'], '--format', '{{json .}}'], stdout=subprocess.PIPE, stderr=(evidence / 'docker-events.stderr').open('wb'), text=True)
    fatal = threading.Event()
    monitor_shutdown = threading.Event()
    reasons = []
    child = None
    owned = set()
    sampled = []

    def stop(reason):
        if not fatal.is_set():
            reasons.append({'utc': utc(), 'reason': reason})
            (evidence / 'STOP').write_text(reason)
            save('supervisor-first-stop.json', reasons[0])
            fatal.set()

    def stream_events():
        with (evidence / 'docker-events.jsonl').open('a') as stream:
            for line in events.stdout:
                stream.write(line); stream.flush()
                try:
                    event = json.loads(line)
                    if event.get('Action', event.get('status')) in ['oom', 'die', 'restart', 'start', 'stop', 'kill', 'pause', 'unpause', 'destroy']:
                        stop('Docker lifecycle event: ' + line.strip())
                except ValueError:
                    stop('unreadable Docker event')
        if not monitor_shutdown.is_set():
            stop('Docker event subscription exited')

    thread = threading.Thread(target=stream_events, daemon=True)
    thread.start()
    before = None
    result = {'window': 'RELEASED', 'owned': [], 'pending': 0, 'browserStarted': False}
    try:
        # Six current samples also establish the new 08:22 runtime identity.
        for index in range(6):
            current = inspect(); require_identity(first, current)
            raw = command(['docker', 'exec', CONTAINER, 'cat', '/proc/meminfo', '/sys/fs/cgroup/memory.events']).decode()
            available = int(next(line.split()[1] for line in raw.splitlines() if line.startswith('MemAvailable:')))
            sampled.append({'utc': utc(), 'MemAvailableKiB': available, 'identity': identity(current), 'raw': raw})
            save('capacity-six.json', sampled)
            if available < 640 * 1024 or fatal.is_set():
                raise RuntimeError('capacity/event gate failed')
            if index < 5:
                time.sleep(1)
        before = snapshot(); save('protected-before.json', before)
        store_path = ROOT / 'temp/b15-runtime-state-17/business.json'
        if digest(store_path)['sha256'] != STORE:
            raise RuntimeError('original state hash drift')
        counts = require_terminal(json.loads(store_path.read_text()))
        save('counts-before.json', counts)
        old = json.loads((ROOT / 'temp/b15-uat17-entry/protected-before.json').read_text())
        if before != old:
            raise RuntimeError('original persistent files drift')
        metadata = get('/__qa/source-manifest.json')
        if metadata['productSha'] != PRODUCT or metadata['parent'] != PARENT or metadata['buildSource'] != PRODUCT:
            raise RuntimeError('fixed source provenance drift')
        build = get('/api/uat-build')
        if build['stateHash'] != STORE or build['productSha'] != PRODUCT:
            raise RuntimeError('uat-build state/source drift')
        get('/fixtures/17/PROFILE.json', PROFILE)
        # Stream every source/UI/profile/adapter hash in place, without a build.
        audit_script = (ROOT / 'temp/b15-uat17-entry/audit-runtime.mjs').read_bytes()
        audit = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'node', '--input-type=module', '-'], input=audit_script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
        (evidence / 'runtime-hash-audit.json').write_bytes(audit.stdout)
        (evidence / 'runtime-hash-audit.stderr').write_bytes(audit.stderr)
        if audit.returncode:
            raise RuntimeError('fixed source/UI/profile/adapter hash audit failed')
        save('native-retained.json', {'path': 'temp/b15-runtime-evidence/runtime-17-native.csv', **digest(ROOT / 'temp/b15-runtime-evidence/runtime-17-native.csv')})
        require_identity(first, inspect())
        if fatal.is_set():
            raise RuntimeError('preflight event stop')
        save('admission.json', {'allowed': True, 'utc': utc(), 'expiresEpochMs': (time.time() + 20) * 1000, 'identity': identity(first), 'singleContext': True, 'maxMinutes': 15})
        env = os.environ.copy(); env['B15_ENTRY_EVIDENCE'] = str(evidence)
        child = subprocess.Popen(['node', str(pathlib.Path(__file__).with_name('b15-runtime-entry-diagnostic.cjs'))], env=env, stdout=(evidence / 'browser.stdout').open('wb'), stderr=(evidence / 'browser.stderr').open('wb'), start_new_session=True)
        result['browserStarted'] = True
        deadline = time.monotonic() + 15 * 60
        stop_at = None
        with (evidence / 'pid-monitor.jsonl').open('a') as process_log:
            while child.poll() is None:
                owned.update(descendant_pids(child.pid))
                save('owned-processes.json', {'nodePID': child.pid, 'descendantPIDs': sorted(owned), 'utc': utc()})
                current = inspect()
                process_log.write(json.dumps({'utc': utc(), **identity(current)}) + '\n'); process_log.flush()
                try:
                    require_identity(first, current)
                except RuntimeError as error:
                    stop(str(error))
                process_file = evidence / 'chrome-processes.json'
                if process_file.exists():
                    try:
                        owned.update(int(row['id']) for row in json.loads(process_file.read_text()).get('processInfo', []))
                    except (ValueError, KeyError):
                        pass
                if (evidence / 'first-stop.json').exists() or time.monotonic() >= deadline:
                    if not fatal.is_set():
                        stop('browser first stop or 15 minute deadline')
                if fatal.is_set():
                    if stop_at is None:
                        stop_at = time.monotonic()
                    if time.monotonic() - stop_at > 8:
                        # Only this invocation's recorded Chrome processes and Node group.
                        for pid in owned:
                            try:
                                os.kill(pid, signal.SIGTERM)
                            except ProcessLookupError:
                                pass
                        os.killpg(child.pid, signal.SIGTERM)
                time.sleep(0.25)
        result['nodeExitCode'] = child.wait(timeout=10)
        result['nodeReaped'] = True
    except Exception as error:
        stop(str(error)); result['failure'] = str(error)
    finally:
        if child and child.poll() is None:
            stop('supervisor finally')
            try:
                child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                for pid in owned:
                    try:
                        os.kill(pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=3)
            result['nodeReaped'] = True
        monitor_shutdown.set()
        events.terminate()
        try:
            events.wait(timeout=3)
        except subprocess.TimeoutExpired:
            events.kill(); events.wait(timeout=3)
        thread.join(timeout=2)
        result['eventMonitorReaped'] = True
        remaining = []
        for pid in sorted(owned):
            try:
                os.kill(pid, 0); remaining.append(pid)
            except ProcessLookupError:
                pass
        result['owned'] = remaining
        result['pending'] = len(remaining)
        result['window'] = 'RELEASED' if not remaining else 'CLEANUP_REQUIRED'
        result['utc'] = utc(); result['stopReasons'] = reasons
        after = snapshot(); save('protected-after.json', after)
        result['allPersistentFilesUnchanged'] = before is not None and before == after
        current = inspect(); save('identity-after.json', identity(current))
        result['sameIdentity'] = identity(first) == identity(current)
        result['countsAfter'] = require_terminal(json.loads((ROOT / 'temp/b15-runtime-state-17/business.json').read_text()))
        save('window-release.json', result)
    print(json.dumps(result))
    return 0 if result.get('nodeExitCode') == 0 and result['allPersistentFilesUnchanged'] and result['sameIdentity'] and not reasons and not result['owned'] else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', required=True)
    raise SystemExit(run(parser.parse_args()))
