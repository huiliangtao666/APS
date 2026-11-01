#!/usr/bin/env python3
"""Offline preparation and exact approved binding/rollback commands; never publish."""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess

APP_ID = 'qa-fr006-main-3d164d5'
TARGET = '/workspace/apps/qa17-0afa-user-entry'
LAUNCH = 'node b15-user-preview-server.mjs'
FILES = ['core.mjs', 'lock.json', 'client.js', 'server.mjs', 'launch.py']


def commands(wab):
    script = str(pathlib.Path(wab) / 'scripts/publish-app.sh')
    return {
        'bind': [script, 'container', APP_ID, TARGET, '4318', 'node', LAUNCH],
        'rollback': [script, 'container', APP_ID, '/workspace/apps/qa-fr006-main-3d164d5', '3000', 'vite', 'npm run dev'],
        'rollback_data_policy': 'Restore binding configuration only. No state/auth/native/history restore, deletion or old-instance stop. Keep new user data.',
        'preview': [str(pathlib.Path(wab).parent / 'lite-app-scaffold/scripts/dev-preview.sh')],
        'activation': 'NOT_EXECUTED; one approval for prepare + bind + official dev-preview + gate verification + reviewed deployment config; no publication',
        'user_url': 'Only platform devBase / printed Workbench URL, preserving public origin and deployment prefix. Never internal upstream or Agent Browser URL.',
    }


def prepare(destination):
    dest = pathlib.Path(destination)
    dest.mkdir(parents=True, exist_ok=True)
    for suffix in FILES:
        source = pathlib.Path(__file__).with_name('b15-user-preview-' + suffix)
        target = dest / source.name
        if target.exists() and target.read_bytes() != source.read_bytes():
            raise ValueError('refuse to overwrite differing prepared file: ' + str(target))
        if not target.exists():
            shutil.copy2(source, target)


def configure(destination, dev_base, origin, gate_evidence):
    """After actual platform gate verification; flags are not proof of user permission."""
    gate = json.loads(pathlib.Path(gate_evidence).read_text())
    if (gate.get('workspaceId') != 'APS-Test' or gate.get('devBase') != dev_base or
            gate.get('origin') != origin or gate.get('anonymousStatus') != 401 or
            gate.get('authorizedSessionStatus') not in (200, 503) or not gate.get('platformOnlyIngressVerified')):
        raise ValueError('actual workspace-session gate evidence required; keep preview closed')
    config = {'mode': 'workspace-preview', 'candidate': 'integrated0afa',
              'workspaceId': 'APS-Test', 'unpublished': True,
              'ingress': 'platform-workspace-session-only', 'platformGateVerified': True,
              'gateEvidence': str(pathlib.Path(gate_evidence).resolve()), 'base': dev_base, 'origin': origin}
    # Core validates exact HTTPS origin and canonical platform prefix at load.
    target = pathlib.Path(destination) / 'b15-user-preview-deployment.json'
    if target.exists():
        raise ValueError('refuse to replace reviewed deployment; use a deliberate reconfiguration')
    target.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    target.chmod(0o600)


def snapshot(state_root, destination):
    """Future exclusive-window copy only. No restore operation exists here."""
    source, dest = pathlib.Path(state_root).resolve(), pathlib.Path(destination).resolve()
    if source == dest or source in dest.parents or dest.exists():
        raise ValueError('snapshot must be a new directory outside live state')
    if not source.is_dir():
        raise ValueError('state root must exist')
    files = list(source.rglob('*'))
    if any(p.is_symlink() or (not p.is_dir() and not p.is_file()) for p in files):
        raise ValueError('refuse symlink or nonregular state entry')
    if sum(p.stat().st_size for p in files if p.is_file()) > 128 * 1024 * 1024:
        raise ValueError('snapshot size exceeds bounded preview budget')
    shutil.copytree(source, dest)
    dest.chmod(0o700)
    manifest = []
    for p in sorted(dest.rglob('*')):
        p.chmod(0o700 if p.is_dir() else 0o600)
        if p.is_file():
            h = hashlib.sha256()
            with p.open('rb') as stream:
                for chunk in iter(lambda: stream.read(65536), b''):
                    h.update(chunk)
            rel = str(p.relative_to(dest))
            original = hashlib.sha256()
            with (source / rel).open('rb') as stream:
                for chunk in iter(lambda: stream.read(65536), b''):
                    original.update(chunk)
            if original.hexdigest() != h.hexdigest():
                raise ValueError('state changed during snapshot; do not activate')
            manifest.append({'path': rel, 'bytes': p.stat().st_size, 'sha256': h.hexdigest()})
    # Save only inside the private snapshot; never publish auth/state evidence.
    record = dest / 'B15-PREVIEW-SNAPSHOT-MANIFEST.json'
    if record.exists():
        raise ValueError('manifest name collision')
    record.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    record.chmod(0o600)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['plan', 'prepare', 'configure', 'snapshot', 'bind', 'rollback'])
    parser.add_argument('--wab-dir', default=str(pathlib.Path(__file__).resolve().parents[3] / '.codex/skills/workspace-app-builder'))
    parser.add_argument('--destination')
    parser.add_argument('--state-root')
    parser.add_argument('--dev-base')
    parser.add_argument('--origin')
    parser.add_argument('--gate-evidence')
    parser.add_argument('--execute-approved', action='store_true')
    args = parser.parse_args()
    plan = commands(args.wab_dir)
    if args.action == 'prepare':
        if not args.destination:
            parser.error('--destination required; use own preparation directory until activation approved')
        prepare(args.destination)
    elif args.action == 'configure':
        if not args.execute_approved or not all([args.destination, args.dev_base, args.origin, args.gate_evidence]):
            parser.error('configure needs --execute-approved --destination --dev-base --origin --gate-evidence')
        configure(args.destination, args.dev_base, args.origin, args.gate_evidence)
    elif args.action == 'snapshot':
        if not args.execute_approved or not args.state_root or not args.destination:
            parser.error('snapshot needs --execute-approved --state-root LIVE --destination NEW_PRIVATE_DIRECTORY; exclusive state window required')
        snapshot(args.state_root, args.destination)
    elif args.action in ('bind', 'rollback') and args.execute_approved:
        # This flag is only a deliberate operator command, never evidence of approval.
        raise SystemExit(subprocess.call(plan[args.action]))
    else:
        print(json.dumps(plan if args.action == 'plan' else plan[args.action], ensure_ascii=False, indent=2))
