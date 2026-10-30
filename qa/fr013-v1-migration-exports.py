"""Independently parse API/native UI CSV bytes from the scoped migration runner."""
import csv
import hashlib
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
results = []
for mode in ['api', 'ui']:
    for kind in ['tool', 'personnel']:
        old = json.loads((root / f'parent-{kind}-business.json').read_text())
        current = (json.loads((root / f'changed-{kind}-business.json').read_text())['data']
                   if mode == 'api' else
                   json.loads((root / f'ui-new-{kind}.json').read_text())['input']['executionData'])
        for historical in [False, True]:
            filename = kind + ('-ui' if mode == 'ui' else '') + ('-historical.csv' if historical else '-current.csv')
            file = root / filename
            with file.open(encoding='utf-8-sig', newline='') as stream:
                rows = list(csv.DictReader(stream))
            expected = (old['data'] if historical else current)['resourceMappings']
            if mode == 'ui':
                expected = expected[:1]  # Actual UI filter selects first configuration ID.
            assert len(rows) == len(expected), (filename, 'row count')
            for actual, source in zip(rows, expected):
                for field, value in source.items():
                    if field.endswith('JSON') and value:
                        for key, leaf in json.loads(value).items():
                            assert str(leaf) in actual[field], (filename, field, key, leaf)
                    elif field.endswith('JSON') and not value:
                        assert actual[field] == '无附加参数', (filename, field)
                    else:
                        assert actual[field] == value, (filename, field, actual[field], value)
                assert actual['适用产线'] == 'L01'
                assert '模拟' in actual['模拟说明']
                assert '2026-11-02T08:00:00+08:00' in actual['分钟基准']
                if historical:
                    assert actual['原始输入版本SHA256'] == old['plans'][0]['inputVersionId']
                    assert actual['关联方案编号'] == old['plans'][0]['id']
            results.append({'file': filename, 'result': 'PASS', 'rows': len(rows),
                            'allLiteralFields': True, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
(root / 'export-verification.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print('INDEPENDENT_CSV_PASS', len(results))
