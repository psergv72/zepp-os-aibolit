import { set as setAlarm, cancel as cancelAlarm, getAllAlarms, REPEAT_WEEK, REPEAT_ONCE, REPEAT_MINUTE } from '@zos/alarm'
import { log as Logger } from '@zos/utils'
import { ALARM_MODES, DEFAULT_SETTINGS } from './constants'
import { getMedications, getIntakes, getSettings, getSyncAlarmId, setSyncAlarmId, getSnoozeAlarmId, setSnoozeAlarmId, getPendingNotification, getRetryTickAlarmId, setRetryTickAlarmId, registerAlarm, unregisterAlarm, getAlarmRegistry } from './storage'
import { getWeekDaysBitmask, getEnabledMedItems, isIntakeOnDay } from './intake-logic.js'
import { addDebugEntry, isDebugModeEnabled, pushDebugSnapshot } from './debug-log'

const logger = Logger.getLogger('aibolit-schedule')

const SCHEDULE_VERSION = 2

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
    scheduleVersion: SCHEDULE_VERSION,
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
  registerAlarm(id, { type: 'snooze', intakeId, delayMinutes, next: time, scheduleVersion: SCHEDULE_VERSION })
  return id
}

export function createRetryTickAlarm() {
  const prevId = getRetryTickAlarmId()
  const registry = getAlarmRegistry()
  const prevInfo = prevId !== null ? registry[prevId] : undefined
  const prevValid = prevInfo
    && prevInfo.type === 'retryTick'
    && prevInfo.scheduleVersion === SCHEDULE_VERSION
    && typeof prevInfo.endTime === 'number'
    && prevInfo.endTime > Math.floor(Date.now() / 1000)
    && (getAllAlarms() || []).includes(prevId)
  if (prevValid) {
    logger.log(`Retry tick alarm already exists id=${prevId}, keep it`)
    return prevId
  }

  if (prevId !== null) {
    try {
      cancelAlarm(prevId)
      unregisterAlarm(prevId)
      addDebugEntry(`изменён retry-tick таймер: отменён id=${prevId}`)
    } catch (e) {
      logger.log(`Cancel old retry tick alarm failed: ${e}`)
    }
  }

  const time = Math.floor(Date.now() / 1000) + 120
  const endTime = endOfTodaySeconds()
  const option = {
    url: 'app-service/reminder',
    time: time,
    start_time: time,
    end_time: endTime,
    repeat_type: REPEAT_MINUTE,
    repeat_period: 1,
    repeat_duration: 1,
    param: JSON.stringify({ mode: ALARM_MODES.RETRY_TICK }),
    store: true,
  }

  const id = setAlarm(option)
  if (id && id > 0) setRetryTickAlarmId(id)
  logger.log(`Created retry tick alarm id=${id} window until ${endTime}`)
  addDebugEntry(`добавлен retry-tick таймер id=${id} до конца дня`)
  registerAlarm(id, { type: 'retryTick', scheduleVersion: SCHEDULE_VERSION, endTime })
  return id
}

function endOfTodaySeconds() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
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

  const interval = normalizeSyncInterval(syncInterval)

  const start = Math.floor(Date.now() / 1000) + interval * 60
  const option = {
    url: 'app-service/reminder',
    time: start,
    repeat_type: REPEAT_MINUTE,
    repeat_period: interval,
    repeat_duration: 1,
    param: JSON.stringify({ mode: ALARM_MODES.SYNC }),
    store: true,
  }

  const id = setAlarm(option)
  if (id && id > 0) setSyncAlarmId(id)
  logger.log(`Created sync alarm id=${id} interval=${interval}min start=${start}`)
  addDebugEntry(`добавлен sync-таймер id=${id} период ${interval} мин`)
  registerAlarm(id, { type: 'sync', interval, next: start, scheduleVersion: SCHEDULE_VERSION })
  return id
}

function weekDaysKey(weekDays) {
  return weekDays && weekDays.length ? weekDays.slice().sort((a, b) => a - b).join(',') : ''
}

function normalizeSyncInterval(raw) {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : DEFAULT_SETTINGS.syncInterval
}

function intakeAlarmMatches(info, intake) {
  return !!info
    && info.type === 'intake'
    && info.scheduleVersion === SCHEDULE_VERSION
    && info.intakeId === intake.id
    && info.time === intake.time
    && weekDaysKey(info.weekDays) === weekDaysKey(intake.weekDays)
}

export function refreshAlarms() {
  const intakes = getIntakes()
  const registry = getAlarmRegistry()
  const snapshot = getAllAlarms() || []
  const activeIds = new Set(snapshot)

  const transientIds = []
  const pending = getPendingNotification()
  if (pending && pending.retryAlarmId) transientIds.push(pending.retryAlarmId)
  const snoozeAlarmId = getSnoozeAlarmId()
  if (snoozeAlarmId) transientIds.push(snoozeAlarmId)

  const keepIds = new Set()
  const cancelledIds = new Set()

  for (const intake of intakes) {
    if (getEnabledMedItems(intake, getMedications()).length === 0) continue

    const existingIds = Object.entries(registry)
      .filter(([, info]) => info && info.type === 'intake' && info.intakeId === intake.id)
      .map(([id]) => Number(id))

    const matchId = existingIds.find(id => {
      const info = registry[id]
      return intakeAlarmMatches(info, intake) && activeIds.has(id)
    })

    if (matchId !== undefined) {
      keepIds.add(matchId)
      for (const id of existingIds) {
        if (id === matchId) continue
        cancelAlarm(id)
        unregisterAlarm(id)
        cancelledIds.add(id)
        addDebugEntry(`изменён таймер id=${id} приёма ${intake.id}: пересоздан`)
      }
      continue
    }

    for (const id of existingIds) {
      cancelAlarm(id)
      unregisterAlarm(id)
      cancelledIds.add(id)
      addDebugEntry(`изменён таймер id=${id} приёма ${intake.id}: пересоздан`)
    }
    keepIds.add(createIntakeAlarm(intake))
  }

  const settings = getSettings()
  const interval = normalizeSyncInterval(settings.syncInterval)
  const syncAlarmId = getSyncAlarmId()
  const syncInfo = syncAlarmId !== null ? registry[syncAlarmId] : undefined
  const syncActive = syncAlarmId !== null && activeIds.has(syncAlarmId)
  if (syncAlarmId !== null && syncActive && syncInfo && syncInfo.type === 'sync' && syncInfo.interval === interval && syncInfo.scheduleVersion === SCHEDULE_VERSION) {
    keepIds.add(syncAlarmId)
  } else {
    if (syncAlarmId !== null) cancelledIds.add(syncAlarmId)
    keepIds.add(createSyncAlarm(interval))
  }

  const oldRetryTickAlarmId = getRetryTickAlarmId()
  const retryTickAlarmId = createRetryTickAlarm()
  if (retryTickAlarmId !== null && retryTickAlarmId !== undefined) keepIds.add(retryTickAlarmId)
  if (oldRetryTickAlarmId !== null && oldRetryTickAlarmId !== retryTickAlarmId) cancelledIds.add(oldRetryTickAlarmId)

  for (const alarmId of snapshot) {
    if (keepIds.has(alarmId)) continue
    if (cancelledIds.has(alarmId)) continue
    if (transientIds.includes(alarmId)) continue
    cancelAlarm(alarmId)
    unregisterAlarm(alarmId)
    addDebugEntry(`удалён таймер id=${alarmId} при перестройке расписания`)
  }

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
