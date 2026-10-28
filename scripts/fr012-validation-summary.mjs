// Compact successful check output avoids the runtime response size truncating earlier suites.
// The shell emits complete output and nonzero exit status on any failure.
import fs from 'node:fs';
const text=fs.readFileSync('.fr012-check.log','utf8');
const lines=text.split('\n').filter(line=>/^# (tests |suites |pass |fail |cancelled |skipped |todo |duration_ms )/.test(line)||/^# Subtest: FR0(?:12|31)|^ok \d+ - FR0(?:12|31)|^CSV validation|^v\d|^\d+\.\d+\.\d+$|^> |vulnerabilit|warning|Warning|built in|modules transformed|^dist\//.test(line));
console.log(lines.join('\n')||text.slice(-2000));
