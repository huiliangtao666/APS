export function findDowntimeShiftReason(downtime, machineId, earliest, duration, scheduledStart) {
  if (scheduledStart <= earliest) return null;
  return downtime
    .filter(row => row['设备编号'] === machineId)
    .map(row => ({
      start: Number(row['起始分钟']),
      end: Number(row['结束分钟']),
      reason: row['原因'] || '设备停机',
    }))
    .filter(stop => Number.isFinite(stop.start)
      && Number.isFinite(stop.end)
      && stop.end > stop.start
      && stop.start < earliest + duration
      && stop.end > earliest
      && stop.end <= scheduledStart)
    .sort((a, b) => a.start - b.start)[0] || null;
}
