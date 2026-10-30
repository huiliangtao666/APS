#!/usr/bin/env python3
"""Build the static acceptance harness in disposable app runtime copies.
Run from workspace root; no publish, binding, identity, or preview mutation.
"""
import base64, gzip, hashlib, pathlib, shlex, subprocess

root = pathlib.Path.cwd()
repo = root / 'apps/aps-fr033'
pinned = 'AXIS-LABEL-03-R1-WORKING-SOURCE'
sources = ['src/TimelinePanel.tsx', 'src/lib/timetable.mjs', 'src/index.css']
# SHA256 source manifest accompanies working-source harness.
scratch = root / 'temp/fr033-axis-r1/build'
scratch.mkdir(parents=True, exist_ok=True)
install = '''node -e 'const fs=require("fs");for(const f of ["package.json","package-lock.json"])fs.writeFileSync(f,fs.readFileSync(f,"utf8").replaceAll("file:../../.praetor/sdk/","file:/workspace/.praetor/sdk/"));' && npm ci'''
build = 'npx esbuild qa/axis-browser.tsx --bundle --minify --define:process.env.NODE_ENV=\\"production\\" --format=esm --jsx=automatic --outfile=.browser/harness.js'
emit = '''const fs=require("fs");const html='<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FR033 AXIS-LABEL-03 repair R1</title><style>'+fs.readFileSync(".browser/harness.css","utf8")+'</style><div id="root"></div><script type="module">'+fs.readFileSync(".browser/harness.js","utf8").replaceAll('</script','<\\/script')+'</script></html>';console.log("HARNESS_BASE64="+require("zlib").gzipSync(html).toString("base64").slice(START,END));'''
parts = []
# Exec returns a bounded tail. Emit <30KB per build; never silently accept truncation.
for i in range(3):
    command = install + ' && ' + build + ' && node -e ' + shlex.quote(emit.replace('START', str(i*30000)).replace('END', str((i+1)*30000)))
    result = subprocess.run(['bash', str(root / '.codex/skills/workspace-app-builder/scripts/app-exec.sh'), '--validate', '--mode', 'standalone', '--cwd', '/workspace/apps/aps-fr033', '--timeout-ms', '240000', command], capture_output=True, text=True, check=True)
    lines = result.stdout.splitlines()
    payload = [line.removeprefix('HARNESS_BASE64=') for line in lines if line.startswith('HARNESS_BASE64=')]
    assert len(payload) == 1, 'Missing or truncated runtime artifact'
    parts.append(payload[0])
    (scratch / f'build-{i}.log').write_text('\n'.join(line for line in lines if not line.startswith('HARNESS_BASE64=')) + result.stderr)
html = gzip.decompress(base64.b64decode(''.join(parts), validate=True))
assert pinned.encode() in html and b'FR033' in html
out = root / 'FR-033-AXIS-LABEL-03-R1-HARNESS.html'
out.write_bytes(html)
print(f'{out.name}: {len(html)} bytes; sha256={hashlib.sha256(html).hexdigest()}')
