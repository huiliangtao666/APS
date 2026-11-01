"""Explicit, replaceable two-order mock. Never reads or copies a legacy store."""
import copy
import json

PRODUCT = '48e0766d9733eff99f9bc3f0718639aab89fcf0e'
IMAGE = 'sha256:220eed84228ea8d044009e628cf4b1692baf55db6d1636de9870bf2186fedd5b'
CONTAINER = 'aps-test-uat18-execution-48e-r1'
BASE = 'http://127.0.0.1:18301'
TERMINAL = {'completed', 'partial', 'failed', 'timed_out', 'cancelled'}


def make_fixture(seed):
    d = copy.deepcopy(seed)
    # Same bounded normalized execution contract as fixed qa/execution-fixture.mjs.
    # Every changed number below is a named mock choice, never a customer default.
    d['orders'] = [copy.deepcopy(seed['orders'][0]) for _ in range(2)]
    for row, name in zip(d['orders'], ['A', 'B']):
        row.update({'订单编号': name, '合格需求': '100', '已完成合格数量': '0'})
    deps = [r for r in seed['dependencies'] if r['订单编号'] == 'A']
    d['dependencies'] = [{**r, '订单编号': name} for name in ['A', 'B'] for r in deps]
    d['products'][0]['总收率'] = '1'
    d['bom'] = [{'版本编号': 'MOCK-EXEC48-v1', '产品编号': 'HC40', '生效日期': '2026-01-01',
                 '投料工序编号': 'MIX', '用量类型': 'BOM物料', '物料编号': 'LEAN',
                 '配置用量': '1000', '用量单位': 'kg', '用量基准': '每1000kg投入',
                 '收率/损耗口径备注': '', '损坏比例': '0'}]
    d['inventory'] = [{'批次编号': 'MOCK-EXEC48-LOT', '物料编号': 'LEAN', '账面数量': '300',
                       '已占用数量': '10', '有效期': '2026-12-31', '位置': '明确模拟',
                       '质量状态': '合格', '预计可用时间': ''}]
    common = {'工序编号': 'MIX', '数量单位': 'kg', '当前设备': 'MIX01', '暂停原因': '',
              '累计报废数量': '0', '报废补做口径': '待核对', '观测分钟': '30'}
    d['executionFacts'] = [
        {**common, '事实编号': 'MOCK-EXEC48-STARTED', '订单编号': 'A', '状态': '已开始',
         '开始分钟': '30', '完成分钟': '', '工序完成数量': '0', '剩余工时分钟': '20'},
        {**common, '事实编号': 'MOCK-EXEC48-COMPLETED', '订单编号': 'B', '状态': '已完成',
         '开始分钟': '0', '完成分钟': '30', '工序完成数量': '100', '剩余工时分钟': '0'}]
    d['executionMaterials'] = [
        {'记录编号': 'MOCK-EXEC48-CONSUME-' + order, '事实编号': fact['事实编号'],
         '批次编号': 'MOCK-EXEC48-LOT', '物料编号': 'LEAN', '累计已用数量': amount, '单位': 'kg'}
        for order, fact, amount in zip(['A', 'B'], d['executionFacts'], ['40', '100'])]
    d['executionSources'] = [
        {'来源编号': 'MOCK-EXEC48-SOURCE-' + order, '原始任务编号': order + '-MIX',
         '事实编号': fact['事实编号'], '原始汇总耗料': amount, '耗料单位': 'kg',
         '来源说明': 'Issue48批准可替换MOCK；非客户现场事实；固定执行合同',
         '原始分配JSON': json.dumps([{'记录编号': 'MOCK-EXEC48-CONSUME-' + order,
                                     '批次编号': 'MOCK-EXEC48-LOT', '物料编号': 'LEAN',
                                     '数量': amount, '单位': 'kg'}], ensure_ascii=False)}
        for order, fact, amount in zip(['A', 'B'], d['executionFacts'], ['40', '100'])]
    enabled = ['MACHINE', 'PRECEDENCE', 'CALENDAR', 'MATERIAL']
    for row in d['rules']:
        row['是否启用'] = '是' if row['规则编号'] in enabled else '否'
        if row['规则编号'] == 'MATERIAL':
            row['参数JSON'] = json.dumps({'允许预计供给': False, '可用状态': ['合格'],
                                         '预计状态': ['预计可用'], '不可用状态': ['待检', '冻结', '不合格']}, ensure_ascii=False)
    return {'productSha': PRODUCT, 'kind': 'EXPLICIT_REPLACEABLE_MOCK_NOT_CUSTOMER_FACT',
            'source': 'fixed48e normalized seed + qa/execution-fixture.mjs field contract; Issue48 authorization6556235075',
            'mockChoices': 'yield1, explicit100kg orders, LEAN1000kg per1000kg input, no additive/loss-note semantic; all replaceable, not customer defaults',
            'data': d, 'selection': {'orderIds': ['A', 'B'], 'startMinute': 30, 'endMinute': 600,
                                    'priority': '规则设置', 'enabledRuleIds': enabled, 'mode': 'supported'},
            'independentExpected': {'A-MIX': [30, 50], 'B-MIX': [0, 30],
                                    'startedRemainingMinutes': 20, 'completedRemainingMinutes': 0,
                                    'consumedKg': 140, 'remainingPlannedLeanKg': 60,
                                    'reservedKg': 10, 'untouchedKg': 90,
                                    'conservation': '300 = 40 + 100 + 60 + 10 + 90',
                                    'bothProtectedTasksMovable': False,
                                    'moveAndLockHTTP': 409, 'moveAndLockError': 'task_execution_protected',
                                    'trialFactEditHTTP': 409, 'trialFactEditError': 'trial_execution_edit_forbidden'}}


def require_capacity(kib, phase):
    minimum = {'startup': 1024 * 1024, 'browser': 640 * 1024, 'running': 256 * 1024}[phase]
    if kib < minimum:
        raise RuntimeError('capacity below ' + phase + ' threshold')


def require_release(comment):
    text = comment['body']
    if 'dlv_0d4e85b3' not in text or not all(s in text for s in ['RELEASED', '"owned": []', '"pending": 0']):
        raise RuntimeError('current QA17 explicit release absent')


def identity(i):
    return {'Id': i['Id'], 'RestartCount': i['RestartCount'],
            **{k: i['State'][k] for k in ['Pid', 'StartedAt', 'Running', 'Status']}}
