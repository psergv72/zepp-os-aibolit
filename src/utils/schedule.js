import { set as setAlarm, cancel as cancelAlarm, getAllAlarms, REPEAT_WEEK, REPEAT_ONCE, REPEAT_MINUTE } from '@zos/alarm'
import { log as Logger } from '@zos/utils'
import { ALARM_MODES, DEFAULT_SETTINGS } from './constants'
import { getMedications, getIntakes, getSettings, getSyncAlarmId, setSyncAlarmId, getSnoozeAlarmId, setSnoozeAlarmId, getPendingNotification, getRetryTickAlarmId, setRetryTickAlarmId, registerAlarm, unregisterAlarm } from './storage'
import { getWeekDaysBitmask, getEnabledMedItems, isIntakeOnDay } from './intake-logic.js'
import { addDebugEntry, isDebugModeEnabled, pushDebugSnapshot } from './debug-log'

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
  addDebugEntry(`добавлен таймер id=${id} приёма ${intake.id} на ${intake.time}`)
  registerAlarm(id, {
    type: 'intake',
    intakeId: intake.id,
    time: intake.time,
    weekDays: intake.weekDays || null,
    label: intake.label || '',
    next: nextTime,
  })
  return id
}

export function createSnoozeAlarm(intakeId, delayMinutes, date) {
  const time = Math.floor(Date.now() / 1000) + delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.SNOOZE,
    intakeId: intakeId,
    date: date,
  })

  const option = {
    url: 'app-service/reminder',
    time: time,
    repeat_type: REPEAT_ONCE,
    param: param,
    store: false,
  }

  const id = setAlarm(option)
  if (id && id > 0) setSnoozeAlarmId(id)
  logger.log(`Created snooze alarm id=${id} for intake ${intakeId} in ${delayMinutes}min at ${time}`)
  addDebugEntry(`добавлен snooze-таймер id=${id} приёма ${intakeId} через ${delayMinutes} мин`)
  registerAlarm(id, { type: 'snooze', intakeId, delayMinutes, next: time })
  return id
}

export function createRetryTickAlarm() {
  const prevId = getRetryTickAlarmId()
  if (prevId !== null) {
    logger.log(`Retry tick alarm already exists id=${prevId}, keep it`)
    return prevId
  }

  const option = {
    url: 'app-service/reminder',
    time: Math.floor(Date.now() / 1000) + 120,
    repeat_type: REPEAT_MINUTE,
    repeat_period: 1,
    repeat_duration: 1,
    param: JSON.stringify({ mode: ALARM_MODES.RETRY_TICK }),
    store: true,
  }

  const id = setAlarm(option)
  if (id && id > 0) setRetryTickAlarmId(id)
  logger.log(`Created retry tick alarm id=${id}`)
  addDebugEntry(`добавлен retry-tick таймер id=${id}`)
  registerAlarm(id, { type: 'retryTick' })
  return id
}

export function createSyncAlarm(syncInterval) {
  const prevId = getSyncAlarmId()
  if (prevId !== null) {
    try {
      cancelAlarm(prevId)
      unregisterAlarm(prevId)
      addDebugEntry(`изменён sync-таймер: отменён id=${prevId}`)
    } catch (e) {
      logger.log(`Cancel old sync alarm failed: ${e}`)
    }
  }

  const raw = Number(syncInterval)
  const interval = Number.isFinite(raw) && raw > 0
    ? Math.max(1, Math.round(raw))
    : DEFAULT_SETTINGS.syncInterval

  const start = Math.floor(Date.now() / 1000) + interval * 60
  const option = {
    url: 'app-service/reminder',
    time: start,
    repeat_type: REPEAT_MINUTE,
    repeat_period: Math.max(1, interval - 1),
    repeat_duration: 1,
    param: JSON.stringify({ mode: ALARM_MODES.SYNC }),
    store: true,
  }

  const id = setAlarm(option)
  if (id && id > 0) setSyncAlarmId(id)
  logger.log(`Created sync alarm id=${id} repeat_period=${option.repeat_period}min start=${start}`)
  addDebugEntry(`добавлен sync-таймер id=${id} период ${option.repeat_period} мин`)
  registerAlarm(id, { type: 'sync', interval: option.repeat_period, next: start })
  return id
}

export function refreshAlarms() {
  const intakes = getIntakes()
  const syncAlarmId = getSyncAlarmId()
  const retryTickAlarmId = getRetryTickAlarmId()

  const transientIds = []
  const pending = getPendingNotification()
  if (pending && pending.retryAlarmId) transientIds.push(pending.retryAlarmId)
  const snoozeAlarmId = getSnoozeAlarmId()
  if (snoozeAlarmId) transientIds.push(snoozeAlarmId)

  const allAlarms = getAllAlarms()
  if (allAlarms && allAlarms.length > 0) {
    for (const alarmId of allAlarms) {
      if (alarmId === syncAlarmId) continue
      if (alarmId === retryTickAlarmId) continue
      if (transientIds.includes(alarmId)) continue
      cancelAlarm(alarmId)
      unregisterAlarm(alarmId)
      addDebugEntry(`удалён таймер id=${alarmId} при перестройке расписания`)
    }
  }

  for (const intake of intakes) {
    if (getEnabledMedItems(intake, getMedications()).length === 0) continue

    createIntakeAlarm(intake)
  }

  const settings = getSettings()
  createSyncAlarm(settings.syncInterval)
  createRetryTickAlarm()

  logger.log('Alarms refreshed')
  if (isDebugModeEnabled()) {
    addDebugEntry('расписание таймеров перестроено')
    pushDebugSnapshot()
  }
}

export function cancelAlarmById(alarmId) {
  cancelAlarm(alarmId)
  unregisterAlarm(alarmId)
  addDebugEntry(`удалён таймер id=${alarmId}`)
}
