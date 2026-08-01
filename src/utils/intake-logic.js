export function getWeekDayBit(dayOfWeek) {
  const bits = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32, 7: 64 }
  return bits[dayOfWeek] || 0
}

export function getWeekDaysBitmask(weekDays) {
  if (!weekDays || weekDays.length === 0) return 127
  let mask = 0
  for (const day of weekDays) {
    mask |= getWeekDayBit(day)
  }
  return mask
}

export function isIntakeOnDay(intake, dayOfWeek) {
  if (!intake.weekDays || intake.weekDays.length === 0) return true
  return intake.weekDays.includes(dayOfWeek)
}

function medIsEnabled(med) {
  return !!med && med.enabled
}

export function getEnabledMedItems(intake, medications) {
  const meds = medications || []
  return (intake.items || []).filter(item => {
    const med = meds.find(m => m.id === item.medicationId)
    return medIsEnabled(med)
  })
}

export function getIntakeEntries(intakes, medications) {
  const meds = medications || []
  return (intakes || [])
    .map(intake => ({
      intake,
      items: (intake.items || [])
        .map(item => ({ med: meds.find(m => m.id === item.medicationId), amount: item.amount }))
        .filter(({ med }) => medIsEnabled(med)),
    }))
    .filter(({ items }) => items.length > 0)
}

export function isIntakeTakenToday(intakeId, date, takeLogs) {
  return (takeLogs || []).some(i => i.intakeId === intakeId && i.date === date && i.status === 'taken')
}

export function isIntakeCancelledToday(intakeId, date, cancellations) {
  return (cancellations || []).some(c => c.intakeId === intakeId && c.date === date)
}

export function getIntakeStatus(intakeId, date, takeLogs, cancellations) {
  if (isIntakeTakenToday(intakeId, date, takeLogs)) return 'taken'
  if (isIntakeCancelledToday(intakeId, date, cancellations)) return 'cancelled'
  return 'pending'
}

export function getTakenTime(intakeId, date, takeLogs) {
  const log = (takeLogs || []).find(i => i.intakeId === intakeId && i.date === date && i.status === 'taken')
  return log ? log.takenTime : null
}

export function buildItemsSummary(items, medications) {
  const meds = medications || []
  const lines = []
  for (const item of items || []) {
    const med = meds.find(m => m.id === item.medicationId)
    if (!medIsEnabled(med)) continue
    lines.push((med.name || '') + (item.amount ? ' \u00d7 ' + item.amount : ''))
  }
  return lines.join(', ')
}
