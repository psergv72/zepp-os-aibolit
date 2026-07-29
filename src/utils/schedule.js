import { set as setAlarm, cancel as cancelAlarm, getAllAlarms, REPEAT_WEEK, REPEAT_ONCE } from '@zos/alarm'
import { log as Logger } from '@zos/utils'
import { ALARM_MODES } from './constants'
import { getMedications, getSchedule, getSettings, getIntakes, getCancellations, getTodayDateStr, isSlotCancelled } from './storage'

const logger = Logger.getLogger('aibolit-schedule')

function getUTCSeconds(hours, minutes) {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0)
  return Math.floor(target.getTime() / 1000)
}

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

export function createSlotAlarm(slot, medication) {
  const [hours, minutes] = slot.time.split(':').map(Number)
  const utcTime = getUTCSeconds(hours, minutes)
  const weekDaysMask = getWeekDaysBitmask(slot.weekDays)
  const param = JSON.stringify({
    mode: ALARM_MODES.REMINDER,
    slotId: slot.id,
    medicationId: slot.medicationId,
    medicationName: medication.name,
    dosage: medication.dosage,
  })

  const option = {
    url: 'app-service/reminder',
    time: utcTime,
    repeat_type: REPEAT_WEEK,
    week_days: weekDaysMask,
    param: param,
    store: true,
  }

  const id = setAlarm(option)
  logger.log(`Created alarm id=${id} for slot ${slot.id} at ${slot.time}`)
  return id
}

export function createRetryAlarm(slotId, medicationId, medicationName, dosage, delayMinutes) {
  const delaySeconds = delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.RETRY,
    slotId: slotId,
    medicationId: medicationId,
    medicationName: medicationName,
    dosage: dosage,
  })

  const option = {
    url: 'app-service/reminder',
    delay: delaySeconds,
    repeat_type: REPEAT_ONCE,
    param: param,
    store: false,
  }

  const id = setAlarm(option)
  logger.log(`Created retry alarm id=${id} for slot ${slotId} in ${delayMinutes}min`)
  return id
}

export function createSnoozeAlarm(slotId, medicationId, medicationName, dosage, delayMinutes) {
  const delaySeconds = delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.SNOOZE,
    slotId: slotId,
    medicationId: medicationId,
    medicationName: medicationName,
    dosage: dosage,
  })

  const option = {
    url: 'app-service/reminder',
    delay: delaySeconds,
    repeat_type: REPEAT_ONCE,
    param: param,
    store: false,
  }

  const id = setAlarm(option)
  logger.log(`Created snooze alarm id=${id} for slot ${slotId} in ${delayMinutes}min`)
  return id
}

export function refreshAlarms() {
  const medications = getMedications()
  const schedule = getSchedule()
  const todayDateStr = getTodayDateStr()
  const dayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay()

  const allAlarms = getAllAlarms()
  if (allAlarms && allAlarms.length > 0) {
    for (const alarm of allAlarms) {
      cancelAlarm(alarm.id)
    }
  }

  for (const slot of schedule) {
    const medication = medications.find(m => m.id === slot.medicationId)
    if (!medication || !medication.enabled) continue

    if (slot.weekDays && slot.weekDays.length > 0 && !slot.weekDays.includes(dayOfWeek)) continue

    if (isSlotCancelled(slot.id, todayDateStr)) continue

    const todayIntakes = getIntakes().filter(i => i.scheduleId === slot.id && i.date === todayDateStr)
    const isTaken = todayIntakes.some(i => i.status === 'taken')
    if (isTaken) continue

    createSlotAlarm(slot, medication)
  }

  logger.log('Alarms refreshed')
}

export function cancelAlarmById(alarmId) {
  cancelAlarm(alarmId)
}
