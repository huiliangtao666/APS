"""APS internal minute model. No workbook decoding or business defaults here.

Only the pinned real OR-Tools engine produces solver statuses/assignments.
Process failure and interrupted delivery never manufacture a feasible result.
"""
import json
import signal
import sys
import time


def solve(payload):
    import ortools
    from ortools.sat.python import cp_model

    if ortools.__version__ != "9.15.6755":
        raise RuntimeError("ORTOOLS_VERSION_MISMATCH")
    data = payload["model"]
    if data["contract"] == "aps-cpsat-workbook:v2":
        # -I excludes ambient import paths. Load only this committed sibling,
        # never a request-provided module, cwd package or borrowed interpreter.
        import importlib.util
        from pathlib import Path
        spec = importlib.util.spec_from_file_location("aps_workbook_cp_sat", Path(__file__).with_name("workbook_cp_sat.py"))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.solve_workbook(payload, cp_model, ortools)
    if data["contract"] != "aps-cpsat-minute-model:v1":
        raise ValueError("MODEL_CONTRACT")
    if data["objective"]["kind"] != "feasibility":
        raise ValueError("UNAPPROVED_OBJECTIVE")
    limit = payload["solveSeconds"]
    if not isinstance(limit, (int, float)) or not 0 < limit < float("inf"):
        raise ValueError("SOLVE_BUDGET")
    started = time.monotonic()
    model = cp_model.CpModel()
    lo, hi = data["window"]
    resources = {r["id"]: r for r in data["resources"]}
    uses = {key: [] for key in resources}
    quantities = {key: [] for key in resources}
    jobs = {}
    quotas = {}

    def usage(start, duration, amount, resource, present, name):
        """Resource calendar covers its full interval, including release tails."""
        end = model.new_int_var(-2**52, 2**52, name + ":end")
        model.add(end == start + duration)
        interval = model.new_optional_interval_var(start, duration, end, present, name)
        uses[resource].append(interval)
        quantities[resource].append(amount)
        windows = []
        for index, (a, b) in enumerate(resources[resource]["calendar"]):
            if b - a < duration:
                continue
            inside = model.new_bool_var(name + ":calendar:" + str(index))
            model.add(start >= a).only_enforce_if(inside)
            model.add(end <= b).only_enforce_if(inside)
            model.add_implication(inside, present)
            windows.append(inside)
        model.add(sum(windows) == present)
        return interval

    for task in data["tasks"]:
        tid = task["id"]
        start = model.new_int_var(lo, hi, tid + ":start")
        end = model.new_int_var(lo, hi, tid + ":end")
        present = model.new_bool_var(tid + ":present")
        model.add(end == start + task["duration"]).only_enforce_if(present)
        model.add(end == start).only_enforce_if(present.negated())
        if task["required"]:
            model.add(present == 1)
        # Inclusive domains of allowed starts, not half-hour display buckets.
        if task["starts"]:
            model.add_linear_expression_in_domain(
                start, cp_model.Domain.from_intervals(task["starts"])
            ).only_enforce_if(present)
        else:
            model.add(present == 0)
        choices = {}
        for alt in task["alternatives"]:
            selected = model.new_bool_var(tid + ":" + alt["id"])
            choices[alt["id"]] = selected
            for i, use in enumerate(alt["uses"]):
                usage(start + use["offset"], use["duration"], use["amount"],
                      use["resourceId"], selected, tid + ":use:" + alt["id"] + ":" + str(i))
            quota = alt.get("startQuota")
            if quota:
                flags = []
                for day, capacity in quota["days"]:
                    flag = model.new_bool_var(tid + ":day:" + alt["id"] + ":" + str(day))
                    model.add(start >= day * 1440).only_enforce_if(flag)
                    model.add(start < (day + 1) * 1440).only_enforce_if(flag)
                    model.add_implication(flag, selected)
                    flags.append(flag)
                    key = (quota["resourceId"], day)
                    if key not in quotas:
                        quotas[key] = {"capacity": capacity, "terms": []}
                    if quotas[key]["capacity"] != capacity:
                        raise ValueError("QUOTA_CONFLICT")
                    quotas[key]["terms"].append(flag * quota["amount"])
                model.add(sum(flags) == selected)
        model.add(sum(choices.values()) == present)
        if task.get("fixed"):
            model.add(start == task["fixed"]["start"])
            model.add(choices[task["fixed"]["alternativeId"]] == 1)
        jobs[tid] = {"start": start, "end": end, "present": present,
                     "choices": choices, "input": task}

    if jobs:
        model.add(sum(j["present"] for j in jobs.values()) >= 1)
    for job in jobs.values():
        for pred in job["input"]["predecessors"]:
            before = jobs[pred["taskId"]]
            model.add_implication(job["present"], before["present"])
            model.add(job["start"] >= before["end"] + pred["minLag"]).only_enforce_if(job["present"])
            if pred["maxLag"] is not None:
                model.add(job["start"] <= before["end"] + pred["maxLag"]).only_enforce_if(job["present"])

    transitions_used = []
    for sequence in data["sequences"]:
        members = sequence["members"]
        arcs = []
        any_present = model.new_bool_var(sequence["id"] + ":any")
        flags = [jobs[m["taskId"]]["choices"][m["alternativeId"]] for m in members]
        model.add_max_equality(any_present, flags)
        arcs.append((0, 0, any_present.negated()))
        matrix = {(r["from"], r["to"]): r for r in sequence["transitions"]}
        for i, current in enumerate(members, 1):
            job = jobs[current["taskId"]]
            on = flags[i - 1]
            arcs.append((i, i, on.negated()))
            first = model.new_bool_var(sequence["id"] + ":first:" + str(i))
            last = model.new_bool_var(sequence["id"] + ":last:" + str(i))
            arcs.extend([(0, i, first), (i, 0, last)])
            model.add_implication(first, on)
            model.add_implication(last, on)
            for k, previous in enumerate(members, 1):
                if i == k:
                    continue
                arc = model.new_bool_var(sequence["id"] + ":arc:" + str(k) + ":" + str(i))
                arcs.append((k, i, arc))
                model.add_implication(arc, on)
                model.add_implication(arc, flags[k - 1])
                rule = matrix[(previous["productId"], current["productId"])]
                duration = rule["minutes"]
                model.add(job["start"] >= jobs[previous["taskId"]]["end"] + duration).only_enforce_if(arc)
                if duration:
                    usage(job["start"] - duration, duration, 1,
                          sequence["resourceId"], arc, arc.name + ":machine")
                    if rule["people"]:
                        usage(job["start"] - duration, duration, rule["people"],
                              rule["crewResourceId"], arc, arc.name + ":crew")
                transitions_used.append((arc, sequence, previous, current, rule))
        model.add_circuit(arcs)

    lots = {lot["id"]: lot for lot in data["lots"]}
    claims = {key: [] for key in lots}
    flows = []
    for tid, job in jobs.items():
        for need in job["input"]["materialNeeds"]:
            split = []
            feed = job["start"] + need["feedOffset"]
            for lot_id in need["eligibleLotIds"]:
                lot = lots[lot_id]
                if not lot["qualityEligible"] or lot["materialId"] != need["materialId"]:
                    continue
                amount = model.new_int_var(0, min(need["quantity"], lot["quantity"] - lot["reserved"]),
                                           tid + ":" + need["id"] + ":" + lot_id)
                takes = model.new_bool_var(amount.name + ":takes")
                model.add(amount >= 1).only_enforce_if(takes)
                model.add(amount == 0).only_enforce_if(takes.negated())
                model.add_implication(takes, job["present"])
                model.add(feed >= lot["ready"]).only_enforce_if(takes)
                model.add(feed < lot["expiry"]).only_enforce_if(takes)
                producer = lot.get("producer")
                if producer:
                    source = jobs[producer["taskId"]]
                    model.add_implication(takes, source["present"])
                    model.add(feed >= source["end"] + producer["releaseLag"]).only_enforce_if(takes)
                    model.add(feed < source["end"] + producer["shelfLife"]).only_enforce_if(takes)
                claims[lot_id].append(amount)
                split.append(amount)
                flows.append((tid, need, lot_id, amount))
            model.add(sum(split) == need["quantity"] * job["present"])
    for lot_id, values in claims.items():
        model.add(sum(values) <= lots[lot_id]["quantity"] - lots[lot_id]["reserved"])
    for reservation in data["reservations"]:
        interval = model.new_fixed_size_interval_var(reservation["start"],
                                                     reservation["end"] - reservation["start"],
                                                     reservation["id"])
        uses[reservation["resourceId"]].append(interval)
        quantities[reservation["resourceId"]].append(reservation["amount"])
    for rid, intervals in uses.items():
        if intervals:
            model.add_cumulative(intervals, quantities[rid], resources[rid]["capacity"])
    for quota in quotas.values():
        model.add(sum(quota["terms"]) <= quota["capacity"])
    invalid = model.validate()
    base = {"engine": "cp-sat", "version": ortools.__version__,
            "modelHash": data["modelHash"], "objective": data["objective"],
            "workers": 1, "solveSeconds": limit}
    if invalid:
        return {**base, "rawStatus": "MODEL_INVALID", "reason": "native_model_validation",
                "candidate": None, "wallSeconds": time.monotonic() - started}
    solver = cp_model.CpSolver()
    # One native search worker participates in the existing application slot.
    # No extra app worker, optimization objective or parallelism is introduced.
    solver.parameters.num_search_workers = 1
    remaining = limit - (time.monotonic() - started)
    if remaining <= 0:
        return {**base, "rawStatus": "UNKNOWN", "reason": "budget_used_building_model",
                "candidate": None, "wallSeconds": time.monotonic() - started}
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
        return {**base, "kind": "cancelled", "rawStatus": None, "candidate": None,
                "reason": "user_cancelled", "wallSeconds": time.monotonic() - started}
    raw = solver.status_name(status)
    candidate = None
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        candidate = {"tasks": [], "allocations": [], "cleaning": [], "unplanned": []}
        for tid, job in jobs.items():
            if not solver.value(job["present"]):
                candidate["unplanned"].append({"taskId": tid, "reason": "not_selected_under_declared_partial_policy"})
                continue
            alt = next(key for key, selected in job["choices"].items() if solver.value(selected))
            candidate["tasks"].append({"id": tid, "start": solver.value(job["start"]),
                                       "end": solver.value(job["end"]), "alternativeId": alt})
        for tid, need, lot_id, amount in flows:
            value = solver.value(amount)
            if value:
                candidate["allocations"].append({"taskId": tid, "needId": need["id"],
                                                  "lotId": lot_id, "quantity": value,
                                                  "feedMinute": solver.value(jobs[tid]["start"]) + need["feedOffset"]})
        for arc, sequence, before, after, rule in transitions_used:
            if solver.value(arc):
                end = solver.value(jobs[after["taskId"]]["start"])
                candidate["cleaning"].append({"sequenceId": sequence["id"],
                                              "before": before["taskId"], "after": after["taskId"],
                                              "start": end - rule["minutes"], "end": end,
                                              "source": rule["source"]})
    return {**base, "rawStatus": raw, "candidate": candidate,
            "reason": "search_completed" if status in (cp_model.OPTIMAL, cp_model.INFEASIBLE) else "search_stopped",
            "wallSeconds": time.monotonic() - started}


def main():
    try:
        payload = json.load(sys.stdin)
        result = solve(payload)
        print(json.dumps(result, separators=(",", ":")), flush=True)
    except Exception as exc:
        # Do not return unbounded native errors, dataset contents or stacks.
        print(json.dumps({"kind": "environment_error", "code": type(exc).__name__}), flush=True)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
