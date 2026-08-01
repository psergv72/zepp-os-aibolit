import { set as setAlarm, cancel as cancelAlarm, getAllAlarms, REPEAT_WEEK, REPEAT_ONCE } from '@zos/alarm'
import { log as Logger } from '@zos/utils'
import { ALARM_MODES } from './constants'
import { getMedications, getIntakes, getTakeLogs, getTodayDateStr, isIntakeCancelled } from './storage'
import { getWeekDayBit, getWeekDaysBitmask, getEnabledMedItems, isIntakeOnDay } from './intake-logic.js'

const logger = Logger.getLogger('aibolit-schedule')

function getUTCSeconds(hours, minutes) {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0)
  return Math.floor(target.getTime() / 1000)
}

export function createIntakeAlarm(intake) {
  const [hours, minutes] = intake.time.split(':').map(Number)
  const utcTime = getUTCSeconds(hours, minutes)
  const weekDaysMask = getWeekDaysBitmask(intake.weekDays)
  const param = JSON.stringify({
    mode: ALARM_MODES.REMINDER,
    intakeId: intake.id,
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
  logger.log(`Created alarm id=${id} for intake ${intake.id} at ${intake.time}`)
  return id
}

export function createRetryAlarm(intakeId, delayMinutes) {
  const delaySeconds = delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.RETRY,
    intakeId: intakeId,
  })

  const option = {
    url: 'app-service/reminder',
    delay: delaySeconds,
    repeat_type: REPEAT_ONCE,
    param: param,
    store: false,
  }

  const id = setAlarm(option)
  logger.log(`Created retry alarm id=${id} for intake ${intakeId} in ${delayMinutes}min`)
  return id
}

export function createSnoozeAlarm(intakeId, delayMinutes) {
  const delaySeconds = delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.SNOOZE,
    intakeId: intakeId,
  })

  const option = {
    url: 'app-service/reminder',
    delay: delaySeconds,
    repeat_type: REPEAT_ONCE,
    param: param,
    store: false,
  }

  const id = setAlarm(option)
  logger.log(`Created snooze alarm id=${id} for intake ${intakeId} in ${delayMinutes}min`)
  return id
}

export function refreshAlarms() {
  const intakes = getIntakes()
  const todayDateStr = getTodayDateStr()
  const dayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay()

  const allAlarms = getAllAlarms()
  if (allAlarms && allAlarms.length > 0) {
    for (const alarm of allAlarms) {
      cancelAlarm(alarm.id)
    }
  }

  for (const intake of intakes) {
    if (getEnabledMedItems(intake, getMedications()).length === 0) continue

    if (!isIntakeOnDay(intake, dayOfWeek)) continue

    if (isIntakeCancelled(intake.id, todayDateStr)) continue

    const todayLogs = getTakeLogs().filter(i => i.intakeId === intake.id && i.date === todayDateStr)
    const isTaken = todayLogs.some(i => i.status === 'taken')
    if (isTaken) continue

    createIntakeAlarm(intake)
  }

  logger.log('Alarms refreshed')
}

export function cancelAlarmById(alarmId) {
  cancelAlarm(alarmId)
}
