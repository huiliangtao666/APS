"""Update metadata on existing canonical cards; never create or change Status."""
import json
import urllib.error
from pathlib import Path
from export_register import DOCS, gql, project_snapshot

def synchronize():
    register = json.loads((DOCS / 'current-register.json').read_text())
    p = project_snapshot()
    field_names = ['需求编号', '基线版本', '当前要求版本', '生效CR', '当前环节', '阻塞原因', '验收结论', '交付代码SHA', '跟踪记录']
    fields = {f['name']: f for f in p['fields']['nodes'] if f.get('name')}
    for name in field_names:
        if name not in fields:
            result = gql('mutation($p:ID!,$n:String!){createProjectV2Field(input:{projectId:$p,name:$n,dataType:TEXT}){projectV2Field{... on ProjectV2Field{id name dataType}}}}', {'p': p['id'], 'n': name})
            f = result['createProjectV2Field']['projectV2Field']
            assert f['name'] == name and f['dataType'] == 'TEXT'
            fields[name] = f
            print('Created metadata field', name, flush=True)
        assert fields[name].get('dataType') == 'TEXT', 'Existing field has incompatible type: ' + name
    existing = {n['id']: {v['field']['name']: v.get('text', v.get('name', '')) for v in n['fieldValues']['nodes'] if v.get('field')} for n in p['items']['nodes']}
    expected = {}
    updates = []
    for r in register['requirements']:
        values = {'需求编号': r['id'], '基线版本': r['baseline_version'], '当前要求版本': r['current_version'], '生效CR': '、'.join(r['applied_changes']), '当前环节': r['current_phase'], '阻塞原因': r['blocker'], '验收结论': r['acceptance_result'], '交付代码SHA': r['code_reference'], '跟踪记录': 'https://github.com/huiliangtao666/APS/blob/main/docs/requirements/requirements-register.md'}
        item = r['canonical']['item_id']
        expected[item] = values
        for name, value in values.items():
            if existing[item].get(name, '') != value:
                assert len(value) < 1000
                updates.append((item, fields[name]['id'], value))
    for start in range(0, len(updates), 6):
        batch = updates[start:start + 6]
        operations = []
        for i, (item, field, value) in enumerate(batch):
            args = 'projectId:' + json.dumps(p['id']) + ',itemId:' + json.dumps(item) + ',fieldId:' + json.dumps(field)
            if value:
                operations.append('m' + str(i) + ':updateProjectV2ItemFieldValue(input:{' + args + ',value:{text:' + json.dumps(value, ensure_ascii=False) + '}}){projectV2Item{id}}')
            else:
                operations.append('m' + str(i) + ':clearProjectV2ItemFieldValue(input:{' + args + '}){projectV2Item{id}}')
        for attempt in range(3):
            try:
                # Setting the same value is idempotent if a gateway loses a response.
                gql('mutation{' + ' '.join(operations) + '}')
                break
            except urllib.error.HTTPError as error:
                if error.code not in {502, 503, 504} or attempt == 2:
                    raise
        print('Synced metadata', min(start + len(batch), len(updates)), '/', len(updates), flush=True)
    verified = project_snapshot()
    for n in verified['items']['nodes']:
        if n['id'] not in expected:
            continue
        actual = {v['field']['name']: v.get('text', v.get('name', '')) for v in n['fieldValues']['nodes'] if v.get('field')}
        for name, value in expected[n['id']].items():
            assert actual.get(name, '') == value, (n['id'], name)
    print('Verified all metadata for 61 unique existing requirements; no new cards; Status untouched', flush=True)

if __name__ == '__main__':
    synchronize()
