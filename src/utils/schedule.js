import { set as setAlarm, cancel as cancelAlarm, getAllAlarms, REPEAT_WEEK, REPEAT_ONCE } from '@zos/alarm'
import { log as Logger } from '@zos/utils'
import { ALARM_MODES } from './constants'
import { getMedications, getIntakes } from './storage'
import { getWeekDaysBitmask, getEnabledMedItems, isIntakeOnDay } from './intake-logic.js'

const logger = Logger.getLogger('aibolit-schedule')

function getNextAlarmTime(hours, minutes, weekDays) {
  const now = new Date()
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(now)
    candidate.setDate(now.getDate() + i)
    candidate.setHours(hours, minutes, 0, 0)
    const dayOfWeek = candidate.getDay() === 0 ? 7 : candidate.getDay()
    if (isIntakeOnDay({ weekDays }, dayOfWeek) && candidate > now) {
      return Math.floor(candidate.getTime() / 1000)
    }
  }
  const fallback = new Date(now)
  fallback.setHours(hours, minutes, 0, 0)
  return Math.floor(fallback.getTime() / 1000)
}

export function createIntakeAlarm(intake) {
  const [hours, minutes] = intake.time.split(':').map(Number)
  const nextTime = getNextAlarmTime(hours, minutes, intake.weekDays)
  const weekDaysMask = getWeekDaysBitmask(intake.weekDays)
  const param = JSON.stringify({
    mode: ALARM_MODES.REMINDER,
    intakeId: intake.id,
  })

  const option = {
    url: 'app-service/reminder',
    time: nextTime,
    repeat_type: REPEAT_WEEK,
    week_days: weekDaysMask,
    param: param,
    store: true,
  }

  const id = setAlarm(option)
  logger.log(`Created alarm id=${id} for intake ${intake.id} at ${intake.time} next=${nextTime} week_days=${weekDaysMask} repeat=${REPEAT_WEEK}`)
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

  const allAlarms = getAllAlarms()
  if (allAlarms && allAlarms.length > 0) {
    for (const alarmId of allAlarms) {
      cancelAlarm(alarmId)
    }
  }

  for (const intake of intakes) {
    if (getEnabledMedItems(intake, getMedications()).length === 0) continue

    createIntakeAlarm(intake)
  }

  logger.log('Alarms refreshed')
}

export function cancelAlarmById(alarmId) {
  cancelAlarm(alarmId)
}
