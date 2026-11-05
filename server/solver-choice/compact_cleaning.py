"""Compact directed-cleaning predecessor bookkeeping for the exact adapter.

Bookkeeping sort only; does not impose order between production intervals.
One end/start event per task on this device; original member index breaks ties.
"""


def predecessor_indices(seq, jobs, exact_model, adapter, hi, times):
    native = exact_model.native
    members = seq['members']
    n = len(members)
    if not n:
        return {}
    grouped = {}
    for i, member in enumerate(members):
        grouped.setdefault(member['taskId'], []).append((i, member))
    # Per-task choices are already mutually exclusive in the workbook model.
    # Device membership must contain each task/option pair once.
    assert len({(m['taskId'], m['optionId']) for m in members}) == n
    count = len(grouped)
    stride = n + 1
    key_upper = hi * stride + stride
    padding = key_upper + 1
    # Every direct control row is x-y or x-constant, bounded by 2*padding+1.
    # Quantity expressions do not enter this small-int control representation.
    time_upper = max([hi] + [exact_model.bounds(jobs[t]['start'])[1] for t in grouped] + [exact_model.bounds(jobs[t]['end'])[1] for t in grouped])
    adapter.check64(2 * time_upper * stride + n * (n + 1) + 2 * padding + count + 1)
    serial = 0

    def var(upper, stem):
        nonlocal serial
        serial += 1
        adapter.check64(upper)
        return exact_model.raw(0, upper, 'compact:' + seq['resourceId'] + ':' + stem + ':' + str(serial))

    def mux(flag, yes, no, upper):
        value = var(upper, 'mux')
        native.add(value == yes).only_enforce_if(flag)
        native.add(value == no).only_enforce_if(flag.negated())
        return value

    def compare(left, right):
        flag = exact_model.raw(0, 1, 'compact:compare:' + str(serial), True)
        native.add(left <= right).only_enforce_if(flag)
        native.add(left > right).only_enforce_if(flag.negated())
        return flag

    def nonzero(value):
        flag = exact_model.raw(0, 1, 'compact:nonzero:' + str(serial), True)
        native.add(value >= 1).only_enforce_if(flag)
        native.add(value == 0).only_enforce_if(flag.negated())
        return flag

    def same(left, right):
        flag = exact_model.raw(0, 1, 'compact:same:' + str(serial), True)
        native.add(left == right).only_enforce_if(flag)
        native.add(left != right).only_enforce_if(flag.negated())
        return flag

    events = []
    owners = []
    for code, (tid, entries) in enumerate(grouped.items(), 1):
        job = jobs[tid]
        flags = [(i, exact_model.literal(job['choices'][m['optionId']])) for i, m in entries]
        on = exact_model.raw(0, 1, 'compact:on:' + str(code), True)
        native.add(sum(flag for _, flag in flags) == on)
        member_id = var(n, 'member')
        native.add(member_id == sum((i + 1) * flag for i, flag in flags))
        # ID decreases as tie precedence increases, so n+1-ID increases.
        rank = var(n, 'rank')
        native.add(rank == sum((n - i) * flag for i, flag in flags))
        at_end = times[tid]['end']
        at_start = times[tid]['start']
        key = var(key_upper, 'key')
        native.add(key == at_end * stride + rank)
        end_task = mux(on, code, 0, count)
        events.append([key, member_id, end_task])
        owners.append(tid)
        events.append([at_start * stride + stride, 0, 0])
    length = len(events)
    # This permutation sorts bookkeeping events only. It places no precedence
    # on production and admits simultaneous shared-capacity jobs.
    order = [var(length - 1, 'order') for _ in events]
    positions = [var(length - 1, 'position') for _ in events]
    native.add_inverse(order, positions)
    sorted_events = []
    for position in range(length):
        row = []
        for field, upper in enumerate([padding, n, count]):
            value = var(upper, 'sorted')
            native.add_element(order[position], [event[field] for event in events], value)
            row.append(value)
        sorted_events.append(row)
    for left, right in zip(sorted_events, sorted_events[1:]):
        native.add(left[0] <= right[0])
    last = second = last_task = 0
    histories = []
    task_histories = []
    for _, member_id, task_id in sorted_events:
        is_end = nonzero(member_id)
        second = mux(is_end, last, second, n)
        last = mux(is_end, member_id, last, n)
        last_task = mux(is_end, task_id, last_task, count)
        histories.append((last, second))
        task_histories.append(last_task)
    values = []
    for code in range(count):
        row = []
        for array, upper in [([a for a, b in histories], n), ([b for a, b in histories], n), (task_histories, count)]:
            value = var(upper, 'query')
            native.add_element(positions[2 * code + 1], array, value)
            row.append(value)
        values.append(row)
    result = {}
    for code, tid in enumerate(owners, 1):
        last, second, task = values[code - 1]
        result[tid] = mux(same(task, code), second, last, n)
    return result
