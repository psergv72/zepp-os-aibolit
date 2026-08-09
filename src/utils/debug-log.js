import { log as Logger } from '@zos/utils'
import { getAllAlarms } from '@zos/alarm'
import { ZML_METHODS } from './constants'
import { getSettings, getDebugLog, setDebugLog, getAlarmRegistry, getMedications, getIntakes } from './storage'
import { getMessaging } from './sync'

const logger = Logger.getLogger('aibolit-debug')

const MAX_DEBUG_LOG_ENTRIES = 100

export function isDebugModeEnabled() {
  const settings = getSettings()
  return !!(settings && settings.debugMode)
}

export function addDebugEntry(message) {
  if (!isDebugModeEnabled()) return
  const log = getDebugLog()
  log.push({ ts: Date.now(), message })
  while (log.length > MAX_DEBUG_LOG_ENTRIES) log.shift()
  setDebugLog(log)
}

export function clearDebugLog() {
  setDebugLog([])
}

export function getCurrentAlarmIds() {
  try {
    const alarms = getAllAlarms()
    return Array.isArray(alarms) ? alarms : []
  } catch (e) {
    logger.log(`getAllAlarms failed: ${e}`)
    return []
  }
}

function weekDaysText(weekDays) {
  if (!weekDays || weekDays.length === 0) return 'каждый день'
  const names = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс' }
  return weekDays.slice().sort((a, b) => a - b).map(d => names[d] || d).join(', ')
}

function describeTimer(id, info) {
  if (!info) return { id, type: 'unknown' }

  if (info.type === 'intake') {
    const intakes = getIntakes()
    const medications = getMedications()
    const intake = intakes.find(i => i.id === info.intakeId)
    const items = intake && intake.items
      ? intake.items.map(item => {
        const med = medications.find(m => m.id === item.medicationId)
        const name = med ? (med.name + (med.dosage ? ' (' + med.dosage + ')' : '')) : '?'
        return name + (item.amount ? ' \u00d7 ' + item.amount : '')
      }).join(', ')
      : ''
    return {
      id,
      type: 'intake',
      intakeId: info.intakeId,
      time: info.time,
      weekDays: info.weekDays || null,
      label: info.label || '',
      next: info.next,
      items: items,
    }
  }

  if (info.type === 'snooze') {
    return { id, type: 'snooze', intakeId: info.intakeId, delayMinutes: info.delayMinutes, next: info.next }
  }

  if (info.type === 'sync') {
    return { id, type: 'sync', interval: info.interval, next: info.next }
  }

  if (info.type === 'retryTick') {
    return { id, type: 'retryTick' }
  }

  return { id, type: info.type || 'unknown' }
}

export function buildTimerList() {
  const registry = getAlarmRegistry()
  return getCurrentAlarmIds().map(id => describeTimer(id, registry[id]))
}

export function buildDebugSnapshot() {
  return {
    timers: buildTimerList(),
    log: getDebugLog(),
  }
}

export function pushDebugSnapshot() {
  const messaging = getMessaging()
  if (!messaging || typeof messaging.request !== 'function') return
  const snapshot = buildDebugSnapshot()
  try {
    messaging.request({
      method: ZML_METHODS.DEBUG_SYNC,
      params: { snapshot },
    })
      .then(() => logger.log('debug snapshot pushed'))
      .catch((error) => logger.log(`debug snapshot push failed: ${error}`))
  } catch (error) {
    logger.log(`debug snapshot push failed: ${error}`)
  }
}
