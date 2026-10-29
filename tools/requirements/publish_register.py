"""Commit only requirement governance documents/tools; never merge app code."""
import hashlib
import json
import urllib.error
from pathlib import Path
from export_register import ROOT, DOCS, api

def git_blob_sha(content):
    return hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()

def publish():
    files = {}
    for folder in [ROOT / 'docs/requirements', ROOT / 'tools/requirements']:
        for path in sorted(folder.rglob('*')):
            if path.is_file() and path.suffix in {'.json', '.csv', '.md', '.py'}:
                files[path.relative_to(ROOT).as_posix()] = path.read_bytes()
    baseline = json.loads(files['docs/requirements/baselines/APS-BL-001-v0.3.json'])
    changes = json.loads(files['docs/requirements/changes/change-register.json'])['changes']
    current = json.loads(files['docs/requirements/current-register.json'])
    assert len(baseline['requirements']) == len(current['requirements']) == 61
    assert len({r['id'] for r in baseline['requirements']}) == 61
    assert all(c['primary_requirements'] and c['request_quote'] and c['approved_by'] for c in changes)
    repo = '/repos/huiliangtao666/APS'
    for attempt in range(3):
        parent = api(repo + '/git/ref/heads/main')['object']['sha']
        commit = api(repo + '/git/commits/' + parent)
        remote_tree = api(repo + '/git/trees/' + commit['tree']['sha'] + '?recursive=1')
        assert not remote_tree.get('truncated'), 'Refuse incomplete tree'
        existing = {x['path']: x['sha'] for x in remote_tree['tree'] if x['type'] == 'blob'}
        tree_entries = []
        for name, content in files.items():
            digest = git_blob_sha(content)
            if name.startswith('docs/requirements/baselines/') and name in existing:
                assert existing[name] == digest, 'Immutable baseline changed: ' + name
            if existing.get(name) != digest:
                tree_entries.append({'path': name, 'mode': '100644', 'type': 'blob', 'content': content.decode('utf-8')})
        if not tree_entries:
            print('No content changes; no duplicate commit')
            return parent
        tree = api(repo + '/git/trees', {'base_tree': commit['tree']['sha'], 'tree': tree_entries}, 'POST')
        new_commit = api(repo + '/git/commits', {'message': 'docs: establish v0.3 requirement baseline and approved change registers', 'tree': tree['sha'], 'parents': [parent]}, 'POST')
        try:
            api(repo + '/git/refs/heads/main', {'sha': new_commit['sha'], 'force': False}, 'PATCH')
        except urllib.error.HTTPError as error:
            if error.code in {409, 422} and api(repo + '/git/ref/heads/main')['object']['sha'] != parent:
                continue
            raise
        verified = api(repo + '/git/trees/' + new_commit['sha'] + '?recursive=1')
        actual = {x['path']: x['sha'] for x in verified['tree'] if x['type'] == 'blob'}
        for name, content in files.items():
            assert actual.get(name) == git_blob_sha(content), name
        Path(ROOT / 'last-published.json').write_text(json.dumps({'commit': new_commit['sha'], 'paths': sorted(files)}, indent=2))
        print('Verified GitHub commit', new_commit['sha'], 'files', len(files), 'changed', len(tree_entries), flush=True)
        return new_commit['sha']
    raise RuntimeError('Main moved repeatedly; no force push performed')

if __name__ == '__main__':
    publish()
