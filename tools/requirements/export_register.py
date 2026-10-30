"""Refresh derived registers from controlled baseline/CR files and live Project."""
import argparse
import csv
import datetime
import io
import json
import os
import re
import urllib.request
from pathlib import Path
from workbook import write_workbook

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs/requirements'
REPO = 'huiliangtao666/APS'
API = 'https://api.github.com'

def api(path, data=None, method=None):
    headers = {'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'], 'Content-Type': 'application/json'}
    if path.startswith('https://'):
        assert path.startswith(API + '/'), 'Do not send GitHub credentials to another origin'
        url = path
    else:
        assert path.startswith('/')
        url = API + path
    request = urllib.request.Request(url, data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
    return json.load(urllib.request.urlopen(request, timeout=45))

def gql(query, variables=None):
    data = api('/graphql', {'query': query, 'variables': variables or {}})
    if data.get('errors'):
        raise RuntimeError(data['errors'])
    return data['data']

def project_snapshot():
    query = 'query($after:String) { user(login:"huiliangtao666") { projectV2(number:2) { id fields(first:50){nodes{... on ProjectV2Field{id name dataType} ... on ProjectV2SingleSelectField{id name}}} items(first:25,after:$after){pageInfo{hasNextPage endCursor} nodes{id fieldValues(first:40){nodes{... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{name}}} ... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2Field{name}}}}} content{... on DraftIssue{id title body} ... on Issue{id number title body state}}}}}}}'
    after = None
    project = None
    nodes = []
    for _ in range(100):
        page = gql(query, {'after': after})['user']['projectV2']
        if project is None:
            project = page
        assert project['id'] == page['id'] == 'PVT_kwHOFM9WU84BpE1c', 'Refuse a non-canonical Project'
        nodes.extend(page['items']['nodes'])
        info = page['items']['pageInfo']
        if not info['hasNextPage']:
            assert len(nodes) == len({n['id'] for n in nodes}), 'Duplicate paginated items'
            project['items'] = {'nodes': nodes, 'pageInfo': info}
            return project
        assert info['endCursor'] and info['endCursor'] != after, 'Pagination did not advance'
        after = info['endCursor']
    raise RuntimeError('Project pagination limit exceeded; refuse incomplete export')

def markdown_table(headers, rows):
    def escape(v):
        return str(v or '').replace('|', '\\|').replace('\n', '<br>')
    return '\n'.join(['| ' + ' | '.join(map(escape, headers)) + ' |', '| ' + ' | '.join(['---'] * len(headers)) + ' |'] + ['| ' + ' | '.join(map(escape, row)) + ' |' for row in rows])

def write_csv(name, headers, rows):
    output = io.StringIO(newline='')
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    (DOCS / name).write_text(output.getvalue(), encoding='utf-8-sig')

def export(workbook_path=None, refresh=True):
    baseline = json.loads((DOCS / 'baselines/APS-BL-001-v0.3.json').read_text())
    changes = json.loads((DOCS / 'changes/change-register.json').read_text())['changes']
    ownership_path = DOCS / 'uat-ownership.json'
    ownership = json.loads(ownership_path.read_text()) if ownership_path.exists() else {}
    uat_owner = ownership.get('business_owner', '')
    p = project_snapshot() if refresh else json.loads((ROOT / 'project-snapshot.json').read_text())
    stamp = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec='seconds')
    (ROOT / 'project-snapshot.json').write_text(json.dumps(p, ensure_ascii=False))
    nodes = {n['id']: n for n in p['items']['nodes']}
    requirements = []
    open_issues = {i['number'] for i in api('/repos/' + REPO + '/issues?state=open&per_page=100')}
    for b in baseline['requirements']:
        n = nodes[b['canonical']['item_id']]
        fields = {f['field']['name']: f.get('name', f.get('text', '')) for f in n['fieldValues']['nodes'] if f.get('field')}
        body = n['content']['body']
        related = [c for c in changes if b['id'] in c['primary_requirements'] + c['related_rules']]
        applied = [c for c in related if c.get('effective') and c['approval_status'].startswith('已批准')]
        status = fields.get('Status', '')
        phase = {'Backlog': '尚未开始；按当前批准范围和依赖调度', 'Ready': '待开始；按当前批准范围和依赖调度', 'Done': '原卡已完成；按历史验收范围', 'In review': '等待/进行任务级自测或QA整体测试', 'In progress': '实施或验收未闭环，见原卡/关联Issue'}.get(status, '状态待登记')
        blocker = ''
        acceptance = '未登记原需求完整版本验收；有限通过证据见原卡'
        if status == 'Done':
            acceptance = '原卡Done，保留原通过记录；不推定完整业务UAT通过'
        if b['type'] == '业务规则':
            phase = '按关联功能/阶段实施；规则独立验收结论待登记'
            acceptance = '不得从规则卡Backlog推断功能未实现；需逐规则证据'
        issue_ids = sorted(set(int(s) for s in re.findall(r'github\.com/huiliangtao666/APS/issues/(\d+)', body)) & open_issues)
        if status == 'In progress' and not related:
            blocker = '完整验收证据/业务决策/跨功能依赖待闭环；具体见原卡及Issue'
        if applied:
            latest = applied[-1]
            phase = '；'.join(c['id'] + '：' + c['implementation_status'] for c in applied)
            blocker = '；'.join(c['id'] + '：' + c['acceptance_result'] for c in applied)
            linked = []
            for change in applied:
                for url in [change.get('issue_url','')] + change.get('related_issue_urls',[]):
                    linked.extend(int(x) for x in re.findall(r'/issues/(\d+)',url))
            issue_ids = sorted(set(issue_ids + linked))
            acceptance = '基线原范围历史记录保留；' + '；'.join(c.get('acceptance_status','本CR专项验收未完成') for c in applied)
        commits = list(dict.fromkeys(re.findall(r'(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])', body)))
        row = {**b, 'current_version': 'v0.3' + ''.join('+' + c['id'] for c in applied), 'applied_changes': [c['id'] for c in applied], 'pending_changes': [c['id'] for c in related if c not in applied], 'current_text': b['text'] + ''.join('\n\n[' + c['id'] + ' 批准增量]\n' + c['approved_delta'] for c in applied), 'project_status': status, 'current_phase': phase, 'blocker': blocker, 'acceptance_result': acceptance, 'accepted_requirement_version': '未统一登记版本签收；原卡通过范围及历史证据保留', 'code_reference': applied[-1]['code_sha'] if applied else (commits[-1] if commits else ''), 'code_reference_note': '原卡引用/Dev交付SHA，非本表新增的验收结论', 'issues': ['https://github.com/' + REPO + '/issues/' + str(i) for i in issue_ids], 'owner': 'APS-PM维护与调度；APS-Dev开发及任务级自测；APS-Test同担开发与任务级自测；APS-Test2暂停新任务；APS-QA主责整体/UAT；用户提供业务事实', 'snapshot_at': stamp}
        row['uat_owner'] = uat_owner
        if applied:
            row['current_text'] = b['text'] + ''.join('\n\n[' + c['id'] + ' 批准增量]\n' + c.get('requirement_deltas',{}).get(b['id'],c['approved_delta']) for c in applied)
            row['code_reference'] = next((c.get('code_sha') for c in reversed(applied) if c.get('code_sha')),(commits[-1] if commits else ''))
        accepted_records = list(re.finditer(r'<!-- aps-card-acceptance:(.*?) -->', body, re.S))
        accepted = accepted_records[-1] if accepted_records else None
        if accepted:
            record = json.loads(accepted.group(1))
            row['accepted_requirement_version'] = record['requirement_version'] + '；' + record['code_sha'] + '；' + record['test_delivery']
            row['acceptance_record'] = record
            if status == 'Done':
                row['code_reference'] = record['code_sha']
                row['code_reference_note'] = '原卡已验收版本；CR整体状态另见受控变更记录'
            if status == 'Done' and not applied:
                row['current_phase'] = '本卡适用需求已独立验收；历史复核与证据见原卡'
                row['blocker'] = ''
                row['acceptance_result'] = record['conclusion']
        reviewed_records = list(re.finditer(r'<!-- aps-card-review:(.*?) -->', body, re.S))
        reviewed = reviewed_records[-1] if reviewed_records else None
        if reviewed and status != 'Done':
            review = json.loads(reviewed.group(1))
            row['review_record'] = review
            row['current_phase'] = review['current_phase']
            row['blocker'] = review['blocker']
            row['acceptance_result'] = review['conclusion']
            row['code_reference'] = review['code_sha']
            row['code_reference_note'] = review.get('code_sha_status', '独立Test固定版本；结论见原卡review记录，不代表验收通过')
        # Current Project fields are maintained after the historical review markers.
        # Prefer them so a refreshed derivative does not resurrect an old blocker.
        if status != 'Done':
            for field, key in [('当前环节', 'current_phase'), ('阻塞原因', 'blocker'),
                               ('验收结论', 'acceptance_result'), ('交付代码SHA', 'code_reference')]:
                if fields.get(field):
                    row[key] = fields[field]
        if uat_owner:
            row['owner'] += '；UAT业务验收：' + uat_owner
        requirements.append(row)
    assert len(requirements) == 61 and len({r['id'] for r in requirements}) == 61
    register = {'schema_version': 1, 'snapshot_at': stamp, 'authority': 'Baseline/CR条文以受控JSON为准，实施状态以GitHub Project原卡为准；本表为派生快照', 'baseline_id': baseline['baseline_id'], 'requirements': requirements}
    (DOCS / 'current-register.json').write_text(json.dumps(register, ensure_ascii=False, indent=2) + '\n')
    bh = ['需求编号', '类型', '名称', '基线编号', '基线版本', '范围', '阶段', '基线条文', '原AC', '来源', '正文段落', '唯一原卡']
    br = [[r['id'], r['type'], r['title'], r['baseline_id'], r['baseline_version'], r['scope'], r['stage'], r['text'], '、'.join(r['acceptance_ids']) or '原规则未逐条指定', r['source'], r['source_paragraph'], r['canonical']['url']] for r in requirements]
    rh = ['需求编号', '名称', '基线版本', '当前要求版本', '生效CR', '当前有效要求', '原卡状态', '当前环节', '阻塞/待验收事项', '验收结论', '已验收版本记录', '代码引用SHA', '关联Issue', '责任分工', '唯一原卡', '快照时间']
    rr = [[r['id'], r['title'], r['baseline_version'], r['current_version'], '、'.join(r['applied_changes']), r['current_text'], r['project_status'], r['current_phase'], r['blocker'], r['acceptance_result'], r['accepted_requirement_version'], r['code_reference'], '\n'.join(r['issues']), r['owner'], r['canonical']['url'], stamp] for r in requirements]
    rh.insert(14, 'UAT负责人')
    for values in rr:
        values.insert(14, uat_owner)
    uh = ['UAT编号', '名称', '阶段及关联', 'UAT主责', '测试执行', '协调维护', '原场景条文', '来源段落', '用户角色']
    ur = [[u['id'], u['title'], u['context'], uat_owner, ownership.get('testing_workspace', 'APS-QA'), ownership.get('coordination_workspace', 'APS-PM'), u['content'], u['source_paragraph'], ownership.get('supporting_role', '用户')] for u in baseline['uat']]
    write_csv('uat-register.csv', uh, ur)
    (DOCS / 'uat-register.json').write_text(json.dumps({'snapshot_at': stamp, 'ownership': ownership, 'scenarios': [{**u, 'business_owner': uat_owner, 'testing_workspace': ownership.get('testing_workspace', 'APS-QA'), 'coordination_workspace': ownership.get('coordination_workspace', 'APS-PM'), 'preparation_workspace': ownership.get('preparation_workspace', 'APS-QA'), 'confirmation_workspace': ownership.get('confirmation_workspace', 'APS-QA'), 'supporting_role': ownership.get('supporting_role', '用户')} for u in baseline['uat']]}, ensure_ascii=False, indent=2) + '\n')
    (DOCS / 'uat-register.md').write_text('# UAT场景及负责人清单\n\n全部UAT准备、测试和确认主责：**' + uat_owner + '**。APS-QA主责UAT准备、测试、确认；用户配合。APS-PM在相应UAT依赖任务完成后调度QA并维护记录；APS-Dev承担开发和任务级自测，APS-Test同担开发与任务级自测；APS-Test2暂停新任务。职责调整不等于UAT已执行或通过。\n\n授权原话：“' + ownership.get('source_quote', '') + '”。责任分工源：[uat-ownership.json](uat-ownership.json)；原始场景仍以v0.3基线为准。\n\n' + markdown_table(uh, ur) + '\n')
    ch = ['CR编号', '标题', '类别', '原基线', '目标要求版本', '提出人', '提出日期', '授权原话', '批准状态', '批准人', '批准日期', '受影响FR', '关联BR/DEC', '变更前', '批准增量', '影响', '计划/工作量', '专项验收条件', '实施状态', 'Dev交付', 'Test任务', '代码SHA', '验收结论', '默认值及设计细化', '限制', '主Issue']
    cr = [[c['id'], c['title'], c['classification'], c['from_version'], c['target_version'], c['requested_by'], c['requested_on'], c['request_quote'], c['approval_status'], c['approved_by'], c['approved_on'], '、'.join(c['primary_requirements']), '、'.join(c['related_rules'] + c['decisions']), c['before'], c['approved_delta'], c['impact'], c['plan_impact'] + '；' + c['effort'], c['acceptance_delta'], c['implementation_status'], c['dev_delivery'], c['product_test_delivery'], c['code_sha'], c['acceptance_result'], c['design_detail_status'], c['limitations'], c['issue_url']] for c in changes]
    ch[20] = '产品Test任务'
    ch.insert(20, '设计/契约审查任务')
    ch.append('设计文档提交')
    for values, change in zip(cr, changes):
        values.insert(20, change.get('contract_review_delivery',''))
        values.append(change.get('design_commit',''))
    for name, headers, rows in [('baseline-register.csv', bh, br), ('requirements-register.csv', rh, rr), ('change-register.csv', ch, cr)]:
        write_csv(name, headers, rows)
    baseline_rows = [[r['id'], r['type'], r['title'], r['stage'], r['text'], '、'.join(r['acceptance_ids']), '[原卡](' + r['canonical']['url'] + ')'] for r in requirements]
    (DOCS / 'baseline-register.md').write_text('# APS-BL-001 v0.3 基线清单\n\n43项功能需求、18条业务规则；原文来源和SHA见[受控快照](baselines/APS-BL-001-v0.3.json)。不叠加CR、不以实现状态改写条文。\n\n' + markdown_table(['编号', '类型', '名称', '阶段', '基线要求', '原AC', '唯一原卡'], baseline_rows) + '\n')
    (DOCS / 'requirements-register.md').write_text('# 当前需求跟踪表\n\n快照：' + stamp + '。当前要求=基线+批准生效CR；状态是原卡实施状态，不等于完整版本验收。\n\n' + markdown_table(['编号', '名称', '要求版本', '生效CR', '原卡状态', '当前环节', '验收结论', '原卡'], [[r['id'], r['title'], r['current_version'], '、'.join(r['applied_changes']), r['project_status'], r['current_phase'], r['acceptance_result'], '[原卡](' + r['canonical']['url'] + ')'] for r in requirements]) + '\n')
    with (DOCS / 'requirements-register.md').open('a') as stream:
        stream.write('\n全部UAT准备、测试和确认主责：**' + uat_owner + '**；逐场景责任分工见[UAT清单](uat-register.md)。\n')
    text = '# 已纳入的需求变更\n\n当前登记' + str(len(changes)) + '项CR；逐项记录批准边界、设计/实现/验收阶段。缺陷修复、交付故障、验收缺口和调度政策不计作产品需求变更。\n\n'
    text += markdown_table(['CR', '名称', '批准状态', '影响FR/BR', '实施状态', '验收结论'], [[c['id'], c['title'], c['approval_status'], '、'.join(c['primary_requirements'] + c['related_rules']), c['implementation_status'], c['acceptance_result']] for c in changes])
    for c in changes:
        text += '\n\n## ' + c['id'] + '\n\n' + '\n\n'.join('**' + title + '**：' + c[key] for title, key in [('授权原话', 'request_quote'), ('变更前', 'before'), ('批准增量', 'approved_delta'), ('专项验收', 'acceptance_delta'), ('设计细化与默认值', 'design_detail_status'), ('影响', 'impact'), ('计划影响', 'plan_impact'), ('工作量评估', 'effort'), ('交付限制', 'limitations'), ('主跟踪记录', 'issue_url')])
        text += '\n\n**交付与审查追踪**：Dev ' + (c.get('repair_delivery') or c.get('dev_delivery') or '未派发应用实现')
        text += '；设计/契约审查 ' + (c.get('contract_review_delivery') or '未派发') + '；产品Test ' + (c.get('product_test_delivery') or '未派发')
        text += '。代码SHA：' + (c.get('code_sha') or '无本CR应用交付') + '；设计文档提交：' + (c.get('design_commit') or '见主Issue及受控目录') + '。'
    (DOCS / 'change-register.md').write_text(text + '\n')
    if workbook_path:
        info = [['生成时间', stamp], ['权威来源', 'GitHub受控基线/CR条文及Project唯一原卡；本工作簿仅为导出快照'], ['基线范围', 'FR43+BR18；另附AC32、UAT18、DEC9'], ['批准变更', '1项CR，关联4项FR、2条BR、2项DEC；不是新增6个需求或多个CR'], ['版本规则', 'v0.3原文不覆盖；批准生效CR叠加当前目标要求；不自动创建正式v0.4冻结版'], ['发布与冻结', baseline['control_status']], ['验收规则', '批准≠已实现≠已验收；旧范围通过记录保留；默认值及设计建议不视为用户已批准'], ['维护职责', '用户按权限批准范围；Design业务设计并提出变更；PM维护调度；Dev交付；Test任务级测试；QA主责UAT'], ['暂停规则', '其他未开始backlog仍暂停；本CR为用户明确授权范围']]
        ah = ['AC编号', '名称', '阶段及关联', '原始验收条文', '来源段落']
        ar = [[a['id'], a['title'], a['context'], a['content'], a['source_paragraph']] for a in baseline['acceptance']]
        dh = ['DEC编号', '名称', '原基线建议', '责任与时点', '当前决定/未决边界', '关联CR', '原卡']
        dr = []
        for d in baseline['decisions']:
            related = [c for c in changes if d['id'] in c.get('decisions',[])]
            state = '；'.join(c['approval_status'] for c in related) or '原卡/基线仍待业务决定，本次未代决'
            dr.append([d['id'],d['title'],d['recommendation'],d['owner_due'],state,'、'.join(c['id'] for c in related),d['canonical']['url']])
        info[3] = ['登记变更',str(len(changes))+'项CR；逐项区分授权、设计、实现与验收']
        info.append(['UAT主责', uat_owner + '；准备/测试/确认APS-QA；用户配合；协调维护APS-PM'])
        write_workbook(workbook_path, [('使用说明', ['项目', '说明'], info), ('基线清单61项', bh, br), ('当前需求跟踪61项', rh, rr), ('需求变更清单', ch, cr), ('基线验收条件32项', ah, ar), ('UAT场景与负责人18项', uh, ur), ('业务待决事项9项', dh, dr)])
    print('Exported baseline61/current61/CR' + str(len(changes)) + '/AC32/UAT18/DEC9 at ' + stamp)
    return register, p

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--xlsx')
    parser.add_argument('--pull-controlled', action='store_true', help='Read baseline and CR source JSON from GitHub before refreshing')
    args = parser.parse_args()
    if args.pull_controlled:
        import base64
        for name in ['baselines/APS-BL-001-v0.3.json', 'changes/change-register.json', 'uat-ownership.json']:
            source = api('/repos/' + REPO + '/contents/docs/requirements/' + name + '?ref=main')
            (DOCS / name).parent.mkdir(parents=True, exist_ok=True)
            (DOCS / name).write_bytes(base64.b64decode(source['content']))
    export(args.xlsx)
