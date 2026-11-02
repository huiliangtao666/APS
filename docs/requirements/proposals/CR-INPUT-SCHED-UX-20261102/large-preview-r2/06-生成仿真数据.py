"""Design-only fixture generator. Stdlib; writes scratch JSONL, not real Excel/UAT.
Usage: python3 06-生成仿真数据.py --records 1830 --out temp/mock-fields.jsonl
Both record and field counts must be validated independently against 06 JSON.
"""
import argparse
import json
from pathlib import Path


def record(i):
    op = ('insert', 'update', 'delete')[i % 3]
    table = f'T{i % 29 + 1:02}'
    row = i // 29 + 2
    return dict(changeId=f'C{i + 1:06}', tableId=table, key=f'R-{i + 1:06}',
                operation=op, changedFieldCount=4,
                sourceRef=dict(sheet=f'仿真表_{table}', row=row))


def fields(i):
    r = record(i)
    for j in range(1, 5):
        before = None if r['operation'] == 'insert' else f'f{j}_before_{i}'
        after = None if r['operation'] == 'delete' else f'f{j}_after_{i}'
        yield dict(**r, fieldId=f'f{j}', before=before, after=after,
                   beforePresence='missing' if before is None else 'value',
                   afterPresence='missing' if after is None else 'value',
                   type='string', unit=None, changed=True,
                   cell=f'{chr(65 + j)}{r["sourceRef"]["row"]}', simulation=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--records', type=int, choices=[1830, 7320], default=1830)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with a.out.open('w', encoding='utf-8') as f:
        for i in range(a.records):
            for field in fields(i):
                f.write(json.dumps(field, ensure_ascii=False) + '\n')
    print(json.dumps(dict(simulation=True, records=a.records, fields=a.records * 4)))
