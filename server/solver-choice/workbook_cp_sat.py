"""Native workbook obligations. Imported only by the admitted CP-SAT runner.

No basic-engine schedule, objective, invented default budget or fallback.
Quantity, lot flows, resources and minute times are native decisions.
"""
import time
import signal


def solve_workbook(payload, cp_model, ortools):
    data = payload['model']
    started = time.monotonic()
    limit = payload['solveSeconds']
    model = cp_model.CpModel()
    lo, hi = data['window']
    # Source-bounded interval helpers retain all task/tool/cleaning endpoints.
    # A giant unrelated 2**52 domain is not needed for minute intervals.
    max_tail = max([0] + [o['toolTail'] for t in data['tasks'] for o in t['options']])
    max_clean = max([0] + [r['minutes'] for s in data['sequences'] for r in s['transitions']])
    interval_length_bound = hi + max_tail + max_clean
    resources = {r['id']: r for r in data['resources']}
    groups = {g['id']: g for g in data['groups']}
    inputs = {t['id']: t for t in data['tasks']}
    uses = {key: [] for key in resources}
    amounts = {key: [] for key in resources}
    jobs, group_vars, route_vars, lots, feeds = {}, {}, {}, {}, {}
    quotas, flow_rows, clean_rows = {}, [], []

    def var(name, maximum):
        return model.new_int_var(0, maximum, name)

    def conjunction(flags, name):
        result = model.new_bool_var(name)
        model.add_bool_and(flags).only_enforce_if(result)
        model.add_bool_or([f.negated() for f in flags]).only_enforce_if(result.negated())
        return result

    def compare(left, right, name):
        result = model.new_bool_var(name)
        model.add(left <= right).only_enforce_if(result)
        model.add(left > right).only_enforce_if(result.negated())
        return result

    def present(quantity, name):
        result = model.new_bool_var(name)
        model.add(quantity >= 1).only_enforce_if(result)
        model.add(quantity == 0).only_enforce_if(result.negated())
        return result

    def interval(a, b, resource, amount, on, name, calendar=True):
        length = model.new_int_var(0, interval_length_bound, name + ':length')
        model.add(length == b - a).only_enforce_if(on)
        model.add(length == 0).only_enforce_if(on.negated())
        iv = model.new_optional_interval_var(a, length, b, on, name)
        if not isinstance(amount, int) or amount != 0:
            uses[resource].append(iv)
            amounts[resource].append(amount)
        if calendar:
            windows = []
            for index, (left, right) in enumerate(resources[resource]['calendar']):
                inside = model.new_bool_var(name + ':window:' + str(index))
                model.add(a >= left).only_enforce_if(inside)
                model.add(b <= right).only_enforce_if(inside)
                model.add_implication(inside, on)
                windows.append(inside)
            model.add(sum(windows) == on)

    def within(a, b, windows, on, name):
        flags = []
        for index, (left, right) in enumerate(windows):
            flag = model.new_bool_var(name + ':' + str(index))
            model.add(a >= left).only_enforce_if(flag)
            model.add(b <= right).only_enforce_if(flag)
            model.add_implication(flag, on)
            flags.append(flag)
        model.add(sum(flags) == on)

    for gid, group in groups.items():
        q = var(gid + ':quantity', group['maxQuantity'])
        on = present(q, gid + ':present')
        if group['fixedQuantity'] is not None:
            model.add(q == group['fixedQuantity'])
        if group['wip']:
            model.add(q == group['maxQuantity']).only_enforce_if(on)
        group_vars[gid] = {'quantity': q, 'present': on}

    for tid, task in inputs.items():
        group = groups[task['groupId']]
        route = next(r for r in group['routes'] if r['id'] == task['routeId'])
        source = route['source']
        q = var(tid + ':quantity', task['maxQuantity'])
        on = present(q, tid + ':present')
        a, b = var(tid + ':start', hi), var(tid + ':end', hi)
        duration = var(tid + ':duration', hi - lo)
        seed = task.get('seed')
        if seed:
            model.add(q == task['maxQuantity'])
            model.add(a == seed['start'])
            model.add(b == seed['end'])
            model.add(duration == seed['end'] - seed['start'])
        else:
            model.add(a >= task['earliest']).only_enforce_if(on)
            model.add(a >= lo).only_enforce_if(on)
            model.add(b <= hi).only_enforce_if(on)
            model.add(a == lo).only_enforce_if(on.negated())
            model.add(b == lo).only_enforce_if(on.negated())
            scale = data['scales'][group['materialId']]['scale']
            # Compiler records exact duration ratio; no float rounding occurs in
            # Python and only the existing ceil-to-whole-minute rule applies.
            rate = route['durationRatio']
            processed = var(tid + ':processed', hi - lo)
            numerator = var(tid + ':processNumerator', task['maxQuantity'] * rate['n'] + rate['d'] - 1)
            model.add(numerator == q * rate['n'] + rate['d'] - 1)
            model.add_division_equality(processed, numerator, rate['d'])
            raw = var(tid + ':rawDuration', hi - lo + int(source['固定准备分钟']))
            if source['工时模型'] == '固定连续历时':
                model.add(raw == int(source['固定准备分钟']) + int(source['基准加工分钟']))
            else:
                model.add(raw == int(source['固定准备分钟']) + processed)
            model.add_max_equality(duration, [raw, int(source['最短工艺分钟'])])
            model.add(b == a + duration).only_enforce_if(on)
        choices = {}
        for option in task['options']:
            oid = option['id']
            selected = model.new_bool_var(tid + ':' + oid)
            choices[oid] = selected
            model.add(q <= option['capacity']).only_enforce_if(selected)
            machine_amount = q * option['weightMultiplier'] if option['shared'] else 1
            interval(a, b, option['resourceId'], machine_amount, selected, tid + ':' + oid + ':machine', False)
            within(a, b, option['deviceCalendar'], selected, tid + ':' + oid + ':deviceCalendar')
            if not option['crossShift']:
                within(a, b, option['shifts'], selected, tid + ':' + oid + ':nonCrossShift')
            if seed:
                for i, segment in enumerate(seed['laborIntervals']):
                    interval(segment['start'], segment['end'], 'crew:' + option['crewId'], option['people'], selected, tid + ':seedLabor:' + str(i))
                tool_end = seed['toolEndMinute']
            else:
                tool_end = b + option['toolTail']
                if source['人员参与方式'] == '全程参与':
                    interval(a, b, 'crew:' + option['crewId'], option['people'], selected, tid + ':' + oid + ':labor')
                else:
                    head, tail = int(source['开始参与分钟']), int(source['结束参与分钟'])
                    short = conjunction([selected, compare(duration, head + tail, tid + ':shortTest:' + oid)], tid + ':short:' + oid)
                    long = conjunction([selected, compare(head + tail + 1, duration, tid + ':longTest:' + oid)], tid + ':long:' + oid)
                    interval(a, b, 'crew:' + option['crewId'], option['people'], short, tid + ':' + oid + ':shortLabor')
                    if head:
                        interval(a, a + head, 'crew:' + option['crewId'], option['people'], long, tid + ':' + oid + ':headLabor')
                    if tail:
                        interval(b - tail, b, 'crew:' + option['crewId'], option['people'], long, tid + ':' + oid + ':tailLabor')
            for tool in option['tools']:
                interval(a, tool_end, tool, 1, selected, tid + ':' + oid + ':tool:' + tool, False)
            for stop in data['stops']:
                if stop['resource'] == option['resourceId']:
                    before = compare(b, stop['start'], tid + ':' + oid + ':stopBefore:' + stop['id'])
                    after = compare(stop['end'], a, tid + ':' + oid + ':stopAfter:' + stop['id'])
                    model.add_bool_or([before, after]).only_enforce_if(selected)
            day_flags = []
            for day, capacity in option['days']:
                flag = model.new_bool_var(tid + ':' + oid + ':day:' + str(day))
                model.add(a >= day * 1440).only_enforce_if(flag)
                model.add(a < (day + 1) * 1440).only_enforce_if(flag)
                model.add_implication(flag, selected)
                amount = var(tid + ':' + oid + ':dayQty:' + str(day), task['maxQuantity'])
                model.add(amount == q).only_enforce_if(flag)
                model.add(amount == 0).only_enforce_if(flag.negated())
                # One physical daily quantity pool in common exact kg units.
                key = (option['resourceId'], day)
                multiplier = data['weightScale'] // data['scales'][group['materialId']]['scale']
                pool = quotas.setdefault(key, {'capacity': capacity, 'values': [], 'limits': []})
                pool['capacity'] = max(pool['capacity'], capacity)
                pool['values'].append(amount * multiplier)
                pool['limits'].append((flag, capacity))
                day_flags.append(flag)
            model.add(sum(day_flags) == selected)
        model.add(sum(choices.values()) == on)
        jobs[tid] = {'quantity': q, 'present': on, 'start': a, 'end': b, 'duration': duration, 'choices': choices, 'input': task}

    for gid, group in groups.items():
        g = group_vars[gid]
        previous = None
        for route in group['routes']:
            members = [jobs[tid] for tid in route['taskIds']]
            model.add(sum(j['quantity'] for j in members) == g['quantity'])
            fresh = [j for j in members if not j['input'].get('seed')]
            for before, after in zip(fresh, fresh[1:]):
                model.add_implication(after['present'], before['present'])
                model.add(after['start'] >= before['end']).only_enforce_if(after['present'])
            # All jobs in a route precede the next operation, including retained
            # batches; absent optional suffixes do not invent a completion time.
            finish = var(gid + ':' + route['id'] + ':finish', hi)
            model.add_max_equality(finish, [j['end'] for j in members] + [lo])
            start_values, new_values = [], []
            for i, job in enumerate(members):
                value = var(gid + ':' + route['id'] + ':startValue:' + str(i), hi)
                model.add(value == job['start']).only_enforce_if(job['present'])
                model.add(value == hi).only_enforce_if(job['present'].negated())
                start_values.append(value)
                if not job['input'].get('seed'):
                    new_values.append(value)
            first = var(gid + ':' + route['id'] + ':first', hi)
            feed_at = var(gid + ':' + route['id'] + ':feed', hi)
            model.add_min_equality(first, start_values + [hi])
            model.add_min_equality(feed_at, new_values + [hi])
            if previous:
                for job in fresh:
                    model.add(job['start'] >= previous['finish'] + route['minLag']).only_enforce_if(job['present'])
                if route['maxLag'] is not None:
                    has_new = present(sum(j['quantity'] for j in fresh), gid + ':' + route['id'] + ':hasNew')
                    model.add(feed_at <= previous['finish'] + route['maxLag']).only_enforce_if(has_new)
            route_vars[(gid, route['id'])] = {'start': first, 'finish': finish, 'feed': feed_at}
            previous = route_vars[(gid, route['id'])]
        if previous:
            g['finish'] = previous['finish']
        else:
            wip = group['wip']
            if not wip:
                raise ValueError('EMPTY_MANUFACTURING_ROUTE')
            g['finish'] = wip['completeMinute']
        if group['wip']:
            completed = var(gid + ':wipComplete', hi + 2**30)
            model.add_max_equality(completed, [g['finish'], group['wip']['completeMinute']])
            g['finish'] = completed
            release = var(gid + ':release', hi + 2**30)
            model.add_max_equality(release, [g['finish'], group['wip']['releaseMinute']])
            g['ready'] = release
        else:
            g['ready'] = g['finish']

    demand_vars = {}
    for demand in data['demands']:
        did = demand['id']
        q = var(did + ':scheduled', demand['remaining'])
        on = present(q, did + ':scheduledPresent')
        if demand['atomic']:
            model.add(q == demand['remaining']).only_enforce_if(on)
        at = var(did + ':ship', hi)
        model.add(at >= max(lo, demand['earliest'])).only_enforce_if(on)
        model.add(at < hi).only_enforce_if(on)
        model.add(at == lo).only_enforce_if(on.negated())
        model.add_hint(q, demand['remaining'])
        demand_vars[did] = {'quantity': q, 'present': on, 'feed': at}
    if data['demands']:
        # Frozen workbook/urgent preference order controls search branching,
        # not production precedence, a new objective, or business weights.
        model.add_decision_strategy([demand_vars[d['id']]['quantity'] for d in data['demands']], cp_model.CHOOSE_FIRST, cp_model.SELECT_MAX_VALUE)
    remaining_demands = [demand_vars[d['id']]['quantity'] for d in data['demands'] if d['remaining'] > 0]
    if remaining_demands:
        # A partial feasibility model can leave specific requirements unplanned,
        # but an empty assignment must not be returned as successful production.
        model.add(sum(remaining_demands) >= 1)

    for lot in data['lots']:
        if lot.get('producerGroup'):
            group = group_vars[lot['producerGroup']]
            available = group['quantity']
            ready, expiry = group['ready'], group['finish'] + lot['shelfLife']
        else:
            available, ready, expiry = lot['quantity'], lot['ready'], lot['expiry']
        lots[lot['id']] = {'quantity': available, 'ready': ready, 'expiry': expiry, 'claims': [], 'input': lot}

    for index, feed in enumerate(data['feeds']):
        fid = feed['id']
        if feed.get('demandId'):
            f = demand_vars[feed['demandId']]
            q, on, at = f['quantity'], f['present'], f['feed']
        else:
            g = group_vars[feed['groupId']]
            rt = route_vars[(feed['groupId'], feed['routeId'])]
            q = var(fid + ':quantity', feed['maxQuantity'])
            total = var(fid + ':total', feed['maxQuantity'])
            c = feed['coefficient']
            if feed['ceil']:
                numerator = var(fid + ':numerator', groups[feed['groupId']]['maxQuantity'] * c['n'] + c['d'] - 1)
                model.add(numerator == g['quantity'] * c['n'] + c['d'] - 1)
                model.add_division_equality(total, numerator, c['d'])
            else:
                model.add(total * c['d'] == g['quantity'] * c['n'])
            consumed = feed.get('protectedQuantity', 0)
            at = rt['feed']
            applies = conjunction([g['present'], compare(feed['validity'][0], at, fid + ':validFrom'), compare(at + 1, feed['validity'][1], fid + ':validTo')], fid + ':applies')
            if consumed:
                # Protected allocation already fixes this BOM version; it is
                # not reissued and cannot be silently shifted to another row.
                model.add(total >= consumed)
                model.add(q == total - consumed).only_enforce_if(applies)
                model.add(q == 0).only_enforce_if(applies.negated())
            else:
                model.add(q == total).only_enforce_if(applies)
                model.add(q == 0).only_enforce_if(applies.negated())
            on = present(q, fid + ':present')
        split = []
        for lid in feed['eligibleLotIds']:
            lot = lots[lid]
            if not lot['input']['qualityEligible']:
                continue
            amount = var(fid + ':' + lid, feed['maxQuantity'])
            takes = present(amount, fid + ':' + lid + ':takes')
            model.add_implication(takes, on)
            model.add(at >= lot['ready']).only_enforce_if(takes)
            model.add(at < lot['expiry']).only_enforce_if(takes)
            model.add(at + feed.get('minShelfMinutes', 0) <= lot['expiry']).only_enforce_if(takes)
            model.add(amount <= lot['quantity'] - lot['input']['reserved'])
            lot['claims'].append(amount)
            split.append(amount)
            flow_rows.append({'feedId': fid, 'lotId': lid, 'amount': amount, 'takes': takes, 'at': at, 'index': index})
        model.add(sum(split) == q)
        feeds[fid] = {'quantity': q, 'present': on, 'at': at, 'input': feed}

    for lid, lot in lots.items():
        consumed = sum(lot['claims']) + lot['input']['reserved']
        model.add(consumed <= lot['quantity'])
        group_id = lot['input'].get('producerGroup')
        if group_id and not groups[group_id]['wip']:
            # No arbitrary extra manufacture, full-batch fill or unclaimed yield.
            model.add(consumed == lot['quantity'])

    # FEFO at each actual feed minute, including same-minute stable feed order.
    # Later-expiring supply may be taken only when every qualified earlier lot
    # has no balance after earlier/same-priority claims. No optimizer penalty.
    for row in flow_rows:
        feed = feeds[row['feedId']]['input']
        later = lots[row['lotId']]
        for lid in feed['eligibleLotIds']:
            if lid == row['lotId']:
                continue
            earlier = lots[lid]
            if not earlier['input']['qualityEligible']:
                continue
            eligible = [row['takes'], compare(earlier['ready'], row['at'], row['feedId'] + ':' + lid + ':ready'), compare(row['at'] + 1, earlier['expiry'], row['feedId'] + ':' + lid + ':expiry'), compare(row['at'] + feed.get('minShelfMinutes', 0), earlier['expiry'], row['feedId'] + ':' + lid + ':shelf')]
            # Equal expiries retain the original lot-ID tie breaker.
            delta = 0 if lid < row['lotId'] else 1
            eligible.append(compare(earlier['expiry'] + delta, later['expiry'], row['feedId'] + ':' + lid + ':FEFO'))
            available_before = []
            for claim in flow_rows:
                if claim['lotId'] != lid:
                    continue
                tie = 0 if claim['index'] <= row['index'] else 1
                before = compare(claim['at'] + tie, row['at'], row['feedId'] + ':' + lid + ':prior:' + str(claim['index']))
                amount = var(row['feedId'] + ':' + lid + ':priorQty:' + str(claim['index']), feeds[claim['feedId']]['input']['maxQuantity'])
                model.add(amount == claim['amount']).only_enforce_if(before)
                model.add(amount == 0).only_enforce_if(before.negated())
                available_before.append(amount)
            required = conjunction(eligible, row['feedId'] + ':' + lid + ':mustExhaust')
            model.add(sum(available_before) + earlier['input']['reserved'] == earlier['quantity']).only_enforce_if(required)

    for seq in data['sequences']:
        members = seq['members']
        rules = {(r['from'], r['to']): r for r in seq['transitions']}
        for j, after in enumerate(members):
            following = jobs[after['taskId']]
            if following['input'].get('seed'):
                continue
            for i, before in enumerate(members):
                if before['taskId'] == after['taskId']:
                    continue
                prior = jobs[before['taskId']]
                flags = [prior['choices'][before['optionId']], following['choices'][after['optionId']], compare(prior['end'], following['start'], 'clean:' + str(i) + ':' + str(j) + ':' + seq['resourceId'])]
                for k, middle in enumerate(members):
                    if middle['taskId'] in (before['taskId'], after['taskId']):
                        continue
                    candidate = jobs[middle['taskId']]
                    # Latest completed predecessor; deterministic ties use the
                    # source task order, matching the independent reconstruction.
                    tie = 0 if k < i else 1
                    intervenes = conjunction([candidate['choices'][middle['optionId']], compare(prior['end'] + tie, candidate['end'], 'cleanBetweenEnd:' + str(i) + ':' + str(j) + ':' + str(k)), compare(candidate['end'], following['start'], 'cleanBetweenStart:' + str(i) + ':' + str(j) + ':' + str(k))], 'cleanBetween:' + str(i) + ':' + str(j) + ':' + str(k) + ':' + seq['resourceId'])
                    flags.append(intervenes.negated())
                selected = conjunction(flags, 'cleanPrevious:' + str(i) + ':' + str(j) + ':' + seq['resourceId'])
                rule = rules[(before['productId'], after['productId'])]
                a, b = following['start'] - rule['minutes'], following['start']
                model.add(a >= prior['end']).only_enforce_if(selected)
                if rule['minutes']:
                    # Shared-weight cleaning keeps the existing zero-product
                    # occupation semantics. It still has time, crew, calendar,
                    # stoppage and predecessor obligations; no exclusive rewrite.
                    interval(a, b, seq['resourceId'], 0 if seq['shared'] else 1, selected, 'cleanMachine:' + str(i) + ':' + str(j) + ':' + seq['resourceId'], False)
                    option = next(o for o in following['input']['options'] if o['id'] == after['optionId'])
                    within(a, b, option['deviceCalendar'], selected, 'cleanDeviceCalendar:' + str(i) + ':' + str(j))
                    within(a, b, resources['crew:' + after['crewId']]['calendar'], selected, 'cleanCurrentCrewCalendar:' + str(i) + ':' + str(j))
                    within(a, following['end'], option['shifts'], selected, 'cleanNonCrossShift:' + str(i) + ':' + str(j)) if not option['crossShift'] else None
                    # Existing semantics use the previous production crew.
                    crew = 'crew:' + before['crewId']
                    if rule['people']:
                        interval(a, b, crew, rule['people'], selected, 'cleanCrew:' + str(i) + ':' + str(j) + ':' + seq['resourceId'])
                    for stop in data['stops']:
                        if stop['resource'] == seq['resourceId']:
                            model.add_bool_or([compare(b, stop['start'], 'cleanStopBefore:' + str(i) + ':' + str(j)), compare(stop['end'], a, 'cleanStopAfter:' + str(i) + ':' + str(j))]).only_enforce_if(selected)
                clean_rows.append({'selected': selected, 'resourceId': seq['resourceId'], 'before': before['taskId'], 'after': after['taskId'], 'start': a, 'end': b, 'rule': rule, 'crewId': before['crewId']})

    for task in data['tasks']:
        seed = task.get('seed')
        cleaning = seed.get('cleaning') if seed else None
        if cleaning and cleaning['end'] > cleaning['start']:
            on = jobs[task['id']]['present']
            machine = next(o for o in task['options'] if o['resourceId'] == seed['machine'])
            interval(cleaning['start'], cleaning['end'], seed['machine'], 0 if machine['shared'] else 1, on, task['id'] + ':retainedCleanMachine', False)
            if cleaning['people']:
                interval(cleaning['start'], cleaning['end'], 'crew:' + cleaning['crew'], cleaning['people'], on, task['id'] + ':retainedCleanCrew')
    for reservation in data['reservations']:
        iv = model.new_fixed_size_interval_var(reservation['start'], reservation['end'] - reservation['start'], reservation['id'])
        uses[reservation['resourceId']].append(iv)
        amounts[reservation['resourceId']].append(reservation['amount'])
    for rid, intervals in uses.items():
        if intervals:
            model.add_cumulative(intervals, amounts[rid], resources[rid]['capacity'])
    for key, quota in quotas.items():
        retained = sum(w['quantityScaled'] for w in (data['metadata']['frozenUrgent'] or {}).get('wipDaily', []) if (w['resourceId'], w['day']) == key)
        model.add(sum(quota['values']) + retained <= quota['capacity'])
        for flag, capacity in quota['limits']:
            model.add(sum(quota['values']) + retained <= capacity).only_enforce_if(flag)
    primary = {demand_vars[d['id']]['quantity'].index for d in data['demands']}
    rest = [model.get_int_var_from_proto_index(i) for i in range(len(model.proto.variables)) if i not in primary]
    if rest:
        # v9.15 requires the union of fixed-search strategies to instantiate
        # every variable, including quantities/flows/interval helper variables.
        model.add_decision_strategy(rest, cp_model.CHOOSE_FIRST, cp_model.SELECT_MIN_VALUE)
    invalid = model.validate()
    base = {'engine': 'cp-sat', 'version': ortools.__version__, 'modelHash': data['modelHash'], 'objective': data['objective'], 'workers': 1, 'solveSeconds': limit}
    if invalid:
        return {**base, 'rawStatus': 'MODEL_INVALID', 'reason': 'native_model_validation', 'candidate': None, 'wallSeconds': time.monotonic() - started}
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.search_branching = cp_model.FIXED_SEARCH
    remaining = limit - (time.monotonic() - started)
    if remaining <= 0:
        return {**base, 'rawStatus': 'UNKNOWN', 'reason': 'budget_used_building_model', 'candidate': None, 'wallSeconds': time.monotonic() - started}
    solver.parameters.max_time_in_seconds = remaining
    cancelled = False

    def stop(_signum, _frame):
        nonlocal cancelled
        cancelled = True
        solver.stop_search()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    status = solver.solve(model)
    if cancelled:
        return {**base, 'kind': 'cancelled', 'rawStatus': None, 'candidate': None, 'reason': 'user_cancelled', 'wallSeconds': time.monotonic() - started}
    candidate = None
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        value = lambda x: x if isinstance(x, int) else solver.value(x)
        candidate = {'tasks': [], 'groups': [], 'allocations': [], 'cleaning': [], 'demands': [], 'unplanned': []}
        for tid, job in jobs.items():
            if not value(job['present']):
                candidate['unplanned'].append({'taskId': tid, 'reason': 'not_selected_under_declared_partial_policy'})
                continue
            choice = next(oid for oid, flag in job['choices'].items() if value(flag))
            candidate['tasks'].append({'id': tid, 'start': value(job['start']), 'end': value(job['end']), 'quantity': value(job['quantity']), 'alternativeId': choice})
        for gid, group in group_vars.items():
            candidate['groups'].append({'id': gid, 'quantity': value(group['quantity']), 'finish': value(group['finish']), 'ready': value(group['ready'])})
        for did, demand in demand_vars.items():
            candidate['demands'].append({'id': did, 'scheduledQuantity': value(demand['quantity']), 'feedMinute': value(demand['feed'])})
        for row in flow_rows:
            if value(row['amount']):
                candidate['allocations'].append({'feedId': row['feedId'], 'lotId': row['lotId'], 'quantity': value(row['amount']), 'feedMinute': value(row['at'])})
        for row in clean_rows:
            if value(row['selected']):
                candidate['cleaning'].append({'resourceId': row['resourceId'], 'before': row['before'], 'after': row['after'], 'start': value(row['start']), 'end': value(row['end']), 'rule': row['rule']['source'], 'crew': row['crewId'], 'people': row['rule']['people'], 'source': {'sheet': '换型清洗', 'row': row['rule']['row']}})
    return {**base, 'rawStatus': solver.status_name(status), 'candidate': candidate, 'reason': 'search_completed' if status in (cp_model.OPTIMAL, cp_model.INFEASIBLE) else 'search_stopped', 'wallSeconds': time.monotonic() - started}
