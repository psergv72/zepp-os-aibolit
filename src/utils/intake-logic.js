export function getWeekDayBit(dayOfWeek) {
  const bits = { 1: 2, 2: 4, 3: 8, 4: 16, 5: 32, 6: 64, 7: 128 }
  return bits[dayOfWeek] || 0
}

export function getWeekDaysBitmask(weekDays) {
  if (!weekDays || weekDays.length === 0) return 254
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

export function isIntakeSkippedToday(intakeId, date, takeLogs) {
  return (takeLogs || []).some(i => i.intakeId === intakeId && i.date === date && i.status === 'skipped')
}

export function getIntakeStatus(intakeId, date, takeLogs, cancellations) {
  if (isIntakeTakenToday(intakeId, date, takeLogs)) return 'taken'
  if (isIntakeCancelledToday(intakeId, date, cancellations)) return 'cancelled'
  if (isIntakeSkippedToday(intakeId, date, takeLogs)) return 'skipped'
  return 'pending'
}

export function getTakenTime(intakeId, date, takeLogs) {
  const log = (takeLogs || []).find(i => i.intakeId === intakeId && i.date === date && i.status === 'taken')
  return log ? log.takenTime : null
}

function medItemLine(med, amount) {
  const dosage = med.dosage ? ' (' + med.dosage + ')' : ''
  const amountText = amount ? ', ' + amount : ''
  return (med.name || '') + dosage + amountText
}

export function buildItemsSummary(items, medications) {
  const meds = medications || []
  const lines = []
  for (const item of items || []) {
    const med = meds.find(m => m.id === item.medicationId)
    if (!medIsEnabled(med)) continue
    lines.push(medItemLine(med, item.amount))
  }
  return lines.join(', ')
}

export function medItemText(item) {
  const med = (item && item.med) || {}
  return medItemLine(med, item.amount)
}

export function timeToMinutes(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

export function sortIntakeEntriesByTime(entries) {
  return entries.slice().sort((a, b) => timeToMinutes(a.intake.time) - timeToMinutes(b.intake.time))
}
