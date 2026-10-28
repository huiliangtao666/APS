const splitSkills = value => String(value || '').split(/[;,，；\s]+/).map(x => x.trim()).filter(Boolean);

/** Checks whether configured groups can cover each personnel requirement interval. */
export function allocatePersonnel(requirements, groups, start, end, reservations = []) {
  const allocations = [];
  for (const requirement of requirements) {
    const count = Number(requirement['需求数量'] || 0);
    if (!Number.isInteger(count) || count < 0) return { ok: false, reason: `人员需求人数“${requirement['需求数量']}”必须是非负整数` };
    if (count === 0) continue;
    const offsetStart = Number(requirement['人员开始偏移'] || 0);
    const offsetEnd = Number(requirement['人员结束偏移'] || 0);
    if (![offsetStart, offsetEnd].every(Number.isFinite) || offsetStart < 0 || offsetEnd < 0 || offsetStart + offsetEnd >= end - start) {
      return { ok: false, reason: `工序 ${requirement['工序编号']} 的人员参与时间偏移无效` };
    }
    const from = start + offsetStart;
    const until = end - offsetEnd;
    const skill = (requirement['所需技能'] || '').trim();
    const shift = (requirement['所需班次'] || '').trim();
    const requiredGroup = (requirement['资源编号'] || '').trim();
    const candidates = groups.filter(group => {
      const groupId = group['人员组编号'];
      const capacity = Number(group['人员数量']);
      const availableFrom = Number(group['可用起始分钟']);
      const availableUntil = Number(group['可用结束分钟']);
      return groupId && (!requiredGroup || groupId === requiredGroup) && Number.isInteger(capacity) && capacity > 0 &&
        (!skill || splitSkills(group['技能']).includes(skill)) &&
        (!shift || group['班次'] === shift) &&
        Number.isFinite(availableFrom) && Number.isFinite(availableUntil) &&
        availableFrom <= from && availableUntil >= until;
    }).sort((a, b) => Number(b['人员数量']) - Number(a['人员数量']));
    let remaining = count;
    for (const group of candidates) {
      const groupId = group['人员组编号'];
      const busy = [...reservations, ...allocations].filter(r => r.groupId === groupId && r.start < until && r.end > from)
        .reduce((sum, r) => sum + r.count, 0);
      const available = Math.max(0, Number(group['人员数量']) - busy);
      const assigned = Math.min(remaining, available);
      if (assigned) {
        allocations.push({ groupId, count: assigned, start: from, end: until });
        remaining -= assigned;
      }
      if (!remaining) break;
    }
    if (remaining) return { ok: false, reason: `工序 ${requirement['工序编号']} 需要 ${count} 人${skill ? `、技能“${skill}”` : ''}${shift ? `、班次“${shift}”` : ''}，参与时段 ${from}–${until} 无足够可用人员` };
  }
  return { ok: true, allocations };
}
